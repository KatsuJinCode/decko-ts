// The delete answer for an ajax delete whose success target is the deleted
// card itself (Ruby's configure_successful_deletion, mod/session
// set/all/location_history.rb:9-17, inside event :discard_deleted_locations,
// :finalize on :delete, :1-4):
//
//   discard_locations_for self            # first: the card's history entries go
//   configure_successful_deletion if success.target == self
//     if Env.ajax? && !Env.params[:is_main]
//       success.card = self               # soft redirect renders the view
//       success.view = :unknown unless success.view
//     else
//       success.redirect = true           # hard redirect to *previous
//       success.target = :previous        # resolved AFTER the discard
//     end
//
// So a NON-main ajax delete (the search results bar's Delete, no is_main)
// soft-redirects to the deleted card and renders the requested view,
// success[view]=just_deleted (Ruby's delete_success non-main branch,
// mod/edit/set/all/form_buttons.rb:72-78; the view at
// mod/edit/set/all/editing.rb:46-48: "<title> deleted"). A MAIN ajax delete
// (is_main present) answers the JSON redirect to the previous location with
// the deleted card's own entries already discarded (response.rb:31-46).
//
// No vi.mock: the engine is the real RenderEngine behind the renderSlot seam
// the Cloudflare host wires (cloudflare-write-routes.ts mountWrite: expire the
// saved card, then engine.render(name, view ?? "titled", absentCard options)).

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
import {
  emptyVisitorSession,
  visitorSessionCookie,
} from "../../src/card/session/visitor-session.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModEdit from "../../src/card/mod-loader/mods/card-mod-edit.js";
import { bindModLoaderToEngine } from "../card/render/render-test-storage.js";
import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
const RICH_TEXT_TYPE_ID = 16;
const JOE_ID = 90;
const DOOMED_ID = 50;
const DOOMED = "Doomed Card";
const OTHER_PAGE = "/Other_Page";

let storage: RenderTestStorage;
let bridge: BridgeServer;
let joeToken: string;

/** The rules a signed-in owner's delete needs: *all+*delete grants
 *  [[Anyone Signed In]] (the write-routes.test.ts rule-deck shape). */
async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*update", codename: "update" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 9, name: "*self", codename: "self" });
  await seedCard(s, { id: 18, name: "*default", codename: "default" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 14, name: "Basic" });
  await seedCard(s, { id: RICH_TEXT_TYPE_ID, name: "RichText" });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  await seedCard(s, { id: DOOMED_ID, name: DOOMED, typeId: RICH_TEXT_TYPE_ID, dbContent: "doomed body" });
}

/** The visitor cookie a browser carries after visiting the deleted card's
 *  page and then OTHER_PAGE (location_history.rb: the history stack, oldest
 *  first; previous_location is its last entry). */
function visitCookie(history: string[]): string {
  const state = emptyVisitorSession();
  state.history = history;
  return visitorSessionCookie(state).split(";")[0] ?? "";
}

async function del(
  base: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(`${base}${path}`, { method: "DELETE", headers, redirect: "manual" });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedDeck(storage);
  // The production host always carries the mod deck; just_deleted is the
  // card-mod-edit view (all/editing.rb:46-48), so the loader is bound the way
  // card-mod-edit.test.ts binds it.
  const loader = new ModLoader([{ manifest: cardModEdit }]);
  loader.load();
  bindModLoaderToEngine(storage, loader);
  await loader.installInto(modEngineHost(storage.engine, storage.fetcher));
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  const ctx: WriteRouteContext = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    // The Cloudflare host's renderSlot (cloudflare-write-routes.ts mountWrite).
    renderSlot: async (name, view, _subcardNames, opts) => {
      storage.fetcher.expireName(name);
      storage.engine.expireRenderCard(name);
      return storage.engine.render(
        name,
        view ?? "titled",
        opts?.absentCard === true ? { absentCard: true } : {},
      );
    },
  };
  bridge = await makeWriteRouteServer(storage, ctx);
});

afterAll(async () => {
  await new Promise<void>((resolve) => (bridge?.server as http.Server | undefined)?.close(() => resolve()));
});

const AJAX = { "X-Requested-With": "XMLHttpRequest" };
// Decko's card URLs carry the name's url_key (spaces as underscores).
const DOOMED_PATH = `/Doomed_Card`;

describe("ajax delete answers Ruby's configure_successful_deletion", () => {
  it("non-main ajax delete (search bar, no is_main) renders the just_deleted view", async () => {
    const res = await del(bridge.url, `${DOOMED_PATH}?success%5Bview%5D=just_deleted`, {
      ...AJAX,
      Authorization: `Bearer ${joeToken}`,
    });
    expect(res.status, res.body).toBe(200);
    // The full slot wrap around the title view, "<title> deleted"
    // (all/editing.rb:46-48 `wrap { "#{render_title} deleted" }`).
    expect(res.body).toContain('class="card-slot just_deleted-view');
    expect(res.body).toContain('data-card-name="Doomed Card"');
    expect(res.body).toContain('<span class="card-title" title="Doomed Card">Doomed Card</span> deleted');
  });

  it("main ajax delete (is_main) answers the previous-location redirect, its own entries discarded", async () => {
    // A fresh card so the first test's delete does not decide this one.
    await seedCard(storage, { id: 51, name: "Doomed Twice", typeId: RICH_TEXT_TYPE_ID, dbContent: "again" });
    const cookie = visitCookie([`http://127.0.0.1${OTHER_PAGE}`, "/Doomed_Twice/board"]);
    const res = await del(bridge.url, `/Doomed_Twice?success%5Bview%5D=just_deleted&is_main=true`, {
      ...AJAX,
      Authorization: `Bearer ${joeToken}`,
      Cookie: cookie,
    });
    expect(res.status, res.body).toBe(200);
    const body = JSON.parse(res.body) as { redirect?: string };
    // Ruby discards every history entry naming the deleted card, then
    // resolves :previous: the last entry left is the other page.
    expect(body.redirect).toBe(`http://127.0.0.1${OTHER_PAGE}`);
  });
});
