// Sign-in hardening the port adds on top of card-mod-account's :signin
// event (docs/SECURITY.md, approved divergence 4). Three independent
// switches, each read from the host environment the same way the password
// hash policy is (password-hash.ts):
//
//   * DECKO_SIGNIN_THROTTLE (on | off, default on): failed sign-ins are
//     counted per account identifier and per client address in the deck's
//     own database (table auth_signin_throttle), and a scope that reaches its
//     limit is locked for a fixed period. The counter lives in the deck so it
//     holds on every host, including edge runtimes with no process memory
//     that survives between requests.
//   * DECKO_SIGNIN_UNIFORM_FAILURE (on | off, default on): an unknown
//     identifier, an inactive account and a wrong password all answer with
//     the same message, and an unknown identifier still pays for one
//     password derivation, so neither the response nor its timing says
//     whether an address has an account.
//   * DECKO_SESSION_REVOCATION (on | off, default on): a session stops
//     resolving once its account's password changes after the session was
//     issued, or once the account's status is anything other than "active"
//     (session-store.ts).
//
// "off" restores card-mod-account's behaviour for that switch; the parity
// harness adapter runs with all three off.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { sqlDateTime } from "./session-store.js";

export interface SigninSecurityPolicy {
  throttle: boolean;
  /** Failures within one window that lock an account identifier. */
  maxAccountFailures: number;
  /** Failures within one window that lock a client address. */
  maxAddressFailures: number;
  /** Length of the counting window and of the lock, in seconds. */
  lockoutSeconds: number;
  uniformFailure: boolean;
  sessionRevocation: boolean;
}

export const DEFAULT_MAX_ACCOUNT_FAILURES = 5;
export const DEFAULT_MAX_ADDRESS_FAILURES = 50;
export const DEFAULT_LOCKOUT_SECONDS = 15 * 60;

/** The environment variables the policy reads. */
export interface SigninSecurityEnv {
  readonly DECKO_SIGNIN_THROTTLE?: unknown;
  readonly DECKO_SIGNIN_MAX_FAILURES?: unknown;
  readonly DECKO_SIGNIN_MAX_ADDRESS_FAILURES?: unknown;
  readonly DECKO_SIGNIN_LOCKOUT_SECONDS?: unknown;
  readonly DECKO_SIGNIN_UNIFORM_FAILURE?: unknown;
  readonly DECKO_SESSION_REVOCATION?: unknown;
}

function readSwitch(env: SigninSecurityEnv | undefined, name: keyof SigninSecurityEnv): boolean {
  const raw = env?.[name];
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "" || value === "on") return true;
  if (value === "off") return false;
  throw new Error(`${name} must be "on" or "off", got ${JSON.stringify(raw)}`);
}

