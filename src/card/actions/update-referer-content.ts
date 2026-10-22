// The card_references rename-side write path: when a card's name changes,
// the cards that REFER to it get their content rewritten so their [[links]]
// and {{inclusions}} point at the new name, and their reference rows are
// rebuilt. TypeScript port of Ruby's update_referer_content event family.
//
// Ruby trail (card-1.110.0 unless noted; every behavior cites its source):
// - event :update_referer_content, :finalize, on: :update, changed: :name
//   (mod/core/set/all/reference_events.rb:7-10):
//     referers.each { |r| r.replace_references name_before_act, name }
//     each_descendant { |d| d.rename_as_descendant !skip_update_referers? }
// - referers (lib/card/reference/all.rb:13-15 via Card#references_in,
//   lib/card.rb:169): rows whose referee_id is this card's id, mapped to
//   referer cards, ids uniq'd in first-occurrence order; trashed/missing
//   referers drop out (Card[id] is nil for them -> Array#compact). The
//   Card[id] mapping is a CACHE-THROUGH fetch, and that is load-bearing:
//   on a miss it writes the referer's PRE-rewrite card to Card::Cache, and
//   replace_references' update_column below then rewrites the row behind
//   that cache with no expire — the referer's next render serves the
//   pre-rename content (the rename-referers oracle freezes exactly this
//   staleness: a recorded page shows the old name as a wanted link while
//   its reference rows are already rewritten). The engine passes its
//   FetchEngine fetch as deps.fetchRefererCard; staleness clears the way
//   Ruby's clears it — the next legitimate write to the referer expires
//   the entry (after_commit expire) and the render serves fresh.
// - replace_references (reference_events.rb:48-50):
//   `self.content_quietly = swap_names(old_name, new_name) unless structure`
//   — the `structure` gate skips cards whose content is inherited from a
//   structure rule; the port does not implement structure-rule content yet
//   and no structure cards exist, so the gate is always false here.
// - swap_names (all.rb:65-71): parse the content, swap EVERY Reference
//   chunk (not just rows matching the old name), re-serialize:
//   - Link#swap_name (card-mod-content-0.20.0 lib/card/content/chunk/
//     link.rb:35-40): @name = name.to_name.swap(old, new) (key comparison,
//     cardname-0.20.0 lib/cardname/manipulate.rb:20-33), link text gets
//     Name#sub_in (:45-50), then the text is REBUILT as
//     "[[#{referee_name}|#{link_text}]]" where referee_name is the swapped
//     name ABSOLUTIZED against the referer's own name (chunk/reference.rb
//     :11-18 absolute_name at :15).
//   - Nest#swap_name (chunk/nest.rb:77-81): the swapped name is rebuilt
//     WITHOUT absolutizing; the raw option list after the first pipe of the
//     tag-stripped brackets is preserved verbatim (interpret at :16-26
//     splits the stripped text, so interior whitespace of the name part is
//     gone but everything after the first pipe survives).
//   - Ruby rebuilds EVERY chunk unconditionally, including chunks that carry
//     no reference. This port deliberately LEAVES those untouched:
//     explicit-resource links ([[https://...]] — link.rb:82-83 sets
//     @explicit_link, @name stays nil) would rebuild to "[[|text]]"/"[[]]"
//     (referee_name returns nil, reference.rb:12), and comment nests
//     ({{#...}} — nest.rb:20-21 never sets @name) would rebuild to
//     "{{}}". Both are Ruby data-corruption warts, not behaviors the
//     parity corpus asserts; the divergences are recorded here and in the
//     task report. QueryReference chunks (chunk/query_reference.rb,
//     ref_type "Q" — the quoted names in JSON/CQL content) swap in the
//     gaps between the L/I chunks (swapQueryReferencesInGap); the
//     rename-referers journey's JSON card pins the arm.
// - content_quietly= (reference_events.rb:52-58): assign the content; if
//   the db_content column actually changed (the loop guard, :54), write the
//   column DIRECTLY (`update_column` — no validations, no callbacks, no
//   act/action rows, no updated_at bump) and run update_references_out
//   (:57) — the referer's rows are deleted and rebuilt from the new
//   content (all.rb:47-50), which is why this module shares the out-
//   direction machinery in refresh-references-out.ts.
// - each_descendant (lib/card/name/all/descendants.rb:41-46) walks the
//   child graph (left_id OR right_id, descendants.rb:21-29); each
//   descendant runs rename_as_descendant (reference_events.rb:39-46),
//   whose first half — update_referer_content for the descendant's OWN
//   name_before_act -> name pair — is what rewrites referers of virtually
//   renamed junctions (A renamed -> "A+B" is now "Uno+B", and cards
//   linking "A+B" follow). The expire + Lexicon.update halves
//   (:44-45) are the engine's refreshDescendantCaches; this module is
//   only the referer-content half. The descendant's name_before_act is
//   the parts' before-names (lib/card/dirty.rb:60-70): each renamed side
//   contributes its before-name, unchanged sides their current ones.
//   Ruby re-walks subtrees per descendant (each rename_as_descendant
//   recurses through update_referer_content again), so deep nodes are
//   visited several times; every visit after the first finds the content
//   already swapped and db_content_changed? goes false (reference_events.rb
//   :54 loop guard). The port computes each descendant once (children of
//   the renamed part-tree, shortest names first, which is the only order
//   the before-name data dependency allows) — same rows written, no
//   redundant passes.
// - event :update_referer_references_out (reference_events.rb:16-19) is
//   the skip twin: when referer content is NOT rewritten
//   (skip: :update_referer_content), referers keep their content but their
//   rows are rebuilt so partial references stay correctly tracked
//   (all.rb's "P" rows). The TS save path has no skip machinery yet, so
//   the engine never calls it; it is exported for when that machinery
//   arrives and is tested directly.

