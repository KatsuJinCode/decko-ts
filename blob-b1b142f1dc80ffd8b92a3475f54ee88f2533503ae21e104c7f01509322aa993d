// The conditional-request answer the edge's static-asset routes now give.
//
// WHAT THIS PINS, AND WHY IT IS A PINS-RATHER-THAN-A-PREFERENCE.
// Before the change the routes emitted an ETag (the vendored payload's
// sha256) and never read it: a request carrying If-None-Match was answered
// with a full 200 and the whole body. Measured over the assets one deck page
// pulls (tools/perf/asset-bytes/measure-asset-http-delivery.mjs, baseline
// run): 11 of 14 responses carried an ETag, 0 of 11 revalidations were
// answered 304, and 1,382,514 bytes were re-sent. These tests hold that
// number at zero, and hold the semantics that produce it.
//
// RFC 9110 §13.1.2 is what decides each expectation below: for GET and HEAD
// the comparison is WEAK, `*` matches any current representation, and a
// non-GET/HEAD request must NOT get a 304 from this path (§13.1.2 requires
// 412 there, and no route here takes a conditional non-GET).
import { describe, expect, it } from "vitest";
import { ifNoneMatchSatisfied, notModifiedResponse } from "../../src/server/conditional-asset-request.js";
import { serveFontAwesomeAsset } from "../../src/server/font-awesome-assets.js";
import { serveBootstrapFontAsset } from "../../src/server/bootstrap-font-assets.js";
import { FONT_AWESOME_ASSET_PREFIX } from "../../src/card/render/font-awesome.js";

const CSS_URL = `https://local.test${FONT_AWESOME_ASSET_PREFIX}css/all.min.css`;
const ICONS_URL = "https://local.test/mod/bootstrap/fonts/bootstrap-icons.woff2";

/** The route's own ETag, read off a real 200 rather than recomputed, so the
 *  test tracks whatever validator the route actually publishes. */
async function etagOf(url: string, serve: (r: Request) => Response | undefined): Promise<string> {
  const response = serve(new Request(url))!;
  expect(response.status).toBe(200);
  const etag = response.headers.get("etag");
  expect(etag).not.toBeNull();
  return etag!;
}

