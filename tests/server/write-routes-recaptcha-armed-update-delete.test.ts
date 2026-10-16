// Armed route pins for UPDATE and DELETE over the production recaptcha seat
// (WriteRouteContext.recaptcha) — the seat file's armed pin exercised
// CREATE only, but Ruby's event
// :recaptcha carries no `on:` clause (card-mod-recaptcha-0.20.0
// set/all/recaptcha.rb:50 — the dispatcher's absent-on rule applies it to
// every action) and its validate_recaptcha? predicate has no action operand
// (recaptcha.rb:68-72), so the guard reaches update and delete too.
//
// NO vi.mock in this file (the seat file's pattern): every engine is the
// real createCardActionEngineForSession; the host config carries NO
// captchaRuleContent, so the guard's rule content is the deck's own
// *all+*captcha rule resolved by the engine's rule walk (ruleContentForCard
// — recaptcha.rb:22 Card::Rule.toggle(rule(:captcha)); rule-content-walk.ts
// rule/all.rb:5-15). The update/delete permission rules grant [[Anyone]]
// (the anonymous-permission-pins granted-deck flip) so the anonymous session
// passes ok_to_update?/ok_to_delete? (permissions.rb:148-153/:155-157 —
// which run BEFORE the validate-stage guard: card-action-engine.ts:995 and
// :1560) and REACHES the guard instead of 403-ing in front of it.
//
// The eight arms (one context + bridge per arm; arms 1-6 share the granted
// deck, arm 7 the DELETE-denied twin deck, arm 8 the UPDATE-denied twin
// deck):
//   (1) UPDATE, armed + failed verify -> 422 recaptcha shape, the stub rode
//       the posted recaptcha_token to siteverify exactly once, zero rows.
//   (2) UPDATE, armed + human verdict (siteverify action "update" —
//       recaptcha.rb:38 matches the save's own card.act.action) -> 200 JSON
//       cud_success, content landed, updater_id = the Anonymous card.
//   (3) UPDATE, context UNARMED -> 200 — the walk alone never blocks (the
//       byte-identity-for-unarmed-hosts control, the seat file's arm 3).
//   (4) DELETE, armed + failed verify -> refused whole (422 recaptcha, zero
//       rows, stub once). The delete path arms the guard — deleteCard runs
//       prepareRecaptchaSaveInput before its :validate dispatch (Ruby's
//       delete! IS an update save with trash: true, trash.rb:11-21
//       add_to_trash -> update!, and event :recaptcha carries no `on:`
//       clause, recaptcha.rb:50), DeleteCardInput carries recaptchaToken
//       (types.ts) and the DELETE wire plumbs it (write-routes.ts delete
//       leg).
//   (5) DELETE, armed + human verdict -> the delete LANDS (303, trash flip,
//       updater_id = the Anonymous card) with the stub called exactly once
//       (siteverify action "delete" — recaptcha.rb:38 matches the trash
//       save's own card.act.action): the verdict's effect, not an absence.
//   (6) DELETE, context UNARMED -> 303 — the same control shape as arm 3.
//   (7) DELETE, ARMED + the *all+*delete rule DENYING the actor
//       ([[Editor]], the anonymous-permission-pins deny shape) + token
//       present -> 403 permission-denied from the permission walk BEFORE the
//       guard: ZERO siteverify calls, trash unchanged, zero act rows. A
//       second storage — *all+*delete is one rule card (left 1, right 12)
//       and cannot hold both verdicts in one deck. ARM 5 IS ITS MIRROR: on
//       the granted twin the identical armed shape + human token rides to
//       siteverify exactly once and 303s the trash flip, so the 403 is
//       provably the permission's verdict, not the guard's. (Structurally,
//       assertCanWrite at card-action-engine.ts:1629 precedes
//       prepareRecaptchaSaveInput at :1649; the UNARMED 403s are the
//       anonymous-permission-pins arm (c).)
//   (8) UPDATE, ARMED + the *all+*update rule DENYING the actor
//       ([[Editor]], the anonymous-permission-pins arm (b) deny shape) +
//       token present -> 403 permission-denied from the permission walk
//       BEFORE the guard: ZERO siteverify calls, content unchanged, zero
//       act rows. The update verb's twin of arm 7 (its OWN storage —
//       *all+*update is one rule card, left 1, right 3, and cannot hold
//       both verdicts in one deck). ARM 2 IS ITS MIRROR: on the granted
//       twin the identical armed shape + human token rides to siteverify
//       exactly once and 200s the save, so the 403 is provably the
//       permission's verdict, not the guard's.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import type { CardActionRecaptchaConfig } from "../../src/card/actions/card-action-engine.js";
import {
  actCount,
  makeWriteRouteServer as makeServer,
  stubVerify,
} from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
// Ordinary prose targets must not inherit seedCard's historical typeId2,
// which this fixture names Set (and therefore correctly validates JSON).
const RICH_TEXT_TYPE_ID = 30;
const INVALID_SET_TARGET_ID = 28;
const ANON_CARD_ID = 14;
const CAPTCHA_SETTING_ID = 18;
const CAPTCHA_RULE_ID = 19;
const UPDATE_REFUSAL_TARGET_ID = 20;
const UPDATE_HUMAN_TARGET_ID = 21;
const UPDATE_UNARMED_TARGET_ID = 22;
const DELETE_REFUSAL_TARGET_ID = 23;
const DELETE_HUMAN_TARGET_ID = 24;
const DELETE_UNARMED_TARGET_ID = 25;
// arm 7's denied twin deck (its OWN storage, so its id space is fresh; 7 is
// unused by the granted deck's layout above)
const EDITOR_ROLE_ID = 7;
const DELETE_RULE_DENIED_TARGET_ID = 26;
// arm 8's UPDATE-denied twin deck (its OWN storage, so its id space is
// fresh too)
const UPDATE_RULE_DENIED_TARGET_ID = 27;
const DEFAULT_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** The host-side armed config: keys set, NO captchaRuleContent — the
 *  engine's rule walk is the rule source (the proven default), verify is
 *  the test's stub (the named seam, CardActionRecaptchaConfig.verify). */