import { DeckoName } from "../name.js";
import { LIVE_CARD_ROW_BY_ID_SQL } from "../fetch/card-read-shapes.js";
import { NameNotFoundError, CodenameNotFoundError } from "../name/errors.js";
import { stripTags } from "../render/nest-syntax.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import type { CardRecord } from "../fetch/card-record.js";
import {
  dividerIndex,
  EXPLICIT_LINK,
  refreshReferencesOut,
  scanReferenceChunks,
  type ReferenceLexicon,
} from "./refresh-references-out.js";
import { isListCard, swapListItems } from "./list-content.js";

/** What the rename rewrite needs from the engine: the same driver/Lexicon
 *  pair the out-direction uses, plus the Lexicon's compound-name
 *  composition and write-through (DbLexicon.composeName, fetch/lexicon.ts
 *  :102; DbLexicon.write, :114 — the Lexicon.update half of
 *  rename_as_descendant, reference_events.rb:45). */
export interface RenameSwapLexicon extends ReferenceLexicon {
  composeName(
    leftId: number,
    rightId: number | undefined | null,
  ): Promise<DeckoName | undefined>;
  write(id: number, name: DeckoName, lex: [number, number]): void;
}

/** What the rename rewrite needs from the engine: the same driver/Lexicon
 *  pair the out-direction uses. */
export interface RenameSwapDeps {
  driver: SQLDatabaseDriver;
  lexicon: RenameSwapLexicon;
  /** Ruby's `Card[card_id]` inside referers (all.rb:15) — the cache-through
   *  fetch of each referer. The fetch is what freezes the staleness the
   *  rename-referers oracle pins: on a cache miss it reads the referer's
   *  PRE-rewrite row and writes it to the shared cache (write_to_cache),
   *  and replace_references' subsequent `update_column` (content_quietly=,
   *  reference_events.rb:52-58) changes the row BEHIND that cache with no
   *  expire — so the referer's next render serves the pre-rename content
   *  until a legitimate write to the referer expires it. The engine passes
   *  its FetchEngine fetch here (the same cache the render path reads);
   *  absent, the read stays a raw row query (the model-pure default). */
  fetchRefererCard?: (id: number) => Promise<CardRecord | undefined>;
  /** The staleness pin for the update_column arm: called with the referer's
   *  PRE-write card when the rewrite actually changes the row, so the entry
   *  survives the freshness gate's TS-only resets and drops on the referer's
   *  own expire (FetchEngine#pinStaleCard). Absent (the model-pure default),
   *  there is no cache layer to keep stale and nothing is pinned. */
  pinStaleReferer?: (card: CardRecord) => void;
}

/** The fields of a referer the rewrite touches. Ruby's referers returns
 *  Card objects (all.rb:15); the port's two sources — the raw row query and
 *  the cache-through fetch — both carry these, so the rewrite consumes the
 *  subset and never the whole row. `card` is the fetched record the
 *  cache-through source returned (undefined on the raw-row default): the
 *  pin at the update_column arm keeps THAT record's bytes. */
