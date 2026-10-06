// THE CONFIG-GATED RENDER-PATH WIRING for the one-trip payload
// (one-trip-integration lane, 2026-10-03).
//
// Default OFF: the deployed render path is byte-for-byte unchanged unless
// the operator sets DECKO_ONE_TRIP=1. When the gate is ON, a page render
// consumes the one-trip payload BEFORE the normal path runs: the derived
// store (built by closure-builder.ts, precompute — never at render time)
// is ATTACHed once per driver connection, the page's whole working set is
// fetched in EXACTLY ONE round trip (one-trip-fetch.ts), and the rows are
// seated into the fetch cache with ZERO further round trips
// (page-bundle-adapter.ts through the waves' composeAndCacheSqlRows). The
// render then proceeds through its unchanged path; its remaining queries
// are exactly the named residue classes (render-plan.ts).
//
// Graceful degradation is part of the contract: with the gate ON but no
// store path configured, an absent store file, or a page the store cannot
// describe, the wiring is inert for that render and the normal path runs
// (the payload is an optimization, never a correctness dependency —
// negatives are expressed by absence, SPEC §4).
//
// Seating is memoized per engine (fetcher) per page key: a warm re-render
// of the same page does not pay the payload trip again (the hops law's
// warm-render rule applies to the wired posture too).
//
// A2 note: this module is SERVING-side. It reads the derived store only
// through the one-trip fetch (read scope); it never writes it. The
// write-time recompute path's A2 isolation lives in invalidation.ts.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { FetchEngine } from "../fetch.js";
import {
  attachDerivedStore,
  DERIVED_STORE_ATTACH,
  fetchPageBundle,
  fetchPageBundleInline,
  isInlineStoreSpec,
} from "./one-trip-fetch.js";
import { replayRenderPlan } from "./render-plan.js";
import { seatPageBundle } from "./page-bundle-adapter.js";

/** The config gate. Default OFF: no env var, no payload, zero new trips,
 *  zero new statements — the deployed default this lane promised. */
export function oneTripWantsPayload(): boolean {
  return process.env.DECKO_ONE_TRIP === "1";
}

/** Where the derived store lives. Required when the gate is ON; the store
 *  is a precompute artifact (closure-builder.ts), never built lazily here
 *  (a 30s-class build must never hide behind a page render). The value is a
 *  side-store PATH, or the `inline` sentinel (ONE_TRIP_STORE_INLINE): the
 *  materialized shape — the one_trip_* tables IN the serving database. The
 *  sentinel is load-bearing on the serving DB: its SQL parser rejects ATTACH
 *  for ANY value (observed verbatim 2026-10-05, SQL_PARSE_ERROR —
 *  cold-latency-rig-lane.md MATERIALIZED-STORE §6.1), and its per-value size
 *  limit rejects the single-row bundle for template-scale pages (§6.3), so
 *  the inline posture skips the ATTACH entirely and fetches the one_trip_*
 *  tables UNQUALIFIED on the same connection, in bounded chunks assembled
 *  byte-equal to the single-row document (one-trip-fetch.ts). */
function oneTripStorePath(): string | undefined {
  return process.env.DECKO_ONE_TRIP_STORE;
}

/** Per-driver ATTACH memo: the store attaches once per connection (the
 *  attach is connection setup — the harness classifies it the same way). */
const attachedDrivers = new WeakMap<object, true>();

/** Per-engine seating memo: page key -> seated (or permanently unavailable
 *  on this engine — a store that appears mid-engine requires a re-boot,
 *  which keeps the failure mode honest and the warm path at zero). */
const seatedPages = new WeakMap<FetchEngine, Set<string>>();

/**
 * Drop the seating memo for one fetcher (the freshness composition,
 * per-viewer-seat lane 2026-10-06): a moved deck_data_version stamp means
 * every seated page's snapshot and every armed plan's in-memory results
 * predate the current deck state. The render's freshness gate calls this
 * alongside resetCaches() and replayRouter.disarmRenderPlan() so the next
 * render RE-SEATS — a fresh bundle fetch plus a fresh plan replay from the
 * store as it now stands — instead of answering from pre-move state.
 * Memoize-before-trying semantics are preserved: a page whose seat FAILED
 * re-tries only after the next stamp move, never within a warm session.
 */
export function invalidateSeatedPagePayloads(fetcher: FetchEngine): void {
  seatedPages.delete(fetcher);
}

let warnedMisconfiguration = false;

/**
 * Seat the page's one-trip payload if (and only if) the gate is ON and the
 * store can serve it. Called at the top of RenderEngine.render — the
 * render's own first read (fetchByName) then answers from the seated
 * cache. NEVER throws into the render path: every failure mode falls back
 * to the unchanged normal path.
 */
export async function seatOneTripPayloadForRender(
  pageName: string,
  fetcher: FetchEngine,
): Promise<void> {
  if (!oneTripWantsPayload()) return;
  const storePath = oneTripStorePath();
  if (storePath === undefined || storePath === "") {
    if (!warnedMisconfiguration) {
      warnedMisconfiguration = true;
      console.warn(
        "DECKO_ONE_TRIP=1 but DECKO_ONE_TRIP_STORE is not set — the one-trip payload is inert " +
          "(the normal render path runs).",
      );
    }
    return;
  }

  let seated = seatedPages.get(fetcher);
  if (seated === undefined) {
    seated = new Set<string>();
    seatedPages.set(fetcher, seated);
  }
  if (seated.has(pageName)) return;
  seated.add(pageName); // memoize before trying: a failed seat stays failed for this engine

    // The SEAT's driver is the router's BASE (the real connection): the
    // attach memo keys on it, and the plan replay — the arming source —
    // must execute live, never consult the map it is building. The RENDER
    // path, by contrast, flows through fetcher.driver (the router) and is
    // where the armed plan answers reads.
    const driver: SQLDatabaseDriver = fetcher.replayRouter.base;
    const inlineStore = isInlineStoreSpec(storePath);
    try {
      if (!inlineStore && !attachedDrivers.has(driver)) {
        await attachDerivedStore(driver, storePath, DERIVED_STORE_ATTACH);
        attachedDrivers.set(driver, true);
      }
      const bundle = inlineStore
        ? await fetchPageBundleInline(driver, pageName)
        : await fetchPageBundle(driver, pageName, DERIVED_STORE_ATTACH);
      // seatPageBundle's render parameter is unused (fetch-cache seating
      // only — see page-bundle-adapter.ts); the fetcher satisfies the
      // structural RenderEngineLike.
      await seatPageBundle(fetcher, fetcher, bundle);
      // THE RENDERPLAN REPLAY (renderplan-replay lane): the inline fetch
      // carried the page's pre-computed render plan (one_trip_render_plans,
      // read inside the seat's head — no extra trip). Replay it as ONE
      // batch and arm the engine's driver seam: every subsequent render
      // statement whose (sql, params) matches a plan entry is answered
      // from the plan's result set with zero round trips; misses (the
      // order-dependent search-count, differently-bound reads) go live.
      // The engine's own record/replay contract (render-plan.ts); a failed
      // replay leaves the router unarmed — the live path stays
      // authoritative.
      const plan = bundle.renderPlan;
      if (plan !== undefined && plan.entries.length > 0) {
        const results = await replayRenderPlan(driver, plan);
        fetcher.replayRouter.armRenderPlan(plan.entries, results);
      }
    } catch {
      // Graceful degradation (SPEC §3.3): an absent store, an unbuildable
      // attach, or an undescribable page leaves the render on its unchanged
      // path. The memo above keeps the fallback free on re-renders.
    }
}
