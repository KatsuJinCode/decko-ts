// deploy/bunny-worker-src/bunny-edge-read-handler.ts — the lean Bunny/Cloudflare
// serving handler: serves BOTH anonymous and signed-in page reads, admin views,
// edit forms, card-name autocomplete, token/API-key reads, and sign-out directly
// on the lean ~1.34 MiB worker (reusing the shared page substrate across pages),
// forwarding only card-mutating write actions, /_signin, /setup, and /mod/ static
// vendor packs on demand to DECKO_EDGE_FULL_URL.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import { SESSION_COOKIE_NAME } from "../../src/card/auth/session-cookie.js";
import type { TokenRuntimeConfig } from "../../src/card/auth/token.js";
import { withVisitorEnabledRoles } from "../../src/card/session/enabled-roles.js";
import { readVisitorSession } from "../../src/card/session/visitor-session.js";
import { requestApiKey, requestToken } from "../../src/server/request-authenticators.js";
import { originPolicyFromEnv } from "../../src/server/request-origin.js";
import {
  ActorRenderEngines,
  EDGE_SIGNOUT_PATH,
  handleEdgeSignout,
  resolveViewerFromAuthenticators,
  sessionTokenFromRequest,
} from "./bunny-edge-session-viewer.js";
import {
  bootDeck,
  edgeNameMatchResponse,
  getDriver,
  resolveDbConfig,
  serveProfiled,
  statusResponse,
  type EdgeEnv,
  type ResolvedDbConfig,
} from "./bunny-edge-deck-config.js";
import { probeArmed, probeHeaderValue, probeRecordBoot, probeRoute } from "./bunny-edge-isolate-probe.js";
import { resolveServedEnvironmentDeltas, servedBootOptionsFromEnv } from "./bunny-edge-served-deltas.js";
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

export const READ_EDGE_SESSION_COOKIE = SESSION_COOKIE_NAME;

/** Paths the full write/compiler script owns at every method. */
const FORWARDED_PATHS = new Set(["/_signin", "/setup"]);

/** True when this request mutates state or requests static vendor packs owned by the full engine. */
export function readEdgeForwards(request: Request): boolean {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/+/, "/").replace(/\/+$/, "");
  if (path === EDGE_SIGNOUT_PATH && (request.method === "GET" || request.method === "POST")) {
    return false;
  }
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  if (FORWARDED_PATHS.has(path)) return true;
  if (path.startsWith("/mod/") || /^\/(?:card\/)?(?:delete|update)\/[^/]+$/.test(path)) return true;
  if (path.startsWith("/files/") && !/^\/files\/\d+\/[^/]+$/.test(path)) return true;
  return false;
}

let deckPromise: Promise<Deck> | undefined;
let actorEngines: ActorRenderEngines | undefined;

function edgeTokenConfig(env: EdgeEnv): TokenRuntimeConfig | undefined {
  const secret = env.DECKO_TOKEN_SECRET;
  if (typeof secret !== "string" || secret === "") return undefined;
  return { secret };
}

function getDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  if (deckPromise === undefined) {
    const boot0 = Date.now();
    deckPromise = bootDeck(config, env)
      .then((deck) => {
        deck.render.tokenConfig = edgeTokenConfig(env);
        probeRecordBoot(Date.now() - boot0);
        actorEngines = new ActorRenderEngines(deck);
        return deck;
      })
      .catch((error) => {
        deckPromise = undefined;
        throw error;
      });
  }
  return deckPromise;
}

function getActorEngines(): ActorRenderEngines {
  if (actorEngines === undefined) {
    throw new Error("lean edge: actor engine registry asked for before the deck booted");
  }
  return actorEngines;
}

