// src/card/live/live-render.ts
//
// THE REQUEST-LOCAL PAGE RENDER: one anonymous GET page, rendered uncached
// over a request store (live-store-driver.ts), in a handful of batched round
// trips instead of hundreds one after another. Nothing is recorded, planned
// or kept between requests: the store, the passes' engines, the seeds and the
// automatic choice are locals of one call, the process-wide boot bundle is
// dropped before every pass and after the request, and the name memos live
// in this request's scope only.
//
// How a page is found:
//
//   COLLECT MODE. The reference-chasing warm-ups are off. Each pass renders
//   on a FRESH engine and records every card its synchronous render asked
//   for and did not have (RenderEngine.demandRecorder); reads the store
//   cannot answer get a speculative "no rows" and are fetched, all at once,
//   in ONE round trip after the pass. The next pass prepares the recorded
//   cards up front (RenderEngine.demandSeeds).
//
//   AUTOMATIC CHOICE (off by default). When collect pass 2 records more than
//   autoThreshold questions the request switches to full speculation
//   (warm-up chase on, fresh engine per pass, no seeds); with autoTail on,
//   once a speculative pass records at most autoTail reads and no new card,
//   the next pass blocks on its reads instead.
//
//   LAZY STRUCTURE REFERENCES. Every pass substitutes *structure templates
//   but does not chase the cards their content references
//   (RenderEngine.skipStructureRefWalks). A render that reads one of those
//   cards records the question; the next pass prepares it.
//
//   COMPLETION RULE. The page is the first pass that consumed no speculative
//   answer and asked for no unprepared card: every answer it read was
//   storage's own, so its bytes are the bytes today's engine renders. A
//   discovery miss costs a pass and a trip, never a byte.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { RenderEngine } from "../render.js";
import type { HistoryRenderParams } from "../history/render-seam.js";
import { renderPageBytes } from "../render/page.js";
import { resetBootCache } from "../render/boot-cache.js";
import { DeckoName } from "../name.js";
import { LiveRenderAborted, LiveStoreDriver, type LiveStoreStats } from "./live-store-driver.js";

export { LiveRenderAborted };

/** Boots a fresh render engine over the given driver (the edge's serving
 *  boot). Called once per pass. */
export type LiveEngineBoot = (driver: SQLDatabaseDriver) => Promise<{ render: RenderEngine }>;

export interface LiveRenderOptions {
  requestedView?: string;
  historyParams?: HistoryRenderParams;
  /** Collect pass 2 recording more than this many questions switches the
   *  request to full speculation. Unset here means never switch, so the choice
   *  stays with the caller; env DECKO_LIVE_AUTO_THRESHOLD overrides. */
  autoThreshold?: number;
  /** In the speculation branch: a pass recording at most this many reads
   *  makes the next pass block on them. Unset here means no blocking tail;
   *  env DECKO_LIVE_AUTO_TAIL overrides. */
  autoTail?: number;
  /** Blocking round trips a tail pass may pay before it turns speculative
   *  (default: no limit). */
  autoTailTrips?: number;
  /** Incremental discovery: one engine serves the discovery passes, fresh
   *  engines render the page (env DECKO_LIVE_INCREMENTAL=1). */
  incremental?: boolean;
  /** Re-runs the boot's data-dependent steps on the kept discovery engine
   *  before each of its passes (bunny-edge-deck-boot.ts
   *  refreshEdgeServingEngines). Incremental discovery runs only with it. */
  refreshDiscoveryEngine?: (driver: SQLDatabaseDriver, render: RenderEngine) => Promise<void>;
  /** Expand each trip's ring around every fetched row (LiveStoreDriver
   *  ringAll). */
  ringAll?: boolean;
  /** Aborted when the request's budget fires (bunny-edge-engine-request.ts
   *  withBudget): the render stops before its next pass or round trip and
   *  throws LiveRenderAborted, so an abandoned request sends no more
   *  statements. */
  signal?: AbortSignal;
}

export interface LivePassReport {
  pass: number;
  kind: "spec" | "final" | "disc";
  cpu_ms: number;
  recorded: number;
}

export interface LiveRenderResult {
  html: string;
  /** The page's HTTP status, from the final pass's engine (Ruby's
   *  root.error_status: 403 for a read-denied main card), else 200. */
  status: number;
  stats: LiveStoreStats;
  passes: LivePassReport[];
  choice: "collect" | "speculate";
}