function readCount(env: SigninSecurityEnv | undefined, name: keyof SigninSecurityEnv, fallback: number): number {
  const raw = env?.[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${name} must be a whole number of at least 1, got ${JSON.stringify(raw)}`);
  }
  return Number(value);
}

/** Build the policy from host settings; unset values take the defaults.
 *  Throws on a value it cannot honour, so a misconfiguration fails loudly. */
export function signinSecurityPolicyFromEnv(env: SigninSecurityEnv | undefined): SigninSecurityPolicy {
  return {
    throttle: readSwitch(env, "DECKO_SIGNIN_THROTTLE"),
    maxAccountFailures: readCount(env, "DECKO_SIGNIN_MAX_FAILURES", DEFAULT_MAX_ACCOUNT_FAILURES),
    maxAddressFailures: readCount(env, "DECKO_SIGNIN_MAX_ADDRESS_FAILURES", DEFAULT_MAX_ADDRESS_FAILURES),
    lockoutSeconds: readCount(env, "DECKO_SIGNIN_LOCKOUT_SECONDS", DEFAULT_LOCKOUT_SECONDS),
    uniformFailure: readSwitch(env, "DECKO_SIGNIN_UNIFORM_FAILURE"),
    sessionRevocation: readSwitch(env, "DECKO_SESSION_REVOCATION"),
  };
}

let configured: SigninSecurityPolicy | undefined;

/** Set the policy explicitly (a host with its own settings bag, such as a
 *  Workers `env`), or clear it (undefined) to fall back to process.env. */
export function configureSigninSecurity(policy: SigninSecurityPolicy | undefined): void {
  configured = policy;
}

function processEnv(): SigninSecurityEnv | undefined {
  const proc = (globalThis as { process?: { env?: SigninSecurityEnv } }).process;
  return proc?.env;
}

/** The policy in force: the configured one, else process.env, else the
 *  defaults. */
export function signinSecurityPolicy(): SigninSecurityPolicy {
  return configured ?? signinSecurityPolicyFromEnv(processEnv());
}

// ---------------------------------------------------------------------------
// the throttle store
// ---------------------------------------------------------------------------

/** The table the throttle keeps in the deck database. Created on first use
 *  so a deck that predates it needs no migration step; the deploy migration
 *  chain carries the same statement (deploy/migrations/0010). */
export const SIGNIN_THROTTLE_DDL =
  "CREATE TABLE IF NOT EXISTS auth_signin_throttle (" +
  "scope TEXT PRIMARY KEY NOT NULL, " +
  "failures INTEGER NOT NULL, " +
  "window_started_at TEXT NOT NULL, " +
  "locked_until TEXT)";

interface ThrottleRow {
  scope: string;
  failures: number;
  window_started_at: string;
  locked_until: string | null;
}

/** The scopes one attempt counts against: the normalized identifier, and
 *  the client address when the host knows it. */
export interface SigninScopes {
  account: string;
  address?: string;
}

/** Normalize an identifier the way the email lookup does (strip, downcase),
 *  so "A@x" and " a@x " share one counter whether or not an account exists. */
export function signinScopes(identifier: string, address: string | undefined): SigninScopes {
  const account = `account:${identifier.replace(/^[ \t\r\n\f\v\0]+|[ \t\r\n\f\v\0]+$/g, "").toLowerCase()}`;
  const addr = address?.split(",")[0]?.trim();
  return addr === undefined || addr === "" ? { account } : { account, address: `address:${addr}` };
}

export class SigninThrottle {
  private ready = false;

  constructor(
    private readonly driver: SQLDatabaseDriver,
    private readonly policy: SigninSecurityPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async ensureTable(): Promise<void> {
    if (this.ready) return;
    await this.driver.query(SIGNIN_THROTTLE_DDL, []);
    this.ready = true;
  }

  private async row(scope: string): Promise<ThrottleRow | undefined> {
    const result = await this.driver.query<ThrottleRow>(
      "SELECT scope, failures, window_started_at, locked_until FROM auth_signin_throttle WHERE scope = ?",
      [scope],
    );
    return result.rows[0];
  }

  private scopeList(scopes: SigninScopes): Array<{ scope: string; limit: number }> {
    const list = [{ scope: scopes.account, limit: this.policy.maxAccountFailures }];
    if (scopes.address !== undefined) list.push({ scope: scopes.address, limit: this.policy.maxAddressFailures });
    return list;
  }

  /** The time the lock ends, when any of the scopes is locked now. */
  async lockedUntil(scopes: SigninScopes): Promise<string | undefined> {
    await this.ensureTable();
    const now = sqlDateTime(this.now());
    for (const { scope } of this.scopeList(scopes)) {
      const row = await this.row(scope);
      if (row?.locked_until != null && row.locked_until > now) return row.locked_until;
    }
    return undefined;
  }

  /** Count one failed attempt against every scope; a scope that reaches its
   *  limit inside the window is locked for lockoutSeconds. */
  async recordFailure(scopes: SigninScopes): Promise<void> {
    await this.ensureTable();
    const nowDate = this.now();
    const now = sqlDateTime(nowDate);
    const windowFloor = sqlDateTime(new Date(nowDate.getTime() - this.policy.lockoutSeconds * 1000));
    const lockEnd = sqlDateTime(new Date(nowDate.getTime() + this.policy.lockoutSeconds * 1000));
    for (const { scope, limit } of this.scopeList(scopes)) {
      const row = await this.row(scope);
      const fresh = row === undefined || row.window_started_at < windowFloor;
      const failures = fresh ? 1 : row.failures + 1;
      const windowStart = fresh ? now : row.window_started_at;
      const locked = failures >= limit;
      if (row === undefined) {
        await this.driver.query(
          "INSERT INTO auth_signin_throttle (scope, failures, window_started_at, locked_until) VALUES (?, ?, ?, ?)",
          [scope, locked ? 0 : failures, windowStart, locked ? lockEnd : null],
        );
      } else {
        await this.driver.query(
          "UPDATE auth_signin_throttle SET failures = ?, window_started_at = ?, locked_until = ? WHERE scope = ?",
          [locked ? 0 : failures, locked ? now : windowStart, locked ? lockEnd : row.locked_until, scope],
        );
      }
    }
  }

  /** A successful sign-in clears the account scope's count (the address
   *  scope keeps counting, so one valid account does not reset an
   *  address that is guessing at others). */
  async recordSuccess(scopes: SigninScopes): Promise<void> {
    await this.ensureTable();
    await this.driver.query("DELETE FROM auth_signin_throttle WHERE scope = ?", [scopes.account]);
  }
}
