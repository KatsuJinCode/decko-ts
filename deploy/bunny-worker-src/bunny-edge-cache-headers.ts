// deploy/bunny-worker-src/bunny-edge-cache-headers.ts — CDN cacheability
// decision for the Bunny edge engine entry, behind the DECKO_EDGE_CACHE flag.
//
// WHY THIS EXISTS: Bunny executes a standalone edge script ONLY on cache
// misses ("Normally edge scripts run after the cache; cached responses are
// served without invoking the script" — bunny.net/docs/scripting/
// before-cache.md). The entry's html()/json()
// constructors emit `Cache-Control: no-store` on every response, so the CDN
// never caches and every visitor request pays a full engine render plus 1-3
// Bunny-DB round-trips. When the operator arms DECKO_EDGE_CACHE=1, content
// responses get `public, max-age=0, s-maxage=<TTL>` instead: the CDN edge
// caches them and serves repeat hits WITHOUT executing the script — the
// script's per-request CPU on those hits drops to zero by the platform's own
// design. Unarmed (the default), every response passes through untouched and
// behavior is byte-identical to the previous release.
//
// WHAT IS CACHEABLE (when armed, GET/HEAD, status 200 only):
//   - card page renders: "/", "/<name>", "/<name>/<view>" (any SUPPORTED_VIEWS
//     view; the history-family views take query params, and the CDN's cache
//     key includes the query string, so param variants are distinct entries)
//   - card metadata JSON: "/api/card/<name>"
// WHAT STAYS no-store:
//   - health/status: "/_status", "/api/status" — health surfaces must report
//     the present, not a cached past
//   - every non-200 (403/404/422/500) — a transient DB failure must never be
//     cemented into the CDN (the pull zone additionally has
//     CacheErrorResponses: false)
//   - any response the write surface produced — the surface returns before
//     the engine path, so this module never sees it (and sign-in form pages
//     must not be cached)
//
// NO Vary HEADER IS NEEDED: the read path reads no cookies and no per-user
// request state (session resolution lives entirely in the write surface);
// the render is anonymous. If a per-user read path ever lands on this edge,
// that assumption must be revisited here.
//
// INVALIDATION: content syncs must purge the script's pull zone after
// re-import — full zone: POST https://api.bunny.net/pullzone/{id}/purgeCache
// (AccessKey header, 204), or per-URL: POST https://api.bunny.net/purge?url=...
// The s-maxage TTL (default 300 s, override with DECKO_EDGE_CACHE_TTL) is the
// staleness backstop when a purge is lost, not the primary invalidation.

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the entry's EdgeEnv. */
type EdgeEnv = Record<string, string | undefined>;

/** Default s-maxage backstop, seconds. Purge-on-sync is the primary
 *  invalidation; this only bounds how stale a page can be if a purge is
 *  lost. */
export const DEFAULT_EDGE_CACHE_TTL_SECONDS = 300;

/** The flag arms header emission. Strict "1" — the same convention the write
 *  surface uses for DECKO_WRITE_PATH — so "true"/"yes" do NOT arm by
 *  accident. */
export function edgeCacheArmed(env: EdgeEnv): boolean {
  return env.DECKO_EDGE_CACHE === "1";
}

/** TTL override in seconds; anything but a positive integer keeps the
 *  default (zero/negative would make pages uncacheable-by-accident, which
 *  is what the flag OFF state is for). */
export function edgeCacheTtlSeconds(env: EdgeEnv): number {
  const raw = env.DECKO_EDGE_CACHE_TTL;
  if (raw === undefined) return DEFAULT_EDGE_CACHE_TTL_SECONDS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EDGE_CACHE_TTL_SECONDS;
}

/** Cache classes this module distinguishes. "uncacheable" responses are left
 *  exactly as the entry constructed them (its constructors already emit
 *  no-store), which is what makes flag OFF a byte-identical pass-through. */
export type EdgeCacheClass = "content-html" | "content-json" | "uncacheable";

/** Classify a served response by request path and status. Paths mirror the
 *  entry's route table (and the lineage surface's parsePath, which the
 *  engine-request dispatch imports so the two cannot drift): /_status is
 *  answered before this module is
 *  consulted, but classified uncacheable here anyway for defense in depth. */
export function edgeRouteCacheClass(
  pathname: string,
  status: number,
): EdgeCacheClass {
  if (status !== 200) return "uncacheable";
  const path = pathname.replace(/\/+$/, "");
  if (path === "/_status" || path === "/api/status") return "uncacheable";
  if (path === "/api/card" || path.startsWith("/api/card/")) {
    return "content-json";
  }
  // Everything else that reached the engine on a 200 is a card page render
  // (parsePath already mapped unknown shapes to 404/non-200 upstream).
  return "content-html";
}

/** The header value for a class at a TTL. max-age=0 keeps browsers from
 *  reusing the render locally; only the CDN edge caches (s-maxage). */
export function cacheControlFor(
  cacheClass: EdgeCacheClass,
  ttlSeconds: number,
): string {
  return `public, max-age=0, s-maxage=${ttlSeconds}`;
}

/** Apply the cacheability decision to a response the entry is about to
 *  return. Flag OFF: the response object is returned untouched (current
 *  behavior, byte-identical). Armed: cacheable classes get their Cache-
 *  Control replaced; uncacheable classes keep the constructor's no-store.
 *  Constructed Response headers are mutable in the fetch standard (guard
 *  "response"); if a runtime ever hands back an immutable header guard the
 *  set() throws loudly rather than silently no-opping. */
export function applyEdgeCacheHeaders(
  response: Response,
  pathname: string,
  env: EdgeEnv,
): Response {
  if (!edgeCacheArmed(env)) return response;
  const cacheClass = edgeRouteCacheClass(pathname, response.status);
  if (cacheClass === "uncacheable") return response;
  response.headers.set(
    "Cache-Control",
    cacheControlFor(cacheClass, edgeCacheTtlSeconds(env)),
  );
  return response;
}
