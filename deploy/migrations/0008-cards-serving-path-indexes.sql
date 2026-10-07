-- ============================================================================
-- 0008-cards-serving-path-indexes.sql — ADDITIVE backfill migration.
--
-- WHY IT EXISTS: databases provisioned before db/schema.sqlite.sql gained the
-- serving-path indexes (and retired cards_trash_index) are brought to the
-- canonical index set by this file. Fresh databases already match it from
-- 0001-schema.sql; IF NOT EXISTS / IF EXISTS keep it safe to apply anywhere,
-- in any order after 0001.
--
-- MECHANISM (full note in db/schema.sqlite.sql, cards index block): without
-- planner statistics (Bunny Database rejects ANALYZE) SQLite picks
-- cards_trash_index for every " AND trash = 0" predicate and reads the whole
-- live deck. "trash" holds two values, so that index never narrows a search;
-- it is dropped. The (col, trash) indexes serve name lookups, the read-rule
-- join and setting lookups; the partial index serves "codename IS NOT NULL";
-- the expression index serves the permission-rule resolver's prefilter.
--
-- Changes index entries only. No card row is read-modified or written.
-- Reversible: CREATE INDEX "cards_trash_index" ON "cards" ("trash");
-- ============================================================================

CREATE INDEX IF NOT EXISTS "cards_name_trash_index"       ON "cards" ("name", "trash");
CREATE INDEX IF NOT EXISTS "cards_right_id_trash_index"   ON "cards" ("right_id", "trash");
CREATE INDEX IF NOT EXISTS "cards_codename_present_index" ON "cards" ("codename", "id", "name", "left_id", "right_id") WHERE "codename" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cards_key_last_char_index"    ON "cards" (substr("key", -1));
DROP INDEX IF EXISTS "cards_trash_index";
