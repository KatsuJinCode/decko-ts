// The libsass 3.6.4 byte-parity adapter: transforms OUR compiler's (dart sass)
// CSS output into the byte conventions the oracle libsass 3.6.4 emits, so the
// ENGINE's output itself is byte-identical with the deck's SassC renders
// (tests/card/mod-loader/compile-engines-pin.test.ts pins the bytes).
//
// Ground truth (dual-probe measured against the REAL engines:
// dart sass 1.105.0 in node vs libsass 3.6.4 via the installed sassc-2.4.0
// gem; plus the oracle fixture fixtures/captured/compile-engines.json):
//
// For plain-CSS value tokens libsass is AUTHORED-TEXT-PRESERVING
// (`0.50px` stays `0.50px`, `1e3px` stays `1e3px`, `#AAAAAA` keeps case,
// `[a='x y']` keeps single quotes, `content:"\F67F"` keeps the escape), while
// dart canonicalizes numbers/colors/strings and strips quotes it deems
// unnecessary. libsass's own normalizations, which this adapter replicates:
//   - compound selectors re-emit in category order type < id < class < attr
//     < pseudo (authored order kept within a category);
//   - calc() inner text is authored-verbatim except padding before `)` is
//     trimmed (`calc( 100% - 2.4em )` -> `calc( 100% - 2.4em)`);
//   - numbers that reach the Number emitter (variable derefs, arithmetic)
//     canonicalize, and :compressed strips the leading zero when the parser's
//     authored-form flag allows (parser.cpp number_has_zero) - for
//     source-resolvable values the authored text wins anyway;
//   - inside color functions arguments canonicalize (`rhbq(0,0,0,.5)` ->
//     `rhbq(0,0,0,0.5)`);
//   - compressed output gets a BOM, other styles an `@charset "UTF-8";` line,
//     iff the FINAL bytes contain literal non-ASCII (output.cpp get_buffer);
//   - expanded output separates EVERY pair of top-level nodes with a blank
//     line (including rules hoisted from nesting, unlike dart);
//   - a rule whose body is only a comment renders multi-line
//     (`a {\n  /*c*/\n}`), not dart's `a { /*c*/ }`.
//
// The adapter is SOURCE-AWARE: sasscRender holds the source string, and the
// authored form of a token cannot be recovered from dart's canonical output
// alone (`0.6rem` and `.6rem` both compile to `.6rem`). Source and output run
// through the SAME state machine (strings, comments, url(...) spans - and the
// decko `[[...]]` nests inside them - are skipped; declaration values are
// distinguished from selectors by the saw-colon rule), so only structural
// text feeds the maps and only the same positions consume them. Maps are FIFO
// per value key: same-valued authored forms (`0.1` and `.1`, `#ccc` and
// `#cccccc`) restore occurrence-by-occurrence, which is exact while both
// engines keep rule order (they do; both drop only empty rules, and an empty
// rule carries no values).
//
// Residuals (each enumerated against the oracle-pinned corpus):
// computed values with no source-resolvable literal (e.g. a variable-carried
// negative whose authored form libsass strips but dart writes `-0.x`), dart's
// calc elision of single-value calcs (`calc( 100% )` -> `100%`, wrapper lost),
// and syntax-error message bytes. None is reachable from the oracle-pinned
// corpus.

/** CSS named colors (CSS Color Module keyword set) mapped to their sRGB hex,
 *  so an output keyword restores the authored token for the same color value
 *  (dart emits whichever of keyword/hex is shorter; `transparent` is its own
 *  value: fully transparent black). */
