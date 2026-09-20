-- ============================================================================
-- 001-auth-sessions.sql — the AUTH layer's session table (decko-ts engine)
--
-- Owned by src/card/auth (auth port stream). This table is NOT part of the
-- core Ruby decko schema: the core "sessions" table in db/schema.sqlite.sql
-- is Rails' ActiveRecord::SessionStore infrastructure (opaque serialized
-- blobs), while this table is the engine's own explicit token->actor
-- mapping (see docs/auth-port-notes.md for the mapping rationale and the
-- Ruby citations).
--
-- Applied by:
--   * the deploy stream (wrangler d1 migrations / D1 migrations folder), and
--   * the local test setup, via runAuthMigrations() in
--     src/card/auth/migrations.ts.
--
-- Conventions follow db/schema.sqlite.sql: datetimes are TEXT in canonical
-- UTC "YYYY-MM-DD HH:MM:SS.mmm" (fixed width, so lexicographic order ==
-- chronological order); no FOREIGN KEY clauses (the production schema
-- declares none; relationships are application-enforced); IF NOT EXISTS so
-- applying twice is a no-op (the runner also tracks applied versions in its
-- own auth_migrations bookkeeping table, but the deploy stream's migration
-- tooling has no access to that table — the DDL is self-idempotent for
-- exactly that reason).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "token_hash"      TEXT NOT NULL PRIMARY KEY,  -- sha256 hex digest of the raw session token; the raw token is NEVER stored
  "account_card_id" INTEGER NOT NULL,           -- cards.id of the session's user card (Ruby: session[session_user_key], current.rb:38)
  "created_at"      TEXT NOT NULL,              -- datetime, UTC canonical form
  "expires_at"      TEXT NOT NULL               -- datetime; lookups after this instant fail (JWT exp analog, token.rb:11)
);

CREATE INDEX IF NOT EXISTS "index_auth_sessions_on_account_card_id"
  ON "auth_sessions" ("account_card_id");

CREATE INDEX IF NOT EXISTS "index_auth_sessions_on_expires_at"
  ON "auth_sessions" ("expires_at");
