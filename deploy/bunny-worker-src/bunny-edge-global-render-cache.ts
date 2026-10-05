// deploy/bunny-worker-src/bunny-edge-global-render-cache.ts — the L3 GLOBAL
// rendered-HTML tier behind the L2 regional Cache API (edge-speed-global-cache
// lane, 2026-10-03).
//
// WHY L3 EXISTS (measured + documented, not assumed): the L2 script cache
// (bunny-edge-content-cache.ts) rides Bunny's Cache API, and Bunny documents
// that "cache contents do not replicate outside the originating region"
// (bunny.net/docs/scripting/cache — caching-research-fetched/
// bunny-scripting-cache-index.md). A cold render on this edge is ~1,000-1,150
// serial DB hops and measures 7.2-17.3 s wall (edge-incident-fix receipts,
// 2026-10-02/03), so a FIRST-TIME visitor in any region the crawl did not
// fill pays the full cold render no matter how thoroughly the region that
// ran the crawl is warmed. The bar this lane serves — a first-time visitor's
// FIRST hit on ANY public page at TTFB <= ~1.5 s — therefore needs a tier
// every region reads: rendered public HTML stored in the trial BunnyDB,
// reachable from every isolate over the SAME Hrana-v2 pipeline POST the
// deck's own driver already speaks (src/card/drivers/bunny-db.ts), where a
// healthy edge->DB hop measures ~11 ms (1,151 hops in ~13 s, live).
//
// REQUEST PATH (as wired in bunny-edge-engine-entry.ts, anon call sites
// only): L2 match (regional, fast) -> miss -> L3 lookup (ONE pipeline POST,
// bounded 1,500 ms) -> hit: serve stored bytes with the same anon L1 cache
// shape the render path emits (the L2 layer above then also warms the local
// region with them) -> miss: render, write-through (INSERT upsert + old-epoch
// cleanup in ONE pipeline POST), serve. Any L3 error degrades to the plain
// render — the tier can only add speed, never break a request.
//
// CACHE KEY: the request URL, verbatim (url.href — same verbatim-URL rule
// the L2 uses; query-string variants are distinct entries). The epoch rides
// as a COLUMN filter, not in the key, so every epoch bump (the proven
// atomic pattern: zone purgeCache + DECKO_EDGE_CACHE_EPOCH variable bump —
// the same variable the L2 names its regional caches with) invalidates every
// entry in ONE variable update with no deletes: lookups simply filter to the
// new epoch and the old rows become dead weight until the write path's
// monotonic cleanup (DELETE ... WHERE epoch < current, piggybacked on the
// same pipeline POST as every store) reaps them.
//
// WHO NEVER TOUCHES THIS TIER: signed-in traffic. The entry applies this
// wrapper at the two ANONYMOUS render call sites only — the no-cookie path
// and the cookie-that-does-not-resolve path (whose bytes are the anonymous
// bytes); the per-viewer call site passes `perViewer: true` to the L2 and
// never reaches this module. Every row in the tier was written by an
// anonymous render, so every hit is safe to serve to every anonymous
// visitor. POSTs are answered (or 403'd) before the render path; /_status
// and every non-200 are "uncacheable" by the same edgeRouteCacheClass the
// L2 uses, so they are neither stored nor served from here.
//
// OBSERVABILITY: armed responses carry `X-Decko-Edge-Global-Cache` with the
// decision (hit / miss / miss+stored / miss; store-error=... /
// lookup-error=... / bypass-method) plus `X-Decko-Global-Age-Seconds` on
// hits. Unarmed responses carry nothing — byte-identical pass-through, the
// same contract the L2 module keeps.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import {
  edgeCacheTtlSeconds,
  edgeRouteCacheClass,
} from "./bunny-edge-cache-headers.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the sibling modules. */
type EdgeEnv = Record<string, string | undefined>;

/** The flag arms the tier. Strict "1" — the same convention DECKO_EDGE_CACHE
 *  and DECKO_WRITE_PATH use, so "true"/"yes" do NOT arm by accident. */
export const EDGE_GLOBAL_CACHE_ENV_VAR = "DECKO_EDGE_GLOBAL_CACHE";

/** The epoch variable — SHARED with the L2 (bunny-edge-content-cache.ts
 *  names its regional caches `decko-content:v<epoch>` with it). One bump
 *  invalidates both tiers; the sync/deploy procedure owns the bump. */
export const EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR = "DECKO_EDGE_CACHE_EPOCH";

/** Diagnostic header carrying the tier decision (see the module header). */
export const EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER = "X-Decko-Edge-Global-Cache";

/** Age stamp on hits, seconds since the row was stored. Measurement only. */
export const EDGE_GLOBAL_CACHE_AGE_HEADER = "X-Decko-Global-Age-Seconds";

/** The tier table. Created on the trial DB ahead of the deploy (edge-speed-
 *  global-cache-lane receipt) AND lazily self-healed here: a store that
 *  fails with "no such table" runs the CREATE once and retries once, so a
 *  fresh database needs zero operator steps. */
