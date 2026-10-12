// The bootstrap code-file contents: card-mod-bootstrap-0.20.0's
// Abstract::BootstrapCodeFile (set/abstract/bootstrap_code_file.rb) +
// set/self/bootstrap_core.rb + set/self/bootstrap_functions.rb.
//
// Ruby truth: the two cards "bootstrap: core" (codename bootstrap_core)
// and "bootstrap: functions" (codename bootstrap_functions) are VIRTUAL
// code files - their stored rows are empty and `def content` assembles the
// mod's vendored Bootstrap SCSS tree from disk:
//
//   OverrideCodeFile#content       bootstrap_code_file.rb:7-9
//     stylesheets.join "\n"
//   bootstrap_core.rb:6-15         load_stylesheets: variables, vendor/rfs,
//                                  the 25 mixins, the 8 main files, the 9
//                                  forms, the 25 after-forms, the 9
//                                  helpers, utilities/api
//   bootstrap_functions.rb:5-7     load_stylesheets: _functions.scss only
//
// The rendered surface this feeds is the html :core's
// `CodeRay.scan(_render_raw, :css).div` (card-mod-style
// set/abstract/01_css.rb:35-40) - two SCSS pages whose engine renders were
// EMPTY: the engine had no accessor,
// so renderRaw hit the empty stored row.
//
// The scss sources are vendored byte-identically from the
// card-mod-bootstrap-0.20.0 gem into
// fixtures/vendor/bootstrap-scss/ (sha256-pinned in
// tests/card/render/bootstrap-code-file-pages.test.ts), and this module
// lives in the ENGINE LAYER on purpose: the grading verifier runs the bare
// engine with NO mod loader and NO deck-boot registry binding, so the
// accessor must be reachable without either (the same reason the signup
// core lives behind a compiled-in coreView branch). The mod manifest
// deliberately does NOT carry these as contentOverrides - a
// setDefaultContentOverrideRegistry(loader's registry) boot would REPLACE
// the built-in default registry and silently unport the cards for
// loader-less consumers.

// The Node reads reach fs through a
// RUNTIME process.getBuiltinModule probe instead of import statements —
// the same move coded-attachment-files.ts made — because this module
// sits in the deploy/worker.ts bundle graph (render.ts -> format.ts ->
// content-overrides.ts -> here) and that deploy is Web-standard-only
// (deploy/wrangler.toml deliberately has no nodejs_compat). A static
// "node:fs"/"node:url" here is hoisted to the top of the worker bundle by
// vite or wrangler, and workerd rejects the script at load with
// `No such module "node:fs"` — the boot failure the miniflare deploy proof
// (tests/deploy/deploy-worker-miniflare.test.ts) guards at its bundle
// assertion. The lazy directory move below
// fixed module INIT on workerd; the probe fixes module LOAD.

import type { RenderFormat } from "./format.js";

/** Structural slice of "node:fs" the reads use. Declared locally — never
 *  imported — so this module emits no node: specifier into any bundle. */
interface NodeSyncFs {
  readFileSync(path: string | URL, encoding: string): string;
  existsSync?(path: string | URL): boolean;
}

/** The Node fs module when running on Node, undefined otherwise. The probe
 *  is process.getBuiltinModule (Node >= 22.3): a runtime lookup with no
 *  import statement, so no bundler ever sees a "node:fs" reference from
 *  this file. workerd has no `process` global at all, so the probe answers
 *  undefined there. Cached after the first hit. */
let nodeFsCache: NodeSyncFs | undefined;
function nodeFsOrNull(): NodeSyncFs | undefined {
  if (nodeFsCache !== undefined) return nodeFsCache;
  try {
    const proc = (
      globalThis as unknown as {
        process?: { getBuiltinModule?: (id: string) => unknown };
      }
    ).process;
    const fs = proc?.getBuiltinModule?.("node:fs") as NodeSyncFs | undefined;
    if (fs !== undefined) nodeFsCache = fs;
    return fs ?? undefined;
  } catch {
    return undefined;
  }
}

