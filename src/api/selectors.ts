export default {
  // --- Sci-Tech Selectors ---
  // Selector for the main table body containing Sci-Tech search results
  SCITECH_RESULTS_TABLE_SELECTOR: ".c tbody", // Assumes results are in <tbody> within a table with class 'c'

  // --- Fiction Selectors ---
  // Selector for the main table body containing Fiction search results
  // Often fiction results are in a table with class 'catalog'
  FICTION_RESULTS_TABLE_SELECTOR: "table.catalog tbody", // Verify this selector against the actual fiction page HTML

  // --- Download Page Selectors (Potentially Common) ---
  // These selectors are typically used on the *details* page accessed via the mirror link from search results.
  // They might be consistent across Sci-Tech and Fiction detail pages, but verification is recommended.
  // Selector for the primary download link (often within an H2 under #download div)
  MAIN_DOWNLOAD_URL_SELECTOR: "#info #download h2 a",
  // Selector for the container (usually a UL) of alternative download links
  OTHER_DOWNLOAD_URLS_SELECTOR: "#info #download ul",
};
