import { GetState, SetState } from "zustand";
import fetch, { Response } from "node-fetch";
import { TCombinedStore } from "./index";
import { Entry } from "../../api/models/Entry";
import { DownloadStatus } from "../../download-statuses";
import { attempt } from "../../utils";
import { getDocument } from "../../api/data/document";
// Import both URL parsing functions
import { findDownloadUrlFromMirror, parseDownloadUrls, parseFictionDetailPageForDownloadPageLink } from "../../api/data/url";
import { downloadFile } from "../../api/data/download";
import { httpAgent } from "../../settings";

export interface IDownloadProgress {
  filename: string;
  total: number;
  progress: number | null;
  status: DownloadStatus;
}

export interface IDownloadQueueState {
  downloadQueue: Entry[];
  inDownloadQueueEntryIds: string[];
  downloadProgressMap: Record<string, IDownloadProgress>;
  totalAddedToDownloadQueue: number;
  totalDownloaded: number;
  totalFailed: number;
  isQueueActive: boolean;

  pushDownloadQueue: (entry: Entry) => void;
  consumeDownloadQueue: () => Entry | undefined;
  removeEntryIdFromDownloadQueue: (entryId: string) => void;
  iterateQueue: () => Promise<void>;
  updateCurrentDownloadProgress: (
    entryId: string,
    downloadProgress: Partial<IDownloadProgress>
  ) => void;
  increaseTotalAddedToDownloadQueue: () => void;
  increaseTotalDownloaded: () => void;
  increaseTotalFailed: () => void;
}

export const initialDownloadQueueState = {
  downloadQueue: [],
  inDownloadQueueEntryIds: [],
  downloadProgressMap: {},
  totalAddedToDownloadQueue: 0,
  totalDownloaded: 0,
  totalFailed: 0,
  isQueueActive: false,
};

