// Card::Content.clean! — the HTML restriction every save applies to stored
// content (card-1.110.0 lib/card/content/clean.rb), called from
// prepare_db_content when the card's clean_html? is true
// (mod/core/set/all/content.rb:44-49).
//
// The port keeps Ruby's regex semantics where JavaScript's differ:
// - `^` in Ruby always matches at any line start, so the patterns that use
//   it carry the `m` flag here.
// - Ruby's `\s` is ASCII whitespace; JavaScript's also matches Unicode
//   spaces, so the attribute patterns spell the ASCII class out.
// - `.` matches no newline in either, so `<!--.*?-->` keeps single-line
//   comments only, exactly as in Ruby.
//
// Configuration: Cardio's railtie defaults (lib/cardio/railtie.rb:11, :20)
// set allow_inline_styles and space_last_in_multispace to true, and the
// oracle app overrides neither.

const SPACE = "[ \\t\\r\\n\\f\\v]";

function allowedTags(allowInlineStyles: boolean): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  for (const tag of [
    "br", "i", "b", "pre", "cite", "caption", "strong", "em", "ins", "sup", "sub", "del", "ol",
    "hr", "ul", "li", "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "span", "table", "tr",
    "td", "th", "tbody", "thead", "tfoot",
  ]) {
    tags.set(tag, []);
  }
  // merge! keeps an existing key's position and replaces its value.
  tags.set("a", ["href", "title", "target"]);
  tags.set("img", ["src", "alt", "title"]);
  tags.set("code", ["lang"]);
  tags.set("blockquote", ["cite"]);
  tags.set("ol", ["type"]);
  tags.set("ul", ["type"]);
  if (allowInlineStyles) {
    tags.get("table")!.push("cellpadding", "align", "border", "cellspacing", "data-mce-style");
    tags.get("td")!.push("scope", "data-mce-style");
    tags.get("th")!.push("scope", "data-mce-style");
  }
  for (const attrs of tags.values()) {
    attrs.push("class");
    if (allowInlineStyles) attrs.push("style");
  }
  return tags;
}

const ALLOWED_TAGS = allowedTags(true);

/** ATTR_VALUE_RE: single-quoted, double-quoted, bare value. */
const ATTR_VALUE_RE = [/(?<=^')[^']+(?=')/m, /(?<=^")[^"]+(?=")/m, /\S+/];

const blank = (s: string | null | undefined): boolean =>
  s === null || s === undefined || /^[ \t\r\n\f\v]*$/.test(s);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** process_attribute: [quote, value] for one allowed attribute, value
 *  undefined when the attribute is absent. */
function processAttribute(attrib: string, all: string): [string, string | undefined] {
  const re = new RegExp(`\\b${escapeRegExp(attrib)}${SPACE}*=${SPACE}*(?=(.))`, "i");
  const m = re.exec(all);
  if (m === null) return ['"', undefined];
  let q = '"';
  let rest = all.slice(m.index + m[0].length); // post_match
  const idx = ["'", '"'].indexOf(m[1]);
  if (idx >= 0) q = m[1];
  const valueRe = ATTR_VALUE_RE[idx >= 0 ? idx : 2];
  const vm = valueRe.exec(rest);
  if (vm !== null) {
    rest = vm[0];
    if (attrib === "class") {
      // Only classes beginning with "w-" survive (deprecated allowance).
      rest = rest
        .split(/[ \t\r\n\f\v]+/)
        .filter((c) => /^w-/i.test(c))
        .join(" ");
    }
  }
  return [q, rest];
}

function htmlAttribs(tag: string, rawAttr: string, okAttrs: readonly string[]): string {
  const pieces = [tag];
  for (const okAttr of okAttrs) {
    const [q, value] = processAttribute(okAttr, rawAttr);
    if (!blank(value)) pieces.push(`${okAttr}=${q}${value}${q}`);
  }
  return pieces.join(" ");
}

function cleanTags(input: string, okTags: Map<string, string[]>): string {
  return input
    .replace(/<(\/*)(\w+)([^>]*)>/g, (_raw, slash: string, name: string, attrs: string) => {
      const tag = name.toLowerCase();
      const okAttrs = okTags.get(tag);
      if (okAttrs === undefined) return " ";
      return `<${slash}${htmlAttribs(tag, attrs, okAttrs)}>`;
    })
    .replace(/<!--.*?-->/g, "");
}

/** clean_spaces (space_last_in_multispace): a run of &nbsp; after a space
 *  moves the plain space to the end of the run. */
function cleanSpaces(input: string): string {
  return input.replace(/(?:^|\b) ((?:&nbsp;)+)/gm, "$1 ");
}

/** Card::Content.clean! with the deck's default configuration. */
export function cleanContent(input: string): string {
  return cleanSpaces(cleanTags(input, ALLOWED_TAGS));
}

/** Type codenames whose sets override clean_html? to false: type/html.rb
 *  (and card-mod-layout type/layout_type.rb, which includes it),
 *  type/email_template.rb, and the script and style abstracts included by
 *  type/java_script.rb, type/coffee_script.rb, type/css.rb, type/scss.rb
 *  and type/bootswatch_skin.rb. */
export const NO_CLEAN_TYPE_CODENAMES: ReadonlySet<string> = new Set([
  "html",
  "layout_type",
  "email_template",
  "java_script",
  "coffee_script",
  "css",
  "scss",
  "bootswatch_skin",
]);

/** Right-part codenames whose sets override clean_html? to false:
 *  right/html_message.rb. */
export const NO_CLEAN_RIGHT_CODENAMES: ReadonlySet<string> = new Set(["html_message"]);
