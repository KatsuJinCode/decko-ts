// Pin for the Bunny edge's full-chrome error pages
// (deploy/bunny-worker-src/bunny-edge-error-page.ts, wired through
// bunny-edge-engine-request.ts's error surfaces).
//
// WHAT THIS PIN exists for (p2-error-shell lane, 2026-10-03 — named residual
// #2 of the edge-site-shell lane): the edge's 404/500 pages rendered the
// bare worker.ts layoutPage shell (measured at the deploy-lineage tip
// 12bd523: card 404 = 749 B, 0 <link>, 0 <script>, no <nav>, no footer;
// render 500 = 736 B) while the live deck serves Decko's full-chrome error
// pages. The staging host's error builder (vm-staging-server.mjs:1339-1549
// and its helper chain) is the Ruby-faithful ground truth this port pins:
//
//   - card not found  -> renderDeckoErrorPage(not_found): Default-Layout
//     chrome + the not_found slot (h1 "Not Found", "Could not find <Name>.
//     Please sign in or sign up to create it."), <meta noindex> in the head,
//     title "<Name> - <site title>" in URL display form, status stays 404
//     (format/error.rb page_status_for_unknown).
//   - render raise    -> renderDeckoErrorPage(server_error): the same chrome
//     + Decko's deck error block ("Wild Card! / 500 Server Error / Yuck,
//     sorry about that."), no noindex, stored-name title, status 500.
//   - budget timeout  -> the same chrome around the edge's own Slow-render
//     body region (no staging shape exists for an infra 503; the body text
//     and the Retry-After/X-Decko-Edge-Budget/no-store contract are the
//     cold-render lane's, preserved).
//   - no-route path   -> the staging ROUTER's minimal stub (vm-staging-server
//     .mjs:2203 serves a bare `<pre>No route for <path></pre>` for paths that
//     are not card names — a different route class from the full-chrome card
//     not_found; live's Rails router 404s the same class bare).
//   - builder failure -> the staging builder's own fallback contract
//     (vm-staging-server.mjs:1494-1497 "falls back to the previous minimal
//     stubs so the server's error path can never 500 a second time"): the
//     minimal htmlResponse stubs for not_found/server_error, and the bare
//     pre-lane Slow-render page for the 503.
//
// Every error response keeps `Cache-Control: no-store` (the escape pins'
// contract — error pages are never cacheable).
//
// The byte assertions below are derived from the STAGING BUILDER's code
// paths, seeded with the same minimal shell deck the other engine-request
// pins use (the deck's *header/*footer/Default Layout rows drive the chrome,
// so the pin covers the real substitution chain, not a snapshot).

import { describe, expect, it } from "vitest";

import { escapeHtml } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  EDGE_ERROR_PAGE_GRACE_MS,
  renderFullChromeErrorPage,
  type ErrorPageDeck,
} from "../../deploy/bunny-worker-src/bunny-edge-error-page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import type { RenderEngine } from "../../src/card/render.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

function realDeck(storage: RenderTestStorage) {
  return { fetcher: storage.fetcher, render: storage.engine };
}

function deckWhoseRenderThrows(storage: RenderTestStorage, error: unknown) {
  return {
    fetcher: storage.fetcher,
    render: {
      runWithPageConfig: async () => {
        throw error;
      },
    } as unknown as RenderEngine,
  };
}

function deckWithRenderDelay(storage: RenderTestStorage, ms: number) {
  return {
    fetcher: storage.fetcher,
    render: {
      runWithPageConfig: async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return `<p>Some+Card open</p>`;
      },
    } as unknown as RenderEngine,
  };
}

/** The minimal shell boot (same rows as
 *  tests/deploy/bunny-edge-engine-request-error-mapping.test.ts's
 *  seedShellHeadDeck — read-rule parties, the page-head codename cards,
 *  *all+*layout -> Default Layout, *header, *footer): the chrome builder
 *  resolves exactly these rows when it assembles an error page. */