interface RefererRef {
  id: number;
  left_id: number | null;
  right_id: number | null;
  name: string | null;
  db_content: string | null;
  trash: number;
  card?: CardRecord;
}

// -----------------------------------------------------------------------
// Event entry points
// -----------------------------------------------------------------------

/** event :update_referer_content (reference_events.rb:7-10): rewrite the
 *  referers' content old -> new, then the descendants' referers. Callers
 *  gate on `changed: :name` (an actual rename) and pass the card's
 *  name_before_act / name pair.
 *
 *  `working` is the Ruby Card object's in-memory content, and it is
 *  load-bearing. `replace_references` mutates that object
 *  (`self.content_quietly = swap_names(...)`, reference_events.rb:48-50),
 *  and the same referer is reached again by the descendants' pass
 *  (each_descendant -> rename_as_descendant -> update_referer_content, :9)
 *  — where Ruby swaps the ALREADY-SWAPPED text, finds nothing left to
 *  change, and `db_content_changed?` (:54) stops the write. A port that
 *  re-read the referer's column each time would instead restart from the
 *  pre-rename bytes and let each descendant's write overwrite the last,
 *  so the stored column ends up holding only the final descendant's
 *  partial swap. The map is scoped to one update_referer_content walk
 *  (one rename event); Ruby's object lives for the whole request, which
 *  for a rename — one event per save — is the same span. */
export async function updateRefererContent(
  deps: RenameSwapDeps,
  renamedCardId: number,
  nameBeforeAct: DeckoName,
  name: DeckoName,
): Promise<void> {
  const working = new Map<number, string>();
  // reference_events.rb:8 — referers.each { |r| r.replace_references
  // name_before_act, name }.
  await rewriteReferersOf(deps, renamedCardId, nameBeforeAct, name, working);
  // reference_events.rb:9 — each_descendant { |d| d.rename_as_descendant
  // !skip_update_referers? } (the referer-content half; skip is always
  // false in this port).
  await rewriteDescendantReferers(deps, renamedCardId, nameBeforeAct, name, working);
}

/** event :update_referer_references_out (reference_events.rb:16-19): the
 *  skip twin — referers rebuild their rows from UNCHANGED content
 *  (each referer's update_references_out, all.rb:47-50), so partial
 *  references to the renamed card's old name are correctly tracked. */
export async function updateRefererReferencesOut(
  deps: RenameSwapDeps,
  renamedCardId: number,
): Promise<void> {
  for (const referer of await referersOf(deps, renamedCardId)) {
    const name = await composedNameOf(deps, referer);
    if (name === undefined) continue;
    await refreshReferencesOut(
      deps.driver,
      deps.lexicon,
      referer.id,
      name,
      referer.db_content ?? "",
    );
  }
}

// -----------------------------------------------------------------------
// The referer rewrite (reference_events.rb:8, :48-58)
// -----------------------------------------------------------------------

/** One pass of reference_events.rb:8 against one card's referers. */
async function rewriteReferersOf(
  deps: RenameSwapDeps,
  cardId: number,
  nameBeforeAct: DeckoName,
  name: DeckoName,
  working: Map<number, string>,
): Promise<void> {
  for (const referer of await referersOf(deps, cardId)) {
    await replaceReferences(deps, referer, nameBeforeAct, name, working);
  }
}

/** all.rb:13-15 + lib/card.rb:169 — the referers of one card: rows whose
 *  referee_id is the card's id, uniq'd by referer in first-occurrence order
 *  (Ruby's references.map(&:referer_id).uniq), mapped to LIVE cards
 *  (trash = 0; trashed/missing drop out via Array#compact, all.rb:23). The
 *  card mapping is `Card[card_id]` — a CACHE-THROUGH fetch (deps
 *  .fetchRefererCard): its miss path writes the referer's pre-rewrite card
 *  into the shared cache, which is the mechanism that leaves the referer
 *  serving stale content after the update_column write behind it. */
