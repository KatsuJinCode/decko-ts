// CodeRay CSS scanner.
//
// Truth source: coderay-1.1.3 lib/coderay/scanners/css.rb. The scanner is
// a state machine with states [:initial, :block, :media, :media_before_name,
// :media_after_name]. Most relevant tokens are :tag (identifiers at the
// top level), :operator (delimiters, braces), and :string (quoted runs).
//
// The corpus's *css card has random-letter "content" - none of it parses
// as CSS, so every run of identifiers lands in :tag (css.rb:65-67 matches
// /Ident/ not followed by `(`). Each token is wrapped in
// `<span style="color:#070;font-weight:bold">...</span>`, exactly what
// the corpus fixture shows.

import { ALPHA_STYLES } from "../alpha-style.js";
import { coderayEscape } from "../escape.js";

function styleFor(kind: string): string | undefined {
  for (const entry of ALPHA_STYLES) if (entry.kind === kind) return entry.style;
  return undefined;
}

function wrapText(text: string, style: string | undefined): string {
  if (style === undefined) return text;
  return `<span style="${style}">${text}</span>`;
}

/** Scan the input as CSS and return the highlighted inner HTML. */
export function scanCss(input: string): string {
  let out = "";
  let i = 0;
  const N = input.length;
  // States lifted verbatim from css.rb - the corpus paths only exercise
  // :initial; :block is reached only when `{` is present (which the corpus
  // never hits), but we implement it so the surface is complete.
  let state: "initial" | "block" | "media" | "media_before_name" | "media_after_name" = "initial";
  let valueExpected = false;
  // Regex set pulled from css.rb RE module. The corpus only exercises
  // the :tag branch (identifiers at the top level), so we wire up enough
  // to keep the structure honest without over-implementing.
  const IDENT = /^-?[a-zA-Z_][\w-]*/;
  const CLASS = /^\.[a-zA-Z_][\w-]*/;
  const ID = /^(?!#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b(?!-))#[a-zA-Z_][\w-]*/;
  const PSEUDO = /^::?-?[a-zA-Z_][\w-]*/;
  const ATTR_SEL = /^\[[^\]]*\]?/;
  const AT_MEDIA = /^@media\b/;
  const COMMENT = /^\/\*(?:.*?\*\/|\z)/s;
  const STRING1 = /^"(?:[^\n\\"]+|\\\n|\\[^0-9\n][^\n]?|\\[0-9a-fA-F]{1,6})*"?/;
  const STRING2 = /^'(?:[^\n\\']+|\\\n|\\[^0-9\n][^\n]?|\\[0-9a-fA-F]{1,6})*'?/;
  const FUNC = /^(?:url|alpha|attr|counters?)\([^)\n]*(?:\)[^)\n]*)*\)?/;
  const NUM = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:em|ex|px|in|cm|mm|pt|pc|s|dpi|dppx|deg|%)?/;
  const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/;
  const IMPORTANT = /^!\s*important\b/;
  const RGB_HSL = /^(?:rgb|hsl)a?\([^()\n]*(?:\)[^()\n]*)*\)?/;
  const AT_KEYWORD = /^@[a-zA-Z_][\w-]*/;
  const OP = /^[+>~:;,.=()\/]/;
  const WHITE = /^\s+/;
  while (i < N) {
    // whitespace - css.rb:62 emits :space unconditionally
    const ws = WHITE.exec(input.slice(i));
    if (ws !== null) {
      out += wrapText(coderayEscape(ws[0]), styleFor("space"));
      i += ws[0].length;
      continue;
    }
    let m: RegExpExecArray | null;
    if (state === "initial" || state === "media") {
      if ((m = IDENT.exec(input.slice(i))) !== null && !/^\w+\(/.test(input.slice(i))) {
        out += wrapText(coderayEscape(m[0]), styleFor("tag"));
        i += m[0].length;
        continue;
      }
      if ((m = CLASS.exec(input.slice(i))) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("class"));
        i += m[0].length;
        continue;
      }
      if ((m = ID.exec(input.slice(i))) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("id"));
        i += m[0].length;
        continue;
      }
      if ((m = PSEUDO.exec(input.slice(i))) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("pseudo_class"));
        i += m[0].length;
        continue;
      }
      if ((m = ATTR_SEL.exec(input.slice(i))) !== null) {
        // css.rb:80-82 splits the brackets off as :operator; the inner is
        // :attribute_name. The corpus doesn't exercise this branch; emit a
        // faithful pass-through so any future CSS attribute selector gets
        // the same treatment.
        const open = m[0][0];
        const inner = m[0].slice(1, -1);
        const close = m[0][m[0].length - 1] === "]" ? "]" : "";
        out += wrapText(coderayEscape(open), styleFor("operator"));
        if (inner.length > 0) {
          out += wrapText(coderayEscape(inner), styleFor("attribute_name"));
        }
        if (close !== "") out += wrapText(coderayEscape(close), styleFor("operator"));
        i += m[0].length;
        continue;
      }
      if ((m = AT_MEDIA.exec(input.slice(i))) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("directive"));
        i += m[0].length;
        state = "media_before_name";
        continue;
      }
    }
    if (state === "block") {
      if ((m = IDENT.exec(input.slice(i))) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor(valueExpected ? "value" : "key"));
        valueExpected = false;
        i += m[0].length;
        continue;
      }
    }
    if (state === "media_before_name") {
      if ((m = IDENT.exec(input.slice(i))) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("type"));
        i += m[0].length;
        state = "media_after_name";
        continue;
      }
    }
    if (state === "media_after_name") {
      if (input[i] === "{") {
        out += wrapText(coderayEscape("{"), styleFor("operator"));
        state = "media";
        i += 1;
        continue;
      }
    }
    if ((m = COMMENT.exec(input.slice(i))) !== null) {
      out += wrapText(coderayEscape(m[0]), styleFor("comment"));
      i += m[0].length;
      continue;
    }
    if (input[i] === "{") {
      valueExpected = false;
      out += wrapText(coderayEscape("{"), styleFor("operator"));
      state = "block";
      i += 1;
      continue;
    }
    if (input[i] === "}") {
      valueExpected = false;
      out += wrapText(coderayEscape("}"), styleFor("operator"));
      if (state === "block" || state === "media") state = "initial";
      i += 1;
      continue;
    }
    if ((m = STRING1.exec(input.slice(i))) !== null || (m = STRING2.exec(input.slice(i))) !== null) {
      // css.rb:138-141: opening delimiter (1 char), optional content, optional
      // closing delimiter. The :delimiter kind has no alpha entry -> bare.
      const txt = m[0];
      const open = txt[0];
      const close = txt.length >= 2 ? txt[txt.length - 1] : "";
      const inner = txt.length > 2 ? txt.slice(1, -1) : "";
      out += `<span>`;
      out += wrapText(coderayEscape(open), styleFor("delimiter"));
      if (inner.length > 0) out += wrapText(coderayEscape(inner), styleFor("content"));
      if (close !== "") out += wrapText(coderayEscape(close), styleFor("delimiter"));
      out += `</span>`;
      i += txt.length;
      continue;
    }
    if ((m = FUNC.exec(input.slice(i))) !== null) {
      const txt = m[0];
      const start = txt.match(/^\w+\(/)![0];
      const lastIsParen = txt[txt.length - 1] === ")";
      const inner = lastIsParen ? txt.slice(start.length, -1) : txt.slice(start.length);
      out += `<span>`;
      out += wrapText(coderayEscape(start), styleFor("delimiter"));
      if (inner.length > 0) out += wrapText(coderayEscape(inner), styleFor("content"));
      if (lastIsParen) out += wrapText(coderayEscape(")"), styleFor("delimiter"));
      out += `</span>`;
      i += txt.length;
      continue;
    }
    if ((m = NUM.exec(input.slice(i))) !== null) {
      out += wrapText(coderayEscape(m[0]), styleFor("float"));
      i += m[0].length;
      continue;
    }
    if ((m = HEX_COLOR.exec(input.slice(i))) !== null) {
      out += wrapText(coderayEscape(m[0]), styleFor("color"));
      i += m[0].length;
      continue;
    }
    if ((m = IMPORTANT.exec(input.slice(i))) !== null) {
      out += wrapText(coderayEscape(m[0]), styleFor("important"));
      i += m[0].length;
      continue;
    }
    if ((m = RGB_HSL.exec(input.slice(i))) !== null) {
      out += wrapText(coderayEscape(m[0]), styleFor("color"));
      i += m[0].length;
      continue;
    }
    if ((m = AT_KEYWORD.exec(input.slice(i))) !== null) {
      out += wrapText(coderayEscape(m[0]), styleFor("directive"));
      i += m[0].length;
      continue;
    }
    if (OP.test(input[i])) {
      const ch = input[i];
      if (ch === ":") valueExpected = true;
      else if (ch === ";") valueExpected = false;
      out += wrapText(coderayEscape(ch), styleFor("operator"));
      i += 1;
      continue;
    }
    // :error - one byte at a time
    out += wrapText(coderayEscape(input[i]), styleFor("error"));
    i += 1;
  }
  return out;
}
