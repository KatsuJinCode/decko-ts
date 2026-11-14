// HTTP-level pins for the anonymous permission surface over the write
// routes (src/server/write-routes.ts) — the route-layer remainder of the
// anonymous-permission engine pins: the engine suites prove the verdicts
// at their own seam, and no HTTP-level pin proved the anonymous surface
// end-to-end (request -> route -> engine verdict -> status code) until
// this file.
//
// What the ENGINE already landed and pinned at its own seam (tests/card/
// actions/anonymous-create-permission.test.ts,
// anonymous-update-delete-permission.test.ts): Ruby's ok_to_create? /
// ok_to_update? / ok_to_delete? chain (card-mod-permissions-0.20.0
// set/all/permissions.rb:120-125 / :148-153 / :155-157) has NO signed-in
// clause; the anonymous session's actor IS the Anonymous codename card
// (card-1.110.0 lib/card/auth/current.rb:7-9 + lib/card/auth/proxy.rb
// :33-35); a deck that cannot form that card (fragment seed) keeps the
// legacy anonymous-actor rejection.
//
// What is pinned HERE (this file, no production change): the route
// mappings over that surface, end-to-end over real HTTP —
//   - write-routes.ts:541-545 errorStatus: anonymous-actor AND
//     permission-denied both -> 403 (Ruby PermissionDenied, error.rb:104);
//     every other refusal -> 422 (UserError class, error.rb:21); :547-552
//     errorResponse: JSON flavor {error:{code,message}} (the .json mark
//     suffix), HTML flavor "Error (<code>)" + the escaped message.
//   - write-routes.ts:724-729: the engine is built PER REQUEST off the
//     session transport (token/cookie; unresolvable = Anonymous,
//     auth/current.rb:58-63) — so an unauthenticated POST reaches the
//     engine's rule verdict as the anonymous session, exactly Ruby's
//     rest.rb:37-40 signin_with fall-through.
//
// Authority for each arm = the engine pins' own proven behavior plus the
// route's own mapping:
//   (a) granted anonymous create: Signup+*type+*create -> [[Anyone]]
//       lets the unsigned POST through the engine verdict; the act lands
//       under the Anonymous card (creator_id = updater_id =
//       card_acts.actor_id); the plain-form success is the 303 hard
//       redirect with the card_url-absolute Location (response.rb:25-33,
//       :41).
//   (b) rule-DENIED anonymous update: *all+*update -> [[Editor]] refuses
//       the anonymous viewer (its parties are Anyone + Anonymous only,
//       account_holder.rb:27-40) -> 403 + JSON permission-denied code,
//       nothing written, stamper unchanged.
//   (c) anonymous delete denied by the same walk -> 403 + HTML
//       permission-denied shape, card survives.
//   (d) fragment-seed deck (no anonymous codename card): the legacy
//       anonymous-actor 403 — distinguishable from (b)/(c) on the wire
//       ONLY through the error body's code field, which is why the code
//       is asserted.
//   (e) the captcha guard's refusal surfaces at the route: the engine
//       throws CardActionError("recaptcha") (recaptcha.rb:50-55's
//       errors.add arm) and errorStatus maps it to 422 with the refusal
//       message. The guard config rides the engine's injectable option
//       (CardActionRecaptchaConfig.verify,
//       card-action-engine.ts:263-302, `verify: cfg.verify ??
//       recaptchaSiteverifyGet`). The injection rides a vitest module
//       mock wrapped around createCardActionEngineForSession below: a
//       TEST-ONLY seam that passes every option through unchanged when
//       unarmed. The PRODUCTION seat now exists (WriteRouteContext
//       .recaptcha) — its route-level
//       pins live in write-routes-recaptcha-seat.test.ts WITHOUT the
//       mock; this file's (e) arms stay as the mock-wrapper passthrough's
//       byte-identity witnesses (4 of the 6 pins ride it unarmed).
//   (f)+(g) the GRANTED update/delete arms (the denied (b)/(c)
//       counterparts): a
//       third deck where *all+*update and *all+*delete grant [[Anyone]]
//       — the anonymous session's PUT succeeds (200 JSON, updater_id =
//       the Anonymous card) and its DELETE flips trash (303, the trash
//       save re-stamps updater_id). No mock needed: the arms run through
//       the wrapper's unarmed passthrough, byte-identical to production.
//
// Deck (mirrors the engine suites' signup shape plus the route
// suite's *all+*default seat; ids arbitrary):
//    1 *all codename all (Set-typed)     2  Set codename set
//    3  *update   4  *create   5  *delete
//    6  Anyone codename anyone           7  Editor (a party Anonymous is NOT in)
//    8  *type codename type              9  *default codename default
//   10 *all+*create   [[Editor]]  (fallback: members only)
//   11 *all+*update   [[Editor]] / [[Anyone]] in the granted deck
//   12 *all+*delete   [[Editor]] / [[Anyone]] in the granted deck
//   13 *all+*default  (Set-typed anchor; Card.default_type_id)
//   14 Anonymous User codename anonymous  (the acting card, Auth.as_card)
//   15 Signup (the recorded signup type card)
//   16 Signup+*type (Set-typed)
//   17 Signup+*type+*create [[Anyone]]    (the anonymous-create grant)
//   18 *captcha codename captcha          (the guard's Codename.exist? :captcha)
//   40 Locked Wiki (the update/delete deny target)
//   50 Open Wiki (the granted update/delete target; granted deck only)
// The FRAGMENT deck is the same seed MINUS card 14 — the only variable;
// the GRANTED deck is the same seed with cards 11/12 flipped to
// [[Anyone]] plus card 50.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import type { ModEventRuntime } from "../../src/card/mod-loader/mod-event-dispatch.js";
import type { CardActionRecaptchaConfig } from "../../src/card/actions/card-action-engine.js";
import {
  actCount,
  makeWriteRouteServer as makeServer,
  stubVerify,
} from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
const RICH_TEXT_TYPE_ID = 30;
const ANON_CARD_ID = 14;
const SIGNUP_TYPE_CARD_ID = 15;
const LOCKED_WIKI_ID = 40;
const OPEN_WIKI_ID = 50;

