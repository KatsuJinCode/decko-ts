// Route-level pins for the PRODUCTION recaptcha seat (src/server/
// write-routes.ts WriteRouteContext.recaptcha) — the HTTP-level remainder
// of the captcha-guard surface: through the test-only vi.mock seam alone,
// the guard is provable only at the engine boundary; until WriteRouteContext
// gained the composition seat, no live HTTP request could arm the guard.
//
// What changed in production for this: the route context grew the
// `recaptcha?: CardActionRecaptchaConfig` seat, passed through UNCHANGED to
// createCardActionEngineForSession alongside {ipAddress, now,
// attachmentStore, fileStorage}. Since E-16 the serving surface composes
// the whole deck's event runtime through the deck-boot seam on EVERY save
// (servingModEventRuntime -> defaultDeckEventRuntime), so the :recaptcha
// event is always registered; the seat supplies the CONFIG the guard reads
// at validate time (the engine's prepareRecaptchaSaveInput requires it —
// recaptcha_keys?, recaptcha.rb:46-48), because a config-less walk never
// fires the guard (card-action-engine.ts:1876-1882). Unarmed contexts pass
// the same runtime with no recaptcha config — the guard stays off.
//
// NO vi.mock in this file: every engine here is the real
// createCardActionEngineForSession, so these pins prove the production
// composition end-to-end (request -> route seat -> engine config + event
// runtime -> guard verdict -> status code). The engine's own default
// supplies the rule source: the host configs here carry NO
// captchaRuleContent, so the guard's rule content is resolved by the
// deck's own rule walk (ruleContentForCard — recaptcha.rb:22
// Card::Rule.toggle(rule(:captcha))) over the seeded *all+*captcha card —
// the real rule content, not an injected value.
//
// The four arms (deck ids mirror
// write-routes-anonymous-permission-pins.test.ts; one context + bridge per
// arm, so no stub state is shared):
//   (1) seat ARMED + the deck's real *all+*captcha "1" rule + a failed
//       verify -> 422 {error:{code:"recaptcha"}} with the refusal message;
//       the siteverify stub rode the posted recaptcha_token; zero rows.
//   (2) seat ARMED + a human verdict -> the guarded create COMPLETES:
//       303, act under the Anonymous card — the production seat does not
//       block legit anonymous signups (the e2 shape, without the mock).
//   (3) the SAME deck + rule, context UNARMED -> 303: the walk alone
//       without the seat never blocks — the byte-identity-for-unarmed-
//       hosts pin at the route.
//   (4) seat ARMED but the deck carries no *captcha rule card ->
//       recaptcha_on? false (Card::Rule.toggle(nil), recaptcha.rb:16-23):
//       303 and the siteverify stub never called — the rule walk is the
//       default source, and its absence disarms the guard even when
//       configured.

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
const ANON_CARD_ID = 14;
const SIGNUP_TYPE_CARD_ID = 15;
const DEFAULT_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** The host-side armed config: keys set, NO captchaRuleContent — the
 *  engine's rule walk is the rule source (the engine default when the
 *  host carries no rule content), verify is the test's stub (the named
 *  seam, CardActionRecaptchaConfig.verify). */
function armedRecaptchaConfig(stub: ReturnType<typeof stubVerify>): CardActionRecaptchaConfig {
  return { siteKey: "k", secretKey: "s", verify: stub.verify };
}

async function seedRecaptchaSeatDeck(s: RenderTestStorage, withCaptchaRule: boolean): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(4, "*create", { codename: "create" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(7, "Editor");
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*default", { codename: "default" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 10, 7, "editor");
  await seedCard(s, { id: 11, leftId: 1, rightId: 3, dbContent: "[[Editor]]" });
  await seedReference(s, 11, 7, "editor");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Editor]]" });
  await seedReference(s, 12, 7, "editor");
  await seedCard(s, { id: 13, leftId: 1, rightId: 9, typeId: SET_TYPE_ID });
  await byId(ANON_CARD_ID, "Anonymous User", { codename: "anonymous" });
  await seedCard(s, { id: SIGNUP_TYPE_CARD_ID, name: "Signup", typeId: SET_TYPE_ID + 1 });
  await seedCard(s, {
    id: 16,
    leftId: SIGNUP_TYPE_CARD_ID,
    rightId: 8,
    typeId: SET_TYPE_ID,
  });
  await seedCard(s, { id: 17, leftId: 16, rightId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 17, 6, "anyone");
  await byId(18, "*captcha", { codename: "captcha" });
  if (withCaptchaRule) {
    // the real rule content the guard's walk resolves (the gem's
    // data/real.yml shape: *all+*captcha "1" — Card::Rule.toggle("1"),
    // rule.rb:11-13)
    await seedCard(s, { id: 19, leftId: 1, rightId: 18, dbContent: "1" });
  }
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

// ruleDeck: carries the real *all+*captcha "1" rule; rulelessDeck: the
// same seed MINUS that one card — the walk-absence variable. Arms 1-3
// share the rule deck, each through its OWN context + bridge (no shared
// stub state); arm 4 rides the ruleless deck.
let ruleDeckStorage: RenderTestStorage | undefined;
let rulelessDeckStorage: RenderTestStorage | undefined;
let refusalServer: http.Server;
let humanServer: http.Server;
let unarmedServer: http.Server;
let rulelessServer: http.Server;
let refusalBaseUrl = "";
let humanBaseUrl = "";
let unarmedBaseUrl = "";
let rulelessBaseUrl = "";
let refusalStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
let humanStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];
let rulelessStubCalls: Array<{ url: string; query: { secret: string; response: string } }> = [];

