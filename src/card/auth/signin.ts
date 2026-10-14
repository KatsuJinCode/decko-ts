// The account sign-in flow: password verification against the +*account
// field cards, session issuance through the SessionStore, and the port of
// card-mod-account's :signin / :signout events.
//
// Ruby truth (card-1.110.0 + card-mod-account-0.20.0) — READ THIS BEFORE
// TOUCHING THE CRYPTO:
//
//   * Passwords are NOT bcrypt in this engine generation. Card::Auth.encrypt
//     (lib/card/auth.rb:36-39) is:
//         Digest::SHA1.hexdigest "#{salt}--#{password}--"
//     and Card::Auth.password_valid? (auth.rb:27-29) is exact string
//     equality against that digest:
//         account.password == encrypt(password, account.salt)
//     So a +*account+*password card holds a 40-char lowercase hex string
//     (SHA-1 hex), never a bcrypt-shaped ($2a$/$2b$) value.
//     Column convention: this module queries the ENGINE-standard
//     cards.db_content (src/server/schema.ts TABLES.cards).
//     `account.password` / `account.salt` are card_accessors over the
//     +*account junction's children (set/right/account.rb:5-8), i.e. the
//     cards named <Holder>+*account+*password and ...+*salt.
//   * SECURITY DIVERGENCE (docs/SECURITY.md, "Passwords"): the port still
//     verifies Ruby's digests, but stores new passwords as PBKDF2 and
//     replaces a legacy digest at the next successful sign-in, unless the
//     deck sets DECKO_PASSWORD_HASH=legacy-sha1 (password-hash.ts).
//     Comparisons run in constant time.
//   * The salt may be ABSENT — set/right/password.rb:21-26 (encrypt_password
//     event) carries "turns out we have a lot of existing accounts without a
//     salt"; Ruby's "#{salt}--..." interpolation renders nil as "", so a
//     missing salt card verifies against ""--password--".
//   * authenticate (auth.rb:20-31): find the +*account card by email
//     (find_account_by_email, auth/current.rb:74-77 — strip + downcase, then
//     the +*email child content is matched exactly), require it active
//     (`active?` = status content == "active", generated in
//     set/right/account.rb:43-45 from STATUS_OPTIONS), then
//     password_valid? with password.strip (auth.rb:28). Password stripping
//     is Ruby String#strip (ASCII whitespace + \0) — the port reproduces
//     that set, not JS trim's Unicode superset.
//   * The signin event (set/self/signin.rb:12-15, :validate on :update):
//     authenticate_or_abort with the exact error ladder
//     (:53-56 + :77-84): missing email -> :email_missing, missing password
//     -> :password_missing, unknown email -> :error_unknown_email, not
//     active -> :error_not_active, wrong password -> :error_wrong_password.
//     The en strings live in card-mod-account config/locales/en.yml.
//   * signin_success (signin.rb:17-19): "abort after successful signin
//     (do not save card)" — a successful sign-in writes NO card row and NO
//     act. The only state change is the session. The port pins this: the
//     flow's only write is the auth_sessions row.
//   * The signout event (signin.rb:25-29, :validate on :delete):
//     Auth.signin(AnonymousID) + Env.reset_session + abort :success. The
//     port's equivalent state change is the auth_sessions row deletion —
//     after it, every later lookup degrades to Anonymous
//     (auth/current.rb:58-63 shape, already ported in session-store.ts).
//   * Name-identifier support is a PORT EXTENSION (dispatch slice-1): Ruby's
//     signin form authenticates by email only. The name path resolves the
//     holder card by name/key and reads the same +*account children.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { Actor } from "./actor.js";
import { SessionStore, type SessionCreation } from "./session-store.js";
import { checkPassword, hashPassword, passwordHashPolicy } from "./password-hash.js";
import {
  SigninThrottle,
  signinScopes,
  signinSecurityPolicy,
  type SigninSecurityPolicy,
} from "./signin-security.js";

