import create, { GetState, SetState } from "zustand"; // Import necessary types from zustand
// Import interfaces and slice creators for all state parts
import { createAppStateSlice, IAppState } from "./app";
import { createBulkDownloadQueueStateSlice, IBulkDownloadQueueState } from "./bulk-download-queue";
import { createCacheStateSlice, ICacheState } from "./cache";
import { createConfigStateSlice, IConfigState } from "./config";
import { createDownloadQueueStateSlice, IDownloadQueueState } from "./download-queue";
import { createEventActionsSlice, IEventActions } from "./events";

// Ensure TCombinedStore correctly unions ALL interfaces
export type TCombinedStore = IAppState &
  IConfigState &
  IDownloadQueueState &
  IBulkDownloadQueueState &
  ICacheState &
  IEventActions;

// The create function structure correctly merges the objects returned by slices
export const useBoundStore = create<TCombinedStore>((set, get) => ({
  ...createAppStateSlice(set, get),
  ...createConfigStateSlice(set, get),
  ...createDownloadQueueStateSlice(set, get),
  ...createBulkDownloadQueueStateSlice(set, get),
  ...createCacheStateSlice(set, get),
  ...createEventActionsSlice(set, get),
}));
