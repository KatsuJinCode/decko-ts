import { DeckoName } from "../name.js";
// Nest-reference parsing: TypeScript port of the {{inclusion}} chunk machinery.
//
// Truth source (read directly from the installed gems):
// - card-mod-content-0.20.0 lib/card/content/chunk/nest.rb  (Chunk::Nest:
//   prefix/full regexes, interpret, option lists, comment nests)
// - card-mod-content-0.20.0 lib/card/content/chunk/reference.rb (the name
//   is absolutized against the REFERENCING card at process time)
// - card-1.110.0 lib/card/view/options.rb (the shark_keys an option value
//   may target) + key_lists.rb (keymap)
//
// The chunk regexes are Ruby's, verbatim: full_re /\A\{\{([^{}]*)\}\}/ with
// prefix "\\{\\{" (nest.rb Chunk.register_class). Decko spans cannot nest
// braces - [^{}]* is the whole grammar - so a scan with that exact
// character class reproduces Ruby's chunker for nest chunks. Other chunk
// classes (links, URIs) are NOT chunks this renderer substitutes; their text
// passes through verbatim, exactly as Ruby leaves non-reference chunks.
//
// EscapedLiteral is the one other chunk class this scan has to split out,
// because it RENDERS differently from the text around it and it claims
// `\{{…}}` BEFORE Nest does (see the chunk note above the scanner).

/** The two chunk regexes this scan splits out, both Ruby's verbatim, both
 *  sticky: Card::Content::Parser (parser.rb:45-59) advances one character at a
 *  time and asks each registered class to full_match the raw REMAINDER from
 *  the position where it stands, so a match has to be ANCHORED there rather
 *  than found anywhere ahead.
 *
 *  NEST_AT_REGEXP - Chunk::Nest full_re (chunk/nest.rb:13) `/\A\{\{([^{}]*)\}\}/`
 *  with prefix `\{\{` and idx_char "{" (12-14). Decko spans cannot nest
 *  braces - [^{}]* is the whole grammar.
 *
 *  ESCAPED_LITERAL_AT_REGEXP - Chunk::EscapedLiteral (card-mod-content
 *  lib/card/content/chunk/escaped_literal.rb), scanned in PARALLEL because
 *  Ruby's parser splits it out too:
 *  - FULL_RE (11-12), keyed by the SECOND character of the prefix, exactly as
 *    Ruby's `FULL_RE[prefix[1, 1]]` (17-19) picks between them:
 *      "{" => /\A\\\{\{[^}]*\}\}/    note `[^}]*`, not the nest's `[^{}]*`
 *      "[" => /\A\\\[\[[^\]]*\]\]    so `{` and `[` may sit INSIDE the escaped
 *                                   region - a nest span never may
 *  - prefix_re (14) `'\\\\(?:\\[\\[|\\{\\{'` = `\\(?:\[\[|\{\{)`, and
 *    idx_char "\\" (15). chunk.rb:49 find_class_by_prefix looks at the prefix's
 *    FIRST character first, so a `\{{` / `\[[` prefix selects EscapedLiteral
 *    before Nest ("{" / "[") is ever consulted. That is the whole reason a
 *    backslash works as an escape: the region becomes ONE literal chunk and
 *    never reaches Chunk::Nest. */
const NEST_AT_REGEXP = /\{\{([^{}]*)\}\}/y;
const ESCAPED_LITERAL_AT_REGEXP = /\\(?:\[\[[^\]]*\]\]|\{\{[^}]*\}\})/y;

/** escaped_literal.rb:21-23 `interpret`:
 *
 *    @process_chunk = match[0].sub(/^\\(.)/, format.escape_literal('\1'))
 *
 *  The sub swaps the backslash and the ONE character behind it for the
 *  format's escape_literal answer and leaves the rest of the chunk verbatim.
 *  Ruby hands escape_literal the two-character string '\1' as a REPLACEMENT
 *  string, so the backreference expands back to the escaped character itself;
 *  splicing the pieces out writes the same bytes and keeps a `$` inside a
 *  format's answer from being read as a JS replacement pattern.
 *
 *  The answer is format-dependent, which is what makes this byte-visible -
 *  see escapeLiteralForCard (render/format.ts). */
export function interpretEscapedLiteral(
  chunkText: string,
  escapeLiteral: (literal: string) => string,
): string {
  const escaped = /^\\(.)/.exec(chunkText);
  if (escaped === null) return chunkText;
  return escapeLiteral(escaped[1]!) + chunkText.slice(escaped[0].length);
}

/** strip_tags (nest.rb): `string.gsub(/<[^>]*>/, "")` - "super fast", not
 *  ActionView's. */
export function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

/** Card::View::Options keymap (view/options.rb): keys a shark (nest author)
 *  may set = keymap[:shark] + keymap[:both] (key_lists.rb#shark_keys).
 *  option_string_to_hash (nest.rb) silently DROPS any other key. */
