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

/** Build a JSON-key/value group opener: the group's own span plus the
 *  opening quote as a `:delimiter` token, exactly the way json.rb
 *  transitions from `:initial` into `:string`/`:key` via
 *  `encoder.begin_group state` then `encoder.text_token('"', :delimiter)`.
 *
 *  The inline styles are the alpha stylesheet's GROUP-SCOPED rules
 *  (coderay-1.1.3 styles/alpha.rb) - the oracle bytes pin them
 *  (view-lane shard-000028 *Ace 33795, 2026-10-01):
 *    `.key { color: #606 }`                (alpha.rb:97)  - key group span
 *    `.key .delimiter { color: #404 }`     (alpha.rb:99)  - key quotes
 *    `.key .char { color: #60f }`          (alpha.rb:98)  - key escapes
 *    `.string { background-color:hsla(0,100%,50%,0.05) }` (alpha.rb:122)
 *    `.string .delimiter { color: #710 }`  (alpha.rb:125) - string quotes
 *    `.string .content { color: #D20 }`    (alpha.rb:124)
 *    `.string .char { color: #b0b }`       (alpha.rb:123)
 *  The key CONTENT span carries NO style (`.key .content` has no alpha
 *  rule) but the span itself is still emitted - the oracle bytes carry
 *  `<span>default</span>` inside the key group; the encoder emits the
 *  span unconditionally for tokens inside a group and only the style
 *  attribute is style-dependent. */
const GROUP_SCOPED: Record<
  "string" | "key",
  { group: string; delimiter: string; content: string | undefined; char: string }
> = {
  key: {
    group: "color:#606",
    delimiter: "color:#404",
    content: undefined, // .key .content: no alpha rule -> bare <span>
    char: "color:#60f",
  },
  string: {
    group: "background-color:hsla(0,100%,50%,0.05)",
    delimiter: "color:#710",
    content: "color:#D20",
    char: "color:#b0b",
  },
};

function groupOpener(kind: "string" | "key"): string {
  return `<span style="${GROUP_SCOPED[kind].group}">`;
}

function groupDelimiter(kind: "string" | "key", quote: string): string {
  return `<span style="${GROUP_SCOPED[kind].delimiter}">${coderayEscape(quote)}</span>`;
}

/** Content/char tokens INSIDE a group: the span is unconditional, the
 *  style is the group-scoped alpha rule (undefined -> bare span). */
function groupInner(kind: "string" | "key", token: "content" | "char", text: string): string {
  const style = GROUP_SCOPED[kind][token];
  const escaped = coderayEscape(text);
  return style === undefined ? `<span>${escaped}</span>` : `<span style="${style}">${escaped}</span>`;
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
        out += groupOpener(state) + groupDelimiter(state, '"');
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
        out += groupInner(state, "content", plain[0]);
        i += plain[0].length;
        continue;
      }
      if (rest.startsWith('"')) {
        out += groupDelimiter(state, '"') + "</span>";
        i += 1;
        state = "initial";
        continue;
      }
      if (ESCAPE_RE.test(rest)) {
        const m = UNICODE_ESCAPE_RE.test(rest)
          ? /^\\u[a-fA-F0-9]{4}/.exec(rest)!
          : /^\\[bfnrt"\\/]/.exec(rest)!;
        out += groupInner(state, "char", m[0]);
        i += m[0].length;
        continue;
      }
      if (/^\\./.test(rest)) {
        const m = /^\\./.exec(rest)!;
        out += groupInner(state, "content", m[0]);
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
