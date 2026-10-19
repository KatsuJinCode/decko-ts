// deploy/bunny-worker-src/bunny-edge-content-cache.ts — L2 script-side edge
// cache for the Bunny engine entry (DECKO_EDGE_CACHE=1), riding the runtime's
// Cache API (`caches.default`).
//
// WHY L2 EXISTS (measured, not assumed): the L1 design
// (bunny-edge-cache-headers.ts) emits `public, max-age=0, s-maxage=<TTL>` on
// content responses when armed. Deployed and probed on the platform, the
// Bunny layer outside the script serves `Cache-Control: no-cache` for script
// responses regardless of what the script emits (it rewrites `no-store` the
// same way). A no-cache response is never CDN-cached, so the header alone
// cannot keep the script off the hot path. The runtime Cache API CAN: the
// script checks `caches.default` before rendering and stores content
// responses after — the script still EXECUTES on every request (the platform
// runs standalone scripts per request by design), but a hit skips the
// render and its 1+ Bunny-DB round-trips, dropping per-execution CPU from
// the ~100-170 ms the heaviest renders cost to the cost of a local cache
// match. That drop is provable on Bunny's own counter
// (AverageCpuTimePerExecution, TotalCpuUsed).
//
// CACHE KEY: the incoming request URL, verbatim (method-normalized to GET).
// Query strings matter — the history views take act_id/page/... params, so
// param variants are distinct entries. Hostname is not overridden (the
// runtime docs warn matching across a zone's hostnames misbehaves).
//
// THE NEGATIVE CLASS RIDES THIS STORE TOO. A 404 is a cache class of its own
// (bunny-edge-cache-headers.ts, "WHAT IS CACHEABLE, SHORTER"), and it is
// where the repeat-request cost actually lives: MEASURED on the live edge
// 2026-10-19, four identical 404 requests were `CDN-Cache: MISS` / `cache=miss`
// every time, each paying a live 127-287 ms render for a 13,634 B body,
// while the sibling 200 went `CDN-Cache: HIT` with no origin work. This
// store is the half of the fix that does NOT depend on the pull zone's
// CacheErrorResponses setting (provisioning never sets that field), so a
// repeat miss is answered from here without re-rendering whatever the CDN
// decides to do with a 404. Stored under the negative TTL (60 s default),
// so the freshness check on match expires it on the negative schedule.
//
// INVALIDATION: content syncs bump `DECKO_EDGE_CACHE_EPOCH` (edge script
// variable; the sync job owns the bump): the cache name becomes
// `decko-content:v<epoch>`, orphaning every entry written under the old
// epoch in one API call, no redeploy. Epoch 0/absent = `caches.default`.
// A lost epoch bump is bounded by the same TTL the L1 headers carry
// (s-maxage default 300 s) — entries stored carry that Cache-Control, and
// this module ALSO honors stored-entry freshness on match: an entry older
// than the TTL is treated as a miss (re-render overwrites it).
//
// OBSERVABILITY: every armed response carries `X-Decko-Edge-Cache` with the
// decision (`hit` / `miss` / `stored` / `unavailable`), so the live behavior
// is assertable from outside the isolate. Unarmed responses carry nothing —
// default behavior stays byte-identical.

import {
  applyEdgeCacheHeaders,
  edgeCacheArmed,
  edgeTtlForClass,
  edgeRouteCacheClass,
  DEFAULT_EDGE_CACHE_TTL_SECONDS,
} from "./bunny-edge-cache-headers.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. */
type EdgeEnv = Record<string, string | undefined>;

/** The slice of the runtime Cache API this module needs — injectable so the
 *  tests run against an in-memory fake with no runtime present. Matches the
 *  shape of `caches.open(name)` results (match/put per the Cache API docs). */
export interface EdgeCacheLike {
  match(request: Request | URL | string): Promise<Response | undefined>;
  put(request: Request | URL | string, response: Response): Promise<void>;
}

/** Resolve the epoch-scoped cache. Epoch 0/absent uses `caches.default`
 *  directly; any positive epoch opens `decko-content:v<epoch>` so a sync can
 *  orphan the whole cache in one variable update. Returns undefined when the
 *  runtime has no Cache API at all (reported as `unavailable`, never
 *  silently swallowed). */
