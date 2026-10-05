// BUILD 2 of the one-trip lane: THE ONE-TRIP FETCH.
//
// ONE statement returns EVERYTHING the page render needs: the recursive
// phase walks the derived edge graph from the page card to its whole
// transitive closure; the NON-recursive outer phase aggregates every row
// class into ONE JSON document (SQLite forbids aggregate functions inside
// the recursive select — sqlite.org/lang_with.html — so discovery and
// aggregation are two phases of one statement; the verdict's §3 shape).
//
// ONE round trip against the corpus connection (the same driver the render
// uses). The derived store rides along as an ATTACHed database — the
// corpus file itself is never written (the side db holds only derived
// data; SPEC A2).
//
// Row-set contract (pinned by tests/card/one-trip/one-trip-fetch.test.ts):
// the bundle's card set is a SUPERSET of every cards row the render reads.
// Excess rows are proven harmless by the byte-identity pin (the render
// only consults what its content asks for; extra cached rows change no
// bytes — a missing row would cost a residue trip, not wrong bytes,
// because the render's own execution stays authoritative).

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { DeckoName } from "../name.js";
import type { PageBundle, OneTripRuleCandidate } from "./types.js";

/** The ATTACH name the derived store rides under. Seam note: the fetch
 *  statement references the store through `${DERIVED_STORE_ATTACH}.` — an
 *  implementation that materializes the derived tables INTO the serving
 *  database (the production shape) drops the prefix and the ATTACH call;
 *  nothing else changes. */
export const DERIVED_STORE_ATTACH = "one_trip";

/** The DECKO_ONE_TRIP_STORE sentinel for the MATERIALIZED shape: the
 *  one_trip_* tables live IN the serving database (no side file exists to
 *  attach). This is the shape the serving DB requires — observed verbatim
 *  2026-10-05 (cold-latency-rig-lane.md MATERIALIZED-STORE §6.1): the
 *  serving DB's SQL parser rejects ATTACH for ANY value (SQL_PARSE_ERROR),
 *  so an attached side file cannot exist there; the 98,915 derived rows sit
 *  IN the serving DB, dormant until the code reads them inline. */
export const ONE_TRIP_STORE_INLINE = "inline";

/** Whether a DECKO_ONE_TRIP_STORE value names the materialized (inline)
 *  shape — the tables in the serving DB itself — rather than a side-file
 *  path. */
export function isInlineStoreSpec(storeSpec: string): boolean {
  return storeSpec === ONE_TRIP_STORE_INLINE;
}

/** Escape a filesystem path for SQL single-quoting (ATTACH's filename is a
 *  string literal here; bound parameters in ATTACH are not portable across
 *  the drivers this engine supports). */
function sqlQuotePath(path: string): string {
  if (path.includes("\x00")) throw new Error("one-trip attach: NUL in side-store path");
  return `'${path.replace(/'/g, "''")}'`;
}

/** Attach the derived store to a corpus connection. Connection setup, not a
 *  page round trip (the harness excludes it from the trip count). */
export async function attachDerivedStore(
  driver: SQLDatabaseDriver,
  sideStorePath: string,
  attachName: string = DERIVED_STORE_ATTACH,
): Promise<void> {
  await driver.query(`ATTACH DATABASE ${sqlQuotePath(sideStorePath)} AS ${attachName}`, []);
}

export async function detachDerivedStore(
  driver: SQLDatabaseDriver,
  attachName: string = DERIVED_STORE_ATTACH,
): Promise<void> {
  await driver.query(`DETACH DATABASE ${attachName}`, []);
}

/**
 * THE one-trip statement (dialect seam 5 of types.ts).
 *
 * Shape invariants (SPEC):
 *   - the recursive select discovers IDS only (no aggregates — SQLite
 *     forbids them in the recursive select);
 *   - the outer phase is NON-recursive and does all aggregation
 *     (json_object/json_group_array), producing ONE row with ONE document;
 *   - the page seed is the page card's row, looked up by key;
 *   - rule candidates and search results join by page/closure membership —
 *     they are per-page data, not graph walks.
 */
