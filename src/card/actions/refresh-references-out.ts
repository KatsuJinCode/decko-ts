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
import { NameNotFoundError, CodenameNotFoundError } from "../name/errors.js";
import { stripTags } from "../render/nest-syntax.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import { idMarkOf, isListCard, listItemStrings } from "./list-content.js";
export { listItemStrings };

/** all.rb:10 PARTIAL_REF_CODE. */
const PARTIAL_REF_CODE = "P";

/** The subset of DbLexicon the reference path needs (all.rb:95
 *  Lexicon.id). Structural type keeps this module decoupled from the
 *  FetchEngine for tests. */
export interface ReferenceLexicon {
  id(nameish: string | DeckoName): Promise<number | undefined>;
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
  const rows = (await isListCard(driver, refererId))
    ? await createListReferencesOut(lexicon, refererId, refererName, content)
    : await createReferencesOut(lexicon, refererId, refererName, content);
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

/** event :clear_references (reference_events.rb:28-31): delete the
 *  referer's rows and unmap the deleted id from other cards' rows
 *  (unmap_referees, reference.rb:31-33). */
export async function clearReferencesOnDelete(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<void> {
  await driver.query("DELETE FROM card_references WHERE referer_id = ?", [cardId]);
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
    for (const item of listItemStrings(content)) {
      await interpretReference(lexicon, refHash, item, "L", refererName);
    }
    return referenceValuesArray(refHash, refererId);
  }
  for (const chunk of scanReferenceChunks(content)) {
    if (chunk.refereeName === undefined) continue; // explicit links / comment nests
    await interpretReference(lexicon, refHash, chunk.refereeName, chunk.refType, refererName);
  }
  return referenceValuesArray(refHash, refererId);
}

/** A list card's references (Abstract::List#each_reference_out,
 *  card-mod-list-0.20.0 set/abstract/01_list.rb:53-57): every item name,
 *  absolutized against the card's own name (item_names -> clean_item_name,
 *  card-mod-collection set/all/item.rb:15-22, :258-267), as a link ("L"). */
async function createListReferencesOut(
  lexicon: ReferenceLexicon,
  refererId: number,
  refererName: DeckoName,
  content: string | null | undefined,
): Promise<ReferenceRow[]> {
  const refHash = new Map<string, { refereeId: number | undefined; refTypes: string[] }>();
  const idRows: ReferenceRow[] = [];
  for (const item of listItemStrings(content)) {
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
   *  comment nest). */
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
 *  one character (parser.rb:53). */
export function scanReferenceChunks(content: string): ReferenceChunk[] {
  const chunks: ReferenceChunk[] = [];
  let position = 0;
  while (position < content.length) {
    const linkIdx = content.indexOf("[[", position);
    const nestIdx = content.indexOf("{{", position);
    if (linkIdx === -1 && nestIdx === -1) break;
    const idx = linkIdx === -1 ? nestIdx : nestIdx === -1 ? linkIdx : Math.min(linkIdx, nestIdx);
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
    } else {
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
