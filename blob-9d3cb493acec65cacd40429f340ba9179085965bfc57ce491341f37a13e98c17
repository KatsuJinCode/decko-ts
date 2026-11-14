// src/card/live/live-render.ts
//
// THE REQUEST-LOCAL PAGE RENDER: one anonymous GET page, rendered uncached
// over a request store (live-store-driver.ts), in a handful of batched round
// trips instead of hundreds one after another. The passes' engines and the
// automatic choice are locals of one call, the process-wide boot bundle is
// dropped before every pass and after the request, and the name memos live
// in this request's scope only.
//
// KEPT PAGES. What a completed page fetched (its request store: the rows and
// the exact-statement answers) and the cards it needed (the seeds and eager
// structure references) are kept per page, stamped with the deck's freshness
// stamp (deck_data_version) as it stood when the first of those rows was
// read: the stamp read rides the page's first round trip. A later request for
// the same page reads the stamp first, in one trip. Unchanged, it renders
// from the kept rows on a fresh engine, with the kept seeds, under the same
// completion rule as any pass; a pass that asks for anything the kept store
// cannot prove fetches it as usual. Moved, the kept entry is dropped and the
// page renders as on a first request. The stamp is bumped by triggers on
// every write to cards and card_references, so a committed write between two
// requests is always seen by the second. DECKO_LIVE_KEEP=0 turns keeping off.
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

import type { SQLDatabaseDriver, SQLQueryResult } from "../../server/driver.js";
import type { RenderEngine } from "../render.js";
import type { HistoryRenderParams } from "../history/render-seam.js";
import { debugFlag, envValue, traceStderr } from "../debug-flags.js";
import { renderPageBytes } from "../render/page.js";
import { BOOT_VERSION_STATEMENT, resetBootCache } from "../render/boot-cache.js";
import { DeckoName } from "../name.js";
import { BUNDLE_SCHEMA_VERSION, LiveRenderAborted, LiveStoreDriver, diffLivePageBundle, type LiveStoreStats, type SerializedLivePageBundle } from "./live-store-driver.js";
import { RetainedPages, retainedPagesDiagnostics } from "./retained-pages.js";


export { BUNDLE_SCHEMA_VERSION, LiveRenderAborted };

export type LiveEngineBoot = (driver: SQLDatabaseDriver) => Promise<{ render: RenderEngine }>;

export class LiveRenderScope {
  private live: LiveStoreDriver | undefined;
  private owner: SQLDatabaseDriver | undefined;
  private viewer: string | undefined;
  private signal: AbortSignal | undefined;
  private stamp: number | undefined;
  private active = false;
  private closed = false;

  async acquire(base: SQLDatabaseDriver, viewer: string | undefined, signal: AbortSignal | undefined, create: () => LiveStoreDriver): Promise<LiveStoreDriver> {
    if (this.closed || this.active) throw new Error("live render scope is closed or already in use");
    if (this.owner !== undefined && (this.owner !== base || this.viewer !== viewer || this.signal !== signal)) {
      throw new Error("live render scope cannot cross database, viewer or request boundaries");
    }
    this.active = true;
    try {
      if (Boolean(signal?.aborted)) throw new LiveRenderAborted();
      let stamp: number | undefined;
      try { stamp = stampOf(await base.query(BOOT_VERSION_STATEMENT, [])); }
      catch (error) {
        if (!/no such table[^\n]*deck_data_version/i.test(String(error))) throw error;
        stamp = 1;
      }
      if (signal?.aborted === true) throw new LiveRenderAborted();
      if (this.live !== undefined && (stamp === undefined || stamp !== this.stamp)) {
        this.live.close();
        this.live = undefined;
      }
      const live = this.live ?? create();
      this.owner = base;
      this.viewer = viewer;
      this.signal = signal;
      this.stamp = stamp;
      this.live = live;
      live.beginRequest(signal);
      live.stats.round_trips += 1;
      live.stats.statements_sent += 1;
      return live;
    } catch (error) { this.active = false; throw error; }
  }

  release(completed: boolean): void {
    this.active = false;
    if (!completed) { this.live?.close(); this.live = undefined; }
  }

  close(): void {
    if (this.active) throw new Error("cannot close a live render scope while a view is active");
    this.live?.close();
    this.live = undefined;
    this.closed = true;
  }
}

export async function withLiveRenderScope<T>(work: (scope: LiveRenderScope) => Promise<T>): Promise<T> {
  const scope = new LiveRenderScope();
  try { return await work(scope); } finally { scope.close(); }
}

