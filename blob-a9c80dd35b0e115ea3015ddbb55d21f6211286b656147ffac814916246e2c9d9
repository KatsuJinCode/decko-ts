-- ----------------------------------------------------------------------------
CREATE TABLE "deck_data_version" (
  "id"      INTEGER PRIMARY KEY CHECK ("id" = 1),
  "version" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "deck_data_version" ("id", "version") VALUES (1, 0);

CREATE TRIGGER "cards_bump_deck_data_version_ins" AFTER INSERT ON "cards" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER "cards_bump_deck_data_version_upd" AFTER UPDATE ON "cards" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER "cards_bump_deck_data_version_del" AFTER DELETE ON "cards" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER "card_references_bump_deck_data_version_ins" AFTER INSERT ON "card_references" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER "card_references_bump_deck_data_version_upd" AFTER UPDATE ON "card_references" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
CREATE TRIGGER "card_references_bump_deck_data_version_del" AFTER DELETE ON "card_references" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END;
