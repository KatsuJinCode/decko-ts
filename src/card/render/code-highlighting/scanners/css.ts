// CodeRay CSS scanner - the faithful port of coderay-1.1.3
// lib/coderay/scanners/css.rb (the exact file the deck's
// `CodeRay.scan(content, :css).div` runs; card-mod-style
// set/abstract/01_css.rb:37 drives it for the Css/Scss cardtypes' html
// :core).
//
// An earlier port approximated the state machine, covering only :tag runs.
// That approximation collapses on REAL stylesheet bytes - a
// large vendored Bootstrap SCSS body
// renders through this scanner and the approximation's regex set diverged
// from css.rb at the first hex color (#f8f9fa) and stayed diverged for the
// whole body.
// This file now ports css.rb statement for statement:
//
//   RE module        css.rb:16-45   (the regex set, verbatim)
//   setup            css.rb:50-53   (states [:initial] + value_expected=false)
//   scan_tokens      css.rb:55-191  (the elsif chain, same order)
//
// and emits through the shared HtmlTokenEncoder (encoder.ts), which
// implements coderay-1.1.3's encoders/html.rb span assembly - the group
// semantics (begin_group :string / :function wrap their tokens' kind
// paths through `.string .delimiter` / `.function .content`) the flat
// approximation inlined wrong. Byte gates:
// tests/card/render/code-highlighting/coderay-byte-identity.test.ts
// + the bootstrap code-file page pins
// (tests/card/render/bootstrap-code-file-pages.test.ts).

import { HtmlTokenEncoder } from "../encoder.js";

/** Scan at a sticky position: every RE below runs with /y (Ruby's String#scan
 *  inside Scanner#scan_tokens anchors at the current position and matches
 *  THERE or not at all). */
function at(re: RegExp, input: string, i: number): RegExpExecArray | null {
  re.lastIndex = i;
  return re.exec(input);
}

/** css.rb:19 Escape = `#{Unicode}|\\[^\n0-9a-fA-F]` where Unicode is
 *  `\\#{Hex}{1,6}\b` ("differs from standard because it allows uppercase
 *  hex too" - css.rb:18). */
const ESC = `(?:\\\\[0-9a-fA-F]{1,6}\\b|\\\\[^\\n0-9a-fA-F])`;
/** css.rb:22-23 String1/String2 (the source's own "TODO: buggy regexp"
 *  comments ported as-is - the bugs ARE the bytes). */
const STRING1 = `"(?:[^\\n\\\\"]+|\\\\\\n|${ESC})*"?`;
const STRING2 = `'(?:[^\\n\\\\']+|\\\\\\n|${ESC})*'?`;
/** css.rb:26 HexColor = `#(?:#{Hex}{6}|#{Hex}{3})` - 6 BEFORE 3. */
const HEX_COLOR = `#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})`;
/** css.rb:28 Num = `-?(?:[0-9]*\\.[0-9]+|[0-9]+)n?`. */
const NUM = `-?(?:[0-9]*\\.[0-9]+|[0-9]+)n?`;
/** css.rb:30-31 NMStart/NMChar -> Ident = `-?#{NMStart}#{NMChar}*`. */
const IDENT = `-?[_a-zA-Z][-_a-zA-Z0-9]*`;
/** css.rb:32 AtKeyword = `@#{Ident}`. */
const AT_KEYWORD = `@${IDENT}`;
/** css.rb:34-38 Unit (Regexp.union order) + Dimension + Percentage. */
const UNIT = `(?:em|ex|px|in|cm|mm|pt|pc|s|dpi|dppx|deg)`;
const DIMENSION = `${NUM}${UNIT}`;
const PERCENTAGE = `${NUM}%`;
/** css.rb:40 Function. */
const FUNCTION = `(?:url|alpha|attr|counters?)\\((?:[^)\\n]|\\\\\\))*\\)?`;
/** css.rb:42 Id - the negative lookahead keeps hex colors out of :id. */
const ID = `(?!${HEX_COLOR}\\b(?!-))#[-_a-zA-Z0-9]+`;
/** css.rb:43-45 Class / PseudoClass / AttributeSelector. */
const CLASS = `\\.[-_a-zA-Z0-9]+`;
const PSEUDO_CLASS = `::?${IDENT}`;
const ATTRIBUTE_SELECTOR = `\\[[^\\]]*\\]?`;