function armedRecaptchaConfig(stub: ReturnType<typeof stubVerify>): CardActionRecaptchaConfig {
  return { siteKey: "k", secretKey: "s", verify: stub.verify };
}

/** The granted deck + the real captcha rule: the anonymous-permission-pins
 *  granted-deck seed (update/delete -> [[Anyone]]) plus *all+*captcha "1"
 *  (the seat file's rule shape — the gem's data/real.yml content,
 *  Card::Rule.toggle("1"), rule.rb:11-13) plus one live target card per
 *  arm (pre-seeded, no codename — seeds write no act rows). */
async function seedArmedUpdateDeleteDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(RICH_TEXT_TYPE_ID, "RichText", { codename: "basic", typeId: RICH_TEXT_TYPE_ID });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  // the permission rules: [[Anyone]] grants the anonymous session through
  // ok_to_update? / ok_to_delete? so the arms REACH the validate-stage guard
  await seedCard(s, { id: 11, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 11, 6, "anyone");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone]]" });
  await seedReference(s, 12, 6, "anyone");
  await byId(ANON_CARD_ID, "Anonymous User", { codename: "anonymous" });
  await byId(CAPTCHA_SETTING_ID, "*captcha", { codename: "captcha" });
  // the real rule content the guard's walk resolves (recaptcha.rb:22 via
  // ruleContentForCard; Card::Rule.toggle("1") is on — rule.rb:11-13)
  await seedCard(s, { id: CAPTCHA_RULE_ID, leftId: 1, rightId: CAPTCHA_SETTING_ID, dbContent: "1" });
  // the arms' targets (each arm owns its card; no shared state)
  await byId(UPDATE_REFUSAL_TARGET_ID, "Armed Update Refusal Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "update refusal before",
  });
  await byId(UPDATE_HUMAN_TARGET_ID, "Armed Update Human Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "update human before",
  });
  await byId(UPDATE_UNARMED_TARGET_ID, "Armed Update Unarmed Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "update unarmed before",
  });
  await byId(DELETE_REFUSAL_TARGET_ID, "Armed Delete Refusal Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "delete refusal body",
  });
  await byId(DELETE_HUMAN_TARGET_ID, "Armed Delete Human Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "delete human body",
  });
  await byId(DELETE_UNARMED_TARGET_ID, "Armed Delete Unarmed Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "delete unarmed body",
  });
  await byId(INVALID_SET_TARGET_ID, "Set Payload Refusal Target", { typeId: SET_TYPE_ID, dbContent: "{}" });
}

