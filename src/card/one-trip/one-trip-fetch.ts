// BUILD 2 of the one-trip precompute: THE ONE-TRIP FETCH.
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

import type { SQLDatabaseDriver, SQLStatement, SQLQueryResult } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { DeckoName } from "../name.js";
import { permissionGateCountJsonArm } from "../permissions/read-rules.js";
import type { PageBundle, OneTripRuleCandidate } from "./types.js";
import type { RenderPlan, RenderPlanEntry } from "./render-plan.js";
import { isPipelineAbleRenderStatement } from "./render-plan.js";
import { envValue } from "../debug-flags.js";

/** The ATTACH name the derived store rides under. Seam note: the fetch
 *  statement references the store through `${DERIVED_STORE_ATTACH}.` — an
 *  implementation that materializes the derived tables INTO the serving
 *  database (the production shape) drops the prefix and the ATTACH call;
 *  nothing else changes. */
export const DERIVED_STORE_ATTACH = "one_trip";

/** The DECKO_ONE_TRIP_STORE sentinel for the MATERIALIZED shape: the
 *  one_trip_* tables live IN the serving database (no side file exists to
 *  attach). This is the shape the serving DB requires — observed verbatim
 *  2026-10-05 (the corresponding port note MATERIALIZED-STORE §6.1): the
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

/** THE STORE-PLANS POSTURE FLAG (the retarget's live-fetch posture,
 *  2026-10-06): the stored render plans (one_trip_render_plans) are the DEMO
 *  STOP-GAP only — the deliverable is the live batched inclusion-tree query
 *  serving ALL pages with NO plan-table lookup in the critical path.
 *  Default = the demo posture (plans read, replayed, armed — every standing
 *  pin's subject unchanged); DECKO_ONE_TRIP_PLANS=0 selects the live
 *  posture: the head statement drops the plan column entirely, so a plan
 *  read is not merely skipped but ABSENT from the statement text — zero
 *  one_trip_render_plans reads on any page, by construction. The flag is
 *  read once per head build (the same per-seat cadence as the other DECKO_*
 *  gates). */