const SHARK_KEYS: ReadonlySet<string> = new Set([
  // shark
  "view", "nest_name", "nest_syntax", "wrap", "show", "hide", "unknown",
  // both
  "help", "structure", "title", "variant", "joint", "input_type", "type",
  "size", "header", "items", "cache", "edit", "separator", "filter", "params",
]);

/** nest.rb DEFAULT_OPTION: a value without a key is interpreted as view. */
const DEFAULT_OPTION = "view";

/** One parsed {{inclusion}}: the pieces the format's content_nest needs. */
export interface ParsedNest {
  /** the raw text between the braces, exactly as authored (nest_syntax). */
  syntax: string;
  /** the (stripped) reference name as authored; absolutized by the format. */
  name: string;
  /** parsed options, EXCLUDING nest_name/nest_syntax (nest.rb @options
   *  carries them too; the format adds them separately). */
  options: NestOptions;
  /** comment nest: `{{#...}}` renders the comment visibly, `{{##...}}`
   *  renders nothing (nest.rb#interpret). */
  comment: string | undefined;
  /** Chunk-only: the nest_syntax value Ruby's chunk/nest.rb:23 stores
   *  (`@options.merge nest_syntax: in_brackets`). Undefined for
   *  programmatic nests (the mod manifests construct ParsedNest directly
   *  without going through interpretNest). format.ts gates the slot
   *  JSON's nest_syntax field on this presence. */
  chunkNestSyntax?: string;
}

/** The subset of nest options this renderer consumes. Values stay strings
 *  exactly as Ruby notes ("option values are strings unless otherwise
 *  noted", view/options.rb). */
export interface NestOptions {
  view?: string;
  title?: string;
  show?: string;
  hide?: string;
  size?: string;
  /** the folded nested option lists (nest.rb's :items hash) - carries the
   *  item view for collection nests. */
  items?: Record<string, string>;
  /** unrecognized-but-shark-legal keys ride along uninterpreted. */
  extra: Record<string, string>;
}

/** nest.rb#interpret + #interpret_options: split at the FIRST "|", reverse
 *  the remaining option lists and fold them right-to-left so each level
 *  becomes the :items of the level before it. */
export function parseNestOptions(optLists: string | undefined): NestOptions {
  const raw = (optLists ?? "").split("|").reverse();
  let prev: { items?: unknown } | undefined;
  for (const level of raw) {
    prev = interpretPipedOptions(level, prev);
  }
  const flat = (prev ?? {}) as Record<string, unknown>;
  const options: NestOptions = { extra: {} };
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    switch (key) {
      case "view": options.view = String(value); break;
      case "title": options.title = String(value); break;
      case "show": options.show = String(value); break;
      case "hide": options.hide = String(value); break;
      case "size": options.size = String(value); break;
      case "items":
        options.items = value as Record<string, string>;
        break;
      default: options.extra[key] = String(value);
    }
  }
  return options;
}

function interpretPipedOptions(
  listString: string,
  items: unknown,
): Record<string, unknown> {
  const hash: Record<string, unknown> = items === undefined ? {} : { items };
  optionStringToHash(listString, hash);
  return hash;
}

/** nest.rb#option_string_to_hash + #each_option: ';'-separated pairs;
 *  Ruby assigns `value, key = pair.split(':', 2).reverse` - the part
 *  BEFORE the colon is the KEY, the part after is the VALUE ("hide:menu"
 *  -> key "hide", value "menu"); a bare value defaults the key to view. */
function optionStringToHash(listString: string, hash: Record<string, unknown>): void {
  if (listString.trim() === "") return;
  for (const pair of listString.trim().split(";")) {
    const colon = pair.indexOf(":");
    const value = (colon === -1 ? pair : pair.slice(colon + 1)).trim();
    const key = (colon === -1 ? DEFAULT_OPTION : pair.slice(0, colon)).trim();
    // nest.rb:54-57 checks `key == :item` FIRST — :item is not a shark key
    // (it never reaches the shark filter in Ruby either), and it folds into
    // options[:items][:view]. Guarding on SHARK_KEYS before this branch made
    // the branch unreachable and silently dropped every `item:` option.
    if (key === "item") {
      // nest.rb: options_hash[:items] ||= {}; options_hash[:items][:view] = value
      const items = (hash["items"] ?? {}) as Record<string, unknown>;
      items["view"] = value;
      hash["items"] = items;
      continue;
    }
    if (!SHARK_KEYS.has(key)) continue;
    hash[key] = value;
  }
}

/** Split content into literal text and nest chunks, in order. The literal
 *  pieces are the EXACT original bytes (Card::Content#to_s reconstructs
 *  from chunk texts; unprocessed text is unchanged). */
export interface ContentPiece {
  kind: "text" | "nest" | "escaped";
  text: string;
  nest?: ParsedNest;
}