/** The captcha seam holder (consumed by the vi.mock factory below): a test
 *  arms the route's engine by setting `injection` and the wrapper adds the
 *  guard config + the recaptcha mod runtime to the engine options. afterEach
 *  clears it; every unarmed engine builds byte-identically to production. */
const captchaSeam = vi.hoisted(() => ({
  injection: undefined as
    | {
        siteKey: string;
        secretKey: string;
        captchaRuleContent: string;
        verify: (
          url: string,
          query: { secret: string; response: string },
        ) => Promise<string>;
      }
    | undefined,
}));

vi.mock("../../src/card/actions/engine-for-session.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../src/card/actions/engine-for-session.js")
  >();
  type EngineFactory = typeof actual.createCardActionEngineForSession;
  let recaptchaRuntime: ModEventRuntime | undefined;
  return {
    ...actual,
    createCardActionEngineForSession: (async (
      fetcher: Parameters<EngineFactory>[0],
      driver: Parameters<EngineFactory>[1],
      token: Parameters<EngineFactory>[2],
      opts: Parameters<EngineFactory>[3] = {},
    ) => {
      const injection = captchaSeam.injection;
      if (injection === undefined) {
        return actual.createCardActionEngineForSession(fetcher, driver, token, opts);
      }
      // The recaptcha mod's runtime, composed once — the same registration
      // the SetLoader phase performs when the mod is loaded (harness
      // composition proven in
      // card-mod-recaptcha-validate-event.test.ts:56-63).
      recaptchaRuntime ??= await (async () => {
        const [{ default: cardModRecaptcha }, { recaptchaModEventPredicates }, { ModLoader }] =
          await Promise.all([
            import("../../src/card/mod-loader/mods/card-mod-recaptcha.js"),
            import("../../src/card/mod-loader/mods/card-mod-recaptcha.js"),
            import("../../src/card/mod-loader.js"),
          ]);
        const loader = new ModLoader([{ manifest: cardModRecaptcha }]);
        loader.resolveOrder({ gemMods: ["recaptcha"] });
        loader.load();
        return {
          registry: loader.eventRegistry(),
          predicates: recaptchaModEventPredicates,
        };
      })();
      const recaptcha: CardActionRecaptchaConfig = {
        siteKey: injection.siteKey,
        secretKey: injection.secretKey,
        captchaRuleContent: injection.captchaRuleContent, // Card::Rule.toggle("1"), rule.rb:11-13
        verify: injection.verify,
      };
      return actual.createCardActionEngineForSession(fetcher, driver, token, {
        ...opts,
        recaptcha,
        modEvents: recaptchaRuntime,
      });
    }) as EngineFactory,
  };
});

