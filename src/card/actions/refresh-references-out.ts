// The card_references WRITE path: population on create/update saves and
// cleanup on deletes. TypeScript port of the Ruby reference events.
//
// Ruby trail (card-1.110.0 unless noted; every behavior cites its source):
// - event :refresh_references_out, :finalize, on: :save, changed: :content
//   (mod/core/set/all/reference_events.rb:2-4) -> update_references_out
//   = delete_references_out + create_references_out
//   (lib/card/reference/all.rb:47-50).
// - create_references_out (all.rb:54-62): parse the content's Reference
//   chunks (links + nests), interpret them into a dedupe hash, bulk-insert
//   {referer_id, referee_id, referee_key, ref_type} rows (is_present is not
//   written and stays NULL).
// - ref_type codes: "L" link (card-mod-content-0.20.0
//   lib/card/content/chunk/link.rb:10,17-19), "I" inclusion (inherited
//   Abstract#reference_code, card-1.110.0 lib/card/content/chunk/
//   abstract.rb:30-32), "P" partial (all.rb:10 PARTIAL_REF_CODE).
// - interpretation (all.rb:80-96): skip nil referees; canonicalize the
//   referee key; skip self-references (referee_key == the referer's key);
//   resolve referee_id via Lexicon.id (unknown -> nil).
// - partial references (all.rb:133-139): an unknown COMPOUND referee also
//   records "P" rows for its left/right parts (recursive), so renames of
//   virtual-card parents stay traceable.
// - value array (all.rb:100-120): one row per (referee_key, ref_type);
//   ref_types dedupe; "P" is dropped when any explicit type exists.
// - cleanup (reference_events.rb:28-31 :clear_references ->
//   delete_references_out :63-65; lib/card/reference.rb:31-33
//   unmap_referees).
//
// Chunk scanning follows Card::Content::Parser (lib/card/content/
// parser.rb:45-59): a single left-to-right walk; the leftmost [[ or {{
// prefix wins and its full regex consumes through the closer (chunks never
// nest in the chunk list); a prefix whose full regex fails advances one
// character. Link grammar: link.rb:13-15, :78-97, :99-109. Nest grammar:
// nest.rb:12-26 (strip_tags, first-pipe split, `#` comment nests carry no
// reference).
//
// Known divergence (deliberate): Ruby's referee_name rescues
// Card::Error::NotFound for broken id/codename marks
// (card-mod-content reference.rb:16-18); this port catches the
// corresponding name-layer errors and skips the chunk, same outcome.

import { DeckoName } from "../name.js";
import {clearCachedNestEdges} from "../nest-index-cache.js";
import { NameNotFoundError, CodenameNotFoundError } from "../name/errors.js";
import { stripTags } from "../render/nest-syntax.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import { CARD_TYPE_CODENAME_BY_ID_SQL } from "../fetch/card-read-shapes.js";
import { idMarkOf, isListCard, declareListCardShapes, listItemStrings } from "./list-content.js";
export { listItemStrings };

/** all.rb:10 PARTIAL_REF_CODE. */
const PARTIAL_REF_CODE = "P";

/** The subset of DbLexicon the reference path needs (all.rb:95
 *  Lexicon.id). Structural type keeps this module decoupled from the
 *  FetchEngine for tests. */
export interface ReferenceLexicon {
  id(nameish: string | DeckoName): Promise<number | undefined>;
  /** Declare the names a walk is about to resolve, so the walk's own reads
   *  of them cost no round trip (the transport packing's declaration, see
   *  src/card/fetch/card-block-declaration.ts). OPTIONAL: a Lexicon that
   *  does not implement it leaves the walk's reads on the ordinary path,
   *  which answers the same. */
  prefetchIds?(names: readonly DeckoName[]): Promise<unknown>;
}

/** One card_references row to insert (all.rb:105-110; is_present not
 *  written, stays NULL exactly as Ruby's insert omits it). */
export interface ReferenceRow {
  refererId: number;
  refereeKey: string | null;
  refereeId: number | null;
  refType: string;
}

// -----------------------------------------------------------------------
// Event entry points
// -----------------------------------------------------------------------

