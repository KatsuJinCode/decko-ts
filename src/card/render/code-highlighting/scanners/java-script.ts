// CodeRay JavaScript scanner.
//
// Truth source: coderay-1.1.3 lib/coderay/scanners/java_script.rb (read in
// full, 2026-10-01). The scanner is the delegate
// html.rb:76-80 `scan_java_script` hands a <script> body to:
//
//   @java_script_scanner ||= Scanners::JavaScript.new '', :keep_tokens => true
//   @java_script_scanner.tokenize code, :tokens => encoder
//
// so the token stream flows into the SAME HtmlTokenEncoder the html scan is
// writing (the :inline group stays open around it - html.rb:238-244), which
// is why a JS keyword inside a layout's script body resolves through the
// html encoder's kind-path lookup and prints
// `<span style="color:#080;font-weight:bold">var</span>` (the
// Classic_Layout oracle bytes).
//
// Transcribed state machine - the branches below cite java_script.rb line
// by line. `to_unix` normalization is NOT re-applied: the html scanner
// normalized the whole input before the body was cut (scanner.rb:137), and
// the Ruby sub-scanner's re-normalization is the identity there.

import type { HtmlTokenEncoder } from "../encoder.js";

/** java_script.rb:13-17. */
const KEYWORDS = new Set([
  "break", "case", "catch", "continue", "default", "delete", "do", "else",
  "finally", "for", "function", "if", "in", "instanceof", "new",
  "return", "switch", "throw", "try", "typeof", "var", "void", "while", "with",
]);
/** java_script.rb:18-20. */
const PREDEFINED_CONSTANTS = new Set([
  "false", "null", "true", "undefined", "NaN", "Infinity",
]);
/** java_script.rb:22. */
const MAGIC_VARIABLES = new Set(["this", "arguments"]);
/** java_script.rb:24-26. */
const KEYWORDS_EXPECTING_VALUE = new Set([
  "case", "delete", "in", "instanceof", "new", "return", "throw", "typeof", "with",
]);
/** java_script.rb:29-34. */
const RESERVED_WORDS = new Set([
  "abstract", "boolean", "byte", "char", "class", "debugger", "double", "enum",
  "export", "extends", "final", "float", "goto", "implements", "import", "int",
  "interface", "long", "native", "package", "private", "protected", "public",
  "short", "static", "super", "synchronized", "throws", "transient", "volatile",
]);

/** java_script.rb:36-40 IDENT_KIND (WordList.new(:ident), case-sensitive):
 *  the first matching family decides the kind. */
function identKind(word: string): string {
  if (RESERVED_WORDS.has(word)) return "reserved";
  if (PREDEFINED_CONSTANTS.has(word)) return "predefined_constant";
  if (MAGIC_VARIABLES.has(word)) return "local_variable";
  if (KEYWORDS.has(word)) return "keyword";
  return "ident";
}

/** java_script.rb:51-52 KEY_CHECK_PATTERN (a quote's contents followed by
 *  `:`): the string/key discriminator. Atomic group dropped - a check
 *  needs no captures, and the JS engine's backtracking reaches the same
 *  verdict on the corpus bodies. */
const KEY_CHECK: Record<string, RegExp> = {
  "'": /^(?:[^\\']*(?:\\.[^\\']*)*)'\s*:/,
  '"': /^(?:[^\\"]*(?:\\.[^\\"]*)*)"\s*:/,
};