export function oneTripFetchSql(attachName: string = DERIVED_STORE_ATTACH): string {
  // Three page-key placeholders (seed, page_key field, rule-candidate page
  // join) — plain `?` markers bound positionally, one value each: numbered
  // markers (?1) are a SQLite dialect detail the spec keeps out of the
  // shape.
  //
  // TERMINATION INVARIANT: the recursive select carries the card ID ONLY.
  // A (id, depth) pair would defeat UNION's dedup on any cyclic graph —
  // the same id at a new depth is a new row and the walk never terminates
  // (measured: the deck's include graph is cyclic through *all-hub rule
  // templates, and the depth-carrying form hung past 300 s). The depth is
  // the builder's BFS bookkeeping (one_trip_page_closure), never the
  // fetch's.
  return `WITH RECURSIVE walk(id) AS (
  SELECT id FROM cards WHERE "key" = ? AND trash = 0
  UNION
  SELECT e.referee_id
    FROM walk
    JOIN ${attachName}.one_trip_edges e ON e.referer_id = walk.id
   WHERE e.referee_id IS NOT NULL
),
members(id) AS (
  SELECT id FROM walk
  UNION
  SELECT pc.card_id FROM ${attachName}.one_trip_page_closure pc
   WHERE pc.page_id = (SELECT id FROM cards WHERE "key" = ? AND trash = 0)
)
SELECT json_object(
  'page_key', ?,
  'cards', (
    SELECT json_group_array(json_object(
      'id', c.id, 'name', c.name, 'key', c."key", 'codename', c.codename,
      'left_id', c.left_id, 'right_id', c.right_id,
      'current_revision_id', c.current_revision_id,
      'created_at', c.created_at, 'updated_at', c.updated_at,
      'creator_id', c.creator_id, 'updater_id', c.updater_id,
      'read_rule_class', c.read_rule_class, 'read_rule_id', c.read_rule_id,
      'references_expired', c.references_expired, 'trash', c.trash,
      'type_id', c.type_id, 'db_content', c.db_content))
    FROM (SELECT DISTINCT co.* FROM cards co JOIN members m ON m.id = co.id) c
  ),
  'rule_candidates', (
    SELECT json_group_array(json_object(
      'card_id', r.card_id, 'setting_code', r.setting_code,
      'candidate_key', r.candidate_key, 'candidate_id', r.candidate_id))
    FROM ${attachName}.one_trip_page_rules r
    WHERE r.page_id = (SELECT id FROM cards WHERE "key" = ? AND trash = 0)
      AND r.card_id = r.page_id
  ),
  'search_results', (
    SELECT json_group_array(json_object(
      'search_card_id', s.search_card_id, 'position', s.position, 'card_id', s.card_id))
    FROM ${attachName}.one_trip_search_results s
    WHERE s.search_card_id IN (
      SELECT m.id FROM members m
      JOIN ${attachName}.one_trip_search_nests n ON n.search_card_id = m.id
    )
  )
) AS bundle`;
}

interface BundleDocument {
  page_key: string;
  cards: (CardsRow & { key: string | null })[];
  rule_candidates: {
    card_id: number;
    setting_code: string;
    candidate_key: string;
    candidate_id: number | null;
  }[];
  search_results: { search_card_id: number; position: number; card_id: number }[];
}

// ---------------------------------------------------------------------------
// THE INLINE FETCH (the materialized shape): discovery ONCE, keyset slices,
// byte-equal.
//
// WALL 1 (MATERIALIZED-STORE §6.1): the serving DB rejects ATTACH at the
// parser for any value, so the inline posture issues NO ATTACH and reads the
// one_trip_* tables UNQUALIFIED on the same connection — the seam note's own
// "drops the prefix and the ATTACH call; nothing else changes".
//
// WALL 2 (MATERIALIZED-STORE §6.3, the named remainder): even unattached, a
// template-scale page's single-JSON-row bundle (~3,530 cards, ~5 MB) fails
// server-side with `SQLite error: string or blob too big`, while small rows
// are proven fine (the materialized load pushed 528 multi-row statements).
// The inline fetch therefore returns the bundle in CHUNKS — one head
// statement (page key + rule candidates + search results + the MATERIALIZED
// member id list, each a small value) plus one statement per bounded slice
// of card rows, each row the SAME per-card json_object text the single-row
// aggregation embeds — and assembles them client-side into a document that
// is BYTE-EQUAL to the single-row statement's (pinned on the corpus,
// inline-chunked-fetch.test.ts: order is the single-row DISTINCT order — id
// ascending, the first DISTINCT column and a unique key — and every data
// byte is SQLite-emitted, the client only joins rows with "," inside the
// same brackets).
//
// V2 (2026-10-05, the WIRE-DIAGNOSIS §4 fix): discovery runs ONCE per seat.
// The v1 chunk statements each re-ran the ENTIRE discovery phase (recursive
// walk CTE + members CTE + DISTINCT join + ORDER BY id) before their
// LIMIT/OFFSET slice — 37 full closure computations per Aikido seat,
// 228-1,112 ms each, ~18 s of seat cost (probed verbatim on the live serving
// DB). V2's head statement materializes the member id list ONCE (one small
// sorted JSON value — Aikido's 3,530 ids are ~25 KB), and every card slice
// is a FLAT keyset read over one window of that list (the window's ids bound
// as one small JSON array, expanded by json_each — a plain indexed join
// against cards, no walk CTE anywhere after statement 1). The windows tile
// the id-ascending member list, each slice orders by c.id, so the client
// concatenation is byte-equal to the v1 whole-set slice.
// ---------------------------------------------------------------------------

