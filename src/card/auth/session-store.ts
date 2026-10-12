// The session store: token -> actor mapping over the SQLDatabaseDriver
// seam, backed by the auth_sessions table (db/migrations/001-auth-sessions.sql).
//
// Ruby mapping (card-1.110.0/lib/card/auth/):
//   * Ruby keeps the signed-in user id in the request session hash:
//     `signin` writes `session[session_user_key] = current_id`
//     (current.rb:35-41), the key being `:"user_#{db}"` (current.rb:82-84),
//     and the hash rides Rails' ActiveRecord::SessionStore (the core
//     "sessions" table — opaque serialized blobs, no per-user query path).
//     Token signin instead decodes a stateless JWT whose payload carries
//     user_id + exp (token.rb:9-15, :38-41).
//   * The port collapses the two mechanisms into one explicit table row:
//     an opaque bearer token whose at-rest digest maps to an account card id
//     and an expiry — server-side revocability of the JWT path, session-row
//     ergonomics of the cookie path.
//   * On lookup the stored id must still resolve to a live user card —
//     Ruby re-validates the session's id against the cards table on every
//     request (`signin_with_session`: `card_id = nil unless
//     card_id.card&.account?`, current.rb:58-63; a dead id signs in as
//     Anonymous). The port returns null for the same situation; the
//     `account?` set-membership half of that check needs the rule layer
//     and is deferred
//   * Expiry mirrors the JWT `exp` claim: `payload = { user_id:, exp: }`
//     (token.rb:11), rejected after the timestamp (token.rb:17-23, the jwt
//     gem's claim validation surfacing as an error string).

import type { SQLDatabaseDriver, SQLQueryResult } from "../../server/driver.js";
import type { SQLDateTime } from "../../server/schema.js";
import type { Actor } from "./actor.js";
import { generateSessionToken, sha256Hex, tokensEqual } from "./session-token.js";

/** UTC datetime TEXT in ActiveRecord's form ("YYYY-MM-DD HH:MM:SS", plus
 *  ".ffffff" only when the microseconds are not zero) — the same storage
 *  form the core schema uses. Local copy (history/act.ts has the twin and
 *  the Ruby citation) so the auth layer stands alone against the clean seam;
 *  kept in lockstep with it by tests/card/history/act.test.ts. */
