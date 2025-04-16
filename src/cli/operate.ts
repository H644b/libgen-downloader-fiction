import fs from "fs";
import { getDocument } from "../api/data/document";
// Import both parsers - decide which one to use later based on context if needed for MD5 lookup
import { constructMD5SearchUrl, parseSciTechEntries, parseFictionEntries } from "../api/data/search";
import { findDownloadUrlFromMirror } from "../api/data/url";
import renderTUI from "../tui/index";
import { LAYOUT_KEY } from "../tui/layouts/keys";
import { useBoundStore } from "../tui/store/index";
import { attempt } from "../utils";
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
    if (query.length < SEARCH_MIN_CHAR) {
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
    // MD5 lookup usually redirects to the book page, which might be Sci-Tech or Fiction style
    // Let's try the Sci-Tech pattern first, as it's more common for direct MD5 lookups on LibGen main sites
    // The `searchByMD5Pattern` should point to a URL that works regardless of original section, if possible.
    const md5SearchUrl = constructMD5SearchUrl(store.searchByMD5Pattern, store.mirror, md5);

    const searchPageDocument = await attempt(() => getDocument(md5SearchUrl));
    if (!searchPageDocument) {
      console.log(`Failed to get page for MD5 ${md5}`);
      return;
    }

    // Try parsing as Sci-Tech first, then Fiction if that fails
    let entry = parseSciTechEntries(searchPageDocument)?.[0];
    if (!entry) {
        entry = parseFictionEntries(searchPageDocument)?.[0];
    }

    if (!entry || !entry.mirror) {
        // Sometimes the MD5 search URL itself IS the mirror page if only one result
        console.log("Could not parse standard entry format, attempting direct mirror check...");
        const directDownloadUrl = findDownloadUrlFromMirror(searchPageDocument); // Try parsing current page
        if (directDownloadUrl) {
             console.log("Found direct download link:", directDownloadUrl);
             return;
        }
        console.log(`Failed to parse entry or find mirror link for MD5 ${md5}.`);
        return;
    }

    console.log(`Found entry: "${entry.title}", accessing mirror page...`);
    const mirrorPageDocument = await attempt(() => getDocument(entry.mirror));
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
