import fs from "fs";
import { getDocument } from "../api/data/document";
import { constructMD5SearchUrl, parseSciTechEntries, parseFictionEntries, Entry } from "../api/data/search"; // Import Entry type
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
    if (!store.mirror) {
        console.log("Fetching config...");
        await store.fetchConfig();
        if (store.errorMessage) {
            console.error("Error fetching configuration:", store.errorMessage);
            return false;
        }
    }
    return true;
}


export const operate = async (flags: Record<string, unknown>) => {
  const store = useBoundStore.getState();

  if (flags.scitech) {
    store.setSearchSection("scitech");
  }

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
      doNotFetchConfigInitially: true,
    });
    await store.handleSearchSubmit();
    return;
  }

  if (flags.bulk) {
    const configLoaded = await ensureConfigLoaded();
    if (!configLoaded) return;

    const filePath = flags.bulk as string;
    try {
        const data = await fs.promises.readFile(filePath, "utf8");
        const md5List = data.split(/\r?\n/)
                             .map(line => line.trim())
                             .filter(line => /^[a-fA-F0-9]{32}$/.test(line));

        if (md5List.length === 0) {
            console.error(`Bulk file "${filePath}" is empty or contains no valid 32-char hex MD5 hashes.`);
            return;
        }

        renderTUI({
          startInCLIMode: true,
          doNotFetchConfigInitially: true,
          initialLayout: LAYOUT_KEY.BULK_DOWNLOAD_LAYOUT,
        });
        await store.startBulkDownloadInCLI(md5List);

    } catch (err: any) {
        console.error(`Error reading bulk file "${filePath}":`, err.message);
        return;
    }
    return;
  }

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

    let entry: Entry | undefined = parseSciTechEntries(searchPageDocument)?.[0];
    if (!entry) {
        entry = parseFictionEntries(searchPageDocument)?.[0];
    }

    // --- REFACTORED CHECK ---
    if (!entry) {
        console.log("Could not parse standard entry format, attempting direct mirror check...");
        const directDownloadUrl = findDownloadUrlFromMirror(searchPageDocument);
        if (directDownloadUrl) {
             console.log("Found direct download link:", directDownloadUrl);
             return;
        }
        console.log(`Failed to parse entry details for MD5 ${md5}.`);
        return;
    }

    if (!entry.mirror) {
        console.log(`Entry found for ${md5}, but no mirror link was parsed.`);
        return;
    }
    // --- END REFACTORED CHECK ---

    console.log(`Found entry: "${entry.title}", accessing mirror page: ${entry.mirror}`);
    // Safe to use entry.mirror here
    const mirrorPageDocument = await attempt(() => getDocument(entry!.mirror)); // Use non-null assertion or rely on TS inference
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
      doNotFetchConfigInitially: true,
      initialLayout: LAYOUT_KEY.BULK_DOWNLOAD_LAYOUT,
    });
    await store.startBulkDownloadInCLI(md5List);
    return;
  }

  renderTUI({
    startInCLIMode: false,
    doNotFetchConfigInitially: !!store.mirror,
  });
};
