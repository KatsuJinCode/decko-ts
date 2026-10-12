-- ============================================================================
-- 0002-card-text-binary-lookup-indexes.sql — ADDITIVE backfill migration.
--
-- WHY IT EXISTS: deploy/migrations/0001-schema.sql was already applied to the
-- provisioned D1 databases (demo + scale-test) BEFORE db/schema.sqlite.sql
-- gained the BINARY-collation lookup indexes. Wrangler never re-runs an
-- applied migration, so already-provisioned databases get the two indexes
-- from THIS file instead. Fresh databases do not need it (0001 already
-- creates both; the IF NOT EXISTS keeps this file order-safe everywhere).
--
-- MECHANISM (full diagnosis in db/schema.sqlite.sql, cards index block):
-- the engine's key/codename lookups compare BINARY, which cannot seek the
-- NOCASE-sorted cards_key_index/cards_codename_index; the no-stats planner
-- then probes cards_trash_index (trash=0), matching the entire live deck —
-- measured as a 2,279-row read per point lookup on the scale deck.
--
-- PAIR WITH ANALYZE: run `ANALYZE;` AFTER the seed (and after applying this
-- file to a populated database). Without planner stats SQLite still probes
-- cards_trash_index for every " AND trash = 0" predicate; measured locally,
-- indexes alone cut the point-render read estimate 15,955 -> 13,677, and
-- indexes + ANALYZE cut it to 4,561.
--
-- WRITE COST: each CREATE INDEX writes one index entry per cards row
-- (~row count of the deck, one-time). Ongoing inserts write 2 extra index
-- entries per card row. Measured at full-deck scale in
-- tools/cf-cost/measure-render-reads.test.ts (backfill section).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "cards_key_binary_index"      ON "cards" ("key");
CREATE UNIQUE INDEX IF NOT EXISTS "cards_codename_binary_index" ON "cards" ("codename");
