// build-changed.mjs -- transpile src/**/*.ts files newer than their dist/
// counterpart with esbuild (no type check; `tsc --noEmit` is the type gate).
// The harness drives import from dist/, so this keeps a run on current
// sources without a full project build.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(root, "src");
const changed = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
      const out = join(root, "dist", "src", relative(src, p)).replace(/\.ts$/, ".js");
      if (!existsSync(out) || statSync(out).mtimeMs < statSync(p).mtimeMs) changed.push([p, out]);
    }
  }
};
walk(src);
for (const [inFile, outFile] of changed) {
  buildSync({ entryPoints: [inFile], outfile: outFile, format: "esm", platform: "node", logLevel: "warning" });
  console.log("built", relative(root, inFile));
}
console.log(`${changed.length} file(s) transpiled`);