/** Ruby String#strip's exact character set (ASCII whitespace + NUL). */
const RUBY_STRIP_RE = /^[ \t\r\n\f\v\0]+|[ \t\r\n\f\v\0]+$/g;

/** Ruby String#strip parity (auth.rb:28 `password.strip`). */
export function rubyStrip(value: string): string {
  return value.replace(RUBY_STRIP_RE, "");
}

/** SHA-1 of a UTF-8 string, hex-encoded — Digest::SHA1.hexdigest (auth.rb:39).
 *  Web Crypto SHA-1 (digest-only) exists in Node 19+ and workers, matching
 *  the session-token.ts runtime rule. */
export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Port of Card::Auth.encrypt (auth.rb:36-39):
 * `Digest::SHA1.hexdigest "#{salt}--#{password}--"`. A nil salt
 * interpolates as the empty string (see the module header) — pass "" for a
 * missing salt, never a literal "nil".
 */
export function encryptAccountPassword(password: string, salt: string): Promise<string> {
  return sha1Hex(`${salt}--${password}--`);
}

/**
 * Port of Card::Auth.password_valid? (auth.rb:27-29), extended to the port's
 * PBKDF2 format (password-hash.ts): true when the password matches the
 * stored value, either Ruby's salted SHA-1 digest or a PBKDF2 hash. Ruby
 * compares with `==`; the port compares in constant time (docs/SECURITY.md,
 * a security divergence with no visible difference in results).
 */
export async function verifyAccountPassword(
  storedDigest: string,
  password: string,
  salt: string,
): Promise<boolean> {
  return (await checkPassword(storedDigest, password, salt)).ok;
}

/** The +*account field codenames the flow reads (right/account.rb:5-8). */
const ACCOUNT_CODENAMES = ["account", "email", "password", "salt", "status"] as const;

/** Codename -> card id for the account field cards, resolved from the
 *  deck's own cards table (codename.rb:108 mechanism, as actor.ts). */
export interface AccountCodenameIds {
  account: number;
  email: number;
  password: number;
  salt: number;
  status: number;
}

/** Resolve the account codenames, or null when the deck carries none — a
 *  deck without card-mod-account's cards has no account system and the
 *  flow reports that instead of guessing (the Anonymous/DeckoBot actors are
 *  separately required by every deck: setup.rb:44). */
