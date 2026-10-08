import { register } from "node:module";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", import.meta.url);
await import(pathToFileURL(path.join(HERE, "semantics-modscan.ts")).href);