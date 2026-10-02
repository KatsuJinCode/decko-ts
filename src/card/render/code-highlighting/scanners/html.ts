// CodeRay HTML scanner.
//
// Truth source: coderay-1.1.3 lib/coderay/scanners/html.rb - the state
// machine over [:initial, :attribute, :attribute_equal, :attribute_value,
// :attribute_value_string, :in_special_tag], one `encoder.text_token` per
// match. The spans those tokens are wrapped in are NOT this file's
// business: encoder.ts owns the whole span assembly, the way
// encoders/html.rb does.
//
// html.rb:76-84 scan_java_script / scan_css - the sub-scanner
// delegations: a <script> body tokenizes through Scanners::JavaScript and a
// <style> body through Scanners::CSS, both writing into the SAME encoder
// (`:tokens => encoder`), so the :inline group stays open around the
// body's tokens (html.rb:238-244) and the body's keyword/string tokens
// resolve through the encoder's group-aware kind paths. Both sub-scanners
// are ported (java-script.ts, css.ts#scanCssInto); the body's token stream
// is no longer the single coarse :ident token the pre-2026-10-01 port
// emitted (that divergence WAS byte-exact for identifier-only fixture
// bodies but dropped the Classic_Layout oracle's
// `<span style="color:#080;font-weight:bold">var</span>`).

import { HtmlTokenEncoder } from "../encoder.js";
import { scanJavaScriptInto } from "./java-script.js";
import { scanCssInto } from "./css.js";

/** Scan the input as HTML and return the highlighted inner HTML (the
 *  content `div` wraps in its <div class="CodeRay"> template). */
