import { Entry } from "../models/Entry";
import { SearchSection } from "../../tui/store/app"; // Import SearchSection type
import Selector from "../selectors";

export interface constructSearchURLParams {
  query: string;
  pageNumber: number;
  pageSize: number;
  mirror: string;
  searchReqPattern: string;
  fictionSearchReqPattern: string; // Added
  searchSection: SearchSection; // Added
  columnFilterQueryParamKey: string;
  columnFilterQueryParamValue: string | null;
}

export function constructSearchURL({
  query,
  pageNumber,
  pageSize,
  mirror,
  searchReqPattern,
  fictionSearchReqPattern, // Added
  searchSection, // Added
  columnFilterQueryParamKey,
  columnFilterQueryParamValue,
}: constructSearchURLParams): string {

  let patternToUse: string;
  let applyColumnFilter = false;
  const encodedQuery = encodeURIComponent(query); // URL-encode the query

  if (searchSection === 'fiction') {
    patternToUse = fictionSearchReqPattern;
    // Basic fiction pattern: {mirror}/fiction/?q={query}
    // Advanced might have &page=... etc. Assuming basic for now.
    // We will replace query and mirror only.
    let url = patternToUse
      .replace("{mirror}", mirror)
      .replace("{query}", encodedQuery); // Use encoded query
      // Add pagination if fiction supports it similarly? Example:
      // The fiction search seems to use 'page' query param starting from 1
      if (pageNumber > 1) url += `&page=${pageNumber}`;
      // Note: Fiction might not support pageSize parameter.
    return url;

  } else { // scitech
    patternToUse = searchReqPattern;
    applyColumnFilter = true; // Apply column filters only for Sci-Tech
  }

  let url = patternToUse
    .replace("{mirror}", mirror)
    .replace("{query}", encodedQuery) // Use encoded query
    .replace("{pageNumber}", pageNumber.toString())
    .replace("{pageSize}", pageSize.toString());

  if (applyColumnFilter && columnFilterQueryParamValue) {
    // Encode filter value as well, just in case
    url += `&${columnFilterQueryParamKey}=${encodeURIComponent(columnFilterQueryParamValue)}`;
  }

  return url;
}

// Assuming MD5 search works the same for both for now - usually redirects to the correct book page
export function constructMD5SearchUrl(pattern: string, mirror: string, md5: string): string {
  if (!pattern) {
    console.warn("Warning: MD5 search pattern is missing in config.");
    // Provide a sensible default fallback if possible
    pattern = "{mirror}/search.php?req={md5}&column=md5";
  }
  return pattern.replace("{mirror}", mirror).replace("{md5}", md5);
}

// Assuming MD5 lookup works the same for both for now
export function constructFindMD5SearchUrl(
  pattern: string,
  mirror: string,
  idList: string[]
): string {
   if (!pattern) {
    console.warn("Warning: Find MD5 by ID pattern is missing in config.");
    // Provide a sensible default fallback if possible
    pattern = "{mirror}/json.php?ids={id}&fields=md5";
  }
  return pattern.replace("{mirror}", mirror).replace("{id}", idList.join(","));
}

// --- Sci-Tech Parsing (Original) ---
export function parseSciTechEntries(
  document: Document,
  throwError?: (message: string) => void
): Entry[] | undefined {
  const entries: Entry[] = [];
  // Use the specific selector for Sci-Tech results table body
  const containerTableBody = document.querySelector<HTMLTableSectionElement>(
    Selector.SCITECH_RESULTS_TABLE_SELECTOR // Use the specific selector
  );

  if (!containerTableBody) {
    // Check if it's the "no results" page for Sci-Tech
    // LibGen often uses specific text or classes for no results. This needs checking.
    const noResultsText = "No files were found"; // Example text
    if (document.body.textContent?.includes(noResultsText)) {
        return []; // Return empty array for no results
    }
    // If table not found and not a 'no results' page, it's an error
    if (throwError) {
      throwError(`Sci-Tech container table body not found using selector: ${Selector.SCITECH_RESULTS_TABLE_SELECTOR}`);
    }
    return undefined; // Indicate parsing failure
  }

  // Select all 'tr' elements directly within the tbody
  const entryElements = Array.from(containerTableBody.querySelectorAll("tr"));

  // Skip header row if it exists within tbody (some HTML structures might do this)
  // A more robust way is to check cell content or tag type (e.g., ignore 'th')
  const dataRows = entryElements.filter(row => row.querySelector('td')); // Only process rows with 'td' cells

  for (let i = 0; i < dataRows.length; i++) {
    const element = dataRows[i];
    const cells = element.querySelectorAll("td"); // Get cells within the current row

    // Validate number of cells if structure is consistent (usually 10 for Sci-Tech default view)
    if (cells.length < 10) {
        // Log skipped row for debugging?
        // console.warn(`Skipping Sci-Tech row ${i + 1} due to unexpected cell count: ${cells.length}`);
        continue;
    }

    const id = cells[0]?.textContent?.trim() || "";
    const authors = cells[1]?.textContent?.trim() || "";
    // Title is complex, might contain links and spans - prioritize link text
    const titleElement = cells[2];
    let title = "";
    const titleLink = titleElement?.querySelector<HTMLAnchorElement>('a[id]'); // Often has an ID like 'detailsL...'
    if (titleLink) {
      title = titleLink.textContent?.trim() || titleElement?.textContent?.trim() || "";
    } else {
      // Fallback if no specific link found
      title = titleElement?.textContent?.trim() || "";
    }

    const publisher = cells[3]?.textContent?.trim() || "";
    const year = cells[4]?.textContent?.trim() || "";
    const pages = cells[5]?.textContent?.trim() || ""; // Can be 'x+y', handle as string
    const language = cells[6]?.textContent?.trim() || "";
    const size = cells[7]?.textContent?.trim() || ""; // Includes units like 'Mb'
    const extension = cells[8]?.textContent?.trim() || "";
    // Mirror link is usually the first 'a' href in the 10th cell (index 9)
    const mirror = cells[9]?.querySelector<HTMLAnchorElement>("a")?.getAttribute("href") || "";

    if (id && title && mirror) { // Basic validation: require ID, title, and a mirror link
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
          mirror, // This is the link to the details/download page
        });
    } else {
         // Log skipped row due to missing critical info?
         // console.warn(`Skipping Sci-Tech row ${i + 1} due to missing ID, title, or mirror.`);
    }
  }

  return entries;
}