export interface LiveRenderOptions {
  requestedView?: string;
  historyParams?: HistoryRenderParams;
  bareView?: boolean;
  bareMainOpts?: Record<string, unknown>;
  requestScope?: LiveRenderScope;
  autoThreshold?: number;
  autoTail?: number;
  autoTailTrips?: number;
  incremental?: boolean;
  refreshDiscoveryEngine?: (driver: SQLDatabaseDriver, render: RenderEngine) => Promise<void>;
  ringAll?: boolean;
  signal?: AbortSignal;
  keep?: boolean;
  keepScope?: string;
  persistBundles?: boolean;
  onBundleDiscovered?: (keepKey: string, stamp: number, bundle: SerializedLivePageBundle) => void;
  resolveHomeMark?: boolean;
  onResolvedPage?: (resolvedPage: string) => void;
}

interface KeptPage {
  live: LiveStoreDriver;
  stamp: number;
  seeds: Set<string>;
  eagerRefs: Set<string>;
  deniedRootKey: string | undefined;
  substrateEngine?: RenderEngine;
}

interface IsolateSubstrate {
  stamp: number;
  live: LiveStoreDriver;
  substrateEngine: RenderEngine | undefined;
  eagerRefs: Set<string>;
  subBundle?: SerializedLivePageBundle;
  homeMark?: string;
}

const DEFAULT_EAGER_CHROME_REFS = [
  "*header",
  "*footer",
  "*credit",
  "*credit+image",
  "*main_menu",
  "*account_link",
  "*search",
  "*home",
  "*logo",
  "*version",
  "*title",
  "*favicon",
] as const;

let keptPages = new WeakMap<SQLDatabaseDriver, RetainedPages<KeptPage>>();
let isolateSubstrates = new WeakMap<SQLDatabaseDriver, Map<string, IsolateSubstrate>>();

function getIsolateSubstrate(base: SQLDatabaseDriver, scope: string): IsolateSubstrate | undefined {
  return isolateSubstrates.get(base)?.get(scope);
}

function setIsolateSubstrate(base: SQLDatabaseDriver, scope: string, sub: IsolateSubstrate): void {
  let map = isolateSubstrates.get(base);
  if (map === undefined) {
    map = new Map();
    isolateSubstrates.set(base, map);
  }
  map.set(scope, sub);
}

function dropIsolateSubstrate(base: SQLDatabaseDriver, scope: string): void {
  const map = isolateSubstrates.get(base);
  const existing = map?.get(scope);
  if (existing !== undefined) {
    existing.live.close();
    map?.delete(scope);
  }
}

/** Numeric diagnostics only; this accessor is unused in the serving bundle. */
export function keptLivePageDiagnostics(base: SQLDatabaseDriver): { entries: number; estimatedBytes: number } {
  const pages = keptPages.get(base);
  return pages ? retainedPagesDiagnostics(pages) : { entries: 0, estimatedBytes: 0 };
}


export { diffLivePageBundle };

const LIVE_BUNDLE_LOAD_STATEMENT =
  `SELECT COALESCE((SELECT "version" FROM "deck_data_version" WHERE "id" = 1), 1) AS version, ` +
  `(SELECT db_content FROM cards WHERE codename = 'home' AND trash = 0 ORDER BY id LIMIT 1) AS home_mark, ` +
  `(SELECT payload_json FROM live_page_bundles WHERE keep_key = ? AND stamp = COALESCE((SELECT "version" FROM "deck_data_version" WHERE "id" = 1), 1)) AS sub_json, ` +
  `(SELECT payload_json FROM live_page_bundles WHERE keep_key = ? AND stamp = COALESCE((SELECT "version" FROM "deck_data_version" WHERE "id" = 1), 1)) AS payload_json`;
const BUNDLE_TABLE_RETRY_TTL_MS = 60_000;
const driversWithoutBundleTableUntil = new WeakMap<SQLDatabaseDriver, number>();

function isDriverBundleDisabled(base: SQLDatabaseDriver): boolean {
  const until = driversWithoutBundleTableUntil.get(base);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    driversWithoutBundleTableUntil.delete(base);
    return false;
  }
  return true;
}

function markDriverWithoutBundleTable(base: SQLDatabaseDriver, ttlMs: number = BUNDLE_TABLE_RETRY_TTL_MS): void {
  driversWithoutBundleTableUntil.set(base, Date.now() + ttlMs);
}

function normalizeKeepScope(scope: string | undefined): string {
  return scope === undefined || scope === "viewer:anonymous::default" ? "" : scope;
}

export function liveSubstrateBundleKey(scope?: string): string {
  return `__SUBSTRATE__:${normalizeKeepScope(scope)}`;
}

export function livePageBundleKey(page: string, opts: LiveRenderOptions = {}): string {
  const scope = normalizeKeepScope(opts.keepScope);
  let pageKey = page;
  try {
    pageKey = DeckoName.parse(page).key;
  } catch {
  }
  return `${scope}|${pageKey}|${opts.requestedView ?? ""}|${JSON.stringify(opts.historyParams ?? {})}|${opts.bareView === true}|${JSON.stringify(opts.bareMainOpts ?? {})}`;
}

function keptKey(page: string, opts: LiveRenderOptions): string {
  return livePageBundleKey(page, opts);
}

