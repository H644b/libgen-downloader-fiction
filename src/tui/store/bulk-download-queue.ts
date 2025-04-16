import { GetState, SetState } from "zustand";
import fetch from "node-fetch";
import { TCombinedStore } from "./index";
import { Entry } from "../../api/models/Entry";
import { DownloadStatus } from "../../download-statuses";
import {
  constructFindMD5SearchUrl,
  constructMD5SearchUrl,
  // Import the correct parser, likely SciTech for MD5 lookups
  parseSciTechEntries,
  parseFictionEntries, // Keep fiction parser available just in case MD5 lookup lands on fiction page
} from "../../api/data/search";
import { attempt } from "../../utils";
import { LAYOUT_KEY } from "../layouts/keys";
import { IDownloadProgress } from "./download-queue";
import { getDocument } from "../../api/data/document";
import { findDownloadUrlFromMirror } from "../../api/data/url";
import { downloadFile } from "../../api/data/download";
import { createMD5ListFile } from "../../api/data/file";
import { httpAgent } from "../../settings";

export interface IBulkDownloadQueueItem extends IDownloadProgress {
  md5: string;
}

export interface IBulkDownloadQueueState {
  isBulkDownloadComplete: boolean;

  completedBulkDownloadItemCount: number;
  failedBulkDownloadItemCount: number;

  createdMD5ListFileName: string;

  bulkDownloadSelectedEntryIds: string[];
  bulkDownloadSelectedEntries: Entry[];
  bulkDownloadQueue: IBulkDownloadQueueItem[];

  addToBulkDownloadQueue: (entry: Entry) => void;
  removeFromBulkDownloadQueue: (entryId: string) => void;
  removeEntryIdFromBulkDownloadQueue: (entryId: string) => void;
  onBulkQueueItemProcessing: (index: number) => void;
  onBulkQueueItemStart: (index: number, filename: string, total: number) => void;
  onBulkQueueItemData: (index: number, filename: string, chunk: Buffer, total: number) => void;
  onBulkQueueItemComplete: (index: number) => void;
  onBulkQueueItemFail: (index: number) => void;
  operateBulkDownloadQueue: () => Promise<void>;
  startBulkDownload: () => Promise<void>;
  startBulkDownloadInCLI: (md5List: string[]) => Promise<void>;
  resetBulkDownloadQueue: () => void;
}

export const initialBulkDownloadQueueState = {
  isBulkDownloadComplete: false,

  completedBulkDownloadItemCount: 0,
  failedBulkDownloadItemCount: 0,

  createdMD5ListFileName: "",

  bulkDownloadSelectedEntryIds: [],
  bulkDownloadSelectedEntries: [],
  bulkDownloadQueue: [],
};