export function oneTripWantsStoredPlans(): boolean {
  return envValue("DECKO_ONE_TRIP_PLANS") !== "0";
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

/** The page's recorded render plan rides the head as one small JSON value
 *  (the render-plan replay): the plan rows live in one_trip_render_plans
 *  (written at store-build time by the recorder), read here in seq order.
 *  A typical page's plan is ~110-300 small entries — tens of KB — two
 *  orders of magnitude under the ~5 MB single-value wall (§6.3). */
export const ONE_TRIP_RENDER_PLAN_MAX_BYTES = 2_000_000;

/** The head statement: page key (as SQLite-emitted JSON text), the page's
 *  rule candidates and search results (small aggregates), the V2
 *  materialization of the page's WHOLE member id list as one small sorted
 *  JSON array (id ascending, so the client's windows are contiguous keyset
 *  ranges), and — the stamp-as-column change (2026-10-06, spec §c + §a.4) —
 *  two zero-bind GATE columns the render would otherwise pay live trips
 *  for:
 *
 *  `deck_data_version` — the deck's committed-write stamp, the freshness
 *  gate's per-render read. Read HERE it is current-at-read in the SAME
 *  statement as the payload (one snapshot: consistent by construction), so
 *  the gate consumes a column of a trip the render pays anyway — the
 *  stamp's round-trip cost drops 1 -> 0. The column is deliberately ALIASED
 *  (`v.version ... v.id`), NOT the gate statement's text: the freshness
 *  predicates (isFreshnessStampRead — recorder, classifier, router guard)
 *  must keep matching exactly the gate's own statement and nothing else
 *  ("one shape, one predicate", review pass 5). This fetch executes on the
 *  router's BASE connection, never through the armed plan.
 *
 *  `permission_gate_json` — read-rules.ts statement 3 (the hasReadRules /
 *  catchAll gate counters), a zero-bind one-off, executed as a CTE of the
 *  EXACT statement text and json-aggregated into one small cell (spec
 *  §a.4's "settings count" arm). The D3 floor's fifth trip — one batch
 *  carrying this count + the stamp, the two statements plans never absorb —
 *  drops 1 -> 0 with both columns consumed. Separate columns, never one
 *  giant row — each value rides its own small TEXT cell.
 *
 *  THE PLAN COLUMN IS POSTURE-CONDITIONAL (the live-fetch retarget,
 *  2026-10-06): `readPlans` (the demo stop-gap posture) adds the recorded
 *  render plan as one small JSON array read from one_trip_render_plans.
 *  The LIVE posture (oneTripWantsStoredPlans() === false) OMITS the column
 *  AND its page-key bind — the statement text carries no plan-table
 *  reference at all, so the live posture's zero-plan-reads property is
 *  structural (pinned by tests/card/one-trip/live-fetch-all-pages.test.ts),
 *  not a runtime skip. */
function inlineHeadSql(readPlans: boolean): string {
  const planColumn = readPlans
    ? `,
  (
    SELECT json_group_array(json_object('sql', t.sql, 'params', t.params_json))
      FROM (SELECT sql, params_json FROM one_trip_render_plans
             WHERE page_id = (SELECT id FROM cards WHERE "key" = ? AND trash = 0)
             ORDER BY seq) t
  ) AS plan_json`
    : "";
  return `${inlineStoreCteSql()}
SELECT json_quote(?) AS page_key_json,
  (
    SELECT v.version
      FROM deck_data_version v
     WHERE v.id = 1
  ) AS deck_data_version,
  ${permissionGateCountJsonArm()} AS permission_gate_json,
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
  ) AS search_results_json${planColumn},
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
  /** The freshness stamp (deck_data_version), read live in this statement —
   *  null only when the row itself is absent (the render entry's gate then
   *  throws loudly, the freshness convention). */
  deck_data_version: number | null;
  /** The permission gate-count row, json-aggregated by the arm: a
   *  one-element array string like '[{"c":12,"catchAll":1}]'. */
  permission_gate_json: string | null;
  rule_candidates_json: string | null;
  search_results_json: string | null;
  /** Present ONLY in the demo stop-gap posture (oneTripWantsStoredPlans);
   *  the live posture's statement carries no plan column at all. */
  plan_json?: string | null;
  member_ids_json: string | null;
}

/** The head statement's gate columns, parsed. The seat's freshness +
 *  permission consumers read these INSTEAD of issuing the stamp read and
 *  the gate-count statement as trips of their own (the stamp-as-column change). */
export interface InlineHeadGateMeta {
  /** deck_data_version as of this statement's snapshot; undefined only when
   *  the stamp row is missing (the consumer falls back to the loud live
   *  read). */
  deckDataVersion: number | undefined;
  /** The gate-count statement's rows, parsed back into the exact shape the
   *  batch result would have carried ({ c, catchAll }). */
  permissionGateRows: SQLQueryResult | undefined;
}

/** The page's recorded render plan, parsed from the head's plan_json cell
 *  (one json_object per recorded statement: sql + params as JSON text).
 *  Entries whose params are not JSON-round-trippable are dropped (the
 *  plan never guesses a bind it cannot reproduce exactly); a missing or
 *  oversized cell means NO plan (the render runs its live residue). */
export function renderPlanFromHeadCell(
  planJson: string | null,
  pageKey: string,
): RenderPlan | undefined {
  if (planJson === null || planJson === "") return undefined;
  if (planJson.length > ONE_TRIP_RENDER_PLAN_MAX_BYTES) return undefined;
  let raw: { sql: string; params: string }[];
  try {
    raw = JSON.parse(planJson) as { sql: string; params: string }[];
  } catch {
    return undefined;
  }
  if (!Array.isArray(raw)) return undefined;
  const entries: RenderPlanEntry[] = [];
  for (const item of raw) {
    if (typeof item?.sql !== "string" || typeof item?.params !== "string") continue;
    if (!isPipelineAbleRenderStatement(item.sql)) continue;
    let params: unknown[];
    try {
      const parsed = JSON.parse(item.params) as unknown;
      if (!Array.isArray(parsed)) continue;
      params = parsed;
    } catch {
      continue;
    }
    entries.push({ sql: item.sql, params });
  }
  // An EMPTY plan is NO plan (json_group_array returns '[]' over zero rows):
  // stores built before the recorder carry no entries, and the serve path
  // must treat them exactly like plan-less stores (renderPlan undefined —
  // the bundle-shape pins compare attached vs inline bundles directly).
  if (entries.length === 0) return undefined;
  return { pageKey, recordedAt: "", entries };
}

/** Fetch the page's whole working set INLINE (the materialized shape: the
 *  one_trip_* tables in this database, no ATTACH) and return the assembled
 *  bundle DOCUMENT TEXT plus the page's recorded render plan (read from the
 *  same head statement — one round trip carries both; renderplan-replay
 *  ). Byte-equal to the single-row statement's document (pinned on the
 *  corpus). V2: discovery ONCE (the head materializes the member id list),
 *  then flat keyset slices over that list. V3: the whole seat rides the
 *  MINIMUM wire round trips on the hrana pipeline transport — 1 head query
 *  + ONE batch POST carrying every slice (the v2 seat measured 37
 *  SEQUENTIAL round trips at ~333 ms each ≈ 13.8 s on the ~300 ms-RTT
 *  serving class — wire RTT, not compute; the driver's batch() is ONE
 *  pipeline POST, BunnyDbDriver.batch → attemptPipeline). The batch is a
 *  transport change only: same slice SQL, same binds, results consumed in
 *  statement order, so the assembled document is byte-identical to the v2
 *  sequential fetch's (pinned). */
export async function fetchPageBundleInlineParts(
  driver: SQLDatabaseDriver,
  pageName: string,
): Promise<{ raw: string; plan: RenderPlan | undefined; gateMeta: InlineHeadGateMeta }> {
  const pageKey = DeckoName.parse(pageName).key;
  // THE POSTURE: stored plans are the demo stop-gap; the live posture's
  // head statement omits the plan column and its bind entirely.
  const readPlans = oneTripWantsStoredPlans();
  // page-key placeholders: the walk seed, the members' page join, the
  // page_key field, the rule-candidate page join — plus the plan's page
  // join in the demo stop-gap posture only.
  const headBinds = readPlans
    ? [pageKey, pageKey, pageKey, pageKey, pageKey]
    : [pageKey, pageKey, pageKey, pageKey];
  const head = await driver.query<InlineHeadRow>(inlineHeadSql(readPlans), headBinds);
  const headRow = head.rows[0];
  if (headRow === undefined) {
    throw new Error(`one-trip inline fetch: no head row for page ${pageName}`);
  }
  const plan = readPlans ? renderPlanFromHeadCell(headRow.plan_json ?? null, pageKey) : undefined;
  // THE GATE COLUMNS (the stamp-as-column change): parsed here, beside the plan —
  // one statement carried the payload, the stamp, and the gate count.
  const rawVersion = headRow.deck_data_version;
  const gateMeta: InlineHeadGateMeta = {
    deckDataVersion:
      typeof rawVersion === "number" && Number.isFinite(rawVersion) ? rawVersion : undefined,
    permissionGateRows: parsePermissionGateRows(headRow.permission_gate_json),
  };
  // THE V2 KEYSET: the member id list is materialized exactly once (by the
  // head's own discovery CTE), sorted id-ascending server-side; each slice
  // binds one window of it — a flat indexed read, never a fresh closure walk.
  // THE V3 TRANSPORT: every window's statement rides ONE driver.batch() call
  // — one pipeline POST, one wire round trip for all slices. (The head cannot
  // join the same batch: the slice windows are derived from ITS result, and
  // batch binds are fixed before any result exists — hence the 2-trip floor.)
  const memberIds: number[] = JSON.parse(headRow.member_ids_json ?? "[]") as number[];
  const sliceStatements: SQLStatement[] = [];
  for (let i = 0; i < memberIds.length; i += ONE_TRIP_INLINE_CARDS_PER_CHUNK) {
    const windowIds = memberIds.slice(i, i + ONE_TRIP_INLINE_CARDS_PER_CHUNK);
    sliceStatements.push({ sql: inlineCardsChunkSql(), params: [JSON.stringify(windowIds)] });
  }
  const cardJsons: string[] = [];
  if (sliceStatements.length > 0) {
    const slices = await driver.batch(sliceStatements);
    // Results align 1:1 with the statements in order — the same row order
    // the v2 sequential loop produced.
    for (const chunk of slices) {
      for (const row of chunk.rows as { card_json: string }[]) {
        cardJsons.push(row.card_json);
      }
    }
  }
  // Byte surgery, not JSON re-serialization: every data byte below was
  // emitted by SQLite's own JSON functions (the head columns and the
  // per-card rows); the client contributes only the fixed punctuation and
  // field names, in the single-row document's field order.
  const raw = `{"page_key":${headRow.page_key_json},"cards":[${cardJsons.join(",")}],"rule_candidates":${headRow.rule_candidates_json ?? "null"},"search_results":${headRow.search_results_json ?? "null"}}`;
  return { raw, plan, gateMeta };
}

/** Parse the gate-count arm's cell back into the exact result shape the
 *  batch statement would have produced. A NULL cell (json_group_array over
 *  an empty CTE cannot happen — COUNT(*) always yields one row — so this
 *  names only a malformed/mismatched store) yields undefined: the consumer
 *  falls back to issuing the statement, never to guessing a gate value. */
function parsePermissionGateRows(cell: string | null): SQLQueryResult | undefined {
  if (cell === null || cell === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cell) as unknown;
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const rows: Record<string, unknown>[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec["c"] !== "number" || typeof rec["catchAll"] !== "number") continue;
    rows.push({ c: rec["c"], catchAll: rec["catchAll"] });
  }
  return { rows, rowsAffected: 0 };
}

/** The assembled bundle DOCUMENT TEXT alone — the byte-equality pin's
 *  established signature (inline-chunked-fetch.test.ts). */
export async function fetchPageBundleInlineRaw(
  driver: SQLDatabaseDriver,
  pageName: string,
): Promise<string> {
  return (await fetchPageBundleInlineParts(driver, pageName)).raw;
}

/** The assembled bundle DOCUMENT from already-fetched parts (the seat's
 *  entry point: it needs the gate meta alongside the bundle, so it calls
 *  fetchPageBundleInlineParts once and assembles here — a second fetch
 *  would be a second head trip). */
export function inlineBundleFromParts(
  raw: string,
  pageName: string,
  plan: RenderPlan | undefined,
): PageBundle {
  const bundle = pageBundleFromDocument(raw, pageName);
  if (plan !== undefined) {
    plan.pageKey = bundle.pageKey;
    bundle.renderPlan = plan;
  }
  return bundle;
}

/** Fetch the page's whole working set INLINE. Chunked on the wire (WALL 2),
 *  ATTACH-free (WALL 1); consumes the SAME document shape as the attached
 *  single-row fetch, plus the page's recorded render plan (renderplan-replay
 *  $1 the gate replays it as ONE batch and arms the driver seam). */
export async function fetchPageBundleInline(
  driver: SQLDatabaseDriver,
  pageName: string,
): Promise<PageBundle> {
  const { raw, plan } = await fetchPageBundleInlineParts(driver, pageName);
  return inlineBundleFromParts(raw, pageName, plan);
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
