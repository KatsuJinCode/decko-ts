// Pins for the Bunny edge's FULL PAGE SHELL: the served-environment deltas
// of bunny-edge-page-shell.ts,
// the 200-page assembly through the REAL handler — renderPageBytes + deltas,
// the same call the entry makes — and the /files/<id>/<leaf> attachment
// route.
//
// THE DELTAS ARE DEPLOYMENT CONFIGURATION: they
// used to be module constants in the shipped edge code, so every deployment
// of the engine served one private deck's version string, asset revisions and
// SRI hashes. This suite pins BOTH halves of that change:
//
//   - UNCONFIGURED (the default): a stock 0.20.0 deck. No version rewrite,
//     no stylesheet-revision rewrite, no injected SRI — the engine's own
//     bytes pass through untouched apart from the trailing newline every
//     served HTML document carries. That is the regression guard: no deck's
//     private identity can leak into a deployment that configured nothing.
//   - CONFIGURED: a synthetic deck's deltas
//     (tests/deploy/fixtures/configured-deck-served-deltas.ts — the same shape a
//     deployment sets through the environment, per the runbook), which
//     apply exactly and reproduce a configured deployment's served bytes.
//
// The shell the configured deployment buys: favicon
// link, Material-Icons stylesheet, compiled site CSS at the configured
// Spaces CDN URL, five remote scripts WITH integrity hashes, the main decko
// script, decko.* script variables, the *header navbar, the *footer credit —
// every one absent from the bare layoutPage shell.
//
// The 200-pin's deck seeds the codename cards the page head reads
// (*title, *favicon) and the code-default layout nests (:header, :sidebar,
// :footer) — a deck missing a codename raises CodenameNotFoundError in the
// page path (Ruby's Card[:codename] returns nil there; the port's
// mark-parse raises — a rendering-engine concern, not a shell concern: a
// real deck carries the full codename set).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  applyServedEnvironmentDeltas,
  filesLeafVariant,
  filesNotFoundBody,
} from "../../deploy/bunny-worker-src/bunny-edge-page-shell.js";
import {
  EMPTY_SERVED_DELTAS,
  resolveServedEnvironmentDeltas,
  servedDeltasAreEmpty,
} from "../../deploy/bunny-worker-src/bunny-edge-served-deltas.js";
import {
  CONFIGURED_ASSET_HOST,
  CONFIGURED_CSS_REVISION_FROM,
  CONFIGURED_CSS_REVISION_TO,
  CONFIGURED_DECK_SERVED_DELTAS,
} from "./fixtures/configured-deck-served-deltas.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

describe("bunny edge page shell — UNCONFIGURED deltas (the default)", () => {
  // The regression guard for the empty-deltas default: with no configuration, NO deck's
  // private identity reaches the served bytes. Each case feeds the exact
  // fragment the configured half below rewrites and asserts it comes back
  // UNCHANGED.
  const FOG_CSS_FRAGMENT =
    `<link media="all" rel="stylesheet" type="text/css" ` +
    `href="http://s3.amazonaws.com//files/${CONFIGURED_CSS_REVISION_FROM}" />`;

  it("applies no version rewrite — the deck's own footer bytes stand", () => {
    expect(applyServedEnvironmentDeltas(`<a href="/:latest">Decko v</a>`).trimEnd()).toBe(
      `<a href="/:latest">Decko v</a>`,
    );
    // And the literal form another deck's credit may embed is likewise
    // left alone — no other deck's version string is stamped onto it.
    expect(
      applyServedEnvironmentDeltas(`<a href="http://decko.org">Decko v0.20.0</a>`).trimEnd(),
    ).toBe(`<a href="http://decko.org">Decko v0.20.0</a>`);
  });

  it("applies no asset-host rewrite and no stylesheet-revision rewrite", () => {
    expect(applyServedEnvironmentDeltas(FOG_CSS_FRAGMENT).trimEnd()).toBe(FOG_CSS_FRAGMENT);
    expect(applyServedEnvironmentDeltas(FOG_CSS_FRAGMENT)).not.toContain(CONFIGURED_ASSET_HOST);
    expect(applyServedEnvironmentDeltas(FOG_CSS_FRAGMENT)).not.toContain(CONFIGURED_CSS_REVISION_TO);
  });

  it("injects no SRI attributes", () => {
    const input =
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
    expect(applyServedEnvironmentDeltas(input).trimEnd()).toBe(input);
    expect(applyServedEnvironmentDeltas(input)).not.toContain("integrity=");
  });

  it("still ends the page with the trailing newline every served document carries", () => {
    // The one unconditional delta: a byte shape, not a deck's identity.
    expect(applyServedEnvironmentDeltas(`</html>`)).toBe(`</html>\n`);
    expect(applyServedEnvironmentDeltas(`</html>\n`)).toBe(`</html>\n`);
  });

  it("an empty env resolves to the empty delta set", () => {
    expect(servedDeltasAreEmpty(resolveServedEnvironmentDeltas({}))).toBe(true);
    expect(servedDeltasAreEmpty(resolveServedEnvironmentDeltas(undefined))).toBe(true);
    expect(servedDeltasAreEmpty(EMPTY_SERVED_DELTAS)).toBe(true);
  });
});

