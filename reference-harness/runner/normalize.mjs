// The harness's normalisation, stated once (reference-harness/SPEC.md,
// "Normalisation"). There are two kinds of rule, and nothing else is applied:
//
// - A mask erases a value. A mask is allowed only for a field shown to vary
//   between two runs of the same oracle on the same fixture, and it is as
//   narrow as that field's exact shape. There is one: N1.
// - A canonical form compares the same value in another encoding and erases
//   nothing: N2, JSON key order.
//
// Every rule has tests (runner/test/normalize.test.mjs) that a nearby
// meaningful change still fails.

/**
 * N1's token shape: the `data-slot-id` attribute holding exactly 20 lowercase
 * hex digits, in attribute position, quote style kept. Ruby Decko draws it at
 * random for every render, so two oracle runs of one fixture differ in it and
 * nowhere else (REFERENCE-HARNESS evidence: 9,056 slot ids in 1,350 renders).
 *
 * This regex is the token's shape for evidence counting (compare-runs.mjs
 * matches it against raw recorded strings). The mask itself is applied only
 * where the HTML grammar puts an attribute — see normalizeHtml — because a
 * preceding space alone also matches text like `<p>Example data-slot-id=…</p>`,
 * and masking that would erase a visible difference (finding 6).
 */
export const SLOT_ID = /(?<=\s)data-slot-id=(["'])[0-9a-f]{20}\1/g;

// Elements whose content is text, not markup, until their matching close tag.
// The HTML5 raw text elements (script, style, textarea, title), the obsolete
// raw text element xmp (parsed by browsers exactly like the others: its body
// is text until `</xmp>`), and plaintext, which has no end tag at all — the
// tokenizer never leaves the plaintext state, so everything from `<plaintext>`
// to EOF is displayed text (a `</plaintext>` look-alike is text too, as is a
// self-closing slash). Everything between the open tag and the end of the
// body is compared byte for byte. (Review round 3, finding 6: inside xmp and
// plaintext, a `data-slot-id="…"` look-alike is VISIBLE text, never an
// attribute, so it must not be masked.)
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
 */
export function normalizeHtml(html) {
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
    out += closing ? tagText : maskSlotIdAttributes(tagText);
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

/** Masks the `data-slot-id` attribute values inside one tag's text. Walks the
 *  attribute region the way the HTML tokenizer does — names, `=`, quoted or
 *  unquoted values — and copies every byte it does not mask. */
function maskSlotIdAttributes(tagText) {
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
      const masked = name === "data-slot-id" && /^[0-9a-f]{20}$/.test(value);
      out += q + (masked ? "SLOT" : value) + (closeQ === -1 ? "" : q);
      k = closeQ === -1 ? tagText.length : closeQ + 1;
    } else {
      // An unquoted value: never masked (the mask's shape needs quotes), so
      // a 20-hex unquoted slot id still counts.
      let u = v;
      while (u < tagText.length && !isWhitespace(tagText[u]) && tagText[u] !== ">") u++;
      out += tagText.slice(v, u);
      k = u;
    }
  }
  return out;
}

/** A render result: its HTML normalised by N1, every other field as is. */
export function normalizeRender(result) {
  return result && typeof result === "object" && typeof result.html === "string" ? { ...result, html: normalizeHtml(result.html) } : result;
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
