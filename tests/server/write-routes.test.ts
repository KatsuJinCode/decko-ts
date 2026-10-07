// End-to-end tests for the HTTP write surface (src/server/write-routes.ts):
// sign in (token issued DIRECTLY via the SessionStore — the password front
// door itself is covered by the sign-in endpoint suites), POST an update
// over real HTTP, watch
// the read side reflect it, and watch the act/action/changes rows land.
// Plus the write-permission walks through the HTTP layer: the three
// ok_to_* denials, the ok_to_update? type-change clause, the cookie-session
// transport, the *signin subcard-update login, and the LIVE response
// shapes (303 hard redirect with absolute Location; no forgery protection).
//
// Ruby truth under test (see the module header citations in
// src/server/write-routes.ts): engine_routes.rb grammar, rest.rb
// create/update/delete, permission.rb ok_to_* (403), error.rb statuses
// (404/422), response.rb redirect_cud_success (303, card_url-absolute),
// the LIVE decko CSRF posture (no protect_from_forgery anywhere in
// decko-0.20.0 / card-1.110.0 — the only forgery reference is
// environments/cucumber.rb:27, which disables it), and the *signin
// :signin event (card-mod-account set/self/signin.rb).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { actionTypeCode } from "../../src/card/history/action.js";
import { makeWriteRouteServer as makeServer } from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const EDITOR_ID = 30;

let storage: RenderTestStorage | undefined;
let sideDenyStorage: RenderTestStorage | undefined;
let joeToken = "";
let sideDenyJoeToken = "";
let ctx: WriteRouteContext;
let sideDenyCtx: WriteRouteContext;
let server: http.Server;
let sideDenyServer: http.Server;
let baseUrl = "";
let sideDenyBaseUrl = "";

/**
 * The rule deck (mirrors tests/card/permissions/view-task-verdicts.test.ts,
 * plus the account/session cards and the *all+*default rule the create
 * path's Card.default_type_id needs):
 *   1  *all codename all (Set-typed anchor)     2  Set codename set
 *   3  *update   4  *create   5  *delete        6  Anyone codename anyone
 *   7  Anyone Signed In codename anyone_signed_in
 *   8  *type codename type   9  *self codename self
 *   18 *default codename default
 *   10 *all+*update   [[Anyone Signed In]] + ref -> 7
 *   11 *all+*create   [[Anyone Signed In]] + ref -> 7
 *   12 *all+*delete   [[Anyone Signed In]] + ref -> 7
 *   13 Widget typeId 14   14 Basic   15 Basic+*type (Set-typed)
 *   16 RichText (a second type for type-change saves)
 *   17 *all+*default (typeId 2 — Card.default_type_id)
 *   30 Editor (a party Joe is NOT in)
 *   40 Locked   41 Locked+*self   42 Locked+*self+*update [[Editor]]
 *   43 Widget+*self  44 Widget+*self+*create [[Editor]]
 *   90 Joe User (the account card)
 */
