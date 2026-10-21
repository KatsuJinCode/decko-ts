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
// DISPATCH OWNERSHIP: this handler used to carry its own bare dispatch
// (parsePath -> engine.render -> layoutPage wrap, bare error pages). It now
// delegates every non-/_status read request to the request core
// (bunny-edge-engine-request.ts handleEngineRequest — the full page shell,
// the full-chrome error surfaces, the history seam with its wire-key
// translation, the /files attachment route, the /api/card read gate, the
// render budget) over the URL grammar in bunny-edge-lineage-worker-surface.ts.
// The boot is the union boot (below). The bare dispatch is superseded
// wholesale; the capabilities it had that the core lacked were PORTED INTO
// the core (the hardened /api/card decode, the ?view= query arm, the
// mapRenderError 404 family).
//
// The cache/session stack rides here too — the content cache, the cache
// headers and the session viewer — wired in the entry's own dispatch order
// (bunny-edge-engine-entry.ts:288-442):
//   /_status -> /_signout mount (ABOVE the write surface — mount-order fact:
//   matchRoute claims a bare POST /_signout as create-card "signout",
//   write-routes.ts:491-493) -> the armed write surface
//   (DECKO_WRITE_PATH/DECKO_FIRST_RUN via bunnyEdgeWriteArmed; the AUTH
//   routes — POST /update/*signin, GET|POST /_signout — dispatch at every
//   flag state: auth is not a card write) -> the read-only 403 -> the
//   session-aware, cache-wrapped engine path. The union boot, budget and
//   request core are unchanged underneath the wrap. OFF-default
//   independence: DECKO_EDGE_CACHE (cache layers, strict "1") and the write
//   gates are separate switches from the one-trip config gate — three
//   independent postures, none implies another. Unarmed + cookieless +
//   read-verb is the byte-identical path: a Cookie header scan finds
//   nothing, serveWithEdgeCache calls render() directly, no cache contact,
//   no extra cache headers. Stock HTTP security defaults are applied at the
//   outer response boundary, independently of the cache and write switches.