const NAMED_COLORS: Record<string, string> = {
  black: "#000000", silver: "#c0c0c0", gray: "#808080", white: "#ffffff",
  maroon: "#800000", red: "#ff0000", purple: "#800080", fuchsia: "#ff00ff",
  green: "#008000", lime: "#00ff00", olive: "#808000", yellow: "#ffff00",
  navy: "#000080", blue: "#0000ff", teal: "#008080", aqua: "#00ffff",
  orange: "#ffa500", aliceblue: "#f0f8ff", antiquewhite: "#faebd7",
  aquamarine: "#7fffd4", azure: "#f0ffff", beige: "#f5f5dc",
  bisque: "#ffe4c4", blanchedalmond: "#ffebcd", blueviolet: "#8a2be2",
  brown: "#a52a2a", burlywood: "#deb887", cadetblue: "#5f9ea0",
  chartreuse: "#7fff00", chocolate: "#d2691e", coral: "#ff7f50",
  cornflowerblue: "#6495ed", cornsilk: "#fff8dc", crimson: "#dc143c",
  cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b", darkgray: "#a9a9a9", darkgreen: "#006400",
  darkgrey: "#a9a9a9", darkkhaki: "#bdb76b", darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc",
  darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b", darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1", darkviolet: "#9400d3", deeppink: "#ff1493",
  deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969",
  dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0",
  forestgreen: "#228b22", gainsboro: "#dcdcdc", ghostwhite: "#f8f8ff",
  gold: "#ffd700", goldenrod: "#daa520", greenyellow: "#adff2f",
  grey: "#808080", honeydew: "#f0fff0", hotpink: "#ff69b4",
  indianred: "#cd5c5c", indigo: "#4b0082", ivory: "#fffff0",
  khaki: "#f0e68c", lavender: "#e6e6fa", lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00", lemonchiffon: "#fffacd", lightblue: "#add8e6",
  lightcoral: "#f08080", lightcyan: "#e0ffff", lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3", lightgreen: "#90ee90", lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1", lightsalmon: "#ffa07a", lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa", lightslategray: "#778899", lightslategrey: "#778899",
  lightsteelblue: "#b0c4de", lightyellow: "#ffffe0", limegreen: "#32cd32",
  linen: "#faf0e6", magenta: "#ff00ff", mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd", mediumorchid: "#ba55d3", mediumpurple: "#9370db",
  mediumseagreen: "#3cb371", mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a", mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585", midnightblue: "#191970", mintcream: "#f5fffa",
  mistyrose: "#ffe4e1", moccasin: "#ffe4b5", navajowhite: "#ffdead",
  oldlace: "#fdf5e6", olivedrab: "#6b8e23", orangered: "#ff4500",
  orchid: "#da70d6", palegoldenrod: "#eee8aa", palegreen: "#98fb98",
  paleturquoise: "#afeeee", palevioletred: "#db7093", papayawhip: "#ffefd5",
  peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb", plum: "#dda0dd",
  powderblue: "#b0e0e6", rosybrown: "#bc8f8f", royalblue: "#4169e1",
  saddlebrown: "#8b4513", salmon: "#fa8072", sandybrown: "#f4a460",
  seagreen: "#2e8b57", seashell: "#fff5ee", sienna: "#a0522d",
  skyblue: "#87ceeb", slateblue: "#6a5acd", slategray: "#708090",
  slategrey: "#708090", snow: "#fffafa", springgreen: "#00ff7f",
  steelblue: "#4682b4", tan: "#d2b48c", thistle: "#d8bfd8", tomato: "#ff6347",
  turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3",
  whitesmoke: "#f5f5f5", yellowgreen: "#9acd32", transparent: "transparent",
};

const NUMBER_TOKEN = /[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/y;

/** number-value map key; distinguishes 0 from -0 (both parse to 0 in JS). */
function numberKey(text: string): string {
  const v = Number(text);
  return Object.is(v, -0) ? "-0" : String(v);
}

/** decode a css string body's escapes to its character content (the map key
 *  that survives dart's escape decoding). */
function decodeStringBody(body: string): string {
  return body.replace(
    /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|(.))/gs,
    (_m, hex: string | undefined, ch: string | undefined) =>
      hex !== undefined ? String.fromCodePoint(parseInt(hex, 16)) : (ch as string),
  );
}

/** normalize an attribute selector for map keying (quotes and runs of
 *  whitespace collapse; the authored text is what gets restored). */