async function referersOf(
  deps: RenameSwapDeps,
  cardId: number,
): Promise<RefererRef[]> {
  const grouped = await deps.driver.query<{ referer_id: number; first_row_id: number }>(
    `SELECT referer_id, MIN(id) AS first_row_id FROM card_references
     WHERE referee_id = ? GROUP BY referer_id ORDER BY first_row_id`,
    [cardId],
  );
  const referers: RefererRef[] = [];
  for (const { referer_id } of grouped.rows) {
    if (deps.fetchRefererCard !== undefined) {
      // all.rb:15 Card[card_id]: cache first, then the row (trash = 0 in
      // the db arm — retrieve.rb:28-33 — matches the raw query below; the
      // compact drops the trashed/missing).
      const card = await deps.fetchRefererCard(referer_id);
      if (card === undefined || card.trash || card.id === undefined) continue;
      referers.push({
        id: card.id,
        left_id: card.leftId ?? null,
        right_id: card.rightId ?? null,
        name: card.name?.s ?? null,
        db_content: card.dbContent ?? null,
        trash: card.trash ? 1 : 0,
        card,
      });
    } else {
      const result = await deps.driver.query<CardsRow>(
        LIVE_CARD_ROW_BY_ID_SQL,
        [referer_id],
      );
      if (result.rows[0] !== undefined) referers.push(result.rows[0]);
    }
  }
  return referers;
}

/** replace_references (reference_events.rb:48-50): swap the names in the
 *  referer's content, then the quiet write. The `unless structure` gate
 *  (:49) has no true case in this port — see the module header. The swap
 *  reads the referer's IN-MEMORY content, not its column: see the
 *  `working` map on updateRefererContent. */
async function replaceReferences(
  deps: RenameSwapDeps,
  referer: RefererRef,
  nameBeforeAct: DeckoName,
  name: DeckoName,
  working: Map<number, string>,
): Promise<void> {
  const refererName = await composedNameOf(deps, referer);
  if (refererName === undefined) return;
  const current = working.get(referer.id) ?? referer.db_content ?? "";
  // A list card swaps its items by name (Abstract::List#swap_names).
  const newContent = (await isListCard(deps.driver, referer.id))
    ? swapListItems(current, nameBeforeAct, name)
    : swapNames(current, nameBeforeAct, name, refererName);
  await contentQuietlySet(deps, referer, refererName, newContent, working);
}

/** content_quietly= (reference_events.rb:52-58): write the column only
 *  when the content actually changed (:54, the loop guard), DIRECTLY via
 *  update_column semantics (no updated_at, no act/action rows), then
 *  rebuild the referer's reference rows (:57 -> all.rb:47-50). The pin at
 *  the write is Ruby's state ordering: the Card[id] fetch inside referers
 *  has already put the PRE-write card in the cache, and update_column
 *  changes the row behind it with no expire — the engine's pin keeps that
 *  entry alive across the freshness gate's resets so the referer renders
 *  Ruby's stale bytes, and the referer's own expire drops it. */
async function contentQuietlySet(
  deps: RenameSwapDeps,
  referer: RefererRef,
  refererName: DeckoName,
  newContent: string,
  working: Map<number, string>,
): Promise<void> {
  // db_content_changed? (:54) reads the attribute against its in-database
  // value, and update_column (:56) clears the change — so after a write the
  // guard compares against what this walk last stored, which is `working`.
  if (newContent === (working.get(referer.id) ?? referer.db_content ?? null)) return;
  working.set(referer.id, newContent);
  if (referer.card !== undefined) deps.pinStaleReferer?.(referer.card);
  await deps.driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [
    newContent,
    referer.id,
  ]);
  await refreshReferencesOut(deps.driver, deps.lexicon, referer.id, refererName, newContent);
}

// -----------------------------------------------------------------------
// swap_names (all.rb:65-71) + the chunk swap_name pair
// ----------------------------------------------------------------

/** swap_names (all.rb:65-71): swap every Reference chunk and re-serialize.
 *  Chunks that carry no reference (explicit-resource links, comment nests)
 *  stay untouched — see the module header for the divergence from Ruby,
 *  which rebuilds them into corrupted forms. The QueryReference chunks
 *  (chunk/query_reference.rb — the quoted names in JSON/CQL content,
 *  ref_type "Q") swap in the same walk: the rename-referers journey's JSON
 *  card ({"link_to":"Topic 001"}) pins the Q arm. */
