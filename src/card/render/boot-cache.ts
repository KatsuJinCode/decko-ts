// The engine's BOOT READ-SET, cached per CONTENT VERSION.
//
// WHAT THIS IS. A RenderEngine's first render folds three FIXED statements
// into its cold closure batch (src/card/render.ts, the coldSlots assembly):
// the codename codehash (DbCodenameRegistry#codehashStatement), the template
// type-name fold (rules/structure.ts#templateTypeNameStatement) and the head
// read-set (render/head-views.ts#headViewReadStatement). Their rows depend on
// nothing but the deck's content -- no viewer, no card, no round. They are
// also memoized PER ENGINE INSTANCE (`ruleTypeIds`, `defaultTypeNameById`,
// `headReadsWarmed`), so a process that builds many engines pays them once
// per engine, forever.
//
// That is the shape the deploy actually has. ActorRenderEngines
// (deploy/bunny-worker-src/bunny-edge-session-viewer.ts:171-200) keeps ONE
// RenderEngine per actor over a SHARED base fetcher, with insertion-order
// eviction at maxWarm=2: the third account evicts the first, and the first
// account's return builds a FRESH RenderEngine and pays the boot read-set
// again. The deck is one module instance; the engines are not.
//
// THE MECHANISM. A process-lifetime bundle of the three RESULT SETS, keyed on
// the deck's committed-write content version. An engine whose content version
// matches the bundle's installs the cached rows through the SAME parsers that
// consume live results (DbCodenameRegistry#foldCodehashResults,
// templateTypeNamesFromResults, RenderEngine#cacheHeadViewReads) and issues
// zero of the three statements. A version that has moved re-reads them.
//
// WHY A CONTENT VERSION AND NOT A TTL. deck_data_version is bumped by AFTER
// INSERT/UPDATE/DELETE triggers on cards + card_references -- the render
// caches' entire read surface -- so a committed write moves it regardless of
// which stream, process, or connection issued it. Correctness is therefore
// structural: cache validity is a fact about the storage layer's write
// history, not a guess about elapsed time. There is NO time window anywhere
// in this module, by design (the precedent it ports,
// deploy/bunny-worker-src/bunny-edge-content-cache.ts:26-33,:68-69, is
// epoch-scoped for the same reason -- and that one is an HTTP-response cache,
// so this port re-derives the result-set contract rather than copying it).
//
// WHY A MISS IS STILL CORRECT. The bundle holds RESULT SETS, not parsed
// state, so a replayed bundle runs the identical parse path a live result
// runs. Nothing downstream can observe whether the rows came from storage.
//
// LOUD, NOT SILENT. A database with no deck_data_version throws here rather
// than rendering: a skipped check is a silent staleness window, and this
// module's entire safety argument rests on the check running. Same convention
// as the freshness lane that owns the stamp (d19ec179).

import type { SQLDatabaseDriver, SQLQueryResult } from "../../server/driver.js";

/** The content-version read: one PK point SELECT, the exact statement the
 *  freshness lane's render gate pays (d19ec179, src/card/render.ts
 *  DECK_DATA_VERSION_STATEMENT). Carried here as its own constant because
 *  that commit is not on this branch; the two MUST stay byte-equal or the
 *  boot cache and the render gate would disagree about what "unchanged"
 *  means. The composition seam is named in the receipt. */
export const BOOT_VERSION_STATEMENT =
  'SELECT "version" FROM "deck_data_version" WHERE "id" = 1';

/** The three boot result sets, plus the content version they were read at and
 *  the CONNECTION they were read through.
 *
 *  `driver` is load-bearing, not bookkeeping. The content version is a
 *  per-DATABASE counter: a second database in the same process also starts at
 *  some small integer, so a version alone cannot tell two databases apart. An
 *  earlier shape of this module keyed on the version alone and served one
 *  test's database rows to the next test's engine in the same file — the
 *  date-error suite caught it (a corpus-shaped Date card stopped raising
 *  Date::Error because the replayed codehash carried the other deck's type
 *  ids). The rows were read through one connection to one deck; a bundle is
 *  only ever served to an engine reading through that same connection.
 *
 *  In every deploy the connection IS the deck for the isolate's lifetime (a
 *  Cloudflare D1 binding, a libSQL client, a better-sqlite3 handle), so this
 *  costs nothing there and closes the hole everywhere else.
 *
 *  `version: undefined` marks a PROVISIONAL bundle: read by an engine that
 *  had no version to compare against (a process whose first engine boots
 *  before any bundle exists). A provisional bundle is never served — it has
 *  not been tied to any storage state, so nothing vouches for it. Its only
 *  job is to make the process's boot cache WARM, which is what earns the next
 *  engine the right to run the version probe. Without it the cache could
 *  never start: the probe fires only when a bundle exists to compare against,
 *  and a bundle is only ever stored by an engine that read the rows. One
 *  engine pays the full read; the engine after it can finally version the
 *  bundle; every engine after that serves the rows for free. */
