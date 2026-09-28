// Public surface of the auth layer (sessions + actor resolution). The
// actions stream consumes exactly these; nothing here reaches into any
// other engine module.
//
// Wiring seam for the coordinator (see docs/auth-port-notes.md):
//   import { SessionStore, actorBot, actorAnonymous, type Actor,
//            runAuthMigrations } from ".../src/card/auth/index.js";
//   const auth = new SessionStore({ driver });
//   const actor = await auth.resolveActorFromToken(bearerToken); // Actor | null
//   const system = await actorBot(driver);                       // system writes

export {
  DEFAULT_SESSION_TTL_SECONDS,
  SessionStore,
  selectAuthSessionsRow,
  sqlDateTime,
  type AuthSessionsRow,
  type SessionCreation,
  type SessionStoreOptions,
} from "./session-store.js";
export {
  ANONYMOUS_CODENAME,
  ActorNotFoundError,
  actorAnonymous,
  actorBot,
  actorByCodename,
  DECKOBOT_CODENAME,
  type Actor,
} from "./actor.js";
export {
  runAuthMigrations,
  splitSqlStatements,
  type AuthMigrationRunOptions,
  type AuthMigrationRunResult,
} from "./migrations.js";
export {
  constantTimeEqual,
  generateSessionToken,
  SESSION_TOKEN_BYTES,
  sha256Hex,
  tokensEqual,
} from "./session-token.js";
export {
  authenticateAccount,
  encryptAccountPassword,
  resolveAccountCodenameIds,
  rubyStrip,
  sha1Hex,
  signinAccount,
  signoutAccount,
  verifyAccountPassword,
  type AccountCodenameIds,
  type AuthenticatedAccount,
  type SigninFailure,
  type SigninFailureReason,
  type SigninOutcome,
  type SigninSuccess,
} from "./signin.js";