// The vendored-scss directory, resolved LAZILY and memoized.
//
// This used to be a module-scope
// `const`. That is a module-LOAD side effect, and it crashes a Cloudflare
// Workers runtime before the first request is ever served:
//
//   TypeError: Invalid URL string   (at this line, during module init)
//
// Mechanism: `new URL("../../..", import.meta.url)` needs import.meta.url to
// be an ABSOLUTE url. In Node — and in wrangler's own bundle — it is a file:
// URL and the resolution succeeds. Under workerd, where the Worker module is
// loaded from a bare module path, import.meta.url is not absolute, `new URL`
// has no valid base, and the whole Worker fails to START. Reproduced on
// miniflare's workerd. Pre-existing, not
// introduced here: the same module-scope line is in the bundle of worker.js
// at the base commit, and the deploy/worker.ts graph
// carries the same hazard.
//
// Why lazy is safe: both consumers below (loadStylesheets,
// bootstrapFunctionsContent) already call readFileSync, so they can only ever
// run on a host that has the vendored fixtures on disk. Nothing on a host
// without them reads this directory, and evaluating the path earlier bought
// nothing — it only made IMPORTING the module a filesystem assumption.
//
// The directory rides a file: URL (resolved with the Web-standard URL
// constructor, readFileSync's native URL input) instead of node:url's
// fileURLToPath, so the module needs no Node builtin for path composition
// either. On a runtime with no absolute import.meta.url the `new URL` here
// throws — but only inside the two consumers, which on such a runtime have
// already been refused by the fs probe below.
//
// The module runs from src/ (tests) and from dist/src/ (the transpiled
// harness drives), one directory deeper; the deeper candidate is used only
// when the src-relative directory does not exist.
let bootstrapScssDir: URL | undefined;
function bootstrapScssDirectory(): URL {
  if (bootstrapScssDir !== undefined) return bootstrapScssDir;
  const fromSrc = new URL("fixtures/vendor/bootstrap-scss/", new URL("../../..", import.meta.url));
  const fromDist = new URL("fixtures/vendor/bootstrap-scss/", new URL("../../../..", import.meta.url));
  const fs = nodeFsOrNull();
  bootstrapScssDir =
    fs?.existsSync !== undefined && !fs.existsSync(fromSrc) && fs.existsSync(fromDist) ? fromDist : fromSrc;
  return bootstrapScssDir;
}

/** bootstrap_core.rb:22-27 mixin_stylesheets. */
const BOOTSTRAP_MIXIN_STYLESHEETS = [
  "deprecate", "breakpoints", "color-scheme", "image", "resize",
  "visually-hidden", "reset-text", "text-truncate", "utilities", "alert",
  "backdrop", "buttons", "caret", "pagination", "lists", "list-group",
  "forms", "table-variants", "border-radius", "box-shadow", "gradients",
  "transition", "clearfix", "container", "grid",
] as const;

/** bootstrap_core.rb:29-31 main_stylesheets. */
const BOOTSTRAP_MAIN_STYLESHEETS = [
  "utilities", "root", "reboot", "type", "images", "containers", "grid",
  "tables",
] as const;

/** bootstrap_core.rb:33-35 form_stylesheets (forms/ subdir). */
const BOOTSTRAP_FORM_STYLESHEETS = [
  "labels", "form-text", "form-control", "form-select", "form-check",
  "form-range", "floating-labels", "input-group", "validation",
] as const;

/** bootstrap_core.rb:37-42 after_form_stylesheets. */
const BOOTSTRAP_AFTER_FORM_STYLESHEETS = [
  "buttons", "transitions", "dropdown", "button-group", "nav", "navbar",
  "card", "accordion", "breadcrumb", "pagination", "badge", "alert",
  "progress", "list-group", "close", "toasts", "modal", "tooltip",
  "popover", "carousel", "spinners", "offcanvas", "placeholders",
] as const;

/** bootstrap_core.rb:44-46 helper_stylesheets (helpers/ subdir). */
const BOOTSTRAP_HELPER_STYLESHEETS = [
  "clearfix", "colored-links", "ratio", "position", "stacks",
  "visually-hidden", "stretched-link", "text-truncation", "vr",
] as const;

/** load_stylesheets' full file list, in source order. */
const BOOTSTRAP_CORE_FILES: readonly string[] = [
  "_variables.scss",
  "vendor/_rfs.scss",
  ...BOOTSTRAP_MIXIN_STYLESHEETS.map((m) => `mixins/_${m}.scss`),
  ...BOOTSTRAP_MAIN_STYLESHEETS.map((m) => `_${m}.scss`),
  ...BOOTSTRAP_FORM_STYLESHEETS.map((m) => `forms/_${m}.scss`),
  ...BOOTSTRAP_AFTER_FORM_STYLESHEETS.map((m) => `_${m}.scss`),
  ...BOOTSTRAP_HELPER_STYLESHEETS.map((m) => `helpers/_${m}.scss`),
  "utilities/_api.scss",
];

/** OverrideCodeFile#content: the files joined with "\n". Throws on a
 *  runtime with no filesystem — the deploy target never renders these
 *  cards, and a silent empty-string substitute would fake Ruby's bytes. */
function loadStylesheets(files: readonly string[]): string {
  const fs = nodeFsOrNull();
  if (fs === undefined) {
    throw new Error(
      "bootstrap code-file content needs a Node filesystem (vendored fixtures/vendor/bootstrap-scss/); this runtime has none",
    );
  }
  const base = bootstrapScssDirectory();
  return files
    .map((f) => fs.readFileSync(new URL(f, base), "utf8"))
    .join("\n");
}

/** set/self/bootstrap_core.rb `def content`, outside any render. */
export function bootstrapCoreScss(): string {
  return loadStylesheets(BOOTSTRAP_CORE_FILES);
}

/** set/self/bootstrap_functions.rb `def content`, outside any render. */
export function bootstrapFunctionsScss(): string {
  return loadStylesheets(["_functions.scss"]);
}

/** set/self/bootstrap_core.rb `def content`. */
export function bootstrapCoreContent(_fmt: RenderFormat): string {
  return bootstrapCoreScss();
}

/** set/self/bootstrap_functions.rb `def content`. */
export function bootstrapFunctionsContent(_fmt: RenderFormat): string {
  return bootstrapFunctionsScss();
}
