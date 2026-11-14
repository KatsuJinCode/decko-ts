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
-- (no stale-success response or post-revocation data leak is acceptable).
--
-- A database WITHOUT this stamp fails the render-path read LOUDLY by design
-- (the engine throws "deck_data_version unreadable"): a silently skipped
-- check would be a silent staleness window.
--
-- SCOPE, AND WHAT A card_actions-ONLY WRITE DOES NOT BUMP (verified against
-- this tree's write path; the honesty of this note matters more than
-- a completeness claim it cannot earn). The triggers cover `cards` and
-- `card_references` only. Retained render state is derived from those two
-- tables, so the stamp's job is done. But `card_actions` is a THIRD table the
-- render reads, and the write path writes it in ways that need not touch
-- either covered table:
--
--   * src/card/history/write-path.ts:639 `ActWriter.reserveAction` INSERTs a
--     card_actions row with card_id NULL as a pre-pass, on its own, BEFORE the
--     cards row exists (the compound-create and compound-rename paths,
--     card-action-engine.ts:1452 and :2340). Nothing in that statement touches
--     cards or card_references.
--   * card-action-engine.ts:1562 / :2438 `UPDATE card_actions SET action_type`
--     and :4354 `UPDATE card_actions SET super_action_id` (child actions
--     re-parented to their parent's action) are standalone UPDATEs.
--   * :4096 / :4129 and write-path.ts:779 `pushClearOwnDrafts` DELETE draft or
--     reserved action rows.
--
-- WHAT THAT DOES AND DOES NOT MEAN. Each of those writes is followed, in the
-- same act, by the cards (or card_references) write that the same save
-- performs anyway — a reserved action is filled by the createCard/updateCard
-- call it was reserved for, and the draft clears ride inside the same
-- batch as the save they belong to (write-path.ts:685 `pushClearDraftsAndAct`,
-- called from createCard at :314 and updateCard at :456). So the stamp DOES
-- move on every act that changes the deck. The residual gap is narrow and
-- stated here rather than papered over: a card_actions mutation that is the
-- LAST write of a save which changed nothing in `cards`/`card_references`
-- leaves the stamp unmoved. The retained state that could then be stale is the
-- two card_actions readers in the render path: `seatLastActionIds`
-- (src/card/render.ts:5096, which seats each card's last action id for the
-- edit form's conflict tracker) and the history seam (src/card/render.ts:7537,
-- per-render only — its bundle is cleared at the top of every render,
-- render.ts:1093, so it is never retained across requests). The conflict
-- tracker is therefore the only retained card_actions-derived state a stamp
-- move is responsible for invalidating, and it lives in the RenderCard map
-- that `resetCaches()` clears (render.ts:2387).
--
-- NOT CLAIMED: this file does not assert the stamp covers every card_actions
-- write. It asserts the opposite — that the uncovered writes are enumerated,
-- so a reader can check the enumeration rather than inherit a sufficiency
-- claim this file cannot support from triggers alone. Widening the triggers to
-- `card_actions` would close the gap at the cost of a per-action-row write;
-- that trade is a decision, not a comment.
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