/** Arm 7's DENIED twin of the granted deck: the same rule-walk sources the
 *  sibling arms use, except *all+*delete -> [[Editor]] — the
 *  anonymous-permission-pins deny shape (Editor's parties are Anyone +
 *  Anonymous only, account_holder.rb:27-40, so ok_to_delete? = bare
 *  permit :delete refuses the anonymous session, permissions.rb:155-157).
 *  *all+*update stays [[Anyone]]: the flip vs the granted deck is one
 *  variable, the delete verb's verdict. The *all+*captcha rule is seeded
 *  too — the deck is ARMED-shaped, so arm 7's zero siteverify calls are the
 *  WALK's refusal, not an absence of a guard. */
async function seedArmedDeleteDeniedDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(RICH_TEXT_TYPE_ID, "RichText", { codename: "basic", typeId: RICH_TEXT_TYPE_ID });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(EDITOR_ROLE_ID, "Editor"); // the deny rule's party (no codename — the pins' seed)
  await seedCard(s, { id: 11, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 11, 6, "anyone");
  // THE FLIP: [[Editor]] denies the anonymous session (the pins' deny decks
  // — write-routes-anonymous-permission-pins.test.ts:211-224)
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Editor]]" });
  await seedReference(s, 12, EDITOR_ROLE_ID, "editor");
  await byId(ANON_CARD_ID, "Anonymous User", { codename: "anonymous" });
  await byId(CAPTCHA_SETTING_ID, "*captcha", { codename: "captcha" });
  await seedCard(s, { id: CAPTCHA_RULE_ID, leftId: 1, rightId: CAPTCHA_SETTING_ID, dbContent: "1" });
  await byId(DELETE_RULE_DENIED_TARGET_ID, "Armed Delete Rule Denied Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "delete rule denied body",
  });
}

/** Arm 8's UPDATE-denied twin of the granted deck: the same rule-walk
 *  sources the sibling arms use, except *all+*update -> [[Editor]] — the
 *  anonymous-permission-pins deny shape for the update verb (its arm (b),
 *  write-routes-anonymous-permission-pins.test.ts:461-477; Editor's parties
 *  are Anyone + Anonymous only, account_holder.rb:27-40, so ok_to_update?
 *  = bare permit :update refuses the anonymous session,
 *  permissions.rb:148-153). *all+*delete stays [[Anyone]]: the flip vs the
 *  granted deck is one variable, the update verb's verdict. The
 *  *all+*captcha rule is seeded too — the deck is ARMED-shaped, so arm 8's
 *  zero siteverify calls are the WALK's refusal, not an absence of a
 *  guard. */
async function seedArmedUpdateDeniedDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(RICH_TEXT_TYPE_ID, "RichText", { codename: "basic", typeId: RICH_TEXT_TYPE_ID });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(EDITOR_ROLE_ID, "Editor"); // the deny rule's party (no codename — the pins' seed)
  // THE FLIP: [[Editor]] denies the anonymous session (the pins' deny decks
  // — write-routes-anonymous-permission-pins.test.ts:215-222)
  await seedCard(s, { id: 11, leftId: 1, rightId: 3, dbContent: "[[Editor]]" });
  await seedReference(s, 11, EDITOR_ROLE_ID, "editor");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone]]" });
  await seedReference(s, 12, 6, "anyone");
  await byId(ANON_CARD_ID, "Anonymous User", { codename: "anonymous" });
  await byId(CAPTCHA_SETTING_ID, "*captcha", { codename: "captcha" });
  await seedCard(s, { id: CAPTCHA_RULE_ID, leftId: 1, rightId: CAPTCHA_SETTING_ID, dbContent: "1" });
  await byId(UPDATE_RULE_DENIED_TARGET_ID, "Armed Update Rule Denied Target", {
    typeId: RICH_TEXT_TYPE_ID,
    dbContent: "update rule denied body",
  });
}

async function call(
  base: string,
  method: string,
  path: string,
  opts: { form?: Record<string, string> } = {},
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  json: () => Record<string, unknown>;
}> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }
  // NO token, NO cookie — every request rides the signed-out session
  // (rest.rb:37-40's fall-through = Anonymous, auth/current.rb:58-63).
  const res = await fetch(`${base}${path}`, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return {
    status: res.status,
    headers: responseHeaders,
    body: text,
    json: () => JSON.parse(text) as Record<string, unknown>,
  };
}

