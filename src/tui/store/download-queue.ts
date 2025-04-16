import { GetState, SetState } from "zustand";
import fetch, { Response } from "node-fetch"; // Import Response type
import { TCombinedStore } from "./index";
import { Entry } from "../../api/models/Entry";
import { DownloadStatus } from "../../download-statuses";
import { attempt } from "../../utils";
import { getDocument } from "../../api/data/document";
import { findDownloadUrlFromMirror } from "../../api/data/url";
import { downloadFile } from "../../api/data/download";
import { httpAgent } from "../../settings";

export interface IDownloadProgress {
  filename: string;
  total: number;
  progress: number | null; // Can be null initially or during certain states
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
): IDownloadQueueState => ({ // Added return type annotation
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

    // Initialize progress state
    store.updateCurrentDownloadProgress(entry.id, {
      filename: "",
      progress: 0,
      total: 0,
      status: DownloadStatus.IN_QUEUE,
    });

    store.increaseTotalAddedToDownloadQueue();

    // Start processing the queue if it's not already active
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

    // Remove the consumed entry from the queue state
    set({
      downloadQueue: store.downloadQueue.slice(1),
    });

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

    // Prevent multiple concurrent iterations
    if (store.isQueueActive) return;
    set({ isQueueActive: true });

    while (store.downloadQueue.length > 0) { // Check length directly
      const entry = store.consumeDownloadQueue();
      // Should always have an entry if loop condition is met, but check just in case
      if (!entry) break;

      store.updateCurrentDownloadProgress(entry.id, {
        status: DownloadStatus.CONNECTING_TO_LIBGEN,
      });

      let downloadUrl: string | null | undefined = "";

      try { // Wrap the whole process for this entry in a try-catch
          if (entry.alternativeDirectDownloadUrl !== undefined) {
            downloadUrl = entry.alternativeDirectDownloadUrl;
          } else {
            if (!entry.mirror) {
                throw new Error(`Entry "${entry.title}" has no mirror link.`);
            }
            const mirrorPageDocument = await attempt(() => getDocument(entry.mirror));
            if (!mirrorPageDocument) {
              throw new Error(`Couldn't fetch the mirror page for "${entry.title}"`);
            }
            downloadUrl = findDownloadUrlFromMirror(mirrorPageDocument);
          }

          if (!downloadUrl) {
            throw new Error(`Couldn't find the download url for "${entry.title}"`);
          }

          const downloadStream = await attempt(() =>
            fetch(downloadUrl as string, { agent: httpAgent })
          );

          if (!downloadStream || !(downloadStream instanceof Response)) { // Check if it's a Response object
             throw new Error(`Couldn't get a valid download stream for "${entry.title}"`);
          }
          if (!downloadStream.ok) { // Check HTTP status
              throw new Error(`Download request failed for "${entry.title}" with status: ${downloadStream.status} ${downloadStream.statusText}`);
          }


          store.updateCurrentDownloadProgress(entry.id, {
            status: DownloadStatus.DOWNLOADING,
            // Reset progress before starting new download
            progress: 0,
            total: Number(downloadStream.headers.get("content-length") || 0) // Get total here
          });

          await downloadFile({
            downloadStream,
            onStart: (filename, total) => {
              // Update filename and total (total might be more accurate here)
              store.updateCurrentDownloadProgress(entry.id, { filename, total });
            },
            onData: (filename, chunk, total) => {
              // Only update progress based on chunk length
              store.updateCurrentDownloadProgress(entry.id, { progress: chunk.length });
            },
          });

          store.increaseTotalDownloaded();
          store.updateCurrentDownloadProgress(entry.id, {
            status: DownloadStatus.DOWNLOADED,
          });

      } catch (error: any) { // Catch any error during the process
          store.setWarningMessage(error.message || `Couldn't download "${entry.title}"`);
          store.increaseTotalFailed();
          store.updateCurrentDownloadProgress(entry.id, {
            status: DownloadStatus.FAILED,
          });
      } finally {
          // Always remove the entry ID from the active download list, regardless of success/failure
          store.removeEntryIdFromDownloadQueue(entry.id);
      }
    } // End while loop

    set({ isQueueActive: false }); // Mark queue as inactive when done
  },

  updateCurrentDownloadProgress: (
    entryId: string,
    downloadProgressUpdate: Partial<IDownloadProgress>
  ) => {
    set((prev) => {
      const existingProgress = prev.downloadProgressMap[entryId] || { status: DownloadStatus.IDLE, progress: 0, total: 0, filename: '' };
      const newProgressValue = downloadProgressUpdate.progress === null
        ? 0 // Reset progress if null is passed (e.g., on start)
        : (existingProgress.progress || 0) + (downloadProgressUpdate.progress || 0); // Add chunk size

      return {
        downloadProgressMap: {
          ...prev.downloadProgressMap,
          [entryId]: {
            ...existingProgress,
            ...downloadProgressUpdate, // Apply other updates like status, filename, total
            progress: newProgressValue, // Set the calculated progress
          },
        },
      };
    });
  },


  increaseTotalAddedToDownloadQueue: () => {
    set((prev) => ({
      totalAddedToDownloadQueue: prev.totalAddedToDownloadQueue + 1,
    }));
  },

  increaseTotalDownloaded: () => {
    set((prev) => ({
      totalDownloaded: prev.totalDownloaded + 1,
    }));
  },

  increaseTotalFailed: () => {
    set((prev) => ({
      totalFailed: prev.totalFailed + 1,
    }));
  },
});
