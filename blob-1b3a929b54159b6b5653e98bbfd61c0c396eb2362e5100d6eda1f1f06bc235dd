// format-validations.ts -- the save-time validations of card-mod-format's
// Number and JSON cardtypes:
//
//   set/type/number.rb:7-9
//     event :validate_number, :validate, on: :save do
//       errors.add :content, t(:format_not_numeric, content: content) unless content.number?
//     end
//   set/type/json.rb:3-11
//     event :validate_json, :validate, on: :save, changed: :content do
//       check_json_syntax if content.present?
//     end
//     ... rescue JSON::ParserError => e
//       errors.add t(:format_invalid_json), e.message.sub(/^\d+: /, "").to_s
//
// String#number? is `true if Float(self) rescue false`
// (card-1.110.0 config/initializers/01_core_extensions/object.rb:3-7), so
// the number check is Ruby's Kernel#Float string grammar. The JSON check
// reproduces the error messages of the json gem the oracle bundle pins
// (json 3.0.2, ext/json/ext/parser/parser.c): the same phases, the same
// message formats, the same 32-byte fragment and line/column rules.

/** Kernel#Float(String) acceptance (object.c rb_cstr_to_dbl, strict mode):
 *  optional surrounding whitespace, optional sign, then a decimal with
 *  optional fraction and exponent (single underscores allowed between
 *  digits), or a hexadecimal integer ("0x1A"). A leading-dot fraction
 *  (".5") is accepted, a trailing dot ("5.") rejected (calibrated against
 *  Ruby 3.3: tests/card/mod-loader/fixtures/ruby-float-acceptance.json). */
export function rubyFloatParsable(value: string): boolean {
  const s = value.replace(/^[\s\x00]+|[\s\x00]+$/g, "");
  if (s === "") return false;
  const digits = "\\d+(?:_\\d+)*";
  const decimal = new RegExp(
    `^[+-]?(?:${digits}(?:\\.${digits})?|\\.${digits})(?:[eE][+-]?${digits})?$`,
  );
  const hex = /^[+-]?0[xX][0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/;
  return decimal.test(s) || hex.test(s);
}

/** format_not_numeric (card-mod-format config/locales/en.yml:13) under the
 *  :content key, as the errors view shows it. */
export function numberValidationMessage(content: string): string | null {
  return rubyFloatParsable(content) ? null : `CONTENT: '${content}' is not numeric`;
}

/** format_invalid_json (en.yml:9) is the errors KEY ("invalid json"), the
 *  parser message the value; the errors view upcases the key. */
export function jsonValidationMessage(content: string): string | null {
  if (content.trim() === "") return null; // content.present?
  const error = jsonSyntaxError(content);
  return error === null ? null : `INVALID JSON: ${error}`;
}

// ---------------------------------------------------------------------------
// the json 3.0.2 parser's error behaviour (default JSON.parse config:
// no NaN, no trailing commas, no comments)
// ---------------------------------------------------------------------------

const FRAGMENT_LEN = 32;

class JsonSyntaxError extends Error {}

interface ParseState {
  readonly bytes: Uint8Array;
  cursor: number;
}

/** build_parse_error_message (parser.c:617-650): the %s argument is the
 *  input at the cursor, cut at 32 bytes or the first NUL/space/tab/CR/LF,
 *  trimmed back to a whole UTF-8 character and single-quoted; "EOF" at the
 *  end; the raw rest of the input when the cut leaves nothing. */
function fragment(state: ParseState): string {
  const { bytes, cursor } = state;
  if (cursor >= bytes.length) return "EOF";
  let len = 0;
  while (len < FRAGMENT_LEN && cursor + len < bytes.length) {
    const ch = bytes[cursor + len];
    if (ch === 0 || ch === 0x0a || ch === 0x20 || ch === 0x09 || ch === 0x0d) break;
    len++;
  }
  if (len === 0) return utf8(bytes.subarray(cursor));
  // buffer[len] is the last copied byte (buffer[0] is the quote)
  while (len > 0 && bytes[cursor + len - 1] >= 0x80 && bytes[cursor + len - 1] < 0xc0) len--;
  if (len > 0 && bytes[cursor + len - 1] >= 0xc0) len--;
  return `'${utf8(bytes.subarray(cursor, cursor + len))}'`;
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** cursor_position (parser.c): 1-based line; the column counts bytes back
 *  to (and excluding) the previous newline, the cursor byte included. */
function position(state: ParseState): { line: number; column: number } {
  const { bytes } = state;
  let cursor = Math.min(state.cursor, bytes.length);
  let column = 0;
  let line = 1;
  while (cursor >= 0) {
    if (bytes[cursor--] === 0x0a) {
      line++;
      break;
    }
    column++;
  }
  while (cursor >= 0) {
    if (bytes[cursor--] === 0x0a) line++;
  }
  return { line, column };
}

function fail(state: ParseState, format: string, at?: number): never {
  if (at !== undefined) state.cursor = at;
  const message = format.includes("%s") ? format.replace("%s", fragment(state)) : format;
  const { line, column } = position(state);
  throw new JsonSyntaxError(`${message} at line ${line} column ${column}`);
}

const peek = (s: ParseState): number => (s.cursor < s.bytes.length ? s.bytes[s.cursor] : 0);
const isEos = (s: ParseState): boolean => s.cursor >= s.bytes.length;

function eatWhitespace(s: ParseState): void {
  while (!isEos(s)) {
    const c = peek(s);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) s.cursor++;
    else if (c === 0x2f) fail(s, "unexpected token %s"); // '/': comments are off
    else break;
  }
}

function matchKeyword(s: ParseState, keyword: string): void {
  const kw = new TextEncoder().encode(keyword);
  for (let i = 0; i < kw.length; i++) {
    if (s.bytes[s.cursor + i] !== kw[i]) fail(s, "unexpected token %s");
  }
  s.cursor += kw.length;
}

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;
const isHex = (c: number): boolean =>
  isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);

