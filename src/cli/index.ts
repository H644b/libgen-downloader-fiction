// src/cli/index.ts
import meow from "meow";

// Remove the importMeta definition
// const importMeta = import.meta ?? { url: `file://${process.argv[1]}` }; // Basic fallback for CommonJS

export const cli = meow(
  `
	Usage
	  $ libgen-downloader <input>

	Options
    -s, --search <query>      Search for a book (default: Fiction section)
    --scitech                 Search in the Sci-Tech (non-fiction) section instead of Fiction
    -b, --bulk <MD5LIST.txt>  Start the app in bulk downloading mode (MD5 hashes from any section)
    -u, --url <MD5>           Get the download URL for a specific MD5 (from any section)
    -d, --download <MD5>      Download the file for a specific MD5 (from any section)
    -h, --help                Display help

	Examples
    $ libgen-downloader                 (Start in interactive Fiction search mode)
    $ libgen-downloader -s "Dune"       (Search Fiction for "Dune")
    $ libgen-downloader --scitech       (Start in interactive Sci-Tech search mode)
    $ libgen-downloader -s "Cosmos" --scitech (Search Sci-Tech for "Cosmos")
    $ libgen-downloader -b ./MD5_LIST_1695686580524.txt
    $ libgen-downloader -u 1234567890abcdef1234567890abcdef
    $ libgen-downloader -d 1234567890abcdef1234567890abcdef
`,
  {
    // Remove the importMeta property from options
    // importMeta: importMeta,
    flags: {
      search: {
        type: "string",
        alias: "s",
      },
      scitech: { // Added flag
        type: "boolean",
        default: false,
      },
      bulk: {
        type: "string",
        alias: "b",
      },
      url: {
        type: "string",
        alias: "u",
      },
      download: {
        type: "string",
        alias: "d",
      },
      help: {
        type: "boolean",
        alias: "h",
      },
    },
  }
);
