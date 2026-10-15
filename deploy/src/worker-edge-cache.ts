// deploy/src/worker-edge-cache.ts — the whole-response cache for the Cloudflare
// Worker's anonymous card pages, on the Workers Cache API (`caches.default`).
// It mirrors the Bunny edge engine's content cache
// (deploy/bunny-worker-src/bunny-edge-content-cache.ts and
// bunny-edge-cache-headers.ts): the same cacheable classes, the same per-viewer
// bypass, the same TTL and freshness rules, the same diagnostic header.
//
// Only anonymous default/open HTML pages with no query or explicit view path
// are stored. JSON, operational routes, dynamic views, requests carrying
// session/Authorization/token credentials, response cookies, Vary, private,
// no-cache and no-store responses bypass storage. The normal render path
// explicitly marks its successful anonymous open page public; this wrapper
// never erases a private response's policy. The flag defaults OFF.
//
// INVALIDATION. The key is the request URL plus the deck's committed-write stamp
// (deck_data_version, the same value the render's freshness gate reads). Every
// write to a card table bumps the stamp (the stamp triggers, migrations 0003 and
// 0010), so the next request computes a different key and misses. Entries from
// older stamps are never read again and age out at the TTL. The TTL (default
// 300 s, DECKO_EDGE_CACHE_TTL to override) also bounds an entry written during
// a race, and is honored on match: an entry older than the TTL is a miss.
//
// ARMING. DECKO_EDGE_CACHE=1 arms the cache, the same strict-"1" convention the
// Bunny flag uses. Unarmed (the default) the Worker's response is untouched.
//
// OBSERVABILITY. Armed responses carry X-Decko-Edge-Cache with the decision:
// `miss+stored`, `hit`, `miss; not-stored`, `per-viewer-bypass`, `unavailable`,
// `stamp-unavailable`, or `store-error=...`.

/** The session cookie the write surface sets (src/server/write-routes.ts
 *  SESSION_COOKIE_NAME). A copy here keeps this module free of the write
 *  surface's imports; tests/deploy/worker-edge-cache.test.ts pins the two equal. */
export const SESSION_COOKIE_NAME = "decko_ts_session";

/** The default TTL, seconds (the Bunny module's default). */
export const DEFAULT_EDGE_CACHE_TTL_SECONDS = 300;

/** The diagnostic header. */
export const EDGE_CACHE_DIAGNOSTIC_HEADER = "X-Decko-Edge-Cache";

/** The header the stored copy carries (epoch ms) for the freshness check. A
 *  custom header, as in the Bunny module, because Date is not reliable on a
 *  cached copy's constructed headers. */
const STORED_AT_HEADER = "X-Decko-Stored-At";

/** Environment bag: the Worker's Env, narrowed to what this module reads. */
export interface EdgeCacheEnv {
  DECKO_EDGE_CACHE?: string;
  DECKO_EDGE_CACHE_TTL?: string;
}

/** The slice of the Cache API this module uses. Injectable, so the tests run
 *  an in-memory fake; the runtime's caches.default satisfies it. */
export interface EdgeCacheLike {
  match(request: Request | URL | string): Promise<Response | undefined>;
  put(request: Request | URL | string, response: Response): Promise<void>;
}

/** The cache classes this module distinguishes. */
export type EdgeCacheClass = "content-html" | "content-json" | "uncacheable";

/** Strict "1" arms the cache. */
export function edgeCacheArmed(env: EdgeCacheEnv): boolean {
  return env.DECKO_EDGE_CACHE === "1";
}

/** TTL in seconds: a positive integer override, else the default. */
export function edgeCacheTtlSeconds(env: EdgeCacheEnv): number {
  const raw = env.DECKO_EDGE_CACHE_TTL;
  if (raw === undefined) return DEFAULT_EDGE_CACHE_TTL_SECONDS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_EDGE_CACHE_TTL_SECONDS;
}

/** True when the request carries the session cookie under its exact name. The
 *  parse splits on ";" and compares names exactly, so a cookie whose name merely
 *  ends in the session name does not count. */
export function hasSessionCookie(request: Request): boolean {
  const header = request.headers.get("cookie");
  if (header === null) return false;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) return true;
  }
  return false;
}

/** Credentials must never address the shared anonymous key space. */
function hasCredentials(request: Request, url: URL): boolean {
  return hasSessionCookie(request) || request.headers.has("authorization") ||
    ["token", "_token"].some(key => url.searchParams.has(key));
}

/** Classify a GET request by its path. Only card renders and card JSON are
 *  cacheable; everything else, including every non-GET, is uncacheable. The
 *  status check is separate: a non-200 is never stored, whatever the class. */
export function edgeRouteCacheClass(method: string, pathname: string): EdgeCacheClass {
  if (method !== "GET") return "uncacheable";
  const path = pathname.replace(/\/+$/, "") || "/";
  if (/^\/(?:_|api(?:\/|$)|files(?:\/|$)|setup(?:\/|$)|delete(?:\/|$)|update(?:\/|$)|create(?:\/|$)|new(?:\/|$)|mod(?:\/|$))/.test(path)) return "uncacheable";
  if (path.endsWith(".csv") || path.endsWith(".rss")) return "uncacheable";
  if (path.endsWith(".json")) return "content-json";
  return "content-html";
}

/** The key the cache stores a card response under: the request's own URL
 *  (origin, path and query) with the deck stamp in the path, so every stamp is
 *  its own key space. The key is a synthetic URL on the same origin; no client
 *  ever requests it. */