/** The sticky scan regexes (built once). */
const RE_WS = /\s+/y;
// css.rb:66 `(?>#{RE::Ident})(?!\()|\*` - atomic group (no backtrack into
// a shorter ident) OR the bare universal-selector asterisk. This V8 build
// has no atomic groups, so the ident match runs WITHOUT the lookahead
// (greedy exec returns the maximal run) and the (?!\() test is explicit -
// identical semantics: `abc(` matches NO tag, `abc` matches whole.
const RE_IDENT_GREEDY = new RegExp(IDENT, "y");
const RE_ASTERISK = /\*/y;
// css.rb:91 the :block branch scans ONLY the ident alternative - no `\*`.
const RE_BLOCK_IDENT = new RegExp(IDENT, "y");
const RE_MEDIA_IDENT = new RegExp(IDENT, "y");
const RE_CLASS = new RegExp(CLASS, "y");
const RE_ID = new RegExp(ID, "y");
const RE_PSEUDO = new RegExp(PSEUDO_CLASS, "y");
const RE_ATTR = new RegExp(ATTRIBUTE_SELECTOR, "y");
const RE_AT_MEDIA = /@media/y;
// css.rb:121 `/\/\*(?:.*?\*\/|\z)/m` - the \z arm: an unterminated comment
// runs to the end of input.
const RE_COMMENT = /\/\*(?:[\s\S]*?\*\/|[\s\S]*)/y;
const RE_STRING = new RegExp(`(?:${STRING1}|${STRING2})`, "y");
const RE_FUNCTION = new RegExp(FUNCTION, "y");
// css.rb:155 `(?: #{Dimension} | #{Percentage} | #{Num} )` - that order.
const RE_MEASURE = new RegExp(`(?:${DIMENSION}|${PERCENTAGE}|${NUM})`, "y");
const RE_HEX = new RegExp(HEX_COLOR, "y");
const RE_IMPORTANT = /! *important/y;
const RE_RGB = /(?:rgb|hsl)a?\([^()\n]*\)?/y;
const RE_AT_KEYWORD = new RegExp(AT_KEYWORD, "y");
// css.rb:170 `/ [ +>~:;,.=()\/] /x` - x-mode whitespace is ignored OUTSIDE
// the class, and the class itself is {space +>~:;,.=()/}. Whitespace never
// reaches this branch (css.rb:61 consumed it first), so the reachable
// members are the punctuators.
const RE_OP = /[+>~:;,.=()/]/y;

type CssState = "initial" | "block" | "media" | "media_before_name" | "media_after_name";

/** Scan the input as CSS and return the highlighted inner HTML. */
export function scanCss(input: string): string {
  const enc = new HtmlTokenEncoder();
  scanCssInto(enc, input);
  return enc.toString();
}

/** css.rb:83 scan_css - the token stream into ANY encoder (html.rb:82-84
 *  delegates a <style> body here with the html scan's live encoder, so the
 *  :inline group stays open around the css tokens exactly as Ruby does). */