async function seedRuleDeck(s: RenderTestStorage): Promise<void> {
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
  await byId(7, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*self", { codename: "self" });
  await byId(18, "*default", { codename: "default" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await byId(13, "Widget", { typeId: 14, dbContent: "widget body v1" });
  await byId(14, "Basic");
  await seedCard(s, { id: 15, leftId: 14, rightId: 8, typeId: SET_TYPE_ID });
  await byId(16, "RichText");
  await byId(EDITOR_ID, "Editor");
  await byId(40, "Locked", { dbContent: "locked body" });
  await seedCard(s, { id: 41, leftId: 40, rightId: 9, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 42, leftId: 41, rightId: 3, dbContent: "[[Editor]]" });
  await seedReference(s, 42, EDITOR_ID, "editor");
  await seedCard(s, { id: 43, leftId: 13, rightId: 9, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 44, leftId: 43, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 44, EDITOR_ID, "editor");
  await byId(JOE_ID, "Joe User");
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
    token?: string;
    cookie?: string;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: string | undefined;
  if (opts.form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const params = new URLSearchParams(opts.form);
    if (opts.token !== undefined) params.set("token", opts.token);
    body = params.toString();
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  if (opts.token !== undefined && opts.form === undefined) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }
  if (opts.cookie !== undefined) headers["Cookie"] = opts.cookie;
  if (opts.origin !== undefined) headers["Origin"] = opts.origin;
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

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRuleDeck(storage);
  sideDenyStorage = await createRenderTestStorage();
  await runAuthMigrations(sideDenyStorage.counting);
  await seedSideDenyDeck(sideDenyStorage);

  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    // the host render seam the ajax soft redirect uses (the staging server
    // wires its page/slot renderer here): this bridge renders the engine's
    // open view, the same renderer the GET surface above uses. The render
    // engine's enriched card map is expired first — the same post-save
    // expiry the staging dispatch performs (Ruby expires the saved card's
    // cache on every save, cache/all.rb).
    renderSlot: async (name) => {
      storage!.engine.expireRenderCard(name);
      return storage!.engine.render(name, "open");
    },
  };
  sideDenyCtx = {
    driver: sideDenyStorage.counting,
    fetcher: sideDenyStorage.fetcher,
  };

  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  // Each deck has its OWN auth_sessions table — the side-deny deck's Joe
  // needs a session issued against THAT storage.
  const sideDenySessions = new SessionStore({ driver: sideDenyStorage.counting });
  sideDenyJoeToken = (await sideDenySessions.createSession(JOE_ID)).token;

  const bridge = await makeServer(storage, ctx, { get: "render-open" });
  server = bridge.server;
  baseUrl = bridge.url;
  const sideBridge = await makeServer(sideDenyStorage, sideDenyCtx, { get: "render-open" });
  sideDenyServer = sideBridge.server;
  sideDenyBaseUrl = sideBridge.url;
}, 60_000);

afterAll(() => {
  server?.close();
  sideDenyServer?.close();
  storage?.close();
  sideDenyStorage?.close();
});

/** The side-deny deck: *all+*create -> [[Editor]] (denies Joe), but
 *  Set+*type+*create -> [[Anyone Signed In]] (cards of the deck's DEFAULT
 *  type pass — new cards resolve *all+*default to type id 2, the "Set"
 *  codename card in this seed). A junction "Trunk+Ghost Part" then passes
 *  permit(:create) through its *type rule, while the MISSING right part
 *  resolves as a virtual NEW card with no type -> its ok?(:create) falls
 *  to the Editor-only *all rule -> ok_to_create_side denies
 *  (permissions.rb:127-137). The side walk is thereby proven through HTTP:
 *  trunk allowed, side denied. */
async function seedSideDenyDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*update", codename: "update" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 9, name: "*default", codename: "default" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 11, 30, "editor");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 14, name: "Basic" });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 16, leftId: 15, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 16, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 9, typeId: SET_TYPE_ID });
  // the side-deny levers: the *rstar set (compound names with a *-tagged
  // right) allows Anyone Signed In, the *star set (*-named cards) is
  // Editor-locked — pattern order (registry.ts: self, type_plus_right,
  // right, rule, RSTAR, STAR, type, all_plus, all) lets a junction pass
  // permit(:create) through *rstar while its missing *-named side is
  // denied through *star by ok_to_create_side
  await seedCard(s, { id: 18, name: "*rstar", codename: "rstar" });
  await seedCard(s, { id: 19, name: "*star", codename: "star" });
  await seedCard(s, { id: 20, name: "*rstar+*create", leftId: 18, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 20, 7, "anyone signed in");
  await seedCard(s, { id: 21, name: "*star+*create", leftId: 19, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 21, 30, "editor");
  await seedCard(s, { id: 30, name: "Editor" });
  await seedCard(s, { id: 50, name: "Trunk", typeId: 14, dbContent: "trunk body" });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
}

// -----------------------------------------------------------------------

describe("signed-in save over HTTP (the full write path)", () => {
  it("form update with a token session: 303 See Other, absolute Location, rows written", async () => {
    // A real decko edit form POSTs with the Rails _method override (patch).
    // Live response shape: redirect_cud_success hard_redirects 303 with the
    // card_url-absolute Location (response.rb:31,41; captured step-07:
    // "http://localhost:3011/Session_Replay_Probe_G_2026_09_28").
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "widget body v2 — saved over HTTP", _method: "patch" },
      token: joeToken,
    });
    expect(res.headers["location"]).toBe(`${baseUrl}/Widget`); // card_url absolute (response.rb:41)

    // READ side reflects the save: the record and the RENDER carry v2.
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.status).toBe(200);
    expect(record.json().dbContent).toBe("widget body v2 — saved over HTTP");
    const page = await call(baseUrl, "GET", "/Widget", {});
    expect(page.status).toBe(200);
    expect(page.body).toContain("widget body v2 — saved over HTTP");

    // EVENT rows: one act attributed to Joe, an update action, a db_content
    // change with the new value (the ActWriter shapes the write path tests
    // pin; here through the HTTP layer).
    const driver = storage!.counting;
    const act = await driver.query<{ actor_id: number; ip_address: string | null }>(
      `SELECT a.actor_id, a.ip_address FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = 'widget' ORDER BY a.id DESC LIMIT 1`,
      [],
    );
    expect(act.rows[0]?.actor_id).toBe(JOE_ID);
    const action = await driver.query<{ action_type: number }>(
      `SELECT act.action_type FROM card_actions act
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = 'widget' ORDER BY act.id DESC LIMIT 1`,
      [],
    );
    expect(action.rows[0]?.action_type).toBe(actionTypeCode("update"));
    const change = await driver.query<{ field: number; value: string }>(
      `SELECT ch.field, ch.value FROM card_changes ch
       JOIN card_actions act ON act.id = ch.card_action_id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = 'widget' ORDER BY ch.id DESC LIMIT 1`,
      [],
    );
    expect(change.rows[0]?.value).toBe("widget body v2 — saved over HTTP");
  });

  it("form update with ONLY the session cookie (no token anywhere): 303, save lands", async () => {
    // The live transport: real decko forms ride the cookie session
    // (auth/current.rb:50-63 signin_with_session — the captured saves carry
    // no token at all). The port reads the staging session cookie.
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "cookie-session save", _method: "patch" },
      cookie: `decko_ts_session=${joeToken}`,
    });
    expect(res.status).toBe(303);
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.json().dbContent).toBe("cookie-session save");
    const act = await storage!.counting.query<{ actor_id: number }>(
      `SELECT a.actor_id FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id
       WHERE c.key = 'widget' ORDER BY a.id DESC LIMIT 1`,
      [],
    );
    expect(act.rows[0]?.actor_id).toBe(JOE_ID);
  });

  it("PUT JSON update with a Bearer session: 200 JSON (API shape)", async () => {
    const res = await call(baseUrl, "PUT", "/Widget.json", {
      json: { card: { content: "widget body v3 (json api)" } },
      token: joeToken,
    });
    expect(res.status).toBe(200);
    expect(res.json().card).toMatchObject({ name: "Widget" });
    expect(res.json().verb).toBe("update");
  });

  it("PUT update (RESTful verb) and POST create both work per the Ruby grammar", async () => {
    const put = await call(baseUrl, "PUT", "/Widget.json", {
      json: { card: { content: "widget body v4 (put)" } },
      token: joeToken,
    });
    expect(put.status).toBe(200);
    expect(put.json().verb).toBe("update");

    const create = await call(baseUrl, "POST", "/HTTP Made.json", {
      json: { card: { content: "created over http" } },
      token: joeToken,
    });
    expect(create.status).toBe(200);
    expect(create.json().verb).toBe("create");
    const record = await call(baseUrl, "GET", "/HTTP_Made.json", {});
    expect(record.json().dbContent).toBe("created over http");
  });

  it("DELETE trashes the card over HTTP", async () => {
    const create = await call(baseUrl, "POST", "/Doomed.json", {
      json: { card: { content: "doomed" } },
      token: joeToken,
    });
    expect(create.status).toBe(200);
    const del = await call(baseUrl, "DELETE", "/Doomed.json", { token: joeToken });
    expect(del.status).toBe(200);
    expect(del.json().verb).toBe("delete");
    const record = await call(baseUrl, "GET", "/Doomed.json", {});
    expect(record.status).toBe(404);
  });

  it("update of a missing mark routes to CREATE (rest.rb: card.new_card? ? create)", async () => {
    const res = await call(baseUrl, "PUT", "/Fresh From Put.json", {
      json: { card: { content: "via update-as-create" } },
      token: joeToken,
    });
    expect(res.json().verb).toBe("create");
  });

  it("XHR save (ajax soft redirect): 200 + rendered slot of the saved card", async () => {
    // response.rb:25-36: the ajax flavor (request.xhr? — X-Requested-With
    // XMLHttpRequest, actionpack request.rb:290-294) defaults to the SOFT
    // redirect and re-renders through `show` (:54-62). The captured XHR
    // save came back 200 + the card's slot (manifest step-04). Here the
    // host hook renders the engine's open view.
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "xhr slot save", _method: "patch" },
      token: joeToken,
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("xhr slot save");
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.json().dbContent).toBe("xhr slot save");
  });
});

