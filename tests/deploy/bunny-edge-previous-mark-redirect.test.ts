// The READ-path *previous mark on the serving host (register-routes B8).
//
// Ruby: mark.rb:12-14 interpret_mark("*previous") —
//     hard_redirect Card::Env.previous_location
// — the visitor session's location history's last entry
// (location_history.rb:19-21 previous_location; an empty history bottoms
// out at the deck root, card_path("")). Ruby's hard_redirect
// (response.rb:39-50): absolute via card_url, 302 for an ordinary request,
// the {redirect: url} JSON for an ajax one. No card fetch happens — the
// redirect fires before load_card.
//
// The pinned side of this row is measured in
// tests/server/previous-mark-parity.test.ts, against
// fixtures/captured/previous-mark-ruby-oracle.json. This file drives the
// REAL edge request core with visitor-session cookies the module itself
// serializes (no cookie-format reimplementation).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  readVisitorSession,
  saveLocation,
  visitorSessionCookie,
} from "../../src/card/session/visitor-session.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";

const ORIGIN = "https://script-placeholder.bunny.run";

function realDeck(storage: RenderTestStorage) {
  return {
    fetcher: storage.fetcher,
    render: storage.engine,
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  };
}

async function seedShellDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
  await seedCard(storage, { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
  await seedCard(storage, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await seedCard(storage, { id: 400, name: "*ace", codename: "ace", typeId: 52, dbContent: "{}" });
  await seedCard(storage, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 52, dbContent: "{}" });
  await seedCard(storage, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
  await seedCard(storage, { id: 600, name: "*all", codename: "all", typeId: 52 });
  await seedCard(storage, { id: 601, name: "*layout", codename: "layout", typeId: 52 });
  await seedCard(storage, { id: 22746, name: "*all+*layout", leftId: 600, rightId: 601, typeId: 52, dbContent: "Default Layout" });
  await seedCard(storage, { id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body><article>{{_main|titled}}</article></body>` });
  await seedCard(storage, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav>Site</nav>` });
  await seedCard(storage, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer>v</footer>` });
  await seedCard(storage, { id: 31001, name: "Front", typeId: 2, dbContent: "Front body prose" });
  await storage.fetcher.codenames.ensureLoaded();
}

/** A Cookie header carrying a visitor session whose location history holds
 *  the given URLs (the module's own serializer). */
function visitCookieWith(urls: string[]): string {
  const visit = readVisitorSession(undefined);
  for (const url of urls) saveLocation(visit, url);
  return visitorSessionCookie(visit);
}

describe("the READ-path *previous mark (B8) - the edge", () => {
  it("GET /*previous 302s to the visitor's last location (absolute, card_url shape)", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(
      new Request(`${ORIGIN}/*previous`, {
        headers: { cookie: visitCookieWith([`${ORIGIN}/Front`]) },
      }),
      realDeck(storage),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/Front`);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("an empty history defaults to the deck root (previousLocation's bottom-of-stack)", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(new Request(`${ORIGIN}/*previous`), realDeck(storage));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/`);
  });

  it("the ajax flavor answers {redirect: url} (response.rb:42-46)", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(
      new Request(`${ORIGIN}/*previous`, {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          cookie: visitCookieWith([`${ORIGIN}/Front?view=edit`]),
        },
      }),
      realDeck(storage),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text())).toEqual({
      redirect: `${ORIGIN}/Front?view=edit`,
    });
  });
});
