// Sign-in + sessions on the Bunny edge — the round-trip PROOF.
//
// WHAT IS UNDER TEST
//   The Bunny edge host adapter
//   (deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts) mounting
//   the shared write surface (src/server/cloudflare-write-routes.ts) on the
//   real BunnyDbDriver, so a sign-in on the edge mints a real auth_sessions
//   row and hands back a real session cookie.
//
// WHY THIS IS NOT A MOCK-OF-A-MOCK
//   Every layer between the HTTP request and the INSERT is the production
//   one. Only the far end of the socket is substituted, and only for the
//   offline test:
//     Request  ->  readBunnyEdgeRequest (host adapter, real)
//              ->  handleWorkersWriteSurface (shared, real)
//              ->  handleWriteRequest / handleSigninUpdate (shared, real)
//              ->  signinAccount / authenticateAccount (real)
//              ->  SessionStore.createSession (real)
//              ->  BunnyDbDriver.query  (REAL driver: Hrana v2 tagging,
//                  one POST /v2/pipeline, affected_row_count decoding)
//              ->  [offline] protocol-faithful mock Hrana server running a
//                  REAL better-sqlite3 with the REAL cards DDL from
//                  db/schema.sqlite.sql and the REAL auth_sessions DDL from
//                  deploy/migrations/0005-auth-sessions.sql
//   The live test (opt-in) swaps only the mock for the real Bunny trial DB.
//
// DATA: synthetic. Credentials come from src/testing/generated-credentials.ts,
// per the stream data rule — no real deck content, no real account.
//
// NOT PROVEN HERE, and why:
//   - The Bunny EDGE SCRIPT runtime itself (workerd vs Bunny's isolate) is
//     not exercised. What is proven is that the adapter's contract with the
//     runtime — Web Request/Response, process.env, no D1 binding — holds,
//     and that the seam it depends on is the real driver.
//   - The real deploy is gated off by default; the live trial-DB test
//     writes and deletes exactly one auth_sessions row and never touches
//     Riley's account.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import { sha256Hex } from "../../src/card/auth/session-token.js";
import {
  generatedEmail,
  generatedPassword,
} from "../../src/testing/generated-credentials.js";
import {
  bunnyEdgeWriteArmed,
  BUNNY_EDGE_SIGNIN_PATH,
  mountBunnyEdgeWriteSurface,
  type BunnyEdgeEnv,
} from "../../deploy/bunny-worker-src/bunny-edge-signin-session-surface.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";
import { describeOrSkipLoud } from "../support/describe-with-corpus.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

// The captured sign-in form's grammar (write-routes.ts:613-624): the two
// subcard fields plus the Rails method-override and success fields. Posting
// anything else would not reach the :signin branch at all.
const SIGNIN_PATH = "/update/*signin";
const TS = "2026-10-02 12:00:00.000";
const SALT = "SALT";
const HOLDER = { id: 9100, name: "Joe User" };
const JUNCTION_ID = 9101;
const IDS = { account: 9001, email: 9002, password: 9003, salt: 9004, status: 9005 } as const;
const EMAIL = generatedEmail("bunny-edge-signin");
const PASSWORD = generatedPassword("bunny-edge-signin");
const DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");

/** Split a .sql file into single statements: strip `--` line comments (the
 *  core schema puts them INSIDE its DDL, so they must go before SQLite sees
 *  the text), then split on `;`, keeping a CREATE TRIGGER's `BEGIN ... END`
 *  body (whose statements end in `;`) in one piece. No string literal in
 *  either migration file contains a `;`, so this is exact for these two
 *  files. */
function sqlStatements(file: string): string[] {
  const statements: string[] = [];
  let pending = "";
  for (const piece of readFileSync(path.join(REPO_ROOT, file), "utf8").replace(/--[^\n]*/g, "").split(";")) {
    pending = pending === "" ? piece : `${pending};${piece}`;
    const statement = pending.trim();
    if (statement === "") {
      pending = "";
      continue;
    }
    if (/^CREATE\s+TRIGGER\b/i.test(statement) && !/\bEND$/i.test(statement)) continue;
    statements.push(statement);
    pending = "";
  }
  return statements;
}

/** Apply a migration file THROUGH the real driver. Doing the DDL over the
 *  same Hrana wire the sign-in will use is deliberate: it proves the driver
 *  can carry DDL, not just SELECT/INSERT the engine happens to issue. */