describe("the permission gates through HTTP (ok_to_* walks)", () => {
  it("ok_to_update? denial: the card's *self rule names a party Joe is not in (403)", async () => {
    const res = await call(baseUrl, "PUT", "/Locked.json", {
      json: { card: { content: "should not land" } },
      token: joeToken,
    });
    expect(res.status).toBe(403); // Card::Error::PermissionDenied.status_code
    // nothing landed
    const record = await call(baseUrl, "GET", "/Locked.json", {});
    expect(record.json().dbContent).toBe("locked body");
  });

  it("ok_to_update? type-change clause: update allowed, create denied -> type change is 403", async () => {
    // Widget: *all+*update -> Anyone Signed In (Joe passes), but
    // Widget+*self+*create -> [[Editor]] (Joe fails). Content-only saves
    // pass; a type-changing save additionally needs permitted?(:create)
    // (permissions.rb:148-153).
    const contentOnly = await call(baseUrl, "PUT", "/Widget.json", {
      json: { card: { content: "still allowed" } },
      token: joeToken,
    });
    expect(contentOnly.status).toBe(200);
    const typeChange = await call(baseUrl, "PUT", "/Widget.json", {
      json: { card: { content: "retyped", type: "RichText" } },
      token: joeToken,
    });
    expect(typeChange.status).toBe(403);
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.json().dbContent).toBe("still allowed"); // the retype never landed
  });

  it("ok_to_create? denial rides the junction sides: trunk allowed, missing part denied (403)", async () => {
    // The MISSING right part resolves as a virtual new card WITH its
    // would-be type (the HIGH-1 fix: resolveTypeId -> defaultTypeId, the
    // *all+*default rule card's type_id = 2 here) — a "typeless part"
    // premise would pin the pre-HIGH-1 divergence. The deny instead rides
    // the side's *star candidate: the side "*Ghost Part" is *-named ->
    // *star+*create -> [[Editor]] (Joe is not one), while the JUNCTION
    // passes permit(:create) through *rstar+*create -> [[Anyone Signed In]]
    // (rstar precedes type in the pattern walk — registry order;
    // permissions.rb:127-137 for the side recursion). The 403 can only
    // come from ok_to_create_side.
    const res = await call(sideDenyBaseUrl, "POST", "/Trunk+*Ghost Part.json", {
      json: { card: { content: "junction" } },
      token: sideDenyJoeToken,
    });
    expect(res.status).toBe(403);
  });

  it("ok_to_create? sides pass when every part exists (200)", async () => {
    const s = sideDenyStorage!;
    await seedCard(s, { id: 51, name: "Left Part", typeId: 14 });
    await seedCard(s, { id: 52, name: "Right Part", typeId: 14 });
    const res = await call(sideDenyBaseUrl, "POST", "/Left Part+Right Part.json", {
      json: { card: { content: "junction with existing parts" } },
      token: sideDenyJoeToken,
    });
    expect(res.json().verb).toBe("create");
  });
});

