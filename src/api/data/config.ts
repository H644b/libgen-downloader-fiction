import fetch from "node-fetch";
import { CONFIGURATION_URL } from "../../settings";

export interface Config {
  latestVersion: string;
  mirrors: string[];
  searchReqPattern: string; // Sci-Tech search pattern
  fictionSearchReqPattern: string; // Fiction search pattern
  searchByMD5Pattern: string;
  MD5ReqPattern: string;
  columnFilterQueryParamKey: string;
  columnFilterQueryParamValues: Record<string, string>;
}

export async function fetchConfig(): Promise<Config> {
  try {
    // console.log(`Fetching config from: ${CONFIGURATION_URL}`); // DEBUG
    const response = await fetch(CONFIGURATION_URL);

    if (!response.ok) {
        throw new Error(`Failed to fetch configuration: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    const conf = json as Record<string, unknown>;
    // console.log('Fetched config JSON:', conf); // DEBUG

    // Validate that essential patterns are present, provide defaults or throw if critical
    const searchReqPattern = conf["searchReqPattern"] as string;
    const fictionSearchReqPattern = conf["fictionSearchReqPattern"] as string; // Check this key specifically
    const searchByMD5Pattern = conf["searchByMD5Pattern"] as string;
    const MD5ReqPattern = conf["MD5ReqPattern"] as string;
    const mirrors = (conf["mirrors"] as string[]) || []; // Default to empty array

    let warnings = [];
    if (!searchReqPattern) warnings.push("searchReqPattern");
    if (!fictionSearchReqPattern) warnings.push("fictionSearchReqPattern"); // This is likely the missing one
    if (!searchByMD5Pattern) warnings.push("searchByMD5Pattern");
    if (!MD5ReqPattern) warnings.push("MD5ReqPattern");
    if (mirrors.length === 0) warnings.push("mirrors list is empty");

    if (warnings.length > 0) {
        console.warn(`Warning: The following keys are missing or invalid in the fetched configuration: ${warnings.join(', ')}. Using fallbacks where possible.`);
        // Decide if missing fiction pattern is critical
        if (!fictionSearchReqPattern) {
             console.error("Error: Critical configuration 'fictionSearchReqPattern' is missing. Cannot search fiction.");
             // You might want to throw an error here if fiction search is essential
             // throw new Error("Critical configuration 'fictionSearchReqPattern' is missing.");
        }
    }

    return {
      latestVersion: (conf["latest_version"] as string) || "",
      mirrors: mirrors, // Use validated or default mirrors
      // Provide fallbacks for patterns if they were missing
      searchReqPattern: searchReqPattern || "{mirror}/search.php?req={query}&lg_topic=libgen&open=0&view=simple&res={pageSize}&phrase=1&column=def&page={pageNumber}",
      fictionSearchReqPattern: fictionSearchReqPattern || "{mirror}/fiction/?q={query}", // Provide fallback
      searchByMD5Pattern: searchByMD5Pattern || "{mirror}/search.php?req={md5}&column=md5",
      MD5ReqPattern: MD5ReqPattern || "{mirror}/json.php?ids={id}&fields=md5",
      columnFilterQueryParamKey: (conf["columnFilterQueryParamKey"] as string) || "column",
      columnFilterQueryParamValues:
        (conf["columnFilterQueryParamValues"] as Record<string, string>) || {},
    };
  } catch (e) {
    console.error("Error during fetchConfig:", e); // Log the specific error
    // Re-throw a user-friendly error
    throw new Error(`Error occurred while fetching or processing configuration: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function findMirror(
  mirrors: string[],
  onMirrorFail: (failedMirror: string) => void
): Promise<string | null> {
  if (!mirrors || mirrors.length === 0) {
      // console.warn("No mirrors provided to findMirror function."); // Already warned in fetchConfig
      return null;
  }
  for (let i = 0; i < mirrors.length; i++) {
    const mirror = mirrors[i];
    if (!mirror || typeof mirror !== 'string') { // Add type check
        // console.warn(`Skipping invalid mirror entry at index ${i}: ${mirror}`); // DEBUG
        continue;
    }

    try {
      await fetch(mirror, { method: 'HEAD', timeout: 8000 }); // Increased timeout
      // console.log(`Successfully connected to mirror: ${mirror}`); // DEBUG
      return mirror;
    } catch (e) {
      // console.warn(`Failed to connect to mirror: ${mirror}`, e); // DEBUG
      onMirrorFail(mirror); // Inform UI about the failure
    }
  }
  // console.error("Failed to find any working mirror."); // DEBUG
  return null; // Return null if no mirrors worked
}
