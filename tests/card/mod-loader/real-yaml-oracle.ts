// A reader for the data/real.yml dialect the card-mod gems ship: a
// hand-rolled, dependency-free parser used as the ORACLE for the mod content
// seeds. The gems' files are YAML, but only a narrow slice of it - a top-level
// sequence of mappings whose keys are symbols (`:name:`, `:codename:`,
// `:type:`, `:content:`, `:fields:`), whose scalars are either plain, single-
// or double-quoted, or block scalars (`|`, `|-`, `|+`), and whose `:fields:`
// value is a nested mapping of the same shape. Parsing that slice here (rather
// than adding a YAML dependency to the test tree) keeps the oracle readable;
// mod-content-seeds.test.ts pins this reader against the real Ruby parser
// (`ruby -ryaml -rjson`, over the same GEM_HOME the gems are read from), so
// its fidelity is measured rather than assumed.
//
// The block-scalar rules are YAML 1.2 §8.1.2: the block's indentation is the
// indentation of its first non-empty line; lines less indented than that end
// the block; and chomping decides the tail - clip (the bare `|`) keeps a
// single trailing line break **only if the source has one**, strip (`|-`) drops
// it, keep (`|+`) keeps every trailing break. That "only if the source has
// one" clause is the whole reason this module is careful: card-mod-tinymce_editor-
// 0.20.0/data/real.yml ends mid-line, so its content block ends ` }` with NO
// trailing newline, and a reader that always appends one invents a byte that
// Ruby never stores. Psych's own output is the tie-breaker.

/** A parsed scalar, a nested mapping, or a block sequence of scalars. */
export type RealYamlValue = string | string[] | RealYamlMapping;

/** One parsed `- :key: value` entry: its top-level keys. */
export type RealYamlMapping = Map<string, RealYamlValue>;

/** Parse a real.yml document into its top-level entries. */
export function parseRealYaml(text: string): RealYamlMapping[] {
  const lines = splitLines(text);
  const entries: RealYamlMapping[] = [];
  let current: RealYamlMapping | undefined;
  const stack: Array<{ indent: number; map: RealYamlMapping }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.text === "") {
      i++;
      continue;
    }
    if (line.text.startsWith("- ")) {
      current = new Map();
      entries.push(current);
      stack.length = 0;
      stack.push({ indent: 0, map: current });
      i += 1 + assign(stack, 0, line.text.slice(2), lines, i);
      continue;
    }
    if (current === undefined) {
      i++;
      continue;
    }
    while (stack.length > 1 && line.indent < stack[stack.length - 1]!.indent) stack.pop();
    if (line.indent < stack[stack.length - 1]!.indent) {
      i++;
      continue;
    }
    i += 1 + assign(stack, line.indent, line.text, lines, i);
  }
  return entries;
}

/** The entry whose `:name:` is `name`. */
export function entryNamed(text: string, name: string): RealYamlMapping {
  const hit = parseRealYaml(text).find((e) => e.get(":name:") === name);
  if (!hit) throw new Error(`real.yml entry ${JSON.stringify(name)} not found`);
  return hit;
}

/** The scalar under `:key:` of an entry. */
export function scalar(entry: RealYamlMapping, key: string): string | undefined {
  const v = entry.get(`:${key}:`);
  return typeof v === "string" ? v : undefined;
}

/** The `:fields:` mapping's own keys, in document order, without the colons -
 *  each is a symbol Ruby's Subcards::Args turns into a subcard name. */
export function fieldKeys(entry: RealYamlMapping): string[] {
  return keysOf(entry.get(":fields:"));
}

/** A scalar inside the `:fields:` subtree, addressed by its key path. */
export function fieldScalar(entry: RealYamlMapping, ...path: string[]): string | undefined {
  const node = nodeAt(entry.get(":fields:"), path);
  return typeof node === "string" ? node : undefined;
}

/** The `:fields:` map's value keys at one level, in document order. */
export function fieldChildKeys(entry: RealYamlMapping, ...path: string[]): string[] {
  return keysOf(nodeAt(entry.get(":fields:"), path));
}

function nodeAt(root: RealYamlValue | undefined, path: string[]): RealYamlValue | undefined {
  let node: RealYamlValue | undefined = root;
  for (const seg of path) {
    if (!(node instanceof Map)) return undefined;
    node = node.get(`:${seg}:`);
  }
  return node;
}

function keysOf(node: RealYamlValue | undefined): string[] {
  if (!(node instanceof Map)) return [];
  return [...node.keys()].map((k) => k.slice(1, -1));
}