export function scanNests(content: string | undefined): ContentPiece[] {
  // A fabricated NEW card's content is undefined until its first save
  // (prepare_db_content's `standard_db_content || ""` stores the empty
  // string only at write time) — the scans answer no nests for it, exactly
  // like the empty string.
  if (content === undefined || content === null) return [];
  // Request-scoped memo (DeckoName.requestMemo), shared by every pass of a
  // live render: the pieces are a function of the content text alone. A
  // memoized result is deep-frozen, so no caller can change what a later
  // caller reads (a write would throw, never pass silently).
  const memo = DeckoName.requestMemo<ContentPiece[]>(SCAN_NESTS_MEMO);
  if (memo === undefined) return scanNestsUncached(content);
  const hit = memo.get(content);
  if (hit !== undefined) return hit;
  const pieces = deepFreeze(scanNestsUncached(content));
  memo.set(content, pieces);
  return pieces;
}

const SCAN_NESTS_MEMO = {};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

function scanNestsUncached(content: string): ContentPiece[] {
  // parser.rb:45-59 match_prefices, one character at a time: a position
  // where NO chunk class full_matches is ordinary text and the scan moves
  // on (line 52-54), which is why a half-written `\{{a}b}}` stays verbatim
  // rather than losing its backslash. Two chunk classes are consulted here,
  // in Ruby's leftmost-wins order - the escaped literal's prefix starts one
  // character earlier than the nest's braces, so `\{{Foo}}` is never a nest.
  const pieces: ContentPiece[] = [];
  let textStart = 0;
  let at = 0;
  while (at < content.length) {
    const escaped = matchAt(ESCAPED_LITERAL_AT_REGEXP, content, at);
    if (escaped !== undefined) {
      pushText(pieces, content.slice(textStart, at));
      pieces.push({ kind: "escaped", text: escaped });
      at += escaped.length;
      textStart = at;
      continue;
    }
    NEST_AT_REGEXP.lastIndex = at;
    const nest = NEST_AT_REGEXP.exec(content);
    if (nest !== null) {
      pushText(pieces, content.slice(textStart, at));
      pieces.push({ kind: "nest", text: nest[0], nest: interpretNest(nest[1] ?? "") });
      at += nest[0].length;
      textStart = at;
      continue;
    }
    at += 1;
  }
  pushText(pieces, content.slice(textStart));
  return pieces;
}

/** matchAt: the anchored full-match parser.rb:42 asks of one chunk class
 *  (full_match content, prefix - `match full_re(prefix)`), with the scan
 *  position moved to the chunk's start first. */
function matchAt(re: RegExp, content: string, at: number): string | undefined {
  re.lastIndex = at;
  return re.exec(content)?.[0];
}

/** Card::Parser never records an EMPTY string as a piece (parser.rb:84
 *  `unless @interval_string.empty?`), and neither does handle_remainder's
 *  guard (101). */
function pushText(pieces: ContentPiece[], text: string): void {
  if (text !== "") pieces.push({ kind: "text", text });
}

/** nest.rb#interpret: strip tags, split name | options, handle comment
 *  nests, merge nest_name/nest_syntax into the options. */
function interpretNest(inBrackets: string): ParsedNest {
  const stripped = stripTags(inBrackets);
  const pipe = stripped.indexOf("|");
  const rawName = (pipe === -1 ? stripped : stripped.slice(0, pipe)).trim();
  const optLists = pipe === -1 ? undefined : stripped.slice(pipe + 1);
  if (rawName.startsWith("#")) {
    // nest.rb: '##' nests vanish; '#' nests render the visible comment
    return {
      syntax: stripped,
      name: rawName,
      options: { extra: {} },
      comment: rawName.startsWith("##") ? "" : `<!-- ${escapeHtml(inBrackets)} -->`,
    };
  }
  // chunk/nest.rb:23 — chunk nests merge nest_syntax: in_brackets into
  // their @options. We carry the same value on ParsedNest.chunkNestSyntax
  // (a top-level field, separate from options, so scanNests consumers
  // can still assert options shape without the chunk annotation).
  return {
    syntax: stripped,
    name: rawName,
    options: parseNestOptions(optLists),
    comment: undefined,
    chunkNestSyntax: stripped,
  };
}

/** CGI.escapeHTML (nest.rb#visible_comment escapes the message). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** All reference names in a content string, absolutized against the
 *  referencing card - the prefetcher's view of "what does this card need".
 *  Comment nests contribute nothing; relative references (leading "_") are
 *  reported raw for the caller to resolve (they depend on the render-time
 *  context card). */
export function referencedNames(content: string | undefined): { name: string; relative: boolean }[] {
  const out: { name: string; relative: boolean }[] = [];
  for (const piece of scanNests(content)) {
    const nest = piece.nest;
    if (nest === undefined || nest.comment !== undefined) continue;
    out.push({ name: nest.name, relative: nest.name.startsWith("_") });
  }
  return out;
}
