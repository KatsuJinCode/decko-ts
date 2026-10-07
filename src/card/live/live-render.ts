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
//   AUTOMATIC CHOICE. When collect pass 2 records more than 60 questions the
//   request switches to full speculation (warm-up chase on, fresh engine per
//   pass, no seeds); once a speculative pass records at most 11 reads and no
//   new card, the next pass blocks on its reads instead, paying at most one
//   blocking round trip before it turns speculative again.
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
   *  request to full speculation (default 60, fitted on 8 pages, held on
   *  the POC's 100 random pages). */
  autoThreshold?: number;
  /** In the speculation branch: a pass recording at most this many reads
   *  makes the next pass block on them (default 11; 0 = off). */
  autoTail?: number;
  /** Blocking round trips a tail pass may pay before it turns speculative
   *  (default 1). */
  autoTailTrips?: number;
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
  }
  if (skipSync !== undefined) render.skipSyncRender = skipSync;
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
  const live = new LiveStoreDriver(base);
  const passes: LivePassReport[] = [];
  const threshold = opts.autoThreshold ?? 60;
  const tail = opts.autoTail ?? 11;
  const tailTrips = opts.autoTailTrips === undefined || opts.autoTailTrips < 0 ? undefined : opts.autoTailTrips;
  const seeds = new Set<string>();
  let choice: "collect" | "speculate" = "collect";
  let blockNext = false;
  DeckoName.beginRequestScope();
  try {
    for (let p = 1; p <= MAX_PASSES; p += 1) {
      const asked = new Set<string>();
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
        html = await renderPass(live, boot, page, opts, choice === "collect" ? { seeds, asked } : undefined, skipSync);
      } catch (err) {
        threw = err;
      }
      const pendingReads = live.pendingCount;
      const fresh = [...asked].filter((n) => !seeds.has(n));
      const done = pendingReads === 0 && fresh.length === 0;
      passes.push({
        pass: passes.length + 1,
        kind: done ? "final" : "spec",
        cpu_ms: Math.round(performance.now() - t0),
        recorded: fresh.length + pendingReads,
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
      if (choice === "speculate" && tail > 0 && !tailSpent && fresh.length === 0 && pendingReads <= tail) blockNext = true;
      if (pendingReads > 0) await live.flushSpeculative();
      for (const n of fresh) seeds.add(n);
      if (p === 2 && choice === "collect" && fresh.length + pendingReads > threshold) choice = "speculate";
    }
    throw new Error(`live render did not converge in ${MAX_PASSES} passes`);
  } finally {
    live.close();
    resetBootCache();
    DeckoName.endRequestScope();
  }
}
