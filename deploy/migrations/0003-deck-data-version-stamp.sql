-- ============================================================================
-- 0003-deck-data-version-stamp.sql — ADDITIVE backfill migration.
--
-- WHY IT EXISTS: the deck_data_version freshness stamp was added to
-- db/schema.sqlite.sql (the [ENGINE-FRESHNESS] block) AFTER 0001 was already
-- applied to the provisioned D1 databases. Wrangler never re-runs an applied
-- migration, so already-provisioned databases get the stamp from THIS file.
-- Fresh databases do not need it (the regenerated 0001 already creates the
-- table, seed row and triggers; the IF NOT EXISTS / INSERT OR IGNORE keeps
-- this file order-safe everywhere).
--
-- MECHANISM (full reasoning in db/schema.sqlite.sql, [ENGINE-FRESHNESS]
-- block): the render path reads the stamp ONCE per request (one PK point
-- SELECT, src/card/render.ts DECK_DATA_VERSION_STATEMENT) and clears its
-- derived caches when the value moved. The bump lives in AFTER triggers on
-- cards + card_references — the entire read surface of the render caches —
-- because a committed write is authoritative regardless of which stream,
-- process, or connection issued it. Without the stamp the warm render path
-- serves pre-mutation bytes, including post-revocation permission verdicts
-- (delivery contract:79 — "No stale-success response or post-revocation data
-- leak is acceptable").
--
-- A database WITHOUT this stamp fails the render-path read LOUDLY by design
-- (the engine throws "deck_data_version unreadable"): a silently skipped
-- check would be a silent staleness window.
--
-- WRITE COST: one extra single-row UPDATE per mutation on cards /
-- card_references (point write on a 1-row b-tree). READ COST: one PK point
-- SELECT per render request.
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