export function resolveEdgeContentCache(env: EdgeEnv): EdgeCacheLike | undefined {
  const cachesObj = (globalThis as { caches?: { default?: EdgeCacheLike; open?(name: string): Promise<EdgeCacheLike> } }).caches;
  if (!cachesObj) return undefined;
  const rawEpoch = Number(env.DECKO_EDGE_CACHE_EPOCH ?? "0");
  const epoch = Number.isInteger(rawEpoch) && rawEpoch > 0 ? rawEpoch : 0;
  if (epoch === 0) return cachesObj.default;
  if (!cachesObj.open) return undefined;
  // open() is async in the web Cache API; the entry awaits through
  // serveWithEdgeCache, so fire-and-resolution happens at the call site —
  // but resolveEdgeContentCache is sync. Bridge with a lazy adapter: the
  // match/put calls await the opened cache on first use.
  const opened = cachesObj.open(`decko-content:v${epoch}`);
  return {
    async match(request) {
      return (await opened).match(request);
    },
    async put(request, response) {
      await (await opened).put(request, response);
    },
  };
}

const DIAGNOSTIC_HEADER = "X-Decko-Edge-Cache";

/** Per-request cache policy. */
export interface EdgeCacheOptions {
  /**
   * The response bytes belong to ONE viewer (a signed-in render — see
   * bunny-edge-session-viewer.ts). The cache key is the request URL alone
   * (see the header's CACHE KEY section): nothing about the session rides
   * in it. So a per-viewer response must neither be served FROM that cache
   * nor be stored INTO it — otherwise the first account to render a card
   * arms a cache entry that the next account, and the next anonymous
   * visitor, is served. Bypassing both directions is also what keeps the
   * anonymous bytes identical: an anonymous request never sets this, so
   * every entry in the shared cache was written by an anonymous render.
   *
   * Unset (the default, and every pre-session call): behavior is exactly
   * as it was, byte for byte.
   */
  perViewer?: boolean;
}

/** Cache-through wrapper for one engine-path request. Flag OFF: `render()` is
 *  the entire behavior (untouched response, no header, no cache contact).
 *  Armed: match first; on a hit the stored response is returned (render never
 *  runs); on a miss the render runs and cacheable 200s are stored with their
 *  s-maxage TTL. GET only — HEAD bypasses (the entry treats HEAD as a read,
 *  but cached-body semantics for HEAD are the runtime's business).
 *  `perViewer` skips the whole cache contract in both directions — see
 *  {@link EdgeCacheOptions.perViewer}. */
