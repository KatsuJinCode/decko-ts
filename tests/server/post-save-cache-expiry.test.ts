// The post-save render-cache expiry seam (src/server/post-save-cache-expiry.ts):
// every successful save must leave every render engine serving the saved
// bytes, regardless of the save's response flavor. The failure shape this
// seam exists to prevent: a JSON write returns 200 + a JSON body (no
// Location header), an expiry gate keyed on Location alone never fires,
// and the warm signed-in engine keeps serving the pre-save page while the
// database already holds the save.
//
// Ruby truth under test: Card#expire runs in the after_commit integration
// phase (card-1.110.0 lib/card/director/phases.rb:3,:54) on EVERY committed
// save — the response flavor cannot opt a save out of expiry.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { RenderEngine } from "../../src/card/render.js";
import {
  handleWriteRequest,
  type WriteRouteContext,
  type WriteRouteRequest,
} from "../../src/server/write-routes.js";
import { expireRenderCachesAfterSave } from "../../src/server/post-save-cache-expiry.js";
import { DeckoName } from "../../src/card/name.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const V1 = "widget cache body v1";
const V2 = "widget cache body v2 json api save";
const V3 = "widget cache body v3 html flavor save";
const V4 = "widget cache body v4 self contained baseline";
const V5 = "widget cache body v5 never lands";

let storage: RenderTestStorage;
let ctx: WriteRouteContext;
let joeToken = "";

/** The same rule deck write-routes.test.ts seeds (the proven render+auth
 *  minimum): Widget (Basic, content V1) with *all+*update -> Anyone Signed
 *  In, and Joe User's account row. */
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
  await byId(13, "Widget", { typeId: 14, dbContent: V1 });
  await byId(14, "Basic");
  await seedCard(s, { id: 15, leftId: 14, rightId: 8, typeId: SET_TYPE_ID });
  await byId(16, "RichText");
  await byId(JOE_ID, "Joe User");
}

/** One write through the same handleWriteRequest dispatch the staging
 *  server runs (vm-staging-server.mjs dispatchWriteRequest). */
function writeRequest(
  method: string,
  pathname: string,
  body: string,
  headers: Record<string, string> = {},
): WriteRouteRequest {
  return {
    method,
    pathname,
    host: "127.0.0.1",
    headers: { "content-type": "application/json", ...headers },
    body,
  };
}

/** The boot topology exactly as vm-staging-server.mjs builds it: ONE shared
 *  FetchEngine (write ctx + render), the anonymous boot render engine, and
 *  a per-actor signed-in render engine whose viewer is set before its first
 *  render (engineForActor). */
