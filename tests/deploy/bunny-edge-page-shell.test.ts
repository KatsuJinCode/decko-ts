// Pins for the Bunny edge's FULL PAGE SHELL (edge-site-shell lane,
// 2026-10-02): the served-environment deltas of bunny-edge-page-shell.ts
// (constants byte-verbatim from vm-staging-server.mjs:1586-1626, the
// staging host's r18 recipe), the 200-page assembly through the REAL
// handler — renderPageBytes + deltas, the same call the entry makes — and
// the /files/<id>/<leaf> attachment route.
//
// The shell this buys, measured against the live site 2026-10-02
// (example.com/Home, browser-UA fetch, 22,975 bytes): favicon link,
// Material-Icons stylesheet, compiled site CSS at the live Spaces CDN URL,
// five remote scripts WITH integrity hashes, the main decko script,
// decko.* script variables, the *header navbar, the *footer credit — every
// one absent from the pre-lane edge (0 <link> / 0 <script> tags, no
// <nav>/<footer>).
//
// The 200-pin's deck seeds the codename cards the page head reads
// (*title, *favicon) and the code-default layout nests (:header, :sidebar,
// :footer) — a deck missing a codename raises CodenameNotFoundError in the
// page path (Ruby's Card[:codename] returns nil there; the port's
// mark-parse raises — an engine-lane residual, not a shell concern: the
// trial deck carries the full corpus codename set, measured via the live
// edge's /api/card/*title).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  SPACES_ASSET_HOST,
  applyServedEnvironmentDeltas,
  filesLeafVariant,
  filesNotFoundBody,
} from "../../deploy/bunny-worker-src/bunny-edge-page-shell.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

describe("bunny edge page shell — served-environment deltas", () => {
  // These pins feed FRAGMENTS; delta 5 (the page-level trailing newline)
  // still appends to a fragment, so the fragment assertions trimEnd before
  // comparing. The full-page newline behavior has its own pin below.
  it("rewrites the capture fog attachment host to the live Spaces CDN host", () => {
    const input =
      `<link media="all" rel="stylesheet" type="text/css" ` +
      `href="http://s3.amazonaws.com//files/45514/1786554352.css" />`;
    expect(applyServedEnvironmentDeltas(input).trimEnd()).toBe(
      `<link media="all" rel="stylesheet" type="text/css" ` +
        `href="${SPACES_ASSET_HOST}/files/45514/1790384218.css" />`,
    );
  });

  it("rewrites the corpus stylesheet revision to the live-served revision (link + cssPath)", () => {
    const input =
      `decko.cssPath='http://s3.amazonaws.com//files/45514/1786554352.css';`;
    expect(applyServedEnvironmentDeltas(input).trimEnd()).toBe(
      `decko.cssPath='${SPACES_ASSET_HOST}/files/45514/1790384218.css';`,
    );
  });

  it("adds the live CDN integrity hashes to the four remote scripts", () => {
    const input =
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
    expect(applyServedEnvironmentDeltas(input).trimEnd()).toBe(
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" ` +
        `integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>`,
    );
  });

  it("pins the footer version the live site prints (the corpus *version row is empty)", () => {
    expect(
      applyServedEnvironmentDeltas(`<a href="/:latest">Decko v</a>`).trimEnd(),
    ).toBe(`<a href="/:latest">Decko v0.19.1</a>`);
  });

  it("pins the footer version through the literal form the trial deck's *credit embeds", () => {
    // Live proof on release 1126050: the edge printed "Decko v0.20.0" (the
    // trial deck's *credit content carries the version literally) where the
    // live site prints 0.19.1 — the staging host's bare-form rewrite no-ops
    // on this shape.
    expect(
      applyServedEnvironmentDeltas(`<a href="http://decko.org">Decko v0.20.0</a>`).trimEnd(),
    ).toBe(`<a href="http://decko.org">Decko v0.19.1</a>`);
  });

  it("ends the page with the live trailing newline", () => {
    expect(applyServedEnvironmentDeltas(`</html>`)).toBe(`</html>\n`);
    expect(applyServedEnvironmentDeltas(`</html>\n`)).toBe(`</html>\n`);
  });

  it("derives the carrierwave size variant from a /files/ request leaf", () => {
    expect(filesLeafVariant("3649-small.jpg")).toBe("small");
    expect(filesLeafVariant("13244-large.jpg")).toBe("large");
    expect(filesLeafVariant("60560-medium.jpg")).toBe("medium");
    expect(filesLeafVariant("19336-original.png")).toBe("original");
    expect(filesLeafVariant("3649.jpg")).toBeUndefined();
  });

  it("builds the live app's text/plain files-404 body", () => {
    expect(filesNotFoundBody("103")).toBe("Could not find 103.");
  });
});

/** The minimal full-shell deck: the codename cards the page head reads,
 *  the CARD LAYOUT the real deck resolves (the corpus *all+*layout rule ->
 *  "Default Layout", whose body nests {{:header|core}} / {{_main|titled}} /
 *  {{:footer|content}} — the same shape the live edge's /api/card/Default
 *  Layout carries), plus a readable Home card. The card-layout path is the
 *  one the trial deck takes (measured: Default Layout id 22747 exists on
 *  the edge); the engine's code-default fallback never warms its codename
 *  nests (page.ts warmUpLayoutNests runs for card layouts only), so the
 *  pin seeds the real shape, not the fallback. */
