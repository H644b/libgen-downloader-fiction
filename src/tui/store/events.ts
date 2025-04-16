import { GetState, SetState } from "zustand";
import { TCombinedStore } from "./index";
import { LAYOUT_KEY } from "../layouts/keys";
import Label from "../../labels";
import { Entry } from "../../api/models/Entry";
// Import BOTH parsing functions and the SearchSection type
import { constructSearchURL, parseSciTechEntries, parseFictionEntries } from "../../api/data/search";
import { SearchSection } from "../store/app"; // Adjust path if needed
import { SEARCH_PAGE_SIZE, SEARCH_MIN_CHAR } from "../../constants"; // Corrected import path
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
  set: SetState<TCombinedStore>, // Use 'set'
  get: GetState<TCombinedStore>
): IEventActions => ({ // Added return type annotation
  backToSearch: () => {
    const store = get();

    store.resetAppState(); // Resets searchSection to 'fiction' by default now
    store.setActiveLayout(LAYOUT_KEY.SEARCH_LAYOUT);
    // Clear cache on going back to search? Optional, but maybe desired.
    store.resetEntryCacheMap();
    store.resetBulkDownloadQueue(); // Also reset bulk queue
  },

  search: async (query: string, pageNumber: number) => {
    const store = get();
    const currentSearchSection: SearchSection = store.searchSection; // Get current section

    // Construct URL based on current state (including section)
    const searchURL = constructSearchURL({
      query,
      mirror: store.mirror,
      pageNumber,
      pageSize: SEARCH_PAGE_SIZE,
      searchReqPattern: store.searchReqPattern,
      fictionSearchReqPattern: store.fictionSearchReqPattern,
      searchSection: currentSearchSection,
      columnFilterQueryParamKey: store.columnFilterQueryParamKey,
      // Only pass column filter if it's a Sci-Tech search and a filter is selected
      columnFilterQueryParamValue: currentSearchSection === 'scitech' ? store.selectedSearchByOption : null,
    });

    // Cache lookup uses the full URL, differentiating between sections/filters implicitly
    const cachedEntries = store.entryCacheMap[searchURL];
    if (cachedEntries) { // Check if cache exists (even if empty array)
      return cachedEntries;
    }

    // Show loading state specific to this background fetch if not already loading globally
    const wasLoading = store.isLoading;
    if (!wasLoading) {
        store.setIsLoading(true);
        store.setLoaderMessage(Label.GETTING_RESULTS + ` for page ${pageNumber}...`);
    }

    const pageDocument = await attempt(() => getDocument(searchURL));

    // Turn off loading indicator if it was turned on by this specific fetch
    if (!wasLoading) {
        store.setIsLoading(false);
        store.setLoaderMessage(""); // Clear message
    }

    if (!pageDocument) {
      // Use setWarningMessage for non-critical errors like page fetch failure
      store.setWarningMessage(`Couldn't fetch search page ${pageNumber} for "${query}"`);
      return []; // Return empty array to indicate failure/no results for this page
    }

    // Choose parser based on the section being searched
    let entries: Entry[] | undefined;
    if (currentSearchSection === 'fiction') {
        entries = parseFictionEntries(pageDocument, store.setWarningMessage);
    } else {
        entries = parseSciTechEntries(pageDocument, store.setWarningMessage);
    }

    if (entries === undefined) {
      // Parsing failed, warning should be set by the parser function.
      return []; // Return empty to signify failure for this page
    }

    // Cache the result (even if it's an empty array for "no results found")
    store.setEntryCacheMap(searchURL, entries);
    return entries;
  },

  handleSearchSubmit: async () => {
    const store = get();

    if (store.searchValue.length < SEARCH_MIN_CHAR) {
      store.setWarningMessage(`Search query must be at least ${SEARCH_MIN_CHAR} characters long.`);
      return; // Don't proceed with search
    }

    // Reset state for a new search
    store.setCurrentPage(1);
    store.setListItemsCursor(0);
    store.resetEntryCacheMap(); // Clear cache for the new search
    store.setAnyEntryExpanded(false); // Collapse any open items
    store.setDetailedEntry(null); // Clear detailed view

    store.setActiveLayout(LAYOUT_KEY.RESULT_LIST_LAYOUT);
    store.setIsLoading(true); // Use main loading state for the initial search display
    store.setLoaderMessage(Label.GETTING_RESULTS);

    const entriesPage1 = await store.search(store.searchValue, 1); // Fetch page 1

    // Update UI with page 1 results FIRST
    store.setEntries(entriesPage1);
    store.setIsLoading(false); // Turn off main loading state AFTER showing page 1

    // If page 1 had results, pre-fetch page 2 in the background
    // Make sure to handle potential errors in background fetch gracefully
    if (entriesPage1.length > 0) {
        store.search(store.searchValue, 2).catch(e => {
            // Optionally log background fetch errors, but don't block UI
            console.warn("Background fetch for page 2 failed:", e instanceof Error ? e.message : String(e));
        });
    }
  },

  nextPage: async () => {
    const store = get();
    const nextPageNumber = store.currentPage + 1;

    // Fetch next page (might hit cache or network)
    const entries = await store.search(store.searchValue, nextPageNumber);

    // If search returned an empty array (either no results or fetch/parse failure), show warning and don't update page.
    if (entries.length === 0) {
        // A warning might have already been set by `search`. We can add a more generic one if needed.
        if (!store.warningMessage?.includes(`page ${nextPageNumber}`)) { // Avoid duplicate warnings
            store.setWarningMessage(`No results found on page ${nextPageNumber}.`);
        }
        return;
    }

    // Pre-fetch page after next page in the background
    store.search(store.searchValue, nextPageNumber + 1).catch(e => {
        console.warn(`Background fetch for page ${nextPageNumber + 1} failed:`, e instanceof Error ? e.message : String(e));
    });

    store.setCurrentPage(nextPageNumber);
    store.setListItemsCursor(0);
    store.setAnyEntryExpanded(false); // Collapse item on page change
    store.setEntries(entries); // Update UI with next page results
  },

  prevPage: async () => {
    const store = get();
    const prevPageNumber = store.currentPage - 1;

    if (prevPageNumber < 1) {
      return; // Already on the first page
    }

    // Fetch previous page (likely from cache)
    const entries = await store.search(store.searchValue, prevPageNumber);

    // `search` returns [] on failure now, so just check length
    if (entries.length === 0 && prevPageNumber > 0) {
        // Check if a warning was already set by search failure
        if (!store.warningMessage?.includes(`page ${prevPageNumber}`)) {
            store.setWarningMessage(`Could not retrieve results for page ${prevPageNumber}.`);
        }
       return;
    }

    store.setCurrentPage(prevPageNumber);
    store.setListItemsCursor(0);
    store.setAnyEntryExpanded(false); // Collapse item on page change
    store.setEntries(entries);
  },

  fetchEntryAlternativeDownloadURLs: async (entry: Entry) => {
    const store = get();

    // Check cache first
    const cachedAlternativeDownloadURLs = store.alternativeDownloadURLsCacheMap[entry.id];
    if (cachedAlternativeDownloadURLs) {
      return cachedAlternativeDownloadURLs;
    }

    if (!entry.mirror) {
        store.setWarningMessage(`Entry "${entry.title}" has no mirror link to fetch download URLs from.`);
        return [];
    }

    const pageDocument = await attempt(() => getDocument(entry.mirror)); // Use the entry's specific mirror link
    if (!pageDocument) {
      store.setWarningMessage(`Couldn't fetch the entry page for "${entry.title}"`);
      return [];
    }

    const parsedDownloadUrls = parseDownloadUrls(pageDocument, store.setWarningMessage); // Pass warning setter
    if (!parsedDownloadUrls) {
      // Warning should be set by parseDownloadUrls on failure
      return [];
    }

    // Cache the successfully parsed URLs
    store.setAlternativeDownloadURLsCacheMap(entry.id, parsedDownloadUrls);
    return parsedDownloadUrls;
  },

  handleExit: () => {
    // Perform any cleanup before exiting if necessary
    console.log("\nExiting libgen-downloader.");
    process.exit(0);
  },
});
