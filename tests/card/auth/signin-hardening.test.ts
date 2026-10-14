// The port's sign-in hardening (docs/SECURITY.md, approved divergence 4):
// the throttle kept in the deck database, the uniform failure answer, and
// session revocation on password and status changes. Each switch is also
// pinned in its "off" position, which is card-mod-account's behaviour and
// the one the parity harness adapter runs with.

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { generatedEmail, generatedPassword } from "../../../src/testing/generated-credentials.js";
import { runAuthMigrations, SessionStore, signinAccount, authenticateAccount } from "../../../src/card/auth/index.js";
import {
  configureSigninSecurity,
  signinSecurityPolicyFromEnv,
  type SigninSecurityPolicy,
} from "../../../src/card/auth/signin-security.js";
import { configurePasswordHashing } from "../../../src/card/auth/password-hash.js";
import { createAuthTestStorage, insertAccountCard, type AuthTestStorage } from "./auth-test-storage.js";

const IDS = { account: 9001, email: 9002, password: 9003, salt: 9004, status: 9005 } as const;
const HOLDER = { id: 9100, name: "Joe User" };
const JUNCTION_ID = 9101;
const EMAIL = generatedEmail("joe");
const SALT = "SALT";
const PASSWORD = generatedPassword("hardening");
const DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");
const TS = "2026-09-20 11:00:00.000";