export async function serveWithEdgeCache(
  request: Request,
  env: EdgeEnv,
  render: () => Promise<Response>,
  cache: EdgeCacheLike | undefined,
  options?: EdgeCacheOptions,
): Promise<Response> {
  if (!edgeCacheArmed(env)) return render();

  if (options?.perViewer === true) {
    // Signed-in bytes: rendered fresh every time, never stored, never
    // served from a shared entry, and explicitly private so neither this
    // cache nor an outer CDN that HONORS origin headers stores them. The
    // diagnostic header is kept (it is how the live bypass is observed from
    // outside the isolate) but carries no hit/miss claim, because there is
    // no lookup to report.
    const response = await render();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set(DIAGNOSTIC_HEADER, "armed; cache=per-viewer-bypass");
    return response;
  }

  const key = new URL(request.url);
  const isGet = request.method === "GET";

  if (cache !== undefined && isGet) {
    let hit: Response | undefined;
    try {
      hit = await cache.match(key);
    } catch {
      hit = undefined;
    }
    if (hit) {
      // Freshness: entries carry X-Decko-Stored-At (epoch ms) + s-maxage=
      // <stored ttl>; anything past the ttl is a miss so a lowered TTL
      // re-renders instead of serving stale. A custom header, not Date,
      // because a runtime that refuses Date on constructed responses would
      // otherwise silently disable every hit.
      const storedAt = Number(hit.headers.get("X-Decko-Stored-At") ?? "");
      const maxAge = Number((hit.headers.get("Cache-Control") ?? "").match(/s-maxage=(\d+)/)?.[1] ?? "0");
      const fresh = Number.isFinite(storedAt) && maxAge > 0 && Date.now() - storedAt < maxAge * 1000;
      if (fresh) {
        // Normalize the served copy back to the L1 browser contract
        // (max-age=0: browsers revalidate; only the edge reuses) and strip
        // the internal storage stamp. Best effort on the label only — a
        // runtime returning immutable header guards from match() must not
        // turn a valid hit into a 500.
        try {
          hit.headers.delete("X-Decko-Stored-At");
          applyEdgeCacheHeaders(hit, key.pathname, env);
          hit.headers.set(DIAGNOSTIC_HEADER, "armed; cache=hit");
        } catch {
          /* hit returned unlabeled/unnormalized; bytes and behavior unchanged */
        }
        return hit;
      }
    }
  }

  const response = await render();
  const cacheClass = edgeRouteCacheClass(key.pathname, response.status);
  // THE STORED TTL IS THE CLASS TTL, not the content TTL: a 404 stores under
  // the shorter negative bound, so the freshness check on match (which reads
  // the stored s-maxage back out of the entry) expires it on the negative
  // schedule without a second code path.
  const storeTtl = edgeTtlForClass(cacheClass, env);
  // THE PER-VISITOR RESPONSE RULE: a page whose render touched the visitor
  // session carries Set-Cookie (the decko_visit location history the read
  // path saves on every page show — location_history.rb save_current_location).
  // Its bytes stay shared, but its HEADER is one visitor's state: storing it
  // would replay that Set-Cookie to every later visitor of the entry (the
  // same cross-visitor hazard the perViewer bypass exists for), and a
  // honoring shared layer must never reuse a Set-Cookie response. Such a
  // response is therefore never stored here and carries the private label
  // instead of the L1 shared one.
  const hasVisitorSetCookie = response.headers.has("Set-Cookie");
  const observable = cache === undefined ? "unavailable" : isGet ? "miss" : "bypass-head";
  response.headers.set(DIAGNOSTIC_HEADER, `armed; cache=${observable}`);
  // L1 headers: harmless even though the outer layer rewrites Cache-Control
  // (measured); if a future zone config honors them the script drops off the
  // hot path entirely. A Set-Cookie response is labeled private so neither
  // this cache nor an honoring CDN treats it as shared.
  if (hasVisitorSetCookie) {
    response.headers.set("Cache-Control", "private, no-store");
  } else {
    applyEdgeCacheHeaders(response, key.pathname, env);
  }
  // "uncacheable" is exactly {200-that-isn't-cacheable} u {every non-200
  // that isn't 404} — the negative class (404) is a cacheClass of its own and
  // rides this same store, which is the whole point: the negative is where
  // the repeat-request render cost actually is (measured on the live edge,
  // 4/4 MISS at 127-287 ms per 404).
  if (cache !== undefined && isGet && cacheClass !== "uncacheable" && !hasVisitorSetCookie) {
    try {
      const stored = response.clone();
      stored.headers.set("X-Decko-Stored-At", String(Date.now()));
      // The STORED copy carries a positive max-age: the Cache API honors
      // standard Cache-Control directives, and max-age=0 (the client-facing
      // shape) is expired-on-arrival — measured as a silent no-store. The
      // client-facing response keeps the L1 max-age=0 + s-maxage shape; only
      // the cache's copy lives this long.
      stored.headers.set(
        "Cache-Control",
        `public, max-age=${storeTtl}, s-maxage=${storeTtl}`,
      );
      await cache.put(key, stored);
      response.headers.set(DIAGNOSTIC_HEADER, `armed; cache=miss+stored; ttl=${storeTtl}`);
    } catch (error) {
      // A failed put must not fail the request — but the reason is visible
      // in the diagnostic header (repeated plain misses on the same URL are
      // the live symptom of a storage-layer drop, e.g. a zone policy).
      const message = String(error instanceof Error ? error.message : error).slice(0, 80);
      response.headers.set(DIAGNOSTIC_HEADER, `armed; cache=miss; store-error=${message}`);
    }
  } else if (cache !== undefined && isGet && hasVisitorSetCookie && response.status === 200) {
    // The skip is observable, in the shape the CF worker's cache uses for the
    // same decision (worker-edge-cache.ts shareable).
    response.headers.set(DIAGNOSTIC_HEADER, "armed; cache=miss; not-stored");
  }
  return response;
}

/** Exported for the tests: the exact header name the live behavior is
 *  asserted through. */
export const EDGE_CACHE_DIAGNOSTIC_HEADER = DIAGNOSTIC_HEADER;
export const EDGE_CACHE_DEFAULT_TTL = DEFAULT_EDGE_CACHE_TTL_SECONDS;
