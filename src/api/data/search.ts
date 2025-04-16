import { Entry } from "../models/Entry";
import { SearchSection } from "../../tui/store/app";
import Selector from "../selectors";

export interface constructSearchURLParams {
  query: string;
  pageNumber: number;
  pageSize: number; // Note: May not be applicable to fiction search
  mirror: string;
  searchReqPattern: string;
  fictionSearchReqPattern: string;
  searchSection: SearchSection;
  columnFilterQueryParamKey: string;
  columnFilterQueryParamValue: string | null;
}

export function constructSearchURL({
  query,
  pageNumber,
  pageSize, // Keep for SciTech pattern
  mirror,
  searchReqPattern,
  fictionSearchReqPattern,
  searchSection,
  columnFilterQueryParamKey,
  columnFilterQueryParamValue,
}: constructSearchURLParams): string {

  let patternToUse: string;
  let applyColumnFilter = false;
  const encodedQuery = encodeURIComponent(query);

  if (searchSection === 'fiction') {
    patternToUse = fictionSearchReqPattern;
    // Construct fiction URL: {mirror}/fiction/?q={query}&page={pageNumber}
    // Assumes fictionSearchReqPattern is like "{mirror}/fiction/?q={query}"
    let url = patternToUse
      .replace("{mirror}", mirror)
      .replace("{query}", encodedQuery);
      if (pageNumber > 1) url += `&page=${pageNumber}`;
    return url;

  } else { // scitech
    patternToUse = searchReqPattern;
    applyColumnFilter = true;
  }

  let url = patternToUse
    .replace("{mirror}", mirror)
    .replace("{query}", encodedQuery)
    .replace("{pageNumber}", pageNumber.toString())
    .replace("{pageSize}", pageSize.toString()); // pageSize used here

  if (applyColumnFilter && columnFilterQueryParamValue) {
    url += `&${columnFilterQueryParamKey}=${encodeURIComponent(columnFilterQueryParamValue)}`;
  }

  return url;
}


export function constructMD5SearchUrl(pattern: string, mirror: string, md5: string): string {
  if (!pattern) {
    console.warn("Warning: MD5 search pattern is missing in config.");
    pattern = "{mirror}/search.php?req={md5}&column=md5"; // Fallback SciTech MD5 search
  }
   // Check if the pattern is intended for fiction MD5 (if a specific one exists)
   // Example: if pattern includes '/fiction/' maybe redirect to a fiction-specific MD5 lookup?
   // For now, assuming the provided pattern works for both or defaults to Sci-Tech style MD5 lookup.
  return pattern.replace("{mirror}", mirror).replace("{md5}", md5);
}


export function constructFindMD5SearchUrl(
  pattern: string,
  mirror: string,
  idList: string[]
): string {
   if (!pattern) {
    console.warn("Warning: Find MD5 by ID pattern is missing in config.");
    pattern = "{mirror}/json.php?ids={id}&fields=md5";
  }
  return pattern.replace("{mirror}", mirror).replace("{id}", idList.join(","));
}


export function parseSciTechEntries(
  document: Document,
  throwError?: (message: string) => void
): Entry[] | undefined {
  const entries: Entry[] = [];
  const containerTableBody = document.querySelector<HTMLTableSectionElement>(
    Selector.SCITECH_RESULTS_TABLE_SELECTOR
  );

  if (!containerTableBody) {
    const noResultsText = "No files were found";
    if (document.body.textContent?.includes(noResultsText)) {
        return [];
    }
    if (throwError) {
      throwError(`Sci-Tech container table body not found using selector: ${Selector.SCITECH_RESULTS_TABLE_SELECTOR}`);
    }
    return undefined;
  }

  const dataRows = Array.from(containerTableBody.querySelectorAll("tr")).filter(row => row.querySelector('td'));

  for (let i = 0; i < dataRows.length; i++) {
    const element = dataRows[i];
    const cells = element.querySelectorAll("td");

    if (cells.length < 10) {
        continue;
    }

    const id = cells[0]?.textContent?.trim() || "";
    const authors = cells[1]?.textContent?.trim() || "";
    const titleElement = cells[2];
    let title = "";
    const titleLink = titleElement?.querySelector<HTMLAnchorElement>('a[id]');
    if (titleLink) {
      title = titleLink.textContent?.trim() || titleElement?.textContent?.trim() || "";
    } else {
      title = titleElement?.textContent?.trim() || "";
    }

    const publisher = cells[3]?.textContent?.trim() || "";
    const year = cells[4]?.textContent?.trim() || "";
    const pages = cells[5]?.textContent?.trim() || "";
    const language = cells[6]?.textContent?.trim() || "";
    const size = cells[7]?.textContent?.trim() || "";
    const extension = cells[8]?.textContent?.trim() || "";
    const mirror = cells[9]?.querySelector<HTMLAnchorElement>("a")?.getAttribute("href") || "";

    if (id && title && mirror) {
        entries.push({
          id,
          authors,
          title,
          publisher,
          year,
          pages,
          language,
          size,
          extension,
          mirror,
        });
    }
  }

  return entries;
}


