// Pin for the bunny-edge engine request core's HTML error pages: error text
// interpolated into an HTML page must go through escapeHtml.
//
// The vuln this pins shut (error-page-escape lane, 2026-10-02, commit
// 70d2042, deployed to script 93646 release dAZ4TRWv): the render engine
// embeds the requested card name verbatim in its not-found error
// (src/card/render.ts "card not found: ${cardName}"), parsePath decodes the
// URL path before render (worker.ts parsePath), and the error page
// interpolated that message RAW into `<pre>${message}</pre>` — so a crafted
// URL path like /Foo%3Cscript%3Ealert(1)%3C/script%3E injected live markup
// into the 500 page. The Cloudflare worker escapes the identical message
// (deploy/worker.ts errorPage -> escapeHtml); the engine request core
// mirrors that escapeHtml at its error-page interpolation sites
// (deploy/bunny-worker-src/bunny-edge-engine-request.ts).
//
// 2026-10-02 api-leak-fix lane: this pin originally drove the monolith
// entry's (request, config, getDeckFn) seam with a vi.mock of the
// runtime-only SDK. The engine-request refactor moved the handler into the
// SDK-free bunny-edge-engine-request.ts with the deck as a direct
// parameter — the pin ports to that seam (same crafted payloads, same
// escaped-output assertions) and needs no mock at all.
//
// CONVERGENCE ADAPTATION (lane-edge-converged-2026-10-02, merged here by
// the edge-true-union lane): the extracted mapper's two deliberate deltas
// are tracked by the assertions below: (1) the deck is injected directly as
// the handler's second parameter — the pre-split getDeckFn(config) seam is
// superseded by the core's `deck: Deck` argument, the same no-socket test
// capability; (2) "card not found" maps to HTTP 404 with title "Card not
// found" (the extracted error mapper's status table: 404 card-not-found /
// 422 unsupported-view / 500 otherwise) where the pre-split entry returned
// 500. The escape assertions — the actual invariant this pin exists for —
// are byte-identical to 70d2042's.
//
// No vi.mock is needed here: the request core import chain does not pull
// @bunny.net/edgescript-sdk (only the old entry's top-level
// BunnySDK.net.http.serve(...) did; the ambient shim lives at
// src/types/bunny-edgescript-sdk.d.ts).

import { describe, expect, it } from "vitest";

import type { FetchEngine } from "../../src/card/fetch.js";
import type { RenderEngine } from "../../src/card/render.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";

/** Fake deck: the page entry throws the engine's real error shapes
 *  (src/card/render.ts "card not found: ${cardName}" /
 *  format.ts "view (${view}) not supported for ${cardName}"), carrying
 *  whatever name parsePath decoded out of the URL. Since the edge-site-shell
 *  lane (2026-10-02) the 200-path's render entry is renderPageBytes, whose
 *  first statement wraps the page assembly in engine.runWithPageConfig —
 *  the stub throws there, so the message reaches the same escaping catch. */
function fakeDeckWithRenderError(error: Error): { deck: Parameters<typeof handleEngineRequest>[1] } {
  const deck = {
    fetcher: {} as unknown as FetchEngine,
    render: {
      runWithPageConfig: async () => {
        throw error;
      },
    } as unknown as RenderEngine,
  };
  return { deck };
}

describe("bunny-edge engine request error page HTML escaping", () => {
  it("renders a crafted <script> card name from the URL path as escaped text in the 404 error page", async () => {
    const { deck } = fakeDeckWithRenderError(
      new Error("card not found: Foo<script>alert(1)</script>"),
    );

    // <script> arrives percent-encoded in the URL path, exactly as a live
    // request would carry it; parsePath decodes it before render.
    const request = new Request(
      "https://edge.test/Foo%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
    );
    const response = await handleEngineRequest(request, deck);
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    // The payload lands as TEXT, not markup. (p2-error-shell lane,
    // 2026-10-03: the 404 page for this deck-less fake is the staging
    // builder's minimal not-found stub — the chrome cannot build without a
    // default layout — and its <pre> carries the same escaped message.)
    expect(body).toContain(
      "card not found: Foo&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(body).not.toContain("<script");
    // The error page shell is intact around the escaped payload. The stub's
    // title is the staging fallback's own ("Card not found") — the bare
    // layoutPage's shared "Error" title is gone with the full-chrome port.
    expect(body).toContain("<h1>Card not found</h1>");
    expect(body).toContain("<title>Card not found</title>");
  });

  it("escapes the unsupported-view 422 message the same way", async () => {
    // Real engine error shape (src/card/render/format.ts:72):
    // `view (${view}) not supported for ${cardName}` — the crafted card
    // name rides in the message body. The route is a genuine render route:
    // seg1 "naked" is in SUPPORTED_VIEWS, so parsePath reaches render.
    const { deck } = fakeDeckWithRenderError(
      new Error("view (naked) not supported for Foo<script>alert(1)</script>"),
    );

    const request = new Request("https://edge.test/Foo%3Cscript%3E/naked");
    const response = await handleEngineRequest(request, deck);
    const body = await response.text();

    expect(response.status).toBe(422);
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<script");
    expect(body).toContain("<h1>Unsupported view</h1>");
  });
});