/** Card rows per inline chunk. The bound keeps every response rows-small:
 *  ~1.4 KB per typical card row (~262 KB worst observed body), so a chunk
 *  stays orders of magnitude under the ~5 MB single value the serving DB
 *  rejected, while matching the proven multi-row statement shape (180-450
 *  rows per INSERT statement loaded fine). Tunable: shrink if the serving
 *  DB's true value limit proves tighter, grow if per-trip overhead dominates. */
export const ONE_TRIP_INLINE_CARDS_PER_CHUNK = 100;

/** The recursive walk + members CTEs, verbatim the single-row statement's
 *  discovery phase, with the store qualifier DROPPED (inline = the tables
 *  are in this database). V2: this phase executes in EXACTLY ONE statement
 *  per seat — the head's; nothing else in the fetch may carry it. */
function inlineStoreCteSql(): string {
  return `WITH RECURSIVE walk(id) AS (
  SELECT id FROM cards WHERE "key" = ? AND trash = 0
  UNION
  SELECT e.referee_id
    FROM walk
    JOIN one_trip_edges e ON e.referer_id = walk.id
   WHERE e.referee_id IS NOT NULL
),
members(id) AS (
  SELECT id FROM walk
  UNION
  SELECT pc.card_id FROM one_trip_page_closure pc
   WHERE pc.page_id = (SELECT id FROM cards WHERE "key" = ? AND trash = 0)
)`;
}

/** The head statement: page key (as SQLite-emitted JSON text), the page's
 *  rule candidates and search results (small aggregates), and — the V2
 *  materialization — the page's WHOLE member id list as one small sorted
 *  JSON array (id ascending, so the client's windows are contiguous keyset
 *  ranges). Separate columns, never one giant row — each value rides its own
 *  small TEXT cell. */
function inlineHeadSql(): string {
  return `${inlineStoreCteSql()}
SELECT json_quote(?) AS page_key_json,
  (
    SELECT json_group_array(json_object(
      'card_id', r.card_id, 'setting_code', r.setting_code,
      'candidate_key', r.candidate_key, 'candidate_id', r.candidate_id))
    FROM one_trip_page_rules r
    WHERE r.page_id = (SELECT id FROM cards WHERE "key" = ? AND trash = 0)
      AND r.card_id = r.page_id
  ) AS rule_candidates_json,
  (
    SELECT json_group_array(json_object(
      'search_card_id', s.search_card_id, 'position', s.position, 'card_id', s.card_id))
    FROM one_trip_search_results s
    WHERE s.search_card_id IN (
      SELECT m.id FROM members m
      JOIN one_trip_search_nests n ON n.search_card_id = m.id
    )
  ) AS search_results_json,
  (
    SELECT json_group_array(m2.id)
      FROM (SELECT m.id FROM members m ORDER BY m.id) m2
  ) AS member_ids_json`;
}

/** One keyset slice of card rows: the single-row statement's own DISTINCT
 *  join, windowed over ONE slice of the MATERIALIZED member id list (bound
 *  as one small JSON array; json_each expands it — a plain join against
 *  cards, no discovery). ORDER BY c.id keeps the single-row DISTINCT order
 *  (id ascending) inside each ascending window, so the client-side
 *  concatenation is byte-equal to the whole-set slice. Each result row is
 *  the SAME per-card json_object text the single-row aggregation embeds. */
function inlineCardsChunkSql(): string {
  return `SELECT json_object(
  'id', c.id, 'name', c.name, 'key', c."key", 'codename', c.codename,
  'left_id', c.left_id, 'right_id', c.right_id,
  'current_revision_id', c.current_revision_id,
  'created_at', c.created_at, 'updated_at', c.updated_at,
  'creator_id', c.creator_id, 'updater_id', c.updater_id,
  'read_rule_class', c.read_rule_class, 'read_rule_id', c.read_rule_id,
  'references_expired', c.references_expired, 'trash', c.trash,
  'type_id', c.type_id, 'db_content', c.db_content) AS card_json
  FROM (SELECT DISTINCT co.* FROM cards co
          JOIN (SELECT value AS id FROM json_each(?)) m ON m.id = co.id) c
 ORDER BY c.id`;
}

interface InlineHeadRow {
  page_key_json: string;
  rule_candidates_json: string | null;
  search_results_json: string | null;
  member_ids_json: string | null;
}

