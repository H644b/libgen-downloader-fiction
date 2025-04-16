import { GetState, SetState } from "zustand";
import { TCombinedStore } from "./index";
import { Entry } from "../../api/models/Entry";
import { constructSearchURL } from "../../api/data/search";
import { SEARCH_PAGE_SIZE } from "../../settings";

export interface ICacheState {
  entryCacheMap: Record<string, Entry[]>;
  setEntryCacheMap: (searchURL: string, entryList: Entry[]) => void;
  lookupPageCache: (pageNumber: number) => Entry[];
  resetEntryCacheMap: () => void;

  alternativeDownloadURLsCacheMap: Record<string, string[]>;
  setAlternativeDownloadURLsCacheMap: (entryId: string, urlList: string[]) => void;
}

export const initialCacheState = {
  entryCacheMap: {},
  alternativeDownloadURLsCacheMap: {},
};

export const createCacheStateSlice = (
  set: SetState<TCombinedStore>,
  get: GetState<TCombinedStore>
): ICacheState => ({ // Added return type annotation
  ...initialCacheState,

  setEntryCacheMap: (searchURL: string, entryList: Entry[]) => {
    const store = get(); // get() might not be needed here, but consistent

    const entryCacheMap = {
      ...store.entryCacheMap,
      [searchURL]: entryList,
    };

    set({ entryCacheMap });
  },

  resetEntryCacheMap: () => {
    set({
      entryCacheMap: {},
      alternativeDownloadURLsCacheMap: {}, // Also reset alternative URLs cache
    });
  },

  lookupPageCache: (pageNumber: number) => {
    const store = get();

    // Construct the cache key (search URL) using all relevant parameters
    const searchURLAsCacheMapKey = constructSearchURL({
      query: store.searchValue,
      mirror: store.mirror,
      pageNumber,
      pageSize: SEARCH_PAGE_SIZE,
      searchReqPattern: store.searchReqPattern,
      // Add the missing properties from the store state:
      fictionSearchReqPattern: store.fictionSearchReqPattern,
      searchSection: store.searchSection,
      columnFilterQueryParamKey: store.columnFilterQueryParamKey,
      // Pass filter value based on current section
      columnFilterQueryParamValue: store.searchSection === 'scitech' ? store.selectedSearchByOption : null,
    });

    // Return the cached entries or an empty array if not found
    return store.entryCacheMap[searchURLAsCacheMapKey] || [];
  },

  setAlternativeDownloadURLsCacheMap: (entryId: string, urlList: string[]) => {
    const store = get(); // get() might not be needed here

    const alternativeDownloadURLsCacheMap = {
      ...store.alternativeDownloadURLsCacheMap,
      [entryId]: urlList,
    };

    set({ alternativeDownloadURLsCacheMap });
  },
});