/** json_parse_number: an optional '-', then '0' or [1-9][0-9]*; a fraction
 *  needs a digit after '.', an exponent a digit after [eE][+-]?. A '0'
 *  followed by a digit is invalid. Failures report from the value start. */
function parseNumber(s: ParseState, start: number): void {
  if (peek(s) === 0x2d) s.cursor++;
  if (peek(s) === 0x30) {
    s.cursor++;
    if (isDigit(peek(s))) fail(s, "invalid number: %s", start);
  } else if (isDigit(peek(s))) {
    while (isDigit(peek(s))) s.cursor++;
  } else {
    fail(s, "invalid number: %s", start);
  }
  if (peek(s) === 0x2e) {
    s.cursor++;
    if (!isDigit(peek(s))) fail(s, "invalid number: %s", start);
    while (isDigit(peek(s))) s.cursor++;
  }
  if (peek(s) === 0x65 || peek(s) === 0x45) {
    s.cursor++;
    if (peek(s) === 0x2b || peek(s) === 0x2d) s.cursor++;
    if (!isDigit(peek(s))) fail(s, "invalid number: %s", start);
    while (isDigit(peek(s))) s.cursor++;
  }
}

/** json_parse_string + json_string_unescape: the cursor is on the opening
 *  quote. Control characters below 0x20 and unknown escapes are syntax
 *  errors at the offending byte; \u needs four hex digits and surrogates
 *  must pair. Returns false at end of input (no closing quote). */
function parseString(s: ParseState): boolean {
  s.cursor++;
  while (!isEos(s)) {
    const c = peek(s);
    if (c === 0x22) {
      s.cursor++;
      return true;
    }
    if (c < 0x20) fail(s, "invalid ASCII control character in string: %s");
    if (c !== 0x5c) {
      s.cursor++;
      continue;
    }
    const escapeAt = s.cursor;
    const e = s.bytes[s.cursor + 1];
    if (e === undefined) {
      s.cursor = s.bytes.length;
      return false;
    }
    if (e === 0x75) {
      const code = readUnicodeEscape(s, escapeAt);
      s.cursor = escapeAt + 6;
      if (code >= 0xd800 && code <= 0xdbff) {
        if (s.bytes[s.cursor] !== 0x5c || s.bytes[s.cursor + 1] !== 0x75) {
          fail(s, "incomplete surrogate pair at %s", escapeAt);
        }
        const low = readUnicodeEscape(s, s.cursor);
        if (low < 0xdc00 || low > 0xdfff) fail(s, "invalid surrogate pair at %s", escapeAt);
        s.cursor += 6;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        fail(s, "unpaired trailing surrogate at %s", escapeAt);
      }
      continue;
    }
    if ([0x22, 0x5c, 0x2f, 0x62, 0x66, 0x6e, 0x72, 0x74].includes(e)) {
      s.cursor += 2;
      continue;
    }
    fail(s, "invalid escape character in string: %s", escapeAt);
  }
  return false;
}

