// BUILD 3 of the one-trip lane: THE RENDER-PLAN RESIDUE — record and replay.
//
// The closure cannot know everything the render asks (SPEC §"residue"):
// search executions, engine boot folds, context-relative nests, view-time
// settings the rule lattice resolves at view time. The AutoFetch/Ebean and
// Calvin reconnaissance pattern (research verdict §1.5) is the answer:
// RECORD what a cold render actually asked, REPLAY it as one batch.
//
// This module carries the two halves as data + one pure classifier:
//
//   - classifyResidueStatement(sql): every statement the render issues
//     after the one-trip payload lands must map to a NAMED residue class —
//     the class registry below is the lane's accounting of WHY each
//     remaining trip exists and why the payload cannot cover it. An
//     unclassifiable statement is a BUG in the registry (the acceptance
//     test fails on it), never a silent cost.
//   - recordRenderPlan / replayRenderPlan: the record-and-replay plan
//     shape (design + pins per the mission; the render-path integration is
//     the NEXT lane after fold-10). A recorded plan is the page's access
//     set in call order; a replay executes it as ONE driver.batch.

import type { SQLDatabaseDriver, SQLStatement } from "../../server/driver.js";

/** The NAMED residue classes. Every class names WHO issues the statement
 *  and WHY the payload cannot cover it. This registry is the honest cost
 *  accounting the hops law wants: not "zero", "named". The shapes are the
 *  MEASURED ones (this lane's capture on the 5 probe pages); an unknown
 *  shape is a registry bug (the acceptance test fails on it), never a
 *  silent cost. */
export const RESIDUE_CLASSES: ReadonlyMap<string, string> = new Map([
  [
    "engine-boot-codenames",
    "The codename registry's one-time load (two loaders exist — the registry's and the admin runtime's) plus the session-actor codename probe (codename IN ('anyone',...)); engine boot, not per-page state.",
  ],
  [
    "engine-fold-type-names",
    "The structure machinery's type-name fold (SELECT DISTINCT c.type_id, t.name ...) — engine-level state loaded once per engine, not page-dependent row data.",
  ],
  [
    "engine-fold-head-reads",
    "The head read-set fold (HEAD_READ_SET_KEYS IN-list re-read once per engine) — the payload pre-seats those cards; the fold's own statement still runs cold-once per engine (headReadsCold gate).",
  ],
  [
    "lexicon-id-to-name",
    "The lexicon's id→name db fallback for ids outside the payload (dangling junction sides et al.) — the durable-map/plan-priming class.",
  ],
  [
    "lexicon-key-to-id",
    "The lexicon's key→id db fallback (nameToLex miss) — same priming class as lexicon-id-to-name.",
  ],
  [
    "engine-boot-dangling-canonical",
    "The dangling-side canonical map (engine-lifetime memoized deck statement; search-result collision class bookkeeping).",
  ],
  [
    "closure-prefetch-batch",
    "The render's own prefetch batches (prelude folds, side priming, rule anchors, permission/codename/structure folds; key IN-lists and pair joins) — engine-level state issued per cold render; the payload's seeded cache empties their ROUNDS, not the batch itself.",
  ],
  [
    "point-row-by-key",
    "A simple-name point read that missed the payload's cache (simple-name misses consult `cards` by key directly — retrieve.ts — so no lexicon negative can stop them; rule candidates whose card does not exist are the bulk).",
  ],
  [
    "point-row-by-id",
    "An id point read that missed the payload's cache (enrichment ladders, lattice follow-on reads for cards outside the payload).",
  ],
  [
    "pair-exists-probe",
    "The (left_id, right_id) junction existence probe (retrieve's compound-name path); negative knowledge for compound names is seated by the replay plan's lexicon priming.",
  ],
  [
    "reached-rules-cte",
    "The engine's own permission/rule walk (WITH RECURSIVE reached/anc/name_walk) — reads the rule lattice directly from SQL in ONE statement; the payload never carries lattice rows (measured: any transitive lattice walk reaches the whole deck).",
  ],
  [
    "template-link-id-read",
    "The template-link prepare sweep's junction reads by id (SELECT id, db_content FROM cards WHERE id IN ...) — structure/template machinery follow-ons.",
  ],
  [
    "search-cql",
    "The search nest's live CQL execution — irreducible without render-path integration (runSearch always executes); the write-time posture's materialized rows pre-seat the RESULT cards, not the execution.",
  ],
  [
    "search-count",
    "The search paging count query (runs when the result window fills its limit) — same irreducibility class as search-cql.",
  ],
  [
    "search-result-chunked-read",
    "The search results' transport-chunked row read (SELECT c.* ... id IN (...) batches) — runSearch re-reads unconditionally (no cache short-circuit) so the payload cannot remove it without render-path integration.",
  ],
  [
    "layout-warmup",
    "The page layout warm-up's reference chase — a fixed class the payload's layout-connected closure mostly covers; residual rounds are named here.",
  ],
]);

