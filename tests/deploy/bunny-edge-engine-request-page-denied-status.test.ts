// The page path's HTTP status for a read-denied main card. Ruby answers 403
// (card format/error.rb:27-31 view_for_denial: `root.error_status = 403 if
// focal? && voo.root?`; Card::Error::PermissionDenied status_code 403,
// error.rb:103-105) with the denial page as the body. The edge answered 200
// with the same body. Pinned on both render paths: the normal render
// (renderPageWithStatus on the deck's engine) and the request-local live
// render (anonymous GET of a bare page path). The deck is the page-shell
// seed set (bunny-edge-engine-history-page-seam.test.ts) plus a *self read
// rule naming a role Anonymous is not in.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

function realDeck(storage: RenderTestStorage) {
  return { fetcher: storage.fetcher, render: storage.engine };
}

async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 });
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*anon", codename: "anonymous", typeId: 14 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");

  // The governed cards. Secret Thing's own *self read rule names Role A,
  // which Anonymous is not in; read_rule_id is the data side Ruby sets on save.
  await seedCard(s, { id: 70, name: "Role A", typeId: 2 });
  await seedCard(s, { id: 72, name: "Secret Thing", typeId: 2, dbContent: "secret body", readRuleId: 74, readRuleClass: "*self" });
  await seedCard(s, { id: 73, name: "Secret Thing+*self", leftId: 72, rightId: 11, typeId: 14 });
  await seedCard(s, { id: 74, name: "Secret Thing+*self+*read", leftId: 73, rightId: 16, typeId: 14, dbContent: "[[Role A]]" });
  await seedReference(s, 74, 70, "role_a");
  await seedCard(s, { id: 75, name: "Readable Thing", typeId: 2, dbContent: "readable body", readRuleId: 17, readRuleClass: "*all" });

  // The page shell: global settings, the layout rule and Default Layout,
  // the header and footer the layout nests.
  // Every card below is a SETTING in Ruby, and a rule can only hang off a
  // setting (Card::Rule::All#standard_rule?, rule/all.rb:31-34), so they all
  // carry SettingID - the type the rule cache's SQL filters on
  // (`settings.type_id = #{SettingID}`, lib/card/rule/cache.rb:18). *layout
  // in particular is a setting: mod/layout/set/all/process_layout.rb:34 reads
  // it with `card.rule_card(:layout)`, and card/mod/core/data/transform/
  // 20180905061537_migrate_layouts.rb:5 searches rules `referred_to_by:
  // { right: :layout }`.
  await seedCard(s, { id: 55, name: "*title", codename: "title", typeId: 14, dbContent: "Test Site" });
  await seedCard(s, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await seedCard(s, { id: 400, name: "*ace", codename: "ace", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(s, { id: 600, name: "*layout", codename: "layout", typeId: 14 });
  await seedCard(s, { id: 22746, name: "*all+*layout", leftId: 10, rightId: 600, typeId: 14, dbContent: "Default Layout" });
  await seedCard(s, {
    id: 22747,
    name: "Default Layout",
    typeId: 50,
    dbContent:
      `<body class="d-flex flex-column h-100">\n` +
      `  <header>{{:header|core}}</header>\n` +
      `  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n` +
      `  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n` +
      `</body>`,
  });
  await seedCard(s, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav class="navbar"><a href="/">Site</a></nav>` });
  await seedCard(s, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer><a href="/:latest">Decko v</a></footer>` });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

async function get(pathname: string, options: { anonymous?: boolean }): Promise<{ status: number; body: string }> {
  const storage = await createRenderTestStorage();
  try {
    await seedDeck(storage);
    const res = await handleEngineRequest(edgeGet(pathname), realDeck(storage), options);
    return { status: res.status, body: await res.text() };
  } finally {
    storage.close();
  }
}

const PATHS = [
  ["normal render", {}],
  ["live render", { anonymous: true }],
] as const;

describe("bunny edge page status for a read-denied main card", () => {
  for (const [label, options] of PATHS) {
    it(`${label}: a read-denied card answers 403 with the denial page and no content`, async () => {
      const { status, body } = await get("/Secret_Thing", options);
      expect(body).toContain("<h1>Sorry!</h1>");
      expect(body).toContain("secret_thing-denial-view");
      expect(body).not.toContain("secret body");
      expect(status).toBe(403);
    });

    it(`${label}: a readable card still answers 200 (non-regression)`, async () => {
      const { status, body } = await get("/Readable_Thing", options);
      expect(body).toContain("readable body");
      expect(body).not.toContain("<h1>Sorry!</h1>");
      expect(status).toBe(200);
    });
  }

  it("a read-denied card's view path (/:card/:view) answers 403 too", async () => {
    const { status, body } = await get("/Secret_Thing/titled", { anonymous: true });
    expect(body).not.toContain("secret body");
    expect(status).toBe(403);
  });
});