export function sqlDateTime(date: Date): SQLDateTime {
  const iso = date.toISOString();
  const seconds = `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  const ms = date.getUTCMilliseconds();
  return ms === 0 ? seconds : `${seconds}.${String(ms).padStart(3, "0")}000`;
}

/**
 * The port's own default TTL (48h). Ruby's expiry is app config
 * (`Card.config.token_expiry.from_now`, token.rb:32-34) — the VALUE is
 * deck-controlled there, not a gem constant, so the engine takes it per
 * call / per store and this default is a port decision, not a ported
 * number.
 */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 48;

export interface SessionStoreOptions {
  /** The storage seam. */
  driver: SQLDatabaseDriver;
  /** Clock for created_at, expires_at, and expiry checks. Defaults to
   *  () => new Date(). */
  now?: () => Date;
  /** TTL used when createSession gets no explicit ttlSeconds. Defaults to
   *  DEFAULT_SESSION_TTL_SECONDS. */
  defaultTtlSeconds?: number;
  /** The comparator every lookup routes the presented token's digest
   *  through before accepting a row. Defaults to tokensEqual
   *  (constant-time). Injectable so tests can prove the comparison is
   *  load-bearing (a store that skips it fails its lookups). */
  compareTokens?: (presented: string, stored: string) => boolean;
}

/** One created session, as handed back to the caller: the RAW token (shown
 *  once, never stored) and the expiry as stored. */
export interface SessionCreation {
  token: string;
  expiresAt: SQLDateTime;
}

/** The auth_sessions row shape (db/migrations/001-auth-sessions.sql). */
export interface AuthSessionsRow {
  token_hash: string;
  account_card_id: number;
  created_at: SQLDateTime;
  expires_at: SQLDateTime;
}

export class SessionStore {
  private readonly driver: SQLDatabaseDriver;
  private readonly clock: () => Date;
  private readonly defaultTtlSeconds: number;
  private readonly compareTokens: (presented: string, stored: string) => boolean;

  constructor(options: SessionStoreOptions) {
    this.driver = options.driver;
    this.clock = options.now ?? (() => new Date());
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
    this.compareTokens = options.compareTokens ?? tokensEqual;
  }

  /**
   * Create a session for an account's user card: mint a 32-byte
   * crypto-random hex token, store only its sha256 digest, return the raw
   * token + the computed expiry. Ruby analog: `signin` binding the id into
   * the session (current.rb:35-41) / Token.encode minting a JWT
   * (token.rb:10-14).
   */
  async createSession(
    accountCardId: number,
    opts?: { ttlSeconds?: number },
  ): Promise<SessionCreation> {
    const token = generateSessionToken();
    const now = this.clock();
    const ttlSeconds = opts?.ttlSeconds ?? this.defaultTtlSeconds;
    const expiresAt = sqlDateTime(new Date(now.getTime() + ttlSeconds * 1000));
    const tokenHash = await sha256Hex(token);
    const result = await this.driver.query(
      `INSERT INTO auth_sessions (token_hash, account_card_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      [tokenHash, accountCardId, sqlDateTime(now), expiresAt],
    );
    if (result.rowsAffected !== 1) {
      throw new Error(
        `SessionStore: session row not inserted for account card ${accountCardId} ` +
          `(rowsAffected=${result.rowsAffected})`,
      );
    }
    return { token, expiresAt };
  }

  /**
   * Resolve a raw token to its actor ({id, name} of the account's user
   * card), or null when the token is unknown, revoked, expired, tampered,
   * or its user card no longer exists. Never throws for a bad token.
   *
   * The digest comparison runs through the injectable comparator
   * (compareTokens option) — see the class docs for why it is a seam.
   */
  async lookupSession(token: string): Promise<Actor | null> {
    const tokenHash = await sha256Hex(token);
    const result = await this.driver.query<{
      token_hash: string;
      account_card_id: number;
      expires_at: SQLDateTime;
      name: string | null;
    }>(
      `SELECT s.token_hash, s.account_card_id, s.expires_at, c.name
       FROM auth_sessions s JOIN cards c ON c.id = s.account_card_id
       WHERE s.token_hash = ?`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    // Constant-time digest comparison on every lookup — the stored digest is
    // re-checked byte-for-byte against the presented token's digest. (The
    // raw token never sits in any comparable column; this is the last word
    // on whether the presented material matches the stored session.)
    if (!this.compareTokens(tokenHash, row.token_hash)) return null;
    // Expiry (the JWT exp analog, token.rb:11): canonical fixed-width TEXT
    // compares lexicographically == chronologically (schema convention).
    if (this.nowString() > row.expires_at) return null;
    // The session's id must still resolve to a live user card
    // (current.rb:58-63 — `card_id.card&.account?` else Anonymous). The
    // JOIN already dropped dead ids; a NULL name is a broken account card
    // (user cards are simple cards) and is treated the same way.
    if (row.name === null) return null;
    return { id: row.account_card_id, name: row.name };
  }

  /** Alias of {@link lookupSession} named for the actions layer's
   *  vocabulary: resolve the actor this token writes as. */
  async resolveActorFromToken(token: string): Promise<Actor | null> {
    return this.lookupSession(token);
  }

  /**
   * Revoke a session by raw token. True when a row was deleted, false when
   * the token matched nothing (already revoked or never existed).
   */
  async revokeSession(token: string): Promise<boolean> {
    const tokenHash = await sha256Hex(token);
    const result = await this.driver.query(
      "DELETE FROM auth_sessions WHERE token_hash = ?",
      [tokenHash],
    );
    return result.rowsAffected > 0;
  }

  private nowString(): SQLDateTime {
    return sqlDateTime(this.clock());
  }
}

/** Untyped rows helper for tests and janitorial reads. */
export async function selectAuthSessionsRow(
  driver: SQLDatabaseDriver,
  tokenHash: string,
): Promise<AuthSessionsRow | undefined> {
  const result: SQLQueryResult<AuthSessionsRow> = await driver.query(
    "SELECT token_hash, account_card_id, created_at, expires_at FROM auth_sessions WHERE token_hash = ?",
    [tokenHash],
  );
  return result.rows[0];
}