export function swapNames(
  content: string | null | undefined,
  oldName: DeckoName,
  newName: DeckoName,
  refererName: DeckoName,
): string {
  const source = content ?? "";
  let result = "";
  let cursor = 0;
  for (const chunk of scanReferenceChunks(source)) {
    result += source.slice(cursor, chunk.start);
    result += swapChunkText(source.slice(chunk.start, chunk.end), chunk, oldName, newName, refererName);
    cursor = chunk.end;
  }
  return result + source.slice(cursor);
}

/** Link#swap_name (link.rb:35-40) / Nest#swap_name (nest.rb:77-81) /
 *  QueryReference#swap_name (query_reference.rb:86-89) for one chunk;
 *  `original` is the chunk's exact source span, returned untouched when the
 *  port leaves the chunk alone (the Ruby rebuilds there corrupt it — module
 *  header). */
function swapChunkText(
  original: string,
  chunk: ReturnType<typeof scanReferenceChunks>[number],
  oldName: DeckoName,
  newName: DeckoName,
  refererName: DeckoName,
): string {
  try {
    if (chunk.refType === "Q") {
      // QueryReference#swap_name (query_reference.rb:86-89): the quoted
      // name runs Name#swap; the chunk rebuilds as "#{@name}" (the quotes
      // re-emitted around the swapped name).
      const swapped = DeckoName.parse(chunk.inner).swap(oldName, newName);
      return `"${swapped.s}"`;
    }
    if (chunk.refType === "L") {
      // link.rb:35-40. The target|text split follows interpret
      // (link.rb:89-97) via the same divider_index (link.rb:99-109).
      const divider = dividerIndex(chunk.inner);
      const target =
        divider === undefined || divider === 0 ? chunk.inner : chunk.inner.slice(0, divider);
      // Ruby rebuilds explicit-resource links into "[[|text]]" (link.rb
      // :35-40 with a nil @name, reference.rb:12); this port leaves them
      // byte-identical — see the module header.
      if (EXPLICIT_LINK.test(target)) return original;
      const linkText = divider === undefined ? undefined : chunk.inner.slice(divider + 1);
      // replace_name_reference (reference.rb:30-35): swap on the parsed
      // (stripped) name, key comparison (manipulate.rb:20-33).
      const swapped = DeckoName.parse(target).swap(oldName, newName);
      // referee_name (reference.rb:11-18): absolutize against the
      // referer's own name.
      const referee = swapped.absoluteName(refererName);
      // replace_link_text (link.rb:124-128): sub_in on the STRIPPED text
      // (objectify stripped it at interpret, link.rb:113-122); blank text
      // is absent (present?, :38).
      let textSyntax = "";
      if (linkText !== undefined) {
        const stripped = rubyStrip(linkText);
        if (stripped !== "") {
          textSyntax = `|${oldName.subIn(stripped, newName)}`;
        }
      }
      return `[[${referee.s}${textSyntax}]]`;
    }
    // Nest#swap_name (nest.rb:77-81). Comment nests (@name nil) would
    // rebuild to "{{}}" in Ruby; this port leaves them untouched — see
    // the module header.
    if (chunk.refereeName === undefined) return original;
    const swapped = DeckoName.parse(chunk.refereeName).swap(oldName, newName);
    // interpret (nest.rb:16-26) splits the TAG-STRIPPED brackets at the
    // first pipe; @opt_lists is the verbatim remainder (nil when no pipe
    // existed, "" kept when the pipe was last). Rebuild preserves it.
    const strippedInner = stripTags(chunk.inner);
    const pipe = strippedInner.indexOf("|");
    const optLists = pipe === -1 ? undefined : strippedInner.slice(pipe + 1);
    const nestBody = optLists === undefined ? swapped.s : `${swapped.s}|${optLists}`;
    return `{{${nestBody}}}`;
  } catch (error) {
    // reference.rb:16-18 — "do not break on missing id/codename
    // references": a chunk whose name resolution explodes stays as it is
    // (Ruby's rescue yields a nil referee_name and a corrupted rebuild;
    // this port preserves the original text instead).
    if (error instanceof NameNotFoundError || error instanceof CodenameNotFoundError) {
      return original;
    }
    throw error;
  }
}

/** Ruby String#strip: leading/trailing whitespace and NUL removed. */
function rubyStrip(str: string): string {
  return str.replace(/^[ \t\n\v\f\r\0]+/, "").replace(/[ \t\n\v\f\r\0]+$/, "");
}

