import { SearchSection } from "../../tui/store/app"; // Import SearchSection if needed elsewhere, maybe not here
import Label from "../../labels";
import Selector from "../selectors";

// Existing function - parses the FINAL download page (like books.ms)
export function parseDownloadUrls(
  document: Document,
  throwError?: (message: string) => void
): string[] | undefined {
  const urls: string[] = [];

  try {
    // Find the main 'GET' link
    const mainDownloadUrlElement = document.querySelector<HTMLAnchorElement>(Selector.MAIN_DOWNLOAD_URL_SELECTOR);

    if (!mainDownloadUrlElement) {
      // Don't throw error immediately, maybe only IPFS/Tor links exist
      if (throwError) {
           // Be more specific about the error
           throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Could not find main 'GET' link using selector: ${Selector.MAIN_DOWNLOAD_URL_SELECTOR}`);
      }
      // return undefined; // Allow checking for other links even if GET is missing
    } else {
        const mainDownloadUrl = mainDownloadUrlElement.getAttribute("href");
        if (mainDownloadUrl) {
          urls.push(mainDownloadUrl);
        }
    }


    // Find alternative links (IPFS, Tor)
    const otherDownloadUrlsContainerElement = document.querySelector(
      Selector.OTHER_DOWNLOAD_URLS_SELECTOR
    );

    if (otherDownloadUrlsContainerElement) {
         const otherDownloadUrlsElements = Array.from(otherDownloadUrlsContainerElement.querySelectorAll<HTMLAnchorElement>("li > a")); // More specific selector

        for (let i = 0; i < otherDownloadUrlsElements.length; i++) {
          const element = otherDownloadUrlsElements[i];
          const url = element?.getAttribute("href");
          // Avoid adding the 'local gateway' link if present
          if (url && !url.startsWith('http://localhost')) {
            urls.push(url);
          }
        }
    } else {
        // Log if needed, but don't error out if only GET link exists
        // if (throwError) {
        //   throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Could not find alternative download links container using selector: ${Selector.OTHER_DOWNLOAD_URLS_SELECTOR}`);
        // }
    }

    // Return undefined only if NO links were found at all
    if (urls.length === 0) {
         if (throwError) {
             throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - No download links found on the page.`);
         }
         return undefined;
    }

    return urls;
  } catch (e) {
    if (throwError) {
      throwError(`Error occurred while parsing download URLs: ${e instanceof Error ? e.message : String(e)}`);
    }
    return undefined;
  }
}

// --- NEW FUNCTION ---
// Parses the FICTION DETAIL page to get the link to the FINAL download page
export function parseFictionDetailPageForDownloadPageLink(
  document: Document,
  throwError?: (message: string) => void
): string | undefined {
    try {
        // Find the first link within the 'Download:' section's mirrors list
        const downloadPageLinkElement = document.querySelector<HTMLAnchorElement>(Selector.FICTION_DETAIL_DL_PAGE_LINK_SELECTOR);

        if (!downloadPageLinkElement) {
            if (throwError) {
                throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Could not find link to download page on fiction detail page using selector: ${Selector.FICTION_DETAIL_DL_PAGE_LINK_SELECTOR}`);
            }
            return undefined;
        }

        const downloadPageUrl = downloadPageLinkElement.getAttribute("href");

        if (!downloadPageUrl) {
             if (throwError) {
                throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Found link element but 'href' attribute is missing.`);
            }
            return undefined;
        }

        // Ensure the link is absolute (it should be based on the example)
        if (!downloadPageUrl.startsWith('http')) {
             if (throwError) {
                throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Parsed download page link is not absolute: ${downloadPageUrl}`);
            }
            // Potentially try to resolve it against a base URL if needed, but likely an error
            return undefined;
        }

        return downloadPageUrl;

    } catch (e) {
        if (throwError) {
          throwError(`Error occurred while parsing fiction detail page for download link: ${e instanceof Error ? e.message : String(e)}`);
        }
        return undefined;
    }
}
// --- END NEW FUNCTION ---


// Kept for potential future use or Sci-Tech MD5 direct links? Unlikely needed now.
export function findDownloadUrlFromMirror(
  document: Document,
  throwError?: (message: string) => void
) {
  const downloadLinkElement = document.querySelector<HTMLAnchorElement>(Selector.MAIN_DOWNLOAD_URL_SELECTOR); // Uses the selector for the FINAL download page

  if (!downloadLinkElement) {
    if (throwError) {
      // throwError("downloadLinkElement is undefined"); // Original less specific message
       throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Could not find main 'GET' link using selector: ${Selector.MAIN_DOWNLOAD_URL_SELECTOR}`);
    }
    return undefined; // Return undefined instead of nothing
  }

  const downloadLink = downloadLinkElement.getAttribute("href");
  // Add check if link is null/empty
  if (!downloadLink) {
     if (throwError) {
        throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Found 'GET' link element but 'href' attribute is missing.`);
     }
     return undefined;
  }
  return downloadLink;
}