/** THE FRESHNESS-STAMP READ SHAPE (per-viewer-seat lane, 2026-10-06): the
 *  render entry's per-request invalidation probe (src/card/render.ts
 *  DECK_DATA_VERSION_STATEMENT). One shape, one predicate — the recorder
 *  filter (isPipelineAbleRenderStatement), the residue classifier below,
 *  and the replay router's never-serve guard (replay-plan-router.ts) all
 *  test THIS predicate, so the property "plans never absorb the freshness
 *  stamp read" (acfb1977's exclusion, ported here) holds in every posture
 *  a plan can reach the router from: recorded, store-built, seeded, legacy. */
export function isFreshnessStampRead(sql: string): boolean {
  return /SELECT "version" FROM "deck_data_version" WHERE "id" = 1/i.test(sql);
}

/** Classify one statement's SQL text into a residue class, or undefined
 *  when the registry does not know it (a registry bug — tests fail). */
export function classifyResidueStatement(sql: string): string | undefined {
  // [ENGINE-FRESHNESS] the render entry's per-request stamp read — the
  // one-statement freshness gate (src/card/render.ts
  // DECK_DATA_VERSION_STATEMENT). A named, bounded class: exactly ONE per
  // render, before any deck work.
  if (isFreshnessStampRead(sql)) {
    return "freshness-stamp";
  }
  if (/codename IS NOT NULL/i.test(sql) || /codename IN \('anyone'/i.test(sql)) {
    return "engine-boot-codenames";
  }
  if (/rules\.id AS ruleId/i.test(sql)) return "reached-rules-cte";
  if (/left_id IS NOT NULL AND \(NOT EXISTS/i.test(sql)) return "engine-boot-dangling-canonical";
  if (/WITH RECURSIVE (reached|anc|name_walk)/i.test(sql)) return "reached-rules-cte";
  if (/SELECT DISTINCT c\.type_id AS type_id/i.test(sql)) return "engine-fold-type-names";
  if (/SELECT \* FROM cards WHERE key IN \(/i.test(sql)) return "engine-fold-head-reads";
  if (/SELECT name, left_id, right_id FROM cards WHERE id = \? LIMIT 1/i.test(sql)) {
    return "lexicon-id-to-name";
  }
  if (/SELECT id FROM cards WHERE key = \? AND trash = 0 LIMIT 1/i.test(sql)) {
    return "lexicon-key-to-id";
  }
  if (/SELECT c\.\* FROM cards c WHERE c\.trash = 0 AND c\.id IN \(/i.test(sql)) {
    return "search-result-chunked-read";
  }
  if (/SELECT id, db_content FROM cards WHERE id IN \(/i.test(sql)) return "template-link-id-read";
  if (/SELECT id FROM cards WHERE left_id = \? AND right_id = \?/i.test(sql)) {
    return "pair-exists-probe";
  }
  if (/SELECT \* FROM cards WHERE key = \? AND trash = 0 LIMIT 1/i.test(sql)) {
    return "point-row-by-key";
  }
  if (/SELECT \* FROM cards WHERE id = \?( AND trash = 0)?( LIMIT 1)?$/i.test(sql.trim())) {
    return "point-row-by-id";
  }
  if (
    /JOIN cards (l|r|s) ON/i.test(sql) ||
    /j\.left_id = \? AND j\.right_id = \?/i.test(sql) ||
    /COLLATE NOCASE IN \(/i.test(sql) ||
    /WHERE id IN \(/i.test(sql) ||
    /read_rule/i.test(sql)
  ) {
    return "closure-prefetch-batch";
  }
  if (/search/i.test(sql) || /json_group_array/i.test(sql)) return "search-cql";
  if (/COUNT\(\*\)/i.test(sql)) return "search-count";
  return undefined;
}

// ---------------------------------------------------------------------------
// The pipeline-able family filter (the plan's membership rule)
// ---------------------------------------------------------------------------

/** The residue classes a replay plan must NOT carry: their rows depend on
 *  where the render's OWN execution has gotten to (the search window's
 *  fill state), not on the deck alone — replaying them ahead of time could
 *  answer a trip the live sequence would have asked differently. Every
 *  other named class is pure key-value over the deck (the census's
 *  batchability verdict) and pipelines with no semantic change. */
const ORDER_DEPENDENT_CLASSES: ReadonlySet<string> = new Set(["search-count", "search-cql"]);

/** Whether one statement belongs in a recorded render plan: a read-only
 *  corpus statement (SELECT/WITH — never a write or ATTACH/DETACH) in a
 *  NAMED residue class that is not order-dependent, excluding the seat's
 *  own one_trip_* reads. The census's one registry gap (the simple-name
 *  point read, point-row-by-name — 0 observed on the probe set) is named
 *  here so a deck that does exercise it still pipelines. An UNKNOWN
 *  statement shape stays OUT of the plan (it keeps its ordinary live
 *  trip) — the plan never silently absorbs an unclassified cost. */
export function isPipelineAbleRenderStatement(sql: string): boolean {
  const t = sql.trim();
  if (!/^SELECT\b/i.test(t) && !/^WITH\b/i.test(t)) return false;
  if (/one_trip_/i.test(t)) return false;
  const family = classifyResidueStatement(sql);
  if (family === undefined) {
    return /^SELECT id FROM cards WHERE name = \? AND trash = 0 LIMIT 1$/i.test(t);
  }
  // THE FRESHNESS-STAMP EXCLUSION (per-viewer-seat lane, 2026-10-06): the
  // stamp read IS the render's invalidation probe — its result must be
  // current-at-read, never replayed. A plan that carries it arms the
  // replay router with the recording-time version, and the freshness gate
  // (render.ts's stamp read, which flows through the armed router) then
  // answers from that stale row on EVERY subsequent render: no move is
  // ever detected, the caches are never reset, and the armed map serves
  // pre-edit rows indefinitely (measured: bump the storage stamp under an
  // armed engine and the gate reads the recorded version back — zero live
  // stamp reads, no reset, no re-seat, 397 live trips on the next render).
  // Excluded here, the stamp read stays a live statement — the freshness
  // gate's designed one-statement cost — and a moved stamp actually fires.
  // One shape, one predicate: the router's never-serve guard tests the
  // same isFreshnessStampRead this exclusion names.
  if (isFreshnessStampRead(sql)) return false;
  return !ORDER_DEPENDENT_CLASSES.has(family);
}

// ---------------------------------------------------------------------------
// The record-and-replay plan (SPEC: the AutoFetch/Calvin shape)
// ---------------------------------------------------------------------------

/** One recorded access: the statement text and its parameters, in call
 *  order. A plan is the page's access SET (deduped, order kept) — replaying
 *  it seats everything the previous cold render asked. */
export interface RenderPlanEntry {
  sql: string;
  params: unknown[];
}

export interface RenderPlan {
  pageKey: string;
  recordedAt: string;
  entries: RenderPlanEntry[];
}

/** Record a render plan from a captured statement list (the reconnaissance
 *  pass — the trip log the byte-identity harness already produces). */
export function recordRenderPlan(
  pageKey: string,
  statements: { sql: string; params: unknown[] }[],
): RenderPlan {
  const seen = new Set<string>();
  const entries: RenderPlanEntry[] = [];
  for (const stmt of statements) {
    const key = `${stmt.sql}::${JSON.stringify(stmt.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ sql: stmt.sql, params: stmt.params });
  }
  return { pageKey, recordedAt: new Date().toISOString(), entries };
}

/** Replay a recorded plan as ONE batched round trip (the AutoFetch
 *  injection shape: the plan's statements ride one driver.batch; chunking
 *  to a driver's per-statement parameter ceiling is the driver's batch
 *  concern, not the plan's). Returns the driver's results in plan order. */
export async function replayRenderPlan(
  driver: SQLDatabaseDriver,
  plan: RenderPlan,
): Promise<unknown[]> {
  const statements: SQLStatement[] = plan.entries.map((entry) => ({
    sql: entry.sql,
    params: entry.params,
  }));
  const results = await driver.batch(statements);
  return results;
}