export const GLOBAL_RENDER_CACHE_TABLE = "decko_edge_render_cache";

export const GLOBAL_RENDER_CACHE_CREATE_SQL =
  `CREATE TABLE IF NOT EXISTS ${GLOBAL_RENDER_CACHE_TABLE} ` +
  `(url TEXT PRIMARY KEY, epoch INTEGER NOT NULL, content_type TEXT NOT NULL, ` +
  `body TEXT NOT NULL, stored_at INTEGER NOT NULL)`;

export const GLOBAL_RENDER_CACHE_LOOKUP_SQL =
  `SELECT content_type, body, stored_at FROM ${GLOBAL_RENDER_CACHE_TABLE} ` +
  `WHERE url = ? AND epoch = ?`;

export const GLOBAL_RENDER_CACHE_STORE_SQL =
  `INSERT INTO ${GLOBAL_RENDER_CACHE_TABLE} ` +
  `(url, epoch, content_type, body, stored_at) VALUES (?, ?, ?, ?, ?) ` +
  `ON CONFLICT(url) DO UPDATE SET epoch = excluded.epoch, ` +
  `content_type = excluded.content_type, body = excluded.body, ` +
  `stored_at = excluded.stored_at`;

/** Monotonic old-epoch reap, piggybacked on the SAME pipeline POST as every
 *  store (one extra statement, zero extra round trips). Strictly `<` so a
 *  late write under a stale epoch can never reap the CURRENT epoch's rows. */
export const GLOBAL_RENDER_CACHE_CLEANUP_SQL =
  `DELETE FROM ${GLOBAL_RENDER_CACHE_TABLE} WHERE epoch < ?`;

/** Hard bound on the tier's own added latency. A hit costing more than this
 *  is useless (the bar is ~1.5 s TTFB), so a lookup that cannot finish fast
 *  is abandoned and the render takes over. The driver's own 15 s bound stays
 *  as the backstop for the deck's ~1,000 render hops — this bound is for the
 *  ONE hop the tier adds. */
export const GLOBAL_RENDER_CACHE_LOOKUP_TIMEOUT_MS = 1_500;

/** Bound on the awaited write-through. A cold render already spent 7-17 s;
 *  the first visitor can donate up to this much to make every later visitor
 *  worldwide fast, and never more. */
export const GLOBAL_RENDER_CACHE_STORE_TIMEOUT_MS = 3_000;

export function globalRenderCacheArmed(env: EdgeEnv): boolean {
  return env[EDGE_GLOBAL_CACHE_ENV_VAR] === "1";
}

/** The epoch to read/write under. Same resolution rule the L2 uses: absent,
 *  non-integer, or < 0 means 0 (shared with the L2's caches.default era). */