/** event :refresh_references_out (reference_events.rb:2-4) +
 *  update_references_out (all.rb:47-50): delete this referer's rows, then
 *  re-create them from the content's links/nests. Callers gate on the
 *  `changed: :content` condition (db_content actually changed on the
 *  save). */
export async function refreshReferencesOut(
  driver: SQLDatabaseDriver,
  lexicon: ReferenceLexicon,
  refererId: number,
  refererName: DeckoName,
  content: string | null | undefined,
  opts: { asList?: boolean } = {},
): Promise<void> {
  // delete_references_out (all.rb:48; reference_events.rb:63-65).
  await driver.query("DELETE FROM card_references WHERE referer_id = ?", [refererId]);
  await clearCachedNestEdges(driver,refererId);
  // set/type/search_type.rb:6 `def chunk_list; :query; end` — a Search
  // referer's content parses QueryReference chunks ONLY (lib/card/content/
  // chunk/query_reference.rb: quoted strings after :, , or [ that are not
  // query keywords, reference_code "Q"); every other referer parses the
  // link/nest chunks (all.rb:56-58 each_reference_out).
  const rows = await referenceRowsOut(driver, lexicon, refererId, refererName, content);
  // Reference.insert_in_slices (all.rb:61, reference.rb:19-23): bulk
  // insert in ref-hash order; 5000-row slices kept for fidelity.
  for (let slice = 0; slice < rows.length; slice += 5000) {
    const chunk = rows.slice(slice, slice + 5000);
    const values: string[] = [];
    const params: unknown[] = [];
    for (const row of chunk) {
      values.push("(?, ?, ?, ?)");
      params.push(row.refererId, row.refereeKey, row.refereeId, row.refType);
    }
    await driver.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type)
       VALUES ${values.join(", ")}`,
      params,
    );
  }
}

/** Parse a card's reference rows without changing any stored relationship.
 *  Boot-time derived indexes use this read-only seam; canonical reference
 *  maintenance remains an explicit card save. */
export async function referenceRowsOut(
  driver: SQLDatabaseDriver,
  lexicon: ReferenceLexicon,
  refererId: number,
  refererName: DeckoName,
  content: string | null | undefined,
): Promise<ReferenceRow[]> {
  // THE WALKED CARD'S TWO SHAPES, DECLARED (the transport packing). The walk
  // reads the card's codename triple (isListCard) and its type's codename
  // (listCardItemNames or isSearchCard) back to back, and each read is a
  // pipeline POST of its own. One batch carries both, so the walk pays one
  // round trip per card instead of two, and the readers below are answered
  // from the driver's read memo.
  await declareListCardShapes(driver, refererId);
  return (await isListCard(driver, refererId))
    ? await createListReferencesOut(driver, lexicon, refererId, refererName, content)
    : (await isSearchCard(driver, refererId))
      ? await createQueryReferencesOut(lexicon, refererId, refererName, content)
      : await createReferencesOut(lexicon, refererId, refererName, content);
}

/** event :clear_references (reference_events.rb:28-31): delete the
 *  referer's rows and unmap the deleted id from other cards' rows
 *  (unmap_referees, reference.rb:31-33). */
export async function clearReferencesOnDelete(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<void> {
  await driver.query("DELETE FROM card_references WHERE referer_id = ?", [cardId]);
  await clearCachedNestEdges(driver,cardId);
  await driver.query(
    "UPDATE card_references SET referee_id = NULL WHERE referee_id = ?",
    [cardId],
  );
}

// -----------------------------------------------------------------------
// Interpretation (all.rb:54-62, :80-96, :100-120, :133-139)
// -----------------------------------------------------------------------

/** create_references_out (all.rb:54-62): scan the content's Reference
 *  chunks and interpret each into deduplicated rows. */
async function createReferencesOut(
  lexicon: ReferenceLexicon,
  refererId: number,
  refererName: DeckoName,
  content: string | null | undefined,
  asList = false,
): Promise<ReferenceRow[]> {
  if (content === null || content === undefined || content === "") {
    return []; // no content: delete-only (Content.parse of nil yields no chunks)
  }
  // all.rb:55 ref_hash — insertion-ordered: { key -> [id, types...] }.
  const refHash = new Map<string, { refereeId: number | undefined; refTypes: string[] }>();
  if (asList) {
    // card-mod-list Abstract::List each_reference_out: every item name is
    // a link reference (chunk_class Link, CODE "L").
    const items = listItemStrings(content);
    await declareReferenceNames(lexicon, items, refererName);
    for (const item of items) {
      await interpretReference(lexicon, refHash, item, "L", refererName);
    }
    return referenceValuesArray(refHash, refererId);
  }
  const chunks = scanReferenceChunks(content).filter((chunk) => chunk.refereeName !== undefined);
  // THE WALK'S NAMES, DECLARED. The chunks are all known before any of them
  // is interpreted, so the names they carry are declared once.
  await declareReferenceNames(
    lexicon,
    chunks.map((chunk) => chunk.refereeName as string),
    refererName,
  );
  for (const chunk of chunks) {
    await interpretReference(lexicon, refHash, chunk.refereeName as string, chunk.refType, refererName);
  }
  return referenceValuesArray(refHash, refererId);
}

/** THE WALK'S NAMES, DECLARED (the transport packing).
 *
 *  The reference walk resolves each chunk's referee name through the
 *  Lexicon, one name at a time, and each resolution is a round trip: the
 *  engine awaits every answer before it issues the next read. The names are
 *  all known at the seam -- the content's chunks are scanned before any of
 *  them is interpreted -- so they can be declared once and the walk's own
 *  reads of them cost no round trip.
 *
 *  WHY IT CHANGES NO ANSWER. The declaration is a SPECULATION: the driver
 *  remembers the answers under the same keys the readers use, and a read
 *  the driver cannot vouch for is a MISS -- the reader's own read then
 *  takes the blocking path, at its own sequence point, and answers the
 *  same. The declaration therefore changes the NUMBER of round trips, never
 *  the ANSWERS.
 *
 *  THE NAMES TRAVEL WITH THEIR SIDES, because a compound name's lookup
 *  binds its sides' ids, and the sides must be resolved first. This is the
 *  same rule the card-block declaration follows.
 */
async function declareReferenceNames(
  lexicon: ReferenceLexicon,
  raw: readonly string[],
  refererName: DeckoName,
): Promise<void> {
  if (lexicon.prefetchIds === undefined) return;
  const names: DeckoName[] = [];
  const seen = new Set<string>();
  const collect = (name: DeckoName): void => {
    if (seen.has(name.s)) return;
    seen.add(name.s);
    names.push(name);
    if (name.leftName !== undefined) collect(name.leftName);
    if (name.rightName !== undefined) collect(name.rightName);
  };
  for (const item of raw) {
    try {
      // The SAME name the walk itself resolves: interpretReference parses
      // the raw name and absolutizes it against the referer, so the
      // declaration must use that name and not another.
      collect(DeckoName.parse(item).absoluteName(refererName));
    } catch {
      // A name the walk itself cannot parse is not this method's to
      // declare: the walk's own read of it fails the same way it always
      // did.
    }
  }
  if (names.length === 0) return;
  await lexicon.prefetchIds(names);
}

/** A list card's references (Abstract::List#each_reference_out,
 *  card-mod-list-0.20.0 set/abstract/01_list.rb:53-57): every item name,
 *  absolutized against the card's own name (item_names -> clean_item_name,
 *  card-mod-collection set/all/item.rb:15-22, :258-267), as a link ("L").
 *
 * A CARDTYPE-typed list card's item names are the SEARCH's (card-mod-search
 * set/type/cardtype.rb includes Abstract::CqlSearch — its cql_content is
 * `{type_id: <the card's own id>, sort_by: :name}` — and 0_search's
 * item_names overrides Abstract::Items'), so the walk references every live
 * card OF the cardtype, not the stored content: saving the Mod card
 * references all 36 "mod: x" cards (oracle: leftover probe step 5). */
async function createListReferencesOut(
  driver: SQLDatabaseDriver,
  lexicon: ReferenceLexicon,
  refererId: number,
  refererName: DeckoName,
  content: string | null | undefined,
): Promise<ReferenceRow[]> {
  const refHash = new Map<string, { refereeId: number | undefined; refTypes: string[] }>();
  const idRows: ReferenceRow[] = [];
  const items = await listCardItemNames(driver, refererId) ?? listItemStrings(content);
  // THE WALK'S NAMES, DECLARED. The items are all known before any of them
  // is interpreted.
  await declareReferenceNames(lexicon, items, refererName);
  for (const item of items) {
    // An "~<id>" item (an id list's storage): Ruby's name for it has no key,
    // so the row carries the id and a NULL referee_key.
    const markedId = idMarkOf(item);
    if (markedId !== undefined) {
      idRows.push({ refererId, refereeKey: null, refereeId: markedId, refType: "L" });
      continue;
    }
    let name: string;
    try {
      name = DeckoName.parse(item).absoluteName(refererName).s;
    } catch {
      continue; // an unresolvable mark is dropped (the NotFound rescue)
    }
    await interpretReference(lexicon, refHash, name, "L", refererName);
  }
  return [...idRows, ...referenceValuesArray(refHash, refererId)];
}

/** The item names a list card's walk walks: the cardtype search's results
 *  for a Cardtype-typed card (see createListReferencesOut), else the stored
 *  content's items (undefined -> the caller uses the content). */
async function listCardItemNames(
  driver: SQLDatabaseDriver,
  refererId: number,
): Promise<string[] | undefined> {
  const row = (
    await driver.query<{ codename: string | null }>(CARD_TYPE_CODENAME_BY_ID_SQL, [refererId])
  ).rows[0];
  if (row?.codename !== "cardtype") return undefined;
  const items = await driver.query<{ name: string }>(
    "SELECT name FROM cards WHERE type_id = ? AND trash = 0",
    [refererId],
  );
  return items.rows.map((r) => String(r.name));
}

/** set/type/search_type.rb:6 — the Search cardtype's chunk_list :query: the
 *  referer's content parses QueryReference chunks. Same type-codename read
 *  shape as isListCard. Exported for the rename side (update-referer-content),
 *  whose swap_names must walk the referer's OWN chunk list (all.rb:65-71
 *  swap_names runs content_object = the card's chunk_list parse). */
export async function isSearchCard(
  driver: SQLDatabaseDriver,
  refererId: number,
): Promise<boolean> {
  const row = (
    await driver.query<{ codename: string | null }>(CARD_TYPE_CODENAME_BY_ID_SQL, [refererId])
  ).rows[0];
  return row?.codename === "search_type";
}

// --- QueryReference chunks (query_reference.rb) -----------------------------

/** query.rb:49-76 — Card::Query::MODIFIERS + OPERATORS + @attributes +
 *  CONJUNCTIONS keys and %w[desc asc count]: the quoted strings these name
 *  are query SYNTAX, not card references (query_reference.rb:69-78
 *  keyword?). */
const QUERY_KEYWORDS: ReadonlySet<string> = new Set(
  [
    // MODIFIERS (query.rb:70)
    "conj", "return", "index", "sort_by", "sort_as", "sort_dir", "sort", "dir",
    "group", "limit", "offset",
    // OPERATORS (query.rb:73-77)
    "!=", "=", "=~", "<", ">", "in", "~", "is", "eq", "gt", "lt", "match",
    "ne", "not in", "is not", "!",
    // @attributes (query.rb:49-65): basic, relational, plus_relational,
    // conjunction, custom, ignore, deprecated groups.
    "id", "name", "key", "type_id", "content", "left_id", "right_id",
    "codename", "read_rule_id", "created_at", "updated_at", "creator_id",
    "updater_id", "type", "part", "left", "right", "editor_of", "edited_by",
    "last_editor_of", "last_edited_by", "creator_of", "created_by",
    "updater_of", "updated_by", "link_to", "linked_to_by", "include",
    "included_by", "nest", "nested_by", "refer_to", "referred_to_by",
    "member_of", "member", "found_by", "not", "sort", "match", "name_match",
    "complete", "plus", "left_plus", "right_plus", "and", "or", "all", "any",
    "compound", "prepend", "append", "vars", "view", "params", "size",
    // the trailing literals (query.rb:76):
    "desc", "asc", "count",
  ].map((k) => k.replace(/ /g, "_").toLowerCase()),
);

/** query_reference.rb:47-52 — the registered grammar: a quoted string whose
 *  preceding character is a colon, comma, or square bracket (Ruby's
 *  prefix_re lookbehind). */
const QUERY_REFERENCE_STICKY = /(?<=[:,\[])\s*"([^"]+)"/g;

/** One parsed QueryReference chunk (the :query chunk list's only class). */
export interface QueryReferenceChunk {
  /** query_reference.rb:75 interpret: @name = match[1]. */
  name: string;
  /** Full-token span, start inclusive / end exclusive (the swap's splice
   * points; the chunk text begins at the opening quote). */
  start: number;
  end: number;
}

/** query_reference.rb:69-78 keyword?: the matched text with spaces
 *  underscored and downcased is a query keyword (query.rb MODIFIERS +
 *  OPERATORS + attributes + CONJUNCTIONS + desc/asc/count) -> syntax, not
 *  a reference; full_match rejects it before any chunk exists. */
export function isQueryKeyword(name: string): boolean {
  return QUERY_KEYWORDS.has(name.replace(/ /g, "_").toLowerCase());
}

/** The :query chunk list walk (chunk.rb:89 register_list :query,
 *  [QueryReference]; search_type.rb:6 engages it for Search cards): a
 *  left-to-right scan whose ONLY chunk class is QueryReference. Keyword
 *  matches never become chunks (query_reference.rb:63-67 full_match).
 *  This list is the whole story for a Search referer: Ruby's :query parse
 *  has NO Link/Nest classes, so a Search card's content produces Q chunks
 *  only — never L/I (and a non-Search card produces L/I only, never Q). */
export function scanQueryReferenceChunks(content: string): QueryReferenceChunk[] {
  const chunks: QueryReferenceChunk[] = [];
  QUERY_REFERENCE_STICKY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUERY_REFERENCE_STICKY.exec(content)) !== null) {
    const name = match[1] ?? "";
    if (isQueryKeyword(name)) continue;
    chunks.push({
      name,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return chunks;
}

/** create_references_out over a Search referer's content: each non-keyword
 *  quoted value interprets as a "Q" reference (query_reference.rb:106
 *  reference_code) through the SAME interpret_reference dedupe machinery
 *  (all.rb:80-96). */
async function createQueryReferencesOut(
  lexicon: ReferenceLexicon,
  refererId: number,
  refererName: DeckoName,
  content: string | null | undefined,
): Promise<ReferenceRow[]> {
  if (content === null || content === undefined || content === "") return [];
  const refHash = new Map<string, { refereeId: number | undefined; refTypes: string[] }>();
  const names = scanQueryReferenceChunks(content).map((chunk) => chunk.name);
  // THE WALK'S NAMES, DECLARED. The query chunks are all known before any of
  // them is interpreted.
  await declareReferenceNames(lexicon, names, refererName);
  for (const name of names) {
    // query_reference.rb:75-78 keyword?: the text with spaces underscored
    // and downcased is a query keyword -> syntax, not a reference.
    if (QUERY_KEYWORDS.has(name.replace(/ /g, "_").toLowerCase())) continue;
    await interpretReference(lexicon, refHash, name, "Q", refererName);
  }
  return referenceValuesArray(refHash, refererId);
}

/** all.rb:80-86 interpret_reference + :88-96 with_normalized_referee. */
async function interpretReference(
  lexicon: ReferenceLexicon,
  refHash: Map<string, { refereeId: number | undefined; refTypes: string[] }>,
  rawRefereeName: string,
  refType: string,
  refererName: DeckoName,
): Promise<void> {
  let name: DeckoName;
  let absolute: DeckoName;
  let key: string;
  let refereeId: number | undefined;
  try {
    // reference.rb:15 absolute_name card.name + all.rb:91-92 to_name/key
    name = DeckoName.parse(rawRefereeName);
    absolute = name.absoluteName(refererName);
    key = absolute.key;
    // all.rb:93 — don't create self references
    if (key === refererName.key) return;
    refereeId = await lexicon.id(absolute); // all.rb:95 Lexicon.id
  } catch (error) {
    // reference.rb:16-18 — "do not break on missing id/codename references"
    if (
      error instanceof NameNotFoundError ||
      error instanceof CodenameNotFoundError
    ) {
      return;
    }
    throw error;
  }
  let entry = refHash.get(key);
  if (entry === undefined) {
    entry = { refereeId, refTypes: [] };
    refHash.set(key, entry); // all.rb:82 ref_hash[key] ||= [id]
  }
  entry.refTypes.push(refType); // all.rb:83
  if (refereeId === undefined) {
    // all.rb:84 unless id -> interpret_partial_references
    await interpretPartialReferences(lexicon, refHash, absolute, refererName);
  }
}

/** all.rb:133-139 — an unknown compound referee records "P" rows for its
 *  left/right parts (through interpret_reference, so partials recurse). */
async function interpretPartialReferences(
  lexicon: ReferenceLexicon,
  refHash: Map<string, { refereeId: number | undefined; refTypes: string[] }>,
  refereeName: DeckoName,
  refererName: DeckoName,
): Promise<void> {
  if (refereeName.isSimple) return; // all.rb:134
  for (const sidename of [refereeName.leftName, refereeName.rightName]) {
    if (sidename === undefined) continue;
    await interpretReference(lexicon, refHash, sidename.s, PARTIAL_REF_CODE, refererName);
  }
}

/** all.rb:100-114 reference_values_array + :116-120 each_reference_type:
 *  one row per (key, type); types dedupe (Array#uniq keeps first
 *  occurrence); "P" drops when any explicit type exists. */
function referenceValuesArray(
  refHash: Map<string, { refereeId: number | undefined; refTypes: string[] }>,
  refererId: number,
): ReferenceRow[] {
  const rows: ReferenceRow[] = [];
  for (const [refereeKey, entry] of refHash) {
    const refereeId = entry.refereeId ?? null;
    const refTypes = [...new Set(entry.refTypes)];
    const effective =
      refTypes.length > 1 ? refTypes.filter((t) => t !== PARTIAL_REF_CODE) : refTypes;
    for (const refType of effective) {
      rows.push({ refererId, refereeKey, refereeId, refType });
    }
  }
  return rows;
}

// -----------------------------------------------------------------------
// Chunk scanning (content/parser.rb:45-59 walk; link.rb + nest.rb grammar)
// -----------------------------------------------------------------------

export interface ReferenceChunk {
  /** undefined = the chunk carries no reference (explicit-resource link,
   * comment nest). */
  refereeName: string | undefined;
  refType: "L" | "I";
  /** Full-token span, start inclusive / end exclusive, into the scanned
   *  content string. Lets the rename-side rewrite (update-referer-content.ts)
   *  splice swapped chunk text back into the content. */
  start: number;
  end: number;
  /** The raw inner text between the delimiters (link.rb `match[1]`,
   *  nest.rb `match[1]`): the swap rebuild re-derives target|text from it. */
  inner: string;
}

/** Ruby full_res, anchored at the prefix position (parser.rb:37-43 slices
 *  from the prefix and full_matches with \A; the `y` flag reproduces that
 *  anchoring). link.rb:14 /\A\[\[([^\]]+)\]\]/; nest.rb:13
 *  /\A\{\{([^{}]*)\}\}/. */
const LINK_FULL_STICKY = /\[\[([^\]]+)\]\]/y;
const NEST_FULL_STICKY = /\{\{([^{}]*)\}\}/y;
/** link.rb:105 — the nest spans divider_index masks. */
const NEST_SPAN = /\{\{[^{}]*\}\}/g;
/** link.rb:82 — %r{^(/|https?:|mailto:)} explicit-resource targets. */
export const EXPLICIT_LINK = /^(\/|https?:|mailto:)/;
/** The parser walk (parser.rb:45-59): leftmost [[ or {{ prefix wins; its
 *  full regex consumes through the closer; a failed full match advances
 *  one character (parser.rb:53). CHUNK-LIST SCOPE (chunk.rb:84-91): this
 *  walk is the :default/:references lists (link.rb + nest.rb — the
 *  reference-bearing classes a NON-Search card parses). QueryReference is
 *  NOT in either list (it rides :query alone, chunk.rb:89), so a plain
 *  card's quoted text never produces a reference here —
 *  scanQueryReferenceChunks is the :query walk. */
export function scanReferenceChunks(content: string): ReferenceChunk[] {
  const chunks: ReferenceChunk[] = [];
  let position = 0;
  while (position < content.length) {
    const linkIdx = content.indexOf("[[", position);
    const nestIdx = content.indexOf("{{", position);
    if (linkIdx === -1 && nestIdx === -1) break;
    const idx = Math.min(
      ...[linkIdx, nestIdx].filter((i) => i !== -1),
    );
    let matched: ReferenceChunk | undefined;
    if (idx === linkIdx) {
      LINK_FULL_STICKY.lastIndex = idx;
      const m = LINK_FULL_STICKY.exec(content);
      if (m !== null) {
        matched = {
          refereeName: linkRefereeName(m[1] ?? ""),
          refType: "L",
          start: idx,
          end: idx + m[0].length,
          inner: m[1] ?? "",
        };
        position = idx + m[0].length;
      }
    } else if (idx === nestIdx) {
      NEST_FULL_STICKY.lastIndex = idx;
      const m = NEST_FULL_STICKY.exec(content);
      if (m !== null) {
        matched = {
          refereeName: nestRefereeName(m[1] ?? ""),
          refType: "I",
          start: idx,
          end: idx + m[0].length,
          inner: m[1] ?? "",
        };
        position = idx + m[0].length;
      }
    }
    if (matched !== undefined) {
      chunks.push(matched);
    } else {
      position = idx + 1; // bogus prefix (parser.rb:53)
    }
  }
  return chunks;
}

/** link.rb:78-97 interpret: split the raw syntax at the first pipe not
 *  inside a nest span (:89-97 divider_index); explicit-resource targets
 *  carry no reference (:82-83); otherwise the target IS the reference
 *  name, assigned UNSTRIPPED (:85) — canonicalization happens in
 *  Cardname.new's strip! (cardname.rb:44). */
function linkRefereeName(rawSyntax: string): string | undefined {
  const divider = dividerIndex(rawSyntax);
  // link.rb:93 raw_syntax[0..(i - 1)]: at i == 0 the Ruby range 0..-1 is
  // the WHOLE string (endpoint -1 = last char inclusive), so a leading
  // pipe keeps the full syntax as the target.
  const target =
    divider === undefined || divider === 0 ? rawSyntax : rawSyntax.slice(0, divider);
  if (EXPLICIT_LINK.test(target)) return undefined;
  return target;
}

/** link.rb:99-109 divider_index: no pipe -> nil; mask every {{...}} span
 *  with same-length filler, then the first surviving pipe divides. A mask
 *  that swallows every pipe returns nil (target keeps its pipes). Exported
 *  for the rename-side rewrite (update-referer-content.ts), which re-derives
 *  target|link_text from the raw syntax exactly as link.rb:89-97 does. */
export function dividerIndex(raw: string): number | undefined {
  if (!raw.includes("|")) return undefined;
  const masked = raw.replace(NEST_SPAN, (span) => "x".repeat(span.length));
  const idx = masked.indexOf("|");
  return idx === -1 ? undefined : idx;
}

/** nest.rb:16-26 interpret: strip_tags, split at the FIRST pipe
 *  (:18 split "|", 2), trim; `#`-prefixed names are comment nests and
 *  carry no reference (:20-21). */
function nestRefereeName(inBrackets: string): string | undefined {
  const stripped = stripTags(inBrackets);
  const pipe = stripped.indexOf("|");
  const name = (pipe === -1 ? stripped : stripped.slice(0, pipe)).trim();
  if (name.startsWith("#")) return undefined;
  return name;
}
