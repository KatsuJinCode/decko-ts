-- ============================================================================
-- 0014-undo-journal-lock-state.sql — the undo journal's lock row, provisioned
-- up front.
--
-- The compensating transaction (src/server/drivers/undo-journal.ts) keeps its
-- lock in decko_tx_state. That table is otherwise created on the first write
-- transaction. A database that has never been written has no table, and every
-- read batch on it then fails "no such table" and retries without the lock
-- check: a failed query and a second round trip on every request. This
-- migration creates the table and its single lock row so the first read
-- answers. The DDL and the row are the journal's own (BOOTSTRAP in
-- undo-journal.ts), so the journal's later CREATE TABLE IF NOT EXISTS is a
-- no-op and its installed-signature check sees the same NULL signature it
-- would have seen on a lazily created table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "decko_tx_state" (
  "id"         INTEGER PRIMARY KEY CHECK ("id" = 1),
  "tx"         TEXT,
  "expires_at" INTEGER,
  "signature"  TEXT
);

INSERT OR IGNORE INTO "decko_tx_state" ("id") VALUES (1);