export function edgeCacheKey(url: URL, stamp: number): URL {
  return new URL(`/__decko_edge_cache/v${stamp}${url.pathname}${url.search}`, url.origin);
}

/** The per-request dependencies the wrapper needs from the Worker. */
export interface EdgeCacheDeps {
  /** caches.default, or undefined where the runtime has no Cache API. */
  cache: EdgeCacheLike | undefined;
  /** The deck's current stamp, read after the freshness gate. Rejects or yields
   *  undefined when it cannot be read; the request then renders uncached. */
  stamp(): Promise<number | undefined>;
  /** The request's normal response path. */
  render(anonymousPage?: boolean): Promise<Response>;
}

/** Read through the serving driver's transaction barrier without booting a
 *  render engine merely to validate a whole-response cache hit. */
export async function readEdgeCacheStamp(driver: {
  query<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}): Promise<number | undefined> {
  const result = await driver.query<{ version: number }>("SELECT version FROM deck_data_version WHERE id = 1", []);
  return result.rows[0]?.version;
}

function responseWithHeaders(response: Response): Response {
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) });
}

function shareable(response: Response): boolean {
  return response.status === 200 && !response.headers.has("set-cookie") &&
    !response.headers.has("vary") && !/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/i.test(response.headers.get("cache-control") ?? "");
}

/** The Cache-Control a client sees on an armed card response: edge-only
 *  caching, browsers revalidate (the Bunny L1 shape). */
function clientCacheControl(ttl: number): string {
  return `public, max-age=0, s-maxage=${ttl}`;
}

/** Resolve the runtime's cache, or undefined where there is none. */
export function resolveEdgeCache(): EdgeCacheLike | undefined {
  const cachesObj = (globalThis as { caches?: { default?: EdgeCacheLike } }).caches;
  return cachesObj?.default;
}

/** The whole-response wrapper. Unarmed: render() is the whole behavior. */
export async function serveWithEdgeCache(
  request: Request,
  env: EdgeCacheEnv,
  deps: EdgeCacheDeps,
): Promise<Response> {
  if (!edgeCacheArmed(env)) return deps.render();

  const url = new URL(request.url);

  if (hasCredentials(request, url)) {
    // PER-VIEWER: fresh render, no cache in either direction, never stored.
    const response = responseWithHeaders(await deps.render());
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, "armed; cache=per-viewer-bypass");
    return response;
  }

  const cacheClass = edgeRouteCacheClass(request.method, url.pathname);
  const anonymousPage = cacheClass === "content-html" && !url.search &&
    url.pathname.split("/").filter(Boolean).length <= 1;
  if (!anonymousPage) return deps.render();
  if (/(?:^|,)\s*(?:no-cache|no-store)(?:\s|,|=|$)/i.test(request.headers.get("cache-control") ?? "")) return deps.render();

  const ttl = edgeCacheTtlSeconds(env);
  let stamp: number | undefined;
  try {
    stamp = await deps.stamp();
  } catch {
    stamp = undefined;
  }
  if (stamp === undefined || !Number.isSafeInteger(stamp) || stamp < 0) {
    const response = responseWithHeaders(await deps.render());
    response.headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, "armed; cache=stamp-unavailable");
    return response;
  }
  const cache = deps.cache;
  if (cache === undefined) {
    const response = responseWithHeaders(await deps.render());
    response.headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, "armed; cache=unavailable");
    return response;
  }

  const key = edgeCacheKey(url, stamp);
  let hit: Response | undefined;
  try {
    hit = await cache.match(key);
  } catch {
    hit = undefined;
  }
  if (hit !== undefined) {
    // Freshness on match: a stored copy older than the TTL is a miss. The
    // stored-at header is the authority; Cache-Control is not read back
    // (runtimes differ on whether they re-apply it).
    const storedAt = Number(hit.headers.get(STORED_AT_HEADER) ?? "");
    const age = Date.now() - storedAt;
    if (shareable(hit) && Number.isFinite(storedAt) && age >= 0 && age < ttl * 1000) {
      // The match's response carries the runtime's own headers, and the
      // spec allows their guard to be immutable (workerd's is). A fresh
      // Response re-wraps the body so the client-facing header shape on a
      // hit is the one a miss served, and the internal stamp never leaves
      // the cache. The body stream is used, not copied, so this costs a
      // response object rather than a byte copy.
      const headers = new Headers();
      for (const [name, value] of hit.headers) {
        if (name.toLowerCase() !== STORED_AT_HEADER.toLowerCase()) headers.set(name, value);
      }
      headers.set("Cache-Control", clientCacheControl(ttl));
      headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, "armed; cache=hit");
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
    }
  }

  const response = responseWithHeaders(await deps.render(true));
  if (!shareable(response)) {
    response.headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, "armed; cache=miss; not-stored");
    return response;
  }
  response.headers.set("Cache-Control", clientCacheControl(ttl));
  try {
    const stored = response.clone();
    stored.headers.set(STORED_AT_HEADER, String(Date.now()));
    // The stored copy carries a positive max-age: the Cache API expires a
    // max-age=0 entry on arrival. The client-facing copy keeps the L1 shape.
    stored.headers.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}`);
    await cache.put(key, stored);
    response.headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, `armed; cache=miss+stored; ttl=${ttl}`);
  } catch {
    response.headers.set(EDGE_CACHE_DIAGNOSTIC_HEADER, "armed; cache=miss; store-error");
  }
  return response;
}
