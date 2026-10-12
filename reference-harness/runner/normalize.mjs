// The harness's normalisation, stated once (reference-harness/SPEC.md,
// "Normalisation"). There are two kinds of rule, and nothing else is applied:
//
// - A mask erases a value. A mask is allowed only for a field shown to vary
//   between two runs of the same oracle on the same fixture, and it is as
//   narrow as that field's exact shape. There is one: N1.
// - A canonical form compares the same value in another encoding and erases
//   nothing: N2, JSON key order, and N3, class-token order inside a `class`
//   attribute.
//
// Every rule has tests (runner/test/normalize.test.mjs) that a nearby
// meaningful change still fails.

/**
 * N1's token shape: a `data-slot-id` attribute carrying exactly 20 lowercase
 * hex digits, preceded by whitespace and quoted. The opening quote is captured
 * and backreferenced, so a value wrapped in mismatched quotes does not match.
 * Ruby Decko draws that value afresh for every render, so two oracle runs of
 * one fixture differ here and nowhere else — a measured run counted 9,056 slot
 * ids across 1,350 renders.
 *
 * This regex defines the token's shape and nothing more: compare-runs.mjs
 * matches it against raw recorded strings to count how many paired values
 * actually differ. It is deliberately not the mask. Matching here requires
 * only a preceding space, which ordinary text supplies as well — in
 * `<p>Example data-slot-id=…</p>` the characters are visible prose, and
 * masking them would erase a real difference. The mask is applied only where
 * the tokenizer has established a true attribute, in
 * normalizeTagAttributes.
 */
export const SLOT_ID = /(?<=\s)data-slot-id=(["'])[0-9a-f]{20}\1/g;

// Elements whose content is text, not markup, until their matching close tag.
// The HTML5 raw text elements (script, style, textarea, title), the obsolete
// raw text element xmp (parsed by browsers exactly like the others: its body
// is text until `</xmp>`), and plaintext, which has no end tag at all — the
// tokenizer never leaves the plaintext state, so everything from `<plaintext>`
// to EOF is displayed text (a `</plaintext>` look-alike is text too, as is a
// self-closing slash). Everything between the open tag and the end of the
// body is compared byte for byte. Inside xmp and plaintext the tokenizer is
// still in its raw text state, so a `data-slot-id="…"` look-alike is displayed
// characters rather than an attribute, and no mask site is ever offered.
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title", "xmp"]);
const RAW_TEXT_NEVER_CLOSES = "plaintext";

const isWhitespace = (c) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f";
const isNameChar = (c) => /[A-Za-z0-9:_-]/.test(c);

/**
 * N1. Replaces the value of a `data-slot-id` attribute — a real attribute
 * token: a whitespace-preceded `data-slot-id` between `<` and `>` of one tag,
 * followed by `=` and a quoted 20-hex-digit value — with `SLOT`, quote style
 * kept. Everything else is returned byte for byte: element text, comments,
 * quoted attribute values and script/style bodies are never masked, even when
 * they contain text shaped like the attribute.
 *
 * `classTokenOrder` (N3) is applied in the same walk and on the same
 * narrowness terms: only a real `class` attribute token, never element text,
 * a comment, another attribute's value or a raw text body.
 */
export function normalizeHtml(html, { classTokenOrder = true } = {}) {
  if (typeof html !== "string") return html;
  let out = "";
  let i = 0;
  const lower = html.toLowerCase();
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    i = lt;
    // A comment, a doctype, CDATA or a processing instruction: markup, but
    // never a tag, so never a mask site. Copied verbatim.
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      out += html.slice(lt, i);
      continue;
    }
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const gt = html.indexOf(">", i);
      i = gt === -1 ? html.length : gt + 1;
      out += html.slice(lt, i);
      continue;
    }
    // A tag: `<` + optional `/` + a name starting with a letter.
    let k = i + 1;
    const closing = html[k] === "/";
    if (closing) k++;
    const nameStart = k;
    if (!/[A-Za-z]/.test(html[nameStart] ?? "")) {
      out += "<"; // a lone `<` is text
      i++;
      continue;
    }
    while (k < html.length && isNameChar(html[k])) k++;
    const name = html.slice(nameStart, k);
    // The tag's `>`, honouring quoted attribute values (a `>` inside them is
    // value text, not the tag's end).
    let quote = null;
    let j = k;
    while (j < html.length) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      j++;
    }
    const tagEnd = j >= html.length ? html.length : j + 1;
    const tagText = html.slice(i, tagEnd);
    out += closing ? tagText : normalizeTagAttributes(tagText, classTokenOrder);
    i = tagEnd;
    // A raw text element's body is text, not markup: copied verbatim,
    // whatever it contains. xmp closes like the others, at its end tag;
    // plaintext never closes — everything after it to EOF is its body,
    // whatever it looks like (browsers have no `</plaintext>`).
    const lowerName = name.toLowerCase();
    if (!closing && RAW_TEXT_ELEMENTS.has(lowerName) && !tagText.endsWith("/>")) {
      const closeAt = lower.indexOf(`</${lowerName}`, i);
      const bodyEnd = closeAt === -1 ? html.length : (() => {
        const gt = html.indexOf(">", closeAt);
        return gt === -1 ? html.length : gt + 1;
      })();
      out += html.slice(i, bodyEnd);
      i = bodyEnd;
    } else if (!closing && lowerName === RAW_TEXT_NEVER_CLOSES) {
      out += html.slice(i);
      i = html.length;
    }
  }
  return out;
}