/** Verify the refusal preserves every card/history/reference/sequence row,
 * not merely the target's content and absence of its own act. */
async function mutationSnapshot(s: RenderTestStorage) {
  return Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_references", "sqlite_sequence"]
    .map(async table => (await s.counting.query(`SELECT * FROM ${table} ORDER BY rowid`, [])).rows));
}

// ONE deck (the granted + captcha-ruled seed) serves all six arms, each
// through its OWN context + bridge (no shared stub state; mutations are
// per-target-card).
let storage: RenderTestStorage | undefined;
let updRefusalServer: http.Server;
let updHumanServer: http.Server;
let updUnarmedServer: http.Server;
let delRefusalServer: http.Server;
let delHumanServer: http.Server;
let delUnarmedServer: http.Server;
let updRefusalBaseUrl = "";
let updHumanBaseUrl = "";
let updUnarmedBaseUrl = "";
let delRefusalBaseUrl = "";
let delHumanBaseUrl = "";
let delUnarmedBaseUrl = "";
let updRefusalStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
let updHumanStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
let delRefusalStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
let delHumanStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
// arm 7's denied twin (its OWN storage, context, bridge and stub — no shared
// stub state, the file's one-context-per-arm rule)
let delDeniedStorage: RenderTestStorage | undefined;
let delDeniedServer: http.Server;
let delDeniedBaseUrl = "";
let delDeniedStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
// arm 8's UPDATE-denied twin (its OWN storage, context, bridge and stub —
// the same one-context-per-arm rule)
let updDeniedStorage: RenderTestStorage | undefined;
let updDeniedServer: http.Server;
let updDeniedBaseUrl = "";
let updDeniedStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedArmedUpdateDeleteDeck(storage);

  // the PRODUCTION seat, armed at each guarded context (no module mock —
  // every engine is the real createCardActionEngineForSession). The human
  // verdicts' canned bodies carry action matching the save's OWN action
  // (recaptcha.rb:38 — the update save's card.act.action is "update").
  const updRefusalStub = stubVerify({ success: false });
  updRefusalStubCalls = updRefusalStub.calls;
  const updHumanStub = stubVerify({ success: true, score: 0.9, action: "update" });
  updHumanStubCalls = updHumanStub.calls;
  const delRefusalStub = stubVerify({ success: false });
  delRefusalStubCalls = delRefusalStub.calls;
  const delHumanStub = stubVerify({ success: true, score: 0.9, action: "delete" });
  delHumanStubCalls = delHumanStub.calls;

  // arm 7's denied twin deck + its OWN armed context: the stub's canned body
  // is a HUMAN verdict on purpose — a valid token must still not reach
  // siteverify when the rule denies, so the pin's zero-calls assertion is
  // the walk's verdict, not a bad-token artifact.
  delDeniedStorage = await createRenderTestStorage();
  await runAuthMigrations(delDeniedStorage.counting);
  await seedArmedDeleteDeniedDeck(delDeniedStorage);
  const delDeniedStub = stubVerify({ success: true, score: 0.9, action: "delete" });
  delDeniedStubCalls = delDeniedStub.calls;
  const delDeniedBridge = await makeServer(
    delDeniedStorage,
    {
      driver: delDeniedStorage.counting,
      fetcher: delDeniedStorage.fetcher,
      recaptcha: armedRecaptchaConfig(delDeniedStub),
    },
    { get: "record-404" },
  );
  delDeniedServer = delDeniedBridge.server;
  delDeniedBaseUrl = delDeniedBridge.url;

  // arm 8's UPDATE-denied twin deck + its OWN armed context: the stub's
  // canned body is a HUMAN verdict on purpose (action "update" —
  // recaptcha.rb:38 matches the save's own card.act.action) — a valid token
  // must still not reach siteverify when the rule denies, so the pin's
  // zero-calls assertion is the walk's verdict, not a bad-token artifact.
  updDeniedStorage = await createRenderTestStorage();
  await runAuthMigrations(updDeniedStorage.counting);
  await seedArmedUpdateDeniedDeck(updDeniedStorage);
  const updDeniedStub = stubVerify({ success: true, score: 0.9, action: "update" });
  updDeniedStubCalls = updDeniedStub.calls;
  const updDeniedBridge = await makeServer(
    updDeniedStorage,
    {
      driver: updDeniedStorage.counting,
      fetcher: updDeniedStorage.fetcher,
      recaptcha: armedRecaptchaConfig(updDeniedStub),
    },
    { get: "record-404" },
  );
  updDeniedServer = updDeniedBridge.server;
  updDeniedBaseUrl = updDeniedBridge.url;

  const armed = (stub: ReturnType<typeof stubVerify>): WriteRouteContext => ({
    driver: storage!.counting,
    fetcher: storage!.fetcher,
    recaptcha: armedRecaptchaConfig(stub),
  });
  const unarmed = (): WriteRouteContext => ({
    driver: storage!.counting,
    fetcher: storage!.fetcher,
  });

  for (const [, context, setter] of [
    ["updRefusal", armed(updRefusalStub), (v: { server: http.Server; url: string }) => {
      updRefusalServer = v.server;
      updRefusalBaseUrl = v.url;
    }],
    ["updHuman", armed(updHumanStub), (v: { server: http.Server; url: string }) => {
      updHumanServer = v.server;
      updHumanBaseUrl = v.url;
    }],
    ["updUnarmed", unarmed(), (v: { server: http.Server; url: string }) => {
      updUnarmedServer = v.server;
      updUnarmedBaseUrl = v.url;
    }],
    ["delRefusal", armed(delRefusalStub), (v: { server: http.Server; url: string }) => {
      delRefusalServer = v.server;
      delRefusalBaseUrl = v.url;
    }],
    ["delHuman", armed(delHumanStub), (v: { server: http.Server; url: string }) => {
      delHumanServer = v.server;
      delHumanBaseUrl = v.url;
    }],
    ["delUnarmed", unarmed(), (v: { server: http.Server; url: string }) => {
      delUnarmedServer = v.server;
      delUnarmedBaseUrl = v.url;
    }],
  ] as const) {
    const bridge = await makeServer(storage, context, { get: "record-404" });
    setter(bridge);
  }
}, 60_000);