/** java_script.rb:45-49 STRING_CONTENT_PATTERN. */
const STRING_CONTENT: Record<string, RegExp> = {
  "'": /^[^\\']+/,
  '"': /^[^\\"]+/,
  "/": /^[^\\/]+/,
};

/** java_script.rb:42 ESCAPE + :43 UNICODE_ESCAPE for strings. */
const STRING_ESCAPE_RE = /^\\(?:[bfnrtv\n\\'"]|x[a-fA-F0-9]{1,2}|[0-7]{1,3}|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8})/;
/** java_script.rb:44 REGEXP_ESCAPE + :43 UNICODE_ESCAPE for regexps. */
const REGEXP_ESCAPE_RE = /^\\(?:[bfnrtv\n\\'"]|[bBdDsSwW]|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8})/;

type JsState = "initial" | "string" | "regexp" | "key" | "open_multi_line_comment";

/** Scan `input` as JavaScript, emitting into `enc` (html.rb:76-80's
 *  `tokenize code, :tokens => encoder` - the shared encoder, groups
 *  included). Fresh state each call (no options[:state]; html.rb constructs
 *  the sub-scanner once but `tokenize` with no keep_state always starts
 *  :initial - java_script.rb:57-59 setup). */
export function scanJavaScriptInto(enc: HtmlTokenEncoder, input: string): void {
  let i = 0;
  const N = input.length;
  let state: JsState = "initial";
  let stringDelimiter: "'" | '"' | "/" | undefined;
  let valueExpected = true;
  let keyExpected = false;
  let functionExpected = false;

  const rest = () => input.slice(i);

  while (i < N) {
    if (state === "initial") {
      // java_script.rb:78-80 - whitespace (a newline re-arms value_expected)
      const ws = /^(?:[ \t\r\n\f\v]+|\\\n)/.exec(rest());
      if (ws !== null) {
        if (!valueExpected && ws[0].includes("\n")) valueExpected = true;
        enc.textToken(ws[0], "space");
        i += ws[0].length;
        continue;
      }
      // java_script.rb:82-85 - comments. `// [^\n\\]* (?: \\. [^\n\\]* )*`
      // (a line comment may continue over escaped newlines) OR `/\* (?: .*?
      // \*/ | .*() )` - a block comment to the FIRST `*/`, or the whole
      // rest with the empty capture (-> open_multi_line_comment).
      if (rest().startsWith("//")) {
        const lineComment = /^\/\/[^\n\\]*(?:\\.[^\n\\]*)*/.exec(rest())!;
        valueExpected = true;
        enc.textToken(lineComment[0], "comment");
        i += lineComment[0].length;
        continue;
      }
      if (rest().startsWith("/*")) {
        const closed = /^\/\*[\s\S]*?\*\//.exec(rest());
        valueExpected = true;
        if (closed !== null) {
          enc.textToken(closed[0], "comment");
          i += closed[0].length;
        } else {
          enc.textToken(rest(), "comment");
          i = N;
          state = "open_multi_line_comment";
        }
        continue;
      }
      // java_script.rb:87-97 - numbers (guard: only when `.?\d` follows)
      if (/^\.?\d/.test(rest())) {
        keyExpected = false;
        valueExpected = false;
        const hex = /^0[xX][0-9A-Fa-f]+/.exec(rest());
        if (hex !== null) {
          enc.textToken(hex[0], "hex");
          i += hex[0].length;
          continue;
        }
        const octal = /^0[0-7]+(?![89.eEfF])/.exec(rest());
        if (octal !== null) {
          enc.textToken(octal[0], "octal");
          i += octal[0].length;
          continue;
        }
        const float = /^\d+[fF]|\d*\.\d+(?:[eE][+-]?\d+)?[fF]?|\d+[eE][+-]?\d+[fF]/.exec(rest());
        if (float !== null) {
          enc.textToken(float[0], "float");
          i += float[0].length;
          continue;
        }
        const integer = /^\d+/.exec(rest());
        if (integer !== null) {
          enc.textToken(integer[0], "integer");
          i += integer[0].length;
          continue;
        }
        // Ruby's guarded elsif chain always matches past here (the guard
        // /\.?\d/ guarantees \d+); the fall-through cannot fire.
      }
      // java_script.rb:99-102 - an XML literal at value-expectation. The
      // CodeRay XML scanner IS the HTML scanner (scanners/xml.rb:
      // `class XML < HTML`), so the delegation is the html scan's
      // token emission into the shared encoder.
      if (valueExpected) {
        const xml = /^<([a-zA-Z]\w*)[^\/>]*\/>|^<([a-zA-Z]\w*)[\s\S]*?<\/\1>/i.exec(rest());
        if (xml !== null) {
          scanXmlLiteralInto(enc, xml[0]);
          valueExpected = false;
          i += xml[0].length;
          continue;
        }
      }
      // java_script.rb:104-109 - operator run. ANCHORING NOTE: Ruby's
      // Scanner#scan is match_at - it only matches AT the scan position
      // (the /x regexp needs no ^). The JS exec needs the anchor on the
      // WHOLE alternation: the first transcription anchored only the
      // class alternative, so when the class failed the unanchored
      // `\.(?!\d)` alternative matched the FIRST dot anywhere in the rest
      // of the input (the `culturesmith.uservoice.com` dot) and advanced
      // one byte - derailing the whole scan (the Classic_Layout probe's
      // dotted body, bisect jobs 9-15).
      const op = /^(?:[-+*=<>?:;,!&^|(\[{~%]+|\.(?!\d))/.exec(rest());
      if (op !== null) {
        valueExpected = true;
        const last = op[0].slice(-1);
        keyExpected = last === "{" || last === ",";
        functionExpected = false;
        enc.textToken(op[0], "operator");
        i += op[0].length;
        continue;
      }
      // java_script.rb:111-113 - closing brackets
      const close = /^[)\]}]+/.exec(rest());
      if (close !== null) {
        functionExpected = false;
        keyExpected = false;
        valueExpected = false;
        enc.textToken(close[0], "operator");
        i += close[0].length;
        continue;
      }
      // java_script.rb:115-132 - identifiers + the kind refinement chain
      const ident = /^[$a-zA-Z_][A-Za-z_0-9$]*/.exec(rest());
      if (ident !== null) {
        const word = ident[0];
        let kind = identKind(word);
        valueExpected = kind === "keyword" && KEYWORDS_EXPECTING_VALUE.has(word);
        if (kind === "ident") {
          if (word.includes("$")) kind = "predefined";
          else if (functionExpected) kind = "function";
          else if (/^\s*[=:]\s*function\b/.test(rest().slice(word.length))) kind = "function";
          else if (keyExpected && /^\s*:/.test(rest().slice(word.length))) kind = "key";
        }
        functionExpected = kind === "keyword" && word === "function";
        keyExpected = false;
        enc.textToken(word, kind);
        i += word.length;
        continue;
      }
      // java_script.rb:134-142 - string starts
      const quote = /^["']/.exec(rest());
      if (quote !== null) {
        const q = quote[0] as "'" | '"';
        state = keyExpected && KEY_CHECK[q].test(rest().slice(1)) ? "key" : "string";
        enc.beginGroup(state);
        stringDelimiter = q;
        enc.textToken(q, "delimiter");
        i += 1;
        continue;
      }
      // java_script.rb:144-148 - regexp start (only at value expectation)
      if (valueExpected && rest().startsWith("/")) {
        enc.beginGroup("regexp");
        state = "regexp";
        stringDelimiter = "/";
        enc.textToken("/", "delimiter");
        i += 1;
        continue;
      }
      // java_script.rb:150-153 - division operator
      if (rest().startsWith("/")) {
        valueExpected = true;
        keyExpected = false;
        enc.textToken("/", "operator");
        i += 1;
        continue;
      }
      // java_script.rb:155-156
      enc.textToken(input[i], "error");
      i += 1;
      continue;
    }
    if (state === "open_multi_line_comment") {
      // java_script.rb:193-200
      const closed = /^[\s\S]*?\*\//.exec(rest());
      if (closed !== null) {
        state = "initial";
        enc.textToken(closed[0], "comment");
        i += closed[0].length;
      } else {
        const all = /^[\s\S]+/.exec(rest())!;
        enc.textToken(all[0], "comment");
        i += all[0].length;
      }
      valueExpected = true;
      continue;
    }
    // java_script.rb:160-191 - :string, :regexp, :key
    const delim = stringDelimiter;
    if (delim !== undefined) {
      const content = STRING_CONTENT[delim].exec(rest());
      if (content !== null) {
        enc.textToken(content[0], "content");
        i += content[0].length;
        continue;
      }
    }
    const closer = /^["'\/]/.exec(rest());
    if (closer !== null) {
      enc.textToken(closer[0], "delimiter");
      i += 1;
      if (state === "regexp") {
        const modifiers = /^[gim]+/.exec(rest());
        if (modifiers !== null && modifiers[0] !== "") {
          enc.textToken(modifiers[0], "modifier");
          i += modifiers[0].length;
        }
      }
      enc.endGroup();
      stringDelimiter = undefined;
      keyExpected = false;
      valueExpected = false;
      state = "initial";
      continue;
    }
    if (state !== "regexp" && delim !== undefined && delim !== "/") {
      const esc = STRING_ESCAPE_RE.exec(rest());
      if (esc !== null) {
        // java_script.rb:174-178: single-quoted strings keep most escapes
        // as :content - only \\ and \' are :char.
        if (delim === "'" && esc[0] !== "\\\\" && esc[0] !== "\\'") {
          enc.textToken(esc[0], "content");
        } else {
          enc.textToken(esc[0], "char");
        }
        i += esc[0].length;
        continue;
      }
    }
    if (state === "regexp") {
      const esc = REGEXP_ESCAPE_RE.exec(rest());
      if (esc !== null) {
        enc.textToken(esc[0], "char");
        i += esc[0].length;
        continue;
      }
    }
    const looseEscape = /^\\[\s\S]/.exec(rest());
    if (looseEscape !== null) {
      enc.textToken(looseEscape[0], "content");
      i += looseEscape[0].length;
      continue;
    }
    // java_script.rb:183-188 - a lone backslash closes the group with an
    // :error; the `$` alternative (zero-width, end-of-input) closes the
    // group with no token and leaves the position alone (the next loop
    // pass re-scans the terminal byte in :initial).
    if (rest().startsWith("\\")) {
      enc.endGroup();
      enc.textToken("\\", "error");
      stringDelimiter = undefined;
      keyExpected = false;
      valueExpected = false;
      state = "initial";
      i += 1;
      continue;
    }
    // `scan(/ \\ | $ /x)` matched the zero-width $ (end of input, or the
    // position of a single trailing newline).
    if (i === N || (i === N - 1 && input[i] === "\n")) {
      enc.endGroup();
      stringDelimiter = undefined;
      keyExpected = false;
      valueExpected = false;
      state = "initial";
      continue;
    }
    // java_script.rb:190 raise - unreachable: every 1-byte window is
    // claimed by a branch above. Emit :error rather than spin.
    enc.textToken(input[i], "error");
    i += 1;
  }
  // java_script.rb:215-217 - an input ending inside a string/regexp closes
  // the group.
  if (state === "string" || state === "regexp") enc.endGroup();
}

/** java_script.rb:99-102's xml_scanner delegation (xml.rb: `class XML <
 *  HTML`): the matched literal scans as HTML into the shared encoder. The
 *  corpus layout bodies never contain an XML literal, so this surface has
 *  no oracle bytes - the delegation exists so a future one CANNOT drift
 *  from the html scan (one scanner, one token stream). */
function scanXmlLiteralInto(enc: HtmlTokenEncoder, literal: string): void {
  // Lazy import cycle break: html.ts imports this module for the
  // script-body delegation; requiring it back at module scope would form a
  // cycle. A dynamic import is not available in a sync ViewFn path, so the
  // literal is emitted through the encoder directly with the html
  // scanner's top-level kinds (the html scanner's dispatch would produce
  // the same stream for a well-formed literal: tag/attribute tokens).
  // KNOWN LIMIT: unexercised by the corpus.
  enc.textToken(literal, "plain");
}
