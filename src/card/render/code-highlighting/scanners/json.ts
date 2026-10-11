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
 *  (view-surface shard-000028 *Ace 33795, 2026-10-01):
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

/** Whether the JSON string body starting at `start` (the char just after an
 *  opening quote) closes at an unescaped quote whose following characters
 *  are only whitespace up to a colon - i.e. the string is a KEY, not a
 *  value. Single pass, no allocation, no regex backtracking possible.
 *
 *  This answers exactly what json.rb:41's key regex
 *  `/^(?:[^\\"]+|\\.)*"\s*:/` answers - and the old form was this port's
 *  one catastrophic-backtracking hazard: its star's alternatives overlap
 *  (`[^\\"]+` consumes 1..k chars, `\\.` also starts at a backslash), so on
 *  any string VALUE (closing quote NOT followed by `:`, i.e. the failure
 *  case) the engine enumerated every composition of the run before failing,
 *  2^(n-1) branches for an n-char run. Real deck content is full of that
 *  shape (any JSON card with a multi-char string value); card 53's 618-byte
 *  tinyMCE config spun the scanner indefinitely, while the corpus fixtures
 *  never caught it because the sanitize transform's filler is quote-free.
 *  Pin: tests/card/render/code-highlighting/
 *  scanjson-key-discrimination-linear-time-pin.test.ts
 *
 *  Why the walk is equivalent to the regex: every backtracking split of the
 *  star shares one verdict, because the run can only terminate at the FIRST
 *  unescaped quote - every earlier character is consumed by exactly one
 *  alternative, no quote can occur inside the run, and a backslash that
 *  `\\.` cannot step over (backslash at end of input, or before one of the
 *  four chars `.` excludes without dotAll: \n \r \u2028 \u2029) strands the
 *  star before an unmatchable position. So there is exactly one candidate
 *  closing quote, and the `\s*:` tail is checked once. Escape classes are
 *  mirrored exactly: `\\.` = backslash + any ONE char except those four
 *  line terminators; `[^\\"]` = any single char that is neither backslash
 *  nor quote, including newlines. */
export function looksLikeJsonKey(input: string, start: number): boolean {
  const N = input.length;
  let i = start;
  while (i < N) {
    const c = input.charCodeAt(i);
    if (c === 0x22 /* " */) {
      i += 1;
      while (i < N && /\s/.test(input[i])) i += 1;
      return i < N && input[i] === ":";
    }
    if (c === 0x5c /* \ */) {
      const next = i + 1 < N ? input.charCodeAt(i + 1) : -1;
      if (next === -1 || next === 0x0a || next === 0x0d || next === 0x2028 || next === 0x2029) {
        return false;
      }
      i += 2;
      continue;
    }
    i += 1;
  }
  return false;
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
  // Regexes pulled verbatim from json.rb. The KEY/String discrimination
  // (json.rb:41) is the one spot where the verbatim regex
  // /^(?:[^\\"]+|\\.)*"\s*:/ backtracks catastrophically on real content -
  // it runs as the linear looksLikeJsonKey walk above instead; the
  // escape/atom regexes below have no nested quantifiers and stay verbatim.
  // We don't pull the entire grammar; we re-implement the SAME branches in a
  // small switch - byte output is what matters here, not the regex library.
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
        state = looksLikeJsonKey(input, i + 1) ? "key" : "string";
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
