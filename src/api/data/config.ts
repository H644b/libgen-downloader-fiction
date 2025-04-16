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
    const response = await fetch(CONFIGURATION_URL);
    // Check if the response was successful
    if (!response.ok) {
        throw new Error(`Failed to fetch configuration: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    const conf = json as Record<string, unknown>;

    // Validate that essential patterns are present, provide defaults or throw if critical
    const searchReqPattern = conf["searchReqPattern"] as string;
    const fictionSearchReqPattern = conf["fictionSearchReqPattern"] as string; // Make sure this exists in config.json
    const searchByMD5Pattern = conf["searchByMD5Pattern"] as string;
    const MD5ReqPattern = conf["MD5ReqPattern"] as string;

    if (!searchReqPattern || !fictionSearchReqPattern || !searchByMD5Pattern || !MD5ReqPattern) {
        // Log a warning or throw an error depending on how critical these are at startup
        console.warn("Warning: One or more search patterns are missing in the configuration.");
        // Example of throwing if a pattern is absolutely needed immediately:
        // if (!searchReqPattern) throw new Error("Critical configuration 'searchReqPattern' is missing.");
    }


    return {
      latestVersion: (conf["latest_version"] as string) || "",
      mirrors: (conf["mirrors"] as string[]) || [],
      searchReqPattern: searchReqPattern || "{mirror}/search.php?req={query}&lg_topic=libgen&open=0&view=simple&res={pageSize}&phrase=1&column=def&page={pageNumber}", // Example fallback
      fictionSearchReqPattern: fictionSearchReqPattern || "{mirror}/fiction/?q={query}", // Example fallback
      searchByMD5Pattern: searchByMD5Pattern || "{mirror}/search.php?req={md5}&column=md5", // Example fallback
      MD5ReqPattern: MD5ReqPattern || "{mirror}/json.php?ids={id}&fields=md5", // Example fallback
      columnFilterQueryParamKey: (conf["columnFilterQueryParamKey"] as string) || "column", // Default key
      columnFilterQueryParamValues:
        (conf["columnFilterQueryParamValues"] as Record<string, string>) || {}, // Empty object default
    };
  } catch (e) {
    // Catch network errors or JSON parsing errors
    console.error("Error fetching or parsing configuration:", e);
    throw new Error(`Error occurred while fetching configuration: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function findMirror(
  mirrors: string[],
  onMirrorFail: (failedMirror: string) => void
): Promise<string | null> {
  if (!mirrors || mirrors.length === 0) {
      console.warn("No mirrors provided in configuration.");
      return null;
  }
  for (let i = 0; i < mirrors.length; i++) {
    const mirror = mirrors[i];
    if (!mirror) continue; // Skip potentially empty mirror entries

    try {
      // Use a HEAD request for efficiency, just checking reachability
      // Increased timeout for potentially slow mirrors
      await fetch(mirror, { method: 'HEAD', timeout: 8000 });
      return mirror;
    } catch (e) {
      onMirrorFail(mirror);
    }
  }
  return null; // Return null if no mirrors worked
}
