-- ============================================================================
-- 0008-cards-serving-path-indexes.sql — ADDITIVE backfill migration.
--
-- WHY IT EXISTS: databases provisioned before db/schema.sqlite.sql gained the
-- serving-path indexes get them from this file. Fresh databases already have
-- them from 0001-schema.sql; IF NOT EXISTS keeps this file safe to apply
-- anywhere, in any order after 0001.
--
-- MECHANISM (full note in db/schema.sqlite.sql, cards index block): without
-- planner statistics (Bunny Database rejects ANALYZE) SQLite reads every
-- live card through cards_trash_index for name lookups, the read-rule join
-- and setting lookups. A (col, trash) index wins under the no-statistics
-- cost model; the partial index serves "codename IS NOT NULL"; the
-- expression index serves the permission-rule resolver's prefilter.
--
-- Creates index entries only. No card row is read-modified or written.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "cards_name_trash_index"       ON "cards" ("name", "trash");
CREATE INDEX IF NOT EXISTS "cards_right_id_trash_index"   ON "cards" ("right_id", "trash");
CREATE INDEX IF NOT EXISTS "cards_codename_present_index" ON "cards" ("codename", "id", "name", "left_id", "right_id") WHERE "codename" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cards_key_last_char_index"    ON "cards" (substr("key", -1));
