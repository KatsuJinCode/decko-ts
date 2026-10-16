// The SHARED edge handler's security boundaries, driven END TO END through
// handleBunnyEngineRequest (deploy/bunny-worker-src/bunny-edge-engine-
// handler.ts) — the module whose module-scope deckPromise RETAINS one deck
// per isolate across requests. The two security gaps closed here were found
// by driving this handler adversarially; each test mirrors the reproduction.
//
// GAP 1 (BLOCKER — stale permission verdicts on the retained engine):
// the shared-edge data routes fetched and judged permissions through the
// retained engine WITHOUT establishing freshness first, so a read rule
// revoked after the engine's last freshness check kept serving the
// pre-revocation answer — the grant-Anyone / read-200 /
// revoke-to-Member / read-200 probe, while the root Worker's /api/card
// branch answered 403 (RenderEngine#ensureFreshness has run there since
// the earlier fix, worker.ts:310). The routes now run ensureFreshness()
// BEFORE the fetch / permission check. RED/GREEN PROOF (measured, see the
// per-test notes): with the pre-fix files restored, /api/card and /files
// FAIL these pins and the cross-site sign-out pin FAILS; with the fix all
// six pass. The /new/:type pin below rides along as a behavior pin ONLY —
// that route's create verdict reads its rule ids and party tables over
// the RAW driver (resolveRuleIdsByRuleKeys(fetcher.driver, ...) and the
// viewTaskPermissionStatements batch in bunny-edge-new-card-form.ts), so
// a rule flip cannot manifest as a stale verdict there; its gate covers
// the fetcher-cached inputs (the type fetchByKey, the chrome reads).
// Covered routes: /api/card/<name> (permission
// staleness), /files/<id>/<leaf> (data staleness: a committed content
// edit must move the carrier URL the next request derives), and
// /new/:type (defense-in-depth behavior pin).
//
// GAP 2 (SHOULD — sign-out bypassed the origin policy): GET|POST
// /_signout revoked the caller's session with NO origin check, so a
// cross-site GET with a live cookie revoked it (the
// Sec-Fetch-Site: cross-site + foreign Referer probe). The surface now
// runs the SAME checkRequestOrigin policy the write routes and sign-in
// run (request-origin.ts; docs/SECURITY.md's approved-divergences row
// names sign-out), with the handler passing the host's own policy
// derivation (applySecuritySettings over DECKO_ORIGIN_CHECK /
// DECKO_TRUSTED_ORIGINS). Pins: a cross-site GET is refused 403 and
// revokes NOTHING; the same-origin and address-bar (Sec-Fetch-Site:
// none) GET navigations still sign out.
//
// HARNESS: the handler boots its own deck on the first request through
// BunnyDbDriver over a local mock Hrana server (the same in-process shape
// tests/deploy/bunny-edge-engine-handler-parity.test.ts and
// tests/deploy/bunny-edge-session-viewer-roundtrip.test.ts prove), so the
// retained-across-requests property is REAL here: every request below
// shares the isolate's one deck, which is the precondition the staleness
// bug lives in. The revocations are direct SQL UPDATEs over the same
// database — the AFTER UPDATE triggers bump deck_data_version, the same
// stamp a write-path commit moves.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { DeckoName } from "../../src/card/name.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import {
  generatedEmail,
  generatedPassword,
} from "../../src/testing/generated-credentials.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const TS = "2026-10-08 12:00:00.000";
const SALT = "SALT";
const HOLDER = { id: 9100, name: "Joe User" };
const JUNCTION_ID = 9101;
const IDS = { account: 9201, email: 9202, password: 9203, salt: 9204, status: 9205 } as const;
const EMAIL = generatedEmail("bunny-edge-handler-freshness");
const PASSWORD = generatedPassword("bunny-edge-handler-freshness");
const DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");

/** Row ids. Rule rows the freshness scenarios flip carry their own
 *  id pair (junction / rule) so scenarios cannot contaminate each
 *  other's verdicts on the shared retained engine. */
const IDS_RULE = {
  all: 1,
  set: 2,
  read: 3,
  create: 4,
  type: 5,
  self: 6,
  anyone: 7,
  anonymous: 8,
  anyoneSignedIn: 9,
  cardtype: 11,
  signup: 12,
  phrase: 13,
  catchAllRead: 20,
  governedSelfJunction: 21,
  governedReadRule: 22,
  governedPage: 300,
  catchAllCreate: 30,
  signupTypeJunction: 31,
  signupCreateRule: 32,
  fileCard: 4000,
} as const;

