// The harness's normalisation, stated once (reference-harness/SPEC.md,
// "Normalisation"). There are three kinds of rule, and nothing else is applied:
//
// - A mask erases a value. A mask is allowed only for a field shown to vary
//   between two runs of the same oracle on the same fixture, and it is as
//   narrow as that field's exact shape. There is one: N1.
// - A plain canonical form compares the same value in another encoding and
//   erases nothing: N2, JSON key order, and N3, class-token order inside a
//   `class` attribute.
// - A canonical form over a volatile value replaces values that are a pure
//   function of something outside the engines (a per-process hash seed, the
//   capture clock, the capture host's filesystem, the host VM's stack format,
//   the host language's error naming) with one placeholder, so the comparison
//   sees only what the engines themselves decide. The surrounding bytes still
//   count: an engine whose output differs anywhere outside the volatile span
//   still fails. There are five: N4 (collapse ids), N5 (relative-time spans),
//   N6 (backtrace frame lines), N7 (capture-host debug content), N8 (an
//   error record's class name).
//
// Application is structural, not textual: the rules run inside a walk of the
// HTML's real grammar, so a mask lands only where an attribute can be, a
// comment, a raw-text body and element text are never mistaken for markup,
// and a `data-slot-id=` look-alike in visible text still counts as content.
//
// Every rule has tests (runner/test/normalize.test.mjs) that a nearby
// meaningful change still fails.

/**
 * N8. An error record's class name, on an operation whose recorded result IS
 * the failure. Where the oracle raised while serving, its capture holds
 * `{class, message}` - the class named through Ruby's naming
 * (`Card::Error::CodenameNotFound`, module path included); the engine names
 * its own Error subclass through the host language's convention
 * (`CodenameNotFoundError`, flat, suffixed). A class NAME is the host
 * language's identity in the same class as N7's capture-host content and N6's
 * frame lines: no port can emit the other language's naming. The canonical
 * form keeps the class's name proper - the terminal `::` segment of the Ruby
 * path, with one trailing `Error` suffix (the JS subclass convention) dropped
 * from either side - so a reproduced failure must still be THE SAME failure:
 * another class proper, or another message (compared byte-exact), still
 * fails. Measured on synthetic-v2: 24 oracle ops record the upstream raise
 * `Card::Error::CodenameNotFound: unknown codename: test_context`; the engine
 * raises `CodenameNotFoundError` with the byte-same message on all 24, and
 * after N8 the failure records compare equal
 * (benchmarks/seconds-corpus/upstream-failure-classification-evidence.md).
 */
export function canonicalErrorClass(name) {
  if (typeof name !== "string" || name === "") return name;
  const proper = name.includes("::") ? name.slice(name.lastIndexOf("::") + 2) : name;
  const stem = "Error";
  return proper.endsWith(stem) && proper.length > stem.length ? proper.slice(0, -stem.length) : proper;
}

/** N8 on an error record: the class's host naming canonicalizes; the message
 *  and every other field compare exact. */
export function normalizeErrorRecord(error) {
  if (error === null || typeof error !== "object") return error;
  return { ...error, class: canonicalErrorClass(error.class) };
}

/** Equality for two recorded failures under N8 and N2. */
export function sameFailure(a, b) {
  return sameJson(normalizeErrorRecord(a), normalizeErrorRecord(b));
}

/**
 * N1's token shape: the `data-slot-id` attribute holding exactly 20 lowercase
 * hex digits, in attribute position, quote style kept. Ruby Decko draws it at
 * random for every render, so two oracle runs of one fixture differ in it and
 * nowhere else (REFERENCE-HARNESS evidence: 9,056 slot ids in 1,350 renders).
 *
 * This regex is the token's shape for evidence counting (compare-runs.mjs
 * matches it against raw recorded strings). The mask itself is applied only
 * where the HTML grammar puts an attribute - see normalizeHtml - because a
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
// body is compared byte for byte. (Inside xmp and
// plaintext, a `data-slot-id="…"` look-alike is VISIBLE text, never an
// attribute, so it must not be masked — and no other rule applies there.)
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title", "xmp"]);
const RAW_TEXT_NEVER_CLOSES = "plaintext";

const isWhitespace = (c) => c === " " || "\n\r\t\f".includes(c);
const isNameChar = (c) => /[A-Za-z0-9:_-]/.test(c);

/**
 * N4. A mod-accordion collapse id's numeric context: the
 * `card-<safe-key>-<n>-collapse-id` token whose <n> is Ruby's `title.hash`
 * for the accordion section title (card/mod/core/set/all/admin.rb:96
 * `context: title.hash`, feeding mod/bootstrap accordion.rb:13
 * `collapse_id: "card-#{card.name.safe_key}-#{args[:context]}-collapse-id"`).
 * Ruby hashes strings with a per-process seed, so the digits are process
 * noise, not bytes: two stock-oracle runs of synthetic-v2 over every op that
 * carries the token (30 of 2,557, 84 tokens) differ in 84 of 84 tokens and,
 * after N1 and this rule, in nothing else (benchmarks/seconds-corpus/
 * collapse-id-nondeterminism-evidence.md). The literal contexts ("files",
 * "depends_on", view names) hold no digits and never match. Canonical form,
 * not erasure: each distinct digit run becomes N4#k in first-appearance
 * order per html string, so the accordion button's data-bs-target and its
 * panel id must still agree - an engine that emitted mismatched ids
 * normalizes to different placeholders and still fails.
 */
