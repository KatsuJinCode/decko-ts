// Pin for the Bunny edge engine request core's HTML error pages: the
// render-error message interpolated into the error page must go through
// escapeHtml.
//
// The vuln this pins shut: the request core's catch
// (deploy/bunny-worker-src/bunny-edge-engine-request.ts
// handleEngineRequest) interpolated the raw error message into
// `<pre>${message}</pre>` — and the message embeds the requested card name
// (real throw site src/card/render.ts:706-708, "card not found:
// ${cardName}"; unsupported-view shape src/card/render.ts:18), which
// parsePath decoded out of the URL path — so a crafted URL path like
// /Foo%3Cscript%3Ealert(1)%3C%2Fscript%3E injects live markup into the
// 404/422/500 page. This is the extracted-core copy of the same hole
// closed in the pre-split entry
// (tests/deploy/bunny-edge-engine-error-page-escape.test.ts); the escape
// convention mirrors the CF worker's errorPage -> escapeHtml
// (deploy/worker.ts:310-316, 321-322).
//
// The `<h1>` half of the fix wraps the mapper's title variable, whose
// values are the three static classifications ("Card not found" /
// "Unsupported view" / "Render error") — byte-parity with the CF worker's
// errorPage, defense against a future dynamic title. The falsifiable
// payload is the message half, asserted below.
//
// Driven through the REAL handler: the 404 case
// runs the production RenderEngine + FetchEngine over the in-memory sqlite
// deck, so the pin covers the real throw site through the catch to the
// response. The 422/500 cases stub only the engine's throw because the
// mapping input is the message and the real triggers are engine-internal.
//
// FALSIFICATION: with the escapeHtml calls flipped off (raw
// `${title}`/`${message}` interpolation restored), every test in this file
// fails on its "no raw markup" assertion; restored, they pass.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";
import type { RenderEngine } from "../../src/card/render.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

/** The request core's deck shape: real engines over the in-memory sqlite
 *  deck. */
function realDeck(storage: RenderTestStorage) {
  return {
    fetcher: storage.fetcher,
    render: storage.engine,
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  };
}

/** A deck whose page entry throws the given error; used where the thing
 *  under test is the escaping of a MESSAGE, not the engine. The 200-path's
 *  render entry is renderPageBytes, whose first statement wraps the page
 *  assembly in engine.runWithPageConfig — so the stub throws there and the
 *  message reaches the same escaping catch unchanged. */
function deckWhoseRenderThrows(storage: RenderTestStorage, error: unknown) {
  return {
    fetcher: storage.fetcher,
    render: {
      runWithPageConfig: async () => {
        throw error;
      },
    } as unknown as RenderEngine,
    // The escape pins below assert the BUILDER's own failure message (the
    // default layout has no body in this unseeded storage), which the
    // builder reaches only when it has the deck's layout-rule anchors to
    // look the layout up with — so this deck carries the production
    // deployment's configuration, exactly as its runbook does.
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  };
}

describe("bunny edge engine request core — error page HTML escaping", () => {
  it("renders a percent-encoded crafted <script> card name as escaped text in the real engine's 404 page", async () => {
    const storage = await createRenderTestStorage();
    try {
      // <script> arrives percent-encoded in the URL path, exactly as a live
      // request would carry it; parsePath decodes it before render, the real
      // engine throws "card not found: <decoded name>", the catch maps 404.
      const res = await handleEngineRequest(
        edgeGet("/Foo%3Cscript%3Ealert%281%29%3C%2Fscript%3E"),
        realDeck(storage),
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const body = await res.text();
      // The payload lands as TEXT, not markup. This storage seeds no
      // default layout, so the 404 is the builder's minimal not-found stub;
      // the chrome's crafted-name escape is pinned in
      // tests/deploy/bunny-edge-error-page.test.ts.
      expect(body).toContain(
        "card not found: Foo&lt;script&gt;alert(1)&lt;/script&gt;",
      );
      expect(body).not.toContain("<script");
      // The error page shell is intact around the escaped payload; the
      // stub's title is the staging fallback's own ("Card not found").
      expect(body).toContain("<h1>Card not found</h1>");
      expect(body).toContain("<title>Card not found</title>");
    } finally {
      storage.close();
    }
  });

  it("escapes the unsupported-view 422 message the same way", async () => {
    const storage = await createRenderTestStorage();
    try {
      // Real engine error shape (src/card/render/format.ts:72):
      // `view (${view}) not supported for ${cardName}` — the crafted card
      // name rides in the message body. "naked" is a SUPPORTED_VIEWS member,
      // so parsePath reaches render.
      const deck = deckWhoseRenderThrows(
        storage,
        new Error("view (naked) not supported for Foo<script>alert(1)</script>"),
      );
      const res = await handleEngineRequest(edgeGet("/Foo%3Cscript%3E/naked"), deck);
      expect(res.status).toBe(422);
      const body = await res.text();
      expect(body).toContain("&lt;script&gt;");
      expect(body).not.toContain("<script");
      expect(body).toContain("<h1>Unsupported view</h1>");
    } finally {
      storage.close();
    }
  });

  it("escapes a generic render-failure 500 message the same way (quotes too)", async () => {
    const storage = await createRenderTestStorage();
    try {
      const deck = deckWhoseRenderThrows(
        storage,
        new Error('boom <img src=x onerror="alert(1)">'),
      );
      const res = await handleEngineRequest(edgeGet("/Home"), deck);
      expect(res.status).toBe(500);
      const body = await res.text();
      // The 500 is Decko's Wild Card page
      // in the full chrome — the original render message appears NOWHERE
      // when the chrome can build. This storage seeds no default layout, so
      // the builder's fallback stub answers, and its <pre> carries
      // the BUILDER's own failure message (the staging host catches inside
      // renderDeckoErrorPage, vm-staging-server.mjs:1530-1547) — escaped,
      // which is the escape convention this pin guards on this surface.
      expect(body).toContain(
        "default layout &quot;Default Layout&quot; has no body in the corpus",
      );
      expect(body).not.toContain("<img");
      expect(body).not.toContain("<script");
      expect(body).not.toContain("boom <img");
      expect(body).toContain("<h1>Render error</h1>");
    } finally {
      storage.close();
    }
  });
});