function normalizeAttr(text: string): string {
  return text.replace(/["']/g, "").replace(/\s+/g, " ");
}

interface SourceForms {
  numbers: Map<string, string[]>;
  varNumbers: Map<string, string[]>;
  colors: Map<string, string[]>;
  calcs: Map<string, string[]>;
  attrs: Map<string, string[]>;
  strings: Map<string, string[]>;
}

function pushForm(map: Map<string, string[]>, key: string, value: string): void {
  const queue = map.get(key);
  if (queue === undefined) map.set(key, [value]);
  else queue.push(value);
}

function popForm(map: Map<string, string[]>, key: string): string | undefined {
  const queue = map.get(key);
  if (queue === undefined || queue.length === 0) return undefined;
  const value = queue.shift();
  if (queue.length === 0) map.delete(key);
  return value;
}

/** color-value key from a hex literal or named keyword; undefined when the
 *  text is neither. Alpha is part of the key (0-255). */
function colorKey(token: string): string | undefined {
  if (token.startsWith("#")) {
    const hex = token.slice(1);
    if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-fA-F]/.test(hex)) return undefined;
    let r = 0, g = 0, b = 0, a = 255;
    if (hex.length <= 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16);
    } else {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16);
    }
    return `rgb(${r},${g},${b})a${a}`;
  }
  const named = NAMED_COLORS[token.toLowerCase()];
  if (named === undefined) return undefined;
  if (named === "transparent") return "rgb(0,0,0)a0";
  return colorKey(named);
}

const isIdentChar = (c: string): boolean =>
  /[a-zA-Z0-9_-]/.test(c) || c.charCodeAt(0) > 0x7f;

type RegionKind = "number" | "color" | "calc" | "colorfn" | "attr" | "string";

interface Region {
  kind: RegionKind;
  text: string;
  inValue: boolean;
  inVarDecl: boolean;
  end: number;
}

function scanQuoted(css: string, start: number): number {
  const q = css[start];
  let j = start + 1;
  while (j < css.length) {
    if (css[j] === "\\") j += 2;
    else if (css[j] === q) return j + 1;
    else j++;
  }
  return j;
}

function scanUrlEnd(css: string, start: number): number {
  // `start` is at the `u` of url( - return end (exclusive)
  let j = start + 4; // at "("
  if (css[j] !== "(") return j;
  j++;
  if (css[j] === '"' || css[j] === "'") return scanQuoted(css, j);
  while (j < css.length && css[j] !== ")") {
    if (css[j] === "\\") j += 2;
    else j++;
  }
  return Math.min(j + 1, css.length);
}

function scanBalancedParens(css: string, open: number): number {
  let parens = 0;
  let j = open;
  while (j < css.length) {
    const c = css[j];
    if (c === "(") parens++;
    else if (c === ")") {
      parens--;
      if (parens === 0) return j + 1;
    } else if (c === '"' || c === "'") {
      j = scanQuoted(css, j);
      continue;
    }
    j++;
  }
  return css.length;
}

/** block-comment open, including the loud /*! form (second char is an
 *  exclamation, not a star). */
function isCommentStart(css: string, i: number): boolean {
  if (css[i] !== "/") return false;
  const n = css[i + 1] ?? "";
  return n === "*" || (n === "!" && css[i + 2] === "*");
}

function scanAttrEnd(css: string, start: number): number {
  let j = start + 1;
  while (j < css.length && css[j] !== "]") {
    if (css[j] === '"' || css[j] === "'") {
      j = scanQuoted(css, j);
      continue;
    }
    j++;
  }
  return j < css.length ? j + 1 : -1;
}

/** Scan `css` with the shared state machine, invoking `onRegion` for every
 *  structural region and splicing its return value in when it differs.
 *  Regions: value-context numbers/hexcolors/keyword-colors/strings, calc(...)
 *  and color-function(...) spans, and selector-context attribute tokens.
 *  String bodies, comments, url(...) spans (including the decko `[[...]]`
 *  nests inside them) are skipped - never regions, never map content. */