describe("conditional asset requests: the ETag the routes publish is one they honor", () => {
  it("answers a matching If-None-Match with 304 and no body, on both vendor routes", async () => {
    for (const [url, serve] of [
      [CSS_URL, serveFontAwesomeAsset],
      [ICONS_URL, serveBootstrapFontAsset],
    ] as const) {
      const etag = await etagOf(url, serve);
      const revalidated = serve(new Request(url, { headers: { "if-none-match": etag } }))!;
      expect(revalidated.status).toBe(304);
      expect(revalidated.body).toBeNull();
      // A 304 repeats the validators and cache policy a 200 would have sent
      // (RFC 9110 §15.4.5) and carries no representation of its own.
      expect(revalidated.headers.get("etag")).toBe(etag);
      expect(revalidated.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(revalidated.headers.get("content-length")).toBeNull();
    }
  });

  it("still serves the body when the validator does not match", async () => {
    const url = CSS_URL;
    const fresh = serveFontAwesomeAsset(new Request(url))!;
    const stale = serveFontAwesomeAsset(new Request(url, { headers: { "if-none-match": '"not-the-payload"' } }))!;
    expect(stale.status).toBe(200);
    expect((await stale.arrayBuffer()).byteLength).toBe((await fresh.arrayBuffer()).byteLength);
  });

  it("serves the body when no validator is sent at all", () => {
    expect(serveFontAwesomeAsset(new Request(CSS_URL))!.status).toBe(200);
    expect(serveBootstrapFontAsset(new Request(ICONS_URL))!.status).toBe(200);
  });

  it("honors HEAD revalidation without a body", async () => {
    const etag = await etagOf(CSS_URL, serveFontAwesomeAsset);
    const head = serveFontAwesomeAsset(new Request(CSS_URL, { method: "HEAD", headers: { "if-none-match": etag } }))!;
    expect(head.status).toBe(304);
    expect(head.body).toBeNull();
  });

  it("matches weakly, as RFC 9110 requires for GET/HEAD: W/ and bare tags compare equal", async () => {
    const etag = await etagOf(CSS_URL, serveFontAwesomeAsset);
    const opaque = etag.replace(/^"|"$/g, "");
    expect(serveFontAwesomeAsset(new Request(CSS_URL, { headers: { "if-none-match": `W/"${opaque}"` } }))!.status).toBe(304);
    expect(serveFontAwesomeAsset(new Request(CSS_URL, { headers: { "if-none-match": opaque } }))!.status).toBe(200);
  });

  it("matches one tag inside a comma-separated list, and honors the wildcard", async () => {
    const etag = await etagOf(CSS_URL, serveFontAwesomeAsset);
    expect(serveFontAwesomeAsset(new Request(CSS_URL, { headers: { "if-none-match": `"other", ${etag}` } }))!.status).toBe(304);
    expect(serveFontAwesomeAsset(new Request(CSS_URL, { headers: { "if-none-match": "*" } }))!.status).toBe(304);
  });

  it("refuses the 304 on a method that is not GET/HEAD", () => {
    // No route here takes a conditional non-GET, so the helper must not hand
    // one a 304 (§13.1.2 wants 412 there, which is the caller's business).
    const post = new Request(CSS_URL, { method: "POST", headers: { "if-none-match": '"anything"' } });
    expect(ifNoneMatchSatisfied(post, '"anything"')).toBe(false);
  });
});

describe("cache policy on the vendored font routes", () => {
  it("publishes both icon fonts as immutable for a year, not re-downloadable daily", () => {
    // The bootstrap icon fonts are pinned by sha256 and addressed by a fixed
    // name with no variant fallback, so their content cannot change. The old
    // `max-age=86400` made every browser re-download both (285,648 bytes)
    // every day for bytes that never change.
    for (const name of ["bootstrap-icons.woff2", "bootstrap-icons.woff"]) {
      const response = serveBootstrapFontAsset(new Request(`https://local.test/mod/bootstrap/fonts/${name}`))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
  });
});

describe("ifNoneMatchSatisfied: the comparison itself", () => {
  const get = (headers?: Record<string, string>) => new Request("https://local.test/a.css", { headers });

  it("is false without a header, without an etag, and off GET/HEAD", () => {
    expect(ifNoneMatchSatisfied(get(), '"a"')).toBe(false);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": '"a"' }), null)).toBe(false);
    expect(ifNoneMatchSatisfied(new Request("https://local.test/a.css", { method: "POST", headers: { "if-none-match": '"a"' } }), '"a"')).toBe(false);
  });

  it("is true for an exact match, a weak match, a list containing it, and the wildcard", () => {
    expect(ifNoneMatchSatisfied(get({ "if-none-match": '"a"' }), '"a"')).toBe(true);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": 'W/"a"' }), '"a"')).toBe(true);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": '"a"' }), 'W/"a"')).toBe(true);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": '"b", "a" , "c"' }), '"a"')).toBe(true);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": "*" }), '"a"')).toBe(true);
  });

  it("is false for a header that carries only non-matching tags or junk", () => {
    expect(ifNoneMatchSatisfied(get({ "if-none-match": '"b", "c"' }), '"a"')).toBe(false);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": "a" }), '"a"')).toBe(false);
    expect(ifNoneMatchSatisfied(get({ "if-none-match": '"' }), '"a"')).toBe(false);
  });
});

describe("notModifiedResponse", () => {
  it("repeats the given headers, carries no body and no content-length", () => {
    const headers = new Headers({ etag: '"a"', "cache-control": "public, max-age=31536000, immutable" });
    const response = notModifiedResponse(headers);
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"a"');
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.body).toBeNull();
  });
});