async function seedShellHeadDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 8, name: "csvqdo", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "tkmbewlur", codename: "anonymous", typeId: 2 });
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
}

const SPACES = "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com";

describe("bunny edge — full-chrome not_found page (staging builder shape)", () => {
  it("GET a missing card serves Decko's not_found page in the Default-Layout chrome, status 404", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellHeadDeck(storage);
      const res = await handleEngineRequest(edgeGet("/NoSuchCard"), realDeck(storage));
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.text();
      // The indented live document form (vm-staging-server.mjs:1244-1246),
      // not the bare `<!doctype html>` layoutPage shell.
      expect(body.startsWith(`      <!DOCTYPE HTML>\n      <html class="h-100">\n        <head>\n`)).toBe(true);
      // URL display form name + the deck's *title (not_found pageOpts).
      expect(body).toContain(`<title>NoSuchCard - Test Site</title>`);
      // The noindex head line is the not_found shape's only head delta
      // (vm-staging-server.mjs:1508-1511).
      expect(body).toContain(`<meta content='noindex' name='robots'>`);
      // Live favicon + live CSS revision, baked by the chrome head.
      expect(body).toContain(`<link rel="shortcut icon" href="${SPACES}/files/103/3649-small.jpg" />`);
      expect(body).toContain(`files/45514/1790384218.css`);
      // The *header nest substituted verbatim into the layout body.
      expect(body).toContain(`<header><nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav></header>`);
      // The not_found slot (buildNotFoundSlotHtml): type constants pinned
      // from the live bytes (NOT_FOUND_DEFAULT_TYPE), the DeckoName key
      // ("NoSuchCard".key = "no_such_card" — this engine's key splits
      // camelCase words; staging imports the same DeckoName module) and the
      // URL-display link name (urlKey keeps case, underscores only for
      // spaces: "NoSuchCard"), per-request slot id, and the escaped outer
      // slot JSON.
      expect(body).toContain(`<div id="no_such_card-not_found-view" class="card-slot not_found-view ALL TYPE-basic_c" data-card-name="NoSuchCard" data-card-type-id="22281" data-card-type-name="BasicCs" data-card-link-name="NoSuchCard" data-slot-id="`);
      expect(body).toContain(`data-slot="{&quot;view&quot;:&quot;titled&quot;,&quot;nest_name&quot;:&quot;_main&quot;,&quot;nest_syntax&quot;:&quot;_main|titled&quot;,&quot;hide&quot;:[&quot;menu&quot;,&quot;help&quot;],&quot;main&quot;:true,&quot;home_view&quot;:&quot;titled&quot;,&quot;main_view&quot;:true,&quot;layout&quot;:&quot;Default Layout&quot;}">`);
      expect(body).toContain(`<span class="card-title" title="Not Found">Not Found</span>`);
      expect(body).toContain(`Could not find\n<em>\nNoSuchCard\n</em>`);
      expect(body).toContain(`href="/*signin/titled">sign in</a>`);
      expect(body).toContain(`href="/new/Sign_up">sign up</a>`);
      // The *footer nest: the Xfooter content-view wrapper + the version pin.
      expect(body).toContain(`<div id="Xfooter-content-view" class="card-slot content-view ALL TYPE-html STAR SELF-Xfooter d0-card-content"`);
      expect(body).toContain(`Decko v0.19.1</a>`);
      // The live trailing newline.
      expect(body.endsWith(`</html>\n`)).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a crafted <script> card name lands in the not_found page as escaped text only", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellHeadDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/Foo%3Cscript%3Ealert%281%29%3C%2Fscript%3E"),
        realDeck(storage),
      );
      expect(res.status).toBe(404);
      const body = await res.text();
      // The full-chrome head legitimately carries real <script src> tags, so
      // the no-markup assertion is payload-scoped (the layoutPage
      // title-escape pin's convention): the NAME's raw form is absent and
      // its escaped form present — in the title, the em, and the
      // data-card-name attribute.
      expect(body).not.toContain(`Foo<script`);
      expect(body).toContain(`Foo&lt;script&gt;alert(1)&lt;/script&gt;`);
      expect(body).toContain(`<title>Foo&lt;script&gt;alert(1)&lt;/script&gt; - Test Site</title>`);
      expect(body).toContain(`data-card-name="Foo&lt;script&gt;alert(1)&lt;/script&gt;"`);
    } finally {
      storage.close();
    }
  });

  it("a deck with no default layout falls back to the staging minimal not-found stub", async () => {
    const storage = await createRenderTestStorage();
    try {
      // Unseeded storage: resolveDefaultLayout finds no *all+*layout rule
      // body and throws — the staging builder's fallback contract serves the
      // minimal stub (vm-staging-server.mjs:1535-1541) instead of 500ing.
      const res = await handleEngineRequest(edgeGet("/Nope"), realDeck(storage));
      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.text();
      expect(body).toBe(
        `<!doctype html><html><head><meta charset="utf-8"><title>Card not found</title></head>` +
          `<body><h1>Card not found</h1><pre>card not found: Nope</pre>` +
          `<p><a href="/">Home</a> · <a href="/_status">status</a></p></body></html>`,
      );
    } finally {
      storage.close();
    }
  });
});

