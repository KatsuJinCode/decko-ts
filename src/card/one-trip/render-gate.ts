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

import type { SQLDatabaseDriver, SQLQueryResult } from "../../server/driver.js";
import type { FetchEngine } from "../fetch.js";
import {
  attachDerivedStore,
  DERIVED_STORE_ATTACH,
  fetchPageBundle,
  fetchPageBundleInlineParts,
  inlineBundleFromParts,
  isInlineStoreSpec,
} from "./one-trip-fetch.js";
import { replayRenderPlanWithIndex } from "./render-plan.js";
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

/** The freshness context the render entry hands the seat (stamp-as-column
 *  lane, 2026-10-06, spec §c): the engine's last-seen committed-write
 *  version and the stamp-move branch. The seat's HEAD statement reads
 *  deck_data_version in the SAME statement as the payload — current-at-read,
 *  one snapshot, consistent by construction — so the seat is the render
 *  path's stamp reader on this posture, and the move branch runs HERE,
 *  BEFORE anything from the payload is seated (a moved stamp recomposes;
 *  it never seats pre-move rows and never discards a payload seated moments
 *  earlier). */
export interface OneTripSeatFreshness {
  /** The engine's last-seen deck_data_version; undefined = first render
   *  (nothing to compare, nothing to protect — the baseline arms from the
   *  head's column). */
  readonly lastSeenVersion: number | undefined;
  /** The stamp-move branch: reset every derived cache, disarm the armed
   *  plan, invalidate the seat memo, re-prime the boot state, adopt the new
   *  baseline. Called at most once per seat. */
  onStampMove(observed: number): Promise<void>;
}

/** What the seat reports to the render entry. `deckDataVersion` is the
 *  head's live stamp column — present ONLY when this call fetched the head
 *  (a memo hit fetches nothing and reports undefined, so the gate falls
 *  back to its own live read; a memo hit's stored stamp is seat-time state,
 *  never current-at-read). `permissionGateRows` is the head's gate-count
 *  column, parsed into the batch-result shape (spec §a.4's zero-bind arm). */
export interface OneTripSeatResult {
  readonly seatedNow: boolean;
  readonly deckDataVersion: number | undefined;
  readonly permissionGateRows: SQLQueryResult | undefined;
}

let warnedMisconfiguration = false;

/**
 * Seat the page's one-trip payload if (and only if) the gate is ON and the
 * store can serve it. Called at the top of RenderEngine.render — BEFORE the
 * freshness gate since the stamp-as-column lane: the head IS the render's
 * stamp read on this posture. The render's own first read (fetchByName)
 * then answers from the seated cache. NEVER throws into the render path:
 * every failure mode falls back to the unchanged normal path.
 */
export async function seatOneTripPayloadForRender(
  pageName: string,
  fetcher: FetchEngine,
  freshness?: OneTripSeatFreshness,
): Promise<OneTripSeatResult> {
  const none: OneTripSeatResult = {
    seatedNow: false,
    deckDataVersion: undefined,
    permissionGateRows: undefined,
  };
  if (!oneTripWantsPayload()) return none;
  const storePath = oneTripStorePath();
  if (storePath === undefined || storePath === "") {
    if (!warnedMisconfiguration) {
      warnedMisconfiguration = true;
      console.warn(
        "DECKO_ONE_TRIP=1 but DECKO_ONE_TRIP_STORE is not set — the one-trip payload is inert " +
          "(the normal render path runs).",
      );
    }
    return none;
  }

  let seated = seatedPages.get(fetcher);
  if (seated === undefined) {
    seated = new Set<string>();
    seatedPages.set(fetcher, seated);
  }
  if (seated.has(pageName)) return none;
  seated.add(pageName); // memoize before trying: a failed seat stays failed for this engine

  // The SEAT's driver is the router's BASE (the real connection): the
  // attach memo keys on it, and the plan replay — the arming source —
  // must execute live, never consult the map it is building. The RENDER
  // path, by contrast, flows through fetcher.driver (the router) and is
  // where the armed plan answers reads. The head's stamp column is read
  // HERE for the same reason: current-at-read from the deck itself, never
  // from the armed map (the stamp-read-vs-plan contract).
  const driver: SQLDatabaseDriver = fetcher.replayRouter.base;
  const inlineStore = isInlineStoreSpec(storePath);
  try {
    if (!inlineStore && !attachedDrivers.has(driver)) {
      await attachDerivedStore(driver, storePath, DERIVED_STORE_ATTACH);
      attachedDrivers.set(driver, true);
    }
    // The INLINE posture fetches parts once: the assembled bundle AND
    // the head's gate columns (stamp + gate count — the seat's zero-trip
    // gate reads). The ATTACHED posture (the side-store shape, local
    // lanes only) carries no gate columns — its head statement does not
    // have them — so gateMeta stays undefined and the render entry falls
    // back to its own live reads.
    let bundle: import("./types.js").PageBundle;
    let plan: import("./render-plan.js").RenderPlan | undefined;
    let gateMeta: import("./one-trip-fetch.js").InlineHeadGateMeta | undefined;
    if (inlineStore) {
      const parts = await fetchPageBundleInlineParts(driver, pageName);
      bundle = inlineBundleFromParts(parts.raw, pageName, parts.plan);
      plan = parts.plan;
      gateMeta = parts.gateMeta;
    } else {
      bundle = await fetchPageBundle(driver, pageName, DERIVED_STORE_ATTACH);
      plan = bundle.renderPlan;
    }
    // THE STAMP-MOVE BRANCH (spec §c): the head's column vs the engine's
    // last-seen version, compared BEFORE seating anything from the
    // payload. On a move the render's reset runs (every derived cache,
    // the armed plan, the seat memo, the boot state) and the new
    // baseline is adopted; the seat then completes with the in-hand
    // head — which was read at the CURRENT stamp (the write committed
    // before this render's first read), so the recomposed payload is
    // post-move state. The memo wipe inside the callback removed this
    // seat's memo entry; it is re-established below with the same
    // memoize-before-trying semantics.
    if (
      freshness !== undefined &&
      freshness.lastSeenVersion !== undefined &&
      gateMeta?.deckDataVersion !== undefined &&
      gateMeta.deckDataVersion !== freshness.lastSeenVersion
    ) {
      await freshness.onStampMove(gateMeta.deckDataVersion);
      seated = seatedPages.get(fetcher) ?? new Set<string>();
      seatedPages.set(fetcher, seated);
      seated.add(pageName);
    }
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
    if (plan === undefined) plan = bundle.renderPlan;
    if (plan !== undefined && plan.entries.length > 0) {
      // THE DRIFT ARM INDEX rides the same replay (driftfix lane): the
      // per-bind-value answer index for the drift classes, built from the
      // very results this replay arms. A drifted IN-list ask (mid-flight
      // cache evolution regrouped the binds) composes its answer from the
      // index instead of riding live; uncovered asks stay live — the live
      // path stays authoritative exactly as the exact-map contract keeps.
      const { results, index } = await replayRenderPlanWithIndex(driver, plan);
      fetcher.replayRouter.armRenderPlan(plan.entries, results, index);
    }
    return {
      seatedNow: true,
      deckDataVersion: gateMeta?.deckDataVersion,
      permissionGateRows: gateMeta?.permissionGateRows,
    };
  } catch {
    // Graceful degradation (SPEC §3.3): an absent store, an unbuildable
    // attach, or an undescribable page leaves the render on its unchanged
    // path. The memo above keeps the fallback free on re-renders.
    return none;
  }
}
