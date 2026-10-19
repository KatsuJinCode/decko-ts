// The BARE ROOT arm's home mark (register-routes B9 + C6): mark.rb:42-44
// `home_mark` — `Card::Rule.global_setting(:home) || "Home"` — where
// global_setting (card-1.110.0/lib/card/rule.rb:5-9) is
// `Auth.as_bot { (card = Card[name]) && !card.db_content.strip.empty? &&
// card.db_content }`. The port hardcode-rendered "Home" (parsePath's sync
// contract); the resolution now happens in the request core per request
// (homeMarkContent, src/card/render/page.ts — the same globalSettingContent
// fetch the page head's title/favicon/ace/tiny_mce arms use).
//
// Ruby truth pinned here, through the REAL edge request core over an
// in-memory sqlite deck:
//   - an edited *home rule (content "Front") moves GET "/" to the Front
//     card's page — the html <title> names Front;
//   - a whitespace-only *home rule content falls back to "Home"
//     (rule.rb:5-9's strip check) — no Front page;
//   - the ?mark= query keeps precedence over the rule (Card.uri_fetch uses
//     params[:mark] first — parsePath's bare-arm rule, pinned at
//     /?mark=Front rendering Front even when the rule says otherwise).
//
// NOT pinned here (module-level pins elsewhere): staging's boot-level arm
// (tests/deploy/staging-home-mark-endpoint.test.ts boots the real server).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

function realDeck(storage: RenderTestStorage) {
  return {
    fetcher: storage.fetcher,
    render: storage.engine,
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  };
}

/** The page shell's minimal seed set (the read-rule parties, the codename
 *  cards the head reads, the layout) plus the two cards the scenarios
 *  need: the Front card the rule points at and the *home rule itself
 *  (codename "home"). */
async function seedHomeDeck(storage: RenderTestStorage, homeContent: string): Promise<void> {
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
  await seedCard(storage, { id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>` });
  await seedCard(storage, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>` });
  await seedCard(storage, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>` });
  await seedCard(storage, { id: 31001, name: "Front", typeId: 2, dbContent: "Front body prose" });
  await seedCard(storage, { id: 31002, name: "*home", codename: "home", typeId: 52, dbContent: homeContent });
  await storage.fetcher.codenames.ensureLoaded();
}

describe("bunny edge bare root arm — home mark from the *home rule (B9/C6)", () => {
  it("GET / renders the card the edited *home rule names, not hardcoded Home", async () => {
    const storage = await createRenderTestStorage();
    await seedHomeDeck(storage, "Front");
    const res = await handleEngineRequest(edgeGet("/"), realDeck(storage));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<title>Front - Test Site</title>");
    expect(body).toContain("Front body prose");
  });

  it("a whitespace-only *home content falls back to Home (rule.rb:5-9's strip check)", async () => {
    const storage = await createRenderTestStorage();
    await seedHomeDeck(storage, "   \n  ");
    const res = await handleEngineRequest(edgeGet("/"), realDeck(storage));
    const body = await res.text();
    // "Home" does not exist in this deck — the fallback's render is Home's
    // unknown-card page, which must NOT be the Front page the rule named.
    expect(body).not.toContain("Front body prose");
    expect(body).toContain("Home");
  });

  it("the ?mark= query keeps precedence over the rule (Card.uri_fetch's params[:mark])", async () => {
    const storage = await createRenderTestStorage();
    await seedHomeDeck(storage, "Front");
    // parsePath's bare arm reads ?mark= first; the rule must not override it.
    // A mark that decodes to a card the deck knows (Front itself) proves the
    // query wins where it can be observed at all (the rule ALSO says Front,
    // so instead point the query at the *title card: its page names *title).
    const res = await handleEngineRequest(edgeGet("/?mark=%2Atitle"), realDeck(storage));
    const body = await res.text();
    expect(body).toContain("*title");
  });
});
