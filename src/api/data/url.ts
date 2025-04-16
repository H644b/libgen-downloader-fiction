import Label from "../../labels";
import Selector from "../selectors"; // Imports the corrected selectors

// Parses the FINAL download page (like books.ms or Sci-Tech mirror pages)
// to find the main "GET" link and alternative links (IPFS, Tor).
export function parseDownloadUrls(
  document: Document,
  throwError?: (message: string) => void
): string[] | undefined {
  const urls: string[] = [];

  try {
    // Find the main 'GET' link using the selector for the final download page
    const mainDownloadUrlElement = document.querySelector<HTMLAnchorElement>(Selector.MAIN_DOWNLOAD_URL_SELECTOR);

    if (mainDownloadUrlElement) {
        const mainDownloadUrl = mainDownloadUrlElement.getAttribute("href");
        if (mainDownloadUrl) {
          // Often these links are relative on the download server, prepend protocol if missing
          // Simple check, might need refinement based on actual links found
          if (mainDownloadUrl.startsWith('//')) {
              // Assuming https is preferred over http if protocol is missing
              urls.push(`https:${mainDownloadUrl}`);
          } else if (!mainDownloadUrl.startsWith('http')) {
              // This case is less likely for the main GET link but handle defensively
              // We'd need the base URL of the *download page server* (e.g., https://download.books.ms) to resolve this correctly.
              // For now, we might skip it or log a warning if it's relative without //
              if (throwError) {
                //   throwError(`Warning: Main download URL is relative but protocol-less: ${mainDownloadUrl}. Cannot resolve.`);
              }
          } else {
            urls.push(mainDownloadUrl);
          }
        }
    } else {
      // Only trigger error/warning if NO other links are found either
    //   if (throwError) {
    //       console.warn(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Could not find main 'GET' link using selector: ${Selector.MAIN_DOWNLOAD_URL_SELECTOR}`);
    //   }
    }


    // Find alternative links (IPFS, Tor) using the selector for the final download page
    const otherDownloadUrlsContainerElement = document.querySelector(
      Selector.OTHER_DOWNLOAD_URLS_SELECTOR
    );

    if (otherDownloadUrlsContainerElement) {
         const otherDownloadUrlsElements = Array.from(otherDownloadUrlsContainerElement.querySelectorAll<HTMLAnchorElement>("li > a"));

        for (let i = 0; i < otherDownloadUrlsElements.length; i++) {
          const element = otherDownloadUrlsElements[i];
          const url = element?.getAttribute("href");
          // Exclude local gateway, ensure it's a valid URL (starts with http)
          if (url && url.startsWith('http') && !url.startsWith('http://localhost')) {
            urls.push(url);
          }
        }
    }

    // Return undefined only if NO links were found at all
    if (urls.length === 0) {
         if (throwError) {
             throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - No download links found on the final download page.`);
         }
         return undefined;
    }

    // Filter out potential duplicates just in case
    return [...new Set(urls)];

  } catch (e) {
    if (throwError) {
      throwError(`Error occurred while parsing download URLs: ${e instanceof Error ? e.message : String(e)}`);
    }
    return undefined;
  }
}


// Parses the FICTION DETAIL page (e.g., libgen.is/fiction/MD5...)
// to get the link to the FINAL download page (e.g., books.ms/fiction/MD5...)
export function parseFictionDetailPageForDownloadPageLink(
  document: Document,
  throwError?: (message: string) => void
): string | undefined {
    try {
        // Find the first link within the 'ul.record_mirrors' using the corrected selector
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
                throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Found link element for download page but 'href' attribute is missing.`);
            }
            return undefined;
        }

        // Ensure the link is absolute (it should be based on the example HTML)
        if (!downloadPageUrl.startsWith('http')) {
             if (throwError) {
                throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Parsed download page link is not absolute: ${downloadPageUrl}. Cannot proceed.`);
            }
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


// Finds the main "GET" download link on the FINAL download page.
// This function might be redundant now if parseDownloadUrls handles the GET link correctly,
// but kept for potential specific use cases or clarity.
export function findDownloadUrlFromMirror(
  document: Document, // Should be the document of the FINAL download page
  throwError?: (message: string) => void
): string | undefined { // Return type changed to string | undefined
  const downloadLinkElement = document.querySelector<HTMLAnchorElement>(Selector.MAIN_DOWNLOAD_URL_SELECTOR); // Uses the selector for the FINAL download page

  if (!downloadLinkElement) {
    if (throwError) {
       throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Could not find main 'GET' link using selector: ${Selector.MAIN_DOWNLOAD_URL_SELECTOR}`);
    }
    return undefined; // Return undefined instead of nothing
  }

  const downloadLink = downloadLinkElement.getAttribute("href");

  if (!downloadLink) {
     if (throwError) {
        throwError(`${Label.ERR_OCCURED_WHILE_PARSING_DOC} - Found 'GET' link element but 'href' attribute is missing.`);
     }
     return undefined;
  }

  // Handle potentially protocol-relative links from GET button
  if (downloadLink.startsWith('//')) {
      return `https:${downloadLink}`; // Assume https
  }
  // Assume absolute if it starts with http, otherwise return as is (might be relative, handle upstream if needed)
  return downloadLink;
}
