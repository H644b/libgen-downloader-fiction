import { GetState, SetState } from "zustand";
import { TCombinedStore } from "./index";
import { Config, fetchConfig, findMirror } from "../../api/data/config";
import Label from "../../labels";
import { attempt } from "../../utils";

export interface IConfigState extends Config {
  mirror: string; // Ensure mirror is part of the state interface
  fetchConfig: () => Promise<void>;
}

export const initialConfigState = {
  latestVersion: "",
  mirrors: [],
  searchReqPattern: "",
  fictionSearchReqPattern: "", // Added
  searchByMD5Pattern: "",
  MD5ReqPattern: "",
  mirror: "", // Initial value
  columnFilterQueryParamKey: "",
  columnFilterQueryParamValues: {},
};

export const createConfigStateSlice = (
  set: SetState<TCombinedStore>,
  get: GetState<TCombinedStore>
): IConfigState => ({ // Added return type annotation
  ...initialConfigState,

  fetchConfig: async () => {
    const store = get();

    // Avoid fetching if already loading or config seems loaded (mirror is set)
    if (store.isLoading || store.mirror) {
      return;
    }

    store.setIsLoading(true);
    store.setLoaderMessage(Label.FETCHING_CONFIG);

    const config = await attempt(fetchConfig);

    if (!config) {
      store.setIsLoading(false);
      store.setErrorMessage("Couldn't fetch the config. Please check your internet connection and the configuration URL.");
      store.setLoaderMessage(""); // Clear loader message on error
      return;
    }

    // Ensure mirrors array is valid before proceeding
    if (!config.mirrors || config.mirrors.length === 0) {
        store.setIsLoading(false);
        store.setErrorMessage("Configuration loaded, but no mirrors were found.");
        store.setLoaderMessage("");
        return;
    }

    // Find an available mirror
    store.setLoaderMessage(Label.FINDING_MIRROR);
    const mirror = await findMirror(config.mirrors, (failedMirror: string) => {
      // Update loader message more gracefully
      store.setLoaderMessage(
        `${Label.COULDNT_REACH_TO_MIRROR}: ${failedMirror}. Trying next...`
      );
    });


    if (!mirror) {
      store.setIsLoading(false);
      store.setErrorMessage("Couldn't find a working LibGen mirror from the configuration list.");
      store.setLoaderMessage("");
      return;
    }

    // Config fetched and mirror found successfully
    set({
      ...config,
      mirror, // Set the found mirror
    });
    store.setIsLoading(false); // Turn off loading indicator
    store.setLoaderMessage(""); // Clear loader message
  },
});
