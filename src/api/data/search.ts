import { Entry } from "../models/Entry"; // Keep the import here as it's used internally
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
    let url = patternToUse
      .replace("{mirror}", mirror)
      .replace("{query}", encodedQuery);
      // Fiction page parameter starts at 1
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


// --- REVISED Fiction Parsing (v2 - More Robust) ---
export function parseFictionEntries(
  document: Document,
  throwError?: (message: string) => void
): Entry[] | undefined {
  const entries: Entry[] = [];
  // console.log('--- Starting Fiction Parse ---'); // DEBUG
  const containerTableBody = document.querySelector<HTMLTableSectionElement>(
    Selector.FICTION_RESULTS_TABLE_SELECTOR
  );

   if (!containerTableBody) {
    const noResultsText = "Nothing found";
    if (document.body.textContent?.includes(noResultsText)) {
        // console.log('Fiction Parse: "Nothing found" text detected.'); // DEBUG
        return []; // No results found
    }
     // console.error('Fiction Parse Error: Table body not found with selector:', Selector.FICTION_RESULTS_TABLE_SELECTOR); // DEBUG
     if (throwError) {
       throwError(`Fiction container table body not found using selector: ${Selector.FICTION_RESULTS_TABLE_SELECTOR}`);
     }
     return undefined;
   }

  // Select rows directly inside the tbody
  const dataRows = Array.from(containerTableBody.querySelectorAll("tr"));
  // console.log(`Fiction Parse: Found ${dataRows.length} rows in tbody.`); // DEBUG

  for (let i = 0; i < dataRows.length; i++) {
    const element = dataRows[i];
    const cells = element.querySelectorAll("td");
    // console.log(`Fiction Parse: Row ${i}, Cell count: ${cells.length}`); // DEBUG

    // Expecting at least 6 cells based on the provided HTML (Author, Series, Title, Lang, File, Mirrors)
     if (cells.length < 6) {
        // console.warn(`Fiction Parse: Skipping row ${i} due to insufficient cells (${cells.length}).`); // DEBUG
        continue;
     }

     // Cell 0: Authors
     const authorElements = cells[0]?.querySelectorAll<HTMLAnchorElement>("ul.catalog_authors li a");
     const authors = authorElements && authorElements.length > 0
       ? Array.from(authorElements).map(a => a.textContent?.trim() ?? '').filter(Boolean).join(', ')
       : cells[0]?.textContent?.trim() || "Unknown Author"; // Fallback if no links found
     // console.log(`Fiction Parse: Row ${i}, Authors: ${authors}`); // DEBUG

     // Cell 1: Series
     const series = cells[1]?.textContent?.trim() || "";
     // console.log(`Fiction Parse: Row ${i}, Series: ${series}`); // DEBUG

     // Cell 2: Title and MD5/Mirror Link
     const titleElement = cells[2];
     const titleLinkElement = titleElement?.querySelector<HTMLAnchorElement>("a"); // Get the first link
     let title = titleLinkElement?.textContent?.trim() || titleElement?.textContent?.trim() || "";
     title = title.replace(/\[ed\.:.*?\]/g, '').trim(); // Clean title
     const mirror = titleLinkElement?.getAttribute("href") || ""; // This href contains the MD5 and is the link to details
     // console.log(`Fiction Parse: Row ${i}, Raw Title: ${titleElement?.textContent?.trim()}, Clean Title: ${title}, Mirror Link: ${mirror}`); // DEBUG

     // Extract MD5 from the mirror link
     let md5 = "";
     if (mirror) {
         // Regex assumes MD5 is the last part of the path
         const md5Match = mirror.match(/([a-fA-F0-9]{32})$/);
         if (md5Match) {
             md5 = md5Match[1].toLowerCase();
         }
     }
     // console.log(`Fiction Parse: Row ${i}, Extracted MD5: ${md5}`); // DEBUG

     // Cell 3: Language
     const language = cells[3]?.textContent?.trim() || "Unknown";
     // console.log(`Fiction Parse: Row ${i}, Language: ${language}`); // DEBUG

     // Cell 4: File Info (Type / Size)
     const fileInfoCell = cells[4];
     const fileInfoText = fileInfoCell?.textContent?.trim() || "";
     const fileParts = fileInfoText.split('/');
     const extension = fileParts[0]?.trim().toLowerCase() || "unknown";
     const size = fileParts[1]?.trim() || "0 Mb";
     // console.log(`Fiction Parse: Row ${i}, Extension: ${extension}, Size: ${size}`); // DEBUG

     // ID is the MD5
     const id = md5;

     // Validate essential fields: Need a title, a valid mirror link, AND the extracted MD5
     if (title && title !== "Untitled" && mirror && md5) {
        // console.log(`Fiction Parse: Row ${i} - VALID, pushing entry.`); // DEBUG
        entries.push({
          id: id,
          authors,
          title: series ? `${title} (${series})` : title,
          publisher: "",
          year: "",
          pages: "",
          language,
          size,
          extension,
          mirror,
        });
     } else {
        // console.warn(`Fiction Parse: Skipping row ${i} due to missing Title, Mirror, or MD5.`); // DEBUG
     }
  }

  // console.log('--- Finished Fiction Parse ---', entries); // DEBUG
  return entries;
}
// --- END: REVISED Fiction Parsing (v2 - More Robust) ---
