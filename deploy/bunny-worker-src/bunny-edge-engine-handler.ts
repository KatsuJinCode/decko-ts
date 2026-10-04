// deploy/bunny-worker-src/bunny-edge-engine-handler.ts — the Bunny Edge
// full-engine request handler, EXTRACTED from bunny-edge-engine-entry.ts so
// it can be driven in-process (the entry itself calls
// BunnySDK.net.http.serve at module scope, which makes the entry
// un-importable: @bunny.net/edgescript-sdk is an edge-runtime dependency,
// not installed here — tests/deploy/deploy-origin-deck-inflection-boot.test.ts
// documents the constraint). The entry keeps ONLY the SDK registration and
// delegates here; tests/deploy/bunny-edge-engine-handler-parity.test.ts
// drives THIS module against the local fixture.
//
// Platform contract unchanged: web-standard Request/Response, credentials
// via the passed env bag (process.env on the edge), read-only surface.
//
// THE deploy-surface-union LANE (2026-10-03): this handler USED TO carry its
// own bare dispatch (parsePath -> engine.render -> layoutPage wrap, bare
// error pages) while the p2 lanes' tested serving surface rode alongside it
// UNWIRED (the fold-11 host carry + shim). This lane WIRES it: every
// non-/_status read request now dispatches through the carried request core
// (bunny-edge-engine-request.ts handleEngineRequest — the full page shell,
// the full-chrome error surfaces, the history seam with its wire-key
// translation, the /files attachment route, the /api/card read gate, the
// render budget) over the carried lineage URL grammar
// (bunny-edge-lineage-worker-surface.ts, now the union grammar — see that
// file's header). The boot is the union boot (below). The bare dispatch this
// replaces is superseded wholesale; its capabilities that the carried core
// lacked were PORTED INTO the carried core (the hardened /api/card decode,
// the ?view= query arm, the mapRenderError 404 family) — recorded per
// resolution in tmp/wrong-goal-hunt/deploy-union-lane.md. What deliberately
// does NOT ride (operator decision named, not this lane's to make): the
// deploy lineage's content-cache / cache-headers / session-viewer stack and
// the armed write surface — the read-only 403 posture below is unchanged,
// and the cache/session wrap is a strict-superset commit at the same call
// site when the operator names it.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { bootCorpusDeckEngines } from "./bunny-edge-deck-boot.js";
import {
  handleEngineRequest,
  json,
  resolveEdgePipelineTimeoutMs,
  resolveEdgeRenderBudgetMs,
  type Deck,
} from "./bunny-edge-engine-request.js";
import { SPACES_ASSET_HOST } from "./bunny-edge-page-shell.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the reader's WorkerEnv. */
export type EdgeEnv = Record<string, string | undefined>;

/** Credential name pairs accepted, documented pair first — same order and
 *  same rationale as the reader (bunny-worker.ts DB_CREDENTIAL_VAR_NAMES):
 *  BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN are the names bunny.net
 *  writes via "Add Secrets to Edge Script"; BUNNY_DB_URL / BUNNY_DB_TOKEN
 *  are this repo's historical names. */
const DB_CREDENTIAL_VAR_NAMES = [
  { url: "BUNNY_DATABASE_URL", token: "BUNNY_DATABASE_AUTH_TOKEN" },
  { url: "BUNNY_DB_URL", token: "BUNNY_DB_TOKEN" },
] as const;

interface ResolvedDbConfig {
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

// One deck per isolate (the Workers reuse pattern worker.ts uses): the first
// request boots the engine, later requests share the warm caches.
let deckPromise: Promise<Deck> | undefined;

/** THE UNION BOOT — the composition neither lineage carried alone:
 *
 *  - the carried corpus boot (bunny-edge-deck-boot.ts, the p2 lanes' tested
 *    boot): the deck inflection table applied BEFORE any name parse (the
 *    Rails-initializer moment; the graded edge cards' slot-class keys), the
 *    sync name environment install + codenames load, and the virtual-card
 *    rule universe wired over THIS boot's driver (the person-section fix —
 *    without the hook every structure-rule junction renders as missing, the
 *    measured 171px person-page drop);
 *  - plus the lexicon prime this line's serving boot has always run
 *    (installDeckNameEnvironment: junction-name composition over the full
 *    trash-0 scan, the id-mark /~<id> resolution warm — its
 *    installNameEnvironment + codenames.ensureLoaded calls are idempotent
 *    after the corpus boot's own);
 *  - plus the deploy lineage's two serving-boot fields the bare boot
 *    lacked: the per-pipeline hop timeout resolved off
 *    DECKO_EDGE_PIPELINE_TIMEOUT_MS (the P1 incident fix; needs the
 *    carried driver whose 0 maps to "no per-hop abort"), and
 *    render.imageCdnHost = SPACES_ASSET_HOST (the edge-site-shell lane —
 *    content images resolve exactly as live).
 */
async function bootDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  const driver = new BunnyDbDriver({
    url: config.url,
    authToken: config.authToken,
    timeoutMs: resolveEdgePipelineTimeoutMs(env),
  });
  const { fetcher, render } = await bootCorpusDeckEngines(driver);
  await installDeckNameEnvironment(driver, fetcher);
  render.imageCdnHost = SPACES_ASSET_HOST;
  return { fetcher, render };
}

function getDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  if (deckPromise === undefined) {
    deckPromise = bootDeck(config, env).catch((error) => {
      // Do not cache a failed boot: the next request retries (a transient
      // database hiccup on first hit must not poison the edge isolate).
      deckPromise = undefined;
      throw error;
    });
  }
  return deckPromise;
}

async function statusResponse(
  config: ResolvedDbConfig | { error: string },
  env: EdgeEnv,
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
        // Names only, never values.
        url_var: config.urlVar,
        token_var: config.tokenVar,
      },
      version: "2.0.0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(503, { ok: false, database: { ok: false, error: message } });
  }
}

/** The serve callback body: the Bunny SDK registration in
 *  bunny-edge-engine-entry.ts delegates every request here with the edge
 *  env bag. /_status stays ahead of the engine dispatch (a read route the
 *  request core does not own, byte-independent of the boot); everything
 *  else read-shaped goes through the carried request core, which owns the
 *  /api/status + /api/card branches, the /files route, the page path, and
 *  every error surface. */
export async function handleBunnyEngineRequest(
  request: Request,
  env: EdgeEnv,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Read-only edge: mirrors the Cloudflare worker with both write flags
    // unset (every non-GET/HEAD verb answers 403 and the engine is never
    // called).
    return json(403, { error: "forbidden: this edge deploy is read-only" });
  }

  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") === "/_status") {
    return await statusResponse(resolveDbConfig(env), env);
  }

  const resolved = resolveDbConfig(env);
  if ("error" in resolved) {
    return json(500, { error: "database credentials missing", detail: resolved.error });
  }

  // THE RENDER BUDGET (cold-render reliability): resolved off env —
  // DEFAULT_EDGE_RENDER_BUDGET_MS (20 s) unless DECKO_EDGE_RENDER_BUDGET_MS
  // retunes it; an explicit "0" is the operator's no-republish rollback to
  // unbounded. The carried core races the whole dispatch (database branches
  // included) against it and answers a trip with the retry-able full-chrome
  // 503.
  const deck = await getDeck(resolved, env);
  return await handleEngineRequest(request, deck, {
    budgetMs: resolveEdgeRenderBudgetMs(env),
  });
}