const MAX_PASSES = 40;

async function renderPass(
  live: LiveStoreDriver,
  boot: LiveEngineBoot,
  page: string,
  opts: LiveRenderOptions,
  collect: { seeds: Set<string>; asked: Set<string> } | undefined,
  skipSync: (() => boolean) | undefined,
  lazy: { asked: Set<string>; eager: ReadonlySet<string> } | undefined,
  deniedRootKey: string | undefined,
  out: { engine?: RenderEngine },
  discovery?: { engine: RenderEngine | undefined; level: number; sweepAll: boolean; onBoot: (e: RenderEngine) => void },
): Promise<string> {
  // A FRESH engine per pass: a speculative pass's engine saw zero-row
  // answers and is discarded; only the store (real rows) carries over.
  // Incremental discovery instead reuses one engine across its passes,
  // dropping its provisional state (RenderEngine.clearProvisionalState).
  let render: RenderEngine;
  if (discovery?.engine !== undefined) {
    render = discovery.engine;
    resetBootCache();
    render.clearProvisionalState(discovery.level);
    await opts.refreshDiscoveryEngine?.(live, render);
  } else {
    resetBootCache();
    render = (await boot(live)).render;
    discovery?.onBoot(render);
  }
  if (discovery !== undefined) render.sweepAllHeldCards = discovery.sweepAll;
  out.engine = render;
  render.liveRequest = true;
  if (collect !== undefined) {
    render.warmupChaseOff = true;
    render.demandSeeds = [...collect.seeds];
    render.demandRecorder = collect.asked;
    // Collect passes skip the prepare walks of a read-denied root (its hidden
    // body's items and links are never rendered).
    render.skipDeniedRootWalks = true;
    // Junction sides the demand-seed warm-up composes through are prepared,
    // not scanned: scanning them chased their whole content closure, one
    // level per pass (DECKO_LIVE_SIDES_SCAN=1 restores it).
    if (deniedRootKey !== undefined) {
      render.skipRootClosureWalk = true;
      render.skipRootClosureKey = deniedRootKey;
    }
    render.warmupSidesUnscanned = !(typeof process !== "undefined" && process.env?.DECKO_LIVE_SIDES_SCAN === "1");
  }
  if (skipSync !== undefined) render.skipSyncRender = skipSync;
  if (lazy !== undefined) {
    // Lazy structure references (RenderEngine.skipStructureRefWalks): the
    // render's questions about skipped references come back in lazy.asked;
    // the references earlier passes asked for are walked eagerly.
    render.skipStructureRefWalks = true;
    render.skippedStructureRefAsked = lazy.asked;
    render.eagerStructureRefs = lazy.eager;
  }
  return await renderPageBytes(render, page, opts.requestedView, opts.historyParams);
}

/** Render one page through the request store. `base` is the serving
 *  database driver; it sees only reads. */