/** Applies N1 and N3 inside one tag's text. Walks the attribute region the way
 *  the HTML tokenizer does — names, `=`, quoted or unquoted values — and copies
 *  every byte neither rule rewrites. */
function normalizeTagAttributes(tagText, classTokenOrder) {
  let out = "";
  let k = 1; // past `<`
  while (k < tagText.length && !isWhitespace(tagText[k]) && tagText[k] !== ">" && tagText[k] !== "/") k++;
  out += tagText.slice(0, k); // `<` and the tag name
  while (k < tagText.length) {
    const c = tagText[k];
    if (isWhitespace(c) || c === ">" || c === "/" || c === "=") {
      out += c;
      k++;
      continue;
    }
    // An attribute name, up to whitespace, `=`, `>` or `/`.
    const nameStart = k;
    while (k < tagText.length && !isWhitespace(tagText[k]) && !"=/>".includes(tagText[k])) k++;
    const name = tagText.slice(nameStart, k);
    if (k === nameStart) {
      out += tagText.slice(k); // defensive: no name consumed, nothing more to parse
      break;
    }
    // Optional whitespace, then `=` when the attribute has a value.
    let e = k;
    while (e < tagText.length && isWhitespace(tagText[e])) e++;
    if (tagText[e] !== "=") {
      out += name; // a valueless attribute; whitespace before the next name handled above
      continue;
    }
    let v = e + 1;
    while (v < tagText.length && isWhitespace(tagText[v])) v++;
    out += tagText.slice(nameStart, v); // name, whitespace, `=`, whitespace
    const q = tagText[v];
    if (q === '"' || q === "'") {
      const closeQ = tagText.indexOf(q, v + 1);
      const value = closeQ === -1 ? tagText.slice(v + 1) : tagText.slice(v + 1, closeQ);
      // `class` is matched case-insensitively, as HTML attribute names are.
      const isClass = name.toLowerCase() === "class";
      const masked = name === "data-slot-id" && /^[0-9a-f]{20}$/.test(value);
      const ordered = isClass && classTokenOrder ? sortClassTokens(value) : value;
      out += q + (masked ? "SLOT" : ordered) + (closeQ === -1 ? "" : q);
      k = closeQ === -1 ? tagText.length : closeQ + 1;
    } else {
      // An unquoted value: never masked (the mask's shape needs quotes) and
      // never reordered, so an unquoted slot id or class list still counts.
      let u = v;
      while (u < tagText.length && !isWhitespace(tagText[u]) && tagText[u] !== ">") u++;
      out += tagText.slice(v, u);
      k = u;
    }
  }
  return out;
}

/**
 * N3. The class-token order of a `class` attribute's value, compared as a SET.
 *
 * Ruby's own environment puts the same tokens in a different order on stock
 * Linux than on stock Windows (the committed expected bytes were captured on
 * Windows; the class-token order is the only thing that differs — see
 * tools/ruby-version-variance/). The token set, the count and the tokens
 * themselves all still count; only the order is canonicalised, and it is
 * canonicalised to the sorted order so the comparison erases nothing.
 *
 * The whitespace between tokens is HTML's class-value separator, not content,
 * so runs of it collapse to one space. Every other byte of the value is kept,
 * and the value is returned unchanged when sorting would alter it in any way
 * beyond order (an empty value, or one token, needs no rewrite).
 */
export function sortClassTokens(value) {
  const tokens = value.split(/[ \t\n\r\f]+/).filter((t) => t !== "");
  if (tokens.length < 2) return value;
  const sorted = [...tokens].sort();
  // A repeated token is content (two engines that emit one are not the same),
  // so a value whose tokens are not distinct is left exactly as it is.
  if (new Set(tokens).size !== tokens.length) return value;
  const out = sorted.join(" ");
  return out === value ? value : out;
}

/** A render result: its HTML normalised by N1 and N3, every other field as is.
 *  `classTokenOrder: false` grades with N3 off (the evidence for the rule, and
 *  what the raw class-token order is on its own). */
export function normalizeRender(result, options) {
  return result && typeof result === "object" && typeof result.html === "string" ? { ...result, html: normalizeHtml(result.html, options) } : result;
}

/** N2. Stable JSON: object keys sorted, so key order never counts. Array
 *  order always counts. */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

/** True when two values are equal under N2. */
export function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
