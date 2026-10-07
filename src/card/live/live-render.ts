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
// How a page is found (the proof of concept's rounds 3-8,
// recovery/poc/WRITEUP.md in brandonDojoTech):
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
import { LiveStoreDriver, type LiveStoreStats } from "./live-store-driver.js";

/** Boots a fresh render engine over the given driver (the edge's serving
 *  boot). Called once per pass. */
export type LiveEngineBoot = (driver: SQLDatabaseDriver) => Promise<{ render: RenderEngine }>;

export interface LiveRenderOptions {
  requestedView?: string;
  historyParams?: HistoryRenderParams;
  /** Collect pass 2 recording more than this many questions switches the
   *  request to full speculation (the POC's 60; default here: never; env
   *  DECKO_LIVE_AUTO_THRESHOLD overrides). */
  autoThreshold?: number;
  /** In the speculation branch: a pass recording at most this many reads
   *  makes the next pass block on them (the POC's 11; default here 0 = off;
   *  env DECKO_LIVE_AUTO_TAIL overrides). */
  autoTail?: number;
  /** Blocking round trips a tail pass may pay before it turns speculative
   *  (default: no limit). */
  autoTailTrips?: number;
  /** Expand each trip's ring around every fetched row (LiveStoreDriver
   *  ringAll). */
  ringAll?: boolean;
}

export interface LivePassReport {
  pass: number;
  kind: "spec" | "final";
  cpu_ms: number;
  recorded: number;
}

export interface LiveRenderResult {
  html: string;
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
): Promise<string> {
  // A FRESH engine per pass: a speculative pass's engine saw zero-row
  // answers and is discarded; only the store (real rows) carries over.
  resetBootCache();
  const { render } = await boot(live);
  render.liveRequest = true;
  if (collect !== undefined) {
    render.warmupChaseOff = true;
    render.demandSeeds = [...collect.seeds];
    render.demandRecorder = collect.asked;
    // Round 9 step 2: collect passes skip the prepare walks of a read-denied
    // root (its hidden body's items and links are never rendered).
    render.skipDeniedRootWalks = true;
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
  // mode the all-rows ring saves 0-4 trips but fetches ~18k rows instead of
  // ~10k; on the 40 gate pages local wall at 0 ms is median 304 ms narrow
  // against 586 ms wide.
  const ringAll = opts.ringAll ?? env?.DECKO_LIVE_RING_ALL === "1";
  const live = new LiveStoreDriver(base, { ringAll });
  const passes: LivePassReport[] = [];
  // Default: never switch (collect mode throughout). With lazy structure
  // references collect mode needs the fewest trips and the least CPU on the
  // 40 gate pages (7-12 trips, median 8; speculation from pass 3: 7-19),
  // because the speculation branch's warm-up chase keeps discovering
  // site-wide link chains one level per pass.
  const threshold =
    opts.autoThreshold ??
    (env?.DECKO_LIVE_AUTO_THRESHOLD !== undefined ? Number(env.DECKO_LIVE_AUTO_THRESHOLD) : Number.POSITIVE_INFINITY);
  // Default 0 (no blocking tail): with lazy structure references a blocking
  // pass pays one sequential round trip per fetch-ladder step of the walks
  // it runs eagerly (Kimberly Winston 26 trips against 12 without it).
  const tail = opts.autoTail ?? (env?.DECKO_LIVE_AUTO_TAIL !== undefined ? Number(env.DECKO_LIVE_AUTO_TAIL) : 0);
  const tailTrips = opts.autoTailTrips === undefined || opts.autoTailTrips < 0 ? undefined : opts.autoTailTrips;
  const seeds = new Set<string>();
  let choice: "collect" | "speculate" = "collect";
  let blockNext = false;
  // Lazy structure references (RenderEngine.skipStructureRefWalks; on by
  // default, DECKO_LIVE_STRUCTURE_WALKS=1 restores the eager walk).
  const lazyRefs = env?.DECKO_LIVE_STRUCTURE_WALKS !== "1";
  const eagerRefs = new Set<string>();
  DeckoName.beginRequestScope();
  try {
    for (let p = 1; p <= MAX_PASSES; p += 1) {
      const asked = new Set<string>();
      const lazyAsked = new Set<string>();
      live.mode = blockNext ? "block" : "spec";
      live.blockTrips = blockNext ? tailTrips : undefined;
      const t0 = performance.now();
      let html: string | undefined;
      let threw: unknown;
      try {
        // A speculation pass that has already consumed a speculative answer
        // is not the page: its synchronous view renders are skipped (they
        // issue no reads). Collect passes keep them: the render is what
        // records their questions.
        const skipSync = choice === "speculate" ? () => live.mode === "spec" && live.pendingCount > 0 : undefined;
        html = await renderPass(live, boot, page, opts, choice === "collect" ? { seeds, asked } : undefined, skipSync, lazyRefs ? { asked: lazyAsked, eager: eagerRefs } : undefined);
      } catch (err) {
        threw = err;
      }
      const pendingReads = live.pendingCount;
      const fresh = [...asked].filter((n) => !seeds.has(n));
      const lazyFresh = [...lazyAsked].map((n) => DeckoName.parse(n).key).filter((k) => !eagerRefs.has(k));
      const done = pendingReads === 0 && fresh.length === 0 && lazyFresh.length === 0;
      passes.push({
        pass: passes.length + 1,
        kind: done ? "final" : "spec",
        cpu_ms: Math.round(performance.now() - t0),
        recorded: fresh.length + lazyFresh.length + pendingReads,
      });
      // A tail pass that ran out of blocking trips turned speculative: the
      // tail's prediction was wrong, so go back to discovery passes.
      const tailSpent = blockNext && live.mode === "spec";
      live.blockTrips = undefined;
      if (tailSpent) blockNext = false;
      if (done) {
        if (threw !== undefined) throw threw;
        return { html: html as string, stats: live.stats, passes, choice };
      }
      if (choice === "speculate" && tail > 0 && !tailSpent && fresh.length + lazyFresh.length === 0 && pendingReads <= tail) blockNext = true;
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
