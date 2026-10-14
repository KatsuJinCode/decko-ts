// Loads tools/ruby-mods/port-run.ts from source through the repository's own
// TypeScript loader (as the reference-harness adapters do).
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, "../oracle/typescript-source-loader.mjs")).href, import.meta.url);
await import(pathToFileURL(path.join(here, "port-run.ts")).href);
