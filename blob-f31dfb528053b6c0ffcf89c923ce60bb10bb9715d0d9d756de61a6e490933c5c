-- ============================================================================
-- 0015-live-page-bundles.sql — Phase 2 1-trip cold page bundles, lazy rule
-- watermarks, L3 global render cache tables, and 18-trigger deck_data_version
-- freshness stamp across all 6 card write tables (0010 parity).
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

CREATE TABLE IF NOT EXISTS "live_page_bundles" (
  "keep_key"     TEXT PRIMARY KEY,
  "page_key"     TEXT NOT NULL,
  "stamp"        INTEGER NOT NULL,
  "payload_json" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "deck_rule_flags" (
  "epoch"           INTEGER PRIMARY KEY AUTOINCREMENT,
  "rule_id"         INTEGER NOT NULL,
  "set_id"          INTEGER,
  "pattern_code"    TEXT NOT NULL,
  "anchor_id"       INTEGER,
  "anchor_left_id"  INTEGER,
  "anchor_right_id" INTEGER,
  "anchor_key"      TEXT,
  "is_delete"       INTEGER NOT NULL DEFAULT 0,
  "created_at"      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "deck_rule_flags_epoch_idx"
  ON "deck_rule_flags"("epoch");

CREATE TABLE IF NOT EXISTS "deck_card_rule_watermarks" (
  "card_id" INTEGER PRIMARY KEY,
  "epoch"   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "deck_rule_watermark_meta" (
  "id"                         INTEGER PRIMARY KEY CHECK ("id" = 1),
  "last_full_compaction_at_ms" INTEGER NOT NULL DEFAULT 0,
  "compaction_interval_ms"     INTEGER NOT NULL DEFAULT 2592000000
);

INSERT OR IGNORE INTO "deck_rule_watermark_meta" ("id", "last_full_compaction_at_ms", "compaction_interval_ms")
VALUES (1, 0, 2592000000);

CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_card_ins"
AFTER INSERT ON "cards" BEGIN
  DELETE FROM "live_page_bundles";
END;

-- Trigger ordering & compensation contract:
-- `cards_bump_deck_data_version_upd` (`0010-deck-data-version-all-card-tables.sql`
-- / `ensureFreshnessStamp`) increments `deck_data_version.version` by +1 on every
-- `UPDATE ON "cards"`. When an `UPDATE` on `cards` either:
--   (a) leaves all 15 non-rule bundle payload columns (`id`, `name`, `key`,
--       `codename`, `left_id`, `right_id`, `type_id`, `db_content`, `trash`,
--       `creator_id`, `updater_id`, `created_at`, `updated_at`,
--       `current_revision_id`, `references_expired`) AND `read_rule_id` /
--       `read_rule_class` unchanged (a pure no-op UPDATE), or
--   (b) changes only `read_rule_id`/`read_rule_class` while lazy rule flags are
--       active (`EXISTS (SELECT 1 FROM "deck_rule_flags")`),
-- `trg_live_page_bundles_card_upd` preserves `live_page_bundles` and applies a
-- compensating `-1` to `deck_data_version.version` within the same statement
-- transaction so the net `deck_data_version` delta is `0` regardless of SQLite's
-- `AFTER UPDATE` trigger firing order.
DROP TRIGGER IF EXISTS "trg_live_page_bundles_card_upd";
CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_card_upd"
AFTER UPDATE ON "cards" BEGIN
  DELETE FROM "live_page_bundles"
  WHERE NOT (
    OLD.id IS NEW.id AND
    OLD.name IS NEW.name AND
    OLD."key" IS NEW."key" AND
    OLD.codename IS NEW.codename AND
    OLD.left_id IS NEW.left_id AND
    OLD.right_id IS NEW.right_id AND
    OLD.type_id IS NEW.type_id AND
    OLD.db_content IS NEW.db_content AND
    OLD.trash IS NEW.trash AND
    OLD.creator_id IS NEW.creator_id AND
    OLD.updater_id IS NEW.updater_id AND
    OLD.created_at IS NEW.created_at AND
    OLD.updated_at IS NEW.updated_at AND
    OLD.current_revision_id IS NEW.current_revision_id AND
    OLD.references_expired IS NEW.references_expired AND
    (
      (OLD.read_rule_id IS NEW.read_rule_id AND OLD.read_rule_class IS NEW.read_rule_class) OR
      EXISTS (SELECT 1 FROM "deck_rule_flags")
    )
  );
  UPDATE "deck_data_version"
  SET "version" = "version" - 1
  WHERE "id" = 1 AND (
    OLD.id IS NEW.id AND
    OLD.name IS NEW.name AND
    OLD."key" IS NEW."key" AND
    OLD.codename IS NEW.codename AND
    OLD.left_id IS NEW.left_id AND
    OLD.right_id IS NEW.right_id AND
    OLD.type_id IS NEW.type_id AND
    OLD.db_content IS NEW.db_content AND
    OLD.trash IS NEW.trash AND
    OLD.creator_id IS NEW.creator_id AND
    OLD.updater_id IS NEW.updater_id AND
    OLD.created_at IS NEW.created_at AND
    OLD.updated_at IS NEW.updated_at AND
    OLD.current_revision_id IS NEW.current_revision_id AND
    OLD.references_expired IS NEW.references_expired AND
    (
      (OLD.read_rule_id IS NEW.read_rule_id AND OLD.read_rule_class IS NEW.read_rule_class) OR
      EXISTS (SELECT 1 FROM "deck_rule_flags")
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_card_del"
AFTER DELETE ON "cards" BEGIN
  DELETE FROM "live_page_bundles";
END;

CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_ref_ins"
AFTER INSERT ON "card_references" BEGIN
  DELETE FROM "live_page_bundles";
END;

CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_ref_upd"
AFTER UPDATE ON "card_references" BEGIN
  DELETE FROM "live_page_bundles";
END;

CREATE TRIGGER IF NOT EXISTS "trg_live_page_bundles_ref_del"
AFTER DELETE ON "card_references" BEGIN
  DELETE FROM "live_page_bundles";
END;

CREATE TABLE IF NOT EXISTS "edge_render_cache" (
  "cache_key"    TEXT PRIMARY KEY,
  "stamp"        INTEGER NOT NULL,
  "status"       INTEGER NOT NULL,
  "content_type" TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "updated_at"   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "decko_edge_render_cache" (
  "url"          TEXT PRIMARY KEY,
  "epoch"        INTEGER NOT NULL,
  "content_type" TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "stored_at"    INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS "trg_edge_render_cache_rule_flag_ins"
AFTER INSERT ON "deck_rule_flags" BEGIN
  DELETE FROM "edge_render_cache";
  DELETE FROM "decko_edge_render_cache";
END;
