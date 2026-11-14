// Pin for layoutPage's <title> HTML escaping (worker.ts, the root Workers
// entry's layout shell, shared with the Bunny edge engine): the page title
// rides the parsed card name on 200-pages (`${parsed.name} (${parsed.view})`),
// and parsePath decodes the URL path, so a crafted name must land in
// <title> as text, not markup.
//
// What this file pins shut: an older layoutPage pasted `${title}` into the
// page without escaping, and the title text includes the decoded card name
// taken from the URL path — so a request whose path carries a
// percent-encoded name with markup in it produced a 200-page whose <head>
// executed that markup. Both edges that share this shell had the same hole:
// the root worker's render path in worker.ts, and the edge engine's render
// branch (handleEngineRequest in
// deploy/bunny-worker-src/bunny-edge-engine-request.ts). The escape now
// happens once, inside layoutPage itself, using the CF worker's own
// escapeHtml (deploy/worker.ts:310-316), so every caller of the shell is
// covered.
//
// The body parameter is HTML-by-contract (call sites pass markup like
// `<h1>Not found</h1>`), so its dynamic interpolations are escaped at their
// own call sites (see
// tests/deploy/bunny-edge-engine-request-error-page-escape.test.ts). This
// file pins the title seam only; its integration case scopes the "no raw
// markup" assertion to the page head so the pin stays on the layout shell
// regardless of what the render engine emits into the body.
//
// FALSIFICATION: with the escapeHtml call in layoutPage flipped off (raw
// `${title}` restored), every test in this file fails on its "no raw
// markup" assertion; restored, they pass.

import { describe, expect, it } from "vitest";

import { layoutPage } from "../../worker.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const CRAFTED_NAME = 'Evil<script>alert(1)</script> "quoted"';
const CRAFTED_TITLE_ESCAPED =
  "Evil&lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot;";

describe("layoutPage <title> HTML escaping", () => {
  it("escapes a crafted title at the emitter and leaves the body untouched", () => {
    const page = layoutPage(CRAFTED_NAME, "<p>body</p>");
    // The payload lands as TEXT in the title element.
    expect(page).toContain(`<title>${CRAFTED_TITLE_ESCAPED}</title>`);
    // No live markup anywhere in the shell output.
    expect(page).not.toContain("<script");
    expect(page).not.toContain('alert(1)</script>');
    // The body is passed through unescaped (HTML-by-contract).
    expect(page).toContain("<p>body</p>");
  });

  it("renders a percent-encoded crafted-name URL's 200-page with an escaped title through the real engine", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The edge's 200-page is not layoutPage's output: it is the engine's
      // show_with_page_layout assembly (renderPageBytes), whose <title>
      // comes from page_title_tag — safe_name joined with the *title card,
      // escaped by head-views.ts h(). This second test re-anchors the same
      // escape property (a crafted URL-path name reaches <title> as text)
      // to those bytes; layoutPage stays the error-page shell and keeps the
      // unit pin in the first test. The seeds below are the codename cards
      // the page head reads, the same minimal shell boot
      // tests/deploy/bunny-edge-page-shell.test.ts pins.
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
      await seedCard(storage, {
        id: 200,
        name: CRAFTED_NAME,
        typeId: 2,
        dbContent: "hello",
      });
      // The crafted name arrives percent-encoded in the URL path, exactly
      // as a live request would carry it; parsePath decodes it, the real
      // engine resolves the seeded card, and the 200-page title is built
      // from the decoded name.
      const res = await handleEngineRequest(
        new Request(
          `https://script-placeholder.bunny.run/${encodeURIComponent(CRAFTED_NAME)}`,
        ),
        { fetcher: storage.fetcher, render: storage.engine },
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      // The crafted card really rendered — the name truly reached the title.
      expect(body).toContain("hello");
      // The <title> carries the ESCAPED name plus the *title setting
      // (page_title_tag's " - " join). The payload lands as text, not
      // markup.
      expect(body).toContain(`<title>${CRAFTED_TITLE_ESCAPED} - Test Site</title>`);
      // The page head carries no live markup FROM THE NAME. (The full-shell
      // head legitimately carries real script tags — remote src forms and
      // the CDATA variables script — so neither "<script" nor "<script>" is
      // payload-scoped; the crafted NAME's raw form is what must be absent,
      // and its escaped form present.)
      const head = body.slice(0, body.indexOf("</head>"));
      expect(head).not.toContain("Evil<script>");
      expect(head).toContain("Evil&lt;script&gt;");
    } finally {
      storage.close();
    }
  });
});