export const COLLAPSE_ID = /(card-[a-z0-9_]+-)(-?\d+)(-collapse-id)/g;

/**
 * N5. A relative-time span: Rails `time_ago_in_words` output
 * (actionview date_helper.rb:95-165, the vocabulary the engine's
 * text-helpers.ts port carries byte-exact). The oracle's words are a pure
 * function of the capture clock the harness freezes
 * (oracle/lib/harness_env.rb freeze_clock!, travel_to the fixture clock):
 * a card built moments before the capture renders "less than a minute"
 * forever, which no engine clock can reproduce and no two engines' live
 * clocks agree on. Every phrase becomes one placeholder, so the span's
 * presence and position still count while its clock-drawn value does not.
 * The surrounding sentence must still match byte for byte ("added ... ago
 * by", the whole attribute or line around it), so a real content change
 * beside a span still fails. Measured on synthetic-v2: 22 of 2,557 oracle
 * ops carry a span (179 "less than a minute", one "2 days"); the four ops
 * whose only divergence was the span grade identical after N5, and no
 * identical op breaks (benchmarks/seconds-corpus/
 * capture-clock-and-debug-span-canonicalization-evidence.md).
 */
export const RELATIVE_TIME =
  /\b(less than a minute|half a minute|less than \d+ seconds|about (?:[1-9]|1[0-9]|2[0-4]) hours?|about (?:[1-9]|1[0-2]) months?|about [1-9][0-9]* years?|over [1-9][0-9]* years?|almost [1-9][0-9]* years?|(?:[1-9]|1[0-9]|2[0-9]|3[0-9]|4[0-4]) minutes?|(?:[1-9]|1[0-9]|2[0-4]) hours?|(?:[1-9]|[12][0-9]|30) days?|(?:[1-9]|1[0-2]) months?)\b/g;

/**
 * N7. The capture host's identity inside an admin-only render-error span's
 * title. The oracle's quiet spans (card-mod-format set/all/html/error.rb)
 * embed the Ruby debug page, whose backtrace frames carry the capturing
 * machine's absolute paths (the Ruby install, the gem home, the harness
 * checkout) and, where an object lands in the message, its heap address.
 * Those bytes are the capture machine's, not the oracle's semantics: a
 * capture from another host - or the same deck captured after a checkout
 * move - differs in them while saying the same thing. Inside a title that
 * begins with the debug page marker they become placeholders; the error
 * message, the frame COUNT (N6) and every byte outside the title still
 * count. Measured on synthetic-v2: 8 oracle ops carry the page (554 path
 * tokens, 2 heap addresses). The engine emits the same debug page where it
 * raises as stock Ruby raises (error.rb's backtrace_link posture), so this
 * rule stops the comparison from demanding the capture machine's
 * filesystem on either side (same evidence receipt as N5).
 */
export const ERROR_SPAN_TITLE =
  /(&lt;h3&gt;Error message \(visible to admin only\)&lt;\/h3&gt;)/;
