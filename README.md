# libgen-downloader

[![npm version](https://badge.fury.io/js/libgen-downloader.svg)](https://badge.fury.io/js/libgen-downloader)

---

`libgen-downloader` is a simple command line tool to search and download ebooks from Library Genesis (LibGen). It is developed using `NodeJS`, `TypeScript`, `React`, `Ink` and `Zustand`. It does not use a search API. It accesses the web pages like a web browser, parses the HTML response and shows the appropriate output to the user. Depending on the status of LibGen servers, you might get a connection error while you are searching, downloading or loading new pages.

**By default, it searches the LibGen Fiction section.** Use the `--scitech` flag to search the Sci-Tech (non-fiction) section.

https://github.com/obsfx/libgen-downloader/assets/13767783/8b8a923b-2a34-4ec4-89f8-f671c2bc0dc4

https://github.com/obsfx/libgen-downloader/assets/13767783/96a56146-18b3-49af-a50a-b088365e73d5

# Installation

If you have already installed `NodeJS` and `npm`, you can install it using `npm`:

```bash
npm i -g libgen-downloader
