import { GetState, SetState } from "zustand";
import fetch, { Response } from "node-fetch"; // Import Response type
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
): IBulkDownloadQueueState => ({
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
        return { ...item, status: DownloadStatus.PROCESSING };
      }),
    }));
  },

  onBulkQueueItemStart: (index: number, filename: string, total: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }
        return { ...item, filename, total, status: DownloadStatus.DOWNLOADING };
      }),
    }));
  },

  onBulkQueueItemData: (index: number, filename: string, chunk: Buffer, total: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }
        return { ...item, filename, total, progress: (item.progress || 0) + chunk.length };
      }),
    }));
  },

  onBulkQueueItemComplete: (index: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }
        return { ...item, status: DownloadStatus.DOWNLOADED };
      }),
    }));
    set((prev) => ({ completedBulkDownloadItemCount: prev.completedBulkDownloadItemCount + 1 }));
  },

  onBulkQueueItemFail: (index: number) => {
    set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadQueue.map((item, i) => {
        if (index !== i) {
          return item;
        }
        return { ...item, status: DownloadStatus.FAILED };
      }),
    }));
    set((prev) => ({ failedBulkDownloadItemCount: prev.failedBulkDownloadItemCount + 1 }));
  },

  operateBulkDownloadQueue: async () => {
    const store = get();
    const bulkDownloadQueue = store.bulkDownloadQueue;
    const baseMirror = store.mirror; // Get base mirror once

    if (!baseMirror) {
        console.error("Error: Cannot operate bulk download queue without a configured mirror.");
        // Mark all as failed?
        set(prev => ({
            bulkDownloadQueue: prev.bulkDownloadQueue.map(item => ({ ...item, status: DownloadStatus.FAILED })),
            failedBulkDownloadItemCount: prev.bulkDownloadQueue.length,
            isBulkDownloadComplete: true,
            createdMD5ListFileName: "Operation failed: No mirror."
        }));
        return;
    }


    for (let i = 0; i < bulkDownloadQueue.length; i++) {
      const item = bulkDownloadQueue[i];
      const md5SearchUrl = constructMD5SearchUrl(store.searchByMD5Pattern, baseMirror, item.md5);

      store.onBulkQueueItemProcessing(i);

      const searchPageDocument = await attempt(() => getDocument(md5SearchUrl));
      if (!searchPageDocument) {
        store.setWarningMessage(`Couldn't fetch the search page for ${item.md5}`);
        store.onBulkQueueItemFail(i);
        continue;
      }

      // Try parsing as Sci-Tech first, then Fiction if that fails
      let entry: Entry | undefined = parseSciTechEntries(searchPageDocument)?.[0];
      if (!entry) {
          // --- FIX: Pass baseMirror to parseFictionEntries ---
          entry = parseFictionEntries(searchPageDocument, baseMirror, store.setWarningMessage)?.[0];
          // --- END FIX ---
      }

      // Refactored Check
      if (!entry) {
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
              continue;
            }
         }
         store.setWarningMessage(`Couldn't find the entry details for ${item.md5}`);
         store.onBulkQueueItemFail(i);
         continue;
      }

      if (!entry.mirror) {
          store.setWarningMessage(`Entry found for ${item.md5}, but no mirror link was parsed.`);
          store.onBulkQueueItemFail(i);
          continue;
      }
      // End Refactored Check

      const mirrorPageDocument = await attempt(() => getDocument(entry!.mirror));
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
        fetch(downloadUrl, { agent: httpAgent })
      );
       if (!downloadStream || !(downloadStream instanceof Response)) {
         store.setWarningMessage(`Couldn't get a valid download stream for ${item.md5}`);
         store.onBulkQueueItemFail(i);
         continue;
       }
       if (!downloadStream.ok) {
          store.setWarningMessage(`Download request failed for ${item.md5} with status: ${downloadStream.status} ${downloadStream.statusText}`);
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
    } // End for loop

    set({ isBulkDownloadComplete: true });

    const completedMD5List = get()
      .bulkDownloadQueue.filter((item) => item.status === DownloadStatus.DOWNLOADED)
      .map((item) => item.md5);

    if (completedMD5List.length > 0) {
        try {
          const filename = await createMD5ListFile(completedMD5List);
          set({ createdMD5ListFileName: filename });
        } catch (err) {
          get().setWarningMessage("Couldn't create the completed MD5 list file");
        }
    } else {
        set({ createdMD5ListFileName: "No files successfully downloaded." });
    }
  },

  startBulkDownload: async () => {
    const store = get();
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

     set((prev) => ({
      bulkDownloadQueue: prev.bulkDownloadSelectedEntries.map((entry, index) => ({
        md5: entry.id, // Assuming ID is MD5
        status: DownloadStatus.IN_QUEUE,
        filename: "",
        progress: 0,
        total: 0,
      })),
    }));

    await store.operateBulkDownloadQueue();
  },

  startBulkDownloadInCLI: async (md5List: string[]) => {
    const store = get();

    set({
      bulkDownloadQueue: md5List.map((md5) => ({
        md5,
        status: DownloadStatus.IN_QUEUE,
        filename: "",
        progress: 0,
        total: 0,
      })),
      completedBulkDownloadItemCount: 0,
      failedBulkDownloadItemCount: 0,
      createdMD5ListFileName: "",
      isBulkDownloadComplete: false,
    });

    await store.operateBulkDownloadQueue();

    if (store.CLIMode) {
        store.handleExit();
    }
  },

  resetBulkDownloadQueue: () => {
    set({ ...initialBulkDownloadQueueState });
  },
});