/** The first line at or after `from` that carries content. */
function nextMeaningful(lines: SourceLine[], from: number): { index: number; line: SourceLine } | undefined {
  for (let i = from; i < lines.length; i++) {
    if (lines[i]!.text === "") continue;
    return { index: i, line: lines[i]! };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface SourceLine {
  readonly indent: number;
  /** The line trimmed at both ends - what structural matching (keys, block
   *  headers, sequence markers) compares against. */
  readonly text: string;
  /** The line with ONLY its leading indent removed: what a block scalar
   *  stores. Trailing spaces are content in YAML, and the gems' email
   *  templates carry them (card-mod-follow-0.20.0's `:html_message:` ends a
   *  line with one space), so trimming here would drop a byte Ruby keeps. */
  readonly body: string;
  /** The line verbatim, no indent removed. */
  readonly raw: string;
  /** True when the source has a newline after this line - the fact YAML clip
   *  chomping keys off, and the reason this is tracked per line instead of
   *  being guessed from a pre-split array. */
  readonly hasBreak: boolean;
}

function splitLines(text: string): SourceLine[] {
  return text.split("\n").map((l, i, all) => {
    const indent = l.length - l.trimStart().length;
    return {
      indent,
      text: l.trim(),
      body: l.slice(indent),
      raw: l,
      hasBreak: i < all.length - 1,
    };
  });
}

/** Assign `key: value` (or `key:` + a deeper block) into the mapping that owns
 *  `indent`, opening a nested mapping for a valueless key. Returns how many
 *  lines BEYOND `lineIndex` the value consumed - a block scalar swallows its
 *  own body, and the caller must not re-read those lines as keys. */
function assign(
  stack: Array<{ indent: number; map: RealYamlMapping }>,
  indent: number,
  text: string,
  lines: SourceLine[],
  lineIndex: number,
): number {
  const m = /^:([a-zA-Z_0-9]+):(?: (.*))?$/.exec(text);
  if (!m) return 0;
  const key = `:${m[1]}:`;
  const rest = m[2];
  const top = stack[stack.length - 1]!;

  if (rest === undefined) {
    // a valueless key is followed either by a deeper mapping or by a block
    // SEQUENCE of scalars (`- :name:` then `    - :role`). Every sequence the
    // gems ship is a flat list of symbols, so that is all this reads.
    const next = nextMeaningful(lines, lineIndex + 1);
    if (next !== undefined && next.line.indent > indent && next.line.text.startsWith("- ")) {
      const items: string[] = [];
      let j = next.index;
      while (j < lines.length) {
        const l = lines[j]!;
        if (l.text === "") {
          j++;
          continue;
        }
        if (l.indent <= indent || !l.text.startsWith("- ")) break;
        items.push(unquote(l.text.slice(2)));
        j++;
      }
      top.map.set(key, items);
      return j - lineIndex - 1;
    }
    top.map.set(key, new Map());
    stack.push({ indent: indent + 2, map: top.map.get(key) as RealYamlMapping });
    return 0;
  }
  if (rest === "|" || rest === "|-" || rest === "|+" || rest === ">") {
    const block = blockScalar(lines, lineIndex + 1, indent + 2, rest);
    top.map.set(key, block.value);
    return block.consumed;
  }
  const scalar = inlineScalar(rest, lines, lineIndex);
  top.map.set(key, scalar.value);
  return scalar.consumed;
}

/** An inline scalar: a plain symbol/string, or a quoted scalar that may run
 *  over several lines (card-mod-defaults-0.20.0/data/real.yml:93-94 carries a
 *  double-quoted `:content:` that wraps, with an escaped CRLF inside it). */
function inlineScalar(rest: string, lines: SourceLine[], lineIndex: number): { value: string; consumed: number } {
  const quote = rest[0];
  if (quote !== '"' && quote !== "'") return { value: plainScalar(rest), consumed: 0 };
  const parts: string[] = [];
  let carried = 0;
  for (let i = lineIndex; ; i++) {
    parts.push(i === lineIndex ? rest : lines[i]!.text);
    const scan = scanQuoted(parts[parts.length - 1]!, quote);
    if (scan.closed) {
      // YAML folds the line breaks inside a quoted scalar to single spaces,
      // then the escapes are resolved - in that order, so an escaped `\n` is
      // never mistaken for a fold.
      const folded = parts.map((p, idx) => (idx === 0 ? p.trim() : p.trim())).join(" ").trim();
      return {
        value: quote === '"' ? unescapeDouble(folded) : folded.slice(1, -1).replace(/''/g, "'"),
        consumed: i - lineIndex,
      };
    }
    if (i + 1 >= lines.length) throw new Error(`real.yml: unterminated ${quote} scalar at line ${lineIndex + 1}`);
  }
}

/** Where a quoted run stops, honouring backslash escapes (double-quoted) and
 *  the doubled-quote form (single-quoted). */
function scanQuoted(text: string, quote: string): { closed: boolean } {
  for (let i = 1; i < text.length; i++) {
    const c = text[i]!;
    if (quote === '"' && c === "\\") {
      i++;
      continue;
    }
    if (c === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        i++;
        continue;
      }
      // only a closing quote at the END of the text closes the run
      if (i === text.length - 1) return { closed: true };
    }
  }
  return { closed: false };
}

/** YAML 1.2 §5.7 double-quoted escapes. An unknown escape is an error, not a
 *  guess: this reader is an oracle, and a silently-wrong escape would make a
 *  passing parity test meaningless. */
function unescapeDouble(text: string): string {
  const body = text.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const e = body[++i];
    switch (e) {
      case "0": out += "\0"; break;
      case "a": out += "\x07"; break;
      case "b": out += "\b"; break;
      case "t": case "\t": out += "\t"; break;
      case "n": out += "\n"; break;
      case "v": out += "\v"; break;
      case "f": out += "\f"; break;
      case "r": out += "\r"; break;
      case "e": out += "\x1b"; break;
      case '"': out += '"'; break;
      case "/": out += "/"; break;
      case "\\": out += "\\"; break;
      case " ": out += " "; break;
      case "x": out += String.fromCodePoint(parseInt(body.substr(i + 1, 2), 16)); i += 2; break;
      case "u": out += String.fromCodePoint(parseInt(body.substr(i + 1, 4), 16)); i += 4; break;
      case "U": out += String.fromCodePoint(parseInt(body.substr(i + 1, 8), 16)); i += 8; break;
      default: throw new Error(`real.yml: unsupported double-quoted escape \\${e}`);
    }
  }
  return out;
}

