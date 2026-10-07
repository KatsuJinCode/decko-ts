// deploy/bunny-worker-src/bunny-edge-read-handler.ts — the READ-ONLY Bunny
// edge handler: anonymous page reads only, everything else forwarded to the
// full engine script.
//
// WHY A SECOND SCRIPT: on Bunny most requests land on a fresh isolate, and a
// fresh isolate pays to load the whole bundle before the first line runs.
// Measured on staging (recovery/speed-team/platform.md): deleting code cuts
// that cost, and the write surface (sign-in, sessions, the action engine,
// card writes, setup) is about a third of the full bundle that no anonymous
// page read can reach. A script is one file on Bunny, and Bunny refuses
// dynamic import() of data:/blob: modules, so the write code cannot be
// loaded on demand inside one script. This handler's bundle leaves it out;
// the full engine script (bunny-edge-engine-handler.ts, unchanged in
// behaviour) still serves every request this one forwards.
//
// SERVED HERE, through exactly the code the full handler runs for the same
// request (the shared serveProfiled, getDeck boot and statusResponse in
// bunny-edge-deck-config.ts, and handleEngineRequest):
//   - GET/HEAD without a session cookie: /_status and every engine route
//     (pages, /:card/:view, ?view=, /new/<type>, /api/*, /files);
//   - the isolate probe routes, when DECKO_EDGE_ISOLATE_PROBE=1.
// FORWARDED, unchanged, to DECKO_EDGE_FULL_URL (the full script's own host):
//   - every method other than GET/HEAD (writes, the sign-in action);
//   - any request carrying the session cookie (signed-in rendering resolves
//     the session there, exactly as before);
//   - /_signin, /_signout and /setup at any method.
// A forwarded response comes back as the full script answered it; a redirect
// Location naming the full script's host is rewritten to this request's
// host, so the visitor stays on the site's own address.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import {
  bootDeck,
  resolveDbConfig,
  serveProfiled,
  statusResponse,
  type EdgeEnv,
  type ResolvedDbConfig,
} from "./bunny-edge-deck-config.js";
import { probeArmed, probeHeaderValue, probeRecordBoot, probeRoute } from "./bunny-edge-isolate-probe.js";
import { resolveEdgeContentCache } from "./bunny-edge-content-cache.js";
import { getGlobalRenderCache } from "./bunny-edge-global-render-cache.js";
import { handleEngineRequest, json, resolveEdgeRenderBudgetMs, type Deck } from "./bunny-edge-engine-request.js";
import {
  applyEdgeServerTimingHeader,
  edgeDbTimingFetch,
  startEdgeRequestProfile,
  type EdgeRequestProfile,
} from "./bunny-edge-server-timing.js";

export type { EdgeEnv } from "./bunny-edge-deck-config.js";

/** The session cookie's name (src/server/write-routes.ts SESSION_COOKIE_NAME;
 *  not imported, since that module is the write surface this bundle leaves
 *  out — tests/deploy/bunny-edge-read-handler.test.ts pins the two equal). */
export const READ_EDGE_SESSION_COOKIE = "decko_ts_session";

/** Paths the full script owns at every method. */
const FORWARDED_PATHS = new Set(["/_signin", "/_signout", "/setup"]);

/** True when this request must be answered by the full engine script. */
export function readEdgeForwards(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (FORWARDED_PATHS.has(path)) return true;
  const cookie = request.headers.get("cookie");
  return cookie !== null && cookie.includes(`${READ_EDGE_SESSION_COOKIE}=`);
}

// One deck per isolate, as in the full handler (no actor engines here: a
// signed-in request never reaches this script's renderer).
let deckPromise: Promise<Deck> | undefined;

function getDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  if (deckPromise === undefined) {
    const boot0 = Date.now();
    deckPromise = bootDeck(config, env)
      .then((deck) => {
        probeRecordBoot(Date.now() - boot0);
        return deck;
      })
      .catch((error) => {
        // Do not keep a failed boot: the next request retries.
        deckPromise = undefined;
        throw error;
      });
  }
  return deckPromise;
}

/** Forward to the full engine script. Hop-by-hop and encoding headers are
 *  dropped from the answer (the runtime's fetch has already decoded the
 *  body). */
export async function forwardToFullEngine(request: Request, env: EdgeEnv): Promise<Response> {
  const base = env.DECKO_EDGE_FULL_URL;
  if (base === undefined || base === "") {
    return json(500, { error: "read-only edge: DECKO_EDGE_FULL_URL is not set" });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, base);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("x-forwarded-host", url.host);
  const init: RequestInit = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const upstream = await fetch(target, init);
  const out = new Headers(upstream.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");
  const location = out.get("location");
  if (location !== null) {
    try {
      const l = new URL(location, target);
      if (l.host === target.host) {
        l.host = url.host;
        out.set("location", l.toString());
      }
    } catch {
      /* not a URL: leave it */
    }
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export async function handleBunnyReadRequest(request: Request, env: EdgeEnv): Promise<Response> {
  const profile = startEdgeRequestProfile();
  let probed: Response | null = null;
  if (probeArmed(env)) {
    // Measurement-only (bunny-edge-isolate-probe.ts): never armed on live.
    probed = await probeRoute(new URL(request.url), async () => {
      const cfg = resolveDbConfig(env);
      if ("error" in cfg) throw new Error(cfg.error);
      const driver = new BunnyDbDriver({ url: cfg.url, authToken: cfg.authToken, fetchImpl: edgeDbTimingFetch() });
      return (sql: string) => driver.query(sql, []);
    });
  }
  const response = probed ?? (readEdgeForwards(request)
    ? await forwardToFullEngine(request, env)
    : await routeRead(request, env, profile));
  if (probeArmed(env)) {
    try {
      response.headers.set("x-decko-isolate", probeHeaderValue());
    } catch {
      /* immutable headers: unlabeled */
    }
  }
  return applyEdgeServerTimingHeader(profile, response);
}

/** The full handler's cookieless GET/HEAD path, verbatim in behaviour:
 *  /_status, then the cache-wrapped anonymous render. */
async function routeRead(request: Request, env: EdgeEnv, profile: EdgeRequestProfile): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") === "/_status") {
    return await statusResponse(resolveDbConfig(env), env, getDeck);
  }
  const resolved = resolveDbConfig(env);
  if ("error" in resolved) {
    return json(500, { error: "database credentials missing", detail: resolved.error });
  }
  const renderBudgetMs = resolveEdgeRenderBudgetMs(env);
  return await serveProfiled(
    profile,
    request,
    env,
    async () =>
      handleEngineRequest(request, await getDeck(resolved, env), {
        budgetMs: renderBudgetMs,
        anonymous: true,
        liveRenderFlag: env.DECKO_LIVE_RENDER,
      }),
    resolveEdgeContentCache(env),
    { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved) },
  );
}