function readUnicodeEscape(s: ParseState, escapeAt: number): number {
  const p = escapeAt + 2;
  if (p + 4 > s.bytes.length) fail(s, "incomplete unicode character escape sequence at %s", escapeAt);
  for (let i = 0; i < 4; i++) {
    if (!isHex(s.bytes[p + i])) fail(s, "incomplete unicode character escape sequence at %s", escapeAt);
  }
  return parseInt(utf8(s.bytes.subarray(p, p + 4)), 16);
}

type Frame = { type: "root" | "array" | "object"; count: number };

/** json_parse_any's phase machine, error paths only (no values built). */
function parseAny(s: ParseState): void {
  const stack: Frame[] = [{ type: "root", count: 0 }];
  type Phase = "value" | "key" | "colon" | "arrayComma" | "objectComma" | "done";
  let phase: Phase = "value";
  const completed = (): Phase => {
    const top = stack[stack.length - 1];
    top.count++;
    if (top.type === "root") return "done";
    return top.type === "array" ? "arrayComma" : "objectComma";
  };
  while (phase !== "done") {
    if (phase === "value") {
      eatWhitespace(s);
      const start = s.cursor;
      const c = peek(s);
      if (c === 0x6e) { matchKeyword(s, "null"); phase = completed(); }
      else if (c === 0x74) { matchKeyword(s, "true"); phase = completed(); }
      else if (c === 0x66) { matchKeyword(s, "false"); phase = completed(); }
      else if (c === 0x4e || c === 0x49) fail(s, "unexpected token %s");
      else if (c === 0x2d || isDigit(c)) { parseNumber(s, start); phase = completed(); }
      else if (c === 0x22) {
        if (!parseString(s)) fail(s, 'unexpected end of input, expected closing "');
        phase = completed();
      } else if (c === 0x5b) {
        s.cursor++;
        eatWhitespace(s);
        if (peek(s) === 0x5d) { s.cursor++; phase = completed(); }
        else { stack.push({ type: "array", count: 0 }); phase = "value"; }
      } else if (c === 0x7b) {
        s.cursor++;
        eatWhitespace(s);
        if (peek(s) === 0x7d) { s.cursor++; phase = completed(); }
        else { stack.push({ type: "object", count: 0 }); phase = "key"; }
      } else if (c === 0) {
        if (isEos(s)) fail(s, "unexpected end of input");
        fail(s, "unexpected NULL byte: %s");
      } else {
        fail(s, "unexpected character: %s");
      }
    } else if (phase === "key") {
      eatWhitespace(s);
      const top = stack[stack.length - 1];
      if (peek(s) === 0x22) {
        if (!parseString(s)) fail(s, 'unexpected end of input, expected closing "');
        top.count++; // the key is pushed onto the value stack
        phase = "colon";
      } else {
        fail(s, top.count === 0 ? "expected object key, got %s" : "expected object key, got: %s");
      }
    } else if (phase === "colon") {
      eatWhitespace(s);
      const top = stack[stack.length - 1];
      if (peek(s) === 0x3a) {
        s.cursor++;
        phase = "value";
      } else {
        fail(s, top.count === 1 ? "expected ':' after object key" : "expected ':' after object key, got: %s");
      }
    } else if (phase === "arrayComma") {
      eatWhitespace(s);
      const c = peek(s);
      if (c === 0x2c) { s.cursor++; phase = "value"; }
      else if (c === 0x5d) { s.cursor++; stack.pop(); phase = completed(); }
      else fail(s, "expected ',' or ']' after array value");
    } else {
      eatWhitespace(s);
      const c = peek(s);
      if (c === 0x2c) { s.cursor++; phase = "key"; }
      else if (c === 0x7d) { s.cursor++; stack.pop(); phase = completed(); }
      else fail(s, "expected ',' or '}' after object value, got: %s");
    }
  }
  eatWhitespace(s);
  if (!isEos(s)) fail(s, "unexpected token at end of stream %s");
}

/** The JSON::ParserError message JSON.parse raises for `content`, with the
 *  leading "<n>: " stripped as validate_json does; null when it parses. */
export function jsonSyntaxError(content: string): string | null {
  const state: ParseState = { bytes: new TextEncoder().encode(content), cursor: 0 };
  try {
    parseAny(state);
    return null;
  } catch (error) {
    if (error instanceof JsonSyntaxError) return error.message;
    throw error;
  }
}