describe("bunny edge — full-chrome server_error page (staging builder shape)", () => {
  it("a render raise serves Decko's Wild Card deck error page in the Default-Layout chrome, status 500", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellHeadDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/Home"),
        deckWhoseRenderThrows(storage, new Error("engine exploded")),
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.text();
      expect(body.startsWith(`      <!DOCTYPE HTML>\n      <html class="h-100">\n        <head>\n`)).toBe(true);
      // Stored-name title (fetchByName resolves nothing here -> the slug),
      // and NO noindex line — that is the not_found shape's delta.
      expect(body).toContain(`<title>Home - Test Site</title>`);
      expect(body).not.toContain(`<meta content='noindex' name='robots'>`);
      // The deck error block, byte-verbatim from live_Introduction.html
      // (buildServerErrorSlotHtml). The error message itself appears
      // nowhere — the requested name only rides the <title>.
      expect(body).toContain(
        `<div class='border border-danger text-center p-3'>\n<h1>Wild Card!</h1>\n<h2 class='alert-danger'>500 Server Error</h2>\n<h4 class='p-3'>\nYuck, sorry about that.\n</h4>\n</div>\n`,
      );
      expect(body).not.toContain("engine exploded");
      expect(body).toContain(`<header><nav class="navbar navbar-expand-lg">`);
      expect(body).toContain(`Decko v0.19.1</a>`);
      expect(body.endsWith(`</html>\n`)).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a deck with no default layout falls back to the staging minimal render-error stub", async () => {
    const storage = await createRenderTestStorage();
    try {
      const res = await handleEngineRequest(
        edgeGet("/Home"),
        deckWhoseRenderThrows(storage, new Error("engine exploded")),
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.text();
      // The stub's message is the BUILDER's own failure (the staging host
      // catches inside renderDeckoErrorPage, vm-staging-server.mjs:1530-1547
      // — it never sees the original render error), escaped into the <pre>.
      expect(body).toBe(
        `<!doctype html><html><head><meta charset="utf-8"><title>Render error</title></head>` +
          `<body><h1>Render error</h1><pre>${escapeHtml(`default layout "Default Layout" has no body in the corpus; cannot build the error page chrome`)}</pre></body></html>`,
      );
    } finally {
      storage.close();
    }
  });
});

