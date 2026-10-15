import { assets } from "../../vendor/fontawesome-free-6.7.2/assets.js";
import { FONT_AWESOME_ASSET_PREFIX } from "../card/render/font-awesome.js";

/** Immutable public vendor bytes: exact paths only, no database/attachment alias. */
export function serveFontAwesomeAsset(request: Request): Response | undefined {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(FONT_AWESOME_ASSET_PREFIX)) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const key = pathname.slice(FONT_AWESOME_ASSET_PREFIX.length);
  const asset = Object.hasOwn(assets, key) ? assets[key] : undefined;
  if (!asset) return new Response(null, { status: 404 });
  const bytes = Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0));
  return new Response(request.method === "HEAD" ? null : bytes, {
    headers: {
      "content-type": asset.contentType,
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      etag: `"${asset.sha256}"`,
    },
  });
}
