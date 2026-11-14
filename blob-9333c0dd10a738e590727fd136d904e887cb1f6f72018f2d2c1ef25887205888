// The expire_related structuree arm (card-mod-permissions
// set/all/update_read_rules.rb:8-11), ported through the engine's post-save
// seam (CardActionEngine.expireAfterWrite -> expireRelatedStructurees) and
// the write response's expiryNames (write-routes.ts).
//
// Ruby truth under test:
//
//   event :expire_related, :finalize do
//     reset_patterns
//     structuree_names.each { |name| Director.expirees << name } if is_structure?
//   end
//
// - is_structure? (card-mod-content set/all/templating.rb:10-13): the
//   name's right card carries the :structure codename.
// - structuree_names (card-mod-content set/right/structure.rb:49-55,
//   :71-76): the rule's trunk must be a Set-type card; the members are the
//   set's item cards (fetch_query = the set pattern's member query).
// - Director.expirees (lib/card/director/class_methods.rb:42-45): at act
//   end each queued name runs Card.expire — the next read of a structuree
//   re-renders through the SAVED rule's content, never the pre-save
//   template.
//
// The observable contract: after a *structure rule save, a render engine
// that warmed a structuree on the pre-save template serves the NEW
// template's bytes (both engines, every structuree — not just the saved
// rule card whose own name the save always expired). The reverse gate is
// pinned too: a NON-structure save queues no structurees.

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

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const BASIC_TYPE_ID = 14;
const TYPE_TAG_ID = 8; // *type
const STRUCTURE_V1 = "<p>structured template body v1</p>";
const STRUCTURE_V2 = "<p>structured template body v2 saved</p>";

let storage: RenderTestStorage;
let ctx: WriteRouteContext;
let joeToken = "";

/** The rule deck plus the *structure family: the *structure setting card
 *  (codename structure), two Basic-type structurees (Alpha, Beta), the
 *  Basic+*type set card, and the Basic+*type+*structure rule whose content
 *  IS both structurees' rendered body. */
async function seedStructureDeck(s: RenderTestStorage): Promise<void> {
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
  await byId(13, "Widget", { typeId: BASIC_TYPE_ID, dbContent: "widget own body" });
  await byId(14, "Basic");
  await byId(16, "RichText");
  await byId(JOE_ID, "Joe User");
  // the structure family
  await byId(19, "*structure", { codename: "structure" });
  await byId(30, "Alpha", { typeId: BASIC_TYPE_ID });
  await byId(31, "Beta", { typeId: BASIC_TYPE_ID });
  await byId(32, "Basic+*type", { typeId: SET_TYPE_ID, leftId: BASIC_TYPE_ID, rightId: TYPE_TAG_ID });
  await seedCard(s, {
    id: 33,
    name: "Basic+*type+*structure",
    leftId: 32,
    rightId: 19,
    typeId: BASIC_TYPE_ID,
    dbContent: STRUCTURE_V1,
  });
}

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
  await seedStructureDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("expire_related — a *structure rule save expires its set's members", () => {
  it("both engines re-render every structuree through the saved template", async () => {
    const { engines, bootEngine, signedInEngine } = bootTopology();

    // Warm BOTH engines on BOTH structurees — the pre-save template's
    // bytes are what a stale engine would keep serving.
    const alphaBefore = await signedInEngine.render("Alpha", "open");
    expect(alphaBefore).toContain(STRUCTURE_V1);
    const betaBefore = await bootEngine.render("Beta", "open");
    expect(betaBefore).toContain(STRUCTURE_V1);

    // THE SAVE: the *structure rule's content changes v1 -> v2.
    const save = await handleWriteRequest(
      ctx,
      writeRequest(
        "PUT",
        "/Basic+*type+*structure.json",
        JSON.stringify({ card: { content: STRUCTURE_V2 } }),
        { authorization: `Bearer ${joeToken}` },
      ),
    );
    if (save?.status !== 200) console.error("SAVE BODY", save?.body);
    expect(save?.status).toBe(200);

    // The response carries the structurees (Director.expirees' queue, made
    // observable to the host gate through expiryNames — the response-level
    // field the gate walks, post-save-cache-expiry.ts).
    const expiryNames = save?.expiryNames ?? [];
    expect(expiryNames).toContain("Alpha");
    expect(expiryNames).toContain("Beta");
    // Widget shares the Basic type — a member of the same set.
    expect(expiryNames).toContain("Widget");

    // The host applies its post-save expiry through the seam.
    expireRenderCachesAfterSave(engines, save as NonNullable<typeof save>);

    // Re-render: EVERY structuree serves the new template on BOTH engines.
    const alphaAfter = await signedInEngine.render("Alpha", "open");
    expect(alphaAfter).toContain(STRUCTURE_V2);
    expect(alphaAfter).not.toContain(STRUCTURE_V1);
    const betaAfter = await signedInEngine.render("Beta", "open");
    expect(betaAfter).toContain(STRUCTURE_V2);
    expect(betaAfter).not.toContain(STRUCTURE_V1);
    const alphaAnon = await bootEngine.render("Alpha", "open");
    expect(alphaAnon).toContain(STRUCTURE_V2);
    expect(alphaAnon).not.toContain(STRUCTURE_V1);
    const betaAnon = await bootEngine.render("Beta", "open");
    expect(betaAnon).toContain(STRUCTURE_V2);
  });

  it("a NON-structure save queues no structurees (the is_structure? gate)", async () => {
    // Widget's own content save: not a *structure rule card — the event
    // body's if-guard is false, and the response's expiryNames carries no
    // set members (only the subcard list, empty here).
    const save = await handleWriteRequest(
      ctx,
      writeRequest("PUT", "/Widget.json", JSON.stringify({ card: { content: "widget body edited" } }), {
        authorization: `Bearer ${joeToken}`,
      }),
    );
    expect(save?.status).toBe(200);
    // The NON-structure save's response-level expiryNames carries no set
    // members (the accumulator only fills for *structure rule saves).
    const expiryNames = save?.expiryNames ?? [];
    expect(expiryNames).not.toContain("Alpha");
    expect(expiryNames).not.toContain("Beta");
  });
});