/** Fetch the page's whole working set INLINE (the materialized shape: the
 *  one_trip_* tables in this database, no ATTACH) and return the assembled
 *  bundle DOCUMENT TEXT — byte-equal to the single-row statement's document
 *  (pinned on the corpus). V2: discovery ONCE (the head materializes the
 *  member id list), then flat keyset slices over that list. */
export async function fetchPageBundleInlineRaw(
  driver: SQLDatabaseDriver,
  pageName: string,
): Promise<string> {
  const pageKey = DeckoName.parse(pageName).key;
  // four page-key placeholders: the walk seed, the members' page join, the
  // page_key field, the rule-candidate page join
  const head = await driver.query<InlineHeadRow>(inlineHeadSql(), [
    pageKey,
    pageKey,
    pageKey,
    pageKey,
  ]);
  const headRow = head.rows[0];
  if (headRow === undefined) {
    throw new Error(`one-trip inline fetch: no head row for page ${pageName}`);
  }
  // THE V2 KEYSET: the member id list is materialized exactly once (by the
  // head's own discovery CTE), sorted id-ascending server-side; each slice
  // binds one window of it — a flat indexed read, never a fresh closure walk.
  const memberIds: number[] = JSON.parse(headRow.member_ids_json ?? "[]") as number[];
  const cardJsons: string[] = [];
  for (let i = 0; i < memberIds.length; i += ONE_TRIP_INLINE_CARDS_PER_CHUNK) {
    const windowIds = memberIds.slice(i, i + ONE_TRIP_INLINE_CARDS_PER_CHUNK);
    const chunk = await driver.query<{ card_json: string }>(inlineCardsChunkSql(), [
      JSON.stringify(windowIds),
    ]);
    for (const row of chunk.rows) cardJsons.push(row.card_json);
  }
  // Byte surgery, not JSON re-serialization: every data byte below was
  // emitted by SQLite's own JSON functions (the head columns and the
  // per-card rows); the client contributes only the fixed punctuation and
  // field names, in the single-row document's field order.
  return `{"page_key":${headRow.page_key_json},"cards":[${cardJsons.join(",")}],"rule_candidates":${headRow.rule_candidates_json ?? "null"},"search_results":${headRow.search_results_json ?? "null"}}`;
}

/** Fetch the page's whole working set INLINE. Chunked on the wire (WALL 2),
 *  ATTACH-free (WALL 1); consumes the SAME document shape as the attached
 *  single-row fetch. */
export async function fetchPageBundleInline(
  driver: SQLDatabaseDriver,
  pageName: string,
): Promise<PageBundle> {
  return pageBundleFromDocument(await fetchPageBundleInlineRaw(driver, pageName), pageName);
}

/** The document → PageBundle mapping both fetch postures consume (the seat's
 *  input contract; the chunked inline path assembles the same document and
 *  shares this tail). */
function pageBundleFromDocument(raw: string, pageName: string): PageBundle {
  const doc = JSON.parse(raw) as BundleDocument;
  const pageKey = DeckoName.parse(pageName).key;
  const rows = (doc.cards ?? []).map((card) => card as CardsRow);
  const cardIds = rows.map((r) => r.id);
  const ruleCandidates: OneTripRuleCandidate[] = (doc.rule_candidates ?? []).map((r) => ({
    cardId: r.card_id,
    settingCode: r.setting_code,
    candidateKey: r.candidate_key,
    candidateId: r.candidate_id,
  }));
  return {
    pageKey: doc.page_key,
    pageId: rows.find((r) => r.key === pageKey)?.id ?? -1,
    rows,
    cardIds,
    ruleCandidates,
    searchResults: (doc.search_results ?? []).map((s) => ({
      searchCardId: s.search_card_id,
      position: s.position,
      cardId: s.card_id,
    })),
  };
}

/** Fetch the page's whole working set in EXACTLY ONE round trip. */
export async function fetchPageBundle(
  driver: SQLDatabaseDriver,
  pageName: string,
  attachName: string = DERIVED_STORE_ATTACH,
): Promise<PageBundle> {
  const pageKey = DeckoName.parse(pageName).key;
  // four page-key placeholders: the walk seed, the members' page join, the
  // page_key field, the rule-candidate page join
  const result = await driver.query<{ bundle: string }>(oneTripFetchSql(attachName), [
    pageKey,
    pageKey,
    pageKey,
    pageKey,
  ]);
  const raw = result.rows[0]?.bundle;
  if (raw === undefined || raw === null) {
    throw new Error(`one-trip fetch: no bundle for page ${pageName} (unknown key?)`);
  }
  return pageBundleFromDocument(raw, pageName);
}
