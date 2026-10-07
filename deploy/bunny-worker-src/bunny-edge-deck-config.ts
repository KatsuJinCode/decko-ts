// deploy/bunny-worker-src/bunny-edge-deck-config.ts — the database
// configuration, the deck boot and the /_status answer, shared by the full
// engine handler (bunny-edge-engine-handler.ts) and the read-only handler
// (bunny-edge-read-handler.ts). Moved here unchanged from the full handler so
// the read-only bundle can use them without importing the write surface.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { probeRecordBoot } from "./bunny-edge-isolate-probe.js";
import {
  bootEdgeServingEngines,
  ONE_TRIP_BOOT_MAX_TEMPORARY_CACHE_KEYS,
} from "./bunny-edge-deck-boot.js";
import { oneTripWantsPayload } from "../../src/card/one-trip/render-gate.js";
import { json, resolveEdgePipelineTimeoutMs, type Deck } from "./bunny-edge-engine-request.js";
import {
  edgeDbTimingFetch,
  edgeDriverQueryCounter,
  type EdgeRequestProfile,
} from "./bunny-edge-server-timing.js";
import { serveWithEdgeCache, type EdgeCacheLike } from "./bunny-edge-content-cache.js";
import { withGlobalRenderCache, type GlobalRenderCache } from "./bunny-edge-global-render-cache.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the reader's WorkerEnv. */
export type EdgeEnv = Record<string, string | undefined>;

/** Credential name pairs accepted, PLAIN pair first (db-repoint lane,
 *  2026-10-05): DECKO_DB_URL / DECKO_DB_TOKEN are PLAIN edge-script
 *  variables — settable through the management API by name, no secrets
 *  round-trip — so the serving database can be repointed by a variables
 *  write alone. Empty/absent falls through to the secret pairs in their
 *  documented order, so an edge configured only with secrets resolves
 *  exactly as before this change. The lightweight reader
 *  (bunny-worker.ts DB_CREDENTIAL_VAR_NAMES) keeps its own order; this
 *  list is the full-engine handler's. BUNNY_DATABASE_URL /
 *  BUNNY_DATABASE_AUTH_TOKEN are the names bunny.net writes via "Add
 *  Secrets to Edge Script"; BUNNY_DB_URL / BUNNY_DB_TOKEN are this repo's
 *  historical names. Exported for the resolution-order tests, same as the
 *  reader's twin (bunny-edge-worker.test.ts imports that one). */
export const DB_CREDENTIAL_VAR_NAMES = [
  { url: "DECKO_DB_URL", token: "DECKO_DB_TOKEN" },
  { url: "BUNNY_DATABASE_URL", token: "BUNNY_DATABASE_AUTH_TOKEN" },
  { url: "BUNNY_DB_URL", token: "BUNNY_DB_TOKEN" },
] as const;

