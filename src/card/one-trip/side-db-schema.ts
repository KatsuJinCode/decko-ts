// The derived store's DDL (SPEC data model, SQLite dialect here — seam 1 of
// types.ts). Lives in its own file so the schema is reviewable against the
// portability spec without reading any algorithm code.
//
// EVERY table name carries the one_trip_ prefix: the store may be ATTACHed
// to a corpus connection, and prefixed names can never collide with corpus
// tables. The store contains ONLY derived data (SPEC A2 rule: derived
// caches are read-scope for the serving path and write-scope for the
// builder/invalidation path — never a truth source).

export const ONE_TRIP_SIDE_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS one_trip_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS one_trip_edges (
     referer_id INTEGER NOT NULL,
     referee_key TEXT NOT NULL,
     referee_id INTEGER,
     kind TEXT NOT NULL,
     ref_view TEXT,
     PRIMARY KEY (referer_id, referee_key, kind)
   )`,
  `CREATE INDEX IF NOT EXISTS one_trip_edges_referee_id
     ON one_trip_edges(referee_id)`,
  `CREATE INDEX IF NOT EXISTS one_trip_edges_referee_key
     ON one_trip_edges(referee_key)`,
  `CREATE TABLE IF NOT EXISTS one_trip_page_closure (
     page_id INTEGER NOT NULL,
     card_id INTEGER NOT NULL,
     depth INTEGER NOT NULL,
     views TEXT NOT NULL DEFAULT '[]',
     PRIMARY KEY (page_id, card_id)
   )`,
  `CREATE INDEX IF NOT EXISTS one_trip_page_closure_card
     ON one_trip_page_closure(card_id)`,
  `CREATE TABLE IF NOT EXISTS one_trip_search_nests (
     search_card_id INTEGER PRIMARY KEY,
     cql_text TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS one_trip_search_results (
     search_card_id INTEGER NOT NULL,
     position INTEGER NOT NULL,
     card_id INTEGER NOT NULL,
     PRIMARY KEY (search_card_id, position)
   )`,
  `CREATE INDEX IF NOT EXISTS one_trip_search_results_card
     ON one_trip_search_results(card_id)`,
  `CREATE TABLE IF NOT EXISTS one_trip_page_rules (
     page_id INTEGER NOT NULL,
     card_id INTEGER NOT NULL,
     setting_code TEXT NOT NULL,
     candidate_key TEXT NOT NULL,
     candidate_id INTEGER,
     PRIMARY KEY (page_id, card_id, setting_code, candidate_key)
   )`,
  `CREATE TABLE IF NOT EXISTS one_trip_render_plans (
     page_id INTEGER NOT NULL,
     seq INTEGER NOT NULL,
     family TEXT NOT NULL,
     sql TEXT NOT NULL,
     params_json TEXT NOT NULL,
     PRIMARY KEY (page_id, seq)
   )`,
];

// THE PLAN-INVALIDATION TRIGGERS (plan-invalidation lane, 2026-10-05).
//
// A recorded render plan is a TRANSCRIPT of the statements one page's cold
// render issued, captured at store-build time; the serve path replays it and
// answers every matching read from the recorded result set with zero round
// trips (one-trip-fetch.ts:264-269, render-gate.ts:135-139). The plan is
// therefore true only as of the moment it was recorded. Without a binding
// from a content write to a plan's death, an edit to an included card left
// the page replaying a transcript of the PRE-WRITE world at full speed.
//
// WHY TRIGGERS AND NOT AN APPLICATION CALL. The same argument the freshness
// lane made for deck_data_version (d19ec179): a committed write is
// authoritative regardless of which stream, process or connection issued it.
// There is no application write path to hook — invalidation.ts has no
// production caller — so an application-level drop would be a mechanism that
// never fires. These triggers are SEPARATE from that lane's (distinct names,
// same tables); SQLite runs every matching AFTER trigger, so the two
// mechanisms coexist and compose rather than displace one another.
//
// WHY DELETE RATHER THAN RE-RECORD. Re-recording is correct but expensive: the
// recorder renders each page once through the whole engine in the exact
// serving posture, and the L2 lane measured 896,269 ms for 38 pages
// (~23.6 s/page) against the serving database. A write reaching N pages would
// block for N x 23.6 s. Deleting instead returns the page to the ladder,
// which is the PRE-PLAN posture — byte-identical output, more round trips
// (l2-plan-recording-lane.md §4.2). The cost of this mechanism is trips,
// never bytes.
//
// WHY THE SECOND CLAUSE (the conservative one). The drop is NOT closure-only.
// 38 of the 45 plan-bearing pages were recorded for pages the store never
// materialized: the plan lookup is keyed by CARD ID, not by store membership
// (l2-plan-recording-lane.md §1), so such a page carries a plan with NO
// one_trip_page_closure row. No reverse-closure query can name it, so a
// closure-only drop would leave the majority of the corpus stale forever,
// silently. A page that CARRIES A PLAN but has NO CLOSURE ROW cannot be
// proven unaffected by any write, so it is dropped too. Over-invalidation is
// the correct bias: it costs trips, and the alternative is stale bytes.
//
// INSTALLATION ORDER. These must be applied to a database that holds BOTH
// `cards` and `one_trip_render_plans` — the INLINE materialized store
// (DECKO_ONE_TRIP_STORE=inline), the only posture plans are served from. A
// trigger cannot be created against a missing table, and firing against a
// missing table throws, so this DDL is deliberately NOT part of
// ONE_TRIP_SIDE_DDL: that array is also applied to the ATTACHED side store,
// which has no `cards` table.
export const ONE_TRIP_PLAN_INVALIDATION_TRIGGER_DDL: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS cards_drop_render_plans_upd AFTER UPDATE ON cards BEGIN
     DELETE FROM one_trip_render_plans
      WHERE page_id IN (SELECT page_id FROM one_trip_page_closure WHERE card_id = NEW.id)
         OR page_id NOT IN (SELECT page_id FROM one_trip_page_closure);
   END`,
  `CREATE TRIGGER IF NOT EXISTS cards_drop_render_plans_del AFTER DELETE ON cards BEGIN
     DELETE FROM one_trip_render_plans
      WHERE page_id IN (SELECT page_id FROM one_trip_page_closure WHERE card_id = OLD.id)
         OR page_id NOT IN (SELECT page_id FROM one_trip_page_closure);
   END`,
  // A reference write changes WHICH cards a referer reaches, so the affected
  // page set is keyed on the REFERER (the page whose closure just changed),
  // not the referee.
  `CREATE TRIGGER IF NOT EXISTS card_references_drop_render_plans_ins AFTER INSERT ON card_references BEGIN
     DELETE FROM one_trip_render_plans
      WHERE page_id IN (SELECT page_id FROM one_trip_page_closure WHERE card_id = NEW.referer_id)
         OR page_id NOT IN (SELECT page_id FROM one_trip_page_closure);
   END`,
  `CREATE TRIGGER IF NOT EXISTS card_references_drop_render_plans_del AFTER DELETE ON card_references BEGIN
     DELETE FROM one_trip_render_plans
      WHERE page_id IN (SELECT page_id FROM one_trip_page_closure WHERE card_id = OLD.referer_id)
         OR page_id NOT IN (SELECT page_id FROM one_trip_page_closure);
   END`,
  `CREATE TRIGGER IF NOT EXISTS card_references_drop_render_plans_upd AFTER UPDATE ON card_references BEGIN
     DELETE FROM one_trip_render_plans
      WHERE page_id IN (SELECT page_id FROM one_trip_page_closure WHERE card_id = OLD.referer_id)
         OR page_id NOT IN (SELECT page_id FROM one_trip_page_closure);
   END`,
];