function q(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

function insertCard(
  storage: AuthTestStorage,
  row: { id: number; name: string; codename?: string; left?: number; right?: number; content?: string | null },
): void {
  storage.exec(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (${row.id}, ${q(row.name)}, ${row.codename ? q(row.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")) : "NULL"},
       ${row.codename ? q(row.codename) : "NULL"}, ${row.left ?? "NULL"}, ${row.right ?? "NULL"}, NULL,
       '${TS}', '${TS}', 1, 1, NULL, NULL, NULL, 0, 1, ${q(row.content ?? null)})`,
  );
}

async function buildStorage(status = "active"): Promise<AuthTestStorage> {
  const storage = createAuthTestStorage();
  await runAuthMigrations(storage.driver);
  for (const [codename, id] of Object.entries(IDS)) insertCard(storage, { id, name: `*${codename}`, codename });
  insertAccountCard(storage, HOLDER);
  insertCard(storage, { id: JUNCTION_ID, name: `${HOLDER.name}+*account`, left: HOLDER.id, right: IDS.account });
  insertCard(storage, { id: 9102, name: `${HOLDER.name}+*account+*email`, left: JUNCTION_ID, right: IDS.email, content: EMAIL });
  insertCard(storage, { id: 9103, name: `${HOLDER.name}+*account+*password`, left: JUNCTION_ID, right: IDS.password, content: DIGEST });
  insertCard(storage, { id: 9104, name: `${HOLDER.name}+*account+*salt`, left: JUNCTION_ID, right: IDS.salt, content: SALT });
  insertCard(storage, { id: 9105, name: `${HOLDER.name}+*account+*status`, left: JUNCTION_ID, right: IDS.status, content: status });
  return storage;
}

const HARDENED: SigninSecurityPolicy = signinSecurityPolicyFromEnv({});
const RUBY: SigninSecurityPolicy = signinSecurityPolicyFromEnv({
  DECKO_SIGNIN_THROTTLE: "off",
  DECKO_SIGNIN_UNIFORM_FAILURE: "off",
  DECKO_SESSION_REVOCATION: "off",
});

let storage: AuthTestStorage | undefined;
afterEach(() => {
  storage?.close();
  storage = undefined;
  configureSigninSecurity(undefined);
  configurePasswordHashing(undefined);
});

describe("policy settings", () => {
  it("defaults every switch on, with the documented limits", () => {
    expect(HARDENED).toEqual({
      throttle: true,
      maxAccountFailures: 5,
      maxAddressFailures: 50,
      lockoutSeconds: 900,
      uniformFailure: true,
      sessionRevocation: true,
    });
  });

  it("rejects values it cannot honour, naming the setting", () => {
    expect(() => signinSecurityPolicyFromEnv({ DECKO_SIGNIN_THROTTLE: "maybe" })).toThrow(/DECKO_SIGNIN_THROTTLE/);
    expect(() => signinSecurityPolicyFromEnv({ DECKO_SIGNIN_MAX_FAILURES: "0" })).toThrow(/DECKO_SIGNIN_MAX_FAILURES/);
  });
});

describe("uniform failure answer", () => {
  it("answers an unknown email, a wrong password and an inactive account identically", async () => {
    storage = await buildStorage();
    const unknown = await authenticateAccount(storage.driver, generatedEmail("nobody"), PASSWORD, HARDENED);
    const wrong = await authenticateAccount(storage.driver, EMAIL, `${PASSWORD}x`, HARDENED);
    storage.close();
    storage = await buildStorage("blocked");
    const inactiveWrong = await authenticateAccount(storage.driver, EMAIL, `${PASSWORD}x`, HARDENED);
    for (const outcome of [unknown, wrong, inactiveWrong]) {
      expect(outcome).toEqual({ ok: false, reason: "invalid_credentials", message: "Wrong email or password." });
    }
  });

  it("tells an inactive account so only to a caller who proved the password", async () => {
    storage = await buildStorage("blocked");
    const outcome = await authenticateAccount(storage.driver, EMAIL, PASSWORD, HARDENED);
    expect(outcome).toMatchObject({ ok: false, reason: "not_active" });
  });

  it("charges an unknown email one password derivation at the configured cost", async () => {
    storage = await buildStorage();
    configurePasswordHashing({ mode: "pbkdf2", iterations: 400_000 });
    const t0 = performance.now();
    await authenticateAccount(storage.driver, generatedEmail("nobody"), PASSWORD, HARDENED);
    const hardened = performance.now() - t0;
    const t1 = performance.now();
    await authenticateAccount(storage.driver, generatedEmail("nobody"), PASSWORD, RUBY);
    const ruby = performance.now() - t1;
    // 400,000 PBKDF2-SHA256 iterations take tens of milliseconds on any
    // current machine; the Ruby-ladder answer does no derivation at all.
    expect(hardened).toBeGreaterThan(ruby + 10);
  });

  it("keeps card-mod-account's field-naming messages when switched off", async () => {
    storage = await buildStorage();
    expect(await authenticateAccount(storage.driver, generatedEmail("nobody"), PASSWORD, RUBY)).toMatchObject({
      reason: "unknown_email",
      message: "Unrecognized email.",
    });
    expect(await authenticateAccount(storage.driver, EMAIL, `${PASSWORD}x`, RUBY)).toMatchObject({
      reason: "wrong_password",
      message: "Wrong password",
    });
  });
});

describe("sign-in throttle in the deck database", () => {
  function clockAt(ms: number): { now: () => Date; advance: (seconds: number) => void } {
    let t = ms;
    return { now: () => new Date(t), advance: (s) => (t += s * 1000) };
  }

  it("locks an identifier after five failures, refuses even the right password, and unlocks after the period", async () => {
    storage = await buildStorage();
    const clock = clockAt(Date.parse("2026-10-14T12:00:00Z"));
    const sessions = new SessionStore({ driver: storage.driver, now: clock.now });
    const opts = { now: clock.now, security: HARDENED };
    for (let i = 0; i < 5; i++) {
      expect(await signinAccount(storage.driver, sessions, EMAIL, `${PASSWORD}x`, opts)).toMatchObject({
        reason: "invalid_credentials",
      });
    }
    expect(await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, opts)).toMatchObject({
      ok: false,
      reason: "throttled",
      message: "Too many failed sign-in attempts. Try again later.",
    });
    const sessionRows = storage.driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", []);
    expect((await sessionRows).rows[0]!.n).toBe(0);
    clock.advance(901);
    expect(await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, opts)).toMatchObject({ ok: true });
  });

  it("counts unknown identifiers the same way, so a lock reveals nothing about existence", async () => {
    storage = await buildStorage();
    const sessions = new SessionStore({ driver: storage.driver });
    const ghost = generatedEmail("ghost");
    for (let i = 0; i < 5; i++) await signinAccount(storage.driver, sessions, ghost, PASSWORD, { security: HARDENED });
    expect(await signinAccount(storage.driver, sessions, ghost, PASSWORD, { security: HARDENED })).toMatchObject({
      reason: "throttled",
    });
  });

  it("keys the identifier case- and whitespace-insensitively and stores the counter as a table row", async () => {
    storage = await buildStorage();
    const sessions = new SessionStore({ driver: storage.driver });
    for (let i = 0; i < 5; i++) {
      const variant = i % 2 === 0 ? ` ${EMAIL.toUpperCase()} ` : EMAIL;
      await signinAccount(storage.driver, sessions, variant, `${PASSWORD}x`, { security: HARDENED });
    }
    const rows = await storage.driver.query<{ scope: string; locked_until: string | null }>(
      "SELECT scope, locked_until FROM auth_signin_throttle",
      [],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.scope).toBe(`account:${EMAIL.toLowerCase()}`);
    expect(rows.rows[0]!.locked_until).not.toBeNull();
  });

  it("locks a client address that fails across many identifiers", async () => {
    storage = await buildStorage();
    const sessions = new SessionStore({ driver: storage.driver });
    const policy = { ...HARDENED, maxAddressFailures: 3 };
    for (let i = 0; i < 3; i++) {
      await signinAccount(storage.driver, sessions, generatedEmail(`probe${i}`), PASSWORD, {
        security: policy,
        clientAddress: "203.0.113.7",
      });
    }
    expect(
      await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, { security: policy, clientAddress: "203.0.113.7" }),
    ).toMatchObject({ reason: "throttled" });
    expect(
      await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, { security: policy, clientAddress: "198.51.100.2" }),
    ).toMatchObject({ ok: true });
  });

  it("clears an identifier's count on success", async () => {
    storage = await buildStorage();
    const sessions = new SessionStore({ driver: storage.driver });
    for (let i = 0; i < 4; i++) await signinAccount(storage.driver, sessions, EMAIL, `${PASSWORD}x`, { security: HARDENED });
    expect(await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, { security: HARDENED })).toMatchObject({ ok: true });
    for (let i = 0; i < 4; i++) await signinAccount(storage.driver, sessions, EMAIL, `${PASSWORD}x`, { security: HARDENED });
    expect(await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, { security: HARDENED })).toMatchObject({ ok: true });
  });

  it("writes no throttle table when switched off", async () => {
    storage = await buildStorage();
    const sessions = new SessionStore({ driver: storage.driver });
    for (let i = 0; i < 7; i++) await signinAccount(storage.driver, sessions, EMAIL, `${PASSWORD}x`, { security: RUBY });
    expect(await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, { security: RUBY })).toMatchObject({ ok: true });
    const tables = await storage.driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_signin_throttle'",
      [],
    );
    expect(tables.rows).toHaveLength(0);
  });
});

describe("session revocation on account change", () => {
  async function signedIn(revocation: boolean) {
    storage = await buildStorage();
    const sessions = new SessionStore({ driver: storage.driver, revocation });
    const outcome = await signinAccount(storage.driver, sessions, EMAIL, PASSWORD, { security: RUBY });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(await sessions.lookupSession(outcome.session.token)).toEqual(HOLDER);
    return { sessions, token: outcome.session.token, driver: storage.driver };
  }

  it("ends the session when the password card is updated after it was issued", async () => {
    const { sessions, token, driver } = await signedIn(true);
    await driver.query("UPDATE cards SET db_content = ?, updated_at = ? WHERE id = 9103", ["changed", "2999-01-01 00:00:00"]);
    expect(await sessions.lookupSession(token)).toBeNull();
  });

  for (const status of ["blocked", "closed", "unverified"]) {
    it(`ends the session when the account's status becomes ${status}`, async () => {
      const { sessions, token, driver } = await signedIn(true);
      await driver.query("UPDATE cards SET db_content = ? WHERE id = 9105", [status]);
      expect(await sessions.lookupSession(token)).toBeNull();
    });
  }

  it("keeps a session whose account is unchanged, and one whose holder has no account", async () => {
    const { sessions, token } = await signedIn(true);
    expect(await sessions.lookupSession(token)).toEqual(HOLDER);
    const bare = await sessions.createSession(1);
    storage!.exec(`INSERT OR IGNORE INTO cards (id, name, key, created_at, updated_at, creator_id, updater_id, trash, type_id)
      VALUES (1, 'Bare Holder', 'bare_holder', '${TS}', '${TS}', 1, 1, 0, 1)`);
    expect(await sessions.lookupSession(bare.token)).toMatchObject({ id: 1 });
  });

  it("leaves sessions alive across those changes when switched off", async () => {
    const { sessions, token, driver } = await signedIn(false);
    await driver.query("UPDATE cards SET db_content = ?, updated_at = ? WHERE id = 9103", ["changed", "2999-01-01 00:00:00"]);
    await driver.query("UPDATE cards SET db_content = ? WHERE id = 9105", ["blocked"]);
    expect(await sessions.lookupSession(token)).toEqual(HOLDER);
  });
});