export function scanHtml(input: string): string {
  const enc = new HtmlTokenEncoder();
  let i = 0;
  const N = input.length;
  let state:
    | "initial"
    | "attribute"
    | "attribute_equal"
    | "attribute_value"
    | "attribute_value_string"
    | "in_special_tag" = "initial";
  let inTag: string | undefined = undefined;
  let inAttribute: "script" | "style" | undefined = undefined;
  let plainStringContent: RegExp | undefined = undefined;

  // Regexes pulled from html.rb. The CDATA branch is rare in real decks;
  // the corpus doesn't exercise it, but we keep the shape for parity.
  // NB: no `m` flag on the anchored ones - it would make `^` match line
  // starts in the *current* slice (after a `\n` in the source), so a
  // regex like /^<\// would re-match `</body>` mid-document.
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
  const QUOTE = /^["']/;
  const WHITE = /^\s+/;
  const STR_CONTENT_DQ = /^[^&">\n]+/;
  const STR_CONTENT_SQ = /^[^&'\n]+/;

  while (i < N) {
    const rest = input.slice(i);
    if (state !== "in_special_tag") {
      const ws = WHITE.exec(rest);
      if (ws !== null) {
        enc.textToken(ws[0], "space");
        i += ws[0].length;
        continue;
      }
    }
    let m: RegExpExecArray | null;
    if (state === "initial") {
      if ((m = CDATA_OPEN.exec(rest)) !== null) {
        enc.textToken(m[0], "inline_delimiter");
        i += m[0].length;
        const body = CDATA_BODY.exec(rest.slice(m[0].length));
        if (body !== null) {
          enc.textToken(body[0].slice(0, -3), "plain");
          enc.textToken("]]>", "inline_delimiter");
          i += body[0].length;
        } else {
          const tail = /^.+/.exec(rest.slice(m[0].length));
          if (tail !== null) {
            enc.textToken(tail[0], "error");
            i += tail[0].length;
          }
        }
        continue;
      }
      if ((m = COMMENT.exec(rest)) !== null) {
        enc.textToken(m[0], "comment");
        i += m[0].length;
        continue;
      }
      if ((m = DOCTYPE.exec(rest)) !== null) {
        enc.textToken(m[0], "doctype");
        i += m[0].length;
        continue;
      }
      if ((m = XML_PI.exec(rest)) !== null) {
        enc.textToken(m[0], "preprocessor");
        i += m[0].length;
        continue;
      }
      if ((m = PI.exec(rest)) !== null) {
        enc.textToken(m[0], "comment");
        i += m[0].length;
        continue;
      }
      if ((m = CLOSE_TAG.exec(rest)) !== null) {
        inTag = undefined;
        enc.textToken(m[0], "tag");
        i += m[0].length;
        continue;
      }
      if ((m = OPEN_TAG.exec(rest)) !== null) {
        enc.textToken(m[0], "tag");
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
        enc.textToken(m[0], "plain");
        i += m[0].length;
        continue;
      }
      if ((m = ENTITY.exec(rest)) !== null) {
        enc.textToken(m[0], "entity");
        i += m[0].length;
        continue;
      }
      // html.rb:141 `elsif match = scan(/[<>&]/)` -> `text_token getch, :error`
      inTag = undefined;
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "attribute") {
      if ((m = TAG_END.exec(rest)) !== null) {
        enc.textToken(m[0], "tag");
        inAttribute = undefined;
        state = inTag !== undefined ? "in_special_tag" : "initial";
        i += m[0].length;
        continue;
      }
      if ((m = ATTR_NAME.exec(rest)) !== null) {
        // html.rb:163 `in_attribute = IN_ATTRIBUTE[match]` - IN_ATTRIBUTE
        // is a case-insensitive WordList holding the EVENT_ATTRIBUTES
        // (all :script) and `style` (:style); everything else is nil.
        inAttribute = attributeScriptOrStyle(m[0]);
        enc.textToken(m[0], "attribute_name");
        state = "attribute_equal";
        i += m[0].length;
        continue;
      }
      inTag = undefined;
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "attribute_equal") {
      if ((m = ATTR_EQ.exec(rest)) !== null) {
        enc.textToken(m[0], "operator");
        state = "attribute_value";
        i += m[0].length;
        continue;
      }
      // html.rb:169 `else state = :attribute; next` - no '=', so the state
      // rewinds and the SAME bytes are re-examined as an attribute.
      state = "attribute";
      continue;
    }
    if (state === "attribute_value") {
      if ((m = ATTR_NAME.exec(rest)) !== null) {
        enc.textToken(m[0], "attribute_value");
        state = "attribute";
        i += m[0].length;
        continue;
      }
      if ((m = QUOTE.exec(rest)) !== null) {
        const openChar = m[0];
        enc.beginGroup("string");
        enc.textToken(openChar, "delimiter");
        if (inAttribute === "script" || inAttribute === "style") {
          // html.rb:183-193: Ruby hands the body to the JavaScript/CSS
          // sub-scanner, the closing quote a :delimiter inside the same
          // :string group. On this attribute-value path the port emits the
          // body as ONE :ident token (unstyled - the sub-scanner delegation
          // is wired only into the <script>/<style> tag-body path below).
          const bodyEnd = scanUntilQuote(input, i + m[0].length, openChar);
          const body = input.slice(i + m[0].length, bodyEnd);
          if (body.length > 0) enc.textToken(body, "ident");
          if (input[bodyEnd] === openChar) {
            enc.textToken(openChar, "delimiter");
            i = bodyEnd + 1;
          } else {
            i = bodyEnd;
          }
          enc.endGroup();
          state = "attribute";
          inAttribute = undefined;
        } else {
          state = "attribute_value_string";
          plainStringContent = openChar === '"' ? STR_CONTENT_DQ : STR_CONTENT_SQ;
          i += m[0].length;
        }
        continue;
      }
      if ((m = TAG_END.exec(rest)) !== null) {
        enc.textToken(m[0], "tag");
        state = "initial";
        i += m[0].length;
        continue;
      }
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "attribute_value_string") {
      if ((m = plainStringContent!.exec(rest)) !== null) {
        enc.textToken(m[0], "content");
        i += m[0].length;
        continue;
      }
      if (/^['"]/.test(rest)) {
        enc.textToken(rest[0], "delimiter");
        enc.endGroup();
        state = "attribute";
        i += 1;
        continue;
      }
      if ((m = ENTITY.exec(rest)) !== null) {
        enc.textToken(m[0], "entity");
        i += m[0].length;
        continue;
      }
      if (rest[0] === "&") {
        enc.textToken("&", "content");
        i += 1;
        continue;
      }
      if (/^[\n>]/.test(rest)) {
        // html.rb:222-226: the value never closed, so the group ends HERE
        // and the offending byte is an :error token OUTSIDE it. The
        // loop-top :space check has already taken a newline, so this is
        // reached on '>' in the ordinary path.
        enc.endGroup();
        state = "initial";
        enc.textToken(rest[0], "error");
        i += 1;
        continue;
      }
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    if (state === "in_special_tag") {
      if (inTag === "script" || inTag === "style") {
        // leading newline + indent is :space (html.rb:226)
        const leading = /^[ \t]*\n/.exec(rest);
        if (leading !== null) {
          enc.textToken(leading[0], "space");
          i += leading[0].length;
        }
        // html.rb:227-233: a `<!-- ... -->` comment inside the body is
        // tokenized as a comment; otherwise scan_until the closing tag
        // (whose second alternative is end-of-input).
        const cm = /^(\s*<!--)(?:(.*?)(-->)|(.*))/s.exec(input.slice(i));
        let body: string;
        let closing: string | undefined;
        if (cm !== null) {
          body = cm[2] ?? cm[4] ?? "";
          closing = cm[3];
          enc.textToken(cm[1], "comment");
          i += cm[1].length;
          if (body.length > 0) i += body.length;
          if (closing !== undefined && closing !== "") {
            enc.textToken(closing, "comment");
            i += closing.length;
          }
        } else {
          const untilRe = new RegExp(`(?=(?:\\n\\s*)?</${inTag}>)`);
          const until = untilRe.exec(input.slice(i));
          body = until !== null ? input.slice(i, i + until.index) : input.slice(i);
          closing = "";
          if (body.length > 0) i += body.length;
        }
        if (body.length > 0) {
          // html.rb:237-244 wraps the body in an :inline GROUP and hands it
          // to the sub-scanner (html.rb:76-80 scan_java_script /
          // html.rb:82-84 scan_css - `tokenize code, :tokens => encoder`):
          // the body's OWN token stream flows into this encoder, so its
          // keyword/string/comment spans nest INSIDE the :inline group.
          enc.beginGroup("inline");
          if (inTag === "script") {
            scanJavaScriptInto(enc, body);
          } else {
            scanCssInto(enc, body);
          }
          enc.endGroup();
        }
        state = "initial";
        continue;
      }
      // html.rb:249 raises for an unknown special tag. The port cannot
      // reach this state with an unrecognized inTag (only script/style
      // enter it), so the guard is a single-byte :error rather than a
      // throw - a malformed input must not hang a render.
      enc.textToken(rest[0], "error");
      i += 1;
      continue;
    }
    // Unreachable: every state above either continues or falls through to
    // the next iteration. Guard anyway so a future edit cannot spin.
    enc.textToken(rest[0], "error");
    i += 1;
  }
  // html.rb:236 `encoder.end_group :string if state == :attribute_value_string`
  // - an input that ends mid-value still closes its group.
  if (state === "attribute_value_string") enc.endGroup();
  // html.rb:195-198 finish - close any group the stream left open (the
  // script-body delegation's :key case; java_script.rb:215 only closes
  // :string/:regexp).
  enc.closeAllGroups();
  return enc.toString();
}

/** html.rb `scan_until(/(?="|\z)/)` / `/(?='|\z)/` - the offset of the
 *  closing quote, or the end of input. */
function scanUntilQuote(input: string, from: number, quote: string): number {
  for (let k = from; k < input.length; k++) {
    if (input[k] === quote) return k;
  }
  return input.length;
}

/** html.rb IN_ATTRIBUTE: a case-insensitive WordList holding the
 *  EVENT_ATTRIBUTES (all :script) plus `style` (:style). Only those two
 *  outcomes are observable - a name outside both sets and a name inside
 *  EVENT_ATTRIBUTES take the same branch in the scanner - so the port
 *  matches on the attribute name instead of carrying the 70-name list. */
function attributeScriptOrStyle(name: string): "script" | "style" | undefined {
  const lower = name.toLowerCase();
  if (lower === "style") return "style";
  if (lower === "script" || EVENT_ATTRIBUTES.has(lower)) return "script";
  return undefined;
}

/** html.rb:19-38 EVENT_ATTRIBUTES - the names IN_ATTRIBUTE maps to
 *  :script. Listed for parity with the Ruby source. */
const EVENT_ATTRIBUTES: ReadonlySet<string> = new Set([
  "onabort", "onafterprint", "onbeforeprint", "onbeforeunload", "onblur",
  "oncanplay", "oncanplaythrough", "onchange", "onclick", "oncontextmenu",
  "oncuechange", "ondblclick", "ondrag", "ondragdrop", "ondragend",
  "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop",
  "ondurationchange", "onemptied", "onended", "onerror", "onfocus",
  "onformchange", "onforminput", "onhashchange", "oninput", "oninvalid",
  "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata",
  "onloadedmetadata", "onloadstart", "onmessage", "onmousedown",
  "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel",
  "onmove", "onoffline", "ononline", "onpagehide", "onpageshow",
  "onpause", "onplay", "onplaying", "onpopstate", "onprogress",
  "onratechange", "onreadystatechange", "onredo", "onreset", "onresize",
  "onscroll", "onseeked", "onseeking", "onselect", "onshow",
  "onstalled", "onstorage", "onsubmit", "onsuspend", "ontimeupdate",
  "ontoggle", "onvolumechange", "onwaiting",
]);
