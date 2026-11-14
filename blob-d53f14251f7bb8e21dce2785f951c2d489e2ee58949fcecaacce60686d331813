// deploy/bunny-worker-src/bunny-edge-deck-config.ts — the database
// configuration, the deck boot and the /_status answer, shared by the full
// engine handler (bunny-edge-engine-handler.ts) and the read-only handler
// (bunny-edge-read-handler.ts). Moved here unchanged from the full handler so
// the read-only bundle can use them without importing the write surface.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { DeckoName } from "../../src/card/name.js";
import {
  ANONYMOUS_VIEWER,
  anonymousIdFromResults,
  hasPendingRuleFlags,
  readPermissionStateFromViewerResults,
  readPermissionStatements,
  type ReadViewer,
} from "../../src/card/permissions/index.js";
import { nameHasReadOverride } from "../../src/card/permissions/read-override.js";
import { permissionViewerKey } from "../../src/card/session/enabled-roles.js";
import { edgeHostLabels } from "./edge-host-labels.js";
import { probeRecordBoot } from "./bunny-edge-isolate-probe.js";
import {
  bootEdgeServingEngines,
  ONE_TRIP_BOOT_MAX_TEMPORARY_CACHE_KEYS,
} from "./bunny-edge-deck-boot.js";
import { oneTripWantsPayload } from "../../src/card/one-trip/render-gate.js";
import {
  resolveServedEnvironmentDeltas,
  servedBootOptions,
  servedDeltasAreEmpty,
} from "./bunny-edge-served-deltas.js";
import { json, resolveEdgePipelineTimeoutMs, type Deck } from "./bunny-edge-engine-request.js";
import {
  edgeDbTimingFetch,
  edgeDriverQueryCounter,
  type EdgeRequestProfile,
} from "./bunny-edge-server-timing.js";
import { serveWithEdgeCache, type EdgeCacheLike } from "./bunny-edge-content-cache.js";
import { buildIdentity } from "./bunny-edge-build-identity.js";
import { withGlobalRenderCache, type GlobalRenderCache } from "./bunny-edge-global-render-cache.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the reader's WorkerEnv. */
export type EdgeEnv = Record<string, string | undefined>;

/** Credential name pairs accepted, PLAIN pair first: DECKO_DB_URL /
 *  DECKO_DB_TOKEN are PLAIN edge-script variables — settable through the
 *  management API by name, no secrets round-trip — so the serving database
 *  can be repointed by a variables write alone. Empty/absent falls through to
 *  the secret pairs in their documented order, so an edge configured only with
 *  secrets resolves exactly as it did before the plain pair was accepted. The
 *  lightweight reader (bunny-worker.ts DB_CREDENTIAL_VAR_NAMES) keeps its own
 *  order; this list is the full-engine handler's. BUNNY_DATABASE_URL /
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
let isolateDriver: SQLDatabaseDriver | undefined;

/** THE DRIVER SEAM FOR OTHER HOSTS: the same handlers serve Cloudflare
 *  Workers over a D1 binding (deploy/cf-worker-src/cf-edge-engine-entry.ts).
 *  That entry installs a factory here once, at module load, before the
 *  first request; the isolate driver (and so both the deck boot and the
 *  cookieless live path) then reads through the driver it returns instead of
 *  BunnyDbDriver. Unset (every Bunny build), nothing changes. The factory is
 *  configuration, not request state: it holds no rows and no pages. */
export type EdgeDbDriverFactory = (env: EdgeEnv) => SQLDatabaseDriver;
let edgeDbDriverFactory: EdgeDbDriverFactory | undefined;
export function setEdgeDbDriverFactory(factory: EdgeDbDriverFactory | undefined): void {
  edgeDbDriverFactory = factory;
  isolateDriver = undefined;
}