function takeKept(base: SQLDatabaseDriver, key: string): KeptPage | undefined {
  return keptPages.get(base)?.take(key);
}

function putKept(base: SQLDatabaseDriver, key: string, kept: KeptPage): void {
  let pages = keptPages.get(base);
  if (pages === undefined) {
    pages = new RetainedPages<KeptPage>(
      (entry) => entry.live.close(),
      (entry) => {
        entry.live.compactForRetention();
        return [entry.live.retainedPayload(), entry.seeds, entry.eagerRefs, entry.deniedRootKey];
      },
    );
    keptPages.set(base, pages);
  }
  pages.put(key, kept);
}

export function clearKeptLivePages(base?: SQLDatabaseDriver): void {
  if (base === undefined) {
    keptPages = new WeakMap();
    isolateSubstrates = new WeakMap();
    return;
  }
  const pages = keptPages.get(base);
  pages?.clear();
  const subs = isolateSubstrates.get(base);
  if (subs !== undefined) {
    for (const sub of subs.values()) sub.live.close();
    subs.clear();
  }
}

function stampOf(result: SQLQueryResult | undefined): number | undefined {
  const v = (result?.rows[0] as { version?: unknown } | undefined)?.version;
  return typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : undefined;
}

export interface LivePassReport {
  pass: number;
  kind: "spec" | "final" | "disc";
  cpu_ms: number;
  recorded: number;
}

export interface LiveRenderResult {
  html: string;
  status: number;
  resolvedPage?: string;
  rootKnown?: boolean;
  rootCodename?: string | null;
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
  substrateEngine?: RenderEngine,
): Promise<string> {
  let render: RenderEngine;
  if (discovery?.engine !== undefined) {
    render = discovery.engine;
    resetBootCache();
    render.clearProvisionalState(discovery.level);
    await opts.refreshDiscoveryEngine?.(live, render);
  } else {
    if (substrateEngine === undefined) {
      resetBootCache();
    }
    render = (await boot(live)).render;
    if (substrateEngine !== undefined) {
      render.shareSubstrateFrom(substrateEngine);
    }
    discovery?.onBoot(render);
  }
  if (discovery !== undefined) render.sweepAllHeldCards = discovery.sweepAll;
  out.engine = render;
  render.liveRequest = true;
  if (collect !== undefined) {
    render.warmupChaseOff = true;
    render.demandSeeds = [...collect.seeds];
    render.demandRecorder = collect.asked;
    render.skipDeniedRootWalks = true;
    if (deniedRootKey !== undefined) {
      render.skipRootClosureWalk = true;
      render.skipRootClosureKey = deniedRootKey;
    }
    render.warmupSidesUnscanned = !debugFlag("DECKO_LIVE_SIDES_SCAN");
  }
  if (skipSync !== undefined) render.skipSyncRender = skipSync;
  if (lazy !== undefined) {
    render.skipStructureRefWalks = true;
    render.skippedStructureRefAsked = lazy.asked;
    render.eagerStructureRefs = lazy.eager;
  }
  try {
    return opts.bareView === true
      ? await render.render(page, opts.requestedView ?? "titled", opts.historyParams)
      : await renderPageBytes(render, page, opts.requestedView, opts.historyParams, opts.bareMainOpts);
  } finally {
    if (substrateEngine === undefined && live.mode === "spec" && live.pendingCount > 0) {
      await render.primeLiveFirstTrip();
    }
  }
}

export async function liveRenderView(
  base: SQLDatabaseDriver,
  cardName: string,
  boot: LiveEngineBoot,
  opts: LiveRenderOptions,
): Promise<LiveRenderResult> {
  return await liveRenderPage(base, cardName, boot, { keep: false, ...opts, bareView: true });
}