describe("bunny edge — no-route 404 (staging router stub class)", () => {
  it("a multi-segment path answers the staging router's minimal not-found stub", async () => {
    const storage = await createRenderTestStorage();
    try {
      // Staging routes only single-segment card names to the renderer; any
      // other path gets the router's own minimal stub (vm-staging-server
      // .mjs:2203), NOT the full-chrome card not_found page.
      await seedShellHeadDeck(storage);
      const res = await handleEngineRequest(edgeGet("/a/b/c"), realDeck(storage));
      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.text()).toBe(
        `<!doctype html><html><head><meta charset="utf-8"><title>Not found</title></head>` +
          `<body><h1>Not found</h1><pre>No route for /a/b/c</pre></body></html>`,
      );
    } finally {
      storage.close();
    }
  });

  it("the no-route stub carries only the percent-encoded pathname (no decoded markup)", async () => {
    const storage = await createRenderTestStorage();
    try {
      const res = await handleEngineRequest(edgeGet("/%3Cscript%3E/x/y"), realDeck(storage));
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).toContain(`No route for /%3Cscript%3E/x/y`);
      expect(body).not.toContain(`<script>`);
    } finally {
      storage.close();
    }
  });
});

describe("bunny edge — budget-exceeded 503 in the full chrome", () => {
  it("a render that overruns its budget answers the full-chrome page with the Slow-render body region", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellHeadDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/Some+Card"),
        deckWithRenderDelay(storage, 400),
        { budgetMs: 40 },
      );
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect(res.headers.get("X-Decko-Edge-Budget")).toBe("exceeded; budget_ms=40");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.text();
      // Full chrome around the edge's own body region (no staging shape
      // exists for an infra 503; the title keeps the bare page's exact
      // `<title>Slow render</title>` and the body text is unchanged).
      expect(body.startsWith(`      <!DOCTYPE HTML>\n      <html class="h-100">`)).toBe(true);
      expect(body).toContain(`<title>Slow render</title>`);
      expect(body).toContain(`retrying in a few seconds`);
      expect(body).toContain(`<header><nav class="navbar navbar-expand-lg">`);
      expect(body).toContain(`Decko v0.19.1</a>`);
      expect(body).not.toContain(`<meta content='noindex' name='robots'>`);
    } finally {
      storage.close();
    }
  });

  it("with no layout to build chrome from, the budget 503 falls back to the bare pre-lane page", async () => {
    const storage = await createRenderTestStorage();
    try {
      const res = await handleEngineRequest(
        edgeGet("/Some+Card"),
        deckWithRenderDelay(storage, 400),
        { budgetMs: 40 },
      );
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.text();
      // The pre-lane bytes (layoutPage shell) — the fallback contract.
      expect(body.startsWith(`<!doctype html>`)).toBe(true);
      expect(body).toContain(`<title>Slow render</title>`);
      expect(body).toContain(`retrying in a few seconds`);
    } finally {
      storage.close();
    }
  });

  it("the budget 503's chrome build is grace-bounded — a hung database still answers the bare page", async () => {
    // The deadline fired because the database is slow or dead; the error
    // page's own queries must not become a second unbounded wait. Direct
    // module seam with an injectable (short) grace: a driver whose queries
    // never settle, a chrome build that would hang forever, and a fallback
    // that must win at the grace.
    const hungDeck = {
      fetcher: {
        driver: {
          query: () => new Promise<{ rows: never[] }>(() => {}),
        },
      },
    } as unknown as ErrorPageDeck;
    const started = Date.now();
    const res = await renderFullChromeErrorPage(hungDeck, {
      status: 503,
      viewHtml: "<h1>Slow render</h1>",
      titleText: "Slow render",
      cardName: "",
      fallbackHtml: "<!doctype html><title>Slow render</title>",
      graceMs: 25,
    });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("<!doctype html><title>Slow render</title>");
    // The grace actually bounded the wait (25 ms grace, far under the test
    // timeout — and far under the 5 s production EDGE_ERROR_PAGE_GRACE_MS).
    expect(Date.now() - started).toBeLessThan(2_000);
    // The production default is bounded and exported — a hung DB waits at
    // most this long past the render budget, never forever.
    expect(EDGE_ERROR_PAGE_GRACE_MS).toBeGreaterThan(0);
    expect(EDGE_ERROR_PAGE_GRACE_MS).toBeLessThanOrEqual(10_000);
  });
});