beforeAll(async () => {
  ruleDeckStorage = await createRenderTestStorage();
  await runAuthMigrations(ruleDeckStorage.counting);
  await seedRecaptchaSeatDeck(ruleDeckStorage, true);
  rulelessDeckStorage = await createRenderTestStorage();
  await runAuthMigrations(rulelessDeckStorage.counting);
  await seedRecaptchaSeatDeck(rulelessDeckStorage, false);

  // the PRODUCTION seat, armed at each context (no module mock anywhere in
  // this file — every engine is the real createCardActionEngineForSession)
  const refusalStub = stubVerify({ success: false });
  refusalStubCalls = refusalStub.calls;
  const humanStub = stubVerify({ success: true, score: 0.9, action: "create" });
  humanStubCalls = humanStub.calls;
  const rulelessStub = stubVerify({ success: false });
  rulelessStubCalls = rulelessStub.calls;

  const armed = (stub: ReturnType<typeof stubVerify>, s: RenderTestStorage): WriteRouteContext => ({
    driver: s.counting,
    fetcher: s.fetcher,
    recaptcha: armedRecaptchaConfig(stub),
  });

  const refusalBridge = await makeServer(ruleDeckStorage, armed(refusalStub, ruleDeckStorage), { get: "record-404" });
  refusalServer = refusalBridge.server;
  refusalBaseUrl = refusalBridge.url;
  const humanBridge = await makeServer(ruleDeckStorage, armed(humanStub, ruleDeckStorage), { get: "record-404" });
  humanServer = humanBridge.server;
  humanBaseUrl = humanBridge.url;
  const unarmedBridge = await makeServer(
    ruleDeckStorage,
    {
      driver: ruleDeckStorage.counting,
      fetcher: ruleDeckStorage.fetcher,
    },
    { get: "record-404" },
  );
  unarmedServer = unarmedBridge.server;
  unarmedBaseUrl = unarmedBridge.url;
  const rulelessBridge = await makeServer(rulelessDeckStorage, armed(rulelessStub, rulelessDeckStorage), { get: "record-404" });
  rulelessServer = rulelessBridge.server;
  rulelessBaseUrl = rulelessBridge.url;
}, 60_000);

afterAll(() => {
  refusalServer?.close();
  humanServer?.close();
  unarmedServer?.close();
  rulelessServer?.close();
  ruleDeckStorage?.close();
  rulelessDeckStorage?.close();
});

describe("the production recaptcha seat over the HTTP write routes (no module mock)", () => {
  it("(1) armed seat + the deck's real *captcha rule: failed verify -> 422 recaptcha shape, token rode to siteverify, zero rows", async () => {
    const res = await call(refusalBaseUrl, "POST", "/Seat_Guarded_Signup.json", {
      form: {
        "card[content]": "guarded body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
        recaptcha_token: "tok-seat",
      },
    });
    expect(res.status).toBe(422); // UserError class (error.rb:21), not a 403 code
    expect(res.json().error).toMatchObject({
      code: "recaptcha",
      message: "Looks like you are not a human",
    });
    // the route's recaptcha_token param plumbed through the seat-armed
    // engine to the transport (recaptcha-4.13.2 lib/recaptcha.rb:63-77),
    // with the engine's default verify URL
    expect(refusalStubCalls).toEqual([
      { url: DEFAULT_VERIFY_URL, query: { secret: "s", response: "tok-seat" } },
    ]);
    // the refusal is whole: no card, no act
    const record = await call(refusalBaseUrl, "GET", "/Seat_Guarded_Signup.json", {});
    expect(record.status).toBe(404);
    expect(await actCount(ruleDeckStorage!, "seat_guarded_signup")).toBe(0);
  });

  it("(2) armed seat + a human verdict: the guarded anonymous create completes (303, act under the Anonymous card)", async () => {
    const res = await call(humanBaseUrl, "POST", "/Seat_Human_Signup", {
      form: {
        "card[content]": "seat human body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
        recaptcha_token: "tok-seat-human",
      },
    });
    expect(res.status).toBe(303);
    expect(humanStubCalls.map((c) => c.query.response)).toEqual(["tok-seat-human"]);
    const act = await ruleDeckStorage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = ? ORDER BY a.id DESC LIMIT 1`,
      ["seat_human_signup"],
    );
    expect(act.rows[0]?.actor_id).toBe(ANON_CARD_ID);
  });

  it("(3) the SAME deck + rule, context UNARMED: 303 — the walk alone never blocks, the pre-seat shape is byte-identical", async () => {
    const res = await call(unarmedBaseUrl, "POST", "/Seat_Unarmed_Signup", {
      form: {
        "card[content]": "unarmed body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
        recaptcha_token: "tok-unarmed",
      },
    });
    expect(res.status).toBe(303);
    const card = await ruleDeckStorage!.counting.query<{ creator_id: number }>(
      `SELECT creator_id FROM cards WHERE key = ?`,
      ["seat_unarmed_signup"],
    );
    expect(card.rows[0]?.creator_id).toBe(ANON_CARD_ID);
  });

  it("(4) armed seat, deck without a *captcha rule card: recaptcha_on? false -> 303 and siteverify never called", async () => {
    const res = await call(rulelessBaseUrl, "POST", "/Seat_Ruleless_Signup", {
      form: {
        "card[content]": "ruleless body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
        recaptcha_token: "tok-ruleless",
      },
    });
    expect(res.status).toBe(303); // toggle(undefined) false — recaptcha.rb:16-23
    expect(rulelessStubCalls).toEqual([]); // the disarmed guard never verifies
    const card = await rulelessDeckStorage!.counting.query<{ creator_id: number }>(
      `SELECT creator_id FROM cards WHERE key = ?`,
      ["seat_ruleless_signup"],
    );
    expect(card.rows[0]?.creator_id).toBe(ANON_CARD_ID);
  });
});
