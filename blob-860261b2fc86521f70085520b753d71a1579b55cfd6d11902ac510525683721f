import { ASSET_PREFIX, assets } from "../../vendor/decko-mod-style-images/assets.js";
import { ifNoneMatchSatisfied, notModifiedResponse } from "./conditional-asset-request.js";

/** The card-mod-style mod public files: the jQuery UI smoothness theme
 *  images the deck's published stylesheets reference through
 *  url([[/mod/style/jquery-ui-smoothness/...]]) chunks (the css format
 *  renders the link chunk to the deck path). The ORIGINAL deployment serves
 *  them from the mod public-files surface, the deck's public/mod/style/ tree
 *  (a copy of the gem's public/ directory) answered before the router sees
 *  the request; the pinned router's own answer for a /mod/* path is the
 *  bad_address wildcard (fixtures/captured/
 *  port-only-routes-e6-e13-ruby-oracle.json, row E10's router answers). This
 *  route is the edge's stand-in for that static layer, the same posture the
 *  FontAwesome and bootstrap-font routes have (font-awesome-assets.ts).
 *
 *  Immutable public vendor bytes: exact paths only, no database/attachment
 *  alias. The payload is pinned by sha256 (vendor/decko-mod-style-images/
 *  provenance.json), so the ETag IS the content identity: a client holding
 *  it is answered 304 instead of re-downloading the file. */
export function serveModStyleAsset(request: Request): Response | undefined {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(ASSET_PREFIX)) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const key = pathname.slice(ASSET_PREFIX.length);
  const asset = Object.hasOwn(assets, key) ? assets[key] : undefined;
  if (!asset) return new Response(null, { status: 404 });
  const headers = new Headers({
    "content-type": asset.contentType,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    etag: `"${asset.sha256}"`,
  });
  // The revalidation answer comes BEFORE the base64 decode, so a 304 costs no
  // atob() and no byte copy at all.
  if (ifNoneMatchSatisfied(request, headers.get("etag"))) return notModifiedResponse(headers);
  const bytes = Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0));
  headers.set("content-length", String(bytes.byteLength));
  return new Response(request.method === "HEAD" ? null : bytes, { headers });
}
