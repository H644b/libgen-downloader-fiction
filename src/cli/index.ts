import meow from "meow";

// Note: Using `importMeta` requires the project type to be "module" in package.json
// or specific setup for CommonJS. If it's CommonJS, remove importMeta.
const importMeta = import.meta ?? { url: `file://${process.argv[1]}` }; // Basic fallback for CommonJS


export const cli = meow(
  `
	Usage
	  $ libgen-downloader <input>

	Options
    -s, --search <query>      Search for a book (default: Fiction section)
    --scitech                 Search in the Sci-Tech (non-fiction) section instead of Fiction
    -b, --bulk <MD5LIST.txt>  Start the app in bulk downloading mode (MD5 hashes from any section)
    -u, --url <MD5>           Get the download URL (MD5 from any section)
    -d, --download <MD5>      Download the file (MD5 from any section)
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
    importMeta: importMeta, // Use the defined importMeta
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
    // It's generally good practice to allow unknown flags if your core logic doesn't strictly need them all defined
    // allowUnknownFlags: false, // Or true if you prefer flexibility
    // autoHelp: true, // Meow handles help automatically
    // autoVersion: true // Meow handles version automatically based on package.json
  }
);