export interface BootBundle {
  readonly version: number | undefined;
  readonly driver: SQLDatabaseDriver;
  readonly codehash: SQLQueryResult;
  readonly typeNames: SQLQueryResult;
  readonly headReads: SQLQueryResult;
}

/** The process-lifetime slot. SINGLE-SLOT, not a map: a bundle is only ever
 *  valid at one version of one connection, and keeping older epochs would mean
 *  holding deck snapshots that can never be served. A version move, or a new
 *  connection, replaces it. */
let currentBundle: BootBundle | undefined;

/** The CONNECTION a driver argument names, for the bundle's identity keys.
 *  The bundle is per-CONNECTION (see bootCacheIsWarm); a delegating wrapper
 *  that publicly exposes the connection it forwards to — the one-trip replay
 *  plan router (`replayRouter.base`) — is that connection for identity
 *  purposes, or the cache would be cold for every FetchEngine after the one
 *  that happened to store the bundle (each FetchEngine wraps its driver in
 *  its own router; integration assembly r3, 2026-10-06, boot-cache pins PIN
 *  5). Terminal drivers expose no `base` and are their own connection. */
function bundleIdentityDriver(driver: SQLDatabaseDriver): SQLDatabaseDriver {
  const wrapper = driver as { readonly base?: SQLDatabaseDriver };
  return wrapper.base ?? driver;
}

/** Whether THIS connection has a bundle to compare a content version
 *  against. The render gate consults this before paying the probe statement
 *  at all: with no bundle in hand there is nothing a probe could match, so a
 *  connection that has never booted runs no probe and reads the boot read-set
 *  from storage exactly as it always has — one statement fewer than the
 *  version read it would cost, and zero behaviour change.
 *
 *  Per-CONNECTION, not per-process, and that is load-bearing rather than
 *  tidy. A probe against a bundle read through a different connection cannot
 *  hit by construction, so firing it would be a pure cost: an extra statement
 *  and an extra round trip for nothing. Test suites that open a fresh
 *  `:memory:` deck per case are the visible case (a fresh driver is a fresh
 *  connection), and depth-sweep measured the regression before this gate was
 *  per-connection: round trips 5 -> 6 at every one of 32 depths, with a
 *  zero-hit probe at each. */
export function bootCacheIsWarm(driver: SQLDatabaseDriver): boolean {
  return currentBundle !== undefined && currentBundle.driver === bundleIdentityDriver(driver);
}

/** The bundle this exact connection can serve at this exact content version,
 *  or undefined. A moved version is a MISS by construction — that is the whole
 *  invalidation story — a PROVISIONAL bundle (no version) is always a miss
 *  because nothing has vouched for the rows it holds, and a bundle read
 *  through a DIFFERENT connection is always a miss because the rows belong to
 *  another deck. */
export function bootBundleForVersion(
  driver: SQLDatabaseDriver,
  version: number,
): BootBundle | undefined {
  if (currentBundle === undefined) return undefined;
  if (currentBundle.driver !== bundleIdentityDriver(driver)) return undefined;
  if (currentBundle.version === undefined) return undefined;
  return currentBundle.version === version ? currentBundle : undefined;
}

/** Install the process slot. Called by the engine that actually read the
 *  rows from storage, with the version it observed — or with `undefined`
 *  when it had none to observe, which makes the bundle provisional. */
export function storeBootBundle(bundle: BootBundle): void {
  currentBundle = { ...bundle, driver: bundleIdentityDriver(bundle.driver) };
}

/** Drop the process slot. Test-only seam: the cache is module state, and a
 *  test that cannot clear it cannot measure a cold boot. Production has no
 *  caller -- invalidation is the content version's job, not a manual drop. */
export function resetBootCache(): void {
  currentBundle = undefined;
}

/** ONE statement: the deck's committed-write version. Throws LOUDLY when the
 *  stamp is missing or unparseable -- an unmigrated database must not render,
 *  because the cache's correctness argument is that this check ran. */
export async function readBootContentVersion(driver: SQLDatabaseDriver): Promise<number> {
  let rows: Array<{ version: unknown }>;
  try {
    const result = await driver.query<{ version: unknown }>(BOOT_VERSION_STATEMENT, []);
    rows = result.rows;
  } catch (error) {
    throw new Error(
      `deck_data_version unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const raw = rows[0]?.version;
  const version = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(version)) {
    throw new Error("deck_data_version unreadable: no version row");
  }
  return version;
}