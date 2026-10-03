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
];
