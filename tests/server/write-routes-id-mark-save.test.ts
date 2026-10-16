// Editing an existing card through its "~<id>" mark on the write surface:
// the pointer/list junction save that failed on the Bunny edge with a 500.
//
// Ruby truth under test
// ---------------------
// * The mark itself: engine_routes.rb's `(card)/update(/:mark)` (routes.rb:
//   46-47) and CardController::Rest#update (rest.rb:14-16) accept ANY mark,
//   and card-1.110.0 lib/card/lexicon.rb#name(id) is cache-first WITH a
//   synchronous db fallback — so every id the deck holds resolves, cold
//   isolate or not.
// * A mark the deck does NOT hold is Card::Error::NotFound (name.rb:102-105
//   bad_mark raises NotFound for an ID_MARK), the 404 class (error.rb:88).
//
// Why the port needs an explicit warm
// -----------------------------------
// DeckoName's id-mark resolution is synchronous (src/card/name.ts:309) and
// answers only the lexicon's WARM entries (src/card/fetch/lexicon.ts's peek
// adapters: "the sync mirror deliberately has none" of Ruby's db fallback).
// The Bunny edge boot runs WITHOUT the deck-wide name scan
// (deploy/bunny-worker-src/bunny-edge-deck-boot.ts, DECKO_EDGE_NAME_SCAN
// off by default), so an isolate that has not yet read a junction id would
// throw NameNotFoundError out of dispatchWriteRequest — rethrown by the
// catch (write-routes.ts) as a non-CardActionError and answered as a 500.
// The GET path warms id marks (deploy/worker.ts warmMark); the write path
// now warms them too (write-routes.ts warmIdMarks) before the first parse.
//
// The case under test is the one the demo hit: Fixture Owner+
// Planning Projects (card 1743, a List junction with multi-line pointer
// content) saved through POST /update/~1743.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { handleWriteRequest, type WriteRouteContext } from "../../src/server/write-routes.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const EDITOR_ID = 30;
/** Synthetic cards exercising the captured cold-ID route shape. */
const PERSON_ID = 393; // Fixture Owner (type Person)
const POINTER_FIELD_ID = 1638; // Planning Projects (a pointer field)
const JUNCTION_ID = 1743; // the List junction the demo saved

let storage: RenderTestStorage;
let ctx: WriteRouteContext;
let token = "";

async function seedRuleDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (id: number, name: string, extra: Record<string, unknown> = {}) =>
    seedCard(s, { id, name, ...extra });
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
  await byId(EDITOR_ID, "Editor");
  await byId(JOE_ID, "Joe User");
  // Brandon's structure: a Person trunk, a pointer field, and the List
  // junction that joins them. "Planning Projects" is the case that
  // exercises the card gem's uncountable "s" inflection ("(s)" keys to
  // "_s_", not to nothing), so the stored keys only resolve with that
  // table applied — as the edge boot applies it.
  await byId(47, "List", { codename: "list", typeId: SET_TYPE_ID });
  await byId(PERSON_ID, "Fixture Owner", { dbContent: "" });
  await byId(POINTER_FIELD_ID, "Planning Projects", { dbContent: "" });
  await seedCard(s, {
    id: JUNCTION_ID,
    leftId: PERSON_ID,
    rightId: POINTER_FIELD_ID,
    typeId: 47,
    dbContent: "Associative Inquiry\nFree Aiki Dojo",
  });
}

beforeAll(async () => {
  // The card gem's initializer table (config/initializers/inflections.rb),
  // as every deck-serving origin applies at boot (deck-boot.ts:89).
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRuleDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  token = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
}, 60_000);

afterAll(() => {
  storage?.close();
});

function updateRequest(pathname: string, form: Record<string, string>, accept = "application/json") {
  const params = new URLSearchParams(form);
  return handleWriteRequest(ctx, {
    method: "POST",
    pathname,
    search: "",
    host: "127.0.0.1",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `decko_ts_session=${token}`,
      accept,
    },
    body: params.toString(),
    scheme: "http",
  } as never) as Promise<{ status: number; body: string } | null>;
}

describe("write surface: editing a card by its ~<id> mark", () => {
  it("saves a List junction through POST /update/~<id> on a cold lexicon", async () => {
    // Nothing has read the junction's id through the fetch engine yet (the
    // deck was seeded straight to rows), which is exactly the cold-isolate
    // state a write can meet on the edge.
    const res = await updateRequest(`/update/~${JUNCTION_ID}`, {
      "card[content]": "Example One\nExample Two\nExample Three",
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    // The existing junction row was UPDATED, not re-created: a create
    // answer would have hit the (left_id, right_id) UNIQUE index (a 500)
    // because the junction already exists.
    const row = await storage.fetcher.fetchByName("Fixture Owner+Planning Projects");
    expect(row?.id).toBe(JUNCTION_ID);
    expect(row?.dbContent).toContain("Example Three");
  });

  it("answers 404 for an id mark the deck does not hold", async () => {
    const res = await updateRequest("/update/~999999", { "card[content]": "nope" });
    expect(res).not.toBeNull();
    // Card::Error::NotFound (error.rb:88) — 404, not the 500 the throw used
    // to become.
    expect(res!.status).toBe(404);
  });

  it("still refuses an anonymous save of the same mark", async () => {
    const res = await handleWriteRequest(ctx, {
      method: "POST",
      pathname: `/update/~${JUNCTION_ID}`,
      search: "",
      host: "127.0.0.1",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({ "card[content]": "anonymous" }).toString(),
      scheme: "http",
    } as never) as { status: number } | null;
    // PermissionDenied -> 403 (permission.rb ok_to_*). The warm happens on
    // the way to the auth gate and must not change that.
    expect(res?.status).toBe(403);
  });
});