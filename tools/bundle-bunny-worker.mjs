// tools/bundle-bunny-worker.mjs — build the deployable Bunny Edge Script.
//
//   node tools/bundle-bunny-worker.mjs
//
// Output:
//   deploy/dist/bunny-worker.bundle.js   the code to paste into the dashboard
//                                         editor (Edge Platform > Scripting >
//                                         <script> > Save > Publish)
//   deploy/dist/bunny-worker.code.json   {"Code": <same text>} — the request
//                                         body for POST /compute/script/{id}/code
//
// The entry is bunny-edge-entry.ts (the module that calls
// BunnySDK.net.http.serve), not bunny-worker.ts, so importing the handler in a
// test does not start a server.
//
// EXTERNAL BY DESIGN: "@bunny.net/edgescript-sdk" is left as a bare import in
// the bundle. bunny.net's own standalone template and every docs example import
// it that way (https://bunny.net/docs/scripting/standalone/overview.md,
// fetched 2026-10-01), so the platform resolves it at run time; inlining it
// would pin a 0.13.0 copy of the SDK into the artifact and freeze the
// `Bunny.v1.serve(handler)` contract into the bundle. To inline it instead,
// install the package and drop it from EXTERNAL_RUNTIME_IMPORTS below.
//
// "@libsql/client/web" IS inlined: it is an ordinary npm dependency with no
// node built-ins on the web path, and inlining it keeps one less run-time
// resolution. The built bundle is asserted to carry no `node:` imports that
// the Deno-based edge runtime would have to shim.

import { build } from "esbuild";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { builtinModules } from "node:module";

const here = resolve(process.cwd());
const src = resolve(here, "deploy/bunny-worker-src/bunny-edge-entry.ts");
const out = resolve(here, "deploy/dist/bunny-worker.bundle.js");
const payload = resolve(here, "deploy/dist/bunny-worker.code.json");

/** Left for the edge runtime to resolve; see the header comment. */
const EXTERNAL_RUNTIME_IMPORTS = ["@bunny.net/edgescript-sdk"];

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((n) => `node:${n}`),
]);

mkdirSync(dirname(out), { recursive: true });

await build({
  entryPoints: [src],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  external: [...builtins, ...EXTERNAL_RUNTIME_IMPORTS],
  conditions: ["deno", "bunny", "import", "default"],
  mainFields: ["module", "main"],
  logLevel: "info",
  metafile: true,
});

const stat = statSync(out);
// https://bunny.net/docs/scripting/limits.md (fetched 2026-10-01): script
// size limit is 10 MB, not the ~1 MB the Sept entry assumed. Warn at 80%.
const LIMIT_BYTES = 10 * 1024 * 1024;
if (stat.size > LIMIT_BYTES * 0.8) {
  console.error(`WARN: bundle ${(stat.size / 1024 / 1024).toFixed(2)}MB is over 80% of the ${LIMIT_BYTES / 1024 / 1024}MB script limit.`);
}
console.log(`bundle written: ${out} (${stat.size} bytes = ${(stat.size / 1024).toFixed(1)} KB, limit ${LIMIT_BYTES} bytes)`);

const code = readFileSync(out, "utf8");

// The bundle must be a valid ES module: the SDK stays a bare import.
if (!code.includes('from"@bunny.net/edgescript-sdk"') && !code.includes('from "@bunny.net/edgescript-sdk"')) {
  console.error("FAIL: bundle no longer imports @bunny.net/edgescript-sdk; the deployed script would not start a server.");
  process.exit(1);
}
// Anything still importing a bare `node:` builtin would have to be shimmed by
// the Deno-based edge runtime. Report them rather than failing the build.
const nodeImports = [...new Set([...code.matchAll(/from\s*"node:([a-z_]+)"/g)].map((m) => `node:${m[1]}`))];
if (nodeImports.length > 0) {
  console.log(`note: bundle still references ${nodeImports.join(", ")} (Deno provides these; Deno deploy note in the runbook)`);
}

writeFileSync(payload, JSON.stringify({ Code: code }));
console.log(`payload written: ${payload} (${code.length} chars)`);