export function scanCssInto(enc: HtmlTokenEncoder, input: string): void {
  // css.rb:50-53 setup: @state = :initial, @value_expected = false.
  const states: CssState[] = ["initial"];
  let valueExpected = false;
  const N = input.length;
  let i = 0;

  const push = (text: string, kind: string): void => {
    enc.textToken(text, kind);
    i += text.length;
  };

  while (i < N) {
    // css.rb:61-62 whitespace first, unconditionally :space.
    const ws = at(RE_WS, input, i);
    if (ws !== null) {
      push(ws[0], "space");
      continue;
    }

    // css.rb:64-119 the state machine (`elsif case states.last ... end` -
    // when a case branch consumes, the outer chain ends for this token;
    // when NO branch matches, control falls to the generic chain below).
    const state = states[states.length - 1];
    if (state === "initial" || state === "media") {
      // css.rb:66-68: atomic ident + (?!\(), else the bare `*`. The greedy
      // exec returns the MAXIMAL ident; if a `(` follows it the whole
      // branch fails (the atomic group forbids the shorter-match retry).
      const ident = at(RE_IDENT_GREEDY, input, i);
      if (ident !== null && input[i + ident[0].length] !== "(") {
        push(ident[0], "tag");
        continue;
      }
      const star = at(RE_ASTERISK, input, i);
      if (star !== null) {
        push("*", "tag");
        continue;
      }
      const cls = at(RE_CLASS, input, i);
      if (cls !== null) {
        push(cls[0], "class");
        continue;
      }
      const id = at(RE_ID, input, i);
      if (id !== null) {
        push(id[0], "id");
        continue;
      }
      const pseudo = at(RE_PSEUDO, input, i);
      if (pseudo !== null) {
        push(pseudo[0], "pseudo_class");
        continue;
      }
      const attr = at(RE_ATTR, input, i);
      if (attr !== null) {
        // css.rb:80-82: opening bracket :operator, inner :attribute_name
        // when longer than the bare brackets, closing ] :operator.
        const m = attr[0];
        enc.textToken(m[0], "operator");
        if (m.length > 2) enc.textToken(m.slice(1, m.length - 1), "attribute_name");
        if (m[m.length - 1] === "]") enc.textToken("]", "operator");
        i += m.length;
        continue;
      }
      const media = at(RE_AT_MEDIA, input, i);
      if (media !== null) {
        push(media[0], "directive");
        states.push("media_before_name");
        continue;
      }
    } else if (state === "block") {
      // css.rb:91-98: ident -> :value when a value is expected, else :key.
      // The atomic + (?!\() semantics as above.
      const ident = at(RE_BLOCK_IDENT, input, i);
      if (ident !== null && input[i + ident[0].length] !== "(") {
        enc.textToken(ident[0], valueExpected ? "value" : "key");
        i += ident[0].length;
        continue;
      }
    } else if (state === "media_before_name") {
      const ident = at(RE_MEDIA_IDENT, input, i);
      if (ident !== null) {
        push(ident[0], "type");
        states[states.length - 1] = "media_after_name";
        continue;
      }
    } else if (state === "media_after_name") {
      // css.rb:108-112: `{` here transitions to :media (the case consumes
      // it - no :block push).
      if (input[i] === "{") {
        push("{", "operator");
        states[states.length - 1] = "media";
        continue;
      }
    }

    // css.rb:121-122 comment.
    const comment = at(RE_COMMENT, input, i);
    if (comment !== null) {
      push(comment[0], "comment");
      continue;
    }

    // css.rb:124-127 `{` opens a block.
    if (input[i] === "{") {
      valueExpected = false;
      push("{", "operator");
      states.push("block");
      continue;
    }
    // css.rb:129-134 `}` closes block/media.
    if (input[i] === "}") {
      valueExpected = false;
      push("}", "operator");
      const last = states[states.length - 1];
      if (last === "block" || last === "media") states.pop();
      continue;
    }

    // css.rb:136-141 string - a GROUP (:delimiter/:content kind paths).
    const str = at(RE_STRING, input, i);
    if (str !== null) {
      const m = str[0];
      enc.beginGroup("string");
      enc.textToken(m[0], "delimiter");
      if (m.length > 2) enc.textToken(m.slice(1, m.length - 1), "content");
      if (m.length >= 2) enc.textToken(m[m.length - 1], "delimiter");
      enc.endGroup();
      i += m.length;
      continue;
    }

    // css.rb:143-153 function - a GROUP: `name(`/:delimiter, inner
    // :content, closing `)`/:delimiter.
    const fn = at(RE_FUNCTION, input, i);
    if (fn !== null) {
      const m = fn[0];
      const start = /^\w+\(/.exec(m)![0];
      enc.beginGroup("function");
      enc.textToken(start, "delimiter");
      if (m[m.length - 1] === ")") {
        if (m.length > start.length + 1) {
          enc.textToken(m.slice(start.length, m.length - 1), "content");
        }
        enc.textToken(")", "delimiter");
      } else {
        if (m.length > start.length) {
          enc.textToken(m.slice(start.length), "content");
        }
      }
      enc.endGroup();
      i += m.length;
      continue;
    }

    // css.rb:155-156 dimension | percentage | number -> :float.
    const measure = at(RE_MEASURE, input, i);
    if (measure !== null) {
      push(measure[0], "float");
      continue;
    }

    // css.rb:158-159 hex color.
    const hex = at(RE_HEX, input, i);
    if (hex !== null) {
      push(hex[0], "color");
      continue;
    }

    // css.rb:161-162 !important.
    const important = at(RE_IMPORTANT, input, i);
    if (important !== null) {
      push(important[0], "important");
      continue;
    }

    // css.rb:164-165 rgb/hsl color.
    const rgb = at(RE_RGB, input, i);
    if (rgb !== null) {
      push(rgb[0], "color");
      continue;
    }

    // css.rb:167-168 @keyword directive.
    const atKeyword = at(RE_AT_KEYWORD, input, i);
    if (atKeyword !== null) {
      push(atKeyword[0], "directive");
      continue;
    }

    // css.rb:170-176 the operator class; : starts a value, ; ends one.
    const op = at(RE_OP, input, i);
    if (op !== null) {
      const ch = op[0];
      if (ch === ":") valueExpected = true;
      else if (ch === ";") valueExpected = false;
      push(ch, "operator");
      continue;
    }

    // css.rb:178-179 everything else is an :error, one char at a time.
    push(input[i], "error");
  }
}