describe("anonymous and bad-token writes are denied (403, Ruby's PermissionDenied shape)", () => {
  it("no token at all", async () => {
    const res = await call(baseUrl, "POST", "/Widget.json", {
      json: { card: { content: "anonymous edit" } },
    });
    expect(res.status).toBe(403);
  });

  it("unknown token degrades to Anonymous (auth/current.rb:58-63), still 403", async () => {
    const res = await call(baseUrl, "POST", "/Widget.json", {
      json: { card: { content: "forge" } },
      token: "not-a-real-token",
    });
    expect(res.status).toBe(403);
  });

  it("anonymous create is denied too", async () => {
    const res = await call(baseUrl, "POST", "/Anon Made.json", {
      json: { card: { content: "nope" } },
    });
    expect(res.status).toBe(403);
    const record = await call(baseUrl, "GET", "/Anon_Made.json", {});
    expect(record.status).toBe(404);
  });
});

describe("no forgery protection (the live decko CSRF posture)", () => {
  // decko-0.20.0 / card-1.110.0 contain no protect_from_forgery call
  // anywhere; the only forgery reference in the generation is
  // config/environments/cucumber.rb:27, which DISABLES it. The captured
  // real session is the proof: token-less form posts go straight through
  // to the action gates (the earlier TS HMAC-token gate + 422s modeled the
  // Rails default, not the live app, and are gone).

  it("form post WITHOUT an authenticity token, signed-in session: saves (303)", async () => {
    // the captured live shape: step-07 POST /update/<probe>, no token
    // anywhere, 303 success
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "csrf-less live-shape save", _method: "patch" },
      token: joeToken,
    });
    expect(res.status).toBe(303);
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.json().dbContent).toBe("csrf-less live-shape save");
  });

  it("form post with a GARBAGE authenticity token: still saves (no such gate)", async () => {
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "forged token rides fine", authenticity_token: "forged", _method: "patch" },
      token: joeToken,
    });
    expect(res.status).toBe(303);
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.json().dbContent).toBe("forged token rides fine");
  });

  it("form post with NO session behind it: 403 PermissionDenied (the anonymous write gate)", async () => {
    // live step-08: the anonymous denial is Ruby's permission gate
    // (403), not a forgery 422 — the token-less anonymous POST reaches
    // ok_to_update? and is denied there.
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "anonymous form", _method: "patch" },
    });
    expect(res.status).toBe(403);
    const record = await call(baseUrl, "GET", "/Widget.json", {});
    expect(record.json().dbContent).not.toBe("anonymous form");
  });

  it("cross-origin form post: not a live failure (origin check lives inside the never-armed verify_authenticity_token)", async () => {
    const res = await call(baseUrl, "POST", "/Widget", {
      form: { "card[content]": "cross origin", _method: "patch" },
      token: joeToken,
      origin: "https://evil.example",
    });
    expect(res.status).toBe(303);
  });
});

