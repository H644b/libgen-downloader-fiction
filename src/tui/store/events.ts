import { GetState, SetState } from "zustand";
import { TCombinedStore } from "./index";
import { LAYOUT_KEY } from "../layouts/keys";
import Label from "../../labels";
import { Entry } from "../../api/models/Entry";
import { constructSearchURL, parseSciTechEntries, parseFictionEntries } from "../../api/data/search";
import { SearchSection } from "../store/app";
import { SEARCH_PAGE_SIZE } from "../../settings"; // Correct import path for SEARCH_PAGE_SIZE
import { SEARCH_MIN_CHAR } from "../../constants"; // Correct import path for SEARCH_MIN_CHAR
import { attempt } from "../../utils";
import { getDocument } from "../../api/data/document";
import { parseDownloadUrls } from "../../api/data/url";

export interface IEventActions {
  backToSearch: () => void;
  search: (query: string, page: number) => Promise<Entry[]>;
  handleSearchSubmit: () => Promise<void>;
  nextPage: () => Promise<void>;
  prevPage: () => Promise<void>;
  fetchEntryAlternativeDownloadURLs: (entry: Entry) => Promise<string[]>;
  handleExit: () => void;
}

export const createEventActionsSlice = (
  set: SetState<TCombinedStore>,
  get: GetState<TCombinedStore>
): IEventActions => ({
  backToSearch: () => {
    const store = get();
    store.resetAppState();
    store.setActiveLayout(LAYOUT_KEY.SEARCH_LAYOUT);
    store.resetEntryCacheMap();
    store.resetBulkDownloadQueue();
  },

  search: async (query: string, pageNumber: number) => {
    const store = get();
    const currentSearchSection: SearchSection = store.searchSection;
    const baseMirrorUrl = store.mirror; // Get the base mirror URL

    if (!baseMirrorUrl) {
        store.setErrorMessage("Cannot search: No working LibGen mirror found.");
        return [];
    }

    const searchURL = constructSearchURL({
      query,
      mirror: baseMirrorUrl,
      pageNumber,
      pageSize: SEARCH_PAGE_SIZE,
      searchReqPattern: store.searchReqPattern,
      fictionSearchReqPattern: store.fictionSearchReqPattern,
      searchSection: currentSearchSection,
      columnFilterQueryParamKey: store.columnFilterQueryParamKey,
      columnFilterQueryParamValue: currentSearchSection === 'scitech' ? store.selectedSearchByOption : null,
    });

    const cachedEntries = store.entryCacheMap[searchURL];
    if (cachedEntries) {
      return cachedEntries;
    }

    const wasLoading = store.isLoading;
    if (!wasLoading) {
        store.setIsLoading(true);
        store.setLoaderMessage(Label.GETTING_RESULTS + ` for page ${pageNumber}...`);
    }

    const pageDocument = await attempt(() => getDocument(searchURL));

    if (!wasLoading) {
        store.setIsLoading(false);
        store.setLoaderMessage("");
    }

    if (!pageDocument) {
      store.setWarningMessage(`Couldn't fetch search page ${pageNumber} for "${query}"`);
      return [];
    }

    let entries: Entry[] | undefined;
    if (currentSearchSection === 'fiction') {
        // Pass the baseMirrorUrl to the fiction parser
        entries = parseFictionEntries(pageDocument, baseMirrorUrl, store.setWarningMessage);
    } else {
        // SciTech parser doesn't need the base mirror in the same way
        entries = parseSciTechEntries(pageDocument, store.setWarningMessage);
    }

    if (entries === undefined) {
      // Warning should be set by parser if specific error occurred
      return [];
    }

    store.setEntryCacheMap(searchURL, entries);
    return entries;
  },

  handleSearchSubmit: async () => {
    const store = get();
    if (store.searchValue.length < SEARCH_MIN_CHAR) {
      store.setWarningMessage(`Search query must be at least ${SEARCH_MIN_CHAR} characters long.`);
      return;
    }
    store.setCurrentPage(1);
    store.setListItemsCursor(0);
    store.resetEntryCacheMap();
    store.setAnyEntryExpanded(false);
    store.setDetailedEntry(null);
    store.setActiveLayout(LAYOUT_KEY.RESULT_LIST_LAYOUT);
    store.setIsLoading(true);
    store.setLoaderMessage(Label.GETTING_RESULTS);
    const entriesPage1 = await store.search(store.searchValue, 1);
    store.setEntries(entriesPage1);
    store.setIsLoading(false);
    if (entriesPage1.length > 0) {
        store.search(store.searchValue, 2).catch(e => {
            console.warn("Background fetch for page 2 failed:", e instanceof Error ? e.message : String(e));
        });
    }
  },

  nextPage: async () => {
    const store = get();
    const nextPageNumber = store.currentPage + 1;
    const entries = await store.search(store.searchValue, nextPageNumber);
    if (entries.length === 0) {
        if (!store.warningMessage?.includes(`page ${nextPageNumber}`)) {
            store.setWarningMessage(`No results found on page ${nextPageNumber}.`);
        }
        return;
    }
    store.search(store.searchValue, nextPageNumber + 1).catch(e => {
        console.warn(`Background fetch for page ${nextPageNumber + 1} failed:`, e instanceof Error ? e.message : String(e));
    });
    store.setCurrentPage(nextPageNumber);
    store.setListItemsCursor(0);
    store.setAnyEntryExpanded(false);
    store.setEntries(entries);
  },

  prevPage: async () => {
    const store = get();
    const prevPageNumber = store.currentPage - 1;
    if (prevPageNumber < 1) {
      return;
    }
    const entries = await store.search(store.searchValue, prevPageNumber);
    // Check if search returned empty array and it wasn't page 0 (which is invalid anyway)
    if (entries.length === 0 && prevPageNumber > 0) {
        if (!store.warningMessage?.includes(`page ${prevPageNumber}`)) {
            store.setWarningMessage(`Could not retrieve results for page ${prevPageNumber}.`);
        }
       return;
    }
    store.setCurrentPage(prevPageNumber);
    store.setListItemsCursor(0);
    store.setAnyEntryExpanded(false);
    store.setEntries(entries);
  },

  fetchEntryAlternativeDownloadURLs: async (entry: Entry) => {
    const store = get();
    const cachedAlternativeDownloadURLs = store.alternativeDownloadURLsCacheMap[entry.id];
    if (cachedAlternativeDownloadURLs) {
      return cachedAlternativeDownloadURLs;
    }

    // Ensure entry.mirror is an absolute URL before fetching
    if (!entry.mirror || !entry.mirror.startsWith('http')) {
        store.setWarningMessage(`Cannot fetch alternative URLs: Invalid mirror link for "${entry.title}" (${entry.mirror})`);
        return [];
    }

    const pageDocument = await attempt(() => getDocument(entry.mirror));
    if (!pageDocument) {
      store.setWarningMessage(`Couldn't fetch the entry page for "${entry.title}" from ${entry.mirror}`);
      return [];
    }
    const parsedDownloadUrls = parseDownloadUrls(pageDocument, store.setWarningMessage);
    if (!parsedDownloadUrls) {
      // Warning should be set by parseDownloadUrls
      return [];
    }
    store.setAlternativeDownloadURLsCacheMap(entry.id, parsedDownloadUrls);
    return parsedDownloadUrls;
  },

  handleExit: () => {
    console.log("\nExiting libgen-downloader.");
    process.exit(0);
  },
});