export async function liveRenderPage(
  base: SQLDatabaseDriver,
  page: string,
  boot: LiveEngineBoot,
  opts: LiveRenderOptions = {},
): Promise<LiveRenderResult> {
  const ringAll = opts.ringAll ?? debugFlag("DECKO_LIVE_RING_ALL");
  const keepOn =
    opts.requestScope === undefined && opts.keep !== false && envValue("DECKO_LIVE_KEEP") !== "0" && !(opts.refreshDiscoveryEngine !== undefined && (opts.incremental ?? debugFlag("DECKO_LIVE_INCREMENTAL")));
  const scope = normalizeKeepScope(opts.keepScope);
  let iso = keepOn ? getIsolateSubstrate(base, scope) : undefined;
  let observedHomeMark: string | undefined = iso?.homeMark;
  if (opts.resolveHomeMark === true && observedHomeMark !== undefined) {
    page = observedHomeMark;
  }
  let key = keptKey(page, opts);
  let kept = keepOn ? takeKept(base, key) : undefined;
  let stamp: number | undefined;
  let persistedSubBundle: SerializedLivePageBundle | undefined;
  let persistedBundle: SerializedLivePageBundle | undefined;
  let needBundleSchema = false;
  if (keepOn && kept === undefined && !isDriverBundleDisabled(base)) {
    if (opts.signal?.aborted === true) throw new LiveRenderAborted();
    try {
      const res = await base.query(LIVE_BUNDLE_LOAD_STATEMENT, [
        iso !== undefined && opts.onBundleDiscovered === undefined ? "" : liveSubstrateBundleKey(scope),
        key,
      ]);
      stamp = stampOf(res);
      const row0 = res.rows[0] as { home_mark?: unknown; sub_json?: unknown; payload_json?: unknown } | undefined;
      if (row0 !== undefined && "home_mark" in row0) {
        observedHomeMark =
          typeof row0.home_mark === "string" && row0.home_mark.trim() !== ""
            ? row0.home_mark
            : "Home";
      }
      if (iso !== undefined && (stamp === undefined || stamp !== iso.stamp)) {
        dropIsolateSubstrate(base, scope);
        iso = undefined;
      } else if (row0 !== undefined) {
        if (typeof row0.sub_json === "string" && row0.sub_json.length > 0) {
          const parsedSub = JSON.parse(row0.sub_json) as SerializedLivePageBundle;
          if (parsedSub?.v === BUNDLE_SCHEMA_VERSION) persistedSubBundle = parsedSub;
        }
        if (typeof row0.payload_json === "string" && row0.payload_json.length > 0) {
          const parsedPage = JSON.parse(row0.payload_json) as SerializedLivePageBundle;
          if (parsedPage?.v === BUNDLE_SCHEMA_VERSION) {
            if (parsedPage.kind === "delta" && persistedSubBundle === undefined && iso?.subBundle === undefined) {
              persistedBundle = undefined;
            } else {
              persistedBundle = parsedPage;
            }
          }
        }
      }
      if (opts.resolveHomeMark === true && observedHomeMark !== undefined && observedHomeMark !== page) {
        page = observedHomeMark;
        key = keptKey(page, opts);
        persistedBundle = undefined;
        kept = keepOn ? takeKept(base, key) : undefined;
      }
    } catch (error) {
      const msg = String(error);
      if (/no such table[^\n]*(?:live_page_bundles|deck_data_version)/i.test(msg)) {
        if (/no such table[^\n]*deck_data_version/i.test(msg)) {
          stamp = 1;
        }
        if (opts.persistBundles === true) {
          needBundleSchema = true;
        } else {
          markDriverWithoutBundleTable(base);
        }
      } else {
        throw error;
      }
    }
  } else if (kept !== undefined || iso !== undefined) {
    if (opts.signal?.aborted === true) throw new LiveRenderAborted();
    try {
      stamp = stampOf(await base.query(BOOT_VERSION_STATEMENT, []));
    } catch (error) {
      if (!/no such table[^\n]*deck_data_version/i.test(String(error))) throw error;
    }
    if (kept !== undefined && (stamp === undefined || stamp !== kept.stamp)) {
      kept.live.close();
      kept = undefined;
    }
    if (iso !== undefined && (stamp === undefined || stamp !== iso.stamp)) {
      dropIsolateSubstrate(base, scope);
      iso = undefined;
      observedHomeMark = undefined;
    }
  }
  if (opts.resolveHomeMark === true && observedHomeMark === undefined) {
    try {
      const hmRes = await base.query<{ db_content: string | null }>(
        "SELECT db_content FROM cards WHERE codename = 'home' AND trash = 0 ORDER BY id LIMIT 1",
        [],
      );
      const rawHome = hmRes.rows[0]?.db_content;
      observedHomeMark = typeof rawHome === "string" && rawHome.trim() !== "" ? rawHome : "Home";
    } catch {
      observedHomeMark = "Home";
    }
    if (observedHomeMark !== page) {
      if (kept !== undefined) {
        putKept(base, key, kept);
        kept = undefined;
      }
      page = observedHomeMark;
      key = keptKey(page, opts);
      kept = keepOn ? takeKept(base, key) : undefined;
    }
  }
  opts.onResolvedPage?.(page);
  const createStore = () => new LiveStoreDriver(base, {
      ringAll,
      signal: opts.signal,
      compact: envValue("DECKO_LIVE_COMPACT") !== "0",
      identityRing: debugFlag("DECKO_LIVE_IDENTITY_RING"),
    });
  const live = opts.requestScope !== undefined
    ? await opts.requestScope.acquire(base, opts.keepScope, opts.signal, createStore)
    : kept?.live ?? createStore();
  if (kept !== undefined) {
    if (iso !== undefined) live.seedFrom(iso.live);
    live.beginRequest(opts.signal);
  } else if (persistedSubBundle !== undefined || persistedBundle !== undefined) {
    if (iso !== undefined && opts.requestScope === undefined) live.seedFrom(iso.live);
    if (persistedSubBundle !== undefined) live.importPageBundle(persistedSubBundle, stamp);
    if (persistedBundle !== undefined) live.importPageBundle(persistedBundle, stamp);
  } else if (iso !== undefined && opts.requestScope === undefined) {
    live.seedFrom(iso.live);
  }
  if (keepOn && stamp !== undefined) {
    live.stats.round_trips += 1;
    live.stats.statements_sent += 1;
  }
  if (keepOn && stamp === undefined) live.leadStatement = { sql: BOOT_VERSION_STATEMENT, params: [] };
  let completed = false;
  const passes: LivePassReport[] = [];
  const rawAutoThreshold = envValue("DECKO_LIVE_AUTO_THRESHOLD");
  const threshold =
    opts.autoThreshold ??
    (rawAutoThreshold !== undefined ? Number(rawAutoThreshold) : Number.POSITIVE_INFINITY);
  const rawAutoTail = envValue("DECKO_LIVE_AUTO_TAIL");
  const tail = opts.autoTail ?? (rawAutoTail !== undefined ? Number(rawAutoTail) : 0);
  const tailTrips = opts.autoTailTrips === undefined || opts.autoTailTrips < 0 ? undefined : opts.autoTailTrips;
  const seeds = kept?.seeds ?? new Set<string>(persistedBundle?.seeds);
  let choice: "collect" | "speculate" = "collect";
  let blockNext = false;
  const lazyRefs = !debugFlag("DECKO_LIVE_STRUCTURE_WALKS");
  const eagerRefs =
    kept?.eagerRefs ??
    new Set<string>(persistedBundle?.eagerRefs ?? persistedSubBundle?.eagerRefs ?? iso?.eagerRefs ?? DEFAULT_EAGER_CHROME_REFS);
  const skipDeniedClosure = !debugFlag("DECKO_LIVE_DENIED_CLOSURE");
  let deniedRootKey: string | undefined = kept?.deniedRootKey ?? persistedBundle?.deniedRootKey;
  const incremental =
    opts.refreshDiscoveryEngine !== undefined && (opts.incremental ?? debugFlag("DECKO_LIVE_INCREMENTAL"));
  const rawIncLevel = envValue("DECKO_LIVE_INCREMENTAL_LEVEL");
  const incLevel = rawIncLevel !== undefined ? Number(rawIncLevel) : 2;
  const incSweepAll = envValue("DECKO_LIVE_INCREMENTAL_SWEEP") !== "0";
  const wantPersist =
    opts.onBundleDiscovered !== undefined ||
    (opts.persistBundles === true && !isDriverBundleDisabled(base));
  let discovering = incremental;
  let discoveryEngine: RenderEngine | undefined;
  let substrateEngine: RenderEngine | undefined =
    kept !== undefined || persistedBundle !== undefined || !wantPersist
      ? (kept?.substrateEngine ?? iso?.substrateEngine)
      : undefined;
  DeckoName.beginRequestScope();
  try {
    for (let p = 1; p <= MAX_PASSES; p += 1) {
      if (opts.signal?.aborted === true) throw new LiveRenderAborted();
      const asked = new Set<string>();
      const askStacks = new Map<string, string[]>();
      const traceStackEnv = envValue("DECKO_LIVE_TRACE_STACK");
      if (traceStackEnv !== undefined) {
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
      live.beginPass();
      live.mode = blockNext ? "block" : "spec";
      live.blockTrips = blockNext ? tailTrips : undefined;
      if (traceStackEnv !== undefined) {
        live.stackTrace = new Map();
        live.stackDepth = Number(traceStackEnv) || 6;
      }
      const t0 = performance.now();
      let html: string | undefined;
      let threw: unknown;
      try {
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
          substrateEngine,
        );
      } catch (err) {
        threw = err;
      }
      if (skipDeniedClosure && choice === "collect" && deniedRootKey === undefined && out.engine !== undefined) {
        try {
          const root = out.engine.fetchRenderCard(page);
          if (root !== undefined && out.engine.isDenied(root)) deniedRootKey = root.key;
        } catch {
        }
      }
      const pendingReads = live.pendingCount;
      const fresh = [...asked].filter((n) => !seeds.has(n));
      const lazyFresh = [...lazyAsked].map((n) => DeckoName.parse(n).key).filter((k) => !eagerRefs.has(k));
      const done = pendingReads === 0 && fresh.length === 0 && lazyFresh.length === 0;
      if (
        done &&
        out.engine !== undefined &&
        out.engine.hasLiveSubstrate() &&
        (substrateEngine === undefined ||
          (!substrateEngine.hasLiveRuleCacheSubstrate() &&
            out.engine.hasLiveRuleCacheSubstrate()))
      ) {
        substrateEngine = out.engine;
      }
      passes.push({
        pass: passes.length + 1,
        kind: discovering ? "disc" : done ? "final" : "spec",
        cpu_ms: Math.round(performance.now() - t0),
        recorded: fresh.length + lazyFresh.length + pendingReads,
      });
      if (debugFlag("DECKO_LIVE_DEBUG")) {
        if (threw !== undefined) console.error(`THREW ${String((threw as Error)?.stack ?? threw).slice(0, 600)}`);
        console.error(`PASS ${passes.length} ${discovering ? "disc" : "fresh"} pending=${pendingReads} asked=${fresh.length} lazy=${lazyFresh.length} ${JSON.stringify(fresh.slice(0, 12))} ${JSON.stringify(lazyFresh.slice(0, 6))} ${JSON.stringify(live.debugPending?.().slice(0, 6) ?? [])}`);
      }
      if (discovering && done) {
        discovering = false;
        discoveryEngine = undefined;
        continue;
      }
      const tailSpent = blockNext && live.mode === "spec";
      live.blockTrips = undefined;
      if (tailSpent) blockNext = false;
      if (done) {
        if (debugFlag("DECKO_LIVE_TRACE") && html !== undefined) {
          const h = [...html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "")].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 0);
          traceStderr(`LIVE-TRACE-FINAL pass ${passes.length} htmlLen ${html.length} htmlHash ${h}\n`);
        }
        if (threw !== undefined) throw threw;
        completed = true;
        let rootCard: ReturnType<RenderEngine["fetchRenderCard"]>;
        try {
          rootCard = out.engine?.fetchRenderCard(page);
        } catch {
          rootCard = undefined;
        }
        return {
          html: html as string,
          status: out.engine?.pageErrorStatus ?? 200,
          resolvedPage: page,
          ...(rootCard !== undefined
            ? {
                rootKnown: !rootCard.unknown,
                rootCodename: rootCard.record.codename,
              }
            : {}),
          stats: { ...live.stats },
          passes,
          choice,
        };
      }
      if (debugFlag("DECKO_LIVE_TRACE")) {
        traceStderr(
          `LIVE-TRACE pass ${passes.length} ${JSON.stringify({ threw: threw === undefined ? undefined : String((threw as Error)?.stack ?? threw).slice(0, 600), htmlLen: html?.length, htmlHash: html === undefined ? undefined : [...html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "")].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 0), askStacks: [...askStacks].map(([k, v]) => [v.length, v.slice(0, 3), k]), fresh, lazyFresh, pending: live.describePending(), stacks: live.stackTrace === undefined ? undefined : [...live.stackTrace].sort((a, b) => b[1] - a[1]).slice(0, 12) })}\n`,
        );
      }
      if (choice === "speculate" && tail > 0 && !tailSpent && fresh.length + lazyFresh.length === 0 && pendingReads <= tail) blockNext = true;
      if (envValue("DECKO_LIVE_SET_HINTS") !== "0") live.hintSetNames(fresh);
      if (pendingReads > 0) await live.flushSpeculative();
      for (const n of fresh) seeds.add(n);
      for (const k of lazyFresh) eagerRefs.add(k);
      if (p === 2 && choice === "collect" && fresh.length + pendingReads > threshold) choice = "speculate";
    }
    throw new Error(`live render did not converge in ${MAX_PASSES} passes`);
  } finally {
    if (stamp === undefined) stamp = stampOf(live.leadResult) ?? (needBundleSchema ? 1 : undefined);
    live.leadStatement = undefined;
    if (opts.requestScope !== undefined) {
      opts.requestScope.release(completed);
    } else if (completed && keepOn && choice === "collect" && stamp !== undefined) {
      const currentIso = getIsolateSubstrate(base, scope);
      const wantBundle =
        ((kept === undefined && persistedBundle === undefined) || live.stats.round_trips > 1) &&
        (opts.onBundleDiscovered !== undefined ||
          (opts.persistBundles === true && !isDriverBundleDisabled(base)));
      const discoveredBundle = wantBundle
        ? live.exportPageBundle(seeds, eagerRefs, deniedRootKey, true)
        : undefined;
      const resolvedSubBundle =
        persistedSubBundle ?? currentIso?.subBundle ?? discoveredBundle;
      const needPersistSubstrate =
        persistedSubBundle === undefined &&
        currentIso?.subBundle === undefined &&
        resolvedSubBundle !== undefined;
      if (currentIso === undefined || currentIso.stamp !== stamp) {
        if (currentIso !== undefined) dropIsolateSubstrate(base, scope);
        const isoLive = createStore();
        isoLive.seedFrom(live);
        setIsolateSubstrate(base, scope, {
          stamp,
          live: isoLive,
          substrateEngine,
          eagerRefs: new Set(eagerRefs),
          ...(resolvedSubBundle !== undefined ? { subBundle: resolvedSubBundle } : {}),
          ...(observedHomeMark !== undefined ? { homeMark: observedHomeMark } : {}),
        });
      } else {
        currentIso.live.mergeFrom(live);
        if (observedHomeMark !== undefined) currentIso.homeMark = observedHomeMark;
        if (currentIso.subBundle === undefined && resolvedSubBundle !== undefined) {
          currentIso.subBundle = resolvedSubBundle;
        }
        if (
          substrateEngine !== undefined &&
          (currentIso.substrateEngine === undefined ||
            (!currentIso.substrateEngine.hasLiveRuleCacheSubstrate() &&
              substrateEngine.hasLiveRuleCacheSubstrate()))
        ) {
          currentIso.substrateEngine = substrateEngine;
        }
        for (const k of eagerRefs) currentIso.eagerRefs.add(k);
      }
      if (discoveredBundle !== undefined) {
        opts.onBundleDiscovered?.(key, stamp, discoveredBundle);
        if (opts.persistBundles === true && !isDriverBundleDisabled(base)) {
          try {
            if (needBundleSchema) {
              await base.query(
                `CREATE TABLE IF NOT EXISTS deck_data_version (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  version INTEGER NOT NULL DEFAULT 0
                )`,
                [],
              );
              await base.query(
                `INSERT OR IGNORE INTO deck_data_version (id, version) VALUES (1, 0)`,
                [],
              );
              for (const tbl of ["cards", "card_references", "card_acts", "card_actions", "card_changes", "card_virtuals"]) {
                for (const [op, suffix] of [["INSERT", "ins"], ["UPDATE", "upd"], ["DELETE", "del"]] as const) {
                  try {
                    await base.query(
                      `CREATE TRIGGER IF NOT EXISTS ${tbl}_bump_deck_data_version_${suffix}
                       AFTER ${op} ON ${tbl} BEGIN
                         UPDATE deck_data_version SET version = version + 1 WHERE id = 1;
                       END`,
                      [],
                    );
                  } catch {
                    // Optional table in minimal test schema
                  }
                }
              }
              await base.query(
                `CREATE TABLE IF NOT EXISTS live_page_bundles (
                  keep_key TEXT PRIMARY KEY,
                  page_key TEXT NOT NULL,
                  stamp INTEGER NOT NULL,
                  payload_json TEXT NOT NULL
                )`,
                [],
              );
              await base.query(
                `CREATE TABLE IF NOT EXISTS deck_rule_flags (
                  epoch INTEGER PRIMARY KEY AUTOINCREMENT,
                  rule_id INTEGER NOT NULL,
                  set_id INTEGER,
                  pattern_code TEXT NOT NULL,
                  anchor_id INTEGER,
                  anchor_left_id INTEGER,
                  anchor_right_id INTEGER,
                  anchor_key TEXT,
                  is_delete INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL
                )`,
                [],
              );
              await base.query(
                `CREATE INDEX IF NOT EXISTS deck_rule_flags_epoch_idx
                 ON deck_rule_flags(epoch)`,
                [],
              );
              await base.query(
                `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_card_ins
                 AFTER INSERT ON cards BEGIN
                   DELETE FROM live_page_bundles;
                 END`,
                [],
              );
              await base.query(
                `DROP TRIGGER IF EXISTS trg_live_page_bundles_card_upd`,
                [],
              );
              await base.query(
                `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_card_upd
                 AFTER UPDATE ON cards BEGIN
                   DELETE FROM live_page_bundles
                   WHERE NOT (
                     OLD.id IS NEW.id AND
                     OLD.name IS NEW.name AND
                     OLD."key" IS NEW."key" AND
                     OLD.codename IS NEW.codename AND
                     OLD.left_id IS NEW.left_id AND
                     OLD.right_id IS NEW.right_id AND
                     OLD.type_id IS NEW.type_id AND
                     OLD.db_content IS NEW.db_content AND
                     OLD.trash IS NEW.trash AND
                     OLD.creator_id IS NEW.creator_id AND
                     OLD.updater_id IS NEW.updater_id AND
                     OLD.created_at IS NEW.created_at AND
                     OLD.updated_at IS NEW.updated_at AND
                     OLD.current_revision_id IS NEW.current_revision_id AND
                     OLD.references_expired IS NEW.references_expired AND
                     (
                       (OLD.read_rule_id IS NEW.read_rule_id AND OLD.read_rule_class IS NEW.read_rule_class) OR
                       EXISTS (SELECT 1 FROM deck_rule_flags)
                     )
                   );
                   UPDATE deck_data_version
                   SET version = version - 1
                   WHERE id = 1 AND (
                     OLD.id IS NEW.id AND
                     OLD.name IS NEW.name AND
                     OLD."key" IS NEW."key" AND
                     OLD.codename IS NEW.codename AND
                     OLD.left_id IS NEW.left_id AND
                     OLD.right_id IS NEW.right_id AND
                     OLD.type_id IS NEW.type_id AND
                     OLD.db_content IS NEW.db_content AND
                     OLD.trash IS NEW.trash AND
                     OLD.creator_id IS NEW.creator_id AND
                     OLD.updater_id IS NEW.updater_id AND
                     OLD.created_at IS NEW.created_at AND
                     OLD.updated_at IS NEW.updated_at AND
                     OLD.current_revision_id IS NEW.current_revision_id AND
                     OLD.references_expired IS NEW.references_expired AND
                     (
                       (OLD.read_rule_id IS NEW.read_rule_id AND OLD.read_rule_class IS NEW.read_rule_class) OR
                       EXISTS (SELECT 1 FROM deck_rule_flags)
                     )
                   );
                 END`,
                [],
              );
              await base.query(
                `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_card_del
                 AFTER DELETE ON cards BEGIN
                   DELETE FROM live_page_bundles;
                 END`,
                [],
              );
              try {
                await base.query(
                  `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_ref_ins
                   AFTER INSERT ON card_references BEGIN
                     DELETE FROM live_page_bundles;
                   END`,
                  [],
                );
                await base.query(
                  `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_ref_upd
                   AFTER UPDATE ON card_references BEGIN
                     DELETE FROM live_page_bundles;
                   END`,
                  [],
                );
                await base.query(
                  `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_ref_del
                   AFTER DELETE ON card_references BEGIN
                     DELETE FROM live_page_bundles;
                   END`,
                  [],
                );
              } catch {
                // optional if card_references table absent in minimal test schema
              }
              try {
                await base.query(
                  `CREATE TABLE IF NOT EXISTS edge_render_cache (
                     cache_key TEXT PRIMARY KEY,
                     stamp INTEGER NOT NULL,
                     status INTEGER NOT NULL,
                     content_type TEXT NOT NULL,
                     body TEXT NOT NULL,
                     updated_at INTEGER NOT NULL
                   )`,
                  [],
                );
                await base.query(
                  `CREATE TABLE IF NOT EXISTS decko_edge_render_cache (
                     url TEXT PRIMARY KEY,
                     epoch INTEGER NOT NULL,
                     content_type TEXT NOT NULL,
                     body TEXT NOT NULL,
                     stored_at INTEGER NOT NULL
                   )`,
                  [],
                );
                await base.query(
                  `CREATE TRIGGER IF NOT EXISTS trg_edge_render_cache_rule_flag_ins
                   AFTER INSERT ON deck_rule_flags BEGIN
                     DELETE FROM edge_render_cache;
                     DELETE FROM decko_edge_render_cache;
                   END`,
                  [],
                );
              } catch {
                // optional L3 global render cache tables
              }
            }
            let effectiveStamp = stamp;
            let stampChangedMidRender = false;
            try {
              const verRes = await base.query<{ version: number }>(BOOT_VERSION_STATEMENT, []);
              const latestVer = verRes.rows[0]?.version;
              if (typeof latestVer === "number" && Number.isFinite(latestVer)) {
                if (needBundleSchema) {
                  effectiveStamp = latestVer;
                } else if (latestVer !== stamp) {
                  stampChangedMidRender = true;
                }
              }
            } catch {
              // Keep initial stamp if version check fails
            }
            // S2 / R7-M1 safeguard: if a concurrent write advanced deck_data_version mid-render,
            // do not persist pre-write rows under the post-write stamp; on initial schema
            // bootstrap (`needBundleSchema`), adopt the newly seeded `deck_data_version`.
            if (!stampChangedMidRender) {
              await base.query(`DELETE FROM live_page_bundles WHERE stamp != ?`, [effectiveStamp]);
              if (needPersistSubstrate && resolvedSubBundle !== undefined) {
                await base.query(
                  `INSERT INTO live_page_bundles (keep_key, page_key, stamp, payload_json)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(keep_key) DO UPDATE SET
                     page_key = excluded.page_key,
                     stamp = excluded.stamp,
                     payload_json = excluded.payload_json`,
                  [liveSubstrateBundleKey(scope), "__substrate__", effectiveStamp, JSON.stringify(resolvedSubBundle)],
                );
              }
              const delta =
                persistedSubBundle !== undefined
                  ? diffLivePageBundle(persistedSubBundle, discoveredBundle)
                  : discoveredBundle;
              let pageKey = page
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
              try {
                pageKey = DeckoName.parse(page).key;
              } catch {
              }
              await base.query(
                `INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)`,
                [key, pageKey, effectiveStamp, JSON.stringify(delta)],
              );
            }
          } catch (bundleErr) {
            const msg = String((bundleErr as Error)?.message ?? bundleErr);
            if (/readonly|read-only|not authorized|permission denied/i.test(msg)) {
              markDriverWithoutBundleTable(base);
            }
          }
        }
      }
      putKept(base, key, { live, stamp, seeds, eagerRefs, deniedRootKey, substrateEngine });
    } else {
      live.close();
    }
    resetBootCache();
    DeckoName.endRequestScope();
  }
}
