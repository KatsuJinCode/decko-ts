// The Uglifier(harmony) JavaScript compression engine — the port of the
// compression arm card-mod-script-0.20.0's script views run under
// compress_assets=true:
//
//   set/abstract/00_script.rb:25-27 try_compress:
//     `Uglifier.new(harmony: true).compile(input)`
//
// Uglifier (uglifier-4.2.1, the version the deck's Gemfile.lock pins) is an
// ExecJS harness around a VENDORED UglifyJS2 harmony-branch snapshot — no
// byte-compatible npm package exists (npm `uglify-js` is the 3.x line; the
// vendored build is the 2.x-line harmony branch whose mangle dictionary and
// output bytes differ). The engine is therefore VENDORED VERBATIM in
// `vendor/uglifier-4.2.1-uglify-harmony/` (see that directory's
// PROVENANCE-AND-LICENSE.md) and executed in a Node `vm` sandbox, the same
// five files in the same order uglifier.rb's `source_with` joins them:
// es5.js, split.js, source-map.js, uglify-harmony.js, uglifier.js.
//
// The option hash below is the one uglifier.rb builds for
// `Uglifier.new(harmony: true)` with no caller overrides, and it is what makes
// the emitted bytes match: mangle dictionaries and output formatting differ
// from every published npm build, so these exact defaults matter.
//
// Node-only: vm + fs imports keep this out of the browser/worker bundle —
// the engine's render surface never imports this module.

import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { uglifierOptionsFor } from "./uglify-harmony-options.js";
import { formatUglifierRawError, formatUglifierSyntaxError, type UglifierResult } from "./uglify-harmony-diagnostics.js";

/** The vendored snapshot directory name under the repo's vendor/. */
const VENDOR_DIR_NAME = "uglifier-4.2.1-uglify-harmony";

/** The five files, in uglifier.rb `source_with` order (the ExecJS context
 *  source is exactly these joined with "\n"). */
const SNAPSHOT_FILES = [
  "es5.js",
  "split.js",
  "source-map.js",
  "uglify-harmony.js",
  "uglifier.js",
] as const;

/** Walk up from this module's location (src/... in tests, dist/src/... in
 *  the built server) until the vendored snapshot directory exists. */
function locateSnapshotDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 8; up += 1) {
    const candidate = join(dir, "vendor", VENDOR_DIR_NAME);
    try {
      readFileSync(join(candidate, "uglify-harmony.js"));
      return candidate;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `vendored uglifier snapshot not found: no vendor/${VENDOR_DIR_NAME} ` +
      `on the ancestor path of ${import.meta.url}`,
  );
}

let sandbox: { uglifier: (options: unknown) => { code?: string; error?: unknown } } | undefined;

/** The compiled ExecJS-equivalent context (once per process; the compile is
 *  ~360KB of JS and the snapshot is deterministic). */
function uglifierSandbox(): ReturnType<typeof loadSandbox> {
  if (sandbox === undefined) sandbox = loadSandbox();
  return sandbox;
}

function loadSandbox() {
  const snapshotDir = locateSnapshotDir();
  const source = SNAPSHOT_FILES.map((f) => readFileSync(join(snapshotDir, f), "utf8")).join("\n");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const callable = (context as { uglifier?: unknown }).uglifier;
  if (typeof callable !== "function") {
    throw new Error(
      `vendored uglifier snapshot did not define uglifier() (${snapshotDir})`,
    );
  }
  return { uglifier: callable as (options: unknown) => { code?: string; error?: unknown } };
}

/** Uglifier.new(harmony: true).compile(input) — 00_script.rb:25-27's
 *  try_compress body. Throws Error (the caller shapes compression_error_message,
 *  00_script.rb:29-37) when uglify reports a parse/compress error. */
export function uglifyHarmonyCompile(source: string): string {
  const result = uglifierSandbox().uglifier(uglifierOptionsFor(source)) as {
    code?: string;
    error?: { message?: string } | string;
  };
  if (result && typeof result === "object" && "error" in result && result.error !== undefined) {
    const message =
      typeof result.error === "string"
        ? result.error
        : (result.error.message ?? JSON.stringify(result.error));
    throw new Error(`uglify-harmony compile failed: ${message}`);
  }
  const code = result?.code;
  if (typeof code !== "string") {
    throw new Error("uglify-harmony compile returned no code");
  }
  return code;
}

/** Save validation uses the same actual parser and the shared stock formatter. */
export function uglifyHarmonySyntaxError(source: string): string | undefined {
  return formatUglifierSyntaxError(uglifierSandbox().uglifier(uglifierOptionsFor(source)) as UglifierResult, source);
}

/** The same parse, reported the way card-mod-script's js :compressed view
 *  reads it: 00_script.rb:32-38 compression_error_message interpolates
 *  `e.message` RAW, escapes and all, so a host compressor that raises this
 *  string reproduces Ruby's "JavaScript::SyntaxError (<name>): ..." bytes.
 *  The save-validate spelling (ansi2html spans) is
 *  uglifyHarmonySyntaxError above. */
export function uglifyHarmonyRawError(source: string): string | undefined {
  return formatUglifierRawError(uglifierSandbox().uglifier(uglifierOptionsFor(source)) as UglifierResult, source);
}