async function seedShellDeck(storage: RenderTestStorage): Promise<void> {
  // The read-rule party math (AnyoneID=8, AnonymousID=15) — the same
  // minimal anonymous boot the error-mapping pin uses.
  await seedCard(storage, { id: 8, name: "csvqdo", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "tkmbewlur", codename: "anonymous", typeId: 2 });
  // The page head's global settings (page.ts headReadSet -> Card[:codename]).
  await seedCard(storage, { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
  await seedCard(storage, {
    id: 103,
    name: "*favicon",
    codename: "favicon",
    typeId: 19,
    dbContent: "(my_bucket)/103/3649.jpg",
  });
  // scriptCallsTag reads :ace and :tiny_mce (page.ts scriptCallsTag) — the
  // same codename-mark fetch class as title/favicon.
  await seedCard(storage, { id: 400, name: "*ace", codename: "ace", typeId: 52, dbContent: "{}" });
  await seedCard(storage, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 52, dbContent: "{}" });
  // The Html cardtype codename (resolvePageLayout's typeCode check reads
  // codenames.nameForId(layoutCard.typeId)) and the Basic cardtype the
  // Home card's set patterns name.
  await seedCard(storage, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
  // The *all and *layout setting cards the layout-rule junction resolves
  // through (left_id/right_id — junction fetch never reads the row's own
  // key column), then the rule row itself.
  await seedCard(storage, { id: 600, name: "*all", codename: "all", typeId: 52 });
  await seedCard(storage, { id: 601, name: "*layout", codename: "layout", typeId: 52 });
  // The deck's layout rule and the Default Layout card it names — the
  // corpus shape (the layout body's main chunk is {{_main|titled}}).
  await seedCard(storage, {
    id: 22746,
    name: "*all+*layout",
    leftId: 600,
    rightId: 601,
    typeId: 52,
    dbContent: "Default Layout",
  });
  await seedCard(storage, {
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
  await seedCard(storage, {
    id: 22748,
    name: "*header",
    codename: "header",
    typeId: 50,
    dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>`,
  });
  await seedCard(storage, {
    id: 22749,
    name: "*footer",
    codename: "footer",
    typeId: 50,
    dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>`,
  });
  await seedCard(storage, { id: 100, name: "Home", typeId: 2, dbContent: "hello" });
}

describe("bunny edge page shell — the 200-page assembly through the real handler", () => {
  it("renders the full shell: live favicon URL, integrity hash, navbar, footer pin, newline", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellDeck(storage);
      const res = await handleEngineRequest(edgeGet("/Home"), {
        fetcher: storage.fetcher,
        render: storage.engine,
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      // The decko html_page wrapper form, not the bare layoutPage shell.
      expect(body).toContain("<!DOCTYPE HTML>");
      expect(body).toContain(`<html class="h-100">`);
      expect(body).not.toContain(`ui-sans-serif`); // the old inline PAGE_STYLE is gone
      // Page title from *title ("Home - Test Site" — page_title_tag).
      expect(body).toContain(`<title>Home - Test Site</title>`);
      // The favicon link with the DERIVED action-id filename and the SMALL
      // variant, at the LIVE Spaces host — cloudAttachmentUrl(small) +
      // delta 1 in one assertion.
      expect(body).toContain(
        `<link rel="shortcut icon" href="${SPACES_ASSET_HOST}/files/103/3649-small.jpg" />`,
      );
      // The main decko javascript comment and a remote script with its live
      // integrity attribute (delta 3).
      expect(body).toContain(`<!-- MAIN DECKO JAVASCRIPT -->`);
      expect(body).toContain(
        `integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="`,
      );
      // The *header navbar and *footer content render inside the layout.
      expect(body).toContain(`<nav class="navbar navbar-expand-lg">`);
      // Footer version pin (delta 4): the corpus-empty *version row is
      // compensated to the byte the live site prints.
      expect(body).toContain(`>Decko v0.19.1</a>`);
      expect(body).not.toContain(`>Decko v</a>`);
      // The main card's content.
      expect(body).toContain("hello");
      // The live trailing newline (delta 5).
      expect(body.endsWith("</html>\n")).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("does not serve the old bare shell on 200 pages", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellDeck(storage);
      const res = await handleEngineRequest(edgeGet("/Home"), {
        fetcher: storage.fetcher,
        render: storage.engine,
      });
      const body = await res.text();
      expect(body).not.toContain(`<div class="nav"><a href="/">Home</a>`);
      expect(body).not.toContain(`Home (open)`);
    } finally {
      storage.close();
    }
  });
});

describe("bunny edge page shell — the /files attachment route", () => {
  it("302s /files/<id>/<leaf> to the derived CDN URL with the requested variant", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, {
        id: 2175,
        name: "Aikido photo",
        typeId: 19,
        dbContent: "(my_bucket)/2175/13244.jpg",
      });
      const res = await handleEngineRequest(edgeGet("/files/2175/13244-large.jpg"), {
        fetcher: storage.fetcher,
        render: storage.engine,
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        `${SPACES_ASSET_HOST}/files/2175/13244-large.jpg`,
      );
    } finally {
      storage.close();
    }
  });

  it("404s text/plain like the live app for an id that does not resolve", async () => {
    const storage = await createRenderTestStorage();
    try {
      const res = await handleEngineRequest(edgeGet("/files/999999/nope.jpg"), {
        fetcher: storage.fetcher,
        render: storage.engine,
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("Could not find 999999.");
    } finally {
      storage.close();
    }
  });

  it("404s for a card whose content is not an attachment source", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 101, name: "Plain", typeId: 2, dbContent: "just text" });
      const res = await handleEngineRequest(edgeGet("/files/101/whatever.jpg"), {
        fetcher: storage.fetcher,
        render: storage.engine,
      });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Could not find 101.");
    } finally {
      storage.close();
    }
  });
});