function walkCss(css: string, onRegion: (region: Region) => string | void): string {
  let out = "";
  let i = 0;
  let depth = 0; // {...} blocks
  let parens = 0; // (...)/[...] nesting
  let sawColon = false;
  let varIdent = false; // the previous token was a $scss-variable
  let varDecl = false; // the current value is a $variable declaration value
  const emit = (original: string, replacement: string | void): void => {
    out += replacement === undefined || replacement === original ? original : replacement;
  };
  while (i < css.length) {
    const c = css[i];
    // strings (any context)
    if (c === '"' || c === "'") {
      const j = scanQuoted(css, i);
      emit(css.slice(i, j), onRegion({ kind: "string", text: css.slice(i, j), inValue: sawColon, inVarDecl: varDecl, end: j }));
      i = j;
      continue;
    }
    // comments
    if (isCommentStart(css, i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && css[i + 1] === "/") {
      const end = css.indexOf("\n", i + 2);
      const stop = end === -1 ? css.length : end;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    // url(...) span - the decko [[...]] nests live in here
    if ((c === "u" || c === "U") && /^url\(/i.test(css.slice(i, i + 5))) {
      const j = scanUrlEnd(css, i);
      out += css.slice(i, j);
      i = j;
      continue;
    }
    // calc( ... ) balanced span (restored wholesale from the source)
    if (sawColon && /^calc\(/i.test(css.slice(i, i + 5))) {
      const j = scanBalancedParens(css, i + 4);
      emit(css.slice(i, j), onRegion({ kind: "calc", text: css.slice(i, j), inValue: true, inVarDecl: varDecl, end: j }));
      i = j;
      continue;
    }
    // rhbq()/rgb()/hsl()/hsla() - libsass canonicalizes inside
    if (sawColon && /^(rhbq?|hsla?)\(/i.test(css.slice(i, i + 6))) {
      const j = scanBalancedParens(css, css.indexOf("(", i));
      emit(css.slice(i, j), onRegion({ kind: "colorfn", text: css.slice(i, j), inValue: true, inVarDecl: varDecl, end: j }));
      i = j;
      continue;
    }
    // attribute selector token (selector context only)
    if (c === "[" && !sawColon) {
      const j = scanAttrEnd(css, i);
      if (j !== -1) {
        emit(css.slice(i, j), onRegion({ kind: "attr", text: css.slice(i, j), inValue: false, inVarDecl: false, end: j }));
        i = j;
        continue;
      }
    }
    // structural punctuation
    if (c === "{") { depth++; sawColon = false; varIdent = false; varDecl = false; out += c; i++; continue; }
    if (c === "}") { depth = Math.max(0, depth - 1); sawColon = false; varIdent = false; varDecl = false; out += c; i++; continue; }
    if (c === ";") { sawColon = false; varIdent = false; varDecl = false; out += c; i++; continue; }
    if (c === "(") { parens++; out += c; i++; continue; }
    if (c === ")") {
      parens = Math.max(0, parens - 1);
      // at a selector/at-rule level the closing paren ends any prelude value
      // (`:not(.a:hover)` / `(min-width: 1px)`); inside a block a declaration
      // continues after a function call
      if (depth === 0 && parens === 0) sawColon = false;
      out += c;
      i++;
      continue;
    }
    if (c === ":") {
      // a declaration colon only exists inside a block; outside blocks a
      // colon is a pseudo/at-rule-prelude separator unless a paren scope
      // (media queries, :not(...)) or a $scss-variable declaration makes
      // its content value-like
      sawColon = depth > 0 || parens > 0 || varIdent;
      varDecl = varIdent;
      varIdent = false;
      out += c;
      i++;
      continue;
    }
    if (/\s/.test(c)) { out += c; i++; continue; }
    // hex color (value context; a selector #id falls through to ident scan)
    if (c === "#" && sawColon) {
      const m = /^#[0-9a-fA-F]{3,8}(?![a-zA-Z0-9_-])/.exec(css.slice(i, i + 10));
      if (m !== null) {
        emit(m[0], onRegion({ kind: "color", text: m[0], inValue: true, inVarDecl: varDecl, end: i + m[0].length }));
        i += m[0].length;
        continue;
      }
    }
    // identifiers (atomic; `.bi-123` and `battery-0` never yield numbers)
    if (/[a-zA-Z_$\u0080-\uFFFF]/.test(c) || (c === "-" && /[a-zA-Z_]/.test(css[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < css.length && isIdentChar(css[j])) j++;
      const ident = css.slice(i, j);
      varIdent = ident.startsWith("$");
      if (sawColon && colorKey(ident) !== undefined) {
        emit(ident, onRegion({ kind: "color", text: ident, inValue: true, inVarDecl: varDecl, end: j }));
        i = j;
        continue;
      }
      out += ident;
      i = j;
      continue;
    }
    // numbers (value context); a sign is part of the number before a digit
    // or a `.digit` (`-.25em` is one token, `battery-0` never splits)
    const next = css[i + 1] ?? "";
    const next2 = css[i + 2] ?? "";
    const startsNumber =
      /[0-9]/.test(c) ||
      ((c === "-" || c === "+" || c === ".") && /[0-9]/.test(next)) ||
      ((c === "-" || c === "+") && next === "." && /[0-9]/.test(next2));
    if (startsNumber) {
      NUMBER_TOKEN.lastIndex = i;
      const m = NUMBER_TOKEN.exec(css);
      if (m !== null && m.index === i) {
        if (sawColon) {
          emit(m[0], onRegion({ kind: "number", text: m[0], inValue: true, inVarDecl: varDecl, end: i + m[0].length }));
        } else {
          out += m[0];
        }
        i += m[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Extract the authored forms from the SOURCE the deck compiles (the maps the
 *  consume side restores from). Value/selector context rules are identical to
 *  the consume walk, so noise (urls, selectors' `-0` ident tails, url query
 *  strings) never enters the maps. */
function collectSourceForms(source: string): SourceForms {
  const forms: SourceForms = {
    numbers: new Map(),
    varNumbers: new Map(),
    colors: new Map(),
    calcs: new Map(),
    attrs: new Map(),
    strings: new Map(),
  };
  walkCss(source, (r) => {
    if (r.kind === "number") {
      // a  declaration value takes libsass's canonical path (the
      // eval layer forces the zero flag), not the authored-verbatim path
      pushForm(r.inVarDecl ? forms.varNumbers : forms.numbers, numberKey(r.text), r.text);
    } else if (r.kind === "color") {
      const key = colorKey(r.text);
      if (key !== undefined) pushForm(forms.colors, key, r.text);
    } else if (r.kind === "calc") {
      const inner = r.text.slice(r.text.indexOf("(") + 1, -1);
      pushForm(forms.calcs, inner.replace(/\s+/g, " ").trim(), inner);
    } else if (r.kind === "attr") {
      pushForm(forms.attrs, normalizeAttr(r.text), r.text);
    } else if (r.kind === "string") {
      pushForm(forms.strings, decodeStringBody(r.text.slice(1, -1)), r.text);
    }
    return undefined;
  });
  return forms;
}

// ---------------------------------------------------------------------------
// selector compound reorder (the libsass category convention)
// ---------------------------------------------------------------------------

/** libsass compound-selector convention: simple selectors re-emit in category
 *  order type < id < class < attr < pseudo, authored order preserved within a
 *  category (probes: `a:link.ui-button` -> `a.ui-button:link`,
 *  `a:focus:hover.b` -> `a.b:focus:hover`, `[x=y]:hover.z` -> `.z[x=y]:hover`,
 *  `a:not(.x).y` -> `a.y:not(.x)`, `a::before.x` -> `a.x::before`). */
function simpleRank(token: string): number {
  if (token.startsWith(":")) return 4; // pseudo-class/-element/functional
  if (token.startsWith("[")) return 3;
  if (token.startsWith(".")) return 2;
  if (token.startsWith("#")) return 1;
  return 0; // type selector / universal
}

function reorderCompound(compound: string): string {
  const simples: Array<{ text: string; rank: number; index: number }> = [];
  let i = 0;
  let token = "";
  const flush = (): void => {
    if (token !== "") {
      simples.push({ text: token, rank: simpleRank(token), index: simples.length });
      token = "";
    }
  };
  while (i < compound.length) {
    const c = compound[i];
    if (c === "[") {
      const j = scanAttrEnd(compound, i);
      const end = j === -1 ? compound.length : j;
      flush();
      simples.push({ text: compound.slice(i, end), rank: 3, index: simples.length });
      i = end;
      continue;
    }
    if (c === "(") {
      const j = scanBalancedParens(compound, i);
      token += compound.slice(i, j);
      i = j;
      continue;
    }
    if (/[\s>+~]/.test(c)) break; // the caller splits on combinators
    // juxtaposed simple selectors split on . / # / : (a:link.ui-button is
    // three simples: type, pseudo-class, class)
    if (token !== "" && (c === "." || c === "#" || c === ":")) flush();
    token += c;
    i++;
  }
  flush();
  if (simples.length <= 1) return compound;
  return simples
    .map((s, order) => ({ ...s, order }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.order - b.order))
    .map((s) => s.text)
    .join("");
}

/** reorder one selector-list item, keeping combinators and the surrounding
 *  whitespace bytes exactly as authored. */
function reorderCompoundSequence(item: string): string {
  const parts: string[] = [];
  let pendingSep = "";
  let compound = "";
  let i = 0;
  while (i < item.length) {
    const c = item[i];
    if (c === ">" || c === "+" || c === "~") {
      if (compound !== "") {
        parts.push(pendingSep + reorderCompound(compound));
        compound = "";
        pendingSep = c;
      } else {
        pendingSep += c;
      }
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < item.length && /\s/.test(item[j])) j++;
      const ws = item.slice(i, j);
      if (compound !== "") {
        parts.push(pendingSep + reorderCompound(compound));
        compound = "";
        pendingSep = ws;
      } else {
        pendingSep += ws;
      }
      i = j;
      continue;
    }
    compound += c;
    i++;
  }
  if (compound === "" && parts.length === 0) return item;
  if (compound !== "") parts.push(pendingSep + reorderCompound(compound));
  const trailing = /\s+$/.exec(item);
  return parts.join("") + (trailing !== null ? trailing[0] : "");
}

function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

function reorderSelectorList(list: string): string {
  return splitTopLevel(list, ",").map(reorderCompoundSequence).join(",");
}

/** selector reorder pass: reorder every selector list (the text before a `{`
 *  that holds no declaration colon). Media/supports preludes with a `:` are
 *  skipped; keyframes percentages reorder to themselves. The pass walks
 *  spans: text between boundaries accumulates in place and is emitted once,
 *  at the boundary. */
function reorderSelectorPass(css: string): string {
  let out = "";
  let spanStart = 0;
  let i = 0;
  const flushSpan = (end: number, isSelector: boolean): void => {
    const text = css.slice(spanStart, end);
    // every `{`-span in compiler css output is a selector list or an
    // at-rule prelude; at-rules keep authored bytes (their preludes are not
    // selector lists and their colons are not pseudo-colons)
    out += isSelector && !/^\s*@/.test(text) ? reorderSelectorList(text) : text;
    spanStart = end;
  };
  while (i < css.length) {
    const c = css[i];
    // strings/comments/urls are never selector material: emit the pending
    // span verbatim, emit the region verbatim, start a new span (so a later
    // flushSpan can never reorder bytes inside them)
    if (c === '"' || c === "'") {
      const j = scanQuoted(css, i);
      out += css.slice(spanStart, i) + css.slice(i, j);
      i = j;
      spanStart = i;
      continue;
    }
    if (isCommentStart(css, i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(spanStart, i) + css.slice(i, stop);
      i = stop;
      spanStart = i;
      continue;
    }
    if (c === "/" && css[i + 1] === "/") {
      const end = css.indexOf("\n", i + 2);
      const stop = end === -1 ? css.length : end;
      out += css.slice(spanStart, i) + css.slice(i, stop);
      i = stop;
      spanStart = i;
      continue;
    }
    if ((c === "u" || c === "U") && /^url\(/i.test(css.slice(i, i + 5))) {
      const j = scanUrlEnd(css, i);
      out += css.slice(spanStart, i) + css.slice(i, j);
      i = j;
      spanStart = i;
      continue;
    }
    if (c === "{") {
      flushSpan(i, true);
      out += c;
      i++;
      spanStart = i;
      continue;
    }
    if (c === "}" || c === ";") {
      flushSpan(i, false);
      out += c;
      i++;
      spanStart = i;
      continue;
    }
    i++;
  }
  flushSpan(css.length, false);
  return out;
}

// ---------------------------------------------------------------------------
// consume side
// ---------------------------------------------------------------------------

/** Does the declaration value starting at `from` contain a decko `[[...]]`
 *  nest? Oracle mechanism (measured, smoothness `background: #cccccc url([[..]])`
 *  -> libsass emits `#ccc`): a nest drags the whole value through libsass's
 *  string-schema path, where color tokens lose their authored display form
 *  and emit canonically shortest - which is what dart already emits. Colors
 *  in such values must NOT be restored. */
function valueContainsDeckoNest(css: string, from: number): boolean {
  let i = from;
  while (i < css.length) {
    const c = css[i];
    if (c === ";" || c === "}") return false;
    if (c === '"') {
      i = scanQuoted(css, i);
      continue;
    }
    if (c === "'" ) {
      i = scanQuoted(css, i);
      continue;
    }
    if (isCommentStart(css, i)) {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if ((c === "u" || c === "U") && /^url\(/i.test(css.slice(i, i + 5))) {
      i = scanUrlEnd(css, i);
      continue;
    }
    if (c === "[" && css[i + 1] === "[") return true;
    i++;
  }
  return false;
}

/** color-function arguments -> color-value key (comma syntax), or undefined
 *  when the text is not a plain numeric rgb(a) call. */
function colorFunctionKey(fn: string, args: string): string | undefined {
  if (!/^rhbq?$/i.test(fn)) return undefined;
  const parts = args.split(",").map((x) => x.trim());
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const chan = (x: string): number | undefined => {
    const m = /^(\d+(?:\.\d+)?)(%?)$/.exec(x);
    if (m === null) return undefined;
    const v = Number(m[1]);
    return m[2] === "%" ? Math.round((v / 100) * 255) : Math.round(v);
  };
  const r = chan(parts[0]), g = chan(parts[1]), b = chan(parts[2]);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  let a = 255;
  if (parts.length === 4) {
    const m = /^(\d+(?:\.\d+)?)(%?)$/.exec(parts[3]);
    if (m === null) return undefined;
    a = m[2] === "%" ? Math.round((Number(m[1]) / 100) * 255) : Math.round(Number(m[1]) * 255);
  }
  return `rgb(${r},${g},${b})a${a}`;
}

/** restore dart's canonical tokens to the authored forms libsass would emit. */
function applyRestores(dartCss: string, forms: SourceForms, style: string): string {
  return walkCss(dartCss, (r) => {
    if (r.kind === "number") {
      const authored = popForm(forms.numbers, numberKey(r.text));
      if (authored !== undefined) return authored;
      // a variable-carried number takes libsass's canonical path with the
      // zero flag forced (eval.cpp): compressed strips the leading zero on
      // BOTH signs; dart adds it on negatives. Expanded already matches.
      const varAuthored = popForm(forms.varNumbers, numberKey(r.text));
      if (varAuthored !== undefined && style === "compressed") {
        return r.text.replace(/^(-?)0\./, "$1.");
      }
      return undefined;
    }
    if (r.kind === "color") {
      const key = colorKey(r.text);
      if (key === undefined) return undefined;
      const authored = popForm(forms.colors, key);
      if (valueContainsDeckoNest(dartCss, r.end)) return undefined;
      return authored;
    }
    if (r.kind === "calc") {
      const inner = r.text.slice(r.text.indexOf("(") + 1, -1);
      const authored = popForm(forms.calcs, inner.replace(/\s+/g, " ").trim());
      if (authored === undefined) return undefined;
      return `${r.text.slice(0, r.text.indexOf("(") + 1)}${authored.replace(/\s+$/, "")})`;
    }
    if (r.kind === "colorfn") {
      // libsass canonicalizes color-function arguments: `.5` -> `0.5`
      const open = r.text.indexOf("(");
      const head = r.text.slice(0, open + 1);
      const args = r.text.slice(open + 1, -1);
      // dart canonicalizes keywords (`transparent` -> `rhbq(0,0,0,0)`);
      // libsass keeps the authored token - resolve through the color map
      const fnKey = colorFunctionKey(head.slice(0, open), args);
      if (fnKey !== undefined) {
        const authored = popForm(forms.colors, fnKey);
        if (authored !== undefined) return authored;
      }
      return (
        head +
        args.replace(/([(,]\s*)\.(\d)/g, (_m, pre: string, d: string) => `${pre}0.${d}`) +
        ")"
      );
    }
    if (r.kind === "attr") {
      return popForm(forms.attrs, normalizeAttr(r.text));
    }
    if (r.kind === "string") {
      return popForm(forms.strings, decodeStringBody(r.text.slice(1, -1)));
    }
    return undefined;
  });
}

const hasNonAscii = (s: string): boolean => /[^\u0000-\u007f]/.test(s);

/** expanded: libsass separates EVERY pair of top-level nodes with a blank
 *  line (dart single-newlines hoisted sibling rules and post-@media rules). */
function expandTopLevelSeparators(css: string): string {
  let out = "";
  let i = 0;
  let depth = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const j = scanQuoted(css, i);
      out += css.slice(i, j);
      i = j;
      continue;
    }
    if (isCommentStart(css, i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "{") { depth++; out += c; i++; continue; }
    if (c === "}") {
      depth = Math.max(0, depth - 1);
      out += c;
      i++;
      if (depth === 0 && css[i] === "\n" && css[i + 1] !== undefined && !/\s/.test(css[i + 1])) {
        out += "\n";
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** expanded: dart renders a comment-only rule inline (selector, " { ",
 *  comment, " }" on one line); libsass renders it multi-line (selector "{",
 *  the comment indented on its own line, then "}" - the shape dart only
 *  emits for rules with declarations). */
function reshapeCommentOnlyRules(css: string): string {
  return css.replace(
    /^([^\r\n{}]*[^\s{}])\s*\{ +(\/\*[^]*?\*\/) *\}$/gm,
    (_m, sel: string, comment: string) => `${sel} {\n  ${comment}\n}`,
  );
}

/** main entry: dart-sass css + the source it came from -> libsass 3.6.4 bytes
 *  (modulo the trailing-newline normalization sasscRender applies itself). */
export function adaptDartCssToLibsassBytes(
  dartCss: string,
  source: string,
  style: "compressed" | "expanded" | "nested" | "compact",
): string {
  if (dartCss === "") return dartCss;
  // strip dart's own charset/BOM preambles; re-added below per libsass's rule
  let css = dartCss;
  if (css.startsWith("\uFEFF")) css = css.slice(1);
  if (css.startsWith('@charset "UTF-8";\n')) css = css.slice('@charset "UTF-8";\n'.length);

  const forms = collectSourceForms(source);
  css = applyRestores(css, forms, style);
  css = reorderSelectorPass(css);
  if (style === "expanded") {
    css = reshapeCommentOnlyRules(css);
    css = expandTopLevelSeparators(css);
  }
  if (hasNonAscii(css)) {
    css = (style === "compressed" ? "\uFEFF" : '@charset "UTF-8";\n') + css;
  }
  return css;
}