let server: MockHranaServer;
let driver: BunnyDbDriver;
const env: Record<string, string> = {};

/** One cards row (seedCard's convention: side-backed junction rows store
 *  the CANONICAL KEY and keep name NULL; named rows store both — the key
 *  defaults from the name unless the caller passes one explicitly, the
 *  account junctions' name-only shape). */
async function insertCard(opts: {
  id?: number;
  name?: string | null;
  key?: string | null;
  codename?: string | null;
  leftId?: number | null;
  rightId?: number | null;
  typeId?: number | null;
  dbContent?: string | null;
  readRuleId?: number | null;
  readRuleClass?: string | null;
}): Promise<void> {
  const key = opts.key !== undefined ? opts.key : opts.name ? DeckoName.parse(opts.name).key : null;
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 1, ?, ?, NULL, 0, ?, ?)`,
    [
      opts.id ?? null,
      opts.name ?? null,
      key,
      opts.codename ?? null,
      opts.leftId ?? null,
      opts.rightId ?? null,
      TS,
      TS,
      opts.readRuleClass ?? null,
      opts.readRuleId ?? null,
      opts.typeId ?? 2,
      opts.dbContent ?? null,
    ],
  );
}

/** The junction-name helpers keep the key spelling identical to what a
 *  real save stores (DeckoName.parse().key — seedCard's keyColumn). */
function keyOf(name: string): string {
  return DeckoName.parse(name).key;
}

/** One card_references row (seedReference's shape — the graph the
 *  read-rule cache reads). */
async function insertReference(
  refererId: number,
  refereeId: number | null,
  refereeKey: string | null,
): Promise<void> {
  await driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, 'L', NULL)`,
    [refererId, refereeKey, refereeId],
  );
}

