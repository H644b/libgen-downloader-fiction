import { Entry } from "../models/Entry"; // Keep the import here as it's used internally
import { SearchSection } from "../../tui/store/app";
import Selector from "../selectors";

export interface constructSearchURLParams {
  query: string;
  pageNumber: number;
  pageSize: number;
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
  pageSize,
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
    .replace("{pageSize}", pageSize.toString());

  if (applyColumnFilter && columnFilterQueryParamValue) {
    url += `&${columnFilterQueryParamKey}=${encodeURIComponent(columnFilterQueryParamValue)}`;
  }

  return url;
}

export function constructMD5SearchUrl(pattern: string, mirror: string, md5: string): string {
  if (!pattern) {
    console.warn("Warning: MD5 search pattern is missing in config.");
    pattern = "{mirror}/search.php?req={md5}&column=md5";
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

export function parseFictionEntries(
  document: Document,
  throwError?: (message: string) => void
): Entry[] | undefined {
  const entries: Entry[] = [];
  const containerTableBody = document.querySelector<HTMLTableSectionElement>(
    Selector.FICTION_RESULTS_TABLE_SELECTOR
  );

   if (!containerTableBody) {
    const noResultsText = "Nothing found";
    if (document.body.textContent?.includes(noResultsText)) {
        return [];
    }
     if (throwError) {
       throwError(`Fiction container table body not found using selector: ${Selector.FICTION_RESULTS_TABLE_SELECTOR}`);
     }
     return undefined;
   }

  const dataRows = Array.from(containerTableBody.querySelectorAll("tr")).filter(row => row.querySelector('td'));

  for (let i = 0; i < dataRows.length; i++) {
    const element = dataRows[i];
    const cells = element.querySelectorAll("td");

     if (cells.length < 5) {
        continue;
     }

     const authors = cells[0]?.textContent?.trim() || "Unknown Author";
     const series = cells[1]?.textContent?.trim() || "";
     const titleElement = cells[2];
     const title = titleElement?.textContent?.trim() || "Untitled";
     const language = cells[3]?.textContent?.trim() || "Unknown";

     const fileInfoCell = cells[4];
     const fileInfoText = fileInfoCell?.textContent?.trim() || "";

     const parts = fileInfoText.split('/');
     let extension = parts[0]?.trim().toLowerCase() || "unknown";
     let size = parts[1]?.trim() || "0 Mb";

     const mirrorLinkElement = fileInfoCell?.querySelector<HTMLAnchorElement>("a[href*='/fiction/']");
     let mirror = mirrorLinkElement?.getAttribute("href") || "";

     let md5 = "";
     const linksInCell = fileInfoCell?.querySelectorAll<HTMLAnchorElement>("a[href]") || [];
     for (const link of linksInCell) {
         const href = link.getAttribute("href");
         if (href?.includes("/main/") || href?.includes("md5=")) {
             const md5Match = href.match(/([a-fA-F0-9]{32})/i);
             if (md5Match) {
                 md5 = md5Match[1].toLowerCase();
                  if (!mirror) mirror = href;
                 break;
             }
         }
         if (/^[a-f0-9]{32}$/i.test(link.textContent?.trim() || '')) {
             md5 = link.textContent!.trim().toLowerCase();
              if (!mirror && href) mirror = href; // Assign href if mirror not found yet
             break;
         }
     }

     const id = md5 || `fiction-${Date.now()}-${i}`;

     if (title !== "Untitled" && mirror) {
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
     }
  }

  return entries;
}