async function seedAnonymousRouteDeck(
  s: RenderTestStorage,
  withAnonymousCard: boolean,
  grantedRules = false,
): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(RICH_TEXT_TYPE_ID, "RichText", { codename: "basic", typeId: RICH_TEXT_TYPE_ID });
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
  // the update/delete rules: [[Editor]] (denies the anonymous viewer) in
  // the deny decks, [[Anyone]] (grants it) in the granted deck — the same
  // one-variable flip the engine-seam suite uses
  await seedCard(s, {
    id: 11,
    leftId: 1,
    rightId: 3,
    dbContent: grantedRules ? "[[Anyone]]" : "[[Editor]]",
  });
  await seedReference(s, 11, grantedRules ? 6 : 7, grantedRules ? "anyone" : "editor");
  await seedCard(s, {
    id: 12,
    leftId: 1,
    rightId: 5,
    dbContent: grantedRules ? "[[Anyone]]" : "[[Editor]]",
  });
  await seedReference(s, 12, grantedRules ? 6 : 7, grantedRules ? "anyone" : "editor");
  await seedCard(s, { id: 13, leftId: 1, rightId: 9, typeId: SET_TYPE_ID });
  if (withAnonymousCard) {
    await byId(ANON_CARD_ID, "Anonymous User", { codename: "anonymous" });
  }
  await seedCard(s, { id: SIGNUP_TYPE_CARD_ID, name: "Signup", typeId: SET_TYPE_ID + 1 });
  await seedCard(s, {
    id: 16,
    leftId: SIGNUP_TYPE_CARD_ID,
    rightId: 8,
    typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 17,
    leftId: 16,
    rightId: 4,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 17, 6, "anyone");
  await byId(18, "*captcha", { codename: "captcha" });
  await byId(LOCKED_WIKI_ID, "Locked Wiki", { typeId: RICH_TEXT_TYPE_ID, dbContent: "wiki v1" });
  if (grantedRules) {
    // the granted arms' target card (untouched by every other arm)
    await byId(OPEN_WIKI_ID, "Open Wiki", { typeId: RICH_TEXT_TYPE_ID, dbContent: "wiki v1" });
  }
}

interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  json: () => Record<string, unknown>;
}

