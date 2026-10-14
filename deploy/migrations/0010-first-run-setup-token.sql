-- ============================================================================
-- 0010-first-run-setup-token.sql — the one-time first-run setup token
-- ============================================================================
--
-- Host infrastructure, not a Decko table. Ruby Decko's first-run window
-- (card-1.110.0 lib/card/auth/setup.rb, needs_setup?) is open to whoever
-- reaches /setup first while the deck has no accounts. On a deck that is
-- public the moment it is deployed, that is a race against anyone who finds
-- the URL, so the edge hosts add one requirement: the request must carry the
-- token the deploy chain issued (tools/deploy/issue-setup-token.mjs), which
-- is printed in the deployer's own deploy output.
--
-- Only the sha256 hex digest is stored; the raw token never is. The deploy
-- chain replaces the row on each issue, and a successful owner creation
-- deletes it. src/server/setup-token.ts reads and clears it.

CREATE TABLE IF NOT EXISTS "deck_setup_tokens" (
  "token_sha256" TEXT NOT NULL PRIMARY KEY,
  "created_at"   TEXT NOT NULL
);
