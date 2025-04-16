export default {
  // --- Sci-Tech Selectors ---
  SCITECH_RESULTS_TABLE_SELECTOR: ".c tbody",

  // --- Fiction Selectors ---
  FICTION_RESULTS_TABLE_SELECTOR: "table.catalog tbody",
  // CORRECTED Selector for the link(s) on the FICTION DETAIL page that lead to the DOWNLOAD page
  // Targets the first link inside the list with class 'record_mirrors'
  FICTION_DETAIL_DL_PAGE_LINK_SELECTOR: "ul.record_mirrors a", // Corrected selector

  // --- Download Page Selectors (Common to Sci-Tech and Fiction Download Pages like books.ms) ---
  MAIN_DOWNLOAD_URL_SELECTOR: "#download h2 a",
  OTHER_DOWNLOAD_URLS_SELECTOR: "#download ul",
};