export function globalCacheEpoch(env: EdgeEnv): number {
  const raw = Number(env[EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR] ?? "0");
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

/** One row of the tier. */
export interface GlobalRenderHit {
  contentType: string;
  body: string;
  storedAt: number;
}

/** The tier client. One per isolate (the deck's own pattern): wraps a
 *  BunnyDbDriver tuned for ONE fast hop — no retries (a retried lookup
 *  doubles the stall before the render takes over; the store is best-effort
 *  by design), timeout at the tier bounds above, injectable fetch for the
 *  offline tests. */
export class GlobalRenderCache {
  /** The lookup driver: ONE fast hop, no retry (a retried lookup doubles the
   *  stall before the render takes over). */
  private readonly lookupDriver: BunnyDbDriver;
  /** The store driver: its own, larger bound — the write carries the whole
   *  rendered page (up to ~110 KB measured on the heavy cards) and must not
   *  be cut off by the tighter lookup bound. */
  private readonly storeDriver: BunnyDbDriver;
  private readonly now: () => number;
  private tableEnsured = false;

  constructor(
    private readonly config: { url: string; authToken: string },
    options?: { fetchImpl?: typeof fetch; now?: () => number },
  ) {
    const driverOptions = {
      url: config.url,
      authToken: config.authToken,
      retries: 0,
      fetchImpl: options?.fetchImpl,
    };
    this.lookupDriver = new BunnyDbDriver({
      ...driverOptions,
      timeoutMs: GLOBAL_RENDER_CACHE_LOOKUP_TIMEOUT_MS,
    });
    this.storeDriver = new BunnyDbDriver({
      ...driverOptions,
      timeoutMs: GLOBAL_RENDER_CACHE_STORE_TIMEOUT_MS,
    });
    this.now = options?.now ?? (() => Date.now());
  }

  /** ONE pipeline POST. Returns undefined on a miss; throws on transport or
   *  protocol failure (the wrapper catches and labels, the render takes
   *  over). */
  async lookup(url: string, epoch: number): Promise<GlobalRenderHit | undefined> {
    const result = await this.lookupDriver.query<{
      content_type: unknown;
      body: unknown;
      stored_at: unknown;
    }>(GLOBAL_RENDER_CACHE_LOOKUP_SQL, [url, epoch]);
    const row = result.rows[0];
    if (row === undefined || typeof row.body !== "string") return undefined;
    return {
      contentType: typeof row.content_type === "string" ? row.content_type : "text/html; charset=utf-8",
      body: row.body,
      storedAt: Number(row.stored_at) || 0,
    };
  }

  /** Write-through: the store and the old-epoch cleanup ride ONE pipeline
   *  POST. Self-heals a missing table once per instance. Throws on failure
   *  (the wrapper catches and labels). */
  async store(url: string, epoch: number, contentType: string, body: string): Promise<void> {
    try {
      await this.storePipeline(url, epoch, contentType, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such table/i.test(message) || this.tableEnsured) throw error;
      // The table is missing (fresh/rotated database): create it once and
      // retry the write exactly once.
      this.tableEnsured = true;
      await this.storeDriver.batch([{ sql: GLOBAL_RENDER_CACHE_CREATE_SQL, params: [] }]);
      await this.storePipeline(url, epoch, contentType, body);
    }
  }

  private async storePipeline(url: string, epoch: number, contentType: string, body: string): Promise<void> {
    await this.storeDriver.batch([
      { sql: GLOBAL_RENDER_CACHE_STORE_SQL, params: [url, epoch, contentType, body, this.now()] },
      { sql: GLOBAL_RENDER_CACHE_CLEANUP_SQL, params: [epoch] },
    ]);
  }
}

/** Resolve the tier client for this isolate. Undefined unless the flag is
 *  armed AND the database credentials resolved — the same config the deck
 *  boots from, so the tier adds no new credential surface. Memoized like
 *  deckPromise: the config is stable within an isolate. */
let globalRenderCacheInstance: GlobalRenderCache | undefined;

export function getGlobalRenderCache(
  env: EdgeEnv,
  config: { url: string; authToken: string } | { error: string },
): GlobalRenderCache | undefined {
  if (!globalRenderCacheArmed(env)) return undefined;
  if ("error" in config) return undefined;
  if (globalRenderCacheInstance === undefined) {
    globalRenderCacheInstance = new GlobalRenderCache({
      url: config.url,
      authToken: config.authToken,
    });
  }
  return globalRenderCacheInstance;
}

/** Test seam: reset the memoized instance (isolate-bound state must not leak
 *  across tests). */
export function resetGlobalRenderCacheForTests(): void {
  globalRenderCacheInstance = undefined;
}

/** Wrap an anonymous render with the tier. Returned closure contract is
 *  exactly the render closure `serveWithEdgeCache` takes, so the entry's two
 *  anon call sites wrap their existing closures verbatim. Undefined cache
 *  (disarmed / no creds): the inner render, byte-identical, no header, no
 *  tier contact. */
export function withGlobalRenderCache(
  request: Request,
  env: EdgeEnv,
  cache: GlobalRenderCache | undefined,
  render: () => Promise<Response>,
): () => Promise<Response> {
  return async () => {
    if (cache === undefined) return render();

    const url = new URL(request.url);
    const setDiagnostic = (response: Response, value: string): void => {
      try {
        response.headers.set(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER, value);
      } catch {
        /* an immutable-header runtime must not turn a served page into a 500
           over a label */
      }
    };

    if (request.method !== "GET") {
      const response = await render();
      setDiagnostic(response, "bypass-method");
      return response;
    }

    const epoch = globalCacheEpoch(env);
    try {
      const hit = await cache.lookup(url.href, epoch);
      if (hit !== undefined) {
        const response = new Response(hit.body, {
          status: 200,
          headers: {
            "Content-Type": hit.contentType,
            // The L1 anon shape (bunny-edge-cache-headers.ts): browsers
            // revalidate (max-age=0), the CDN edge reuses (s-maxage). The
            // same value the render path emits for this route.
            "Cache-Control": `public, max-age=0, s-maxage=${edgeCacheTtlSeconds(env)}`,
          },
        });
        setDiagnostic(response, "hit");
        if (hit.storedAt > 0) {
          try {
            response.headers.set(
              EDGE_GLOBAL_CACHE_AGE_HEADER,
              String(Math.max(0, Math.round((Date.now() - hit.storedAt) / 1000))),
            );
          } catch {
            /* label only */
          }
        }
        return response;
      }
    } catch (error) {
      const response = await render();
      const message = String(error instanceof Error ? error.message : error).slice(0, 80);
      setDiagnostic(response, `lookup-error=${message}`);
      return response;
    }

    const response = await render();
    const cacheClass = edgeRouteCacheClass(url.pathname, response.status);
    if (response.status !== 200 || cacheClass === "uncacheable") {
      setDiagnostic(response, `miss; store=skip-${response.status === 200 ? cacheClass : response.status}`);
      return response;
    }
    let body: string;
    try {
      body = await response.clone().text();
    } catch {
      setDiagnostic(response, "miss; store-error=body-unreadable");
      return response;
    }
    const contentType = response.headers.get("Content-Type") ?? "text/html; charset=utf-8";
    try {
      await cache.store(url.href, epoch, contentType, body);
      setDiagnostic(response, "miss+stored");
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 80);
      setDiagnostic(response, `miss; store-error=${message}`);
    }
    return response;
  };
}
