// Minimal YAML loader sufficient for the card en.yml files the render
// layer needs. The shape parsed:
//
//   - top-level map under a single locale key (e.g. "en:")
//   - nested maps via 2-space indentation
//   - leaf strings: bare, single-quoted, double-quoted, or folded
//     ("...\n  ..." continuation that produces a single string with
//     spaces)
//   - plural entries: a hash whose keys are :one / :other / :zero with
//     string leaves
//
// This parser is NOT a general YAML 1.2 implementation. It targets the
// subset the card gems' en.yml files use:
//   card-1.110.0/config/locales/en.yml        (time.formats + flat keys)
//   card-mod-format-0.20.0/config/locales/en.yml (flat keys, double-quoted)
//   actionview-7.2.3.2/lib/action_view/locale/en.yml (datetime.distance_in_words
//     with plural one/other)
//
// Reference: Ruby's i18n backend loads these via Psych YAML.load_file
// (i18n-1.15.2/lib/i18n/backend/base.rb:261-271). The TS port parses the
// same bytes with no npm install (this port takes no runtime npm dependency).

/** A parsed YAML value. Leaves are always strings; intermediate nodes are
 *  objects with string keys (matching Ruby's Psych.load_file with
 *  symbolize_names: true). */
export type YamlValue = string | { [k: string]: YamlValue };

/** Parse a YAML text into the typed shape. Throws on parse failures with
 *  a one-line diagnostic. */
export function parseYaml(input: string): YamlValue {
  const lines = splitLines(input);
  const ctx: ParseContext = { lines, index: 0 };
  const result = parseNode(ctx, 0);
  skipBlankAndComment(ctx);
  if (ctx.index < ctx.lines.length) {
    throw new Error(
      `yaml: unexpected trailing content at line ${ctx.lines[ctx.index]!.line}: ` +
        JSON.stringify(ctx.lines[ctx.index]!.raw),
    );
  }
  return result;
}

interface RawLine {
  readonly raw: string;
  readonly indent: number;
  readonly line: number;
}

interface ParseContext {
  readonly lines: RawLine[];
  index: number;
}

function splitLines(input: string): RawLine[] {
  const out: RawLine[] = [];
  let lineNo = 0;
  for (const rawLine of input.split(/\r?\n/)) {
    lineNo++;
    // YAML comments: "# ..." starts at column 0, never inside a quoted string.
    if (rawLine.startsWith("#")) continue;
    if (rawLine.trim() === "") continue;
    // Indent = number of leading spaces (tabs are not used in the
    // target en.yml files; if any appear, count them as 1).
    let indent = 0;
    while (indent < rawLine.length && rawLine[indent] === " ") indent++;
    out.push({ raw: rawLine.slice(indent), indent, line: lineNo });
  }
  return out;
}

function skipBlankAndComment(ctx: ParseContext): void {
  while (ctx.index < ctx.lines.length) {
    const ln = ctx.lines[ctx.index]!;
    if (ln.raw === "" || ln.raw.startsWith("#")) ctx.index++;
    else break;
  }
}

