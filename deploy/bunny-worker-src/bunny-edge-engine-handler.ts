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
// resolution in an internal work log
//
// THE edge-session-cache-stack CARRY LANE (2026-10-03, the operator-named
// strict-superset add at THIS call site): the deploy lineage's cache/session
// stack now rides here, carried VERBATIM from 12bd5236 (bunny-edge-
// content-cache.ts, bunny-edge-cache-headers.ts, bunny-edge-session-viewer.ts
// — commit a6a8cff2) and wired in the lineage entry's own dispatch order
// (bunny-edge-engine-entry.ts:288-442):
//   /_status -> /_signout mount (ABOVE the write surface — mount-order fact:
//   matchRoute claims a bare POST /_signout as create-card "signout",
//   write-routes.ts:491-493, the measured union-2 incident) -> the armed
//   write surface (DECKO_WRITE_PATH/DECKO_FIRST_RUN via
//   bunnyEdgeWriteArmed; the AUTH routes — POST /update/*signin, GET|POST
//   /_signout — dispatch at every flag state, edge-signin-form-fix lane:
//   auth is not a card write) -> the read-only 403 -> the session-aware,
//   cache-wrapped engine path. The union boot, budget and request core are
//   unchanged underneath the wrap. OFF-default independence: DECKO_EDGE_CACHE
//   (cache layers, strict "1") and the write gates are separate switches from
//   the one-trip config gate (fold-12, also OFF-default) — three independent
//   postures, none implies another. Unarmed + cookieless + read-verb is the
//   byte-identical union path: a Cookie header scan finds nothing,
//   serveWithEdgeCache calls render() directly, no cache contact, no extra
//   headers. Receipt: an internal work log

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import {
  bootDeck,
  getDriver,
  resolveDbConfig,
  serveProfiled,
  statusResponse,
  type EdgeEnv,
  type ResolvedDbConfig,
} from "./bunny-edge-deck-config.js";
export { DB_CREDENTIAL_VAR_NAMES, resolveDbConfig, type EdgeEnv } from "./bunny-edge-deck-config.js";
import { probeArmed, probeHeaderValue, probeRecordBoot, probeRoute } from "./bunny-edge-isolate-probe.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import {
  bunnyEdgeWriteArmed,
  mountBunnyEdgeWriteSurface,
} from "./bunny-edge-signin-session-surface.js";
import {
  ActorRenderEngines,
  handleEdgeSignout,
  resolveViewerFromToken,
  sessionTokenFromRequest,
} from "./bunny-edge-session-viewer.js";
import { resolveEdgeContentCache } from "./bunny-edge-content-cache.js";
import { getGlobalRenderCache } from "./bunny-edge-global-render-cache.js";
import {
  handleEngineRequest,
  json,
  resolveEdgeRenderBudgetMs,
  type Deck,
} from "./bunny-edge-engine-request.js";
import {
  applyEdgeServerTimingHeader,
  edgeDbTimingFetch,
  startEdgeRequestProfile,
  type EdgeRequestProfile,
} from "./bunny-edge-server-timing.js";

// One deck per isolate (the Workers reuse pattern worker.ts uses): the first
// request boots the engine, later requests share the warm caches.
let deckPromise: Promise<Deck> | undefined;

// The signed-in engines, one per actor, over the shared deck's FetchEngine.
// Populated only by requests that arrive with a session cookie, so an edge
// that never sees one never allocates one. See bunny-edge-session-viewer.ts
// for why the session needs its own engine rather than a mutable viewer
// field (the permission state memoizes per engine) — the same shape the
// staging host runs at vm-staging-server.mjs:2535-2548.
let actorEngines: ActorRenderEngines | undefined;


function getDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  if (deckPromise === undefined) {
    const boot0 = Date.now();
    deckPromise = bootDeck(config, env)
      .then((deck) => {
        probeRecordBoot(Date.now() - boot0);
        // The actor engine registry hangs off the booted deck exactly as the
        // lineage entry's sync boot did (bunny-edge-engine-entry.ts:238):
        // built once per isolate, only reachable by cookie-carrying requests
        // (every serve-callback call site awaits getDeck first).
        actorEngines = new ActorRenderEngines(deck);
        return deck;
      })
      .catch((error) => {
        // Do not cache a failed boot: the next request retries (a transient
        // database hiccup on first hit must not poison the edge isolate).
        deckPromise = undefined;
        throw error;
      });
  }
  return deckPromise;
}