// --- START: New Fiction Parsing ---
export function parseFictionEntries(
  document: Document,
  throwError?: (message: string) => void
): Entry[] | undefined {
  const entries: Entry[] = [];
  // Use the specific selector for Fiction results table body
  const containerTableBody = document.querySelector<HTMLTableSectionElement>(
    Selector.FICTION_RESULTS_TABLE_SELECTOR // Use the specific selector
  );

   if (!containerTableBody) {
    // Check if it's the "no results" page for Fiction
    const noResultsText = "Nothing found"; // Common text on fiction search
    if (document.body.textContent?.includes(noResultsText)) {
        return []; // Return empty array for no results
    }
    if (throwError) {
      throwError(`Fiction container table body not found using selector: ${Selector.FICTION_RESULTS_TABLE_SELECTOR}`);
    }
    return undefined; // Indicate parsing failure
   }

  // Select all 'tr' elements directly within the tbody
  const entryElements = Array.from(containerTableBody.querySelectorAll("tr"));
  const dataRows = entryElements.filter(row => row.querySelector('td')); // Only process rows with 'td' cells

  for (let i = 0; i < dataRows.length; i++) {
    const element = dataRows[i];
    const cells = element.querySelectorAll("td");

    // Expected Fiction table structure (verify this!):
    // 0: Author(s) | 1: Series | 2: Title | 3: Language | 4: File (Type/Size/MirrorLinks)
    // Sometimes an extra column for cover image might appear first. Adjust indices if needed.
    // Check cell count for robustness
     if (cells.length < 5) {
        // console.warn(`Skipping Fiction row ${i + 1} due to unexpected cell count: ${cells.length}`);
        continue;
     }

     const authors = cells[0]?.textContent?.trim() || "Unknown Author";
     const series = cells[1]?.textContent?.trim() || ""; // Might be empty
     const titleElement = cells[2]; // Title cell might contain links etc.
     const title = titleElement?.textContent?.trim() || "Untitled";
     const language = cells[3]?.textContent?.trim() || "Unknown";

     // Cell 4 often contains multiple pieces of info and links
     const fileInfoCell = cells[4];
     const fileInfoText = fileInfoCell?.textContent?.trim() || ""; // e.g., "epub / 1.4 Mb / libgen.rs"

     // Extract extension and size (requires parsing fileInfoText)
     const parts = fileInfoText.split('/');
     let extension = parts[0]?.trim().toLowerCase() || "unknown";
     let size = parts[1]?.trim() || "0 Mb";

     // Find the main download page link (usually the first one, pointing to details)
     const mirrorLinkElement = fileInfoCell?.querySelector<HTMLAnchorElement>("a[href*='/fiction/']"); // Look for link containing '/fiction/'
     let mirror = mirrorLinkElement?.getAttribute("href") || "";

     // Extract MD5 (often part of a mirror link or a separate link)
     let md5 = "";
     const linksInCell = fileInfoCell?.querySelectorAll<HTMLAnchorElement>("a[href]") || [];
     for (const link of linksInCell) {
         const href = link.getAttribute("href");
         // Common patterns for MD5 links in fiction listings
         if (href?.includes("/main/") || href?.includes("md5=")) {
             const md5Match = href.match(/([a-fA-F0-9]{32})/i); // Case-insensitive match
             if (md5Match) {
                 md5 = md5Match[1].toLowerCase(); // Store lowercase MD5
                 // If the main mirror link wasn't found yet, this might be it
                  if (!mirror) mirror = href;
                 break; // Found MD5, no need to check other links in this cell
             }
         }
         // Sometimes the MD5 is the text content of a link
         if (/^[a-f0-9]{32}$/i.test(link.textContent?.trim() || '')) {
             md5 = link.textContent!.trim().toLowerCase();
              if (!mirror) mirror = href!; // Assume this link is the mirror if primary wasn't found
             break;
         }
     }

     // Use MD5 as the ID if found, otherwise generate a fallback
     // Fallback ID is less reliable, but necessary if MD5 isn't present
     const id = md5 || `fiction-${Date.now()}-${i}`; // Slightly more unique fallback

     // Basic validation: need a title and a mirror link to proceed
     if (title !== "Untitled" && mirror) {
        entries.push({
          id: id,
          authors,
          // Append series to title if it exists
          title: series ? `${title} (${series})` : title,
          publisher: "", // Not typically available
          year: "",      // Not typically available
          pages: "",     // Not typically available
          language,
          size,
          extension,
          mirror, // This is the link to the details/download page
        });
     } else {
        // console.warn(`Skipping Fiction row ${i + 1} due to missing title or mirror link.`);
     }
  }

  return entries;
}
// --- END: New Fiction Parsing ---