import { TINYMCE_NEST_PLUGIN_JS } from "./bunny-edge-tinymce-nest-plugin.js";
import { withStockResponseSecurity } from "../../src/server/stock-response-security.js";
import { serveFontAwesomeAsset } from "../../src/server/font-awesome-assets.js";
import { serveBootstrapFontAsset } from "../../src/server/bootstrap-font-assets.js";
import { configureFontAwesomeMode } from "../../src/card/render/font-awesome.js";
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
import { servedBootOptionsFromEnv } from "./bunny-edge-served-deltas.js";
export { setEdgeDbDriverFactory, type EdgeDbDriverFactory } from "./bunny-edge-deck-config.js";
import { probeArmed, probeHeaderValue, probeRecordBoot, probeRoute } from "./bunny-edge-isolate-probe.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import { withVisitorEnabledRoles } from "../../src/card/session/enabled-roles.js";
import {
  bunnyEdgeWriteArmed,
  bunnyEdgeWriteFlags,
  mountBunnyEdgeWriteSurface,
} from "./bunny-edge-signin-session-surface.js";
import { applySecuritySettings, type WorkersWriteContext } from "../../src/server/cloudflare-write-routes.js";
import { handleAttachmentRoute, handleStockCodedAttachmentRoute } from "../../src/server/file-routes.js";
import type { BlobAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import {
  EdgeSweepClock,
  bunnyEdgeAttachmentStore,
  bunnyEdgeFilesDriver,
  BUNNY_FILES_AREA_DIAGNOSIS,
  maybeRunEdgeSweep,
} from "./bunny-edge-files.js";
import {
  ActorRenderEngines,
  handleEdgeSignout,
  resolveViewerFromAuthenticators,
  resolveViewerFromToken,
  sessionTokenFromRequest,
} from "./bunny-edge-session-viewer.js";
import { requestToken } from "../../src/server/request-authenticators.js";
import type { TokenRuntimeConfig } from "../../src/card/auth/token.js";
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

/** TinyMCE's asset base as the deck's editor config names it, and the
 *  published distribution of the same version that answers for it. */
const TINYMCE_MOD_PREFIX = "/mod/tinymce_editor/";
// (the deck's own nest plugin is served from bunny-edge-tinymce-nest-plugin.ts)
const TINYMCE_DIST_BASE = "https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/";

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

// The periodic sweep's per-isolate clock (bunny-edge-files.ts): this host has
// no cron trigger, so the first write-surface request of the day runs it.
const sweepClock = new EdgeSweepClock();

/** GET/HEAD /files/... — the stored bytes, served from the Bunny Storage zone
 *  through the shared route module (src/server/file-routes.ts), gated per
 *  request by the card's read rule; the same composition worker.ts runs over
 *  R2. Returns null for a path the route does not own. */
async function serveStoredFile(request: Request, deck: Deck, store: BlobAttachmentStore): Promise<Response | null> {
  return handleAttachmentRoute(request, {
    driver: deck.fetcher.driver,
    fetchEngine: deck.fetcher,
    attachmentStore: store,
    createEngine: () => {
      throw new Error("the Bunny edge /files route serves reads only; uploads ride the write surface");
    },
    canReadCard: async (cardId) => {
      const record = await deck.fetcher.fetchById(cardId);
      if (record === undefined) return false;
      const typeRecord = record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
      return deck.render.canReadCard(record, typeRecord?.name?.s);
    },
  });
}


function getDeck(config: ResolvedDbConfig, env: EdgeEnv): Promise<Deck> {
  if (deckPromise === undefined) {
    const boot0 = Date.now();
    deckPromise = bootDeck(config, env)
      .then((deck) => {
        deck.render.fontAwesomeAssetMode = configureFontAwesomeMode(env.DECKO_FONT_AWESOME);
        // THE TOKEN SIGNING SECRET: the read path's token authenticator
        // (rest.rb:37-47) validates a JWT against Ruby's
        // `Rails.application.credentials.secret_key_base`, which the card
        // gem reads at auth/token.rb:7. The edge env bag carries it under
        // DECKO_TOKEN_SECRET, the same variable name the staging host uses
        // (vm-staging-server.mjs:1365). Unset, the token arm is not armed:
        // the edge cannot validate a token, so a request that carries one
        // is served exactly as the session says, which is the behavior
        // before this row.
        deck.render.tokenConfig = edgeTokenConfig(env);
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

/** The edge's token signing secret, or undefined when the env bag carries
 *  none. The VALUE is never logged, echoed or returned: only the presence
 *  decides whether the token arm runs. */
function edgeTokenConfig(env: EdgeEnv): TokenRuntimeConfig | undefined {
  const secret = env.DECKO_TOKEN_SECRET;
  if (typeof secret !== "string" || secret === "") return undefined;
  return { secret };
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

/** THE PROFILER WRAPPER: the route body
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
  services: { accountMail?: WorkersWriteContext["accountMail"] } = {},
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
    const response = probed ?? (await routeBunnyEngineRequest(request, env, profile, services));
    try {
      response.headers.set("x-decko-isolate", probeHeaderValue());
    } catch {
      /* immutable headers: unlabeled */
    }
    return withStockResponseSecurity(applyEdgeServerTimingHeader(profile, response));
  }
  const response = await routeBunnyEngineRequest(request, env, profile, services);
  return withStockResponseSecurity(applyEdgeServerTimingHeader(profile, response));
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
  services: { accountMail?: WorkersWriteContext["accountMail"] },
): Promise<Response> {
  // Decko routes GET /delete/:mark to the delete action (the edit form's
  // Delete button is a confirm-guarded remote GET link); the write surface
  // takes deletes as DELETE. The navbar's Sign out link is GET
  // /delete/*signin, which the surface signs out as a DELETE too.
  const deletePath = new URL(request.url).pathname;
  if (request.method === "GET" && /^\/delete\/[^/]+$/.test(deletePath)) {
    request = new Request(request.url, { method: "DELETE", headers: request.headers });
  }
  const isReadVerb = request.method === "GET" || request.method === "HEAD";

  const url = new URL(request.url);
  const vendorAsset = serveFontAwesomeAsset(request) ?? serveBootstrapFontAsset(request);
  if (vendorAsset !== undefined) return vendorAsset;
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
  // UNgated: a session this edge's
  // own sign-in minted must be revocable on the same terms — auth is not a
  // card write, and gating sign-out behind DECKO_WRITE_PATH while sign-in
  // runs ungated would strand live sessions. The handler itself is
  // read-shaped: it revokes the CALLER'S OWN session row (or answers
  // revoked:false) and never touches cards. NOT ungated to the ORIGIN
  // check: the surface now runs the same
  // checkRequestOrigin policy the write routes and sign-in run
  // (docs/SECURITY.md's row names sign-out among the origin-checked
  // requests) — a cross-site GET/POST is refused 403 before the session
  // row is touched; same-origin and address-bar navigations pass.
  //
  // MOUNT ORDER — fixed on the first combined release: this mount
  // sits ABOVE the write surface because matchRoute claims a bare
  // `POST /_signout` as create-card "signout" (write-routes.ts:491-493:
  // single-segment POST path, no create/update/delete prefix). Measured on
  // that release: POST /_signout 303'd, CREATED the card, the
  // session stayed live, and the second POST 422'd "name is already taken:
  // signout". The path test below is one string compare and runs before any
  // driver work, so a non-sign-out request still boots no deck here and the
  // cache fast path below stays boot-free.
  if (url.pathname.replace(/\/+$/, "") === "/_signout") {
    const signoutConfig = resolveDbConfig(env);
    if (!("error" in signoutConfig)) {
      const signoutDeck = await getDeck(signoutConfig, env);
      // THE ORIGIN GATE'S POLICY: the SAME
      // OriginPolicy derivation the write surface below runs its
      // requests through (applySecuritySettings over this host's env —
      // DECKO_ORIGIN_CHECK / DECKO_TRUSTED_ORIGINS), so sign-in,
      // sign-out and the writes answer one origin policy per host.
      const signout = await handleEdgeSignout(
        signoutDeck,
        request,
        applySecuritySettings(bunnyEdgeWriteFlags(env)),
      );
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
      if (!isReadVerb) {
        // The periodic sweep rides write-surface requests only, at most once
        // a day per isolate (bunny-edge-files.ts); reads never pay for it.
        await maybeRunEdgeSweep(sweepClock, {
          driver: writeDeck.fetcher.driver,
          ...(bunnyFilesOrUndefined(env) ?? {}),
        });
      }
      const attachmentStore = bunnyEdgeAttachmentStore(env);
      const surface = await mountBunnyEdgeWriteSurface(
        { ...writeDeck, ...(attachmentStore === undefined ? {} : { attachmentStore }),
          // The files-area sentence for THIS host. A script deployed without
          // the storage pair leaves attachmentStore undefined, and the save
          // then fails at finalizeAttachment. Before the write surface's error
          // boundary that throw escaped to the runtime as a body-less 500, so
          // this exact misconfiguration was indistinguishable from any other
          // edge upload fault; naming the three variables here makes the 500
          // body self-diagnosing.
          attachmentStoreDiagnosis: BUNNY_FILES_AREA_DIAGNOSIS,
          ...(services.accountMail === undefined ? {} : { accountMail: services.accountMail }) },
        request,
        env,
      );
      if (surface !== null) return surface;
    }
  }

  if (!isReadVerb) {
    // Reached only when the write gate is unset (or the request is not a
    // route the surface owns). This is the read-only edge's original answer,
    // unchanged and still reached with no driver work behind it.
    return json(403, { error: "forbidden: this edge deploy is read-only" });
  }

  // TinyMCE's lazy-loaded theme, skin, icon and plugin files. The editor
  // resolves them under its baseURL (/mod/tinymce_editor), which Ruby serves
  // from the mod's public folder; this host has no copy, so it redirects to
  // the published 5.10.7 distribution the deck's editor script was built from.
  if (url.pathname.startsWith(TINYMCE_MOD_PREFIX) && (request.method === "GET" || request.method === "HEAD")) {
    const rest = url.pathname.slice(TINYMCE_MOD_PREFIX.length);
    if (rest === "plugins/nest/plugin.min.js") {
      return new Response(request.method === "HEAD" ? null : TINYMCE_NEST_PLUGIN_JS, {
        status: 200,
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=86400" },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { location: `${TINYMCE_DIST_BASE}${rest}`, "cache-control": "public, max-age=86400" },
    });
  }

  const resolved = resolveDbConfig(env);
  if ("error" in resolved) {
    return json(500, { error: "database credentials missing", detail: resolved.error });
  }

  // Stored files (uploads, renditions, compiled stylesheets) when a storage
  // zone is configured; otherwise the request core's own /files/ arm below
  // answers, as it did before this host had storage.
  if (url.pathname.startsWith("/files/")) {
    const deck = await getDeck(resolved, env);
    const fileViewer = await withVisitorEnabledRoles(deck.fetcher,
      await resolveViewerFromToken(sessionTokenFromRequest(request), new SessionStore({ driver: deck.fetcher.driver })),
      request.headers.get("cookie") ?? undefined, () => deck.render.ensureFreshness());
    const readDeck = fileViewer.signedIn === true ? getActorEngines().deckFor(fileViewer.actorId as number, fileViewer.enabledRoleIds) : deck;
    await readDeck.render.ensureFreshness();
    const coded = await handleStockCodedAttachmentRoute(request, {
      driver: deck.fetcher.driver, fetchEngine: deck.fetcher,
      canReadCard: async id => {
        const record = await deck.fetcher.fetchById(id);
        if (!record) return false;
        const type = record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
        return readDeck.render.canReadCard(record, type?.name?.s);
      },
    });
    if (coded !== null) return coded;
    const store = bunnyEdgeAttachmentStore(env);
    if (store !== undefined) {
      const served = await serveStoredFile(request, readDeck, store);
      if (served !== null) return served;
    }
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
  // SESSION: the cache key is the request URL
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
  // RENDER BUDGET (cold-render reliability): the budget is resolved ONCE here, off env, and handed to every
  // handleEngineRequest call below. A cold render is a ~1,000-hop serial
  // database chain whose wall time had no upper bound in code; the deadline
  // bounds it and answers a slow request with a retry-able 503 + Retry-After
  // instead of leaving the platform to end it with an opaque 5xx after a
  // long wait. See DEFAULT_EDGE_RENDER_BUDGET_MS for the measurement behind
  // the number and DECKO_EDGE_RENDER_BUDGET_MS for the no-republish retune.
  const renderBudgetMs = resolveEdgeRenderBudgetMs(env);

  // AUTH PHASE (profiler): the session-resolution wall.
  // Cookieless that is the Cookie scan alone (sub-ms); a cookie resolves
  // through the SessionStore lookup SQL, timed at its own call below (the
  // one-time deck boot between them is isolate setup — it lands in total,
  // not in a phase).
  const auth0 = Date.now();
  const sessionToken = sessionTokenFromRequest(request);
  // THE TOKEN AUTHENTICATOR (rest.rb:37-47): the Authorization header's
  // Token/Bearer value, or the ?token= param, is the FIRST authenticator,
  // ahead of the session cookie. This is a header scan and a query-param
  // read: no database contact, no deck boot, nothing that would change the
  // cookieless bytes. A request with NEITHER a cookie NOR a token keeps the
  // byte-identical anonymous path below.
  const headerToken = requestToken(
    { authorization: request.headers.get("authorization") },
    url.searchParams,
  );
  if (sessionToken === null && headerToken === null) {
    profile.authMs += Math.max(0, Date.now() - auth0);
    if (request.method === "GET" && url.pathname.endsWith(".json") &&
        ["name_match", "name_complete"].includes(url.searchParams.get("view") ?? "")) {
      const match = await nameMatchResponse(request, url, await getDeck(resolved, env));
      if (match !== null) return match;
    }
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
          servedBootOptions: servedBootOptionsFromEnv(env),
        }),
      resolveEdgeContentCache(env),
      { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved) },
    );
  }

  // A cookie OR a token is present. The authenticators run in Ruby's order
  // (rest.rb:37-50, auth/current.rb:50-63): the token first, the session
  // second. The session arm resolves through the SAME SessionStore
  // lookupSession SQL the write path uses (session-store.ts:132-161), over
  // the shared BunnyDbDriver. Absent/invalid/expired/revoked all come back
  // as ANONYMOUS_VIEWER, and that case takes the anonymous engine through
  // the identical cache call above.
  const deck = await getDeck(resolved, env);
  const viewerAuth0 = Date.now();
  const authenticators = await resolveViewerFromAuthenticators(
    request,
    new SessionStore({ driver: deck.fetcher.driver }),
    deck.render.tokenConfig,
  );
  if (authenticators.kind === "denied") {
    profile.authMs += Math.max(0, Date.now() - viewerAuth0);
    // Ruby answers 403 for a token that does not validate (auth/token.rb:18-23
    // raises Card::Error::PermissionDenied, which the controller's error
    // handling maps to the denial view). The port's read path has no
    // denial-VIEW renderer for a failure that happens before any card is
    // parsed, so the denial answers in the read path's own 403 JSON shape.
    return json(403, { error: "permission denied", reason: authenticators.reason });
  }
  const authenticatedViewer = authenticators.viewer;
  const viewer = await withVisitorEnabledRoles(deck.fetcher, authenticatedViewer,
    request.headers.get("cookie") ?? undefined, () => deck.render.ensureFreshness());
  profile.authMs += Math.max(0, Date.now() - viewerAuth0);
  if (viewer.signedIn !== true) {
    const match = await nameMatchResponse(request, url, deck);
    if (match !== null) return match;
    return await serveProfiled(
      profile,
      request,
      env,
      async () => handleEngineRequest(request, deck, {
        budgetMs: renderBudgetMs,
        // A failed session lookup is the same anonymous actor as no cookie.
        // Preserve the complete request-local renderer and serving settings;
        // otherwise an expired cookie silently forces serial normal renders.
        anonymous: true,
        liveRenderFlag: env.DECKO_LIVE_RENDER,
        servedBootOptions: servedBootOptionsFromEnv(env),
      }),
      resolveEdgeContentCache(env),
      { wrapGlobal: true, globalCache: getGlobalRenderCache(env, resolved) },
    );
  }
  const nameMatch = await nameMatchResponse(request, url, getActorEngines().deckFor(viewer.actorId as number, viewer.enabledRoleIds));
  if (nameMatch !== null) return nameMatch;
  return await serveProfiled(
    profile,
    request,
    env,
    async () =>
      handleEngineRequest(
        request,
        { driver: getDriver(resolved, env), deck: async () => getActorEngines().deckFor(viewer.actorId as number, viewer.enabledRoleIds) },
        {
          budgetMs: renderBudgetMs,
          // Signed-in pages take the same batched live render the anonymous
          // path does, under this viewer; views the live render does not
          // cover fall back to the actor's own engine.
          viewer,
          liveRenderFlag: env.DECKO_LIVE_RENDER,
          servedBootOptions: servedBootOptionsFromEnv(env),
        },
      ),
    resolveEdgeContentCache(env),
    { perViewer: true },
  );
}


/** The editors' card-name autocomplete (card-mod-search
 *  set/abstract/0_search/views.rb name_match / name_complete on the
 *  `<anything>+by name` search card): up to AUTOCOMPLETE_LIMIT (8) names,
 *  those starting with the term first, then those containing it, each group
 *  by name. Answered for signed-in viewers, whom the editors serve; null when
 *  the request is not this route. */
async function nameMatchResponse(request: Request, url: URL, deck: Deck): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const path = decodeURIComponent(url.pathname);
  if (!path.endsWith(".json")) return null;
  const view = url.searchParams.get("view");
  // Search-box items use the engine's Ruby-backed search view: it owns
  // create permission, exact-name handling, prefix matching and item URLs.
  if (view !== "name_match" && view !== "name_complete") return null;
  await deck.render.ensureFreshness();
  const rawTerm = (url.searchParams.get("term") ?? url.searchParams.get("query[keyword]") ?? "").trim();
  const names = await matchingCardNames(deck, rawTerm.toLowerCase(), view !== "name_complete");
  return new Response(JSON.stringify(names), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Up to 8 live card names: prefix matches first, then (when `contains`)
 *  names containing the term, each group ordered by name — Ruby's
 *  complete_or_match_search. */
async function matchingCardNames(deck: Deck, term: string, contains: boolean): Promise<string[]> {
  const limit = 8;
  const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const names: string[] = [];
  const scope = await deck.render.cqlPermissionOptions();
  const readRuleSql = scope.alwaysOk ? "" : ` and read_rule_id in (${scope.readRuleIds.map(() => "?").join(",") || "NULL"})`;
  const pick = async (pattern: string) => {
    const excluded = [...names];
    const notIn = excluded.length > 0 ? ` and name not in (${excluded.map(() => "?").join(",")})` : "";
    let offset = 0;
    while (names.length < limit) {
      const result = await deck.fetcher.driver.query<{ id: number; name: string }>(
        `select id, name from cards where trash = 0 and name is not null and lower(name) like ? escape '\\'${readRuleSql}${notIn} order by name limit ? offset ?`,
        [pattern, ...(scope.alwaysOk ? [] : scope.readRuleIds), ...excluded, limit, offset],
      );
      for (const row of result.rows) {
        const record = await deck.fetcher.fetchById(row.id);
        if (record !== undefined && await deck.render.canReadCard(record)) names.push(row.name);
        if (names.length === limit) break;
      }
      if (result.rows.length < limit) break;
      offset += result.rows.length;
    }
  };
  await pick(`${like(term)}%`);
  if (contains && term !== "" && names.length < limit) await pick(`%${like(term)}%`);
  return names;
}

/** The sweep's files dependency: the storage zone's driver, or nothing. */
function bunnyFilesOrUndefined(env: EdgeEnv): { files: NonNullable<ReturnType<typeof bunnyEdgeFilesDriver>> } | undefined {
  const files = bunnyEdgeFilesDriver(env);
  return files === undefined ? undefined : { files };
}