export const createBulkDownloadQueueStateSlice = (
  set: SetState<TCombinedStore>,
  get: GetState<TCombinedStore>
): IBulkDownloadQueueState => ({ // Added return type annotation
  ...initialBulkDownloadQueueState,

  addToBulkDownloadQueue: (entry: Entry) => {
    const store = get();

    if (store.bulkDownloadSelectedEntryIds.includes(entry.id)) {
      return;
    }

    set({
      bulkDownloadSelectedEntries: [...store.bulkDownloadSelectedEntries, entry],
      bulkDownloadSelectedEntryIds: [...store.bulkDownloadSelectedEntryIds, entry.id],
    });
  },

  removeFromBulkDownloadQueue: (entryId: string) => {
    const store = get();

    if (!store.bulkDownloadSelectedEntryIds.includes(entryId)) {
      return;
    }

    set({
      bulkDownloadSelectedEntries: store.bulkDownloadSelectedEntries.filter(
        (entry) => entry.id !== entryId
      ),
    });

    store.removeEntryIdFromBulkDownloadQueue(entryId);
  },

  removeEntryIdFromBulkDownloadQueue: (entryId: string) => {
    const store = get();
    set({
      bulkDownloadSelectedEntryIds: store.bulkDownloadSelectedEntryIds.filter(
        (id) => id !== entryId
      ),
    });
  },

  onBulkQueueItemProcessing: (index: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }

        return {
          ...item,
          status: DownloadStatus.PROCESSING,
        };
      }),
    }));
  },

  onBulkQueueItemStart: (index: number, filename: string, total: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }

        return {
          ...item,
          filename,
          total,
          status: DownloadStatus.DOWNLOADING,
        };
      }),
    }));
  },

  onBulkQueueItemData: (index: number, filename: string, chunk: Buffer, total: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }

        return {
          ...item,
          filename,
          total,
          progress: (item.progress || 0) + chunk.length,
        };
      }),
    }));
  },

  onBulkQueueItemComplete: (index: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }

        return {
          ...item,
          status: DownloadStatus.DOWNLOADED,
        };
      }),
    }));

    set((prev) => ({
      completedBulkDownloadItemCount: prev.completedBulkDownloadItemCount + 1,
    }));
  },

  onBulkQueueItemFail: (index: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }

        return {
          ...item,
          status: DownloadStatus.FAILED,
        };
      }),
    }));

    set((prev) => ({
      failedBulkDownloadItemCount: prev.failedBulkDownloadItemCount + 1,
    }));
  },

  operateBulkDownloadQueue: async () => {
    const store = get(); // Get store once
    const bulkDownloadQueue = store.bulkDownloadQueue;

    for (let i = 0; i < bulkDownloadQueue.length; i++) {
      const item = bulkDownloadQueue[i];
      const md5SearchUrl = constructMD5SearchUrl(store.searchByMD5Pattern, store.mirror, item.md5);

      store.onBulkQueueItemProcessing(i);

      const searchPageDocument = await attempt(() => getDocument(md5SearchUrl));
      if (!searchPageDocument) {
        store.setWarningMessage(`Couldn't fetch the search page for ${item.md5}`);
        store.onBulkQueueItemFail(i);
        continue;
      }

      // Try parsing as Sci-Tech first, then Fiction if that fails
      let entry = parseSciTechEntries(searchPageDocument)?.[0];
      if (!entry) {
          entry = parseFictionEntries(searchPageDocument)?.[0];
      }


      if (!entry || !entry.mirror) {
         // Try getting download link directly from the current page (MD5 search might redirect)
         const directDownloadUrl = findDownloadUrlFromMirror(searchPageDocument);
         if (directDownloadUrl) {
            const downloadStream = await attempt(() =>
              fetch(directDownloadUrl, { agent: httpAgent })
            );
            if (downloadStream) {
              try {
                 await downloadFile({
                    downloadStream,
                    onStart: (filename, total) => store.onBulkQueueItemStart(i, filename, total),
                    onData: (filename, chunk, total) => store.onBulkQueueItemData(i, filename, chunk, total),
                 });
                 store.onBulkQueueItemComplete(i);
              } catch (err) {
                 store.setWarningMessage(`Download failed for MD5 ${item.md5} (direct attempt)`);
                 store.onBulkQueueItemFail(i);
              }
              continue; // Move to next item
            }
         }
         // If direct attempt also fails or no entry/mirror found initially
         store.setWarningMessage(`Couldn't find the entry or mirror link for ${item.md5}`);
         store.onBulkQueueItemFail(i);
         continue;
      }


      // Proceed with mirror page if entry was found
      const mirrorPageDocument = await attempt(() => getDocument(entry.mirror));
      if (!mirrorPageDocument) {
        store.setWarningMessage(`Couldn't fetch the mirror page for ${item.md5}`);
        store.onBulkQueueItemFail(i);
        continue;
      }

      const downloadUrl = findDownloadUrlFromMirror(mirrorPageDocument);
      if (!downloadUrl) {
        store.setWarningMessage(`Couldn't find the download url for ${item.md5}`);
        store.onBulkQueueItemFail(i);
        continue;
      }

      const downloadStream = await attempt(() =>
        fetch(downloadUrl, {
          agent: httpAgent,
        })
      );
      if (!downloadStream) {
        store.setWarningMessage(`Couldn't fetch the download stream for ${item.md5}`);
        store.onBulkQueueItemFail(i);
        continue;
      }

      try {
        await downloadFile({
          downloadStream,
          onStart: (filename, total) => {
            store.onBulkQueueItemStart(i, filename, total);
          },
          onData: (filename, chunk, total) => {
            store.onBulkQueueItemData(i, filename, chunk, total);
          },
        });

        store.onBulkQueueItemComplete(i);
      } catch (err) {
         store.setWarningMessage(`Download failed for MD5 ${item.md5}: ${err instanceof Error ? err.message : String(err)}`);
        store.onBulkQueueItemFail(i);
      }
    }

    set({
      isBulkDownloadComplete: true,
    });

    // Only create file if there were successful downloads
    const completedMD5List = get()
      .bulkDownloadQueue.filter((item) => item.status === DownloadStatus.DOWNLOADED)
      .map((item) => item.md5);

    if (completedMD5List.length > 0) {
        try {
          const filename = await createMD5ListFile(completedMD5List);
          set({
            createdMD5ListFileName: filename,
          });
        } catch (err) {
          get().setWarningMessage("Couldn't create the completed MD5 list file");
        }
    } else {
        set({ createdMD5ListFileName: "No files successfully downloaded." });
    }
  },

  startBulkDownload: async () => {
    const store = get(); // Use store consistently
    if (store.bulkDownloadSelectedEntries.length === 0) {
      store.setWarningMessage("Bulk download queue is empty");
      return;
    }

    set({
      completedBulkDownloadItemCount: 0,
      failedBulkDownloadItemCount: 0,
      createdMD5ListFileName: "",
      isBulkDownloadComplete: false,
    });
    store.setActiveLayout(LAYOUT_KEY.BULK_DOWNLOAD_LAYOUT);

    // Initialize bulk queue with status FETCHING_MD5
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadSelectedEntries.map((entry) => ({ // Use selected entry ID
        md5: entry.id, // Assuming entry.id IS the MD5 for Sci-Tech entries
        status: DownloadStatus.FETCHING_MD5, // Initial status
        filename: "",
        progress: 0,
        total: 0,
      })),
    }));


    // If we have Sci-Tech entries, their ID is often the MD5.
    // If we mix Fiction (where ID might not be MD5), this needs adjustment.
    // Assuming for now `bulkDownloadSelectedEntries` only contains items where ID=MD5.
    // If not, we'd need to fetch MD5s similar to the old implementation:

    /*
    // --- Code to fetch MD5s if entry.id is not guaranteed to be MD5 ---
    const entryIds = store.bulkDownloadSelectedEntryIds;
    const findMD5SearchUrl = constructFindMD5SearchUrl(store.MD5ReqPattern, store.mirror, entryIds);

    const md5ListResponse = await attempt(() => fetch(findMD5SearchUrl));
    if (!md5ListResponse) {
      store.setWarningMessage("Couldn't fetch the MD5 list for bulk download");
      // Mark all items as failed?
      set(prev => ({
          bulkDownloadQueue: prev.bulkDownloadQueue.map(item => ({...item, status: DownloadStatus.FAILED })),
          failedBulkDownloadItemCount: prev.bulkDownloadQueue.length,
          isBulkDownloadComplete: true,
          createdMD5ListFileName: "Failed to fetch MD5s.",
      }));
      return;
    }

    try {
        const md5Arr = (await md5ListResponse.json()) as { id: string, md5: string }[]; // Assuming JSON response includes ID
        const md5Map = new Map(md5Arr.map(item => [item.id, item.md5]));

        set((prev) => ({
          bulkDownloadQueue: prev.bulkDownloadQueue.map((item, index) => {
              const originalEntry = prev.bulkDownloadSelectedEntries[index];
              const md5 = md5Map.get(originalEntry.id);
              if (!md5) {
                  store.setWarningMessage(`Could not find MD5 for entry ID ${originalEntry.id}`);
                  store.onBulkQueueItemFail(index); // Use index to mark fail
                  return {...item, status: DownloadStatus.FAILED }; // Mark as failed
              }
              return {
                ...item,
                status: DownloadStatus.IN_QUEUE,
                md5: md5, // Assign fetched MD5
              };
          }),
        }));
    } catch (e) {
        store.setWarningMessage(`Failed to parse MD5 list response: ${e instanceof Error ? e.message : String(e)}`);
        set(prev => ({
            bulkDownloadQueue: prev.bulkDownloadQueue.map(item => ({...item, status: DownloadStatus.FAILED })),
            failedBulkDownloadItemCount: prev.bulkDownloadQueue.length,
            isBulkDownloadComplete: true,
            createdMD5ListFileName: "Failed to parse MD5 list.",
        }));
        return;
    }
    // --- End code to fetch MD5s ---
    */

    // Directly assign MD5 from entry ID and set status to IN_QUEUE (simpler if ID=MD5 assumption holds)
     set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, index) => ({
        ...item,
        md5: prev.bulkDownloadSelectedEntries[index].id, // Assuming ID is MD5
        status: DownloadStatus.IN_QUEUE,
      })),
    }));


    await store.operateBulkDownloadQueue(); // Await the operation
  },

  startBulkDownloadInCLI: async (md5List: string[]) => {
    const store = get(); // Get store instance

    set({
      // Initialize queue directly from MD5 list
      bulkDownloadQueue: md5List.map((md5) => ({
        md5,
        status: DownloadStatus.IN_QUEUE,
        filename: "",
        progress: 0,
        total: 0,
      })),
      // Reset counters and flags for this run
      completedBulkDownloadItemCount: 0,
      failedBulkDownloadItemCount: 0,
      createdMD5ListFileName: "",
      isBulkDownloadComplete: false,
    });

    await store.operateBulkDownloadQueue(); // Await the download process

    // Exit process only if in CLI mode after completion
    if (store.CLIMode) {
        store.handleExit(); // Use the store's exit handler
    }
  },

  resetBulkDownloadQueue: () => {
    set({
      ...initialBulkDownloadQueueState, // Reset all bulk download related state
    });
  },
});