describe("bunny edge page shell — CONFIGURED deltas (the production deployment)", () => {
  // These pins feed FRAGMENTS; the trailing-newline delta still appends to
  // a fragment, so the fragment assertions trimEnd before comparing. The
  // full-page newline behavior has its own pin below.
  const DELTAS = CONFIGURED_DECK_SERVED_DELTAS;

  it("rewrites the capture fog attachment host to the configured asset host", () => {
    const input =
      `<link media="all" rel="stylesheet" type="text/css" ` +
      `href="http://s3.amazonaws.com//files/${CONFIGURED_CSS_REVISION_FROM}" />`;
    expect(applyServedEnvironmentDeltas(input, DELTAS).trimEnd()).toBe(
      `<link media="all" rel="stylesheet" type="text/css" ` +
        `href="${CONFIGURED_ASSET_HOST}/files/${CONFIGURED_CSS_REVISION_TO}" />`,
    );
  });

  it("rewrites the recorded stylesheet revision to the served revision (link + cssPath)", () => {
    const input =
      `decko.cssPath='http://s3.amazonaws.com//files/${CONFIGURED_CSS_REVISION_FROM}';`;
    expect(applyServedEnvironmentDeltas(input, DELTAS).trimEnd()).toBe(
      `decko.cssPath='${CONFIGURED_ASSET_HOST}/files/${CONFIGURED_CSS_REVISION_TO}';`,
    );
  });

  it("adds the configured CDN integrity hashes to the four remote scripts", () => {
    const input =
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
    expect(applyServedEnvironmentDeltas(input, DELTAS).trimEnd()).toBe(
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" ` +
        `integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>`,
    );
  });

  it("pins the footer version the production site prints", () => {
    expect(
      applyServedEnvironmentDeltas(`<a href="/:latest">Decko v</a>`, DELTAS).trimEnd(),
    ).toBe(`<a href="/:latest">Decko v0.0.0-synthetic</a>`);
  });

  it("pins the footer version through the literal form a *credit embeds", () => {
    // The deck's *credit content can carry the version literally where the
    // site prints the pinned version — the bare-form rewrite no-ops on this
    // shape, so the configured pin rewrites the literal form too.
    expect(
      applyServedEnvironmentDeltas(`<a href="http://decko.org">Decko v0.20.0</a>`, DELTAS).trimEnd(),
    ).toBe(`<a href="http://decko.org">Decko v0.0.0-synthetic</a>`);
  });

  it("a partially-configured deployment applies only what it configured", () => {
    // The deltas are per-field: setting one value must not drag in the rest.
    const onlyVersion = { footerVersionPin: "1.2.3" };
    const out = applyServedEnvironmentDeltas(
      `<a href="/:latest">Decko v</a><link href="http://s3.amazonaws.com//files/${CONFIGURED_CSS_REVISION_FROM}" />`,
      onlyVersion,
    );
    expect(out).toContain("Decko v1.2.3</a>");
    expect(out).toContain(CONFIGURED_CSS_REVISION_FROM);
    expect(out).not.toContain(CONFIGURED_ASSET_HOST);
  });
});

