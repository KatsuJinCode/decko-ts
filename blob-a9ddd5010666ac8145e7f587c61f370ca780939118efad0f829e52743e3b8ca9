// The edge's mod public-files arm: /mod/style/jquery-ui-smoothness/ PNGs.
//
// WHAT THIS PINS, AND WHY. The asset-input refresh seam publishes the deck's
// stylesheets from the port's vendored mod sources, and the vendored
// jquery_ui_smoothness.css references the jQuery UI theme's images through
// url([[/mod/style/...]]) chunks. With no arm serving those paths the
// whole-family exercise's browser asset audit read a 404 for
// /mod/style/jquery-ui-smoothness/ui-bg_glass_65_ffffff_1x400.png and the
// family read 331 of 332 (the v26 roll receipt, section 4). The pin here is
// the parity statement itself: EVERY image path the vendored stylesheet
// references is served, with the exact pinned bytes, the cache posture the
// other vendor arms publish, and the conditional-request semantics.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serveModStyleAsset } from "../../src/server/mod-style-assets.js";
import { ASSET_PREFIX, assets } from "../../vendor/decko-mod-style-images/assets.js";

/** The pinned provenance the vendored package carries (paths, byte sizes,
 *  sha256 hashes), read off the file rather than restated. */
function provenance(): { files: { path: string; bytes: number; sha256: string }[] } {
  return JSON.parse(
    readFileSync(new URL("../../vendor/decko-mod-style-images/provenance.json", import.meta.url), "utf8"),
  );
}

const HOST = "https://local.test";
/** The exact URL the failing audit measured (v26 roll receipt, section 4). */
const AUDIT_URL = `${HOST}${ASSET_PREFIX}ui-bg_glass_65_ffffff_1x400.png`;

/** Every /mod/style/jquery-ui-smoothness/ path the vendored theme
 *  stylesheet references, read off the file rather than restated, so the
 *  test tracks the reference list the published stylesheets actually
 *  carry. The chunk renders url([[<path>]]) to <path>, with the initial
 *  slash kept here (an absolute deck path). */
function referencedPaths(): string[] {
  const css = readFileSync(
    new URL("../../fixtures/vendor/mod-style-assets/card-mod-style/assets/style/jquery_ui_smoothness.css", import.meta.url),
    "utf8",
  );
  const paths = [...css.matchAll(/\[\[(\/mod\/style\/jquery-ui-smoothness\/[^\]|]+?)\]\]/g)].map(m => m[1]!);
  return [...new Set(paths)].sort();
}

describe("serveModStyleAsset: the mod public-files surface the stylesheets reference", () => {
  it("serves every image path the vendored theme stylesheet references", () => {
    const paths = referencedPaths();
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const response = serveModStyleAsset(new Request(`${HOST}${path}`))!;
      expect(response.status, path).toBe(200);
    }
    // and the vendored map covers exactly that reference list
    expect(Object.keys(assets).sort()).toEqual(paths.map(p => p.slice(ASSET_PREFIX.length)).sort());
  });

  it("serves the audit's failing URL with the exact pinned bytes", async () => {
    const response = serveModStyleAsset(new Request(AUDIT_URL))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pinned = provenance().files.find(f => f.path.endsWith("ui-bg_glass_65_ffffff_1x400.png"))!;
    expect(bytes.byteLength).toBe(pinned.bytes);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    expect(`"${sha256}"`).toBe(response.headers.get("etag"));
  });

  it("answers a matching If-None-Match with 304 and no body", () => {
    const etag = serveModStyleAsset(new Request(AUDIT_URL))!.headers.get("etag")!;
    const revalidated = serveModStyleAsset(new Request(AUDIT_URL, { headers: { "if-none-match": etag } }))!;
    expect(revalidated.status).toBe(304);
    expect(revalidated.body).toBeNull();
    expect(revalidated.headers.get("etag")).toBe(etag);
    expect(revalidated.headers.get("content-length")).toBeNull();
  });

  it("HEAD serves the headers with no body; an unmatched validator serves the body", async () => {
    const etag = serveModStyleAsset(new Request(AUDIT_URL))!.headers.get("etag")!;
    const head = serveModStyleAsset(new Request(AUDIT_URL, { method: "HEAD" }))!;
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("etag")).toBe(etag);
    const stale = serveModStyleAsset(new Request(AUDIT_URL, { headers: { "if-none-match": '"not-the-payload"' } }))!;
    expect(stale.status).toBe(200);
    expect((await stale.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("rejects non-read verbs with 405 and answers unknown names and other prefixes 404/undefined", () => {
    const post = serveModStyleAsset(new Request(AUDIT_URL, { method: "POST" }))!;
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    expect(serveModStyleAsset(new Request(`${HOST}${ASSET_PREFIX}ui-icons_999999_256x240.png`))!.status).toBe(404);
    expect(serveModStyleAsset(new Request(`${HOST}/mod/bootstrap/fonts/bootstrap-icons.woff2`))).toBeUndefined();
  });
});