// --- REVISED Fiction Parsing ---
export function parseFictionEntries(
  document: Document,
  throwError?: (message: string) => void
): Entry[] | undefined {
  const entries: Entry[] = [];
  const containerTableBody = document.querySelector<HTMLTableSectionElement>(
    Selector.FICTION_RESULTS_TABLE_SELECTOR // Using the selector defined in selectors.ts
  );

   if (!containerTableBody) {
    const noResultsText = "Nothing found"; // Text observed in the provided HTML
    if (document.body.textContent?.includes(noResultsText)) {
        return []; // No results found, return empty array
    }
     // If table body not found and it's not the "Nothing found" page, it's an error
     if (throwError) {
       throwError(`Fiction container table body not found using selector: ${Selector.FICTION_RESULTS_TABLE_SELECTOR}`);
     }
     return undefined; // Indicate parsing failure
   }

  const dataRows = Array.from(containerTableBody.querySelectorAll("tr")); // Get all rows within tbody

  for (let i = 0; i < dataRows.length; i++) {
    const element = dataRows[i];
    const cells = element.querySelectorAll("td");

    // Expected Fiction table structure from HTML provided:
    // 0: Author(s) | 1: Series | 2: Title (with link containing MD5) | 3: Language | 4: File (Type/Size) | 5: Mirrors | 6: Edit
     if (cells.length < 6) { // Need at least 6 cells based on HTML
        // console.warn(`Skipping Fiction row ${i + 1} due to unexpected cell count: ${cells.length}`);
        continue;
     }

     // Extract authors from the list items in the first cell
     const authorElements = cells[0]?.querySelectorAll<HTMLAnchorElement>("ul.catalog_authors li a");
     const authors = authorElements
       ? Array.from(authorElements).map(a => a.textContent?.trim()).filter(Boolean).join(', ')
       : "Unknown Author";

     const series = cells[1]?.textContent?.trim() || "";
     const titleElement = cells[2];
     const titleLinkElement = titleElement?.querySelector<HTMLAnchorElement>("a"); // The main link in the title cell
     let title = titleLinkElement?.textContent?.trim() || titleElement?.textContent?.trim() || "Untitled";
     // Remove edition info like '[ed.: PublishDrive]' for cleaner title
     title = title.replace(/\[ed\.:.*?\]/g, '').trim();

     // --- Extract MD5 from the title link's href ---
     const titleHref = titleLinkElement?.getAttribute("href") || "";
     const md5Match = titleHref.match(/([a-fA-F0-9]{32})$/); // MD5 is usually at the end of the fiction link path
     const md5 = md5Match ? md5Match[1].toLowerCase() : "";
     // ---

     const language = cells[3]?.textContent?.trim() || "Unknown";

     // Cell 4 contains File info (Type / Size)
     const fileInfoText = cells[4]?.textContent?.trim() || "";
     const fileParts = fileInfoText.split('/');
     const extension = fileParts[0]?.trim().toLowerCase() || "unknown";
     const size = fileParts[1]?.trim() || "0 Mb";

     // Cell 5 contains Mirror links - we need the primary link to the *details* page, which is the title link itself
     // The links in cell 5 are direct download attempts from mirrors, which we don't use as the primary 'mirror' property here.
     // The 'mirror' property should lead to the page where we can find download links (like the one parsed by parseDownloadUrls).
     // In fiction, the link in the title cell serves this purpose.
     const mirror = titleHref; // Use the href from the title cell

     // Use MD5 as the ID if available, otherwise generate fallback (less ideal)
     const id = md5 || `fiction-${Date.now()}-${i}-${Math.random()}`; // More unique fallback


     if (title !== "Untitled" && mirror && md5) { // Require MD5 for a valid fiction entry
        entries.push({
          id: id, // Use MD5 as the primary ID
          authors,
          title: series ? `${title} (${series})` : title, // Append series if present
          publisher: "", // Not available
          year: "",      // Not available
          pages: "",     // Not available
          language,
          size,
          extension,
          mirror, // Link to the details page (e.g., /fiction/MD5...)
        });
     } else {
        // console.warn(`Skipping Fiction row ${i + 1} due to missing title, mirror link, or MD5.`);
     }
  }

  return entries;
}
// --- END: REVISED Fiction Parsing ---
