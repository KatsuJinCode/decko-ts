-- ============================================================================
-- 0005-auth-sessions.sql — the auth layer's session table, for the D1 chain
--
-- WHY THIS FILE IS A COPY AND NOT A MOVE
--   db/migrations/001-auth-sessions.sql is the source of truth. It is
--   applied by runAuthMigrations() in src/card/auth/migrations.ts:54-89 for
--   local engines and tests — and that runner is Node-only by design
--   (migrations.ts:12-17, `node:fs` + `node:url`), so it cannot run inside a
--   Worker. Its own header already anticipates this: "Applied by ... the
--   deploy stream (wrangler d1 migrations / D1 migrations folder)". This file
--   IS that deploy stream's copy, in the deploy chain's numbering.
--
--   The DDL is byte-for-byte the same three statements as lines 26-37 of the
--   source file. IF NOT EXISTS throughout, so applying it to a database that
--   already ran the Node runner is a no-op — the two paths converge on one
--   table shape rather than racing.
--
-- WHAT IT BUYS THE DEPLOYED DEMO
--   write-routes.ts:645 mints a session on a successful *signin update
--   (SessionStore.createSession, session-store.ts:101-122). Without this
--   table the sign-in route has nowhere to put the row, so migration 0004's
--   account substrate could be seeded but never signed in against.
--
-- SECURITY SHAPE, unchanged from the source
--   "token_hash" is the sha256 hex digest of the raw session token; the raw
--   token is NEVER stored (source file line 27). The raw value exists only
--   in the Set-Cookie header the sign-in response carries, and every lookup
--   re-derives the digest and re-compares it in constant time
--   (session-store.ts:132-161). The browser cookie is HttpOnly + SameSite=Lax
--   (write-routes.ts:223-228) and this deployment adds Secure on https.
--
-- NO FOREIGN KEY, matching the source and the production schema
--   (source file lines 17-19: the core schema declares none; relationships
--   are application-enforced). LookupSession's JOIN to cards is what reaps a
--   session whose user card is gone (session-store.ts:140-159).
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