async function call(
  base: string,
  method: string,
  path: string,
  opts: {
    form?: Record<string, string>;
    json?: unknown;
  } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  // NO token, NO cookie — every request here rides the signed-out session
  // (rest.rb:37-40's fall-through: unresolvable credentials = Anonymous,
  // auth/current.rb:58-63).
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

let fullStorage: RenderTestStorage | undefined;
let fragmentStorage: RenderTestStorage | undefined;
let grantedStorage: RenderTestStorage | undefined;
let fullCtx: WriteRouteContext;
let fragmentCtx: WriteRouteContext;
let grantedCtx: WriteRouteContext;
let fullServer: http.Server;
let fragmentServer: http.Server;
let grantedServer: http.Server;
let fullBaseUrl = "";
let fragmentBaseUrl = "";
let grantedBaseUrl = "";

beforeAll(async () => {
  fullStorage = await createRenderTestStorage();
  await runAuthMigrations(fullStorage.counting);
  await seedAnonymousRouteDeck(fullStorage, true);
  fragmentStorage = await createRenderTestStorage();
  await runAuthMigrations(fragmentStorage.counting);
  await seedAnonymousRouteDeck(fragmentStorage, false); // the fragment seed
  grantedStorage = await createRenderTestStorage();
  await runAuthMigrations(grantedStorage.counting);
  await seedAnonymousRouteDeck(grantedStorage, true, true); // update/delete -> [[Anyone]]

  fullCtx = { driver: fullStorage.counting, fetcher: fullStorage.fetcher };
  fragmentCtx = { driver: fragmentStorage.counting, fetcher: fragmentStorage.fetcher };
  grantedCtx = { driver: grantedStorage.counting, fetcher: grantedStorage.fetcher };

  const bridge = await makeServer(fullStorage, fullCtx, { get: "record-404" });
  fullServer = bridge.server;
  fullBaseUrl = bridge.url;
  const fragmentBridge = await makeServer(fragmentStorage, fragmentCtx, { get: "record-404" });
  fragmentServer = fragmentBridge.server;
  fragmentBaseUrl = fragmentBridge.url;
  const grantedBridge = await makeServer(grantedStorage, grantedCtx, { get: "record-404" });
  grantedServer = grantedBridge.server;
  grantedBaseUrl = grantedBridge.url;
}, 60_000);

afterAll(() => {
  fullServer?.close();
  fragmentServer?.close();
  grantedServer?.close();
  fullStorage?.close();
  fragmentStorage?.close();
  grantedStorage?.close();
});

afterEach(() => {
  captchaSeam.injection = undefined;
});

describe("anonymous writes over the HTTP write routes (request -> route -> engine verdict -> status)", () => {
  it("(a) rule-GRANTED anonymous create via POST: 303 hard redirect, act recorded under the Anonymous card", async () => {
    // Signup+*type+*create -> [[Anyone]] admits the anonymous session
    // through ok_to_create? — the engine pin
    // (anonymous-create-permission.test.ts arm 1) proven over the ROUTE.
    const res = await call(fullBaseUrl, "POST", "/Anon_Signup_One", {
      form: {
        "card[content]": "route signup body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
      },
    });
    // the plain-form cud_success: hard_redirect 303, card_url-absolute
    // Location (response.rb:31,41)
    expect(res.status).toBe(303);
    expect(res.headers["location"]).toBe(`${fullBaseUrl}/Anon_Signup_One`);

    // the read side reflects the anonymous save
    const record = await call(fullBaseUrl, "GET", "/Anon_Signup_One.json", {});
    expect(record.status).toBe(200);
    expect(record.json().dbContent).toBe("route signup body");

    // the act rides the Anonymous card: creator_id = updater_id (set_stamper,
    // account.rb:20-23) and card_acts.actor_id (Auth.as_id, proxy.rb:33-35).
    const card = await fullStorage!.counting.query<{
      creator_id: number;
      updater_id: number;
      type_id: number;
    }>(`SELECT creator_id, updater_id, type_id FROM cards WHERE key = ?`, [
      "anon_signup_one",
    ]);
    expect(card.rows[0]?.creator_id).toBe(ANON_CARD_ID);
    expect(card.rows[0]?.updater_id).toBe(ANON_CARD_ID);
    expect(card.rows[0]?.type_id).toBe(SIGNUP_TYPE_CARD_ID);
    const act = await fullStorage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = ? ORDER BY a.id DESC LIMIT 1`,
      ["anon_signup_one"],
    );
    expect(act.rows[0]?.actor_id).toBe(ANON_CARD_ID);
  });

  it("(b) rule-DENIED anonymous update: 403 with the JSON permission-denied shape, nothing written", async () => {
    // *all+*update -> [[Editor]] refuses the anonymous viewer (its parties
    // are Anyone + Anonymous only, account_holder.rb:27-40) -> the engine
    // throws permission-denied (assertCanWrite) -> errorStatus 403
    // (write-routes.ts:543) -> the .json mark answers the JSON error shape.
    const before = await fullStorage!.counting.query<{ db_content: string | null; updater_id: number }>(
      `SELECT db_content, updater_id FROM cards WHERE id = ?`,
      [LOCKED_WIKI_ID],
    );
    const res = await call(fullBaseUrl, "PUT", "/Locked_Wiki.json", {
      json: { card: { content: "anonymous says otherwise" } },
    });
    expect(res.status).toBe(403); // Card::Error::PermissionDenied (error.rb:104)
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toMatchObject({
      error_status: 403,
      errors: { permission_denied: expect.stringContaining("You don't have permission to update") },
    });
    // nothing landed: content and stamper are byte-identical, no act row
    const after = await fullStorage!.counting.query<{ db_content: string | null; updater_id: number }>(
      `SELECT db_content, updater_id FROM cards WHERE id = ?`,
      [LOCKED_WIKI_ID],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(await actCount(fullStorage!, "locked_wiki")).toBe(0);
  });

  it("(c) anonymous delete denied: 403 with the HTML permission-denied shape, card survives", async () => {
    // ok_to_delete? = bare permit :delete (permissions.rb:155-157) — the
    // same Editor-only *all rule refuses; no .json mark -> the shared HTML
    // validation page carries the code (errorResponse's html arm).
    const res = await call(fullBaseUrl, "DELETE", "/Locked_Wiki");
    expect(res.status).toBe(403);
    expect(res.body).toContain("Error (permission-denied)");
    // the card survives (the trash flip never ran)
    const record = await call(fullBaseUrl, "GET", "/Locked_Wiki.json", {});
    expect(record.status).toBe(200);
    expect(record.json().dbContent).toBe("wiki v1");
    expect(await actCount(fullStorage!, "locked_wiki")).toBe(0);
  });

  it("(d) fragment-seed deck (no anonymous codename card): the legacy anonymous-actor 403", async () => {
    // No codename-anonymous row -> actingIdForWrite() is undefined ->
    // assertWritable's anonymous-actor rejection (card-action-engine.ts
    // :1968-1981) BEFORE any rule walk. Ruby could not form
    // Card[AnonymousID] there either (auth/current.rb:8 reads the
    // constant). The 403 REASON differs from (b)/(c) only in the error
    // body's code — which is the distinction this pin makes.
    const res = await call(fragmentBaseUrl, "POST", "/Fresh_Anon.json", {
      json: { card: { content: "nope" } },
    });
    expect(res.status).toBe(403);
    expect(res.json()).toMatchObject({ error_status: 403, errors: { permission_denied: expect.any(String) } });
    const record = await call(fragmentBaseUrl, "GET", "/Fresh_Anon.json", {});
    expect(record.status).toBe(404); // nothing written
  });
});

describe("granted anonymous update/delete over the routes (the denied arms (b)/(c)' counterparts)", () => {
  it("(f) rule-GRANTED anonymous update: 200 JSON success, content landed, updater_id = the Anonymous card", async () => {
    // *all+*update -> [[Anyone]] in the granted deck admits the anonymous
    // session through ok_to_update? (permissions.rb:148-153) — the engine
    // pin (anonymous-update-delete-permission.test.ts arm 1) proven over
    // the ROUTE; set_stamper re-stamps updater_id (account.rb:20-23).
    const res = await call(grantedBaseUrl, "PUT", "/Open_Wiki.json", {
      json: { card: { content: "anonymous route edit" } },
    });
    expect(res.status, res.body).toBe(200); // cud_success JSON flavor (rest.rb:80-89)
    expect(res.json()).toMatchObject({ verb: "update" });
    expect(res.json().card).toMatchObject({ name: "Open Wiki" });
    const card = await grantedStorage!.counting.query<{
      db_content: string | null;
      updater_id: number;
      trash: number;
    }>(`SELECT db_content, updater_id, trash FROM cards WHERE id = ?`, [OPEN_WIKI_ID]);
    expect(card.rows[0]?.db_content).toBe("anonymous route edit");
    expect(card.rows[0]?.updater_id).toBe(ANON_CARD_ID);
    expect(card.rows[0]?.trash).toBe(0); // an update, not a trash flip
    const act = await grantedStorage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = ? ORDER BY a.id DESC LIMIT 1`,
      ["open_wiki"],
    );
    expect(act.rows[0]?.actor_id).toBe(ANON_CARD_ID);
  });

  it("(g) rule-GRANTED anonymous delete: 303 hard redirect, the trash flip landed, updater_id = the Anonymous card", async () => {
    // ok_to_delete? = bare permit :delete (permissions.rb:155-157) — the
    // same [[Anyone]] rule grants it; the trash save is an update save and
    // re-stamps updater_id (set_stamper) — the engine pin's shape proven
    // over the ROUTE.
    const res = await call(grantedBaseUrl, "DELETE", "/Open_Wiki");
    expect(res.status).toBe(303); // the plain-form hard redirect (response.rb:31,41)
    // configure_successful_deletion (card-mod-session location_history.rb:12-20):
    // a plain-form delete redirects to the previous location, "/" fresh.
    expect(res.headers["location"]).toBe(`${grantedBaseUrl}/`);
    const card = await grantedStorage!.counting.query<{ trash: number; updater_id: number }>(
      `SELECT trash, updater_id FROM cards WHERE id = ?`,
      [OPEN_WIKI_ID],
    );
    expect(card.rows[0]?.trash).toBe(1);
    expect(card.rows[0]?.updater_id).toBe(ANON_CARD_ID);
    const act = await grantedStorage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = ? ORDER BY a.id DESC LIMIT 1`,
      ["open_wiki"],
    );
    expect(act.rows[0]?.actor_id).toBe(ANON_CARD_ID);
  });
});

describe("the captcha guard surfacing at the route (the injectable verify seam)", () => {
  it("(e1) guard-on refusal: 422 recaptcha shape, siteverify rode the posted recaptcha_token, zero rows", async () => {
    // The engine's event :recaptcha body throws CardActionError("recaptcha")
    // on a failed verify (recaptcha.rb:50-55) — errorStatus maps the code to
    // 422 (the UserError class, error.rb:21; NOT one of the two 403 codes).
    // The guard config rides CardActionRecaptchaConfig.verify (the engine's
    // injectable seam), injected at the route's engine factory below.
    const stub = stubVerify({ success: false });
    captchaSeam.injection = {
      siteKey: "k",
      secretKey: "s",
      captchaRuleContent: "1", // Card::Rule.toggle("1") — rule.rb:11-13
      verify: stub.verify,
    };
    const res = await call(fullBaseUrl, "POST", "/Guarded_Signup.json", {
      form: {
        "card[content]": "guarded body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
        recaptcha_token: "tok-route",
      },
    });
    expect(res.status).toBe(422);
    // card-mod-format set/all/error.rb json :errors view: {attribute => message}
    expect(res.json()).toMatchObject({
      error_status: 422,
      errors: { recaptcha: "Looks like you are not a human" },
    });
    // the route's recaptcha_token param plumbed through to the transport
    // (write-routes.ts:297 parsed.recaptchaToken -> :755 create input ->
    // prepareRecaptchaSaveInput -> ::Recaptcha.get's query shape,
    // recaptcha-4.13.2 lib/recaptcha.rb:63-77)
    expect(stub.calls).toEqual([
      {
        url: "https://www.google.com/recaptcha/api/siteverify",
        query: { secret: "s", response: "tok-route" },
      },
    ]);
    // the refusal is whole: no card, no act
    const record = await call(fullBaseUrl, "GET", "/Guarded_Signup.json", {});
    expect(record.status).toBe(404);
    expect(await actCount(fullStorage!, "guarded_signup")).toBe(0);
  });

  it("(e2) a human verdict lets the anonymous create through the guarded route (303, act under the Anonymous card)", async () => {
    // the guard-on COMPLETION arm: success + score >= minimum + action
    // match (recaptcha.rb:35-39) -> the save runs -> 303 + the Anonymous
    // card stamper, exactly like arm (a) but with the guard wired.
    const stub = stubVerify({ success: true, score: 0.9, action: "create" });
    captchaSeam.injection = {
      siteKey: "k",
      secretKey: "s",
      captchaRuleContent: "1",
      verify: stub.verify,
    };
    const res = await call(fullBaseUrl, "POST", "/Human_Signup", {
      form: {
        "card[content]": "human signup body",
        "card[type_id]": String(SIGNUP_TYPE_CARD_ID),
        recaptcha_token: "tok-human",
      },
    });
    expect(res.status).toBe(303);
    expect(stub.calls[0]?.query.response).toBe("tok-human");
    const card = await fullStorage!.counting.query<{ creator_id: number }>(
      `SELECT creator_id FROM cards WHERE key = ?`,
      ["human_signup"],
    );
    expect(card.rows[0]?.creator_id).toBe(ANON_CARD_ID);
  });
});

