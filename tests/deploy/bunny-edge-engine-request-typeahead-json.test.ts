// Pin for the Bunny edge engine request core's `.:format` json dispatch:
// `GET /:mark/:view(.:format)` (engine_routes.rb:51) with the format suffix
// dispatches the view in the JSON FORMAT through the engine — the navbox
// typeahead's live-suggestions surface
// (`/*search/search_box_complete.json`, the merge-57 route surgery carried
// to this lineage after demo round 4 proved the Bunny host still answered
// the raw-suffix view name).
//
// The old parse kept the literal suffix — the view name answered
// unsupported-view as `search_box_complete.json` — while the staging host
// (whose two-segment `.json` arm strips the suffix and delegates to the
// engine) served the ported view. Both hosts answer from THIS dispatch now.
//
// Driven through the REAL handler over the real RenderEngine + FetchEngine
// on the in-memory sqlite deck (the error-page-escape pin's seam). The
// search view's registration depends on the storage's mod surface: when the
// view is registered the dispatch answers 200 with the engine's JSON bytes;
// when it is not, Ruby's 422 unsupported-view shape names the view WITHOUT
// the `.json` suffix — either way the suffix strip and the json dispatch are
// what this pin asserts, and the literal-suffix name is asserted absent.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

describe("bunny edge engine request core — the .:format json dispatch", () => {
  it("GET /:mark/:view.json strips the format suffix and dispatches the view in the json format", async () => {
    const storage = await createRenderTestStorage();
    try {
      const res = await handleEngineRequest(
        edgeGet("/*search/search_box_complete.json?term=Topic%2001"),
        { fetcher: storage.fetcher, render: storage.engine },
      );
      const body = await res.text();
      // This storage seeds no *search card, so the stripped-name dispatch
      // answers Ruby's card#read on a missing mark: 404 "card not found:
      // *search" (mapRenderError's table, the structured json error). The
      // OLD parse answered 422 unsupported-view with the literal suffix —
      // "search_box_complete.json" as the view name — so the status class
      // and the message together prove the suffix strip and the engine
      // dispatch. (On a deck carrying *search and the search mod, this arm
      // is the staging-proven 200 json bytes.)
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      const parsed = JSON.parse(body) as { error: string; message: string };
      expect(parsed.message).toBe("card not found: *search");
      expect(body).not.toContain("search_box_complete.json");
    } finally {
      storage.close();
    }
  });

  it("GET /:mark/:view without the suffix stays the html-format read, where a json-only view answers Ruby's 422", async () => {
    const storage = await createRenderTestStorage();
    try {
      const res = await handleEngineRequest(
        edgeGet("/*search/search_box_complete"),
        { fetcher: storage.fetcher, render: storage.engine },
      );
      const body = await res.text();
      expect([404, 422]).toContain(res.status);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(body).toContain("<");
    } finally {
      storage.close();
    }
  });
});