/** Forward to the full engine script on demand when a write/admin-compiler route is invoked. */
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
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== null) {
    init.body = request.body;
    (init as RequestInit & { duplex?: "half" }).duplex = "half";
  }
  const upstream = await fetch(target, init);
  const out = new Headers(upstream.headers);
  if (typeof (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function") {
    out.delete("set-cookie");
    for (const cookie of (upstream.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()) {
      out.append("set-cookie", cookie);
    }
  }
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");
  const location = out.get("location");
  if (location !== null && !location.startsWith("/")) {
    try {
      const l = new URL(location, target);
      if (l.host === target.host) {
        l.protocol = url.protocol;
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

async function routeRead(request: Request, env: EdgeEnv, profile: EdgeRequestProfile): Promise<Response> {
  const url = new URL(request.url);
  const cleanPath = url.pathname.replace(/^\/+/, "/").replace(/\/+$/, "");
  if (cleanPath === "/_status") {
    return await statusResponse(resolveDbConfig(env), env, getDeck);
  }
  const resolved = resolveDbConfig(env);
  if ("error" in resolved) {
    return json(500, { error: "database credentials missing", detail: resolved.error });
  }
  if (cleanPath === EDGE_SIGNOUT_PATH) {
    const signoutDeck = await getDeck(resolved, env);
    const signout = await handleEdgeSignout(
      signoutDeck,
      request,
      originPolicyFromEnv({
        DECKO_ORIGIN_CHECK: env.DECKO_ORIGIN_CHECK,
        DECKO_TRUSTED_ORIGINS: env.DECKO_TRUSTED_ORIGINS,
      }),
    );
    if (signout !== null) return signout;
  }

  const renderBudgetMs = resolveEdgeRenderBudgetMs(env);
  const auth0 = Date.now();
  const sessionToken = sessionTokenFromRequest(request);
  const headerToken = requestToken(
    { authorization: request.headers.get("authorization") },
    url.searchParams,
  );
  const headerApiKey = requestApiKey(
    { "x-api-key": request.headers.get("x-api-key") },
    url.searchParams,
  );

  if (sessionToken === null && headerToken === null && headerApiKey === null) {
    profile.authMs += Math.max(0, Date.now() - auth0);
    if (
      request.method === "GET" &&
      url.pathname.endsWith(".json") &&
      ["name_match", "name_complete"].includes(url.searchParams.get("view") ?? "")
    ) {
      const match = await edgeNameMatchResponse(request, url, getDriver(resolved, env), () => getDeck(resolved, env));
      if (match !== null) return match;
    }
    return await serveProfiled(
      profile,
      request,
      env,
      async () =>
        handleEngineRequest(
          request,
          { driver: getDriver(resolved, env), deck: () => getDeck(resolved, env), servedDeltas: resolveServedEnvironmentDeltas(env) },
          {
            budgetMs: renderBudgetMs,
            anonymous: true,
            liveRenderFlag: env.DECKO_LIVE_RENDER,
            servedBootOptions: servedBootOptionsFromEnv(env),
          },
        ),
      resolveEdgeContentCache(env),
      { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved, getDriver(resolved, env)) },
    );
  }

  // Signed-in session cookie, JWT token, or API key: resolve viewer right here
  // on the lean worker over the driver without eagerly booting the non-live Deck.
  const driver = getDriver(resolved, env);
  const viewerAuth0 = Date.now();
  const authenticators = await resolveViewerFromAuthenticators(
    request,
    new SessionStore({ driver }),
    edgeTokenConfig(env),
    driver,
  );
  if (authenticators.kind === "denied") {
    profile.authMs += Math.max(0, Date.now() - viewerAuth0);
    return json(403, { error: "permission denied", reason: authenticators.reason });
  }
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  let viewer = authenticators.viewer;
  if (viewer.signedIn && viewer.actorId !== undefined && Object.keys(readVisitorSession(cookieHeader).cards).length > 0) {
    const deck = await getDeck(resolved, env);
    viewer = await withVisitorEnabledRoles(
      deck.fetcher,
      viewer,
      cookieHeader,
      () => deck.render.ensureFreshness(),
    );
  }
  profile.authMs += Math.max(0, Date.now() - viewerAuth0);

  if (viewer.signedIn !== true) {
    const match = await edgeNameMatchResponse(request, url, driver, () => getDeck(resolved, env));
    if (match !== null) return match;
    return await serveProfiled(
      profile,
      request,
      env,
      async () =>
        handleEngineRequest(
          request,
          { driver, deck: () => getDeck(resolved, env), servedDeltas: resolveServedEnvironmentDeltas(env) },
          {
            budgetMs: renderBudgetMs,
            anonymous: true,
            liveRenderFlag: env.DECKO_LIVE_RENDER,
            servedBootOptions: servedBootOptionsFromEnv(env),
          },
        ),
      resolveEdgeContentCache(env),
      { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved, driver) },
    );
  }

  const getActorDeck = async () => {
    await getDeck(resolved, env);
    return getActorEngines().deckFor(viewer.actorId as number, viewer.enabledRoleIds);
  };
  const nameMatch = await edgeNameMatchResponse(request, url, driver, getActorDeck, viewer);
  if (nameMatch !== null) return nameMatch;
  return await serveProfiled(
    profile,
    request,
    env,
    async () =>
      handleEngineRequest(
        request,
        { driver, deck: getActorDeck, servedDeltas: resolveServedEnvironmentDeltas(env) },
        {
          budgetMs: renderBudgetMs,
          viewer,
          liveRenderFlag: env.DECKO_LIVE_RENDER,
          servedBootOptions: servedBootOptionsFromEnv(env),
        },
      ),
    resolveEdgeContentCache(env),
    { perViewer: true },
  );
}