export const createDownloadQueueStateSlice = (
  set: SetState<TCombinedStore>,
  get: GetState<TCombinedStore>
): IDownloadQueueState => ({
  ...initialDownloadQueueState,

  pushDownloadQueue: (entry: Entry) => {
    const store = get();
    if (store.inDownloadQueueEntryIds.includes(entry.id)) {
       store.setWarningMessage(`"${entry.title}" is already downloading or in the queue.`);
      return;
    }
    set({
      downloadQueue: [...store.downloadQueue, entry],
      inDownloadQueueEntryIds: [...store.inDownloadQueueEntryIds, entry.id],
    });
    store.updateCurrentDownloadProgress(entry.id, {
      filename: "", progress: 0, total: 0, status: DownloadStatus.IN_QUEUE,
    });
    store.increaseTotalAddedToDownloadQueue();
    if (!store.isQueueActive) {
      store.iterateQueue();
    }
  },

  consumeDownloadQueue: () => {
    const store = get();
    if (store.downloadQueue.length < 1) {
      return undefined;
    }
    const entry = store.downloadQueue[0];
    set({ downloadQueue: store.downloadQueue.slice(1) });
    return entry;
  },

  removeEntryIdFromDownloadQueue: (entryId: string) => {
    const store = get();
    set({
      inDownloadQueueEntryIds: store.inDownloadQueueEntryIds.filter((id) => id !== entryId),
    });
  },

  iterateQueue: async () => {
    const store = get();
    if (store.isQueueActive) return;
    set({ isQueueActive: true });

    while (store.downloadQueue.length > 0) {
      const entry = store.consumeDownloadQueue();
      if (!entry) break;

      store.updateCurrentDownloadProgress(entry.id, { status: DownloadStatus.CONNECTING_TO_LIBGEN });

      let finalDownloadLink: string | null | undefined = ""; // The URL for the actual file

      try {
        // Use alternative URL if provided directly
        if (entry.alternativeDirectDownloadUrl) {
            finalDownloadLink = entry.alternativeDirectDownloadUrl;
        } else {
            // --- Two-step process to get the final download page URL ---
            let downloadPageUrl = entry.mirror; // Start with the entry's mirror link

            if (!downloadPageUrl || !downloadPageUrl.startsWith('http')) {
                throw new Error(`Invalid initial mirror link for "${entry.title}": ${downloadPageUrl}`);
            }

            // If it's a fiction entry (check based on URL or maybe add type to Entry?), fetch detail page first
            // Heuristic: Fiction detail pages usually contain '/fiction/'
            const isFictionLink = downloadPageUrl.includes('/fiction/'); // Simple check

            if (isFictionLink) {
                const detailPageDocument = await attempt(() => getDocument(downloadPageUrl));
                if (!detailPageDocument) {
                    throw new Error(`Couldn't fetch fiction detail page for "${entry.title}" from ${downloadPageUrl}`);
                }
                const actualDownloadPageLink = parseFictionDetailPageForDownloadPageLink(detailPageDocument, store.setWarningMessage);
                if (!actualDownloadPageLink) {
                    throw new Error(`Could not find download page link on detail page for "${entry.title}"`);
                }
                downloadPageUrl = actualDownloadPageLink; // Update URL to the actual download page (e.g., books.ms)
            }
            // --- End Fiction Step ---

            // Now fetch the FINAL download page (e.g., books.ms page or Sci-Tech mirror page)
            const finalDownloadPageDocument = await attempt(() => getDocument(downloadPageUrl));
            if (!finalDownloadPageDocument) {
                 throw new Error(`Couldn't fetch the final download page for "${entry.title}" from ${downloadPageUrl}`);
            }

            // Parse this page to find the 'GET' link
            // Use findDownloadUrlFromMirror as it targets the main 'GET' button link
            finalDownloadLink = findDownloadUrlFromMirror(finalDownloadPageDocument, store.setWarningMessage);

            if (!finalDownloadLink) {
                // Maybe try parsing for *any* link if GET fails?
                const alternativeLinks = parseDownloadUrls(finalDownloadPageDocument);
                if (alternativeLinks && alternativeLinks.length > 0) {
                    finalDownloadLink = alternativeLinks[0]; // Fallback to the first available link
                    store.setWarningMessage(`Using alternative link for "${entry.title}" as primary GET link was not found.`);
                } else {
                     throw new Error(`Couldn't find any download link on the final page for "${entry.title}"`);
                }
            }
        } // End else block for non-alternative URL

        // Now we should have the finalDownloadLink
        if (!finalDownloadLink) {
             throw new Error(`Failed to resolve a final download link for "${entry.title}"`);
        }


        // --- Proceed with download using finalDownloadLink ---
        const downloadStream = await attempt(() =>
          fetch(finalDownloadLink as string, { agent: httpAgent })
        );

        if (!downloadStream || !(downloadStream instanceof Response)) {
           throw new Error(`Couldn't get a valid download stream for "${entry.title}"`);
        }
        if (!downloadStream.ok) {
            throw new Error(`Download request failed for "${entry.title}" with status: ${downloadStream.status} ${downloadStream.statusText}`);
        }

        store.updateCurrentDownloadProgress(entry.id, {
          status: DownloadStatus.DOWNLOADING,
          progress: 0,
          total: Number(downloadStream.headers.get("content-length") || 0)
        });

        await downloadFile({
          downloadStream,
          onStart: (filename, total) => {
            store.updateCurrentDownloadProgress(entry.id, { filename, total });
          },
          onData: (filename, chunk, total) => {
            store.updateCurrentDownloadProgress(entry.id, { progress: chunk.length });
          },
        });

        store.increaseTotalDownloaded();
        store.updateCurrentDownloadProgress(entry.id, { status: DownloadStatus.DOWNLOADED });

      } catch (error: any) {
          store.setWarningMessage(error.message || `Couldn't download "${entry.title}"`);
          store.increaseTotalFailed();
          store.updateCurrentDownloadProgress(entry.id, { status: DownloadStatus.FAILED });
      } finally {
          store.removeEntryIdFromDownloadQueue(entry.id);
      }
    } // End while loop

    set({ isQueueActive: false });
  },

  updateCurrentDownloadProgress: (
    entryId: string,
    downloadProgressUpdate: Partial<IDownloadProgress>
  ) => {
    set((prev) => {
      const existingProgress = prev.downloadProgressMap[entryId] || { status: DownloadStatus.IDLE, progress: 0, total: 0, filename: '' };
      const newProgressValue = downloadProgressUpdate.progress === null
        ? 0
        : (existingProgress.progress || 0) + (downloadProgressUpdate.progress || 0);

      return {
        downloadProgressMap: {
          ...prev.downloadProgressMap,
          [entryId]: {
            ...existingProgress,
            ...downloadProgressUpdate,
            progress: newProgressValue,
          },
        },
      };
    });
  },


  increaseTotalAddedToDownloadQueue: () => {
    set((prev) => ({ totalAddedToDownloadQueue: prev.totalAddedToDownloadQueue + 1 }));
  },

  increaseTotalDownloaded: () => {
    set((prev) => ({ totalDownloaded: prev.totalDownloaded + 1 }));
  },

  increaseTotalFailed: () => {
    set((prev) => ({ totalFailed: prev.totalFailed + 1 }));
  },
});
