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
// `vendor/uglifier-uglifier-4.2.1/` (see that directory's
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

// uglifier-4.2.1 lib/uglifier.rb DEFAULTS, projected through run_uglifyjs's
// option hash for `Uglifier.new(harmony: true)` with no overrides:
// - output_options: DEFAULTS[:output] + comments: :copyright encoded as
//   encode_regexp(/(^!)|Copyright/i) = ["(^!)|Copyright", "i"] (the JS
//   wrapper builds the RegExp) + quote_style: 0.
// - compressor_options: DEFAULTS[:compress] + global_defs: {} + keep_fnames:
//   false (negate_iife_block is empty — wrap_iife is false).
// - mangle_options: DEFAULTS[:mangle] + keep_fnames: false + properties:
//   false (MANGLE_PROPERTIES_DEFAULTS under conditional_option(false)).
// - parse_options: DEFAULTS[:parse] (no source-map filename merge).
// - source_map_options: SOURCE_MAP_DEFAULTS projected (source_map: false).
// - ie8: DEFAULTS[:ie8] = true.
const COMPRESS_DEFAULTS = {
  sequences: true,
  properties: true,
  dead_code: true,
  drop_debugger: true,
  unsafe: false,
  unsafe_comps: false,
  unsafe_math: false,
  unsafe_proto: false,
  conditionals: true,
  comparisons: true,
  evaluate: true,
  booleans: true,
  loops: true,
  unused: true,
  toplevel: false,
  top_retain: [] as string[],
  hoist_funs: true,
  hoist_vars: false,
  if_return: true,
  join_vars: true,
  collapse_vars: true,
  reduce_funcs: false,
  reduce_vars: false,
  negate_iife: true,
  pure_getters: false,
  pure_funcs: null,
  drop_console: false,
  keep_fargs: false,
  keep_fnames: false,
  passes: 1,
  keep_infinity: false,
  side_effects: true,
  switches: true,
};

/** The exact option hash run_uglifyjs builds (uglifier.rb:208-222), as JSON
 *  (ExecJS serializes the same shape; arrays stay arrays so the wrapper's
 *  comments() builds the RegExp). */
function uglifierOptionsFor(source: string) {
  return {
    source,
    output: {
      ascii_only: true,
      comments: ["(^!)|Copyright", "i"],
      inline_script: false,
      quote_keys: false,
      max_line_len: 32 * 1024,
      bracketize: false,
      semicolons: true,
      preserve_line: false,
      beautify: false,
      indent_level: 4,
      indent_start: 0,
      width: 80,
      preamble: null,
      wrap_iife: false,
      shebang: true,
      quote_style: 0,
      keep_quoted_props: false,
    },
    compress: { ...COMPRESS_DEFAULTS, global_defs: {}, keep_fnames: false },
    mangle: {
      eval: false,
      reserved: ["$super"],
      properties: false,
      toplevel: false,
      keep_fnames: false,
    },
    parse: {
      bare_returns: false,
      expression: false,
      html5_comments: true,
      shebang: true,
      strict: false,
    },
    sourceMap: {
      input: null,
      filename: null,
      root: null,
      content: null,
      url: false,
      includeSources: false,
    },
    ie8: true,
  };
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
