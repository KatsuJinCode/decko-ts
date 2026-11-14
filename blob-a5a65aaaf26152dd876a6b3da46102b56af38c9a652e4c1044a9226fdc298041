import { assets } from "../../vendor/fontawesome-free-6.7.2/assets.js";
import { FONT_AWESOME_ASSET_PREFIX } from "../card/render/font-awesome.js";
import { ifNoneMatchSatisfied, notModifiedResponse } from "./conditional-asset-request.js";

/** Immutable public vendor bytes: exact paths only, no database/attachment
 *  alias. The payload is pinned by sha256, so the ETag IS the content
 *  identity: a client holding it is answered 304 instead of re-downloading
 *  the file (conditional-asset-request.ts carries the measured baseline). */
export function serveFontAwesomeAsset(request: Request): Response | undefined {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(FONT_AWESOME_ASSET_PREFIX)) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const key = pathname.slice(FONT_AWESOME_ASSET_PREFIX.length);
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
