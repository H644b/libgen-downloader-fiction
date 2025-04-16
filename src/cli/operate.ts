import fs from "fs";
import { getDocument } from "../api/data/document";
// Remove 'Entry' from this import list
import { constructMD5SearchUrl, parseSciTechEntries, parseFictionEntries } from "../api/data/search";
import { Entry } from "../api/models/Entry"; // Import Entry directly from its definition if needed elsewhere
import { findDownloadUrlFromMirror } from "../api/data/url";
import renderTUI from "../tui/index";
import { LAYOUT_KEY } from "../tui/layouts/keys";
import { useBoundStore } from "../tui/store/index";
import { attempt } from "../utils";
// Import SEARCH_MIN_CHAR from the correct path (src/constants.ts)
import { SEARCH_MIN_CHAR } from "../constants";

// Helper to ensure config is loaded
async function ensureConfigLoaded() {
    const store = useBoundStore.getState();
    if (!store.mirror) { // Check if mirror is set (implies config is loaded)
        console.log("Fetching config...");
        await store.fetchConfig();
        if (store.errorMessage) {
            console.error("Error fetching configuration:", store.errorMessage);
            return false; // Indicate failure
        }
    }
    return true; // Indicate success
}


export const operate = async (flags: Record<string, unknown>) => {
  const store = useBoundStore.getState();

  // Set search section based on flag BEFORE potentially fetching config or rendering TUI
  if (flags.scitech) {
    store.setSearchSection("scitech");
  }
  // Default is 'fiction' (set in initialAppState)

  // --- Search Operation (-s) ---
  if (flags.search) {
    const query = flags.search as string;
    if (query.length < SEARCH_MIN_CHAR) { // Uses the correctly imported constant
      console.log(`Query must be at least ${SEARCH_MIN_CHAR} characters long`);
      return;
    }

    const configLoaded = await ensureConfigLoaded();
    if (!configLoaded) return;

    store.setSearchValue(query);
    renderTUI({
      startInCLIMode: false,
      doNotFetchConfigInitially: true, // Config should be loaded now
    });
    // handleSearchSubmit uses the searchSection state internally
    await store.handleSearchSubmit();
    return;
  }

  // --- Bulk Download Operation (-b) ---
  if (flags.bulk) {
    const configLoaded = await ensureConfigLoaded();
    if (!configLoaded) return;

    const filePath = flags.bulk as string;
    try {
        const data = await fs.promises.readFile(filePath, "utf8");
        const md5List = data.split(/\r?\n/) // Handles both Windows and Unix line endings
                             .map(line => line.trim())
                             .filter(line => /^[a-fA-F0-9]{32}$/.test(line)); // Validate MD5 format

        if (md5List.length === 0) {
            console.error(`Bulk file "${filePath}" is empty or contains no valid 32-char hex MD5 hashes.`);
            return;
        }

        renderTUI({
          startInCLIMode: true,
          doNotFetchConfigInitially: true, // Config loaded
          initialLayout: LAYOUT_KEY.BULK_DOWNLOAD_LAYOUT,
        });
        // Bulk download uses MD5 lookups, assumes MD5 pattern works for both sections
        await store.startBulkDownloadInCLI(md5List);

    } catch (err: any) { // Catch readFile errors
        console.error(`Error reading bulk file "${filePath}":`, err.message);
        return;
    }
    return;
  }

  // --- Get URL Operation (-u) ---
  if (flags.url) {
    const configLoaded = await ensureConfigLoaded();
    if (!configLoaded) return;

    const md5 = flags.url as string;
    if (!/^[a-fA-F0-9]{32}$/.test(md5)) {
        console.error("Invalid MD5 hash provided for --url flag.");
        return;
    }

    console.log("Finding download url for MD5:", md5);
    const md5SearchUrl = constructMD5SearchUrl(store.searchByMD5Pattern, store.mirror, md5);

    const searchPageDocument = await attempt(() => getDocument(md5SearchUrl));
    if (!searchPageDocument) {
      console.log(`Failed to get page for MD5 ${md5}`);
      return;
    }

    // Try parsing as Sci-Tech first, then Fiction if that fails
    // The type of 'entry' will be inferred as `Entry | undefined`
    let entry = parseSciTechEntries(searchPageDocument)?.[0];
    if (!entry) {
        entry = parseFictionEntries(searchPageDocument)?.[0];
    }

    // Refactored check
    if (!entry) {
        console.log("Could not parse standard entry format, attempting direct mirror check...");
        const directDownloadUrl = findDownloadUrlFromMirror(searchPageDocument);
        if (directDownloadUrl) {
             console.log("Found direct download link:", directDownloadUrl);
             return; // Success!
        }
        console.log(`Failed to parse entry details for MD5 ${md5}.`);
        return; // Failure
    }

    // Now 'entry' is guaranteed to be defined. Check for 'entry.mirror'.
    if (!entry.mirror) {
        console.log(`Entry found for ${md5}, but no mirror link was parsed.`);
        return; // Failure
    }
    // End refactored check

    // If entry and mirror link were found
    console.log(`Found entry: "${entry.title}", accessing mirror page: ${entry.mirror}`);
    // Safe to use entry.mirror here
    const mirrorPageDocument = await attempt(() => getDocument(entry!.mirror)); // Can use non-null assertion or rely on TS inference
    if (!mirrorPageDocument) {
      console.log(`Failed to get mirror page document from ${entry.mirror}`);
      return;
    }

    const downloadUrl = findDownloadUrlFromMirror(mirrorPageDocument);
    if (!downloadUrl) {
      console.log("Failed to find final download url on mirror page.");
      return;
    }

    console.log("Direct download link:", downloadUrl);
    return;
  }

  // --- Download Operation (-d) ---
  if (flags.download) {
    const configLoaded = await ensureConfigLoaded();
    if (!configLoaded) return;

    const md5 = flags.download as string;
     if (!/^[a-fA-F0-9]{32}$/.test(md5)) {
        console.error("Invalid MD5 hash provided for --download flag.");
        return;
    }

    const md5List = [md5];
    renderTUI({
      startInCLIMode: true,
      doNotFetchConfigInitially: true, // Config loaded
      initialLayout: LAYOUT_KEY.BULK_DOWNLOAD_LAYOUT,
    });
    await store.startBulkDownloadInCLI(md5List); // Uses MD5 lookup, same logic as bulk
    return;
  }

  // --- Default Interactive Mode ---
  // Config will be fetched here if not already loaded by other flags
  renderTUI({
    startInCLIMode: false,
    doNotFetchConfigInitially: !!store.mirror, // Only skip if config already loaded
  });
};