afterAll(() => {
  updRefusalServer?.close();
  updHumanServer?.close();
  updUnarmedServer?.close();
  delRefusalServer?.close();
  delHumanServer?.close();
  delUnarmedServer?.close();
  delDeniedServer?.close();
  updDeniedServer?.close();
  storage?.close();
  delDeniedStorage?.close();
  updDeniedStorage?.close();
});

describe("armed route pins: UPDATE through the production recaptcha seat (no module mock)", () => {
  it("(1) armed + failed verify: the update is refused whole — 422 recaptcha shape, the token rode to siteverify once, zero rows", async () => {
    const before = await mutationSnapshot(storage!);
    const res = await call(updRefusalBaseUrl, "PUT", "/Armed_Update_Refusal_Target.json", {
      form: {
        "card[content]": "refused update body",
        recaptcha_token: "tok-upd-refusal",
      },
    });
    expect(res.status).toBe(422); // UserError class (error.rb:21), not a 403 code
    // card-mod-format set/all/error.rb json :errors view: {attribute => message}
    expect(res.json()).toMatchObject({
      error_status: 422,
      errors: { recaptcha: "Looks like you are not a human" },
    });
    // the route's recaptcha_token param plumbed through the seat-armed
    // UPDATE engine (prepareRecaptchaSaveInput on the update path,
    // card-action-engine.ts:1099) to the transport with the default URL
    expect(updRefusalStubCalls).toEqual([
      { url: DEFAULT_VERIFY_URL, query: { secret: "s", response: "tok-upd-refusal" } },
    ]);
    // the refusal is whole: content and stamper byte-identical, no act
    // (the seeded row's stamper is the seed's own — seeds stamp updater_id 1
    // — so the pin is BEFORE/AFTER equality, the anonymous pins' arm (b) shape)
    const row = await storage!.counting.query<{ db_content: string | null; updater_id: number | null }>(
      `SELECT db_content, updater_id FROM cards WHERE id = ?`,
      [UPDATE_REFUSAL_TARGET_ID],
    );
    expect(row.rows[0]).toEqual({ db_content: "update refusal before", updater_id: 1 });
    expect(await actCount(storage!, "armed_update_refusal_target")).toBe(0);
    expect(await mutationSnapshot(storage!)).toEqual(before);
  });

  it("(2) armed + human verdict: the update lands — 200 cud_success, content saved, updater_id = the Anonymous card", async () => {
    const res = await call(updHumanBaseUrl, "PUT", "/Armed_Update_Human_Target.json", {
      form: {
        "card[content]": "human verdict update body",
        recaptcha_token: "tok-upd-human",
      },
    });
    expect(res.status, res.body).toBe(200); // the cud_success JSON flavor (rest.rb:80-89)
    expect(res.json()).toMatchObject({ verb: "update" });
    expect(updHumanStubCalls.map((c) => c.query.response)).toEqual(["tok-upd-human"]);
    const row = await storage!.counting.query<{
      db_content: string | null;
      updater_id: number | null;
      trash: number;
    }>(`SELECT db_content, updater_id, trash FROM cards WHERE id = ?`, [UPDATE_HUMAN_TARGET_ID]);
    expect(row.rows[0]?.db_content).toBe("human verdict update body");
    expect(row.rows[0]?.updater_id).toBe(ANON_CARD_ID); // set_stamper (account.rb:20-23)
    expect(row.rows[0]?.trash).toBe(0); // an update, not a trash flip
    const act = await storage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = ? ORDER BY a.id DESC LIMIT 1`,
      ["armed_update_human_target"],
    );
    expect(act.rows[0]?.actor_id).toBe(ANON_CARD_ID);
  });

  it("(3) the SAME deck + rule, context UNARMED: the update lands — the walk alone never blocks", async () => {
    const res = await call(updUnarmedBaseUrl, "PUT", "/Armed_Update_Unarmed_Target.json", {
      form: { "card[content]": "unarmed update body" },
    });
    expect(res.status, res.body).toBe(200);
    const row = await storage!.counting.query<{ db_content: string | null; updater_id: number | null }>(
      `SELECT db_content, updater_id FROM cards WHERE id = ?`,
      [UPDATE_UNARMED_TARGET_ID],
    );
    expect(row.rows[0]?.db_content).toBe("unarmed update body");
    expect(row.rows[0]?.updater_id).toBe(ANON_CARD_ID);
  });
});

describe("armed route pins: DELETE through the production recaptcha seat (no module mock)", () => {
  // THE DELETE GUARD PIN: the delete path
  // prepares the guard snapshot (deleteCard ->
  // prepareRecaptchaSaveInput, card-action-engine.ts — Ruby's delete! IS
  // an update save with trash: true, trash.rb:11-21, and event :recaptcha
  // has no `on:` clause, recaptcha.rb:50) and the wire plumbs the token
  // (write-routes.ts delete leg).
  it("(4) armed + failed verify: the delete is refused whole — 422 recaptcha shape, the token rode to siteverify once, zero rows", async () => {
    const before = await mutationSnapshot(storage!);
    // the .json flavor — arm (1)'s shape: the refusal's error BODY is
    // asserted, and the JSON error shape (error.rb:21 UserError -> 422)
    // is what carries {code, message}
    const res = await call(delRefusalBaseUrl, "DELETE", "/Armed_Delete_Refusal_Target.json", {
      form: { recaptcha_token: "tok-del-refusal" },
    });
    expect(res.status).toBe(422); // the guard's refusal, not the 303 success redirect
    // card-mod-format set/all/error.rb json :errors view: {attribute => message}
    expect(res.json()).toMatchObject({
      error_status: 422,
      errors: { recaptcha: "Looks like you are not a human" },
    });
    // the route's recaptcha_token param plumbed through the seat-armed
    // DELETE engine (prepareRecaptchaSaveInput on the delete path) to the
    // transport with the default URL
    expect(delRefusalStubCalls).toEqual([
      { url: DEFAULT_VERIFY_URL, query: { secret: "s", response: "tok-del-refusal" } },
    ]);
    // the refusal is whole: the card survives, untrashed, no act
    const row = await storage!.counting.query<{ trash: number; db_content: string | null }>(
      `SELECT trash, db_content FROM cards WHERE id = ?`,
      [DELETE_REFUSAL_TARGET_ID],
    );
    expect(row.rows[0]?.trash).toBe(0);
    expect(row.rows[0]?.db_content).toBe("delete refusal body");
    expect(await actCount(storage!, "armed_delete_refusal_target")).toBe(0);
    expect(await mutationSnapshot(storage!)).toEqual(before);
  });

  it("(5) armed + human verdict: the delete lands — 303, trash flip, updater_id = the Anonymous card, the verdict rode to siteverify once (action \"delete\")", async () => {
    const res = await call(delHumanBaseUrl, "DELETE", "/Armed_Delete_Human_Target", {
      form: { recaptcha_token: "tok-del-human" },
    });
    expect(res.status).toBe(303); // the plain-form hard redirect (response.rb:31,41)
    // the guard verifies on delete too: the human verdict's canned body
    // carries action "delete" — recaptcha.rb:38 matches the save's OWN
    // card.act.action, and a trash flip save's action is :delete
    expect(delHumanStubCalls).toEqual([
      { url: DEFAULT_VERIFY_URL, query: { secret: "s", response: "tok-del-human" } },
    ]);
    const row = await storage!.counting.query<{ trash: number; updater_id: number | null }>(
      `SELECT trash, updater_id FROM cards WHERE id = ?`,
      [DELETE_HUMAN_TARGET_ID],
    );
    expect(row.rows[0]?.trash).toBe(1); // the trash flip landed
    expect(row.rows[0]?.updater_id).toBe(ANON_CARD_ID); // set_stamper (account.rb:20-23)
    const act = await storage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = ? ORDER BY a.id DESC LIMIT 1`,
      ["armed_delete_human_target"],
    );
    expect(act.rows[0]?.actor_id).toBe(ANON_CARD_ID);
  });

  it("(6) the SAME deck + rule, context UNARMED: the delete lands — the walk alone never blocks", async () => {
    const res = await call(delUnarmedBaseUrl, "DELETE", "/Armed_Delete_Unarmed_Target");
    expect(res.status).toBe(303);
    const row = await storage!.counting.query<{ trash: number; updater_id: number | null }>(
      `SELECT trash, updater_id FROM cards WHERE id = ?`,
      [DELETE_UNARMED_TARGET_ID],
    );
    expect(row.rows[0]?.trash).toBe(1);
    expect(row.rows[0]?.updater_id).toBe(ANON_CARD_ID);
  });
});