export interface ResolvedDbConfig {
  /** https(s) URL for the BunnyDbDriver pipeline endpoint. */
  url: string;
  authToken: string;
  /** Which env-var name pair supplied the values (names only, never
   *  values — echoed by /_status). */
  urlVar: string;
  tokenVar: string;
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolveDbConfig(env: EdgeEnv): ResolvedDbConfig | { error: string } {
  for (const names of DB_CREDENTIAL_VAR_NAMES) {
    const rawUrl = env[names.url];
    const token = env[names.token];
    if (isNonEmpty(rawUrl) && isNonEmpty(token)) {
      // Bunny injects the database URL as libsql://<id>.lite.bunnydb.net/ —
      // the libsql scheme @libsql/client/web rewrites to https: (runbook
      // section 5). BunnyDbDriver speaks raw fetch, so the rewrite happens
      // here. https:// URLs pass through untouched.
      const url = rawUrl.replace(/^libsql:\/\//i, "https://");
      return { url, authToken: token, urlVar: names.url, tokenVar: names.token };
    }
    if (isNonEmpty(rawUrl) || isNonEmpty(token)) {
      const present = isNonEmpty(rawUrl) ? names.url : names.token;
      return {
        error: `${present} is set but its partner (${
          isNonEmpty(rawUrl) ? names.token : names.url
        }) is not`,
      };
    }
  }
  return {
    error: `no database credentials in env; set ${DB_CREDENTIAL_VAR_NAMES[0].url} and ${DB_CREDENTIAL_VAR_NAMES[0].token}`,
  };
}

/** The isolate's database driver, built once and shared by the deck boot and
 *  the cookieless live page path (handleEngineRequest's DeferredDeck), which
 *  reads through it without waiting for a deck boot. Like the deck it is
 *  built from the first request's resolved config. Shared by both handlers;
 *  each script bundles its own copy, so each isolate has one. */
let isolateDriver: BunnyDbDriver | undefined;
export function getDriver(config: ResolvedDbConfig, env: EdgeEnv): BunnyDbDriver {
  isolateDriver ??= new BunnyDbDriver({
    url: config.url,
    authToken: config.authToken,
    timeoutMs: resolveEdgePipelineTimeoutMs(env),
    fetchImpl: edgeDbTimingFetch(),
    queryCounter: edgeDriverQueryCounter(),
  });
  return isolateDriver;
}

/** THE UNION BOOT — the composition neither lineage carried alone:
 *
 *  - the carried corpus boot (bunny-edge-deck-boot.ts, the p2 lanes' tested
 *    boot): the deck inflection table applied BEFORE any name parse (the
 *    Rails-initializer moment; the graded edge cards' slot-class keys), the
 *    sync name environment install + codenames load, and the virtual-card
 *    rule universe wired over THIS boot's driver (the person-section fix —
 *    without the hook every structure-rule junction renders as missing, the
 *    measured 171px person-page drop);
 *  - the deck-wide lexicon prime (installDeckNameEnvironment: junction-name
 *    composition over the full trash-0 scan) is OFF unless
 *    DECKO_EDGE_NAME_SCAN=1 — it cost round trips instead of saving them
 *    (bootEdgeServingEngines' doc carries the measurement);
 *  - plus the deploy lineage's two serving-boot fields the bare boot
 *    lacked: the per-pipeline hop timeout resolved off
 *    DECKO_EDGE_PIPELINE_TIMEOUT_MS (the P1 incident fix; needs the
 *    carried driver whose 0 maps to "no per-hop abort"), and
 *    render.imageCdnHost = SPACES_ASSET_HOST (the edge-site-shell lane —
 *    content images resolve exactly as live).
 */
export async function bootDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  // THE EDGE PROFILER (2026-10-05): the driver's two EXISTING instrumentation
  // seams are plugged at boot — `fetchImpl` times every pipeline POST into
  // the per-isolate db ledger (the driver's only network call is the
  // pipeline POST), `queryCounter` replaces the default NO-OP counter so
  // statements-that-hit-the-wire are countable per request (ledger deltas).
  // The timing wrapper resolves globalThis.fetch at CALL time, so in
  // production this is the platform fetch (behavior identical) and in the
  // vitest parity harness a stub installed before the first request still
  // runs. No query, no retry, no timeout semantics change.
  const driver = getDriver(config, env);
  // THE ONE-TRIP DEPLOYMENT BOOT: when the config gate is armed the engine
  // boots with the raised Temporary-cache cap (ONE_TRIP_BOOT_MAX_TEMPORARY_
  // CACHE_KEYS in bunny-edge-deck-boot.ts — the default cap's 10k reset is
  // measured to evict primed state mid-session and turn the ON posture
  // into a pessimization). Unarmed, the boot is byte-for-byte the deployed
  // default. The gate reads the process env (on the edge the env bag IS
  // process.env) — the same var the render path's seat check reads.
  // bootEdgeServingEngines: the corpus boot + imageCdnHost, without the
  // deck-wide name scan unless DECKO_EDGE_NAME_SCAN=1 (see its doc).
  return await bootEdgeServingEngines(
    driver,
    oneTripWantsPayload() ? { maxTemporaryCacheKeys: ONE_TRIP_BOOT_MAX_TEMPORARY_CACHE_KEYS } : {},
  );
}

export async function statusResponse(
  config: ResolvedDbConfig | { error: string },
  env: EdgeEnv,
  getDeck: (config: ResolvedDbConfig, env: EdgeEnv) => Promise<Deck>,
): Promise<Response> {
  if ("error" in config) {
    return json(500, { ok: false, error: "database credentials missing", detail: config.error });
  }
  try {
    const deck = await getDeck(config, env);
    const r = await deck.fetcher.driver.query<{ n: unknown }>(
      "SELECT COUNT(*) AS n FROM cards WHERE trash = 0",
      [],
    );
    const n = Number(r.rows[0]?.n);
    return json(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "bunny-edge-scripting",
      view: "full render engine (SUPPORTED_VIEWS dispatch + layout shell)",
      database: {
        ok: true,
        driver: "BunnyDbDriver (hrana v2 over fetch)",
        card_count: n,
        // Names only, never values. credential_source says WHICH KIND of
        // variable pair supplied the endpoint (the db-repoint lane's
        // plain-vs-secret distinction) — derivable from the names, reported
        // explicitly so post-publish verification can assert it.
        url_var: config.urlVar,
        token_var: config.tokenVar,
        credential_source: config.urlVar === "DECKO_DB_URL" ? "plain-variable" : "secret",
      },
      version: "2.0.0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(503, { ok: false, database: { ok: false, error: message } });
  }
}

/** ONE PROFILER SERVE SITE (edge-profiler lane, 2026-10-05): the prepared-
 *  page cache layer — the L2 Cache API match, the L3 global render-cache
 *  lookup, their write-through stores — is what the SEAT phase times: the
 *  serve-layer wall MINUS the render closure's wall. The subtraction is
 *  sound in a single-threaded isolate (the render's wall is strictly
 *  nested inside the serve layer's). The arguments reach
 *  serveWithEdgeCache / withGlobalRenderCache in the EXACT shapes the
 *  lineage call sites used (the two anonymous sites always constructed the
 *  withGlobalRenderCache closure — armed or not, its unarmed path is a
 *  byte-identical passthrough — and the signed-in site never did; each
 *  site's argument list here is the lineage's), so only timers are added.
 *  On a per-viewer request the caches are bypassed in both directions and
 *  seat collapses to the wrapper overhead — the honest reading of "the
 *  signed-in path skips the prepared-page stores". */
export async function serveProfiled(
  profile: EdgeRequestProfile,
  request: Request,
  env: EdgeEnv,
  render: () => Promise<Response>,
  cache: EdgeCacheLike | undefined,
  opts: { wrapGlobal?: boolean; globalCache?: GlobalRenderCache; perViewer?: boolean } = {},
): Promise<Response> {
  let renderMs = 0;
  const renderTimed = async (): Promise<Response> => {
    const r0 = Date.now();
    try {
      return await render();
    } finally {
      renderMs = Math.max(0, Date.now() - r0);
      profile.renderMs += renderMs;
    }
  };
  const wrapped =
    opts.wrapGlobal === true
      ? withGlobalRenderCache(request, env, opts.globalCache, renderTimed)
      : renderTimed;
  const seat0 = Date.now();
  const response =
    opts.perViewer === true
      ? await serveWithEdgeCache(request, env, wrapped, cache, { perViewer: true })
      : await serveWithEdgeCache(request, env, wrapped, cache);
  profile.seatMs += Math.max(0, Date.now() - seat0 - renderMs);
  return response;
}