async function applyMigration(driver: BunnyDbDriver, file: string): Promise<number> {
  const statements = sqlStatements(file);
  for (const sql of statements) await driver.query(sql, []);
  return statements.length;
}

function insertCodenameCard(driver: BunnyDbDriver, id: number, codename: string, name: string) {
  return driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 1, NULL)`,
    [id, name, name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), codename, TS, TS],
  );
}

function insertCompoundCard(
  driver: BunnyDbDriver,
  id: number,
  name: string,
  leftId: number,
  rightId: number,
  content: string | null,
) {
  return driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 1, ?)`,
    [id, name, leftId, rightId, TS, TS, content],
  );
}

/** The synthetic account substrate, shaped exactly as
 *  tests/card/auth/signin.test.ts builds it: five codename cards, the
 *  holder, its +*account junction, and the four field children (active,
 *  salted, sha1-digested per Card::Auth.encrypt). */
async function seedSyntheticAccount(driver: BunnyDbDriver): Promise<void> {
  await insertCodenameCard(driver, IDS.account, "account", "*account");
  await insertCodenameCard(driver, IDS.email, "email", "*email");
  await insertCodenameCard(driver, IDS.password, "password", "*password");
  await insertCodenameCard(driver, IDS.salt, "salt", "*salt");
  await insertCodenameCard(driver, IDS.status, "status", "*status");
  await insertCodenameCard(driver, HOLDER.id, "", HOLDER.name);
  await insertCompoundCard(driver, JUNCTION_ID, `${HOLDER.name}+*account`, HOLDER.id, IDS.account, null);
  await insertCompoundCard(driver, 9102, `${HOLDER.name}+*account+*email`, JUNCTION_ID, IDS.email, EMAIL);
  await insertCompoundCard(
    driver,
    9103,
    `${HOLDER.name}+*account+*password`,
    JUNCTION_ID,
    IDS.password,
    DIGEST,
  );
  await insertCompoundCard(driver, 9104, `${HOLDER.name}+*account+*salt`, JUNCTION_ID, IDS.salt, SALT);
  await insertCompoundCard(driver, 9105, `${HOLDER.name}+*account+*status`, JUNCTION_ID, IDS.status, "active");
}

/** The captured oracle form, verbatim in shape. `extraHeaders` lets a test
 *  add proxy evidence (x-forwarded-proto) on top of the form headers. */
function signinFormRequest(
  email: string,
  password: string,
  url: string,
  extraHeaders: Record<string, string> = {},
): Request {
  const body = new URLSearchParams({
    "_method": "patch",
    "success[redirect]": "true",
    "success[mark]": "*previous",
    "card[subcards][+*email][content]": email,
    "card[subcards][+*password][content]": password,
  }).toString();
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...extraHeaders },
    body,
  });
}

function cookieToken(setCookie: string | null): string {
  expect(setCookie, "sign-in must set a cookie").not.toBeNull();
  const match = /^decko_ts_session=([^;]*)/.exec(setCookie ?? "");
  expect(match, `no decko_ts_session in ${setCookie}`).not.toBeNull();
  return match![1] as string;
}

