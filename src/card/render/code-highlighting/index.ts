// CodeRay-style syntax highlighting (Stream M1 port).
//
// The deck's HTML view wraps certain cardtypes' raw content in
// `CodeRay.scan(_render_raw, :LANG).div`:
//
//   card-mod-format    set/type/json.rb             (:json)
//   card-mod-layout    set/type/layout_type.rb      (:html, with :template nest mode)
//   card-mod-layout    set/right/head.rb            (:html)
//   card-mod-style     set/abstract/01_css.rb       (:css)
//   card-mod-script    set/abstract/00_script.rb    (:js)
//
// `div` wraps the highlighted output in the DIV template:
//   <div class="CodeRay">
//     <div class="code"><pre><CONTENT></pre></div>
//   </div>
// and uses :css => :style (inline styles from the alpha theme).
//
// This module re-implements the minimum CodeRay surface to byte-match the
// corpus captures (fixtures/captured/coderay/*.html). The scanners here
// only cover the languages actually present in the corpus (json, css, html);
// languages with no captured oracle fall back to passthrough.

import { scanJson } from "./scanners/json.js";
import { scanCss } from "./scanners/css.js";
import { scanHtml } from "./scanners/html.js";

/** Languages the scanner dispatcher recognizes. Maps to the `LANG`
 *  argument the deck passes to `CodeRay.scan(...)` (json.rb:31 etc.). */
export type HighlightLanguage = "json" | "css" | "html";

/** The :div template (coderay-1.1.3 lib/coderay/encoders/html/output.rb:117).
 *  CONTENT is the highlighted span stream produced by the scanner. */
const DIV_OPEN = '<div class="CodeRay">\n  <div class="code"><pre>';
const DIV_CLOSE = "</pre></div>\n</div>\n";

/** Wrap a highlighted span stream in the CodeRay DIV template. */
export function wrapDiv(content: string): string {
  return DIV_OPEN + content + DIV_CLOSE;
}

/**
 * coderay-1.1.3 lib/coderay/scanners/scanner.rb:96-98 `to_unix`:
 *
 *     def to_unix code
 *       code.index(?\r) ? code.gsub(/\r\n?/, "\n") : code
 *     end
 *
 * Reached from `Scanner.normalize` (scanner.rb:51-63) and applied to EVERY
 * scan at scanner.rb:137 `super self.class.normalize(code)` — so the newline
 * rewrite happens BEFORE any scanner regex runs, and applies to all three
 * languages, not just :html.
 *
 * Why the bytes depend on it: the scanner hands each whitespace run to
 * `text_token match, :space` (scanners/html.rb:101 `scan(/\s+/m)`), and
 * `/\s+/m` matches the CRLF PAIR as one token. The encoder's escape table
 * (encoders/html.rb:139) maps every control code in 0x0B-0x1F to a literal
 * space, and 0x0D (`\r`) is in that range - so an un-normalized CRLF would
 * emit `" \n"` where the oracle emits `"\n"`. This was the a work item
 * "layout-whitespace" class (60 pages): the 5 CodeRay-highlighted Layout
 * cards whose bodies are stored with CRLF line endings each gained one
 * space per line inside the <pre> block, and no captured coderay fixture
 * covered CR at all, so the unit tests could not see it.
 *
 * `code.index(?\r)` is the guard in the Ruby original and is preserved here:
 * a body with no CR is returned unchanged (identity, no allocation).
 */
function toUnix(code: string): string {
  return code.indexOf("\r") === -1 ? code : code.replace(/\r\n?/g, "\n");
}

/** Dispatch to the right scanner based on the language hint. Unknown
 *  languages fall back to a no-op wrapper (just the DIV template with
 *  the input HTML-escaped verbatim) so the corpus's non-highlighted paths
 *  still get the CodeRay DIV shape. The corpus doesn't exercise this
 *  fallback; keep it for forward-compatibility. */
export function highlight(content: string, lang: HighlightLanguage): string {
  // scanner.rb:137 — normalize once, at the dispatch, for every language.
  const code = toUnix(content);
  switch (lang) {
    case "json":
      return wrapDiv(scanJson(code));
    case "css":
      return wrapDiv(scanCss(code));
    case "html":
      return wrapDiv(scanHtml(code));
  }
}

/** The set of cardtype codenames the deck wraps in CodeRay, derived from
 *  the Ruby gems listed in this file's header. Used by coreView to detect
 *  whether the current card needs highlighting. */
export const CODERAY_CARDTYPE_CODENAMES: ReadonlySet<string> = new Set([
  "json",
  "layout_type",
  "head",
  "css",
  "scss",
  "java_script",
  "coffee_script",
]);

/** Map a cardtype codename to its scanner language. Returns undefined when
 *  the codename doesn't trigger CodeRay, or when the language has no
 *  captured oracle fixture (the :js scanner the script mod uses is in
 *  this category today - java_script/coffee_script cards aren't in the
 *  corpus). */
export function langForTypeCode(typeCode: string | undefined): HighlightLanguage | undefined {
  if (typeCode === undefined) return undefined;
  if (typeCode === "json") return "json";
  if (typeCode === "css" || typeCode === "scss") return "css";
  if (typeCode === "layout_type" || typeCode === "head") return "html";
  return undefined;
}