async function seedDeck(): Promise<void> {
  // The rule machinery + parties (codenames are what the verdict walk
  // resolves parties BY).
  await insertCard({ id: IDS_RULE.all, name: "*all", codename: "all", typeId: 2 });
  await insertCard({ id: IDS_RULE.set, name: "Set", codename: "set" });
  await insertCard({ id: IDS_RULE.read, name: "*read", codename: "read", typeId: 2 });
  await insertCard({ id: IDS_RULE.create, name: "*create", codename: "create", typeId: 2 });
  await insertCard({ id: IDS_RULE.type, name: "*type", codename: "type", typeId: 2 });
  await insertCard({ id: IDS_RULE.self, name: "*self", codename: "self", typeId: 2 });
  await insertCard({ id: IDS_RULE.anyone, name: "Anyone", codename: "anyone" });
  await insertCard({ id: IDS_RULE.anonymous, name: "Anonymous", codename: "anonymous" });
  await insertCard({ id: IDS_RULE.anyoneSignedIn, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await insertCard({ id: IDS_RULE.cardtype, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await insertCard({ id: IDS_RULE.signup, name: "Sign up", codename: "signup", typeId: 5 });
  // Stock account email/password rights assign_type :phrase; the form needs
  // the deck-local codename rather than assuming a numeric type ID.
  await insertCard({ id: IDS_RULE.phrase, name: "Phrase", codename: "phrase", typeId: IDS_RULE.cardtype });

  // READ universe: the catch-all (rule-universe completeness) grants
  // Anyone; the GOVERNED card's own *self rule is the one the first
  // scenario flips.
  await insertCard({
    id: IDS_RULE.catchAllRead, name: null, key: keyOf("*all+*read"),
    leftId: IDS_RULE.all, rightId: IDS_RULE.read, dbContent: "[[Anyone]]",
  });
  await insertReference(IDS_RULE.catchAllRead, IDS_RULE.anyone, "anyone");
  await insertCard({
    id: IDS_RULE.governedSelfJunction, name: null,
    key: keyOf("Governed Page+*self"),
    leftId: IDS_RULE.governedPage, rightId: IDS_RULE.self, typeId: 2,
  });
  await insertCard({
    id: IDS_RULE.governedReadRule, name: null,
    key: keyOf("Governed Page+*self+*read"),
    leftId: IDS_RULE.governedSelfJunction, rightId: IDS_RULE.read, typeId: 2,
    dbContent: "[[Anyone]]",
  });
  await insertReference(IDS_RULE.governedReadRule, IDS_RULE.anyone, "anyone");
  await insertCard({
    id: IDS_RULE.governedPage, name: "Governed Page", key: keyOf("Governed Page"),
    dbContent: "GOVERNED-BODY-SECRET",
    readRuleId: IDS_RULE.governedReadRule, readRuleClass: "*self",
  });

  // CREATE universe for /new/Sign_up: the *all fallback denies anonymous;
  // Sign up+*type+*create grants Anyone — the rule the second scenario flips.
  await insertCard({
    id: IDS_RULE.catchAllCreate, name: null, key: keyOf("*all+*create"),
    leftId: IDS_RULE.all, rightId: IDS_RULE.create, dbContent: "[[Anyone Signed In]]",
  });
  await insertReference(IDS_RULE.catchAllCreate, IDS_RULE.anyoneSignedIn, "anyone_signed_in");
  await insertCard({
    id: IDS_RULE.signupTypeJunction, name: null, key: keyOf("Sign up+*type"),
    leftId: IDS_RULE.signup, rightId: IDS_RULE.type, typeId: 2,
  });
  await insertCard({
    id: IDS_RULE.signupCreateRule, name: null, key: keyOf("Sign up+*type+*create"),
    leftId: IDS_RULE.signupTypeJunction, rightId: IDS_RULE.create, typeId: 2,
    dbContent: "[[Anyone]]",
  });
  await insertReference(IDS_RULE.signupCreateRule, IDS_RULE.anyone, "anyone");

  // The /files attachment card: the carrier content the third scenario
  // edits (a committed content change must move the derived URL).
  await insertCard({
    id: IDS_RULE.fileCard, name: "Quarterly Report", key: keyOf("Quarterly Report"),
    dbContent: "(my_bucket)/4000/quarterly-report.jpg",
  });

  // The full-chrome rows /new/:type renders its form and denial with (the
  // same shell the new-card route pin seeds).
  await insertCard({ id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
  await insertCard({ id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await insertCard({ id: 50, name: "Html", codename: "html", typeId: 5 });
  await insertCard({ id: 600, name: "*layout", codename: "layout", typeId: 52 });
  await insertCard({
    id: 22746, name: null, key: keyOf("*all+*layout"),
    leftId: IDS_RULE.all, rightId: 600, typeId: 52, dbContent: "Default Layout",
  });
  await insertCard({
    id: 22747, name: "Default Layout", key: keyOf("Default Layout"), typeId: 50,
    dbContent: `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>`,
  });
  await insertCard({ id: 22748, name: "*header", key: keyOf("*header"), typeId: 50, dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>` });
  await insertCard({ id: 22749, name: "*footer", key: keyOf("*footer"), typeId: 50, dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>` });

  // The synthetic account (the sign-out scenarios' session holder — the
  // proven substrate shape from the session-viewer roundtrip pin).
  await insertCard({ id: IDS.account, name: "*account", key: keyOf("*account"), codename: "account", typeId: 1 });
  await insertCard({ id: IDS.email, name: "*email", key: keyOf("*email"), codename: "email", typeId: 1 });
  await insertCard({ id: IDS.password, name: "*password", key: keyOf("*password"), codename: "password", typeId: 1 });
  await insertCard({ id: IDS.salt, name: "*salt", key: keyOf("*salt"), codename: "salt", typeId: 1 });
  await insertCard({ id: IDS.status, name: "*status", key: keyOf("*status"), codename: "status", typeId: 1 });
  await insertCard({ id: HOLDER.id, name: HOLDER.name, key: keyOf(HOLDER.name), typeId: 2 });
  await insertCard({
    id: JUNCTION_ID, name: `${HOLDER.name}+*account`, key: null,
    leftId: HOLDER.id, rightId: IDS.account,
  });
  await insertCard({ id: 9301, name: `${HOLDER.name}+*account+*email`, key: null, leftId: JUNCTION_ID, rightId: IDS.email, dbContent: EMAIL });
  await insertCard({ id: 9302, name: `${HOLDER.name}+*account+*password`, key: null, leftId: JUNCTION_ID, rightId: IDS.password, dbContent: DIGEST });
  await insertCard({ id: 9303, name: `${HOLDER.name}+*account+*salt`, key: null, leftId: JUNCTION_ID, rightId: IDS.salt, dbContent: SALT });
  await insertCard({ id: 9304, name: `${HOLDER.name}+*account+*status`, key: null, leftId: JUNCTION_ID, rightId: IDS.status, dbContent: "active" });
}

beforeAll(async () => {
  server = await startMockHranaServer();
  driver = new BunnyDbDriver({ url: server.url, authToken: "bunny-edge-handler-freshness-test" });
  for (const file of ["db/schema.sqlite.sql", "deploy/migrations/0005-auth-sessions.sql"]) {
    for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}${file}`, "utf8"))) {
      await driver.query(statement, []);
    }
  }
  await seedDeck();
  env.BUNNY_DATABASE_URL = server.url;
  env.BUNNY_DATABASE_AUTH_TOKEN = "bunny-edge-handler-freshness-test";
  // The write gate is ARMED so the sign-in surface mints real sessions
  // through the handler; the GET scenarios are unaffected (the write
  // surface answers no GET route, and the sign-out mount sits above it).
  env.DECKO_WRITE_PATH = "1";
});

afterAll(async () => {
  await server.close();
});

function edgeGet(pathname: string, headers?: Record<string, string>): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`, {
    headers: headers ?? {},
  });
}

/** One real sign-in through the handler's own write surface — the session
 *  rows the sign-out scenarios revoke. */
async function mintSessionToken(): Promise<string> {
  const response = await handleBunnyEngineRequest(
    new Request("https://script-placeholder.bunny.run/update/*signin", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        _method: "patch",
        "success[redirect]": "true",
        "success[mark]": "*previous",
        "card[subcards][+*email][content]": EMAIL,
        "card[subcards][+*password][content]": PASSWORD,
      }).toString(),
    }),
    env,
  );
  expect(response.status).toBe(303);
  const match = /^decko_ts_session=([^;]*)/.exec(response.headers.get("set-cookie") ?? "");
  expect(match, "sign-in must set a session cookie").not.toBeNull();
  return match![1] as string;
}

describe("shared edge handler — retained-engine freshness gates every data route", () => {
  it("/api/card: grant-Anyone reads 200, a committed revoke-to-signed-in flips it to 403 with no leaked body", async () => {
    const path = "/api/card/Governed%20Page";
    // Request 1 — the grant: 200 with the preview, over the freshly
    // booted (and now retained) engine whose verdict memoizes.
    const first = await handleBunnyEngineRequest(edgeGet(path), env);
    expect(first.status).toBe(200);
    const firstBody = await first.text();
    expect(firstBody).toContain("GOVERNED-BODY-SECRET");

    // The committed revocation: the rule card's grant moves from Anyone to
    // Anyone Signed In — content AND the reference row the read-rule cache
    // reads. Both UPDATEs ride the schema's AFTER UPDATE triggers, so
    // deck_data_version moves exactly as a write-path commit moves it.
    await driver.query("UPDATE cards SET db_content = '[[Anyone Signed In]]' WHERE id = ?", [
      IDS_RULE.governedReadRule,
    ]);
    await driver.query(
      "UPDATE card_references SET referee_id = ?, referee_key = 'anyone_signed_in' WHERE referer_id = ?",
      [IDS_RULE.anyoneSignedIn, IDS_RULE.governedReadRule],
    );

    // Request 2 — the failing probe: WITHOUT the freshness gate
    // the retained engine's memoized verdict (and cached rule rows)
    // answered 200 with the protected body. WITH the gate the moved stamp
    // resets the caches first and the fresh verdict answers 403, the CF
    // worker's shape, with no protected bytes.
    const second = await handleBunnyEngineRequest(edgeGet(path), env);
    expect(second.status).toBe(403);
    const secondBody = await second.text();
    expect(JSON.parse(secondBody)).toEqual({
      error: "permission denied",
      name: "Governed Page",
    });
    expect(secondBody).not.toContain("GOVERNED-BODY-SECRET");
    expect(secondBody).not.toContain("db_content_preview");
  });

  it("/new/:type: with the freshness gate armed, the committed revoke of the create rule still reaches the verdict (defense-in-depth pin, not a staleness repro — see the header)", async () => {
    const first = await handleBunnyEngineRequest(edgeGet("/new/Sign_up"), env);
    expect(first.status).toBe(200);
    const firstBody = await first.text();
    expect(firstBody).toContain(`action="/card/create"`);
    for (const field of ["email", "password"]) {
      expect(firstBody).toContain(`value="${IDS_RULE.phrase}" name="card[subcards][+*account][subcards][+*${field}][type_id]"`);
      expect(firstBody).toContain(`data-card-name="+*${field}" data-card-type-id="${IDS_RULE.phrase}" data-card-type-name="Phrase"`);
    }

    // The committed revocation of Sign up+*type+*create: Anyone -> Anyone
    // Signed In (the *all+*create fallback already denies anonymous, so
    // the fresh verdict is a denial). This flip reaches the verdict even
    // without the gate — the create walk reads rule ids and parties over
    // the RAW driver — so this pin pins the 200->403 BEHAVIOR with the
    // gate armed (and the gate's cost), not the staleness fix; the
    // staleness repros are the /api/card and /files pins above.
    await driver.query("UPDATE cards SET db_content = '[[Anyone Signed In]]' WHERE id = ?", [
      IDS_RULE.signupCreateRule,
    ]);
    await driver.query(
      "UPDATE card_references SET referee_id = ?, referee_key = 'anyone_signed_in' WHERE referer_id = ?",
      [IDS_RULE.anyoneSignedIn, IDS_RULE.signupCreateRule],
    );

    const second = await handleBunnyEngineRequest(edgeGet("/new/Sign_up"), env);
    expect(second.status).toBe(403);
    const secondBody = await second.text();
    expect(secondBody).toContain("<h1>Sorry!</h1>");
    expect(secondBody).toContain("to create this.");
    expect(secondBody).not.toContain(`action="/card/create"`);
  });

  it("/files: a committed content edit moves the carrier URL the very next request derives", async () => {
    const path = `/files/${IDS_RULE.fileCard}/quarterly-report.jpg`;
    const first = await handleBunnyEngineRequest(edgeGet(path), env);
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toContain("/4000/quarterly-report.jpg");

    // The committed content edit (the attachment's new stored carrier):
    // the AFTER UPDATE trigger moves deck_data_version.
    await driver.query("UPDATE cards SET db_content = '(my_bucket)/4000/annual-report.jpg' WHERE id = ?", [
      IDS_RULE.fileCard,
    ]);

    // WITHOUT the freshness gate the retained fetcher answered the cached
    // pre-edit row and kept 302ing to the old carrier. WITH the gate the
    // moved stamp resets the caches and the re-read derives the NEW url.
    const second = await handleBunnyEngineRequest(edgeGet(path), env);
    expect(second.status).toBe(302);
    const location = second.headers.get("location") ?? "";
    expect(location).toContain("/4000/annual-report.jpg");
    expect(location).not.toContain("quarterly-report");
  });
});

describe("shared edge handler — sign-out sits behind the origin policy", () => {
  it("a cross-site GET /_signout (foreign Sec-Fetch-Site and Referer) is refused 403 and revokes NOTHING", async () => {
    const token = await mintSessionToken();
    // The session is live before the probe.
    expect(await new SessionStore({ driver }).lookupSession(token)).not.toBeNull();

    const response = await handleBunnyEngineRequest(
      edgeGet("/_signout", {
        cookie: `decko_ts_session=${token}`,
        "sec-fetch-site": "cross-site",
        referer: "https://attacker.example/trap",
      }),
      env,
    );
    // The write routes' cross-origin refusal shape (write-routes.ts
    // crossOriginResponse, the JSON arm this surface speaks), and NO
    // cleared-cookie header: a refused request must not act.
    expect(response.status).toBe(403);
    const parsed = (await response.json()) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("cross-origin");
    expect(response.headers.get("set-cookie")).toBeNull();
    // The session row SURVIVES — the reproduction had the
    // cross-site GET revoke it.
    expect(await new SessionStore({ driver }).lookupSession(token)).not.toBeNull();
  });

  it("the same-origin GET navigation still signs out", async () => {
    const token = await mintSessionToken();
    const response = await handleBunnyEngineRequest(
      edgeGet("/_signout", {
        cookie: `decko_ts_session=${token}`,
        "sec-fetch-site": "same-origin",
        referer: "https://script-placeholder.bunny.run/Home",
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, revoked: true });
    expect(await new SessionStore({ driver }).lookupSession(token)).toBeNull();
  });

  it("the address-bar GET navigation (Sec-Fetch-Site: none) still signs out", async () => {
    const token = await mintSessionToken();
    const response = await handleBunnyEngineRequest(
      edgeGet("/_signout", {
        cookie: `decko_ts_session=${token}`,
        "sec-fetch-site": "none",
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, revoked: true });
    expect(await new SessionStore({ driver }).lookupSession(token)).toBeNull();
  });
});