export async function resolveAccountCodenameIds(
  driver: SQLDatabaseDriver,
): Promise<AccountCodenameIds | null> {
  const ids: Partial<Record<(typeof ACCOUNT_CODENAMES)[number], number>> = {};
  for (const codename of ACCOUNT_CODENAMES) {
    const result = await driver.query<{ id: number }>(
      "SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1",
      [codename],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    ids[codename] = row.id;
  }
  return ids as AccountCodenameIds;
}

/** The +*account junction row for a holder id (left_id = holder,
 *  right_id = *account), or undefined. Ruby's `account` card_accessor over
 *  the accounted card; the junction IS the account card
 *  (abstract/account_field.rb account_card: left whose right_id is
 *  AccountID). */
interface AccountJunctionRow {
  id: number;
  left_id: number;
  holder_name: string | null;
}

async function accountJunctionForHolder(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  holderId: number,
): Promise<AccountJunctionRow | undefined> {
  const result = await driver.query<AccountJunctionRow>(
    `SELECT a.id, a.left_id, h.name AS holder_name
     FROM cards a JOIN cards h ON h.id = a.left_id
     WHERE a.left_id = ? AND a.right_id = ? AND a.trash = 0
     ORDER BY a.id LIMIT 1`,
    [holderId, ids.account],
  );
  return result.rows[0];
}

/** Content of a +*account field child (e.g. ...+*password), or undefined
 *  when the child card does not exist. Missing CARD differs from empty
 *  content; both compare as Ruby's nil/"" would ("" interpolation). */
async function accountFieldContent(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  junctionId: number,
  field: "email" | "password" | "salt" | "status",
): Promise<string | undefined> {
  const result = await driver.query<{ db_content: string | null }>(
    `SELECT db_content FROM cards
     WHERE left_id = ? AND right_id = ? AND trash = 0
     ORDER BY id LIMIT 1`,
    [junctionId, ids[field]],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return row.db_content ?? "";
}

/** Replace the stored password value in place. +*password saves keep no
 *  history in Ruby (set/right/password.rb:13-15), and this is not a user
 *  edit, so only the column changes. Errors are swallowed: a deployment
 *  whose database refuses the write still signs the user in. */
async function upgradeStoredPassword(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  junctionId: number,
  value: string,
): Promise<void> {
  try {
    await driver.query("UPDATE cards SET db_content = ? WHERE left_id = ? AND right_id = ? AND trash = 0", [
      value,
      junctionId,
      ids.password,
    ]);
  } catch {
    // The legacy digest stays; the next sign-in tries again.
  }
}

/** One sign-in failure, shaped as the Ruby error ladder
 *  (signin.rb:53-56, :77-84) with the exact en.yml strings. */
export type SigninFailureReason =
  | "email_missing"
  | "password_missing"
  | "unknown_email"
  | "not_active"
  | "wrong_password"
  | "account_system_absent"
  | "account_card_unresolvable"
  | "password_hash_unsupported"
  // Port-only (signin-security.ts): the uniform answer for an unknown
  // identifier, an inactive account or a wrong password, and the throttle's
  // refusal.
  | "invalid_credentials"
  | "throttled";

export interface SigninFailure {
  ok: false;
  reason: SigninFailureReason;
  /** The user-facing message (en.yml, verbatim for the four Ruby keys;
   *  the two port-side reasons are honest engine conditions). */
  message: string;
}

/** The Ruby i18n strings (card-mod-account config/locales/en.yml), keyed by
 *  the signin error ladder. */
const SIGNIN_MESSAGES: Record<SigninFailureReason, string> = {
  email_missing: "email can't be blank", // account_email_missing
  password_missing: "password can't be blank", // account_password_missing
  unknown_email: "Unrecognized email.", // account_error_unknown_email
  not_active: "Sorry, that account is not active.", // account_error_not_active
  wrong_password: "Wrong password", // account_error_wrong_password
  account_system_absent: "This deck has no account system.",
  account_card_unresolvable: "The account card for this session could not be resolved.",
  password_hash_unsupported:
    "This server cannot check this account's password: its stored hash needs more PBKDF2 iterations than this runtime allows. Reset the password to sign in here.",
  invalid_credentials: "Wrong email or password.",
  throttled: "Too many failed sign-in attempts. Try again later.",
};

function failure(reason: SigninFailureReason): SigninFailure {
  return { ok: false, reason, message: SIGNIN_MESSAGES[reason] };
}

/** The resolved account just before session issuance: the HOLDER actor
 *  (Auth.signin account.left_id, signin.rb:48 — the sign-in session's
 *  current id is the accounted card, not +*account itself). */
export interface AuthenticatedAccount {
  holder: Actor;
  /** The +*account junction card id (diagnostics only). */
  accountId: number;
}

/**
 * Port of the signin event's authenticate half
 * (authenticate_or_abort + authenticate_and_signin, signin.rb:12-15, :42-50)
 * up to (not including) session issuance. Identifier accepts the Ruby email
 * path (strip + downcase against +*email content, auth/current.rb:74-77) or
 * the port-extension name path (holder card by name, then by Ruby key).
 *
 * Never throws for bad credentials — every outcome is a typed failure with
 * the Ruby message.
 */
export async function authenticateAccount(
  driver: SQLDatabaseDriver,
  identifier: string,
  password: string,
  security: SigninSecurityPolicy = signinSecurityPolicy(),
): Promise<{ ok: true; account: AuthenticatedAccount } | SigninFailure> {
  // authenticate_or_abort (:42-46): blank identifier -> :email_missing,
  // blank password -> :password_missing (checked on the RAW field content,
  // before the strip that password_valid? applies).
  const id = rubyStrip(identifier);
  if (id === "") return failure("email_missing");
  // abort_unless pword, :password_missing (signin.rb:55) tests the RAW
  // field content; a whitespace-only password survives this check and
  // fails later as :wrong_password through the strip inside
  // password_valid? (auth.rb:28) — Ruby's exact ladder.
  if (password === "") return failure("password_missing");

  const ids = await resolveAccountCodenameIds(driver);
  if (ids === null) return failure("account_system_absent");

  // find_account_by_email first (the Ruby path), the name extension second.
  const junction =
    (await findJunctionByEmail(driver, ids, id)) ??
    (await findJunctionByName(driver, ids, id));
  const policy = passwordHashPolicy();
  if (junction === undefined) {
    // Uniform failure (docs/SECURITY.md, divergence 4): an unknown
    // identifier pays for one password derivation at the configured cost,
    // as a real check would, and answers as a wrong password does.
    if (!security.uniformFailure) return failure("unknown_email");
    await hashPassword(rubyStrip(password), "", policy);
    return failure("invalid_credentials");
  }

  // password_valid? (auth.rb:27-29): stored digest == encrypt(
  // password.strip, salt). Missing salt card -> "" (the nil-interpolation
  // parity documented in the module header); missing password card -> the
  // stored digest is "" which no password can match (Ruby: nil == String is
  // false).
  const checkStoredPassword = async () => {
    const storedDigest = (await accountFieldContent(driver, ids, junction.id, "password")) ?? "";
    const salt = (await accountFieldContent(driver, ids, junction.id, "salt")) ?? "";
    return { salt, check: await checkPassword(storedDigest, rubyStrip(password), salt, policy) };
  };

  // account&.active? (auth.rb:23): status child content == "active"
  // (right/account.rb:43-45 generated predicates). A MISSING status card is
  // not "active" — nil == "active" is false in Ruby too.
  const status = await accountFieldContent(driver, ids, junction.id, "status");
  if (status !== "active") {
    if (!security.uniformFailure) return failure("not_active");
    // Under the uniform policy the inactive state is told only to a caller
    // who has just proved the password; anyone else gets the uniform answer
    // after the same derivation a wrong password costs.
    const { check } = await checkStoredPassword();
    return failure(check.ok ? "not_active" : "invalid_credentials");
  }

  const { salt, check } = await checkStoredPassword();
  if (check.unsupported !== undefined) return failure("password_hash_unsupported");
  if (!check.ok) return failure(security.uniformFailure ? "invalid_credentials" : "wrong_password");
  // Upgrade on sign-in (docs/SECURITY.md, "Passwords"): a legacy SHA-1
  // digest, or a PBKDF2 hash with fewer iterations than configured, is
  // replaced now that the plaintext is known to be right (the stripped
  // password that just verified). Port-only and best-effort: a failed
  // upgrade never fails the sign-in.
  if (check.needsUpgrade) {
    await upgradeStoredPassword(driver, ids, junction.id, await hashPassword(rubyStrip(password), salt, policy));
  }

  // The session actor is the holder (signin.rb:48 Auth.signin
  // account.left_id). An unnamed holder card can never resolve a session
  // (session-store.ts's live-account join returns null for it), so fail
  // here rather than minting a token that degrades to Anonymous on first
  // use.
  if (junction.holder_name === null) return failure("account_card_unresolvable");

  return {
    ok: true,
    account: {
      holder: { id: junction.left_id, name: junction.holder_name },
      accountId: junction.id,
    },
  };
}

/** find_account_by (auth/current.rb:84-92) for the email field: strip +
 *  downcase (:74-77), exact content match on the +*email child of a
 *  +*account junction. */
async function findJunctionByEmail(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  identifier: string,
): Promise<AccountJunctionRow | undefined> {
  const email = rubyStrip(identifier).toLowerCase();
  const result = await driver.query<AccountJunctionRow>(
    `SELECT a.id, a.left_id, h.name AS holder_name
     FROM cards a
     JOIN cards e ON e.left_id = a.id AND e.right_id = ? AND e.trash = 0
     JOIN cards h ON h.id = a.left_id
     WHERE a.right_id = ? AND a.trash = 0 AND e.db_content = ?
     ORDER BY a.id LIMIT 1`,
    [ids.email, ids.account, email],
  );
  return result.rows[0];
}

/** Port extension: resolve the holder by stored name, then by the Ruby key
 *  form (Card::Name#key: downcase + spaces to underscores), then read its
 *  +*account child. */
async function findJunctionByName(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  identifier: string,
): Promise<AccountJunctionRow | undefined> {
  const rubyKey = identifier.toLowerCase().replace(/ /g, "_");
  const holderResult = await driver.query<{ id: number; name: string | null }>(
    `SELECT id, name FROM cards
     WHERE trash = 0 AND (name = ? OR key = ?)
     ORDER BY (name = ?) DESC, id LIMIT 1`,
    [identifier, rubyKey, identifier],
  );
  const holder = holderResult.rows[0];
  if (holder === undefined) return undefined;
  return accountJunctionForHolder(driver, ids, holder.id);
}

/** One completed sign-in: the actor plus the issued session. */
export interface SigninSuccess {
  ok: true;
  actor: Actor;
  session: SessionCreation;
}

/** Either a completed sign-in or the typed Ruby-ladder failure. */
export type SigninOutcome = SigninSuccess | SigninFailure;

/**
 * The full :signin event port (signin.rb:12-15) plus the success half
 * (:17-19, :46-49): authenticate, then bind the session through the
 * SessionStore. The ONLY write this function performs is the auth_sessions
 * row — signin_success aborts the save ("do not save card"), so no card
 * row and no act is written (pinned by tests/card/auth/signin.test.ts).
 */
export async function signinAccount(
  driver: SQLDatabaseDriver,
  sessions: SessionStore,
  identifier: string,
  password: string,
  options: { clientAddress?: string; now?: () => Date; security?: SigninSecurityPolicy } = {},
): Promise<SigninOutcome> {
  const security = options.security ?? signinSecurityPolicy();
  // The throttle (docs/SECURITY.md, divergence 4): a locked scope is refused
  // before any password is checked; failures that reach authentication are
  // counted against the identifier and the client address. Blank fields are
  // answered before the throttle and never counted.
  const throttle =
    security.throttle && rubyStrip(identifier) !== "" && password !== ""
      ? new SigninThrottle(sessions.storageDriver, security, options.now)
      : undefined;
  const scopes = signinScopes(identifier, options.clientAddress);
  if (throttle !== undefined && (await throttle.lockedUntil(scopes)) !== undefined) {
    return failure("throttled");
  }
  const result = await authenticateAccount(driver, identifier, password, security);
  if (!result.ok) {
    if (
      throttle !== undefined &&
      (result.reason === "unknown_email" ||
        result.reason === "not_active" ||
        result.reason === "wrong_password" ||
        result.reason === "invalid_credentials")
    ) {
      await throttle.recordFailure(scopes);
    }
    return result;
  }
  if (throttle !== undefined) await throttle.recordSuccess(scopes);
  const session = await sessions.createSession(result.account.holder.id);
  return { ok: true, actor: result.account.holder, session };
}

/**
 * The :signout event port (signin.rb:25-29): end the current session —
 * `Auth.signin AnonymousID; Env.reset_session`. The port's state change is
 * the auth_sessions row deletion; every later lookup of the revoked token
 * degrades to Anonymous (current.rb:58-63, session-store.ts). Returns true
 * when a live session was revoked, false when the token matched nothing
 * (Ruby's signout is idempotent the same way: signing out Anonymous is a
 * no-op success).
 */
export async function signoutAccount(
  sessions: SessionStore,
  token: string | null | undefined,
): Promise<boolean> {
  if (token === null || token === undefined || token === "") return false;
  return sessions.revokeSession(token);
}