/** The actor engine registry. Ask only AFTER getDeck has booted the deck —
 *  every call site in the serve callback awaits it first. */
function getActorEngines(): ActorRenderEngines {
  if (actorEngines === undefined) {
    // Unreachable through the serve callback (getDeck always sets it), but
    // a named failure beats a null dereference.
    throw new Error("bunny edge: actor engine registry asked for before the deck booted");
  }
  return actorEngines;
}


/** The serve callback body: the Bunny SDK registration in
 *  bunny-edge-engine-entry.ts delegates every request here with the edge
 *  env bag. The dispatch order is the deploy lineage entry's own
 *  (bunny-edge-engine-entry.ts:288-442), carried as the strict superset at
 *  this call site:
 *
 *   1. /_status — ahead of everything, so its bytes stay independent of the
 *      write gate (a read route neither the write surface nor the request
 *      core owns);
 *   2. the /_signout mount — ABOVE the write surface on purpose (mount-order
 *      fact, measured live: matchRoute claims a bare `POST /_signout` as
 *      create-card "signout", write-routes.ts:491-493). Ungated: a session
 *      this edge's own ungated sign-in minted must be revocable on the same
 *      terms — auth is not a card write. The handler is read-shaped (revokes
 *      the CALLER'S OWN row, touches no cards) and the path test is one
 *      string compare ahead of any driver work;
 *   3. the armed write surface — mounted when DECKO_WRITE_PATH (or
 *      DECKO_FIRST_RUN) is armed, or the verb is not a read (so the UNGATED
 *      auth routes — POST /update/*signin — can dispatch; the mount's own
 *      short-circuit keeps an unarmed edge's non-auth routes on the 403
 *      below without answering writes from here);
 *   4. the read-only 403 — every non-GET/HEAD that fell through, the union's
 *      read-only posture unchanged;
 *   5. the engine path — session-aware and cache-wrapped: a cookieless
 *      request does one Cookie-header scan and takes the union's byte path
 *      through serveWithEdgeCache (unarmed = render() direct, no cache
 *      contact, no extra headers); a cookie resolves through the SAME
 *      SessionStore.lookupSession SQL the write path uses, and only a
 *      SIGNED-IN viewer renders through its own actor engine (per-viewer
 *      cache bypass in both directions — the cache key is the URL alone).
 *
 *  The request core underneath (handleEngineRequest) owns the /api/status +
 *  /api/card branches, the /files route, the page path, and every error
 *  surface — unchanged by this carry.
 *
 *  (This comment documents the DISPATCH ORDER of routeBunnyEngineRequest —
 *  the body the exported PROFILER WRAPPER below wraps and labels.) */

/** THE PROFILER WRAPPER (edge-profiler lane, 2026-10-05): the route body
 *  runs unchanged behind this one wrapper — a profile starts at entry, and
 *  the finished response gains ONE header, `Server-Timing: auth;dur=X,
 *  seat;dur=Y, db;dur=Z;stmt=N, render;dur=W, total;dur=T` (the standard
 *  header; profilers read it natively). The phase semantics and the honest
 *  per-isolate attribution contract live in bunny-edge-server-timing.ts's
 *  header comment. A route throw (a failed first boot) propagates exactly
 *  as before — no Response exists to label. Only the read path's phases
 *  carry dedicated timers; every response class (/_status, the 403, the
 *  write surface) still gets total + the db aggregate from this wrapper. */
export async function handleBunnyEngineRequest(
  request: Request,
  env: EdgeEnv,
): Promise<Response> {
  const profile = startEdgeRequestProfile();
  if (probeArmed(env)) {
    // Measurement-only (bunny-edge-isolate-probe.ts): never armed on live.
    const probed = await probeRoute(new URL(request.url), async () => {
      const cfg = resolveDbConfig(env);
      if ("error" in cfg) throw new Error(cfg.error);
      const driver = new BunnyDbDriver({ url: cfg.url, authToken: cfg.authToken, fetchImpl: edgeDbTimingFetch() });
      return (sql: string) => driver.query(sql, []);
    });
    const response = probed ?? (await routeBunnyEngineRequest(request, env, profile));
    try {
      response.headers.set("x-decko-isolate", probeHeaderValue());
    } catch {
      /* immutable headers: unlabeled */
    }
    return applyEdgeServerTimingHeader(profile, response);
  }
  const response = await routeBunnyEngineRequest(request, env, profile);
  return applyEdgeServerTimingHeader(profile, response);
}

