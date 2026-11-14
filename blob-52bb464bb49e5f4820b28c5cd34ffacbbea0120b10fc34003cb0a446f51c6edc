-- ============================================================================
-- 0010-deck-data-version-all-card-tables.sql — ADDITIVE migration.
--
-- Widens the deck_data_version freshness stamp (0003, and the
-- [ENGINE-FRESHNESS] block of db/schema.sqlite.sql) from cards and
-- card_references to every table a card write changes: card_acts,
-- card_actions, card_changes and card_virtuals as well.
--
-- WHY: 0003 stamped only cards and card_references and enumerated the writes
-- that escape it — the write path's card_actions-only statements (a reserved
-- action inserted before its card row exists, child actions re-parented with
-- UPDATE card_actions, draft and reserved action rows deleted). A save whose
-- last write was one of those left the stamp unmoved, so a long-lived engine
-- could keep state derived from card_actions (the edit form's conflict
-- tracker, which seats each card's last action id) past a committed write.
-- With a trigger on every card table, every committed card write moves the
-- stamp, whichever table it touched.
--
-- COST: one extra single-row UPDATE per changed row on those tables.
--
-- Order-safe and idempotent: IF NOT EXISTS throughout, and the table and row
-- are re-stated so this file is correct on a database that never ran 0003.
-- The same statements are installed on any SQLite deck that lacks them by
-- src/server/freshness-stamp.ts (open paths) and by
-- tools/migrate/import.mjs installFreshnessStamp (import paths).
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
CREATE TRIGGER IF NOT EXISTS "card_acts_bump_deck_data_version_ins" AFTER INSERT ON "card_acts" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_acts_bump_deck_data_version_upd" AFTER UPDATE ON "card_acts" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_acts_bump_deck_data_version_del" AFTER DELETE ON "card_acts" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_actions_bump_deck_data_version_ins" AFTER INSERT ON "card_actions" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_actions_bump_deck_data_version_upd" AFTER UPDATE ON "card_actions" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_actions_bump_deck_data_version_del" AFTER DELETE ON "card_actions" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_changes_bump_deck_data_version_ins" AFTER INSERT ON "card_changes" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_changes_bump_deck_data_version_upd" AFTER UPDATE ON "card_changes" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_changes_bump_deck_data_version_del" AFTER DELETE ON "card_changes" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_virtuals_bump_deck_data_version_ins" AFTER INSERT ON "card_virtuals" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_virtuals_bump_deck_data_version_upd" AFTER UPDATE ON "card_virtuals" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER IF NOT EXISTS "card_virtuals_bump_deck_data_version_del" AFTER DELETE ON "card_virtuals" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