/** Parse a node at the given indentation. Returns the parsed value. */
function parseNode(ctx: ParseContext, indent: number): YamlValue {
  skipBlankAndComment(ctx);
  const first = ctx.lines[ctx.index];
  if (first === undefined) {
    throw new Error("yaml: unexpected end of input");
  }
  if (first.indent < indent) {
    throw new Error(
      `yaml: dedent at line ${first.line} (got ${first.indent}, expected >= ${indent})`,
    );
  }
  if (first.indent > indent) {
    throw new Error(
      `yaml: indent at line ${first.line} exceeds expected ${indent}`,
    );
  }

  // Determine shape from the first non-comment line: does it have ":" after
  // a key? If so it's a map; otherwise it's a scalar value (rare at indent
  // N when starting a new node - usually a leaf only appears as a value).
  const colonAt = firstColon(first.raw);
  if (colonAt === -1) {
    // Bare scalar (rare; the format files always quote)
    return parseScalar(first.raw);
  }
  // Map: parse the key, then parse the value (which may be inline, on the
  // same line, or at a deeper indent).
  const key = stripQuotes(first.raw.slice(0, colonAt).trim());
  const valuePart = first.raw.slice(colonAt + 1).trim();

  const out: { [k: string]: YamlValue } = {};
  if (valuePart !== "") {
    // Inline scalar: parse and store as the SINGLE key. Consume this line
    // and continue with siblings at the same indent.
    out[key] = parseScalar(valuePart);
    ctx.index++;
    skipBlankAndComment(ctx);
    while (ctx.index < ctx.lines.length && ctx.lines[ctx.index]!.indent === indent) {
      const sib = ctx.lines[ctx.index]!;
      const sibColon = firstColon(sib.raw);
      if (sibColon === -1) {
        throw new Error(
          `yaml: expected map entry at line ${sib.line}: ${JSON.stringify(sib.raw)}`,
        );
      }
      const sibKey = stripQuotes(sib.raw.slice(0, sibColon).trim());
      const sibValue = sib.raw.slice(sibColon + 1).trim();
      if (sibValue !== "") {
        out[sibKey] = parseScalar(sibValue);
        ctx.index++;
      } else {
        ctx.index++;
        skipBlankAndComment(ctx);
        out[sibKey] = parseNode(ctx, indent + 2);
      }
      skipBlankAndComment(ctx);
    }
    return out;
  }

  // Value is on the next line(s) at deeper indent.
  ctx.index++;
  skipBlankAndComment(ctx);
  if (ctx.index >= ctx.lines.length) {
    out[key] = "";
    return out;
  }
  const next = ctx.lines[ctx.index]!;
  if (next.indent <= indent) {
    // Empty mapping - key with no value (the format files don't use this
    // for actual translations but Ruby tolerates it; treat as empty string).
    out[key] = "";
  } else {
    out[key] = parseNode(ctx, indent + 2);
  }

  // Continue with siblings at the original indent.
  skipBlankAndComment(ctx);
  while (ctx.index < ctx.lines.length && ctx.lines[ctx.index]!.indent === indent) {
    const sib = ctx.lines[ctx.index]!;
    const sibColon = firstColon(sib.raw);
    if (sibColon === -1) {
      throw new Error(
        `yaml: expected map entry at line ${sib.line}: ${JSON.stringify(sib.raw)}`,
      );
    }
    const sibKey = stripQuotes(sib.raw.slice(0, sibColon).trim());
    const sibValue = sib.raw.slice(sibColon + 1).trim();
    if (sibValue !== "") {
      out[sibKey] = parseScalar(sibValue);
      ctx.index++;
    } else {
      ctx.index++;
      skipBlankAndComment(ctx);
      out[sibKey] = parseNode(ctx, indent + 2);
    }
    skipBlankAndComment(ctx);
  }
  return out;
}

/** Strip surrounding single or double quotes from a key (the actionview
 *  en.yml starts with `"en":` rather than the bare `en:` the card files
 *  use - both are valid YAML). */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  }
  return s;
}

/** Find the first ":" that's not inside a quoted string and is followed by
 *  either whitespace or end-of-line. YAML allows keys to be quoted strings
 *  but the en.yml files don't use that shape - keys are bare. */
function firstColon(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ":" && !inSingle && !inDouble) {
      const next = s[i + 1];
      if (next === undefined || next === " ") return i;
    }
  }
  return -1;
}

function parseScalar(s: string): string {
  if (s === "") return "";
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return unescapeDoubleQuoted(s.slice(1, -1));
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    // Single-quoted YAML: only '' -> ' is an escape.
    return s.slice(1, -1).replace(/''/g, "'");
  }
  // Bare: trim trailing whitespace, no escapes.
  return s.replace(/\s+$/, "");
}

function unescapeDoubleQuoted(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < s.length) {
      const next = s[i + 1]!;
      switch (next) {
        case "n":
          out += "\n";
          break;
        case "t":
          out += "\t";
          break;
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        case "0":
          out += "\0";
          break;
        default:
          out += next;
          break;
      }
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