export function getDriver(config: ResolvedDbConfig, env: EdgeEnv): SQLDatabaseDriver {
  if (edgeDbDriverFactory !== undefined) return (isolateDriver ??= edgeDbDriverFactory(env));
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
 *  - the carried deck boot (bunny-edge-deck-boot.ts): the deck inflection
 *    table applied BEFORE any name parse (the Rails-initializer moment; the
 *    graded edge cards' slot-class keys), the sync name environment install +
 *    codenames load, and the virtual-card rule universe wired over THIS
 *    boot's driver (without the hook every structure-rule junction renders as
 *    missing);
 *  - the deck-wide lexicon prime (installDeckNameEnvironment: junction-name
 *    composition over the full trash-0 scan) is OFF unless
 *    DECKO_EDGE_NAME_SCAN=1 — it cost round trips instead of saving them
 *    (bootEdgeServingEngines' doc carries the measurement);
 *  - plus the deploy lineage's two serving-boot fields the bare boot
 *    lacked: the per-pipeline hop timeout resolved off
 *    DECKO_EDGE_PIPELINE_TIMEOUT_MS (the P1 incident fix; needs the
 *    carried driver whose 0 maps to "no per-hop abort"), and
 *    render.imageCdnHost from the deployment's CONFIGURED asset host
 *    (content images resolve against the host
 *    this deployment serves from, not against one deck's hard-coded CDN
 *    bucket).
 *
 *  THE DECK ALSO CARRIES ITS SERVED DELTAS: bootDeck resolves
 *  them off the same env bag the credentials came from and hangs them on the
 *  Deck, so the page path's delta pass, the /files/ route and the error
 *  pages all read the same deployment configuration. A deployment that sets
 *  nothing gets the stock (empty) deltas — no footer version rewrite, no
 *  deck card ids, no configured asset references.
 */
export async function bootDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  // THE EDGE PROFILER: the driver's two EXISTING instrumentation
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
  // bootEdgeServingEngines: the deck boot + imageCdnHost, without the
  // deck-wide name scan unless DECKO_EDGE_NAME_SCAN=1 (see its doc).
  //
  // THE DEPLOYMENT'S SERVED DELTAS: resolved
  // here, once per isolate, off the same env bag the credentials came from,
  // and carried on the Deck so every serving surface reads one answer. With
  // no configuration this is the empty set and every delta pass is a no-op —
  // a stock deck, with no other deck's identity in its bytes.
  const servedDeltas = resolveServedEnvironmentDeltas(env);
  const engines = await bootEdgeServingEngines(driver, {
    ...(oneTripWantsPayload() ? { maxTemporaryCacheKeys: ONE_TRIP_BOOT_MAX_TEMPORARY_CACHE_KEYS } : {}),
    // The deck's asset host, phantom type, time zone (Ruby's Time.zone) and
    // configured origin (Ruby's Cardio.config.deck_origin, which card_url
    // prefixes onto the engine's own bytes). servedBootOptions is the single
    // derivation of these, shared with the request-local live render's boot
    // (bunny-edge-engine-request.ts), so every page arm of an isolate
    // renders from the same configuration.
    ...servedBootOptions(servedDeltas),
  });
  return { ...engines, servedDeltas };
}

const STATUS_COUNT_TTL_MS = 60_000;
const statusCountCache = new WeakMap<SQLDatabaseDriver, { count: number; expiresAt: number }>();

export async function statusResponse(
  config: ResolvedDbConfig | { error: string },
  env: EdgeEnv,
  _getDeck?: (config: ResolvedDbConfig, env: EdgeEnv) => Promise<Deck>,
): Promise<Response> {
  if ("error" in config) {
    return json(500, { ok: false, error: "database credentials missing", detail: config.error, build: buildIdentity() });
  }
  try {
    const driver = getDriver(config, env);
    const now = Date.now();
    const cached = statusCountCache.get(driver);
    let n: number;
    if (cached !== undefined && now < cached.expiresAt) {
      n = cached.count;
    } else {
      const r = await driver.query<{ n: unknown }>("SELECT COUNT(*) AS n FROM cards WHERE trash = 0", []);
      n = Number(r.rows[0]?.n);
      if (Number.isFinite(n)) {
        statusCountCache.set(driver, { count: n, expiresAt: now + STATUS_COUNT_TTL_MS });
      }
    }
    const host = edgeHostLabels();
    // THE DEPLOYMENT'S DECK IDENTITY, AS A BOOLEAN: whether the
    // served deltas carry any configuration at all. Names and counts only —
    // never a configured VALUE, which can be a private URL — so /_status
    // stays safe to expose while still letting an operator confirm that a
    // deployment is serving configured (or stock) bytes.
    const deltas = resolveServedEnvironmentDeltas(env);
    const servedIdentity = {
      configured: !servedDeltasAreEmpty(deltas),
      configured_fields: Object.keys(deltas).sort(),
    };
    if (host.binding !== undefined) {
      // A binding-backed host (Cloudflare D1): no credential variables are
      // involved, so report the binding instead of their names.
      return json(200, {
        ok: true,
        engine: "decko-ts",
        runtime: host.runtime,
        view: "full render engine (SUPPORTED_VIEWS dispatch + layout shell)",
        database: { ok: true, driver: host.driver, card_count: n, binding: host.binding },
        served_identity: servedIdentity,
        build: buildIdentity(),
        version: "2.0.0",
      });
    }
    return json(200, {
      ok: true,
      engine: "decko-ts",
      runtime: host.runtime,
      view: "full render engine (SUPPORTED_VIEWS dispatch + layout shell)",
      served_identity: servedIdentity,
      build: buildIdentity(),
      database: {
        ok: true,
        driver: host.driver,
        card_count: n,
        // Names only, never values. credential_source says WHICH KIND of
        // variable pair supplied the endpoint (the plain-vs-secret
        // distinction) — derivable from the names, reported
        // explicitly so post-publish verification can assert it.
        url_var: config.urlVar,
        token_var: config.tokenVar,
        credential_source: config.urlVar === "DECKO_DB_URL" ? "plain-variable" : "secret",
      },
      version: "2.0.0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(503, { ok: false, database: { ok: false, error: message }, build: buildIdentity() });
  }
}

/** ONE PROFILER SERVE SITE: the prepared-
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

interface CachedAutocompleteScope {
  stamp: number;
  alwaysOk: boolean;
  readRuleIds: number[];
}

const autocompleteScopeCache = new WeakMap<SQLDatabaseDriver, Map<string, CachedAutocompleteScope>>();
const AUTOCOMPLETE_VERSION_SQL = 'SELECT "version" FROM "deck_data_version" WHERE "id" = 1';

async function runDriverBatch(
  driver: SQLDatabaseDriver,
  statements: ReadonlyArray<{ sql: string; params?: unknown[] }>,
) {
  if (typeof driver.batch === "function") {
    return driver.batch([...statements]);
  }
  const results = [];
  for (const s of statements) {
    results.push(await driver.query(s.sql, s.params));
  }
  return results;
}

async function fetchAutocompleteScope(
  driver: SQLDatabaseDriver,
  viewer: ReadViewer,
  extraStatement?: { sql: string; params: unknown[] },
): Promise<{ scope: CachedAutocompleteScope; extraRows?: Array<{ id: number; name: string; read_rule_id: number | null }> }> {
  const statements = readPermissionStatements(viewer);
  let stamp = 1;
  let permResults;
  let extraRows: Array<{ id: number; name: string; read_rule_id: number | null }> | undefined;
  const tail = extraStatement !== undefined ? [extraStatement] : [];
  try {
    const batch = await runDriverBatch(driver, [{ sql: AUTOCOMPLETE_VERSION_SQL, params: [] }, ...statements, ...tail]);
    const v = Number((batch[0]?.rows[0] as { version?: unknown } | undefined)?.version);
    if (Number.isFinite(v)) stamp = v;
    permResults = batch.slice(1, 1 + statements.length);
    if (extraStatement !== undefined) {
      extraRows = (batch[1 + statements.length]?.rows ?? []) as Array<{ id: number; name: string; read_rule_id: number | null }>;
    }
  } catch (error) {
    if (!/no such table[^\n]*deck_data_version/i.test(String(error))) throw error;
    const batch = await runDriverBatch(driver, [...statements, ...tail]);
    permResults = batch.slice(0, statements.length);
    if (extraStatement !== undefined) {
      extraRows = (batch[statements.length]?.rows ?? []) as Array<{ id: number; name: string; read_rule_id: number | null }>;
    }
  }
  const effectiveViewer: ReadViewer =
    viewer.signedIn === true ? viewer : { signedIn: false, actorId: anonymousIdFromResults(permResults) };
  const state = readPermissionStateFromViewerResults(permResults, effectiveViewer);
  const resolved: CachedAutocompleteScope = {
    stamp,
    alwaysOk: state.alwaysOk,
    readRuleIds: [...state.readableRuleIds],
  };
  let byViewer = autocompleteScopeCache.get(driver);
  if (byViewer === undefined) {
    byViewer = new Map();
    autocompleteScopeCache.set(driver, byViewer);
  }
  byViewer.set(permissionViewerKey(viewer), resolved);
  return { scope: resolved, extraRows };
}

export async function edgeNameMatchResponse(
  request: Request,
  url: URL,
  driver: SQLDatabaseDriver,
  getFallbackDeck: () => Promise<Deck>,
  viewer: ReadViewer = ANONYMOUS_VIEWER,
): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const path = decodeURIComponent(url.pathname);
  if (!path.endsWith(".json")) return null;
  const view = url.searchParams.get("view");
  if (view !== "name_match" && view !== "name_complete") return null;
  const rawTerm = (url.searchParams.get("term") ?? url.searchParams.get("query[keyword]") ?? "").trim();
  const names = await matchingCardNamesFast(
    driver,
    getFallbackDeck,
    viewer,
    rawTerm.toLowerCase(),
    view !== "name_complete",
  );
  return new Response(JSON.stringify(names), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function matchingCardNamesFast(
  driver: SQLDatabaseDriver,
  getFallbackDeck: () => Promise<Deck>,
  viewer: ReadViewer,
  term: string,
  contains: boolean,
): Promise<string[]> {
  const limit = 8;
  const maxScanned = 64;
  const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const escaped = like(term);
  const prefixPattern = `${escaped}%`;
  const wherePattern = contains && term !== "" ? `%${escaped}%` : prefixPattern;
  const orderSql =
    contains && term !== ""
      ? "order by case when lower(name) like ? escape '\\' then 0 else 1 end, name"
      : "order by name";

  const viewerKey = permissionViewerKey(viewer);
  let scope = autocompleteScopeCache.get(driver)?.get(viewerKey);
  let verifiedStamp = false;
  let prefetchedColdRows: Array<{ id: number; name: string; read_rule_id: number | null }> | undefined;
  const coldCandidateLimit = 32;
  if (scope === undefined) {
    const coldStmt = {
      sql: `select id, name, read_rule_id from cards where trash = 0 and name is not null and lower(name) like ? escape '\\' ${orderSql} limit ? offset 0`,
      params: [
        wherePattern,
        ...(contains && term !== "" ? [prefixPattern] : []),
        coldCandidateLimit,
      ],
    };
    const fetched = await fetchAutocompleteScope(driver, viewer, coldStmt);
    scope = fetched.scope;
    prefetchedColdRows = fetched.extraRows;
    verifiedStamp = true;
  }

  const names: string[] = [];
  let offset = 0;
  let scanned = 0;
  let fallbackDeck: Deck | undefined;

  while (names.length < limit && scanned < maxScanned) {
    const buildSelect = (s: CachedAutocompleteScope) => {
      const readRuleSql = s.alwaysOk
        ? ""
        : ` and read_rule_id in (${s.readRuleIds.map(() => "?").join(",") || "NULL"})`;
      return {
        sql: `select id, name, read_rule_id from cards where trash = 0 and name is not null and lower(name) like ? escape '\\'${readRuleSql} ${orderSql} limit ? offset ?`,
        params: [
          wherePattern,
          ...(s.alwaysOk ? [] : s.readRuleIds),
          ...(contains && term !== "" ? [prefixPattern] : []),
          limit,
          offset,
        ],
      };
    };

    let rows: Array<{ id: number; name: string; read_rule_id: number | null }>;
    let rowBatchSize = limit;
    if (prefetchedColdRows !== undefined) {
      const ruleSet = scope.alwaysOk ? undefined : new Set(scope.readRuleIds);
      rowBatchSize = coldCandidateLimit;
      rows = prefetchedColdRows;
      prefetchedColdRows = undefined;
      if (ruleSet !== undefined) {
        const rawCount = rows.length;
        rows = rows.filter((r) => r.read_rule_id != null && ruleSet.has(Number(r.read_rule_id)));
        if (rawCount < coldCandidateLimit) {
          rowBatchSize = rows.length + 1;
        }
      }
    } else if (!verifiedStamp) {
      verifiedStamp = true;
      const stmt = buildSelect(scope);
      try {
        const batch = await runDriverBatch(driver, [{ sql: AUTOCOMPLETE_VERSION_SQL, params: [] }, stmt]);
        const v = Number((batch[0]?.rows[0] as { version?: unknown } | undefined)?.version);
        if (!Number.isFinite(v) || v === scope.stamp) {
          rows = (batch[1]?.rows ?? []) as Array<{ id: number; name: string; read_rule_id: number | null }>;
        } else {
          const fetched = await fetchAutocompleteScope(driver, viewer);
          scope = fetched.scope;
          const refreshed = buildSelect(scope);
          const r = await driver.query<{ id: number; name: string; read_rule_id: number | null }>(
            refreshed.sql,
            refreshed.params,
          );
          rows = r.rows;
        }
      } catch (error) {
        if (!/no such table[^\n]*deck_data_version/i.test(String(error))) throw error;
        const r = await driver.query<{ id: number; name: string; read_rule_id: number | null }>(stmt.sql, stmt.params);
        rows = r.rows;
      }
    } else {
      const stmt = buildSelect(scope);
      const r = await driver.query<{ id: number; name: string; read_rule_id: number | null }>(stmt.sql, stmt.params);
      rows = r.rows;
    }

    scanned += rows.length;
    const pendingFlags = hasPendingRuleFlags(driver);
    for (const row of rows) {
      let needsDeckCheck = pendingFlags || (!scope.alwaysOk && (row.read_rule_id === null || row.read_rule_id === undefined));
      if (!needsDeckCheck && !scope.alwaysOk) {
        try {
          needsDeckCheck = nameHasReadOverride(DeckoName.parse(row.name));
        } catch {
          needsDeckCheck = true;
        }
      }
      if (!needsDeckCheck) {
        names.push(row.name);
      } else {
        if (fallbackDeck === undefined) {
          fallbackDeck = await getFallbackDeck();
          await fallbackDeck.render.ensureFreshness();
        }
        const record = await fallbackDeck.fetcher.fetchById(row.id);
        if (record !== undefined && (await fallbackDeck.render.canReadCard(record))) {
          names.push(row.name);
        }
      }
      if (names.length === limit) break;
    }
    if (rows.length < rowBatchSize) break;
    offset += rowBatchSize;
  }
  return names;
}