describe("bunny edge page shell — reading the deltas off the environment", () => {
  it("the JSON blob form resolves every field", () => {
    const deltas = resolveServedEnvironmentDeltas({
      DECKO_SERVED_DELTAS: JSON.stringify({
        assetHost: "https://cdn.example",
        footerVersionPin: "9.9.9",
        stylesheetRevisionFrom: "a/1.css",
        stylesheetRevisionTo: "b/2.css",
        notFoundTypeId: "7",
        notFoundTypeName: "Note",
        notFoundTypeClassToken: "note",
        allCardId: 11,
        layoutPointerId: 12,
        pointerTypeId: 13,
        phantomTypeId: 14,
        phantomTypeName: "Ghost",
        phantomTypeKey: "ghost",
      }),
    });
    expect(deltas.assetHost).toBe("https://cdn.example");
    expect(deltas.footerVersionPin).toBe("9.9.9");
    expect(deltas.stylesheetRevision).toEqual({ from: "a/1.css", to: "b/2.css" });
    expect(deltas.notFoundType).toEqual({ id: "7", name: "Note", classToken: "note" });
    expect(deltas.allCardId).toBe(11);
    expect(deltas.layoutPointerId).toBe(12);
    expect(deltas.pointerTypeId).toBe(13);
    expect(deltas.phantomType).toEqual({ typeId: 14, typeName: "Ghost", typeKey: "ghost" });
  });

  it("the NESTED blob spelling the runbook documents resolves the same fields", () => {
    // The runbook's example blob (section 3b) nests the three grouped
    // values; the flat keys are the loose-variable spelling. Both must
    // resolve, or an operator pasting the documented blob would silently get
    // stock bytes.
    const deltas = resolveServedEnvironmentDeltas({
      DECKO_SERVED_DELTAS: JSON.stringify({
        assetHost: "https://cdn.example",
        footerVersionPin: "9.9.9",
        stylesheetRevision: { from: "a/1.css", to: "b/2.css" },
        notFoundType: { id: "7", name: "Note", classToken: "note" },
        phantomType: { typeId: 14, typeName: "Ghost", typeKey: "ghost" },
      }),
    });
    expect(deltas.assetHost).toBe("https://cdn.example");
    expect(deltas.footerVersionPin).toBe("9.9.9");
    expect(deltas.stylesheetRevision).toEqual({ from: "a/1.css", to: "b/2.css" });
    expect(deltas.notFoundType).toEqual({ id: "7", name: "Note", classToken: "note" });
    expect(deltas.phantomType).toEqual({ typeId: 14, typeName: "Ghost", typeKey: "ghost" });
  });

  it("the production fixture round-trips through the environment blob unchanged", () => {
    // The fixture IS what the runbook tells the operator to paste, so the
    // blob parser and the fixture cannot disagree: every field the fixture
    // carries must come back out of a JSON.stringify/parse round trip.
    const deltas = resolveServedEnvironmentDeltas({
      DECKO_SERVED_DELTAS: JSON.stringify(CONFIGURED_DECK_SERVED_DELTAS),
    });
    expect(deltas).toEqual(CONFIGURED_DECK_SERVED_DELTAS);
  });

  it("the loose-variable form resolves the same fields", () => {
    const deltas = resolveServedEnvironmentDeltas({
      DECKO_SERVED_ASSET_HOST: "https://cdn.example",
      DECKO_SERVED_FOOTER_VERSION_PIN: "9.9.9",
      DECKO_SERVED_STYLESHEET_FROM: "a/1.css",
      DECKO_SERVED_STYLESHEET_TO: "b/2.css",
      DECKO_SERVED_NOT_FOUND_TYPE_ID: "7",
      DECKO_SERVED_NOT_FOUND_TYPE_NAME: "Note",
      DECKO_SERVED_NOT_FOUND_TYPE_CLASS_TOKEN: "note",
      DECKO_SERVED_ALL_CARD_ID: "11",
      DECKO_SERVED_LAYOUT_POINTER_ID: "12",
      DECKO_SERVED_POINTER_TYPE_ID: "13",
      DECKO_SERVED_PHANTOM_TYPE_ID: "14",
      DECKO_SERVED_PHANTOM_TYPE_NAME: "Ghost",
      DECKO_SERVED_PHANTOM_TYPE_KEY: "ghost",
    });
    expect(deltas.assetHost).toBe("https://cdn.example");
    expect(deltas.footerVersionPin).toBe("9.9.9");
    expect(deltas.stylesheetRevision).toEqual({ from: "a/1.css", to: "b/2.css" });
    expect(deltas.notFoundType).toEqual({ id: "7", name: "Note", classToken: "note" });
    expect(deltas.phantomType).toEqual({ typeId: 14, typeName: "Ghost", typeKey: "ghost" });
  });

  it("both forms together: the blob wins field-by-field, loose variables fill the rest", () => {
    const deltas = resolveServedEnvironmentDeltas({
      DECKO_SERVED_DELTAS: JSON.stringify({ footerVersionPin: "from-blob" }),
      DECKO_SERVED_FOOTER_VERSION_PIN: "from-loose",
      DECKO_SERVED_ROOT_URL: "https://deck.example/",
    });
    expect(deltas.footerVersionPin).toBe("from-blob");
    expect(deltas.rootUrl).toBe("https://deck.example/");
  });

  it("a malformed blob contributes nothing rather than throwing", () => {
    // A deployment with an unparseable config must still serve its pages —
    // and serving them with NO private identity is the safe reading.
    const deltas = resolveServedEnvironmentDeltas({ DECKO_SERVED_DELTAS: "{not json" });
    expect(servedDeltasAreEmpty(deltas)).toBe(true);
  });

  it("a half-set identity group is ignored, not half-applied", () => {
    const deltas = resolveServedEnvironmentDeltas({
      DECKO_SERVED_NOT_FOUND_TYPE_ID: "7",
      DECKO_SERVED_NOT_FOUND_TYPE_NAME: "Note",
      // class token missing
    });
    expect(deltas.notFoundType).toBeUndefined();
  });
});

