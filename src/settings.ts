import https from "https";

export const SCREEN_BASE_APP_WIDTH = 80;
export const SCREEN_PADDING = 5;
export const SCREEN_WIDTH_PERC = 95;

export const CONFIGURATION_URL =
  "https://raw.githubusercontent.com/H644b/libgen-downloader-fiction/refs/heads/configuration/config.json";

export const FAIL_REQ_ATTEMPT_COUNT = 5;
export const FAIL_REQ_ATTEMPT_DELAY_MS = 2000;

export const SEARCH_PAGE_SIZE = 25; // <-- Make sure this is exported

// https agent to bypass SSL rejection
export const httpAgent = new https.Agent({
  rejectUnauthorized: false,
});
