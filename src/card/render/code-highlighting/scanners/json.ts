// CodeRay JSON scanner.
//
// Truth source: coderay-1.1.3 lib/coderay/scanners/json.rb. The scanner is
// a state machine that emits text tokens of kinds :space, :delimiter,
// :operator, :value, :integer, :float, :error, plus grouped string/key
// spans (:content, :char, :error inside the group).
//
// The HTML encoder then maps each kind through the alpha-style table to
// `<span style="...">...</span>` wrappers; the `:error` kind is the one
// the corpus content exercises (every byte of a non-JSON string is an
// `:error` token, one byte per call).

import { ALPHA_STYLES } from "../alpha-style.js";
import { coderayEscape } from "../escape.js";

/** Look up the alpha-theme inline style for a token kind. Unrecognized
 *  kinds return undefined - the encoder emits a bare span (no `class`
 *  attribute, no `style` attribute) for those, matching Ruby. */
function styleFor(kind: string): string | undefined {
  for (const entry of ALPHA_STYLES) if (entry.kind === kind) return entry.style;
  return undefined;
}

/** Wrap text in `<span style="...">...</span>` if a style exists, else
 *  return the bare text. Mirrors encoders/html.rb#text_token's
 *  `style ? "<span#{style}>#{text}</span>" : text` branch. */
function wrapText(text: string, style: string | undefined): string {
  if (style === undefined) return text;
  return `<span style="${style}">${text}</span>`;
}

/** Build a JSON-key/value group opener: `<span style="...">` plus the
 *  opening quote as a `:delimiter` token, exactly the way json.rb
 *  transitions from `:initial` into `:string`/`:key` via
 *  `encoder.begin_group state` then `encoder.text_token('"', :delimiter)`. */
function beginGroup(kind: "string" | "key"): string {
  // The kind group's wrapper spans every byte inside the string/key.
  // The alpha table has no entry for `:string` or `:key`, so the wrapper
  // style is undefined - the encoder therefore emits a bare `<span>`,
  // which we mirror.
  void styleFor(kind); // (no entry exists; we just need to confirm)
  return "<span>";
}

/** The closing delimiter + group end. Inside a group the only token with
 *  a style is the closing quote as `:delimiter` (no style), then the
 *  group closes with `</span>` (json.rb:63-64). */
function endGroup(closingQuote: string): string {
  void styleFor("delimiter"); // (no style entry)
  return `${closingQuote}</span>`;
}

/** Scan the input as JSON and return the highlighted inner HTML - i.e.
 *  the bytes that go between `<pre>` and `</pre>` inside the CodeRay DIV.
 *  The DIV wrapping is the caller's job (see div-template.ts). */
export function scanJson(input: string): string {
  let out = "";
  let i = 0;
  const N = input.length;
  // json.rb states: :initial, :string, :key
  let state: "initial" | "string" | "key" = "initial";
  // Regexes pulled verbatim from json.rb. The KEY regex is the discriminator
  // between :string and :key (json.rb:41). We don't pull the entire grammar;
  // we re-implement the SAME branches in a small switch - byte output is
  // what matters here, not the regex library.
  const KEY_RE = /^(?:[^\\"]+|\\.)*"\s*:/;
  const ESCAPE_RE = /^(?:\\[bfnrt"\\/]|\\u[a-fA-F0-9]{4})/;
  const UNICODE_ESCAPE_RE = /^\\u[a-fA-F0-9]{4}/;
  while (i < N) {
    if (state === "initial") {
      // scan /\s+/ (json.rb:38) -> :space
      const ws = /^\s+/.exec(input.slice(i));
      if (ws !== null) {
        out += wrapText(coderayEscape(ws[0]), styleFor("space"));
        i += ws[0].length;
        continue;
      }
      const c = input[i];
      if (c === '"') {
        const rest = input.slice(i);
        state = KEY_RE.test(rest.slice(1)) ? "key" : "string";
        out += beginGroup(state) + wrapText(coderayEscape('"'), styleFor("delimiter"));
        i += 1;
        continue;
      }
      if (/^[:,\[\]{}]/.test(c)) {
        out += wrapText(coderayEscape(c), styleFor("operator"));
        i += 1;
        continue;
      }
      if (/^(?:true|false|null)\b/.test(input.slice(i))) {
        const m = /^(?:true|false|null)\b/.exec(input.slice(i))!;
        out += wrapText(coderayEscape(m[0]), styleFor("value"));
        i += m[0].length;
        continue;
      }
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+(?:[eE][-+]?\d+)?|[eE][-+]?\d+)?/.test(input.slice(i))) {
        const m = /^-?(?:0|[1-9]\d*)(?:\.\d+(?:[eE][-+]?\d+)?|[eE][-+]?\d+)?/.exec(input.slice(i))!;
        const kind = /\.|e|E/.test(m[0]) ? "float" : "integer";
        out += wrapText(coderayEscape(m[0]), styleFor(kind));
        i += m[0].length;
        continue;
      }
      // Anything else is :error - one byte at a time (json.rb:56 `getch`).
      out += wrapText(coderayEscape(c), styleFor("error"));
      i += 1;
      continue;
    }
    // state === "string" | "key"
    if (state === "string" || state === "key") {
      const rest = input.slice(i);
      const plain = /^[^\\"]+/.exec(rest);
      if (plain !== null) {
        out += wrapText(coderayEscape(plain[0]), styleFor("content"));
        i += plain[0].length;
        continue;
      }
      if (rest.startsWith('"')) {
        out += endGroup('"');
        i += 1;
        state = "initial";
        continue;
      }
      if (ESCAPE_RE.test(rest)) {
        const m = UNICODE_ESCAPE_RE.test(rest)
          ? /^\\u[a-fA-F0-9]{4}/.exec(rest)!
          : /^\\[bfnrt"\\/]/.exec(rest)!;
        out += wrapText(coderayEscape(m[0]), styleFor("char"));
        i += m[0].length;
        continue;
      }
      if (/^\\./.test(rest)) {
        const m = /^\\./.exec(rest)!;
        out += wrapText(coderayEscape(m[0]), styleFor("content"));
        i += m[0].length;
        continue;
      }
      // \\  or end-of-input - close the group, optionally emit :error
      // for the unmatched backslash, then back to :initial.
      if (rest.startsWith("\\")) {
        out += "</span>";
        out += wrapText(coderayEscape("\\"), styleFor("error"));
        state = "initial";
        i += 1;
        continue;
      }
      // end of input while still inside a group - json.rb:71-73 closes
      // the group without emitting any trailing bytes.
      out += "</span>";
      state = "initial";
      continue;
    }
  }
  return out;
}