// A path token ends at the frame separator: `.../signing_algorithm.rb:39:in`
// keeps its `:39:in` outside the placeholder, so the frame's line and method
// stay compared oracle semantics (no Windows path carries a colon).
const CAPTURE_HOST_PATH = /\b[A-Za-z]:[/\\][^\s<>&":]+/g;
const HEAP_ADDRESS = /0x[0-9a-fA-F]{6,16}/g;

/**
 * N6. A backtrace frame line, inside a render-error span title's backtrace
 * div. Ruby's debug page embeds `exception.backtrace * "<br>\n"` - the
 * raising VM's own stack, one line per frame. The two sides run different
 * languages: the oracle's frames are Ruby's (`path:line:in \`method'`,
 * boot-inclusive, dozens of frames from the process's startup up), the
 * engine's are V8's (`at fn (file:///path:line:col)`). A frame line is the
 * host VM's identity - its language, its paths, its boot history - in the
 * same class as N7's capture-host content: no port can emit the other
 * language's stack, and nothing in the oracle's semantics lives in a
 * frame's TEXT. Each frame line therefore becomes the one placeholder
 * `N6#frame`, and the frame COUNT becomes the checkable invariant: the
 * `<br>`-separated structure stays compared, so a side emitting a different
 * number of its own frames still fails, as do the heading, the error
 * message and every byte outside the div (they keep their existing rules).
 * Measured on synthetic-v2 at the raise posture: the 8 oracle debug pages
 * carry 51-63 Ruby frames; the engine's raise sites produce 8-10 V8 frames
 * (Node's Error.stackTraceLimit caps at 10), so the six raise-posture rows
 * stay pinned with the count as their recorded residual
 * (benchmarks/seconds-corpus/backtrace-frame-canonicalization-evidence.md).
 */
export const FRAME_MARKER = "N6#frame";
// The debug page's backtrace div: the region between the message paragraph's
// close and the div's close, both html-escaped inside the title attribute.
// The frames are joined by the escaped Ruby join separator; splitting on it
// yields one segment per frame line.
const BACKTRACE_DIV = /(&lt;\/p&gt;\s*&lt;div&gt;)([\s\S]*?)(&lt;\/div&gt;)/;
const FRAME_SEPARATOR = /&lt;br&gt;\n/g;

/** N7 then N6, inside a debug-page title: the capture host's path and heap
 *  tokens become placeholders, then each backtrace frame line inside the
 *  div becomes N6#frame - separators and everything outside the div stay
 *  exact, so the frame count and the div's anchors still compare. */
function canonicalizeDebugTitle(body) {
  return body
    .replace(CAPTURE_HOST_PATH, "N7#path")
    .replace(HEAP_ADDRESS, "N7#addr")
    .replace(BACKTRACE_DIV, (_, pre, frames, post) => {
      // an empty div holds zero frames; `"".split(sep)` would yield [""] and
      // wrongly normalize to one
      const lines = frames === "" ? [] : frames.split(FRAME_SEPARATOR);
      return pre + lines.map(() => FRAME_MARKER).join("&lt;br&gt;\n") + post;
    });
}

/**
 * N1, N3, N4, N5 and N7, applied only where the HTML grammar puts them.
 * Walks the markup: a comment, a doctype, CDATA and a processing instruction
 * are copied verbatim; a tag's attributes are visited one by one; a raw text
 * element's body is copied verbatim to its end (or to EOF for plaintext).
 * Inside a quoted attribute value: the slot-id mask (N1, exact shape only),
 * the class-token canonical form (N3, `class` only), the collapse-id
 * canonical form (N4, shape only) and - in a `title` value that opens with
 * the admin-only debug-page marker - the capture-host and frame canonical
 * forms (N7 then N6). In text regions between tags: N4 and N5, whose shapes
 * are content-shaped, never markup-shaped. One `seen` map per html string
 * keeps N4's placeholders consistent across the button and the panel: an
 * engine that emitted mismatched ids still fails.
 */
export function normalizeHtml(html, { classTokenOrder = true } = {}) {
  if (typeof html !== "string") return html;
  const seen = new Map();
  const collapse = (text) =>
    text.replace(COLLAPSE_ID, (_, pre, digits, post) => {
      let k = seen.get(digits);
      if (k === undefined) {
        k = `N4#${seen.size + 1}`;
        seen.set(digits, k);
      }
      return `${pre}${k}${post}`;
    });
  const elapse = (text) => text.replace(RELATIVE_TIME, "N5#elapsed");
  let out = "";
  let i = 0;
  const lower = html.toLowerCase();
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += canonicalizeText(html.slice(i), collapse, elapse);
      break;
    }
    out += canonicalizeText(html.slice(i, lt), collapse, elapse);
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
    out += closing ? tagText : normalizeTagAttributes(tagText, classTokenOrder, collapse, elapse);
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

function canonicalizeText(text, collapse, elapse) {
  return elapse(collapse(text));
}

/** Applies the attribute-level rules inside one tag's text. Walks the
 *  attribute region the way the HTML tokenizer does — names, `=`, quoted or
 *  unquoted values — and copies every byte no rule rewrites. */
function normalizeTagAttributes(tagText, classTokenOrder, collapse, elapse) {
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
      const isTitle = name.toLowerCase() === "title";
      let next = value;
      if (name === "data-slot-id" && /^[0-9a-f]{20}$/.test(value)) {
        next = "SLOT"; // N1: the exact mask shape, and nothing looser
      } else {
        if (isClass && classTokenOrder) next = sortClassTokens(value); // N3
        next = collapse(next); // N4, shape only, seen-map shared with the text regions
        next = elapse(next); // N5, shape only
      }
      if (isTitle && ERROR_SPAN_TITLE.test(next)) {
        next = canonicalizeDebugTitle(next); // N7 then N6
      }
      out += q + next + (closeQ === -1 ? "" : q);
      k = closeQ === -1 ? tagText.length : closeQ + 1;
    } else {
      // An unquoted value: no rule applies (every rule's shape needs quotes),
      // so an unquoted slot id or class list still counts byte for byte.
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

/** A render result: its HTML normalised by the html rules (N1, N3, N4, N5 and
 *  the debug-title forms), every other field as is. `classTokenOrder: false`
 *  grades with N3 off (the evidence for the rule, and what the raw
 *  class-token order is on its own). */
export function normalizeRender(result, options) {
  return result && typeof result === "object" && typeof result.html === "string" ? { ...result, html: normalizeHtml(result.html, options) } : result;
}

/** Stable JSON: object keys sorted, so key order never counts; leaf strings
 *  get the string-level rule (SPEC.md "Normalisation" N2: the per-journey
 *  server port, which both engines draw at random). */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  if (typeof value === "string") return value.replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:PORT");
  return value;
}

/** True when two values are equal under N2. */
export function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
