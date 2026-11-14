import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Loads the TypeScript engine from source through the repository's own loader.
const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, "../../../tools/oracle/typescript-source-loader.mjs")).href, import.meta.url);
await import(pathToFileURL(path.join(here, "adapter.ts")).href);
