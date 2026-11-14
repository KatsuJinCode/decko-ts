// CodeRay Ruby scanner.
//
// Truth source: coderay-1.1.3 lib/coderay/scanners/ruby.rb (+ ruby/patterns.rb,
// ruby/string_state.rb), transcribed state machine. The scanner covers the
// initial-state surface the deck's Ruby code blocks exercise: identifiers and
// keywords (with the keyword sub-states def/module/class/undef/alias),
// operators, numerics, symbols, instance/class/global variables, comments, and
// single-quoted / double-quoted strings (including their escape sequences and
// the `#$foo` / `#@foo` in-string variable escapes). Constructs the state
// machine below does not implement (heredocs, %-literal fancy strings, regex
// literals, `?x` character literals, backtick shell strings, `#{...}` inline
// blocks, =begin/__END__) make the scan BAIL: scanRuby returns undefined and
// the caller falls back to the plain pass-through (which is byte-exact for
// non-tokenizing content), so a half-correct token stream is never emitted.
//
// The encoder is the shared HtmlTokenEncoder: the kind names here are the
// Ruby scanner's (ruby.rb `text_token match, :kind`), resolved through
// token_kinds.rb and the alpha theme exactly like every other scanner.

import { HtmlTokenEncoder } from "../encoder.js";

/** Standalone scan (CodeRay.scan(content, :ruby) top-level): the token
 *  stream into a FRESH encoder, DIV content returned. Returns undefined
 *  when the scan bails on an unimplemented construct (the caller then
 *  renders the block as plain text). */
export function scanRuby(input: string): string | undefined {
  const enc = new HtmlTokenEncoder();
  return scanRubyInto(enc, input) ? enc.toString() : undefined;
}

// --- patterns.rb, under the unicode forms (ruby.rb:56: the source is UTF-8) -

const IDENT_START = "[\\p{L}_\\u{80}-\\u{10FFFF}]";
const ALNUM = "[\\p{L}\\p{N}_\\u{80}-\\u{10FFFF}]";
const IDENT = `${IDENT_START}${ALNUM}*`;

/** patterns.rb METHOD_SUFFIX. */
const METHOD_SUFFIX = "(?:[?!]|=(?![~>]|=(?!>)))";
/** patterns.rb METHOD_NAME_OPERATOR. */
const METHOD_NAME_OPERATOR =
  "\\*\\*?|[-+~]@?|[\\/%&|^`]|\\[\\]=?|<<|>>|<=?>?|>=?|===?|=~|![~=@]?";
/** patterns.rb METHOD_NAME / METHOD_NAME_EX / METHOD_AFTER_DOT. */
const METHOD_NAME = `${IDENT}[?!]?`;
const METHOD_NAME_EX = `(?:${IDENT}${METHOD_SUFFIX}?|${METHOD_NAME_OPERATOR})`;
const METHOD_AFTER_DOT = `(?:${IDENT}[?!]?|${METHOD_NAME_OPERATOR})`;

/** patterns.rb GLOBAL_VARIABLE. */
const GLOBAL_VARIABLE =
  "\\$(?:" + IDENT + "|[1-9]\\d*|0\\w*|[~&+`'=\\/,;_.<>!@$?*\":\\\\]|-[a-zA-Z_0-9])";

/** patterns.rb NUMERIC pieces. */
const DECIMAL = "\\d+(?:_\\d+)*";
const OCTAL = "0_?[0-7]+(?:_[0-7]+)*";
const HEXADECIMAL = "0x[0-9A-Fa-f]+(?:_[0-9A-Fa-f]+)*";
const BINARY = "0b[01]+(?:_[01]+)*";
const EXPONENT = `[eE][+-]?${DECIMAL}`;
const FLOAT_SUFFIX = `(?:${EXPONENT}|\\.${DECIMAL}(?:${EXPONENT})?)`;
/** NUMERIC with the float suffix captured (ruby.rb:198 reads `self[1]`,
 *  patterns.rb's empty `()` capture inside FLOAT_OR_INT). */