export async function liveRenderPage(
  base: SQLDatabaseDriver,
  page: string,
  boot: LiveEngineBoot,
  opts: LiveRenderOptions = {},
): Promise<LiveRenderResult> {
  const env = typeof process !== "undefined" ? process.env : undefined;
  // Narrow ring by default (DECKO_LIVE_RING_ALL=1 widens it). In collect
  // mode the all-rows ring saves a few trips but fetches roughly twice the
  // rows, and the wider fetch costs more than the trips it saves.
  const ringAll = opts.ringAll ?? env?.DECKO_LIVE_RING_ALL === "1";
  // Compact result encoding: on by default (DECKO_LIVE_COMPACT=0 turns it
  // off). Ring neighbours travel WHOLE by default; DECKO_LIVE_IDENTITY_RING=1
  // sends them as identity rows. Identity rows halve a page's database
  // bytes, but they cost extra round trips, because the render then has to
  // read many of those rows whole. Which side wins depends on what a trip
  // costs against what a byte costs; against the gzip transport the driver
  // asks for, a trip dominates, so whole rows are the default.
  const live = new LiveStoreDriver(base, {
    ringAll,
    signal: opts.signal,
    compact: env?.DECKO_LIVE_COMPACT !== "0",
    identityRing: env?.DECKO_LIVE_IDENTITY_RING === "1",
  });
  const passes: LivePassReport[] = [];
  // Default: never switch, so the request stays in collect mode throughout.
  // With lazy structure references collect mode needs both the fewest trips
  // and the least CPU here, because the speculation branch's warm-up chase
  // keeps discovering site-wide link chains one level per pass.
  const threshold =
    opts.autoThreshold ??
    (env?.DECKO_LIVE_AUTO_THRESHOLD !== undefined ? Number(env.DECKO_LIVE_AUTO_THRESHOLD) : Number.POSITIVE_INFINITY);
  // Default 0, meaning no blocking tail. With lazy structure references a
  // blocking pass pays one sequential round trip per fetch-ladder step of the
  // walks it runs eagerly, which is far worse than the trips it saves.
  const tail = opts.autoTail ?? (env?.DECKO_LIVE_AUTO_TAIL !== undefined ? Number(env.DECKO_LIVE_AUTO_TAIL) : 0);
  const tailTrips = opts.autoTailTrips === undefined || opts.autoTailTrips < 0 ? undefined : opts.autoTailTrips;
  const seeds = new Set<string>();
  let choice: "collect" | "speculate" = "collect";
  let blockNext = false;
  // Lazy structure references (RenderEngine.skipStructureRefWalks; on by
  // default, DECKO_LIVE_STRUCTURE_WALKS=1 restores the eager walk).
  const lazyRefs = env?.DECKO_LIVE_STRUCTURE_WALKS !== "1";
  const eagerRefs = new Set<string>();
  // Denied root: once a collect pass has judged the page root read-denied,
  // later passes skip its inclusion-closure walk (RenderEngine
  // skipRootClosureWalk; DECKO_LIVE_DENIED_CLOSURE=1 keeps the walk).
  const skipDeniedClosure = env?.DECKO_LIVE_DENIED_CLOSURE !== "1";
  let deniedRootKey: string | undefined;
  // Incremental discovery (off by default; DECKO_LIVE_INCREMENTAL=1): one
  // engine serves the discovery passes until a pass asks nothing new; then
  // fresh engines take over under the completion rule, so the page is still
  // the first fresh pass that consumed no speculative answer.
  const incremental =
    opts.refreshDiscoveryEngine !== undefined && (opts.incremental ?? env?.DECKO_LIVE_INCREMENTAL === "1");
  const incLevel = env?.DECKO_LIVE_INCREMENTAL_LEVEL !== undefined ? Number(env.DECKO_LIVE_INCREMENTAL_LEVEL) : 2;
  const incSweepAll = env?.DECKO_LIVE_INCREMENTAL_SWEEP !== "0";
  let discovering = incremental;
  let discoveryEngine: RenderEngine | undefined;
  DeckoName.beginRequestScope();
  try {
    for (let p = 1; p <= MAX_PASSES; p += 1) {
      if (opts.signal?.aborted === true) throw new LiveRenderAborted();
      const asked = new Set<string>();
      // Diagnostics (DECKO_LIVE_TRACE_STACK): which frames asked for each
      // new card, by the first two names they asked.
      const askStacks = new Map<string, string[]>();
      if (env?.DECKO_LIVE_TRACE_STACK !== undefined) {
        const add = asked.add.bind(asked);
        asked.add = (n: string) => {
          if (!asked.has(n) && !seeds.has(n)) {
            const k = (new Error().stack ?? "").split("\n").slice(2, 12).map((l) => l.trim().replace(/^at (async )?/, "").replace(/ \(.*$/, "")).join(" < ");
            const v = askStacks.get(k) ?? [];
            v.push(n);
            askStacks.set(k, v);
          }
          return add(n);
        };
      }
      const lazyAsked = new Set<string>();
      const out: { engine?: RenderEngine } = {};
      live.mode = blockNext ? "block" : "spec";
      live.blockTrips = blockNext ? tailTrips : undefined;
      if (env?.DECKO_LIVE_TRACE_STACK !== undefined) {
        live.stackTrace = new Map();
        live.stackDepth = Number(env.DECKO_LIVE_TRACE_STACK) || 6;
      }
      const t0 = performance.now();
      let html: string | undefined;
      let threw: unknown;
      try {
        // A speculation pass that has already consumed a speculative answer
        // is not the page: its synchronous view renders are skipped (they
        // issue no reads). Collect passes keep them: the render is what
        // records their questions.
        const skipSync = choice === "speculate" ? () => live.mode === "spec" && live.pendingCount > 0 : undefined;
        html = await renderPass(
          live,
          boot,
          page,
          opts,
          choice === "collect" ? { seeds, asked } : undefined,
          skipSync,
          lazyRefs ? { asked: lazyAsked, eager: eagerRefs } : undefined,
          choice === "collect" ? deniedRootKey : undefined,
          out,
          discovering
            ? { engine: discoveryEngine, level: incLevel, sweepAll: incSweepAll, onBoot: (e) => (discoveryEngine = e) }
            : undefined,
        );
      } catch (err) {
        threw = err;
      }
      if (skipDeniedClosure && choice === "collect" && deniedRootKey === undefined && out.engine !== undefined) {
        try {
          const root = out.engine.fetchRenderCard(page);
          if (root !== undefined && out.engine.isDenied(root)) deniedRootKey = root.key;
        } catch {
          /* no verdict: keep walking */
        }
      }
      const pendingReads = live.pendingCount;
      const fresh = [...asked].filter((n) => !seeds.has(n));
      const lazyFresh = [...lazyAsked].map((n) => DeckoName.parse(n).key).filter((k) => !eagerRefs.has(k));
      const done = pendingReads === 0 && fresh.length === 0 && lazyFresh.length === 0;
      passes.push({
        pass: passes.length + 1,
        kind: discovering ? "disc" : done ? "final" : "spec",
        cpu_ms: Math.round(performance.now() - t0),
        recorded: fresh.length + lazyFresh.length + pendingReads,
      });
      if (env?.DECKO_LIVE_DEBUG === "1") {
        if (threw !== undefined) console.error(`THREW ${String((threw as Error)?.stack ?? threw).slice(0, 600)}`);
        console.error(`PASS ${passes.length} ${discovering ? "disc" : "fresh"} pending=${pendingReads} asked=${fresh.length} lazy=${lazyFresh.length} ${JSON.stringify(fresh.slice(0, 12))} ${JSON.stringify(lazyFresh.slice(0, 6))} ${JSON.stringify(live.debugPending?.().slice(0, 6) ?? [])}`);
      }
      if (discovering && done) {
        // The discovery engine asks nothing new: its bytes are not the page.
        // Fresh engines take over from here.
        discovering = false;
        discoveryEngine = undefined;
        continue;
      }
      // A tail pass that ran out of blocking trips turned speculative: the
      // tail's prediction was wrong, so go back to discovery passes.
      const tailSpent = blockNext && live.mode === "spec";
      live.blockTrips = undefined;
      if (tailSpent) blockNext = false;
      if (done) {
        if (env?.DECKO_LIVE_TRACE === "1" && html !== undefined) {
          const h = [...html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "")].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 0);
          process.stderr.write(`LIVE-TRACE-FINAL pass ${passes.length} htmlLen ${html.length} htmlHash ${h}\n`);
        }
        if (threw !== undefined) throw threw;
        return { html: html as string, status: out.engine?.pageErrorStatus ?? 200, stats: live.stats, passes, choice };
      }
      if (env?.DECKO_LIVE_TRACE === "1") {
        process.stderr.write(
          `LIVE-TRACE pass ${passes.length} ${JSON.stringify({ threw: threw === undefined ? undefined : String((threw as Error)?.stack ?? threw).slice(0, 600), htmlLen: html?.length, htmlHash: html === undefined ? undefined : [...html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "")].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 0), askStacks: [...askStacks].map(([k, v]) => [v.length, v.slice(0, 3), k]), fresh, lazyFresh, pending: live.describePending(), stacks: live.stackTrace === undefined ? undefined : [...live.stackTrace].sort((a, b) => b[1] - a[1]).slice(0, 12) })}\n`,
        );
      }
      if (choice === "speculate" && tail > 0 && !tailSpent && fresh.length + lazyFresh.length === 0 && pendingReads <= tail) blockNext = true;
      if (env?.DECKO_LIVE_SET_HINTS !== "0") live.hintSetNames(fresh);
      if (pendingReads > 0) await live.flushSpeculative();
      for (const n of fresh) seeds.add(n);
      for (const k of lazyFresh) eagerRefs.add(k);
      if (p === 2 && choice === "collect" && fresh.length + pendingReads > threshold) choice = "speculate";
    }
    throw new Error(`live render did not converge in ${MAX_PASSES} passes`);
  } finally {
    live.close();
    resetBootCache();
    DeckoName.endRequestScope();
  }
}
