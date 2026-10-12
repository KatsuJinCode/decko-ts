// Card::Content.clean! — the HTML restriction every save applies to stored
// content (card-1.110.0 lib/card/content/clean.rb), called from
// prepare_db_content when the card's clean_html? is true
// (mod/core/set/all/content.rb:44-49).
//
// SECURITY DIVERGENCE FROM RUBY (docs/SECURITY.md, "Stored HTML").
// Ruby's cleaner finds tags with one regular expression and attribute values
// with another, then writes each kept value back between quotes without
// escaping it, and never looks at what a URL points to. That lets stored
// content carry script: `javascript:` links survive, `<img src=x"onerror=...>`
// is rebuilt as a live event handler, an unterminated quote or an unclosed tag
// at the end of the content runs into the surrounding page, and removing a
// comment can splice two harmless fragments into a new tag. The port keeps
// Ruby's tag and attribute allowlists and Ruby's output bytes wherever those
// bytes are safe, and replaces everything else:
//
//   1. Tags are found exactly as Ruby finds them (`<(\/*)(\w+)([^>]*)>`), so a
//      tag Ruby drops is dropped here too and replaced by the same space.
//   2. For each allowed tag, the original attributes are parsed with the
//      WHATWG HTML tokenizer's attribute rules (the rules a browser applies)
//      and the allowed ones kept, in Ruby's order and quote style, values
//      escaped, unsafe URLs and styles dropped. Ruby's own output for the tag
//      is computed too; when a browser reads exactly those same attributes
//      from Ruby's bytes, Ruby's bytes are stored unchanged, otherwise the
//      rebuilt tag is. So the port never stores what Ruby would store unless
//      it means what the author wrote and is safe, and cleaning is stable:
//      cleaning cleaned content changes nothing.
//   3. Comments are removed as Ruby removes them (`<!--.*?-->`, one line), but
//      only where the comment starts and ends in text, never inside a tag's
//      attribute value.
//   4. In the text between tags, a `<` that would start markup the cleaner did
//      not produce (an unclosed tag, a tag spliced together by comment removal,
//      an unterminated comment or declaration, a `<` that ends the content or
//      precedes an inclusion) is written as `&lt;`, which a browser displays
//      identically.
//
// Ordinary content is therefore stored byte for byte as Ruby stores it; only
// content whose Ruby cleaning would be unsafe or malformed differs. The
// regression suite is tests/card/actions/content-clean-security.test.ts.
//
// The port keeps Ruby's regex semantics where JavaScript's differ:
// - `^` in Ruby always matches at any line start, so the patterns that use
//   it carry the `m` flag here.
// - Ruby's `\s` is ASCII whitespace; JavaScript's also matches Unicode
//   spaces, so the attribute patterns spell the ASCII class out.
// - Ruby's `.` matches everything except "\n"; JavaScript's also stops at
//   "\r", U+2028 and U+2029, so comment removal scans for "\n" only.
//
// Configuration: Cardio's railtie defaults (lib/cardio/railtie.rb:11, :20)
// set allow_inline_styles and space_last_in_multispace to true, and the
// oracle app overrides neither.
//
// Runs on every runtime the engine targets (Node, workerd, Deno): no DOM, no
// node: modules, no dependencies.

const SPACE = "[ \\t\\r\\n\\f\\v]";

/** U+FFFD, which the tokenizer substitutes for NUL and invalid references. */
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/** U+00A0, the expansion of &nbsp;. */
const NBSP = String.fromCharCode(0xa0);

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

/** Attributes whose value is a URL the browser may load or navigate to. */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src", "cite"]);

/** Attributes whose value is CSS. TinyMCE copies data-mce-style back into
 *  style when it loads content, so it is checked the same way. */
const STYLE_ATTRIBUTES: ReadonlySet<string> = new Set(["style", "data-mce-style"]);

/**
 * URL schemes a stored link or image may use. Anything without a scheme
 * (relative paths, `#anchors`, `?queries`, `//host` URLs) is allowed. Every
 * scheme here only navigates, dials, or opens another application; none can
 * run script in the deck's origin. The list covers the schemes that turn up
 * in real decks (http, https, mailto, tel, skype) plus their common
 * equivalents.
 */
export const ALLOWED_URL_SCHEMES: ReadonlySet<string> = new Set([
  "http", "https", "mailto", "tel", "sms", "ftp", "skype", "callto", "webcal",
  "irc", "ircs", "xmpp", "geo", "news", "nntp", "feed",
]);

/** Inline images a stored `<img src>` may embed. SVG is excluded: it is a
 *  script-capable document format. */
