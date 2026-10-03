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
  const doc = JSON.parse(raw) as BundleDocument;
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
