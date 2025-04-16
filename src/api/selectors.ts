export default {
  // --- Sci-Tech Selectors ---
  SCITECH_RESULTS_TABLE_SELECTOR: ".c tbody",

  // --- Fiction Selectors ---
  FICTION_RESULTS_TABLE_SELECTOR: "table.catalog tbody",
  // Selector for the link(s) on the FICTION DETAIL page that lead to the DOWNLOAD page (like books.ms)
  // It's within the 'Download:' row, inside a 'ul.record_mirrors > li > a'
  FICTION_DETAIL_DL_PAGE_LINK_SELECTOR: "td.record_mirrors a", // Gets the first link in the download mirrors list

  // --- Download Page Selectors (Common to Sci-Tech and Fiction Download Pages like books.ms) ---
  // Selector for the primary "GET" link on the final download page
  MAIN_DOWNLOAD_URL_SELECTOR: "#download h2 a", // The big GET button link
  // Selector for the container of alternative (IPFS, TOR) links on the final download page
  OTHER_DOWNLOAD_URLS_SELECTOR: "#download ul", // The list containing Cloudflare, IPFS.io etc.
};