/** A plain (unquoted) scalar, trimmed. */
function plainScalar(raw: string): string {
  return raw.trim();
}

/** A block scalar's value and how many source lines it consumed. */
function blockScalar(
  lines: SourceLine[],
  startLine: number,
  baseIndent: number,
  header: string,
): { value: string; consumed: number } {
  // YAML: the indentation comes from the first NON-EMPTY line of the block,
  // and blank lines before that line are not part of it.
  let realIndent = baseIndent;
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i]!.text === "") continue;
    realIndent = lines[i]!.indent;
    break;
  }
  const body: string[] = [];
  let lastIndex = -1;
  for (let i = startLine; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.text === "") {
      // blank lines before the block's first content line are not its body
      if (lastIndex >= 0) {
        body.push("");
        lastIndex = i;
      }
      continue;
    }
    if (l.indent < realIndent) break;
    // lines more indented than the block keep their extra indent verbatim
    body.push(l.raw.slice(realIndent));
    lastIndex = i;
  }
  if (lastIndex < startLine) return { value: "", consumed: 0 };
  const consumed = lastIndex + 1 - startLine;

  // Chomping runs on the block's CONTENT lines: the trailing blank lines are
  // stripped first, then the header decides what break (if any) goes back.
  // The break that survives is the one the source put after the last content
  // line - not after the blank lines that follow it.
  let contentEnd = lastIndex;
  while (contentEnd >= startLine && lines[contentEnd]!.text === "") contentEnd--;
  if (contentEnd < startLine) return { value: "", consumed };
  const trailingBlanks = lastIndex - contentEnd;
  const joined = body.slice(0, body.length - trailingBlanks).join("\n");
  const hadBreak = lines[contentEnd]!.hasBreak;

  if (header === "|-") return { value: joined, consumed };
  if (header === "|+") {
    return { value: joined + (hadBreak ? "\n" : "") + "\n".repeat(trailingBlanks), consumed };
  }
  // clip keeps ONE trailing break, and only when the source had one after the
  // last content line: a file that ends mid-line (card-mod-tinymce_editor-0.20.0)
  // yields a content block with no trailing break, and one that ends `}\n\n`
  // (card-mod-ace_editor-0.20.0) yields exactly one.
  return { value: hadBreak ? joined + "\n" : joined, consumed };
}

/** `"x"` / `'x'` -> x; otherwise the plain scalar, trimmed. */
function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return JSON.parse(s) as string;
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}