// -----------------------------------------------------------------------
// The descendant walk (reference_events.rb:9, :39-46)
// -----------------------------------------------------------------------

/** The rename a descendant underwent: its composed name before and after
 *  the ancestor's rename (lib/card/dirty.rb:60-70 — name_before_act is
 *  the parts' before-names). */
interface DescendantRename {
  id: number;
  before: DeckoName;
  after: DeckoName;
}

/** The each_descendant half of update_referer_content: every junction
 *  under the renamed card had its composed name change virtually; its
 *  referers' content follows (rename_as_descendant -> the descendant's
 *  own update_referer_content, reference_events.rb:39-41). The expire +
 *  Lexicon.update halves (:44-45) live in the engine's
 *  refreshDescendantCaches. */
async function rewriteDescendantReferers(
  deps: RenameSwapDeps,
  renamedCardId: number,
  nameBeforeAct: DeckoName,
  name: DeckoName,
  working: Map<number, string>,
): Promise<void> {
  // Collect the descendant rows (each_child's graph: left_id OR right_id,
  // descendants.rb:21-29, trash excluded) breadth-first like Ruby's walk.
  const renames = new Map<number, DescendantRename>();
  renames.set(renamedCardId, { id: renamedCardId, before: nameBeforeAct, after: name });
  const rows: CardsRow[] = [];
  const visited = new Set<number>([renamedCardId]);
  let frontier = [renamedCardId];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const parentId of frontier) {
      const result = await deps.driver.query<CardsRow>(
        "SELECT * FROM cards WHERE (left_id = ? OR right_id = ?) AND trash = 0",
        [parentId, parentId],
      );
      for (const child of result.rows) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        rows.push(child);
        next.push(child.id);
      }
    }
    frontier = next;
  }

  // Each descendant's after-name is its composed name in the post-rename
  // Lexicon (lib/card/name/all.rb:12-14); its before-name substitutes the
  // before-names of any renamed sides (dirty.rb:64-70). BFS order is the
  // only order the data dependency allows: a renamed side is always a
  // strict walk-ancestor of the node, so its (before, after) pair exists
  // by the time the node needs it. Writing each junction's fresh name
  // into the Lexicon AS THE WALK PROCEEDS is the Card::Lexicon.update
  // half of rename_as_descendant (reference_events.rb:45): a junction's
  // id entry caches its NAME STRING frozen at create time, so a deeper
  // descendant composing through this junction would otherwise resolve
  // the stale pre-rename name. (The engine's refreshDescendantCaches
  // repeats these writes afterwards — idempotent; it owns the expire
  // half too, reference_events.rb:44.)
  const withNames: DescendantRename[] = [];
  for (const row of rows) {
    if (row.left_id === null || row.right_id === null) continue; // not a junction: no composed name
    const after = await deps.lexicon.composeName(row.left_id, row.right_id);
    if (after === undefined || !after.isCompound) continue;
    const leftBefore = renames.get(row.left_id)?.before ?? after.leftName;
    const rightBefore = renames.get(row.right_id)?.before ?? after.rightName;
    if (leftBefore === undefined || rightBefore === undefined) continue;
    const before = DeckoName.compose([leftBefore, rightBefore]);
    const rename = { id: row.id, before, after };
    renames.set(row.id, rename);
    deps.lexicon.write(row.id, after, [row.left_id, row.right_id]);
    withNames.push(rename);
  }

  for (const rename of withNames) {
    await rewriteReferersOf(deps, rename.id, rename.before, rename.after, working);
  }
}

// -----------------------------------------------------------------------
// shared helpers
// -----------------------------------------------------------------------

/** The composed name of a row — lib/card/name/all.rb:12-14 (compound names
 *  compose through the Lexicon; simple cards read the column), the same
 *  resolution card-action-engine.ts uses. Accepts the structural subset the
 *  referer rewrite carries (full CardsRow descendants satisfy it too). */
async function composedNameOf(
  deps: RenameSwapDeps,
  row: RefererRef,
): Promise<DeckoName | undefined> {
  if (row.left_id !== null && row.left_id !== undefined) {
    const composed = await deps.lexicon.composeName(row.left_id, row.right_id);
    if (composed !== undefined) return composed;
  }
  return row.name !== null && row.name !== undefined ? DeckoName.parse(row.name) : undefined;
}