const NUMERIC_F = `(?:(?=0)(?:${OCTAL}|${HEXADECIMAL}|${BINARY})|${DECIMAL}(?<fs>${FLOAT_SUFFIX})?)`;

/** patterns.rb VALUE_FOLLOWS, minus the CHARACTER alternative (`?x` bails
 *  before this check can need it). Anchored with ^ (position-pinned). */
const VALUE_FOLLOWS =
  "(?:[ \\t\\f\\v]+)(?:(?:[%\\/][^\\s=])|(?:<<-?\\S)|(?:[-+]\\d))";

/** patterns.rb SIMPLE_ESCAPE: the body after a backslash inside an
 *  interpreted string. CONTROL_META_ESCAPE bails instead; anything the
 *  simple table misses reaches the catch-all and is emitted whole, which is
 *  what Ruby's `| .` arm does. */
const SIMPLE_ESCAPE = "(?:[abefnrstv]|[0-7]{1,3}|x[0-9A-Fa-f]{1,2}|[\\s\\S])";

/** ruby.rb:26 `@state = :initial` plus the KEYWORD_NEW_STATE targets and the
 *  def/dot fallback states. */
type ParserState =
  | "initial"
  | "def_expected"
  | "dot_expected"
  | "module_expected"
  | "undef_expected"
  | "undef_comma_expected"
  | "alias_expected";

/** patterns.rb KEYWORDS (IDENT_KIND's :keyword set). */
const KEYWORDS = new Set([
  "and", "def", "end", "in", "or", "unless", "begin", "defined?", "ensure",
  "module", "redo", "super", "until", "BEGIN", "break", "do", "next", "rescue",
  "then", "when", "END", "case", "else", "for", "retry", "while", "alias",
  "class", "elsif", "if", "not", "return", "undef", "yield",
]);

/** patterns.rb KEYWORD_NEW_STATE. */
const KEYWORD_NEW_STATE = new Map<string, ParserState>([
  ["def", "def_expected"],
  ["undef", "undef_expected"],
  ["alias", "alias_expected"],
  ["class", "module_expected"],
  ["module", "module_expected"],
]);

/** patterns.rb KEYWORDS_EXPECTING_VALUE. */
const KEYWORDS_EXPECTING_VALUE = new Set([
  "and", "end", "in", "or", "unless", "begin", "defined?", "ensure", "redo",
  "super", "until", "break", "do", "next", "rescue", "then", "when", "case",
  "else", "for", "retry", "while", "elsif", "if", "not", "return", "yield",
]);

/** patterns.rb PREDEFINED_CONSTANTS. */
const PREDEFINED_CONSTANTS = new Set([
  "nil", "true", "false", "self", "DATA", "ARGV", "ARGF", "ENV", "FALSE",
  "TRUE", "NIL", "STDERR", "STDIN", "STDOUT", "TOPLEVEL_BINDING",
  "RUBY_COPYRIGHT", "RUBY_DESCRIPTION", "RUBY_ENGINE", "RUBY_PATCHLEVEL",
  "RUBY_PLATFORM", "RUBY_RELEASE_DATE", "RUBY_REVISION", "RUBY_VERSION",
  "__FILE__", "__LINE__", "__ENCODING__",
]);

/** ruby.rb StringState, for the ' and " delimiters only (the delimiters the
 *  plain string arm opens; fancy delimiters bail before a StringState is
 *  ever built). string_state.rb's paren-pair machinery is unreachable for
 *  these two delimiters and stays unimplemented. */
class StringState {
  readonly interpreted: boolean;
  readonly delim: string;
  /** string_state.rb STRING_PATTERN: `(?=[<delim>\\]|#[{$@])` when
   *  interpreted, `(?=[<delim>\\])` otherwise. */
  readonly pattern: RegExp;
  next_state: ParserState = "initial";

