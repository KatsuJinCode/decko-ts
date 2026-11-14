// src/server/conditional-asset-request.ts — the conditional-request answer
// for the edge's static-asset routes.
//
// WHY THIS FILE EXISTS. The asset routes emit an ETag (the vendored payload's
// sha256) but nothing ever READ it: a request carrying `If-None-Match` was
// answered with a full 200 and the whole body re-sent. Measured over the
// assets a deck page pulls (tools/perf/asset-bytes/
// measure-asset-http-delivery.mjs, baseline run): 11 of 14 responses carried
// an ETag and 0 of 11 revalidations were answered 304, re-downloading
// 1,382,514 bytes. An ETag that cannot produce a 304 is not a validator, it
// is decoration — and it costs the bytes it was supposed to save.
//
// THE ONE IMPLEMENTATION. Two routes need it (font-awesome-assets.ts and
// bootstrap-font-assets.ts), and the semantics are fiddly enough — the weak
// comparison function, `*`, comma-separated lists, quoted strings — that two
// copies would drift. So the comparison lives here once and both call sites
// hand it their request and their ETag.
//
// RFC 9110 §13.1.2 (If-None-Match). For GET and HEAD the comparison is WEAK:
// two entity-tags match when their opaque-tags are byte-identical, regardless
// of either one's `W/` prefix. `*` matches any current representation. A
// non-GET/HEAD method is not this function's business — §13.1.2 requires 412
// there, and no route on this surface takes a conditional non-GET, so the
// caller is told "no match" rather than being handed a 304 it must not send.

/** The opaque-tag of one entity-tag, with any `W/` weakness prefix removed, or
 *  null when the token is not an entity-tag at all. */
function opaqueTag(token: string): string | null {
  const match = /^(?:W\/)?"([\s\S]*)"$/.exec(token.trim());
  return match === null ? null : match[1];
}

/** True when the request's `If-None-Match` matches `etag` under the weak
 *  comparison function — the answer a GET/HEAD route needs in order to send
 *  304 Not Modified instead of the body.
 *
 *  `*` matches whenever the representation exists, which it does here: the
 *  caller has already found the payload. A header that is present but carries
 *  no entity-tag that matches returns false, and the caller sends the body.
 *  A MISSING header is not a match: there is nothing to revalidate against. */
export function ifNoneMatchSatisfied(request: Request, etag: string | null): boolean {
  if (etag === null) return false;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const header = request.headers.get("if-none-match");
  if (header === null) return false;

  const current = opaqueTag(etag);
  if (current === null) return false;
  for (const token of header.split(",")) {
    const trimmed = token.trim();
    if (trimmed === "*") return true;
    const candidate = opaqueTag(trimmed);
    if (candidate !== null && candidate === current) return true;
  }
  return false;
}

/** The 304 a conditional GET/HEAD gets instead of the body. It repeats the
 *  validators and the cache policy a 200 would have carried — RFC 9110
 *  §15.4.5 asks a 304 to send the header fields a 200 would have sent — and
 *  carries no body and no Content-Length. */
export function notModifiedResponse(headers: Headers): Response {
  return new Response(null, { status: 304, headers });
}