const DATA_IMAGE_RE = /^data:image\/(?:png|gif|jpe?g|pjpeg|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)[;,]/;

// ---------------------------------------------------------------------------
// Ruby's algorithm, kept verbatim: its output is what the port stores whenever
// that output is safe.
// ---------------------------------------------------------------------------

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
    if (attrib === "class") rest = filterClasses(rest);
  }
  return [q, rest];
}

/** Only classes beginning with "w-" survive (Ruby's deprecated allowance). */
function filterClasses(value: string): string {
  return value
    .split(/[ \t\r\n\f\v]+/)
    .filter((c) => /^w-/i.test(c))
    .join(" ");
}

function rubyHtmlAttribs(tag: string, rawAttr: string, okAttrs: readonly string[]): string {
  const pieces = [tag];
  for (const okAttr of okAttrs) {
    const [q, value] = processAttribute(okAttr, rawAttr);
    if (!blank(value)) pieces.push(`${okAttr}=${q}${value}${q}`);
  }
  return pieces.join(" ");
}

// ---------------------------------------------------------------------------
// Attribute tokenizer: the WHATWG HTML tokenizer's states from "before
// attribute name" to "after attribute value (quoted)" (HTML Living Standard
// 13.2.5.32-13.2.5.42), applied to the text between a tag name and its `>`.
// ---------------------------------------------------------------------------

export interface ParsedAttribute {
  /** ASCII-lowercased name, NUL replaced by U+FFFD, as the browser stores it. */
  name: string;
  /** The value's source text (character references not decoded). */
  value: string;
  /** The quote the value was written with, or "" for a bare or absent value. */
  quote: '"' | "'" | "";
}

export interface ParsedAttributes {
  attributes: ParsedAttribute[];
  /** True when the input ended inside a quoted value. */
  unterminatedQuote: boolean;
}

const isTokenSpace = (c: string): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";

function lowerName(c: string): string {
  if (c === "\0") return REPLACEMENT_CHARACTER;
  return c >= "A" && c <= "Z" ? c.toLowerCase() : c;
}

export function parseAttributes(input: string): ParsedAttributes {
  const attributes: ParsedAttribute[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    // before attribute name: whitespace and "/" (the self-closing state
    // reconsumes anything but ">" here) are skipped.
    const c = input[i];
    if (isTokenSpace(c) || c === "/") {
      i++;
      continue;
    }
    // attribute name. A leading "=" is part of the name (parse error).
    let name = lowerName(c);
    i++;
    while (i < n) {
      const d = input[i];
      if (isTokenSpace(d) || d === "/" || d === "=") break;
      name += lowerName(d);
      i++;
    }
    // after attribute name
    while (i < n && isTokenSpace(input[i])) i++;
    if (i >= n || input[i] !== "=") {
      attributes.push({ name, value: "", quote: "" });
      continue;
    }
    i++; // "="
    // before attribute value
    while (i < n && isTokenSpace(input[i])) i++;
    if (i >= n) {
      attributes.push({ name, value: "", quote: "" });
      break;
    }
    const q = input[i];
    if (q === '"' || q === "'") {
      const end = input.indexOf(q, i + 1);
      if (end === -1) {
        attributes.push({ name, value: input.slice(i + 1), quote: q });
        return { attributes, unterminatedQuote: true };
      }
      attributes.push({ name, value: input.slice(i + 1, end), quote: q });
      i = end + 1;
      // after attribute value (quoted): anything else reconsumes as the start
      // of the next attribute name (missing-whitespace parse error).
      continue;
    }
    let value = "";
    while (i < n && !isTokenSpace(input[i])) {
      value += input[i] === "\0" ? REPLACEMENT_CHARACTER : input[i];
      i++;
    }
    attributes.push({ name, value, quote: "" });
  }
  return { attributes, unterminatedQuote: false };
}

// ---------------------------------------------------------------------------
// Character references: decoded only to judge a value, never to store it.
// ---------------------------------------------------------------------------

/** Named references whose expansion contains an ASCII character (the only
 *  ones that can spell a scheme, a colon, or a CSS keyword). Matched with or
 *  without the trailing semicolon, more eagerly than a browser decodes, so a
 *  value is never judged safer than the browser would read it. */