  constructor(kind: string, interpreted: boolean, delim: string) {
    this.interpreted = interpreted;
    this.delim = delim;
    // "g" so exec honors lastIndex (Src.scanUntil searches forward); "m"
    // for the heredoc-shaped sources Ruby compiles the same flag into.
    this.pattern = new RegExp(
      interpreted ? `(?=[${delim}\\\\]|#[{$@])` : `(?=[${delim}\\\\])`,
      "gm",
    );
    void kind;
  }
}

/** The scanner position (StringScanner semantics: scan/check anchored at
 *  pos, scan_until through a match, getch, bol?). */
class Src {
  readonly s: string;
  pos = 0;
  private lastExec: RegExpExecArray | null = null;
  constructor(s: string) {
    this.s = s;
  }
  get eos(): boolean {
    return this.pos >= this.s.length;
  }
  /** Consume `re` (sticky) anchored at pos; returns the match or null. */
  scan(re: RegExp): string | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.s);
    if (m === null || m.index !== this.pos) return null;
    this.pos = re.lastIndex;
    this.lastExec = m;
    return m[0];
  }
  /** Look, don't consume. */
  check(re: RegExp): string | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.s);
    if (m === null || m.index !== this.pos) return null;
    return m[0];
  }
  /** The capture groups of the last scan. */
  named(name: string): string | undefined {
    return this.lastExec?.groups?.[name];
  }
  /** Consume through the first match at or after pos; returns the consumed
   *  span, or null (StringScanner#scan_until). */
  scanUntil(re: RegExp): string | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.s);
    if (m === null) return null;
    const end = re.lastIndex;
    const consumed = this.s.slice(this.pos, end);
    this.pos = end;
    return consumed;
  }
  getch(): string {
    const ch = this.s[this.pos];
    this.pos += 1;
    return ch;
  }
  peek(n: number): string {
    return this.s.slice(this.pos, this.pos + n);
  }
  /** scanner.rb `bol?`: pos is 0 or follows a newline. */
  bol(): boolean {
    return this.pos === 0 || this.s[this.pos - 1] === "\n";
  }
}

