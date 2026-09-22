// CodeRay HTML scanner.
//
// Truth source: coderay-1.1.3 lib/coderay/scanners/html.rb. State machine
// over [:initial, :attribute, :attribute_equal, :attribute_value,
// :attribute_value_string, :in_special_tag]. The corpus's layout_type
// cards exercise the :initial branch (tags, plain text, doctype) and the
// <script>/<style> special-tag branch (which scans the body as JS or CSS
// inside a `<span style="background-color:hsla(0,0%,0%,0.07);color:black">`
// wrapper - the alpha `:inline` style).
//
// We don't implement JS/CSS token highlighting inside <script>/<style>
// blocks - CodeRay's corpus fixtures pass the body verbatim inside the
// :inline wrapper. That keeps the byte output stable on the corpus; if a
// future corpus entry exercises actual JS token highlighting, the
// scanners can be plugged in here.

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

/** Scan the input as HTML and return the highlighted inner HTML. */
export function scanHtml(input: string): string {
  let out = "";
  let i = 0;
  const N = input.length;
  let state: "initial" | "attribute" | "attribute_equal" | "attribute_value" | "attribute_value_string" | "in_special_tag" = "initial";
  let inTag: string | undefined = undefined;
  let inAttribute: string | undefined = undefined;
  let plainStringContent: RegExp | undefined = undefined;

  // Regexes pulled from html.rb. The CDATA branch is rare in real decks;
  // the corpus doesn't exercise it, but we keep the shape for parity.
  // NB: no `m` flag - it would make `^` match line starts in the *current*
  // slice (after a `\n` in the source), so a regex like /^<\// would
  // re-match `</body>` mid-document, looping on the corpus's nested tags.
  const CDATA_OPEN = /^<!\[CDATA\[/;
  const CDATA_BODY = /^.*?\]\]>/s;
  const COMMENT = /^<!--(?:.*?-->|.*)/s;
  const DOCTYPE = /^<!(?:\w+)(?:.*?>|.*)|^\]>/s;
  const XML_PI = /^<\?xml(?:.*?\?>|.*)/s;
  const PI = /^<\?(?:.*?\?>|.*)/s;
  const CLOSE_TAG = /^<\/[-\w.:]*>?/;
  const OPEN_TAG = /^<(?:(script|style)|[-\w.:]+)(>)?/;
  const PLAIN = /^[^<>&]+/;
  const ENTITY = /^&(?:\w+|#\d+|#x[0-9a-fA-F]+);/;
  const TAG_END = /^\/?>/;
  const ATTR_NAME = /^[\w.:-]+/;
  const ATTR_EQ = /^=/;
  const ATTR_VALUE_BARE = /^[\w.:-]+/;
  const QUOTE = /^["']/;
  const WHITE = /^\s+/;
  const STR_CONTENT_DQ = /^[^&">\n]+/;
  const STR_CONTENT_SQ = /^[^&'\n]+/;

  while (i < N) {
    const rest = input.slice(i);
    if (state !== "in_special_tag") {
      const ws = WHITE.exec(rest);
      if (ws !== null) {
        out += wrapText(coderayEscape(ws[0]), styleFor("space"));
        i += ws[0].length;
        continue;
      }
    }
    let m: RegExpExecArray | null;
    if (state === "initial") {
      if ((m = CDATA_OPEN.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("inline_delimiter"));
        i += m[0].length;
        const body = CDATA_BODY.exec(rest.slice(m[0].length));
        if (body !== null) {
          out += wrapText(coderayEscape(body[0].slice(0, -3)), styleFor("plain"));
          out += wrapText(coderayEscape("]]>"), styleFor("inline_delimiter"));
          i += body[0].length;
        } else {
          const tail = /^.+/.exec(rest.slice(m[0].length));
          if (tail !== null) {
            out += wrapText(coderayEscape(tail[0]), styleFor("error"));
            i += tail[0].length;
          }
        }
        continue;
      }
      if ((m = COMMENT.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("comment"));
        i += m[0].length;
        continue;
      }
      if ((m = DOCTYPE.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("doctype"));
        i += m[0].length;
        continue;
      }
      if ((m = XML_PI.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("preprocessor"));
        i += m[0].length;
        continue;
      }
      if ((m = PI.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("comment"));
        i += m[0].length;
        continue;
      }
      if ((m = CLOSE_TAG.exec(rest)) !== null) {
        inTag = undefined;
        out += wrapText(coderayEscape(m[0]), styleFor("tag"));
        i += m[0].length;
        continue;
      }
      if ((m = OPEN_TAG.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("tag"));
        i += m[0].length;
        inTag = m[1]; // 'script' | 'style' | undefined
        if (m[2] !== undefined) {
          // self-closing tag
          state = inTag !== undefined ? "in_special_tag" : "initial";
        } else {
          state = "attribute";
        }
        continue;
      }
      if ((m = PLAIN.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("plain"));
        i += m[0].length;
        continue;
      }
      if ((m = ENTITY.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("entity"));
        i += m[0].length;
        continue;
      }
      if (/^[<>&]/.test(rest)) {
        inTag = undefined;
        out += wrapText(coderayEscape(rest[0]), styleFor("error"));
        i += 1;
        continue;
      }
      // Should not reach here, but advance to avoid infinite loop on
      // unhandled bytes.
      out += wrapText(coderayEscape(rest[0]), styleFor("error"));
      i += 1;
      continue;
    }
    if (state === "attribute") {
      if ((m = TAG_END.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("tag"));
        inAttribute = undefined;
        state = inTag !== undefined ? "in_special_tag" : "initial";
        i += m[0].length;
        continue;
      }
      if ((m = ATTR_NAME.exec(rest)) !== null) {
        inAttribute = m[0].toLowerCase();
        out += wrapText(coderayEscape(m[0]), styleFor("attribute_name"));
        state = "attribute_equal";
        i += m[0].length;
        continue;
      }
      inTag = undefined;
      out += wrapText(coderayEscape(rest[0]), styleFor("error"));
      i += 1;
      continue;
    }
    if (state === "attribute_equal") {
      if ((m = ATTR_EQ.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("operator"));
        state = "attribute_value";
        i += m[0].length;
        continue;
      }
      // No '=' - back to attribute scanning (html.rb:166-169)
      state = "attribute";
      continue;
    }
    if (state === "attribute_value") {
      if ((m = ATTR_VALUE_BARE.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("attribute_value"));
        state = "attribute";
        i += m[0].length;
        continue;
      }
      if ((m = QUOTE.exec(rest)) !== null) {
        const openChar = m[0];
        // Special: script=... or style=... -> begin_group :string + scan JS/CSS
        // (html.rb:178-200). For the corpus we don't tokenize inside; we just
        // emit the :string group with bare :delimiter + bare :content (no
        // alpha entry), matching what CodeRay would emit for a non-keyword
        // attribute string. If the attribute is script/style, we additionally
        // wrap the body in :inline per the upstream behavior (the corpus
        // fixture html-layout-corpus-314.html shows exactly this for <script>).
        if (inAttribute === "script" || inAttribute === "style") {
          out += `<span>`;
          out += wrapText(coderayEscape(openChar), styleFor("delimiter"));
          i += m[0].length;
          // body: scan_until quote
          const untilPattern = openChar === '"' ? /(?="|\z)/ : /(?='|\z)/;
          const until = untilPattern.exec(rest.slice(m[0].length));
          const bodyEnd = until !== null ? m[0].length + until.index : N;
          const body = input.slice(i, bodyEnd);
          if (body.length > 0) {
            out += wrapText(coderayEscape(body), styleFor("inline"));
            i += body.length;
          }
          const close = rest[i] === openChar ? openChar : "";
          if (close !== "") {
            out += wrapText(coderayEscape(close), styleFor("delimiter"));
            i += 1;
          }
          out += `</span>`;
        } else {
          out += `<span>`;
          out += wrapText(coderayEscape(openChar), styleFor("delimiter"));
          state = "attribute_value_string";
          plainStringContent = openChar === '"' ? STR_CONTENT_DQ : STR_CONTENT_SQ;
          i += m[0].length;
        }
        continue;
      }
      if ((m = TAG_END.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("tag"));
        state = "initial";
        i += m[0].length;
        continue;
      }
      out += wrapText(coderayEscape(rest[0]), styleFor("error"));
      i += 1;
      continue;
    }
    if (state === "attribute_value_string") {
      if ((m = plainStringContent!.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("content"));
        i += m[0].length;
        continue;
      }
      if (/^['"]/.test(rest)) {
        out += wrapText(coderayEscape(rest[0]), styleFor("delimiter"));
        out += `</span>`;
        state = "attribute";
        i += 1;
        continue;
      }
      if ((m = ENTITY.exec(rest)) !== null) {
        out += wrapText(coderayEscape(m[0]), styleFor("entity"));
        i += m[0].length;
        continue;
      }
      if (rest[0] === "&") {
        out += wrapText(coderayEscape("&"), styleFor("content"));
        i += 1;
        continue;
      }
      if (/^[\n>]/.test(rest)) {
        out += `</span>`;
        state = "initial";
        out += wrapText(coderayEscape(rest[0]), styleFor("error"));
        i += 1;
        continue;
      }
      out += wrapText(coderayEscape(rest[0]), styleFor("error"));
      i += 1;
      continue;
    }
    if (state === "in_special_tag") {
      if (inTag === "script" || inTag === "style") {
        // leading newline + indent is :space (html.rb:228)
        if ((m = /^[ \t]*\n/.exec(rest)) !== null) {
          out += wrapText(coderayEscape(m[0]), styleFor("space"));
          i += m[0].length;
        }
        // <!-- ... --> inside script/style (html.rb:229-235)
        const cm = /^(\s*<!--)(?:(.*?)(-->)|(.*))/s.exec(rest);
        let body = "";
        let closing: string | undefined;
        if (cm !== null) {
          body = cm[2] ?? cm[4] ?? "";
          closing = cm[3];
          out += wrapText(coderayEscape(cm[1]), styleFor("comment"));
          i += cm[1].length;
          if (body.length > 0) {
            i += body.length;
          }
          if (closing !== undefined && closing !== "") {
            out += wrapText(coderayEscape(closing), styleFor("comment"));
            i += closing.length;
          }
        } else {
          // scan_until the closing tag (html.rb:234)
          const untilRe = new RegExp(`(?=(?:\\n\\s*)?</${inTag}>)|\\z`);
          const until = untilRe.exec(rest);
          body = until !== null ? rest.slice(0, until.index) : rest;
          closing = "";
          if (body.length > 0) i += body.length;
        }
        if (body.length > 0) {
          // Wrap script/style body in :inline alpha style (html.rb:237-244).
          out += wrapText(coderayEscape(body), styleFor("inline"));
        }
        state = "initial";
        continue;
      }
      // Unknown special tag - upstream raises (html.rb:249). We surface it
      // as :error so a malformed input doesn't hang the render.
      out += wrapText(coderayEscape(rest[0]), styleFor("error"));
      i += 1;
      continue;
    }
    // Fallback (should not reach).
    out += wrapText(coderayEscape(rest[0]), styleFor("error"));
    i += 1;
  }
  return out;
}