const ASCII_NAMED_REFS: Record<string, string> = {
  tab: "\t", newline: "\n", excl: "!", quot: '"', num: "#", dollar: "$", percnt: "%",
  amp: "&", apos: "'", lpar: "(", rpar: ")", ast: "*", midast: "*", plus: "+",
  comma: ",", period: ".", sol: "/", colon: ":", semi: ";", lt: "<", equals: "=",
  gt: ">", quest: "?", commat: "@", lsqb: "[", lbrack: "[", bsol: "\\", rsqb: "]",
  rbrack: "]", hat: "^", lowbar: "_", underbar: "_", grave: "`", diacriticalgrave: "`",
  lcub: "{", lbrace: "{", verbar: "|", vert: "|", verticalline: "|", rcub: "}",
  rbrace: "}", nbsp: NBSP, nonbreakingspace: NBSP, fjlig: "fj",
};

/** Windows-1252 code points the HTML spec substitutes for &#x80;-&#x9F;. */
const C1_REPLACEMENTS: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function codePointText(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return REPLACEMENT_CHARACTER;
  return String.fromCodePoint(C1_REPLACEMENTS[cp] ?? cp);
}

export function decodeCharacterReferences(value: string): string {
  return value.replace(
    /&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|([A-Za-z][A-Za-z0-9]*);?)/g,
    (whole, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
      if (hex !== undefined) return codePointText(parseInt(hex.slice(0, 8), 16));
      if (dec !== undefined) return codePointText(parseInt(dec.slice(0, 9), 10));
      const lower = name!.toLowerCase();
      if (lower in ASCII_NAMED_REFS) return ASCII_NAMED_REFS[lower]!;
      // A longer token may start with a known name ("&colonx"): the browser
      // matches the longest known prefix for the legacy names; be at least as
      // eager for every ASCII-producing one.
      for (const known of Object.keys(ASCII_NAMED_REFS)) {
        if (lower.startsWith(known)) return ASCII_NAMED_REFS[known]! + name!.slice(known.length);
      }
      return whole;
    },
  );
}

// ---------------------------------------------------------------------------
// Value checks
// ---------------------------------------------------------------------------

/** A regular-expression character class built from code points, so the
 *  source stays plain ASCII. */
function charClass(ranges: Array<number | [number, number]>): string {
  return ranges
    .map((r) => (Array.isArray(r) ? `${String.fromCharCode(r[0])}-${String.fromCharCode(r[1])}` : String.fromCharCode(r)))
    .join("");
}

/** Unicode space characters stripped from the start of a URL. */
const LEADING_UNICODE_SPACE = new RegExp(
  `^[${charClass([0x20, 0xa0, 0x1680, [0x2000, 0x200f], [0x2028, 0x202f], 0x205f, 0x3000, 0xfeff])}]+`,
);

/** Controls and spaces ignored when judging a style value. */
const CSS_IGNORABLE = new RegExp(`[${charClass([[0x00, 0x20], 0x7f])}]`, "g");