/** string_state.rb simple_key_pattern: `"foo" :` style hash keys. */
function stringSimpleKeyPattern(delim: string): RegExp {
  return delim === "'"
    ? /(?:(?:[^\\']+|\\.)*)' :/y
    : /(?:(?:[^\\"#]+|\\.|#\$[\\"]|#\{[^{}]+\}|#(?!\{))*)" :/y;
}

/** The def/undef target regex `(?>METHOD_NAME_EX)(?!\.|::)`, whose Ruby
 *  form is ATOMIC: once METHOD_NAME_EX has matched its greedy run, the
 *  trailing (?!\.|::) cannot force it to give characters back (so
 *  `self.call` fails the whole match rather than degrading to `sel`).
 *  JS has no atomic groups, so the greedy match is taken first and the
 *  lookahead is tested separately, with no retry. */
const METHOD_NAME_EX_RE = new RegExp(`(?:${METHOD_NAME_EX})`, "yu");
const NO_DOT_SCOPE_RE = /(?:\.|::)/y;

function scanMethodExNoDot(src: Src): string | null {
  const m = src.scan(METHOD_NAME_EX_RE);
  if (m === null) return null;
  NO_DOT_SCOPE_RE.lastIndex = src.pos;
  if (NO_DOT_SCOPE_RE.exec(src.s) !== null) {
    // the lookahead holds at the greedy match's end: the atomic group
    // declines, nothing is consumed
    src.pos -= m.length;
    return null;
  }
  return m;
}

const RE_SPACE = /[ \t\f\v]+/y;
const RE_NEWLINE = /\n/y;
const RE_BSLASH_NEWLINE = /\\\n/y;
const RE_COMMENT = /#.*/y;
const RE_RUBYDOC = /^=begin(?!\S)/my;
const RE_DATA_END = /^__END__$/my;
const RE_COLON_KEY = /:(?!:)/y;
const RE_CONST_PAREN = /\(/y;
const RE_OP1 =
  /(?:(?<dot>\.(?!\.)|::)|(?<val>\.\.\.?|==?=?|[,([{])|[\])}])/y;
const RE_QUOTED_SYMBOL = /:['"]/y;
const RE_OP2 = /[-+!~^\/]=?|[:;]|&\.|[*|&]{1,2}=?|>>?/y;
const RE_HEREDOC = /<</y;
const RE_FANCY = /%(?:[iIqQrswWx]|(?![a-zA-Z0-9]))[^a-zA-Z0-9]/y;
const RE_CHAR_LIT = /\?(?:[^\s\\]|\\)/y;
const RE_OP3 = /%=?|<(?:<|=>?)?|\?/y;
const RE_BACKTICK = /`/y;
const RE_BSLASH_EOF = /\\$/y;
const RE_DOT_OR_DC = /\.|::/y;
const RE_SHL = /<</y;
const RE_COMMA = /,/y;
const RE_STR_SIMPLE = /'(?:(?:[^'\\]*)')?|"(?:(?:[^"\\#\n]*)")?/y;
const RE_TRAILING_COLON = /:/y;
const RE_R_SUFFIX = /r/y;
const RE_I_SUFFIX = /i/y;
const RE_VALUE_FOLLOWS = new RegExp(VALUE_FOLLOWS, "y");

/** ruby.rb:29 scan_tokens. Returns false on bail (the caller discards the
 *  partial stream and falls back to plain text). One construct is handled
 *  per iteration: the arms are an else-if chain, exactly like Ruby's
 *  elsif chain, and the lastState restore (ruby.rb:278-281) runs at the
 *  loop tail for every initial-family arm. */
function scanTokens(src: Src, enc: HtmlTokenEncoder): boolean {
  let state: ParserState | StringState = "initial";
  let lastState: ParserState | StringState | undefined = undefined;
  // ruby.rb:39 `method_call_expected = false`.
  let methodCallExpected: string | boolean = false;
  // ruby.rb:40 `value_expected = true`; `when` sets the :colon_expected
  // variant, tracked as the string "colon" (truthy, like the Ruby symbol).
  let valueExpected: boolean | "colon" = true;

  for (;;) {
    if (src.eos) break;

    if (state instanceof StringState) {
      // --- ruby.rb:359 the StringState arm ---

      const content = src.scanUntil(state.pattern);
      if (content !== null) {
        if (content !== "") {
          enc.textToken(content, "content");
          if (src.eos) break; // ruby.rb:364
        }
      } else {
        // ruby.rb:361 `|| scan_rest`: the rest becomes one content token.
        const rest = src.s.slice(src.pos);
        src.pos = src.s.length;
        if (rest !== "") enc.textToken(rest, "content");
        break;
      }
      const ch = src.getch();
      if (ch === state.delim) {
        enc.textToken(ch, "delimiter");
        // The :regexp modifier arm is unreachable: regexp strings bail at
        // their opener.
        enc.endGroup();
        valueExpected = false;
        state = state.next_state;
      } else if (ch === "\\") {
        if (state.interpreted) {
          const esc = src.scan(new RegExp(`(?:${SIMPLE_ESCAPE})`, "my"));
          if (esc !== null) {
            enc.textToken(ch + esc, "char");
          } else {
            enc.textToken(ch, "error");
          }
        } else {
          const esc = src.eos ? null : src.getch();
          if (esc === null) {
            enc.textToken(ch, "content");
          } else if (esc === state.delim || esc === "\\") {
            enc.textToken(ch + esc, "char");
          } else {
            enc.textToken(ch + esc, "content");
          }
        }
      } else if (ch === "#") {
        const next = src.peek(1);
        if (next === "{") {
          return false; // ruby.rb:415 the #{...} inline block
        } else if (next === "$" || next === "@") {
          // ruby.rb:423: the in-string variable escape; parsing resumes in
          // :initial for one token, then returns to the string.
          enc.textToken(ch, "escape");
          lastState = state;
          state = "initial";
        } else {
          return false; // ruby.rb:428 raises - unreachable for ' and "
        }
      } else {
        return false; // ruby.rb:437 raises - unreachable for ' and "
      }
    } else {
      // ruby.rb:62-89: the whitespace/comment arms sit ABOVE the state
      // dispatch and run in EVERY symbol state - this is how `def foo`
      // consumes the space in :def_expected before the method name is
      // scanned.
      let m: string | null;
      let handledPrologue = true;
      if ((m = src.scan(RE_SPACE)) !== null) {
        enc.textToken(m, "space");
      } else if ((m = src.scan(RE_NEWLINE)) !== null) {
        // ruby.rb:64-75: the heredoc arm is unreachable (heredocs bail).
        valueExpected = true;
        if (state === "undef_comma_expected") state = "initial"; // ruby.rb:72
        enc.textToken(m, "space");
      } else if (src.check(/#/y) !== null) {
        // ruby.rb:77: ` \#(!)?.* | RUBYDOC_OR_DATA `. =begin and __END__
        // bail; the plain comment consumes either way (bol or not).
        if (src.check(RE_RUBYDOC) !== null || src.check(RE_DATA_END) !== null) {
          return false;
        }
        const comment = src.scan(RE_COMMENT)!;
        enc.textToken(comment, comment.startsWith("#!") ? "doctype" : "comment");
      } else if ((m = src.scan(RE_BSLASH_NEWLINE)) !== null) {
        enc.textToken(m, "space");
      } else {
        handledPrologue = false;
      }

      if (!handledPrologue) {
      if (state === "initial") {
      // --- ruby.rb:91 the :initial state. One construct per iteration:
      // the arms are Ruby's elsif chain in source order and each leaves via
      // the labeled break, so the loop tail's lastState restore runs for
      // every arm.

      let m: string | null;
      initialArms: {
        // IDENTS (ruby.rb:94-117) / METHOD_AFTER_DOT (ruby.rb:119-128)
        if (!methodCallExpected) {
          m = src.scan(new RegExp(`${METHOD_NAME}`, "yu"));
          if (m === null) {
            // OPERATORS, first arm (ruby.rb:131-150) - the inline-block
            // brace bookkeeping is unreachable (inline blocks bail).
            const op1 = src.scan(RE_OP1);
            if (op1 !== null) {
              const dot = src.named("dot");
              methodCallExpected = dot !== undefined ? dot : false;
              valueExpected = !methodCallExpected && src.named("val") !== undefined;
              enc.textToken(op1, "operator");
              break initialArms;
            }
          } else {
            let kind = "ident";
            if (PREDEFINED_CONSTANTS.has(m)) kind = "predefined_constant";
            if (KEYWORDS.has(m)) kind = "keyword";
            // ruby.rb:99: the scan runs only where the colon can be taken.
            const colon = valueExpected !== "colon" ? src.scan(RE_COLON_KEY) : null;
            if (colon !== null) {
              valueExpected = true;
              enc.textToken(m, "key");
              enc.textToken(":", "operator");
            } else {
              valueExpected = false;
              if (kind === "ident") {
                if (/^[A-Z]/.test(m) && !/[!?]$/.test(m) && src.check(RE_CONST_PAREN) === null) {
                  kind = "constant";
                }
              } else if (kind === "keyword") {
                const nextState = KEYWORD_NEW_STATE.get(m);
                if (nextState !== undefined) state = nextState;
                if (KEYWORDS_EXPECTING_VALUE.has(m)) {
                  valueExpected = m === "when" ? "colon" : true;
                }
              }
              if (!valueExpected && src.check(RE_VALUE_FOLLOWS) !== null) {
                valueExpected = true;
              }
              enc.textToken(m, kind);
            }
            break initialArms;
          }
        } else {
          m = src.scan(new RegExp(`${METHOD_AFTER_DOT}`, "yu"));
          if (m !== null) {
            if (methodCallExpected === "::" && /^[A-Z]/.test(m) && src.check(RE_CONST_PAREN) === null) {
              enc.textToken(m, "constant");
            } else {
              enc.textToken(m, "ident");
            }
            methodCallExpected = false;
            valueExpected = src.check(RE_VALUE_FOLLOWS) !== null;
            break initialArms;
          }
        }

        // SYMBOLS (ruby.rb:152-164). A quote-delimited symbol bails with
        // its StringState (ruby.rb:154-160).
        if (src.check(RE_QUOTED_SYMBOL) !== null) return false;
        m = src.scan(new RegExp(`:(?:${METHOD_NAME_EX}|${GLOBAL_VARIABLE})`, "yu"));
        if (m !== null) {
          enc.textToken(m, "symbol");
          valueExpected = false;
          break initialArms;
        }

        // STRINGS (ruby.rb:166-181)
        m = src.scan(RE_STR_SIMPLE);
        if (m !== null) {
          if (m.length === 1) {
            const kind = src.check(stringSimpleKeyPattern(m)) !== null ? "key" : "string";
            enc.beginGroup(kind);
            enc.textToken(m, "delimiter");
            state = new StringState(kind, m === '"', m);
          } else {
            const kind = valueExpected === true && src.scan(RE_TRAILING_COLON) !== null ? "key" : "string";
            enc.beginGroup(kind);
            enc.textToken(m[0], "delimiter");
            if (m.length > 2) enc.textToken(m.slice(1, -1), "content");
            enc.textToken(m[m.length - 1], "delimiter");
            enc.endGroup();
            if (kind === "key") enc.textToken(":", "operator");
            valueExpected = false;
          }
          break initialArms;
        }

        // INSTANCE VARIABLES (ruby.rb:183-186)
        m = src.scan(new RegExp(`@${IDENT}`, "yu"));
        if (m !== null) {
          valueExpected = false;
          enc.textToken(m, "instance_variable");
          break initialArms;
        }

        // The regex open bails (ruby.rb:188-191).
        if (valueExpected !== false && src.check(/\//y) !== null) return false;

        // NUMERICS (ruby.rb:193-203)
        m = src.scan(new RegExp(`${valueExpected !== false ? "(?:[-+]?)" : ""}(?:${NUMERIC_F})`, "y"));
        if (m !== null) {
          if (methodCallExpected !== false) {
            enc.textToken(m, "error");
            methodCallExpected = false;
          } else {
            let text = m;
            const kind = src.named("fs") !== undefined ? "float" : "integer";
            if (!/[eE]/.test(text) && src.scan(RE_R_SUFFIX) !== null) text += "r";
            if (src.scan(RE_I_SUFFIX) !== null) text += "i";
            enc.textToken(text, kind);
          }
          valueExpected = false;
          break initialArms;
        }

        // OPERATORS, second arm (ruby.rb:205-207)
        if ((m = src.scan(RE_OP2)) !== null) {
          valueExpected = true;
          enc.textToken(m, "operator");
          break initialArms;
        }

        // HEREDOC / FANCY STRING / CHARACTER all bail (ruby.rb:209-229).
        if (valueExpected !== false && src.check(RE_HEREDOC) !== null) return false;
        if (valueExpected !== false && src.check(RE_FANCY) !== null) return false;
        if (valueExpected !== false && src.check(RE_CHAR_LIT) !== null) return false;

        // OPERATORS, third arm (ruby.rb:231-233)
        if ((m = src.scan(RE_OP3)) !== null) {
          valueExpected = m === "?" ? "colon" : true;
          enc.textToken(m, "operator");
          break initialArms;
        }

        // BACKTICK bails (ruby.rb:235-238).
        if (src.check(RE_BACKTICK) !== null) return false;

        // GLOBAL VARIABLES (ruby.rb:240-243)
        m = src.scan(new RegExp(`${GLOBAL_VARIABLE}`, "yu"));
        if (m !== null) {
          enc.textToken(m, "global_variable");
          valueExpected = false;
          break initialArms;
        }

        // CLASS VARIABLES (ruby.rb:245-248)
        m = src.scan(new RegExp(`@@${IDENT}`, "yu"));
        if (m !== null) {
          valueExpected = false;
          enc.textToken(m, "class_variable");
          break initialArms;
        }

        if ((m = src.scan(RE_BSLASH_EOF)) !== null) {
          enc.textToken(m, "space");
          break initialArms;
        }

        // ruby.rb:253-274: the error arm. method_call_expected clears once
        // and retries; anything else is a one-char :error token.
        if (methodCallExpected !== false) {
          methodCallExpected = false;
        } else {
          enc.textToken(src.getch(), "error");
        }
      }

      // ruby.rb:278-281: restore an interrupted StringState after one
      // :initial token. The restore sits INSIDE the :initial branch (the
      // elsif-chain indentation in ruby.rb), so a pending dot_expected
      // survives every other state's iteration: `def self.call` fails
      // def_expected at the `.` lookahead, the pending :dot_expected rides
      // through the `self` ident, takes the `.`, and re-enters
      // def_expected for `call`.
      if (lastState !== undefined && !(state instanceof StringState)) {
        state = lastState;
        lastState = undefined;
      }
    } else if (state === "def_expected") {
      const match = scanMethodExNoDot(src);
      if (match !== null) {
        enc.textToken(match, "method");
        state = "initial";
      } else {
        lastState = "dot_expected";
        state = "initial";
      }
    } else if (state === "dot_expected") {
      const match = src.scan(RE_DOT_OR_DC);
      if (match !== null) {
        state = "def_expected";
        enc.textToken(match, "operator");
      } else {
        state = "initial";
      }
    } else if (state === "module_expected") {
      const shl = src.scan(RE_SHL);
      if (shl !== null) {
        enc.textToken(shl, "operator");
      } else {
        state = "initial";
        const name = src.scan(new RegExp(`(?:(?:${IDENT})::)*${IDENT}`, "yu"));
        if (name !== null) {
          enc.textToken(name, "class");
        }
      }
    } else if (state === "undef_expected") {
      state = "undef_comma_expected";
      const name = scanMethodExNoDot(src);
      if (name !== null) {
        enc.textToken(name, "method");
      } else {
        // ruby.rb:318 the quoted-symbol arm bails with its StringState.
        if (src.check(RE_QUOTED_SYMBOL) !== null) return false;
        const sym = src.scan(
          new RegExp(`:(?:${METHOD_NAME_EX}|${GLOBAL_VARIABLE})`, "yu"),
        );
        if (sym !== null) {
          enc.textToken(sym, "symbol");
        } else {
          state = "initial";
        }
      }
    } else if (state === "undef_comma_expected") {
      const comma = src.scan(RE_COMMA);
      if (comma !== null) {
        enc.textToken(comma, "operator");
        state = "undef_expected";
      } else {
        state = "initial";
      }
    } else if (state === "alias_expected") {
      const pair = src.scan(
        new RegExp(
          `(?<g1>${METHOD_NAME_EX}|${GLOBAL_VARIABLE}|:${METHOD_NAME_EX})(?<g2>[ \\t]+)(?<g3>${METHOD_NAME_EX}|${GLOBAL_VARIABLE}|:${METHOD_NAME_EX})`,
          "yu",
        ),
      );
      if (pair !== null) {
        enc.textToken(
          src.named("g1")!,
          src.named("g1")!.startsWith(":") ? "symbol" : "method",
        );
        enc.textToken(src.named("g2")!, "space");
        enc.textToken(
          src.named("g3")!,
          src.named("g3")!.startsWith(":") ? "symbol" : "method",
        );
      }
      state = "initial";
      }
      }
    }
  }

  // ruby.rb:448-451: close a StringState the stream left open.
  if (state instanceof StringState) {
    enc.endGroup();
  }
  return true;
}

/** Entry: false on bail (the caller discards the partial stream). */
export function scanRubyInto(enc: HtmlTokenEncoder, input: string): boolean {
  return scanTokens(new Src(input), enc);
}