function bootTopology() {
  const bootEngine = storage.engine;
  const signedInEngine = new RenderEngine(storage.fetcher);
  signedInEngine.viewer = { signedIn: true, actorId: JOE_ID };
  return {
    engines: {
      fetcher: storage.fetcher,
      renderEngine: bootEngine,
      signedInEngines: [signedInEngine],
    },
    bootEngine,
    signedInEngine,
  };
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRuleDeck(storage);
  // No csrfSecret in the context: live decko arms no forgery protection,
  // and the write path carries no HMAC CSRF posture (the captured real
  // editing session is the oracle: token-less form posts save).
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("post-save render-cache expiry (every successful save, any response flavor)", () => {
  it("a JSON save (200, no Location) expires the render engines: re-render serves the saved bytes", async () => {
    const { engines, bootEngine, signedInEngine } = bootTopology();

    // Warm both engines on the pre-save card (the staging signed-in GET
    // that filled the engine's caches before the JSON save).
    const beforeJoe = await signedInEngine.render("Widget", "open");
    expect(beforeJoe).toContain(V1);
    const beforeAnon = await bootEngine.render("Widget", "open");
    expect(beforeAnon).toContain(V1);

    // THE SAVE, JSON flavor: PUT /Widget.json with a Bearer session — the
    // staging repro (POST /update/<mark>.json). Success is 200 + a JSON
    // body; no Location header exists on this flavor.
    const save = await handleWriteRequest(
      ctx,
      writeRequest("PUT", "/Widget.json", JSON.stringify({ card: { content: V2 } }), {
        authorization: `Bearer ${joeToken}`,
      }),
    );
    expect(save?.status).toBe(200);
    expect(JSON.parse(save?.body ?? "{}")).toMatchObject({ verb: "update" });
    expect(save?.headers.Location).toBeUndefined();

    // The database took the save even in the broken state (the receipt's
    // "correct DB, stale page" split).
    const record = await storage.fetcher.fetchByKey(DeckoName.parse("Widget").key);
    expect(record?.dbContent).toBe(V2);

    // The host applies its post-save expiry through the seam.
    expireRenderCachesAfterSave(engines, save as NonNullable<typeof save>);

    // Re-render: bytes must reflect the save — on BOTH engines.
    const afterJoe = await signedInEngine.render("Widget", "open");
    expect(afterJoe).toContain(V2);
    expect(afterJoe).not.toContain(V1);
    const afterAnon = await bootEngine.render("Widget", "open");
    expect(afterAnon).toContain(V2);
    expect(afterAnon).not.toContain(V1);
  });

  it("an HTML save (303 + Location) still expires through the same seam", async () => {
    const { engines, bootEngine, signedInEngine } = bootTopology();
    const before = await signedInEngine.render("Widget", "open");
    expect(before).toContain(V2);

    const save = await handleWriteRequest(
      ctx,
      writeRequest("PUT", "/Widget", JSON.stringify({ card: { content: V3 } }), {
        authorization: `Bearer ${joeToken}`,
        accept: "text/html",
      }),
    );
    expect(save?.status).toBe(303); // Ruby redirect_cud_success hard_redirects 303 (decko-0.20.0 lib/card_controller/response.rb:25-31; sibling pins write-routes.test.ts:317)
    expect(save?.headers.Location).toBe("http://127.0.0.1/Widget"); // success.to_url is card_url-absolute (response.rb:31; sibling pin write-routes.test.ts:308,317)

    expireRenderCachesAfterSave(engines, save as NonNullable<typeof save>);

    const after = await signedInEngine.render("Widget", "open");
    expect(after).toContain(V3);
    expect(after).not.toContain(V2);
    const afterAnon = await bootEngine.render("Widget", "open");
    expect(afterAnon).toContain(V3);
  });

  it("a DENIED save (403) expires nothing: no commit, no integration phase", async () => {
    // Ruby: PermissionDenied aborts before commit — integration_phase's
    // callback guard (phases.rb:19-21) never fires, so no expire. The seam
    // must likewise refuse to treat a failed write as a save. Self-contained
    // baseline: an allowed JSON save first, then the denied attempt.
    const { engines, signedInEngine } = bootTopology();
    const baseline = await handleWriteRequest(
      ctx,
      writeRequest("PUT", "/Widget.json", JSON.stringify({ card: { content: V4 } }), {
        authorization: `Bearer ${joeToken}`,
      }),
    );
    expect(baseline?.status).toBe(200);
    expireRenderCachesAfterSave(engines, baseline as NonNullable<typeof baseline>);
    expect(await signedInEngine.render("Widget", "open")).toContain(V4);

    const denied = await handleWriteRequest(
      ctx,
      writeRequest("PUT", "/Widget.json", JSON.stringify({ card: { content: V5 } })),
    );
    expect(denied?.status).toBe(403);
    expireRenderCachesAfterSave(engines, denied as NonNullable<typeof denied>);

    // The denial must not have disturbed the engines' caches — the
    // still-current content renders exactly as before.
    expect(await signedInEngine.render("Widget", "open")).toContain(V4);
    expect(await signedInEngine.render("Widget", "open")).not.toContain(V5);
  });
});