describe("armed route pins: DELETE where the RULE denies the actor (permission outranks the guard on the delete verb)", () => {
  // THE PERMISSION-FIRST PIN: deleteCard
  // runs assertCanWrite(card, "delete") at card-action-engine.ts:1629
  // BEFORE prepareRecaptchaSaveInput at :1649 (Ruby's chain order,
  // permissions.rb:155-157 before the :validate stage); the UNARMED
  // 403s are the anonymous-permission-pins arm (c). End-to-end: on the ARMED
  // denied twin, a token-present delete 403s from the permission walk with
  // the guard never consulted. ARM 5 is the mirror half: same armed shape,
  // same anonymous session, token present — on the GRANTED deck it rides to
  // siteverify exactly once and 303s the trash flip, so this 403 is
  // provably the permission's verdict and not the guard's.
  it("(7) armed + rule-DENIED delete + token present: 403 permission-denied from the walk — zero siteverify calls, trash unchanged, zero act rows", async () => {
    const before = await mutationSnapshot(delDeniedStorage!);
    // the .json mark — arm (1)/(4)'s shape: the JSON error body is what
    // carries {code, message} (errorResponse's json arm, write-routes.ts
    // :564-568; permission-denied maps to 403 at :558-562, the guard's
    // refusal is 422, never 403)
    const res = await call(delDeniedBaseUrl, "DELETE", "/Armed_Delete_Rule_Denied_Target.json", {
      form: { recaptcha_token: "tok-del-rule-denied" },
    });
    expect(res.status).toBe(403); // Card::Error::PermissionDenied (error.rb:104)
    // the walk's verdict (permissions.rb:117 you_cant, under :permission_denied)
    // — not the guard's "not a human"
    expect(res.json()).toMatchObject({ error_status: 403 });
    expect((res.json().errors as { permission_denied: string }).permission_denied)
      .toContain("You don't have permission to delete");
    // THE DECISIVE HALF: the ARMED context's stub was never consulted — even
    // a human-verdict token (the stub's canned body is success:true) cannot
    // buy the delete past the rule
    expect(delDeniedStubCalls).toEqual([]);
    // the refusal is whole: the card survives untrashed, no act
    const row = await delDeniedStorage!.counting.query<{ trash: number; db_content: string | null }>(
      `SELECT trash, db_content FROM cards WHERE id = ?`,
      [DELETE_RULE_DENIED_TARGET_ID],
    );
    expect(row.rows[0]).toEqual({ trash: 0, db_content: "delete rule denied body" });
    expect(await actCount(delDeniedStorage!, "armed_delete_rule_denied_target")).toBe(0);
    expect(await mutationSnapshot(delDeniedStorage!)).toEqual(before);
  });
});

