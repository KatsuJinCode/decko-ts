-- ============================================================================
-- 0007-deck-data-version-stamp.sql — ADDITIVE backfill migration.
--
-- WHY IT EXISTS: deploy/migrations/0001-schema.sql was already applied to
-- already-provisioned databases (the deployed edge database among them)
-- BEFORE db/schema.sqlite.sql gained the [ENGINE-FRESHNESS] block. A
-- provisioned database without the deck_data_version stamp table fails the
-- render path LOUDLY by design (src/card/render.ts readDeckDataVersion /
-- parseDeckDataVersion throw when the stamp is unreadable — a silently
-- skipped freshness check would be a silent staleness window). This file
-- brings provisioned databases up to the stamp schema; fresh databases do
-- not need it (0001 already creates everything; the IF NOT EXISTS /
-- INSERT OR IGNORE keeps this file order-safe everywhere).
--
-- WHAT IT CREATES (verbatim semantics from db/schema.sqlite.sql
-- [ENGINE-FRESHNESS]):
--   deck_data_version — ONE row (id = 1, version), the committed-write
--   stamp, plus six AFTER INSERT/UPDATE/DELETE triggers on cards and
--   card_references (the render caches' entire read surface), each a
--   single-row UPDATE of the stamp. The bump lives at the STORAGE layer so
--   every committed write moves it — same connection, another connection,
--   another process, raw SQL or the write path.
--
-- DEPLOYMENT ORDER: apply THIS migration to a live database BEFORE any
-- engine build carrying the freshness gate serves from it — the gate fails
-- closed on a missing stamp.
--
-- PORTED FROM: the freshness lane's deploy/migrations/
-- 0003-deck-data-version-stamp.sql (branch lane-b-freshness-2026-10-05,
-- engine commit d19ec179), renumbered for this lineage's migration sequence
-- (0003-0006 are taken here).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "deck_data_version" (
  "id"      INTEGER PRIMARY KEY CHECK ("id" = 1),
  "version" INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0);

CREATE TRIGGER IF NOT EXISTS "cards_bump_deck_data_version_ins" AFTER INSERT ON "cards" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "cards_bump_deck_data_version_upd" AFTER UPDATE ON "cards" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "cards_bump_deck_data_version_del" AFTER DELETE ON "cards" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_references_bump_deck_data_version_ins" AFTER INSERT ON "card_references" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_references_bump_deck_data_version_upd" AFTER UPDATE ON "card_references" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_references_bump_deck_data_version_del" AFTER DELETE ON "card_references" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
