import { GetState, SetState } from "zustand";
import { TCombinedStore } from "./index";
import { Entry } from "../../api/models/Entry";
import { ListItem } from "../../api/models/ListItem";
import { constructListItems } from "../../utils";
import { LAYOUT_KEY } from "../layouts/keys";
import { clearScreen } from "../helpers/screen";
import { SEARCH_MIN_CHAR } from "../../constants"; // Import constant

// Added type for search section
export type SearchSection = "fiction" | "scitech";

export interface IAppState {
  CLIMode: boolean;
  searchSection: SearchSection; // Added state

  isLoading: boolean;
  anyEntryExpanded: boolean;
  showSearchMinCharWarning: boolean;

  loaderMessage: string;
  searchValue: string;
  selectedSearchByOption: string | null; // Note: This applies only to scitech
  errorMessage: string | null;
  warningMessage: string | null;
  warningTimeout: NodeJS.Timeout | null;

  currentPage: number;
  activeExpandedListLength: number;
  listItemsCursor: number;

  detailedEntry: Entry | null;
  entries: Entry[];
  listItems: ListItem[];
  activeLayout: LAYOUT_KEY;

  setCLIMode: (CLIMode: boolean) => void;
  setSearchSection: (section: SearchSection) => void; // Added action

  setIsLoading: (isLoading: boolean) => void;
  setAnyEntryExpanded: (anyEntryExpanded: boolean) => void;

  setLoaderMessage: (loaderMessage: string) => void;
  setSearchValue: (searchValue: string) => void;
  setSelectedSearchByOption: (selectedSearchByOption: string | null) => void;
  setErrorMessage: (errorMessage: string | null) => void;
  setWarningMessage: (warningMessage: string | null) => void;

  setCurrentPage: (currentPage: number) => void;
  setActiveExpandedListLength: (activeExpandedListLength: number) => void;
  setListItemsCursor: (listItemsCursor: number) => void;

  setDetailedEntry: (detailedEntry: Entry | null) => void;
  setEntries: (entries: Entry[]) => void;
  setActiveLayout: (activeLayout: LAYOUT_KEY) => void;

  resetAppState: () => void;
}

export const initialAppState = {
  // CLIMode: false // This is set outside the initial state usually
  searchSection: "fiction" as SearchSection, // Default to fiction

  isLoading: false,
  anyEntryExpanded: false,
  showSearchMinCharWarning: true, // Show warning initially if search value is empty

  loaderMessage: "",
  searchValue: "",
  selectedSearchByOption: null, // Default for scitech filter
  errorMessage: null,
  warningMessage: null,
  warningTimeout: null,

  currentPage: 1,
  activeExpandedListLength: 0,
  listItemsCursor: 0,

  detailedEntry: null,
  entries: [],
  listItems: [],
  activeLayout: LAYOUT_KEY.SEARCH_LAYOUT, // Default layout
};

export const createAppStateSlice = (
  set: SetState<TCombinedStore>,
  get: GetState<TCombinedStore>
): IAppState => ({ // Added return type annotation
  CLIMode: false, // Default CLIMode here
  ...initialAppState,

  setCLIMode: (CLIMode: boolean) => set({ CLIMode }),
  setSearchSection: (section: SearchSection) => set({ searchSection: section }), // Added action implementation

  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setAnyEntryExpanded: (anyEntryExpanded: boolean) => set({ anyEntryExpanded }),

  setLoaderMessage: (loaderMessage: string) => set({ loaderMessage }),
  setSearchValue: (searchValue: string) => {
    set(() => ({
        searchValue,
        // Update warning based on current value and constant
        showSearchMinCharWarning: searchValue.length < SEARCH_MIN_CHAR
    }));
  },
  setSelectedSearchByOption: (selectedSearchByOption: string | null) => {
    // This only makes sense for scitech, maybe add a check or handle in UI
    set({ selectedSearchByOption });
  },
  setErrorMessage: (errorMessage: string | null) => set({ errorMessage }),
  setWarningMessage: (warningMessage: string | null) => {
    const WARNING_DURATION = 5000;

    const currentTimeout = get().warningTimeout;
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    set({ warningMessage });
    const newTimeout = setTimeout(() => {
      set({ warningMessage: null });
    }, WARNING_DURATION);
    set({ warningTimeout: newTimeout });
  },

  setCurrentPage: (currentPage: number) => set({ currentPage }),
  setActiveExpandedListLength: (activeExpandedListLength: number) =>
    set({ activeExpandedListLength }),
  setListItemsCursor: (listItemsCursor: number) => set({ listItemsCursor }),

  setDetailedEntry: (detailedEntry: Entry | null) => set({ detailedEntry }),
  setEntries: (entries: Entry[]) => {
    const store = get();
    const listItems = constructListItems({
      entries,
      currentPage: store.currentPage,
      // Check cache for next page availability *using the current search section*
      isNextPageAvailable: store.lookupPageCache(store.currentPage + 1).length > 0,
      handleSearchOption: store.backToSearch,
      handleNextPageOption: store.nextPage,
      handlePrevPageOption: store.prevPage,
      handleStartBulkDownloadOption: store.startBulkDownload,
      handleExitOption: () => {
        if (get().inDownloadQueueEntryIds.length > 0) {
          store.setActiveLayout(LAYOUT_KEY.DOWNLOAD_QUEUE_BEFORE_EXIT_LAYOUT);
          return;
        }

        if (get().bulkDownloadSelectedEntryIds.length > 0) {
          store.setActiveLayout(LAYOUT_KEY.BULK_DOWNLOAD_BEFORE_EXIT_LAYOUT);
          return;
        }

        store.handleExit();
      },
    });
    set({ entries, listItems });
  },
  setActiveLayout: (activeLayout: LAYOUT_KEY) => {
    const store = get();
    // Conditionally clear screen only if not in CLI mode
    if (!store.CLIMode) {
      clearScreen();
    }
    set({ activeLayout });
  },

  resetAppState: () => {
    const currentCLIMode = get().CLIMode; // Preserve CLI mode status
    set({ ...initialAppState, CLIMode: currentCLIMode }); // Reset everything else
  }
});