describe("bunny edge page shell — the /files/ helpers", () => {
  it("derives the carrierwave size variant from a /files/ request leaf", () => {
    expect(filesLeafVariant("3649-small.jpg")).toBe("small");
    expect(filesLeafVariant("13244-large.jpg")).toBe("large");
    expect(filesLeafVariant("60560-medium.jpg")).toBe("medium");
    expect(filesLeafVariant("19336-original.png")).toBe("original");
    expect(filesLeafVariant("3649.jpg")).toBeUndefined();
  });

  it("builds the app's text/plain files-404 body", () => {
    expect(filesNotFoundBody("103")).toBe("Could not find 103.");
  });
});

/** The minimal full-shell deck: the codename cards the page head reads,
 *  the CARD LAYOUT a real deck resolves (the *all+*layout rule ->
 *  "Default Layout", whose body nests {{:header|core}} / {{_main|titled}} /
 *  {{:footer|content}}), plus a readable Home card. The card-layout path is
 *  the path a real deck takes; the engine's code-default fallback never
 *  warms its codename nests (page.ts warmUpLayoutNests runs for card
 *  layouts only), so the pin seeds the real shape, not the fallback. */
async function seedShellDeck(storage: RenderTestStorage): Promise<void> {
  // The read-rule party math (AnyoneID=8, AnonymousID=15) — the same
  // minimal anonymous boot the error-mapping pin uses.
  await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
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
  // reference shape (the layout body's main chunk is {{_main|titled}}).
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
  it("renders the full shell for a CONFIGURED deployment: asset host, SRI, navbar, footer pin, newline", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedShellDeck(storage);
      const res = await handleEngineRequest(edgeGet("/Home"), {
        fetcher: storage.fetcher,
        render: storage.engine,
        servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
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
      // variant, at the CONFIGURED asset host — cloudAttachmentUrl(small) +
      // the configured asset-host delta in one assertion.
      expect(body).toContain(
        `<link rel="shortcut icon" href="${CONFIGURED_ASSET_HOST}/files/103/3649-small.jpg" />`,
      );
      // The main decko javascript comment and a remote script with the
      // configured integrity attribute.
      expect(body).toContain(`<!-- MAIN DECKO JAVASCRIPT -->`);
      expect(body).toContain(
        `integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="`,
      );
      // The *header navbar and *footer content render inside the layout.
      expect(body).toContain(`<nav class="navbar navbar-expand-lg">`);
      // Footer version pin: the deployment configured the version its site
      // prints, and the deck's bare form is compensated to it.
      expect(body).toContain(`>Decko v0.0.0-synthetic</a>`);
      expect(body).not.toContain(`>Decko v</a>`);
      // The main card's content.
      expect(body).toContain("hello");
      // The trailing newline every served document carries.
      expect(body.endsWith("</html>\n")).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("renders a stock deck with NO private identity when nothing is configured", async () => {
    // The same deck, the same render, and NO deltas. Nothing that belongs to
    // another deck may appear: not the asset host, not the served CSS
    // revision, not an SRI hash, and not the pinned footer version — the
    // deck's own stored credit bytes stand.
    const storage = await createRenderTestStorage();
    try {
      await seedShellDeck(storage);
      const res = await handleEngineRequest(edgeGet("/Home"), {
        fetcher: storage.fetcher,
        render: storage.engine,
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      // The engine's own full page shell is still assembled — what is
      // absent is ANOTHER DECK'S identity.
      expect(body).toContain(`<html class="h-100">`);
      expect(body).toContain(`<title>Home - Test Site</title>`);
      expect(body).toContain(`<nav class="navbar navbar-expand-lg">`);
      expect(body).toContain("hello");
      expect(body.endsWith("</html>\n")).toBe(true);
      // No asset host from any other deck, in any of its forms.
      expect(body).not.toContain(CONFIGURED_ASSET_HOST);
      expect(body).not.toContain("production-storage");
      // No SRI injection.
      expect(body).not.toContain("integrity=");
      // No version rewrite: the deck's own footer bytes stand as seeded.
      expect(body).toContain(`>Decko v</a>`);
      expect(body).not.toContain(`>Decko v0.0.0-synthetic</a>`);
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
  it("302s /files/<id>/<leaf> to the CONFIGURED asset host with the requested variant", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, {
        id: 2175,
        name: "Sample Card 128 photo",
        typeId: 19,
        dbContent: "(my_bucket)/2175/13244.jpg",
      });
      const res = await handleEngineRequest(edgeGet("/files/2175/13244-large.jpg"), {
        fetcher: storage.fetcher,
        render: storage.engine,
        servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        `${CONFIGURED_ASSET_HOST}/files/2175/13244-large.jpg`,
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