describe("the *signin update IS the login action (card-mod-account set/self/signin.rb)", () => {
  it("subcard-grammar sign-in: 303 to *previous, session cookie issued, zero card rows", async () => {
    // Ruby: the :signin event (signin.rb:10-12) authenticates the
    // +*email/+*password subcard contents; signin_success aborts the save
    // (:15-17 — no card rows); the controller redirects to *previous
    // (:171), which on a fresh session history is "/" (location_history
    // .rb:6-9). No account cards exist in this seed deck -> the Ruby
    // failure ladder path; assert the FAILURE shape here (422, the
    // abort-failure UserError status) and the full success shape in the
    // edit-session replay (the captured Sara sign-in).
    const res = await call(baseUrl, "POST", "/update/*signin", {
      form: {
        "card[subcards][+*email][content]": "nobody@example.com",
        "card[subcards][+*password][content]": "wrong",
        _method: "patch",
        "success[redirect]": "true",
        "success[mark]": "*previous",
      },
    });
    expect(res.status).toBe(422);
    // no act may land (the :signin update never saves the card)
    const acts = await storage!.counting.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card_acts a
       JOIN card_actions act ON act.card_act_id = a.id
       JOIN cards c ON c.id = act.card_id WHERE c.key = 'signin'`,
      [],
    );
    expect(acts.rows[0]?.n).toBe(0);
  });
});

describe("error shapes over HTTP", () => {
  it("shows Ruby's denial text: anonymous asked to sign in, signed-in told they need permission", async () => {
    const anon = await call(baseUrl, "POST", "/", { form: { "card[name]": "Denied Probe" } });
    expect(anon.status).toBe(403);
    expect(anon.body).toContain("<pre>Sorry! Please sign in or sign up to do that.</pre>");
    // the engine's own reason stays in a comment beside it
    expect(anon.body).toMatch(/<\/pre><!-- .+ -->/);
  });

  it("shows validation errors as the errors view words them", async () => {
    const res = await call(baseUrl, "POST", "/", { form: { "card[name]": "" }, token: joeToken });
    expect(res.status).toBe(422);
    expect(res.body).toContain("<pre>NAME: can't be blank</pre>");
  });

  it("missing card on DELETE: 422 (Card::Error::UserError)", async () => {
    // The controller fetches a NEW card for the mark and deleting a new card
    // raises a bare UserError. Measured against the oracle by the
    // side-effects parity harness: anonymous HTML, signed-in HTML and
    // signed-in JSON deletes of a missing card all answer 422.
    const res = await call(baseUrl, "DELETE", "/Never Was.json", { token: joeToken });
    expect(res.status).toBe(422);
  });

  it("create with no name: 422 (Ruby Card.new(name: nil).save! validation)", async () => {
    const res = await call(baseUrl, "POST", "/", {
      json: { card: { content: "nameless" } },
      token: joeToken,
    });
    expect(res.status).toBe(422);
  });

  it("multi-segment marks are not routes (Rails: no match) -> the host keeps its 405", async () => {
    const res = await call(baseUrl, "POST", "/card/read/Widget", {
      json: { card: { content: "x" } },
      token: joeToken,
    });
    expect(res.status).toBe(405);
  });
});