describe("Bunny edge sign-in + sessions over the real BunnyDbDriver", () => {
  let server: MockHranaServer;
  let driver: BunnyDbDriver;
  let fetcher: FetchEngine;
  let render: RenderEngine;

  const ARMED: BunnyEdgeEnv = { DECKO_WRITE_PATH: "1", DECKO_FIRST_RUN: "0" };

  beforeAll(async () => {
    server = await startMockHranaServer();
    driver = new BunnyDbDriver({ url: server.url, authToken: "bunny-edge-signin-test" });
    // The REAL cards DDL and the REAL auth_sessions DDL (migration 0005 —
    // the same file the Bunny trial DB already has applied).
    await applyMigration(driver, "db/schema.sqlite.sql");
    await applyMigration(driver, "deploy/migrations/0005-auth-sessions.sql");
    await seedSyntheticAccount(driver);
    fetcher = new FetchEngine(driver);
    render = new RenderEngine(fetcher);
  });

  afterAll(async () => {
    await server.close();
  });

  it("migration 0005 created the real auth_sessions table on this driver", async () => {
    const result = await driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'",
      [],
    );
    expect(result.rows.map((r) => r.name)).toEqual(["auth_sessions"]);
  });

  it("a sign-in POST on the edge 303s, sets a hardened session cookie, and writes ONE auth_sessions row carrying the digest", async () => {
    const before = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", []);
    const wireBefore = server.requests.length;

    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
      ARMED,
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(303);
    // *previous resolves to "/" (location_history.rb:6-9). cardUrl
    // absolutizes it with the bridge-derived scheme (write-routes.ts:568,
    // WriteRouteRequest.scheme): the request URL is https, so the 303
    // points back at https. The pre-fix behavior answered http:// here — a
    // scheme DOWNGRADE on an HTTPS-only edge, served on the same response
    // that had already set the hardened Secure cookie (the receipt's open
    // item, closed 2026-10-02).
    expect(response!.headers.get("Location")).toBe("https://edge.example/");

    // The cookie: HttpOnly + SameSite=Lax + Max-Age (write-routes.ts:223-228)
    // and Secure, which the HOST adds on https (the Cloudflare host does the
    // same at cloudflare-write-routes.ts:187-191; here on the Bunny edge).
    const setCookie = response!.headers.get("set-cookie");
    expect(setCookie).toMatch(/^decko_ts_session=[0-9a-f]{64};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Max-Age=");

    // Exactly one row, and it holds the sha256 DIGEST — never the raw token.
    const after = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", []);
    expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n) + 1);

    const token = cookieToken(setCookie);
    const rows = await driver.query<{ token_hash: string; account_card_id: number; expires_at: string }>(
      "SELECT token_hash, account_card_id, expires_at FROM auth_sessions",
      [],
    );
    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0]!;
    expect(row.token_hash).toBe(await sha256Hex(token));
    expect(row.token_hash).not.toBe(token);
    expect(Number(row.account_card_id)).toBe(HOLDER.id);

    // And it really went over the Bunny wire (Hrana v2, /v2/pipeline), not
    // through some side channel.
    const wire = server.requests.slice(wireBefore);
    expect(wire.length).toBeGreaterThan(0);
    expect(wire.every((r) => r.url === "/v2/pipeline" && r.method === "POST")).toBe(true);
    expect(wire.every((r) => r.headers["authorization"] === "Bearer bunny-edge-signin-test")).toBe(true);
  });

  it("an http URL carrying x-forwarded-proto: https — the edge-proxy shape — still answers an https Location", async () => {
    // Bunny's TLS-terminating proxy may hand the script a request whose URL
    // still reads http (module header :54-63) — the downgrade shape that
    // motivated the fix. The bridge's TLS evidence is x-forwarded-proto
    // here (arrivedOverTls), so BOTH the Location scheme and the Secure
    // cookie must come out https from one decision.
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, `http://edge.example${SIGNIN_PATH}`, {
        "x-forwarded-proto": "https",
      }),
      ARMED,
    );
    expect(response!.status).toBe(303);
    expect(response!.headers.get("Location")).toBe("https://edge.example/");
    expect(response!.headers.get("set-cookie")).toContain("Secure");
  });

  it("a genuinely plain http request with no forwarded evidence answers http:// (the fallback — the staging host's shape)", async () => {
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, `http://edge.example${SIGNIN_PATH}`),
      ARMED,
    );
    expect(response!.status).toBe(303);
    expect(response!.headers.get("Location")).toBe("http://edge.example/");
    expect(response!.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("the cookie resolves back to the signed-in actor through the same driver", async () => {
    const sessions = new SessionStore({ driver });
    const token = (
      await driver.query<{ token_hash: string }>("SELECT token_hash FROM auth_sessions", [])
    ).rows[0]!.token_hash;
    // The raw token is not recoverable from the DB (that is the point), so
    // resolve through a fresh sign-in to get a cookie value back.
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
      ARMED,
    );
    const fresh = cookieToken(response!.headers.get("set-cookie"));
    const actor = await sessions.lookupSession(fresh);
    expect(actor).toEqual({ id: HOLDER.id, name: HOLDER.name });
    expect(await sha256Hex(fresh)).toBe(
      (await driver.query<{ token_hash: string }>(
        "SELECT token_hash FROM auth_sessions WHERE token_hash = ?",
        [await sha256Hex(fresh)],
      )).rows[0]!.token_hash,
    );
    expect(token).not.toBe(fresh);
  });

  it("a revoked token stops resolving (the DELETE rides the Bunny driver too)", async () => {
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
      ARMED,
    );
    const token = cookieToken(response!.headers.get("set-cookie"));
    const sessions = new SessionStore({ driver });
    expect(await sessions.lookupSession(token)).not.toBeNull();
    expect(await sessions.revokeSession(token)).toBe(true);
    expect(await sessions.lookupSession(token)).toBeNull();
  });

  it("a wrong password writes NO session row (the failure ladder short-circuits)", async () => {
    const before = Number(
      (await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", [])).rows[0]?.n,
    );
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, generatedPassword("wrong-one"), `https://edge.example${SIGNIN_PATH}`),
      ARMED,
    );
    expect(response!.status).toBe(422);
    expect(response!.headers.get("set-cookie")).toBeNull();
    const after = Number(
      (await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", [])).rows[0]?.n,
    );
    expect(after).toBe(before);
  });

  it("the sign-in form is served on GET when armed", async () => {
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      new Request(`https://edge.example${BUNNY_EDGE_SIGNIN_PATH}`),
      ARMED,
    );
    expect(response!.status).toBe(200);
    const body = await response!.text();
    expect(body).toContain(SIGNIN_PATH);
    expect(body).toContain("card[subcards][+*email][content]");
  });

  it("UNARMED: the login action STILL dispatches (auth is not a card write); every other route keeps the null fall-through", async () => {
    // REVISED by the edge-signin-form-fix lane (2026-10-03). The pre-lane
    // pin asserted null for EVERY verb while disarmed — the exact posture
    // the lane exists to change: a trial edge with DECKO_WRITE_PATH="0"
    // could not sign anyone in. Ruby decko never gates the login action
    // behind a deploy flag (set/self/signin.rb:6 "/update/:signin is the
    // login action"; the :signin event aborts the save — no card/act rows,
    // only an auth_sessions row). The disarm-time cost boundary moved WITH
    // the behavior: the mount now spends its queries ONLY on the auth route;
    // every other non-read verb still returns null with zero statements.
    const unarmed: BunnyEdgeEnv = { DECKO_FIRST_RUN: "0" };
    expect(bunnyEdgeWriteArmed(unarmed)).toBe(false);

    // THE EXEMPTION: the login action answers on the unarmed edge.
    const wireBefore = server.requests.length;
    const post = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
      unarmed,
    );
    expect(post).not.toBeNull();
    expect(post!.status).toBe(303);
    expect(post!.headers.get("set-cookie")).toContain("decko_ts_session=");
    // and it really went over the wire (the driver was reached).
    expect(server.requests.length).toBeGreaterThan(wireBefore);
    // the minted row is real; revoke it through the (ungated) sign-out
    // helper so the fixture's session census stays clean for the live arm.
    const sessions = new SessionStore({ driver });
    const token = cookieToken(post!.headers.get("set-cookie"));
    expect(await sessions.lookupSession(token)).toEqual({ id: HOLDER.id, name: HOLDER.name });
    await sessions.revokeSession(token);

    // UNCHANGED: a card-create POST (bare single-segment mark) stays null.
    const create = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      new Request("https://edge.example/Injected", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "card[content]=x",
      }),
      unarmed,
    );
    expect(create).toBeNull();
    // UNCHANGED: an update against a NON-signin mark stays null.
    const update = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      signinFormRequest(EMAIL, PASSWORD, "https://edge.example/update/Home"),
      unarmed,
    );
    expect(update).toBeNull();
    // UNCHANGED: the GET sign-in form page stays write-gated (the real form
    // lives on the /*signin card page, an ordinary read-route render).
    const get = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      new Request(`https://edge.example${BUNNY_EDGE_SIGNIN_PATH}`),
      unarmed,
    );
    expect(get).toBeNull();
  });

  it("UNARMED: a delete-spoof against *signin is NOT the login action and stays gated", async () => {
    // _method=delete rewrites the verb (effectiveMethod): matchRoute answers
    // verb=delete mark=*signin — a CARD DELETE route, never the login
    // action. The carve must not widen to "any /update/*signin request".
    const unarmed: BunnyEdgeEnv = { DECKO_FIRST_RUN: "0" };
    const before = Number(
      (await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", [])).rows[0]?.n,
    );
    const response = await mountBunnyEdgeWriteSurface(
      { fetcher, render, driver },
      new Request("https://edge.example/update/*signin", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "_method=delete",
      }),
      unarmed,
    );
    expect(response).toBeNull();
    const after = Number(
      (await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", [])).rows[0]?.n,
    );
    expect(after).toBe(before);
  });

  // Security settings (docs/SECURITY.md) come from this host's env bag on the
  // sign-in-only arm too, not only when the write path is armed.
  describe("UNARMED: the sign-in action honours the edge's security settings", () => {
    const sessionCount = async (): Promise<number> =>
      Number((await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", [])).rows[0]?.n);
    const storedPassword = async (): Promise<string> =>
      String((await driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = 9103", [])).rows[0]?.db_content);

    it("a cross-site sign-in POST is refused with 403 and mints no session", async () => {
      const before = await sessionCount();
      const response = await mountBunnyEdgeWriteSurface(
        { fetcher, render, driver },
        signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`, { origin: "https://attacker.example" }),
        { DECKO_FIRST_RUN: "0" },
      );
      expect(response!.status).toBe(403);
      expect(response!.headers.get("set-cookie")).toBeNull();
      expect(await sessionCount()).toBe(before);
    });

    it("DECKO_ORIGIN_CHECK=off in the edge env lets it through", async () => {
      const response = await mountBunnyEdgeWriteSurface(
        { fetcher, render, driver },
        signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`, { origin: "https://attacker.example" }),
        { DECKO_FIRST_RUN: "0", DECKO_ORIGIN_CHECK: "off" },
      );
      expect(response!.status).toBe(303);
      await new SessionStore({ driver }).revokeSession(cookieToken(response!.headers.get("set-cookie")));
    });

    it("DECKO_PASSWORD_HASH=legacy-sha1 in the edge env keeps Ruby's digest at sign-in", async () => {
      await driver.query("UPDATE cards SET db_content = ? WHERE id = 9103", [DIGEST]);
      const response = await mountBunnyEdgeWriteSurface(
        { fetcher, render, driver },
        signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
        { DECKO_FIRST_RUN: "0", DECKO_PASSWORD_HASH: "legacy-sha1" },
      );
      expect(response!.status).toBe(303);
      expect(await storedPassword()).toBe(DIGEST);
      await new SessionStore({ driver }).revokeSession(cookieToken(response!.headers.get("set-cookie")));
    });

    it("by default the edge replaces the legacy digest with PBKDF2 at sign-in, and it still signs in", async () => {
      await driver.query("UPDATE cards SET db_content = ? WHERE id = 9103", [DIGEST]);
      const env = { DECKO_FIRST_RUN: "0", DECKO_PASSWORD_PBKDF2_ITERATIONS: "100000" };
      const first = await mountBunnyEdgeWriteSurface(
        { fetcher, render, driver },
        signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
        env,
      );
      expect(first!.status).toBe(303);
      expect(await storedPassword()).toMatch(/^pbkdf2_sha256\$100000\$/);
      const second = await mountBunnyEdgeWriteSurface(
        { fetcher, render, driver },
        signinFormRequest(EMAIL, PASSWORD, `https://edge.example${SIGNIN_PATH}`),
        env,
      );
      expect(second!.status).toBe(303);
      const sessions = new SessionStore({ driver });
      await sessions.revokeSession(cookieToken(first!.headers.get("set-cookie")));
      await sessions.revokeSession(cookieToken(second!.headers.get("set-cookie")));
    });
  });
});

// ---------------------------------------------------------------------------
// The live trial edge database. Opt-in: DECKO_LIVE_TRIAL_DB=1, because it
// needs the Bunny TRIAL creds and touches a real service. Trial account only.
// ---------------------------------------------------------------------------
const LIVE = process.env.DECKO_LIVE_TRIAL_DB === "1";

/** Read a named key out of the creds file. Returns the VALUE; the caller
 *  must never log it. Absent key -> undefined, and the test skips. */
function trialSecret(key: string): string | undefined {
  const file = process.env.DECKO_TRIAL_CREDS ?? "C:/localProjects/brandonDojoTech/library/data/creds";
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] === key) return m[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

describeOrSkipLoud(!LIVE, "tests/deploy/bunny-edge-signin-session-roundtrip.test.ts", "LIVE")("LIVE: Bunny trial DB, real driver over the real network", () => {
  const url = trialSecret("BUNNY_TRIAL_DB_URL");
  const token = trialSecret("BUNNY_TRIAL_DB_TOKEN");

  it("creates, resolves, and revokes a real auth_sessions row on the trial edge DB", async () => {
    if (url === undefined || token === undefined) {
      throw new Error("DECKO_LIVE_TRIAL_DB=1 but the trial creds were not found");
    }
    const live = new BunnyDbDriver({
      url: url.replace(/^libsql:\/\//i, "https://"),
      authToken: token,
      timeoutMs: 20_000,
    });
    // Borrow a REAL card from the seeded trial deck so the lookupSession JOIN
    // resolves a real name. This writes nothing to `cards`.
    const card = await live.query<{ id: number; name: string | null }>(
      "SELECT id, name FROM cards WHERE trash = 0 AND name IS NOT NULL ORDER BY id LIMIT 1",
      [],
    );
    const row = card.rows[0];
    expect(row, "trial deck has no non-trash card").toBeDefined();

    const sessions = new SessionStore({ driver: live });
    // LIVE WRITES, exactly two, both against auth_sessions: one INSERT and
    // one DELETE. No card row is created, updated, or deleted.
    const created = await sessions.createSession(Number(row!.id));
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);

    const actor = await sessions.lookupSession(created.token);
    expect(actor).not.toBeNull();
    expect(actor!.id).toBe(Number(row!.id));

    // The raw token is not in the table; its digest is.
    const stored = await live.query<{ token_hash: string }>(
      "SELECT token_hash FROM auth_sessions WHERE token_hash = ?",
      [await sha256Hex(created.token)],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.token_hash).not.toBe(created.token);

    expect(await sessions.revokeSession(created.token)).toBe(true);
    expect(await sessions.lookupSession(created.token)).toBeNull();
  });

  it("census: what the trial deck actually supports, read-only", async () => {
    if (url === undefined || token === undefined) {
      throw new Error("DECKO_LIVE_TRIAL_DB=1 but the trial creds were not found");
    }
    const live = new BunnyDbDriver({
      url: url.replace(/^libsql:\/\//i, "https://"),
      authToken: token,
      timeoutMs: 20_000,
    });
    // Every count here is a single read. This test asserts nothing about the
    // deck's shape — it RECORDS it, so the receipt can state exactly which
    // half of the round-trip the live run covers instead of guessing.
    const cards = await live.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards WHERE trash = 0",
      [],
    );
    const codenames = await live.query<{ codename: string; n: number }>(
      "SELECT codename, COUNT(*) AS n FROM cards " +
        "WHERE codename IN ('account','email','password','salt','status') AND trash = 0 " +
        "GROUP BY codename ORDER BY codename",
      [],
    );
    const sessions = await live.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", []);
    const accountHolders = await live.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards c WHERE c.trash = 0 AND c.codename = 'account'",
      [],
    );
    // The decisive question for a FULL live sign-in: is there an actual
    // account HOLDER — a card that is the left side of a junction onto the
    // *account right card? The substrate seeds the *account right card and
    // its field cards; whether it also seeds a real user with a password is
    // what decides if authenticateAccount can succeed on this deck.
    const accountIdRow = await live.query<{ id: number }>(
      "SELECT id FROM cards WHERE codename = 'account' AND trash = 0 ORDER BY id LIMIT 1",
      [],
    );
    const accountId = accountIdRow.rows[0]?.id;
    const holders =
      accountId === undefined
        ? []
        : (
            await live.query<{ id: number; name: string | null; fields: number }>(
              `SELECT j.id AS id, h.name AS name,
                      (SELECT COUNT(*) FROM cards f
                        WHERE f.left_id = j.id AND f.trash = 0) AS fields
               FROM cards j JOIN cards h ON h.id = j.left_id
               WHERE j.right_id = ? AND j.trash = 0 ORDER BY j.id LIMIT 5`,
              [accountId],
            )
          ).rows;

    const report = {
      live_cards_not_trash: Number(cards.rows[0]?.n ?? -1),
      account_codename_cards: Object.fromEntries(
        codenames.rows.map((r) => [r.codename, Number(r.n)]),
      ),
      account_codename_total: Number(accountHolders.rows[0]?.n ?? -1),
      account_holders: holders.map((h) => ({ name: h.name, field_children: Number(h.fields) })),
      auth_sessions_rows_after_test: Number(sessions.rows[0]?.n ?? -1),
    };
    // Printed, not asserted: the deck's contents are a fact to report.
    // eslint-disable-next-line no-console
    console.log("[live trial census]", JSON.stringify(report));
    expect(report.live_cards_not_trash).toBeGreaterThan(0);
    // The test above revokes its own row, so the table must be back to empty.
    expect(report.auth_sessions_rows_after_test).toBe(0);
  });
});