/** The serve route body — the dispatch order documented above, unchanged
 *  byte-for-byte; only PROFILER timers are added. auth times the session
 *  resolution below; seat times the cache layer outside the render closure
 *  at the three serve sites; render times the render closures; db rides
 *  the driver's ledger seams (bootDeck + the L3 tier). */
async function routeBunnyEngineRequest(
  request: Request,
  env: EdgeEnv,
  profile: EdgeRequestProfile,
): Promise<Response> {
  const isReadVerb = request.method === "GET" || request.method === "HEAD";

  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") === "/_status") {
    // Ahead of the write surface, as it always was: /_status is a read route
    // the surface does not own, and answering it here keeps its bytes
    // independent of whether the write gate is armed.
    return await statusResponse(resolveDbConfig(env), env, getDeck);
  }

  const writeArmed = bunnyEdgeWriteArmed(env);

  // Sign-out — the OTHER half of the session surface, and the one the
  // edge did not have at all: sign-in minted an auth_sessions row and
  // nothing on this host could ever revoke it (clearedSessionCookieHeader
  // had exactly one caller repo-wide, and it was on the staging host).
  // GET|POST /_signout -> revoke the row + clear the cookie.
  //
  // UNgated (edge-signin-form-fix lane, 2026-10-03): a session this edge's
  // own sign-in minted must be revocable on the same terms — auth is not a
  // card write, and gating sign-out behind DECKO_WRITE_PATH while sign-in
  // runs ungated would strand live sessions. The handler itself is
  // read-shaped: it revokes the CALLER'S OWN session row (or answers
  // revoked:false) and never touches cards.
  //
  // MOUNT ORDER — fixed live 2026-10-03 (union-2 lane proof): this mount
  // sits ABOVE the write surface because matchRoute claims a bare
  // `POST /_signout` as create-card "signout" (write-routes.ts:491-493:
  // single-segment POST path, no create/update/delete prefix). Measured on
  // the first union-2 release: POST /_signout 303'd, CREATED the card, the
  // session stayed live, and the second POST 422'd "name is already taken:
  // signout". The path test below is one string compare and runs before any
  // driver work, so a non-sign-out request still boots no deck here and the
  // cache fast path below stays boot-free.
  if (url.pathname.replace(/\/+$/, "") === "/_signout") {
    const signoutConfig = resolveDbConfig(env);
    if (!("error" in signoutConfig)) {
      const signoutDeck = await getDeck(signoutConfig, env);
      const signout = await handleEdgeSignout(signoutDeck, request);
      if (signout !== null) return signout;
    }
  }

  // The sign-in + session surface, mounted ONLY when the operator armed it.
  // DECKO_WRITE_PATH=1 on the edge script is the whole switch; it is the same
  // gate name and the same meaning the Cloudflare host reads off its [vars]
  // (cloudflare-write-routes.ts:150-158), so the write surface, the session
  // cookie, and the auth_sessions reads/writes all ride the existing
  // BunnyDbDriver seam. Unarmed, this branch is one env read and a boolean:
  // no deck boot, no query, and the read path below runs exactly as it did —
  // EXCEPT the one disarm-time exception the mount itself owns (the ungated
  // login action), which is why non-read verbs enter the branch too.
  if (writeArmed || !isReadVerb) {
    const writeConfig = resolveDbConfig(env);
    if (!("error" in writeConfig)) {
      const writeDeck = await getDeck(writeConfig, env);
      const surface = await mountBunnyEdgeWriteSurface(writeDeck, request, env);
      if (surface !== null) return surface;
    }
  }

  if (!isReadVerb) {
    // Reached only when the write gate is unset (or the request is not a
    // route the surface owns). This is the read-only edge's original answer,
    // unchanged and still reached with no driver work behind it.
    return json(403, { error: "forbidden: this edge deploy is read-only" });
  }

  const resolved = resolveDbConfig(env);
  if ("error" in resolved) {
    return json(500, { error: "database credentials missing", detail: resolved.error });
  }

  // Content caching (armed only under DECKO_EDGE_CACHE=1), two layers behind
  // one flag at this single wrap site — the engine path only; /_status
  // (above), the 403 (above) and every non-200 keep the constructors'
  // no-store in both modes:
  //   L2 script-side Cache API (bunny-edge-content-cache.ts): match before
  //     render, store cacheable 200s after — skips the render and its
  //     Bunny-DB round-trips on hits. Exists because the outer Bunny layer
  //     was MEASURED rewriting script Cache-Control to `no-cache` (so L1
  //     alone cannot keep the script off the hot path).
  //   L1 response headers (bunny-edge-cache-headers.ts): public, max-age=0,
  //     s-maxage=<ttl> on 200 card pages + /api/card/* — harmless today
  //     under the measured rewrite, decisive if a future zone config honors
  //     origin cache headers.
  // Unarmed, serveWithEdgeCache just calls render(): byte-identical behavior
  // to the previous release, no cache contact, no extra headers.
  //
  // SESSION (edge-session-viewer lane): the cache key is the request URL
  // alone, with no actor in it, so a signed-in render must bypass this
  // cache in both directions — see EdgeCacheOptions.perViewer. Anonymous
  // requests reach the identical call as before.
  //
  // The BYTE-IDENTITY fast path is the whole of the no-cookie case: read
  // the Cookie header (a string scan), find nothing, and call the
  // pre-session expression verbatim — same engine object, no session
  // query, no extra allocation. Everything below the `token === null` test
  // only runs for a request that actually carries a cookie.
  //
  // RENDER BUDGET (cold-render reliability, 2026-10-03, the union's own
  // posture): the budget is resolved ONCE here, off env, and handed to every
  // handleEngineRequest call below. A cold render is a ~1,000-hop serial
  // database chain whose wall time had no upper bound in code; the deadline
  // bounds it and answers a slow request with a retry-able 503 + Retry-After
  // instead of leaving the platform to end it with an opaque 5xx after a
  // long wait. See DEFAULT_EDGE_RENDER_BUDGET_MS for the measurement behind
  // the number and DECKO_EDGE_RENDER_BUDGET_MS for the no-republish retune.
  const renderBudgetMs = resolveEdgeRenderBudgetMs(env);

  // AUTH PHASE (profiler, 2026-10-05): the session-resolution wall.
  // Cookieless that is the Cookie scan alone (sub-ms); a cookie resolves
  // through the SessionStore lookup SQL, timed at its own call below (the
  // one-time deck boot between them is isolate setup — it lands in total,
  // not in a phase).
  const auth0 = Date.now();
  const sessionToken = sessionTokenFromRequest(request);
  if (sessionToken === null) {
    profile.authMs += Math.max(0, Date.now() - auth0);
    return await serveProfiled(
      profile,
      request,
      env,
      async () =>
        // The deck boots only if this request needs it (DeferredDeck): a
        // page served live reads through the driver alone.
        handleEngineRequest(request, { driver: getDriver(resolved, env), deck: () => getDeck(resolved, env) }, {
          budgetMs: renderBudgetMs,
          // Cookieless: the request-local live render may serve it
          // (liveRenderApplies; DECKO_LIVE_RENDER=0 turns it off).
          anonymous: true,
          liveRenderFlag: env.DECKO_LIVE_RENDER,
        }),
      resolveEdgeContentCache(env),
      { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved) },
    );
  }

  // A cookie is present. Resolve it through the SAME SessionStore
  // lookupSession SQL the write path uses (session-store.ts:132-161), over
  // the shared BunnyDbDriver. Absent/invalid/expired/revoked all come back
  // as ANONYMOUS_VIEWER, and that case takes the anonymous engine through
  // the identical cache call above.
  const deck = await getDeck(resolved, env);
  const viewerAuth0 = Date.now();
  const viewer = await resolveViewerFromToken(
    sessionToken,
    new SessionStore({ driver: deck.fetcher.driver }),
  );
  profile.authMs += Math.max(0, Date.now() - viewerAuth0);
  if (viewer.signedIn !== true) {
    return await serveProfiled(
      profile,
      request,
      env,
      async () => handleEngineRequest(request, deck, { budgetMs: renderBudgetMs }),
      resolveEdgeContentCache(env),
      { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved) },
    );
  }
  return await serveProfiled(
    profile,
    request,
    env,
    async () =>
      handleEngineRequest(request, getActorEngines().deckFor(viewer.actorId as number), {
        budgetMs: renderBudgetMs,
      }),
    resolveEdgeContentCache(env),
    { perViewer: true },
  );
}