describe("armed route pins: UPDATE where the RULE denies the actor (permission outranks the guard on the update verb)", () => {
  // THE VERB-SYMMETRY PIN: the update verb's
  // twin of arm 7 — updateCard runs
  // assertCanWrite(card, "update") at card-action-engine.ts:1018 BEFORE
  // prepareRecaptchaSaveInput at :1152 (Ruby's chain order,
  // permissions.rb:148-153 before the :validate stage). End-to-end here: on
  // the ARMED update-denied twin, a token-present update 403s from the
  // permission walk with the guard never consulted. ARM 2 is the mirror
  // half: same armed shape, same anonymous session, token present — on the
  // GRANTED deck it rides to siteverify exactly once and 200s the save, so
  // this 403 is provably the permission's verdict and not the guard's (the
  // guard's refusal is 422 — errorStatus's fall-through,
  // write-routes.ts:558-562 — never 403).
  it("(8) armed + rule-DENIED update + token present: 403 permission-denied from the walk — zero siteverify calls, content unchanged, zero act rows", async () => {
    const before = await mutationSnapshot(updDeniedStorage!);
    // the .json mark — arm (7)'s shape: the JSON error body is what
    // carries {code, message} (errorResponse's json arm, write-routes.ts
    // :564-568; permission-denied maps to 403 at :558-562, the guard's
    // refusal is 422, never 403)
    const res = await call(updDeniedBaseUrl, "PUT", "/Armed_Update_Rule_Denied_Target.json", {
      form: {
        "card[content]": "denied update attempt body",
        recaptcha_token: "tok-upd-rule-denied",
      },
    });
    expect(res.status).toBe(403); // Card::Error::PermissionDenied (error.rb:104)
    // the walk's verdict (permissions.rb:117 you_cant, under :permission_denied)
    // — not the guard's "not a human"
    expect(res.json()).toMatchObject({ error_status: 403 });
    expect((res.json().errors as { permission_denied: string }).permission_denied)
      .toContain("You don't have permission to update");
    // THE DECISIVE HALF: the ARMED context's stub was never consulted — even
    // a human-verdict token (the stub's canned body is success:true, action
    // "update") cannot buy the update past the rule
    expect(updDeniedStubCalls).toEqual([]);
    // the refusal is whole: content and stamper byte-identical, no act
    // (the seeded row's stamper is the seed's own — seeds stamp updater_id 1
    // — the BEFORE/AFTER equality shape of arms (1)/(7) and the
    // anonymous-permission-pins arm (b) "nothing written")
    const row = await updDeniedStorage!.counting.query<{
      db_content: string | null;
      updater_id: number | null;
    }>(`SELECT db_content, updater_id FROM cards WHERE id = ?`, [UPDATE_RULE_DENIED_TARGET_ID]);
    expect(row.rows[0]).toEqual({ db_content: "update rule denied body", updater_id: 1 });
    expect(await actCount(updDeniedStorage!, "armed_update_rule_denied_target")).toBe(0);
    expect(await mutationSnapshot(updDeniedStorage!)).toEqual(before);
  });
});

describe("captcha success preserves independent content validation", () => {
  it("does not allow malformed Set content even after successful verification", async () => {
    const before = await mutationSnapshot(storage!);
    const priorCalls = updHumanStubCalls.length;
    const res = await call(updHumanBaseUrl, "PUT", "/Set_Payload_Refusal_Target.json", {
      form: { "card[content]": "not-json", recaptcha_token: "tok-human-invalid-set" },
    });
    expect(res.status, res.body).toBe(422);
    expect(res.json()).toMatchObject({ error_status: 422, errors: { "invalid json": expect.any(String) } });
    expect(updHumanStubCalls.slice(priorCalls)).toEqual([
      { url: DEFAULT_VERIFY_URL, query: { secret: "s", response: "tok-human-invalid-set" } },
    ]);
    expect(await mutationSnapshot(storage!)).toEqual(before);
  });
});
