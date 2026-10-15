// Signed-in autocomplete permissions through the real local Hrana handler.
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
  env.DECKO_DECK_ORIGIN = "https://script-placeholder.bunny.run";
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

describe("signed-in autocomplete read permissions", () => {
  it("filters denied prefix candidates before the eight-result window and rechecks revocations", async () => {
    const token = await mintSessionToken();
    // Nine denied names sort before the readable names. Filtering a SQL
    // LIMIT 8 after the query would hide every legitimate suggestion.
    for (let i = 0; i < 9; i++) {
      await insertCard({ id: 10000 + i, name: `Permission Probe A${i}`, readRuleId: IDS_RULE.governedReadRule });
    }
    await insertCard({ id: 10020, name: "Permission Probe Z", readRuleId: IDS_RULE.catchAllRead });
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = 'anonymous' WHERE referer_id = ?", [IDS_RULE.anonymous, IDS_RULE.governedReadRule]);
    const headers = { cookie: `decko_ts_session=${token}` };
    for (const view of ["name_match", "name_complete"]) {
      const response = await handleBunnyEngineRequest(edgeGet(`/Basic.json?view=${view}&term=Permission%20Probe`, headers), env);
      expect(response.status).toBe(200);
      const result = await response.json() as Array<string | { action: string; value: string }>;
      const names = result.filter((item) => typeof item === "string" || item.action === "goto")
        .map((item) => typeof item === "string" ? item : item.value);
      expect(names).toEqual(["Permission Probe Z"]);
    }
    // The same retained actor engine sees a grant and its subsequent
    // revocation; a stale memo must not retain either answer.
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = 'anyone' WHERE referer_id = ?", [IDS_RULE.anyone, IDS_RULE.governedReadRule]);
    const allowed = await handleBunnyEngineRequest(edgeGet("/Basic.json?view=name_complete&term=Permission%20Probe%20A0", headers), env);
    expect(await allowed.json()).toEqual(["Permission Probe A0"]);
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = 'anonymous' WHERE referer_id = ?", [IDS_RULE.anonymous, IDS_RULE.governedReadRule]);
    const denied = await handleBunnyEngineRequest(edgeGet("/Basic.json?view=name_complete&term=Permission%20Probe%20A0", headers), env);
    expect(await denied.json()).toEqual([]);
  });

  it("uses the engine search-box view for readable prefix results, absolute URLs and create permission", async () => {
    await insertCard({ id: 10100, name: "Search", codename: "search_type", typeId: 5 });
    await insertCard({ id: 10101, name: "*search", codename: "search", typeId: 10100, dbContent: "{}", readRuleId: IDS_RULE.catchAllRead });
    await insertCard({ id: 10110, name: "Boxprobe Visible", readRuleId: IDS_RULE.catchAllRead });
    await insertCard({ id: 10111, name: "Boxprobe Hidden", readRuleId: IDS_RULE.governedReadRule });
    await insertCard({ id: 10112, name: "Other Boxprobe", readRuleId: IDS_RULE.catchAllRead });
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = 'anonymous' WHERE referer_id = ?", [IDS_RULE.anonymous, IDS_RULE.governedReadRule]);
    // Neither Anonymous nor the signed-in actor may create new cards.
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = 'anonymous' WHERE referer_id = ?", [IDS_RULE.anonymous, IDS_RULE.catchAllCreate]);
    const token = await mintSessionToken();
    const response = await handleBunnyEngineRequest(edgeGet("/*search/search_box_complete.json?term=Boxprobe", { cookie: `decko_ts_session=${token}` }), env);
    expect(response.status).toBe(200);
    const items = await response.json() as Array<{ action: string; value: string; url: string }>;
    expect(items.filter((item) => item.action === "goto").map((item) => item.value), JSON.stringify(items)).toEqual(["Boxprobe Visible"]);
    expect(items.some((item) => item.action === "add")).toBe(false);
    expect(items.every((item) => item.url.startsWith("https://script-placeholder.bunny.run/"))).toBe(true);
  });

  it("keeps two actors' suggestion permissions isolated in one warm handler", async () => {
    await insertCard({ id: 10200, name: "Other Viewer" });
    await insertCard({ id: 10201, name: "Actorprobe Private", readRuleId: IDS_RULE.governedReadRule });
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = ? WHERE referer_id = ?", [HOLDER.id, keyOf(HOLDER.name), IDS_RULE.governedReadRule]);
    const owner = await mintSessionToken();
    const other = await new SessionStore({ driver }).createSession(10200);
    for (const [token, expected] of [[owner, ["Actorprobe Private"]], [other.token, []], [owner, ["Actorprobe Private"]]] as const) {
      const response = await handleBunnyEngineRequest(edgeGet("/Basic.json?view=name_complete&term=Actorprobe", { cookie: `decko_ts_session=${token}` }), env);
      expect(await response.json()).toEqual(expected);
    }
  });

  it("serves stock coded files without storage credentials and isolates/rechecks the session read scope", async () => {
    await driver.query("UPDATE cards SET db_content = ':favicon/carrierwave.png', read_rule_id = ?, read_rule_class = '*self' WHERE id = 103", [IDS_RULE.governedReadRule]);
    await insertCard({ id: 10211, name: "Coded foreign alias", dbContent: ":favicon/carrierwave.png", readRuleId: IDS_RULE.catchAllRead });
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = ? WHERE referer_id = ?", [HOLDER.id, keyOf(HOLDER.name), IDS_RULE.governedReadRule]);
    const owner = await mintSessionToken();
    const other = await new SessionStore({ driver }).createSession(10200);
    for (const [token, status] of [[owner, 200], [other.token, 404], [null, 404], [owner, 200]] as const) {
      const response = await handleBunnyEngineRequest(edgeGet("/files/:favicon/carrierwave-small.png", token ? { cookie: `decko_ts_session=${token}` } : {}), env);
      expect(response.status).toBe(status);
      if (status === 200) expect(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex")).toBe("cb2cd4c1b77989c7ab5c86e80296f6c7ae34a6b7414af87d38a9d26e81280b04");
    }
    expect((await handleBunnyEngineRequest(edgeGet("/files/~10211/carrierwave-small.png"), env)).status).toBe(404);
    await driver.query("UPDATE card_references SET referee_id = ?, referee_key = 'anonymous' WHERE referer_id = ?", [IDS_RULE.anonymous, IDS_RULE.governedReadRule]);
    expect((await handleBunnyEngineRequest(edgeGet("/files/:favicon/carrierwave-small.png", { cookie: `decko_ts_session=${owner}` }), env)).status).toBe(404);
    expect((await handleBunnyEngineRequest(edgeGet("/files/:favicon/carrierwave-small.png"), env)).status).toBe(200);
  });

  it("origin-checks GET /delete/*signin before revoking the session", async () => {
    const token = await mintSessionToken();
    const cookie = `decko_ts_session=${token}`;
    const denied = await handleBunnyEngineRequest(edgeGet("/delete/*signin", {
      cookie, "sec-fetch-site": "cross-site", referer: "https://attacker.example/",
    }), env);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("set-cookie")).toBeNull();
    expect(await new SessionStore({ driver }).lookupSession(token)).not.toBeNull();
    const allowed = await handleBunnyEngineRequest(edgeGet("/delete/*signin", {
      cookie, "sec-fetch-site": "same-origin", referer: "https://script-placeholder.bunny.run/",
    }), env);
    expect(allowed.status).toBe(303);
    expect(await new SessionStore({ driver }).lookupSession(token)).toBeNull();
  });
});