/** Is this attribute value (source text) a URL the deck may store? */
export function isSafeUrl(rawValue: string, allowDataImage: boolean): boolean {
  // The URL parser strips leading and trailing C0 controls and spaces and
  // removes tab and newline anywhere. This is stricter: every control
  // character goes wherever it is, and Unicode spaces go at the ends too, so
  // a scheme can never hide behind them.
  const url = decodeCharacterReferences(rawValue)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(LEADING_UNICODE_SPACE, "")
    .toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(url);
  if (scheme !== null) {
    if (ALLOWED_URL_SCHEMES.has(scheme[1])) return true;
    return allowDataImage && DATA_IMAGE_RE.test(url);
  }
  // No scheme: the browser resolves it as a relative URL, because a scheme
  // is only ever plain scheme characters followed by ":". The one thing not
  // to trust is a character reference this decoder left undecoded ahead of
  // the first ":", which a browser might expand into scheme characters.
  const colon = url.indexOf(":");
  if (colon === -1) return true;
  const head = url.slice(0, colon);
  return /[/?#]/.test(head) || !head.includes("&");
}

/** Is this style value (source text) free of the constructs any browser has
 *  ever executed or loaded script through? `url()` targets must be safe URLs. */
export function isSafeStyle(rawValue: string): boolean {
  let css = decodeCharacterReferences(rawValue);
  // CSS comments and escapes (CSS Syntax 4.3.7), then case and whitespace.
  css = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "");
  css = css.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([\s\S])/g, (_m, hex: string | undefined, ch: string | undefined) =>
    hex !== undefined ? codePointText(parseInt(hex, 16)) : ch === "\n" ? "" : ch!,
  );
  const flat = css.replace(CSS_IGNORABLE, "").toLowerCase();
  if (/expression\(|javascript:|vbscript:|livescript:|-moz-binding|behavior:|@import|<\/?style|<!--/.test(flat)) {
    return false;
  }
  for (const m of flat.matchAll(/url\(([^)]*)\)?/g)) {
    const target = m[1]!.replace(/^["']|["']$/g, "");
    if (!isSafeUrl(target, true)) return false;
  }
  return true;
}

function attributeValueSafe(name: string, rawValue: string, tag: string): boolean {
  if (URL_ATTRIBUTES.has(name)) return isSafeUrl(rawValue, tag === "img" && name === "src");
  if (STYLE_ATTRIBUTES.has(name)) return isSafeStyle(rawValue);
  return true;
}

// ---------------------------------------------------------------------------
// Per-tag cleaning
// ---------------------------------------------------------------------------

function escapeAttributeValue(value: string, quote: '"' | "'"): string {
  return quote === '"' ? value.replace(/"/g, "&quot;") : value.replace(/'/g, "&#39;");
}

interface KeptAttribute {
  name: string;
  /** The value as written into the output (escaped for its quote). */
  value: string;
  quote: '"' | "'";
}

/** The allowed, safe attributes a browser reads from the original tag, in
 *  Ruby's order and quote style, values escaped. */
function keptAttributes(tag: string, rawAttr: string, okAttrs: readonly string[]): KeptAttribute[] {
  const parsed = parseAttributes(rawAttr).attributes;
  const kept: KeptAttribute[] = [];
  for (const okAttr of okAttrs) {
    // Duplicate attributes: the browser keeps the first.
    const attr = parsed.find((a) => a.name === okAttr);
    if (attr === undefined) continue;
    let value = attr.value;
    if (okAttr === "class") value = filterClasses(value);
    if (blank(value)) continue;
    if (!attributeValueSafe(okAttr, value, tag)) continue;
    const quote: '"' | "'" = attr.quote === "'" ? "'" : '"';
    kept.push({ name: okAttr, value: escapeAttributeValue(value, quote), quote });
  }
  return kept;
}

/** Does a browser read exactly `kept` from Ruby's attribute text? */
function rubyAgrees(rubyAttrText: string, kept: readonly KeptAttribute[]): boolean {
  const parsed = parseAttributes(rubyAttrText);
  if (parsed.unterminatedQuote || parsed.attributes.length !== kept.length) return false;
  return parsed.attributes.every((a, i) => a.name === kept[i]!.name && a.value === kept[i]!.value);
}

function cleanTag(slash: string, name: string, attrs: string): string | null {
  const tag = name.toLowerCase();
  const okAttrs = ALLOWED_TAGS.get(tag);
  if (okAttrs === undefined) return null;
  const kept = keptAttributes(tag, attrs, okAttrs);
  // Ruby's bytes, when a browser reads from them exactly the attributes it
  // reads (allowed and safe) from the original; otherwise the rebuilt tag.
  const ruby = rubyHtmlAttribs(tag, attrs, okAttrs);
  if (rubyAgrees(ruby.slice(tag.length), kept)) return `<${slash}${ruby}>`;
  return `<${slash}${[tag, ...kept.map((a) => `${a.name}=${a.quote}${a.value}${a.quote}`)].join(" ")}>`;
}

// ---------------------------------------------------------------------------
// The document pass
// ---------------------------------------------------------------------------

interface Piece {
  kind: "text" | "tag";
  s: string;
}

const TAG_RE = /<(\/*)(\w+)([^>]*)>/g;

function tagPieces(input: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of input.matchAll(TAG_RE)) {
    if (m.index > last) pieces.push({ kind: "text", s: input.slice(last, m.index) });
    const cleaned = cleanTag(m[1]!, m[2]!, m[3]!);
    // A dropped tag becomes one space, as in Ruby.
    pieces.push(cleaned === null ? { kind: "text", s: " " } : { kind: "tag", s: cleaned });
    last = m.index + m[0].length;
  }
  if (last < input.length) pieces.push({ kind: "text", s: input.slice(last) });
  return pieces;
}

/** Ruby's `gsub(/<!--.*?-->/, "")` over the cleaned string, honouring only
 *  comment openings that lie in text. Returns the pieces with the removed
 *  ranges cut out and adjacent text merged. */
function removeComments(pieces: Piece[]): Piece[] {
  const joined = pieces.map((p) => p.s).join("");
  // Which character offsets belong to text.
  const inText = new Uint8Array(joined.length);
  let offset = 0;
  for (const p of pieces) {
    if (p.kind === "text") inText.fill(1, offset, offset + p.s.length);
    offset += p.s.length;
  }
  const remove: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const start = joined.indexOf("<!--", from);
    if (start === -1) break;
    if (inText[start] !== 1) {
      from = start + 1;
      continue;
    }
    const end = joined.indexOf("-->", start + 4);
    if (end === -1) break;
    if (joined.slice(start, end).includes("\n")) {
      from = start + 1;
      continue;
    }
    remove.push([start, end + 3]);
    from = end + 3;
  }
  if (remove.length === 0) return mergeText(pieces);
  const out: Piece[] = [];
  offset = 0;
  let r = 0;
  for (const p of pieces) {
    const pStart = offset;
    const pEnd = offset + p.s.length;
    offset = pEnd;
    let kept = "";
    let cursor = pStart;
    while (r < remove.length && remove[r]![0] < pEnd) {
      const [rs, re] = remove[r]!;
      if (rs > cursor) kept += joined.slice(cursor, rs);
      cursor = Math.max(cursor, Math.min(re, pEnd));
      if (re <= pEnd) r++;
      else break;
    }
    if (cursor < pEnd) kept += joined.slice(cursor, pEnd);
    if (kept === "") continue;
    // A tag partly inside a removed range cannot happen (comment ends are
    // never inside a tag), but if it did, its remainder is text.
    out.push({ kind: p.kind === "tag" && kept === p.s ? "tag" : "text", s: kept });
  }
  return mergeText(out);
}

function mergeText(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (p.kind === "text" && prev !== undefined && prev.kind === "text") prev.s += p.s;
    else out.push({ ...p });
  }
  return out;
}

/** Should the `<` at `at` (inside a text piece ending at `pieceEnd`) be
 *  written as `&lt;`? `all` is the whole cleaned output, so a comment or a
 *  declaration opened here may legitimately end later in it. */
function strayLessThan(all: string, at: number, pieceEnd: number): boolean {
  const atEnd = pieceEnd === all.length;
  if (at + 1 >= pieceEnd) {
    // Ends the piece: dangerous only when it ends the content (it could pair
    // with whatever the page puts next); before one of our tags it is text.
    return atEnd;
  }
  const next = all[at + 1]!;
  // A tag the cleaner did not produce, or a `<` right before an inclusion.
  if (/[A-Za-z{]/.test(next)) return true;
  if (next === "/") {
    if (at + 2 >= pieceEnd) return atEnd;
    return /[A-Za-z]/.test(all[at + 2]!) || all.indexOf(">", at + 2) === -1;
  }
  if (next === "!") {
    if (all.startsWith("<!--", at)) {
      // "<!-->" and "<!--->" end at once; otherwise the comment needs an end.
      if (all.startsWith("<!-->", at) || all.startsWith("<!--->", at)) return false;
      return all.indexOf("-->", at + 4) === -1 && all.indexOf("--!>", at + 4) === -1;
    }
    return all.indexOf(">", at + 2) === -1;
  }
  if (next === "?") return all.indexOf(">", at + 2) === -1;
  return false;
}

function escapeStrayMarkup(pieces: Piece[]): string {
  const all = pieces.map((p) => p.s).join("");
  let out = "";
  let offset = 0;
  for (const p of pieces) {
    const start = offset;
    offset += p.s.length;
    if (p.kind === "tag" || !p.s.includes("<")) {
      out += p.s;
      continue;
    }
    let last = 0;
    for (let i = p.s.indexOf("<"); i !== -1; i = p.s.indexOf("<", i + 1)) {
      if (strayLessThan(all, start + i, offset)) {
        out += p.s.slice(last, i) + "&lt;";
        last = i + 1;
      }
    }
    out += p.s.slice(last);
  }
  return out;
}

/** clean_spaces (space_last_in_multispace): a run of &nbsp; after a space
 *  moves the plain space to the end of the run. */
function cleanSpaces(input: string): string {
  return input.replace(/(?:^|\b) ((?:&nbsp;)+)/gm, "$1 ");
}

/** Card::Content.clean! with the deck's default configuration, made safe
 *  (see the module header). */
export function cleanContent(input: string): string {
  return cleanSpaces(escapeStrayMarkup(removeComments(tagPieces(input))));
}

/** Ruby's cleaner exactly as card-1.110.0 runs it, unsafe output included.
 *  Kept for the parity harness and the regression suite, which measure
 *  where the port's output differs; never used to store content. */
export function rubyCleanContent(input: string): string {
  const tagged = input
    .replace(TAG_RE, (_raw, slash: string, name: string, attrs: string) => {
      const tag = name.toLowerCase();
      const okAttrs = ALLOWED_TAGS.get(tag);
      if (okAttrs === undefined) return " ";
      return `<${slash}${rubyHtmlAttribs(tag, attrs, okAttrs)}>`;
    })
    .replace(/<!--[^\n]*?-->/g, "");
  return cleanSpaces(tagged);
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
