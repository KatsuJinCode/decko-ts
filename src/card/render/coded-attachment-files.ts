// The CODED attachment file-content seam.
//
// Ruby mechanism (card-mod-carrierwave-0.20.0):
// - set/abstract/attachment/coded.rb: coded storage keeps a mod's own files
//   inside the mod directory. mod_name_match (coded.rb:41-43,
//   %r{^:[:\w/+]+/([^./]+)\.}) reads the MOD NAME out of the stored content
//   (":decko_logo/carrierwave.svg" -> the "carrierwave" mod); coded_dir
//   (coded.rb:47-52, MOD_FILE_DIR = "data/files" + codename_parts, with
//   codename_parts = each name part's codename, coded.rb:54-57) locates
//   <mod-dir>/data/files/<codename-parts...>/.
// - set/type/image/html_views.rb:5-11 view :core short-circuits SVG
//   attachments to the RAW FILE BYTES: `return card.attachment.read.html_safe
//   if svg?` (svg? = the attachment's extension is ".svg", set/type/image.rb:8).
//   The file read is the uploader's ORIGINAL version —
//   `<mounted_as>-original.<ext>` = image-original.svg — because svg
//   attachments create NO versions (create_versions? is false for .svg,
//   set/type/image.rb:4-6).
//
// This port vendors the mod-owned files it renders verbatim under
// mod-loader/mods/mod-coded-attachment-files/<mod>/data/files/... — the decko
// project's own asset bytes, NOT captured render output (the vendored
// decko_logo image-original.svg is sha256 312389d4825c90b0b9fe27969b333b831
// 69e4328504115d21f2db7f04172f230, byte-identical to the file the oracle deck
// reads at card-mod-carrierwave-0.20.0/data/files/decko_logo/, verified
// 2026-09-28). The same bytes are vendored under logo/, the codename a stock
// `decko setup` deck's *logo card carries (":logo/carrierwave.svg"; the gem
// ships logo/image-original.svg with the identical sha256). A mod with no vendored files, a non-coded content shape, a
// non-svg extension, or a missing file yields undefined — the caller then
// takes its existing image_tag URL branch (Ruby would raise "can't find mod"
// for an unresolvable coded dir; the fallback keeps the render safe, a
// documented divergence).

// 2026-09-29 documented divergence (on top of the ones above): a runtime
// with no filesystem (workerd, the Cloudflare Workers target of the
// one-click deploy) yields undefined too — the caller's image_tag URL
// branch takes over. The Node reads reach fs through a RUNTIME
// process.getBuiltinModule probe instead of an import statement because a
// static "node:fs" here is exactly what broke the deploy boot (vite hoists
// the module's static imports to the worker bundle top; workerd rejects
// the script at load with `No such module "node:fs"`, no nodejs_compat on
// this deploy by design).

/** Structural slice of "node:fs" the coded read uses. Declared locally —
 *  never imported — so this module emits no node: specifier into any
 *  bundle. */
interface NodeSyncFs {
  readFileSync(path: string | URL, encoding: string): string;
}

/** The Node fs module when running on Node, undefined otherwise. The probe
 *  is process.getBuiltinModule (Node >= 22.3): a runtime lookup with no
 *  import statement, so no bundler ever sees a "node:fs" reference from
 *  this file. workerd has no `process` global at all (probed via miniflare
 *  2026-09-29), so the probe answers undefined there. Cached after the
 *  first hit. */
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

/** mod name -> that MOD'S ROOT DIRECTORY as a file: URL href with a
 *  trailing slash (Ruby's mod_dir, coded.rb:59-63 — the gem checkout
 *  holding the mod's data/files tree). Seeded with the vendored carrierwave
 *  files; production deployments extend this map for deck mods that ship
 *  coded attachments.
 *
 *  Built through URL resolution (Web-standard) instead of node:path +
 *  node:url so the module imports no Node builtin. On workerd
 *  `import.meta.url` is undefined for the booted script, `new URL` throws,
 *  and the map stays empty — the unresolvable-mod-dir path below. */
const CODED_MOD_FILE_DIR_HREFS = new Map<string, string>();
try {
  CODED_MOD_FILE_DIR_HREFS.set(
    "carrierwave",
    new URL(
      "../mod-loader/mods/mod-coded-attachment-files/carrierwave/",
      import.meta.url,
    ).href,
  );
} catch {
  // Edge boot (no import.meta.url base): coded svg lookups yield undefined.
}

/** coded.rb:41-43 mod_name_match — the mod segment of a coded content. */
const CODED_MOD_NAME_RE = /^:[:\w/+]+\/([^./]+)\./;

/** The raw bytes of a coded SVG attachment (html_views.rb:5-11's
 *  `card.attachment.read` for a `svg?` card), or undefined when the content
 *  is not a coded .svg this port can resolve — including on runtimes with
 *  no filesystem, where the caller's image_tag URL branch takes over. */
export function codedSvgFileBytes(content: string | null | undefined): string | undefined {
  const fs = nodeFsOrNull();
  if (fs === undefined) return undefined;
  const trimmed = (content ?? "").trim();
  if (!trimmed.toLowerCase().endsWith(".svg")) return undefined;
  const modMatch = trimmed.match(CODED_MOD_NAME_RE);
  if (modMatch === null) return undefined;
  const baseDirHref = CODED_MOD_FILE_DIR_HREFS.get(modMatch[1]);
  if (baseDirHref === undefined) return undefined;
  // codename_parts (coded.rb:54-57): every name part's codename — the
  // content's leading-colon segments before the mod filename. A blank part
  // is the coded_ok? failure (coded.rb:37-39).
  const parts = trimmed
    .slice(1, trimmed.lastIndexOf("/"))
    .split("+")
    .map((part) => (part.startsWith(":") ? part.slice(1) : part));
  if (parts.length === 0 || parts.some((part) => part === "")) return undefined;
  // the original version's file: <mounted_as>-original.<ext>; image cards
  // mount as :image (set/type/image.rb attach :image) and svg attachments
  // carry only the original version. Segments are URL-escaped (codenames
  // are [a-z0-9_], identity for every real input) and resolved against the
  // mod-dir href — the same target path node:path's join produced before
  // the workerd boot fix.
  const ext = trimmed.slice(trimmed.lastIndexOf("."));
  const fileUrl = new URL(
    `data/files/${parts.map(encodeURIComponent).join("/")}/image-original${ext}`,
    baseDirHref,
  );
  try {
    return fs.readFileSync(fileUrl, "utf8");
  } catch {
    return undefined;
  }
}
