import { assets } from "../../vendor/decko-bootstrap-fonts/assets.js";
import {serveMaterialIconsAsset} from './material-icons-assets.js';
import { ifNoneMatchSatisfied, notModifiedResponse } from "./conditional-asset-request.js";

/** The card-mod-bootstrap icon font, served from the same pinned vendor map.
 *
 *  CACHE POLICY, and why it changed. These bytes are pinned by sha256 in
 *  vendor/decko-bootstrap-fonts/provenance.json and addressed by a fixed name
 *  with no variant fallback, so a given URL's content can never change — the
 *  same property the FontAwesome route has always declared as
 *  `public, max-age=31536000, immutable` (font-awesome-assets.ts). This route
 *  declared `max-age=86400`, so every browser re-downloaded both fonts
 *  (121,296 + 164,352 = 285,648 bytes) once a day forever, for bytes that
 *  never change. Measured per visit: 285,648 bytes, every day. */
export function serveBootstrapFontAsset(request: Request): Response | undefined {
  const material=serveMaterialIconsAsset(request);
  if(material)return material;
  const prefix = "/mod/bootstrap/fonts/";
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(prefix)) return undefined;
  const name = pathname.slice(prefix.length);
  if (!Object.hasOwn(assets, name)) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const asset = assets[name]!;
  const headers = new Headers({
    "content-type": asset.contentType,
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=31536000, immutable",
    etag: `"${asset.sha256}"`,
  });
  // Before the decode, so a 304 costs no atob() and no byte copy.
  if (ifNoneMatchSatisfied(request, headers.get("etag"))) return notModifiedResponse(headers);
  const bytes = Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0));
  headers.set("content-length", String(bytes.length));
  return new Response(request.method === "HEAD" ? null : bytes, { headers });
}
