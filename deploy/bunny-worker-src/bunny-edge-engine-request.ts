import { renderFormatShow } from "../../src/card/render/format-families.js";
// deploy/bunny-worker-src/bunny-edge-engine-request.ts — the SDK-free request
// core of the Bunny edge engine entry (bunny-edge-engine-entry.ts).
//
// WHAT LIVES HERE: handleEngineRequest — the URL dispatch (parsePath) + the
// render call + the JSON card/status branches + the render-error response
// mapping. No "@bunny.net/edgescript-sdk" import: the platform SDK is
// resolved only by the platform (tools/bundle-bunny-edge-engine.mjs keeps it
// external), and a module that imports it cannot be loaded under vitest at
// all. Keeping this core SDK-free is the same testability pattern the
// repo already uses for the other bunny-worker-src modules
// (bunny-worker.ts's exported handleRequest,
// bunny-edge-signin-session-surface.ts under
// tests/deploy/bunny-edge-signin-session-roundtrip.test.ts); the entry file
// stays the thin shell that owns process.env, the deck boot and the serve
// registration.
//
// THE ERROR MAPPING (handleEngineRequest's catch):
//   card not found: <name>            -> 404 Decko's full-chrome not_found
//     page (bunny-edge-error-page.ts, the staging host's error builder port
//     — vm-staging-server.mjs:1497-1549; status per format/error.rb
//     page_status_for_unknown). The throw site is src/card/render.ts:706-708
//     (Ruby answers 404 for a missing card; without this arm a missing card
//     fell through to 500).
//   view (<v>) not supported for <n>  -> 422 "Unsupported view" bare page
//     (UnsupportedViewError's message shape, src/card/render.ts:18 — the
//     edge's own case, no staging shape exists for it; the CF render path
//     500s these instead)
//   anything else                     -> 500 Decko's full-chrome Wild Card
//     deck error page (the same port; the Introduction deck-error shape)
// The no-route 404s (parsePath notFound + the api fallthrough) answer the
// staging ROUTER's minimal stub — a different route class from the card
// not_found page (vm-staging-server.mjs:2203). The budget 503 answers the
// full chrome around the edge's own Slow-render body region, grace-bounded
// back to the bare stub page when the database is too slow to build
// chrome (EDGE_ERROR_PAGE_GRACE_MS). Every error surface stays no-store.

import type { FetchEngine } from "../../src/card/fetch.js";
import type { RenderEngine } from "../../src/card/render.js";
import type { ReadViewer } from "../../src/card/permissions/read-rules.js";
import { permissionViewerKey } from "../../src/card/session/enabled-roles.js";
import { DeckoName } from "../../src/card/name.js";
import { DEFAULT_PIPELINE_TIMEOUT_MS } from "../../src/card/drivers/bunny-db.js";
import { edgeHostLabels } from "./edge-host-labels.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { homeMarkContent, renderPageWithStatus } from "../../src/card/render/page.js";
import { liveRenderPage, liveRenderView, withLiveRenderScope } from "../../src/card/live/live-render.js";
import { requestContextAvailable, runInRequestContext } from "../../src/card/request-context.js";
import { getNameEnvironment } from "../../src/card/name/environment.js";
import {
  historyRenderParamsFromWire,
  jsonViewSearchParams,
} from "../../src/server/worker-shared-surface.js";
import { bootEdgeServingEngines } from "./bunny-edge-deck-boot.js";
import { derivedCloudAttachmentSource } from "../../src/card/render/views.js";
import {
  decodeName,
  deprecatedAssetStubResponse,
  mapRenderError,
  publicDbContent,
  queryViewFromUrl,
} from "../../src/server/worker-shared-surface.js";
import { escapeHtml, layoutPage, parsePath } from "./bunny-edge-lineage-worker-surface.js";
import {
  readVisitorSession,
  saveLocation,
  shouldSaveLocation,
  visitorSessionCookie,
} from "../../src/card/session/visitor-session.js";
import {
  applyServedEnvironmentDeltas,
  filesLeafVariant,
  filesNotFoundBody,
} from "./bunny-edge-page-shell.js";
import {
  EMPTY_SERVED_DELTAS,
  type ServedBootOptions,
  type ServedEnvironmentDeltas,
} from "./bunny-edge-served-deltas.js";
import {
  EDGE_ERROR_PAGE_GRACE_MS,
  noRouteNotFoundResponse,
  renderDeckoNotFoundErrorPage,
  renderDeckoServerErrorPage,
  renderFullChromeErrorPage,
} from "./bunny-edge-error-page.js";
import { newCardRouteResponse, signedInNewCardFormBodyHtml, signedInNewCardRouteResponse } from "./bunny-edge-new-card-form.js";

/** The deck the engine request renders through; booted once per isolate by
 *  the entry (getDeck) and passed in, so this module never touches env or
 *  the driver. */
export interface Deck {
  fetcher: FetchEngine;
  render: RenderEngine;
  /** The deployment's served-environment deltas.
   *  The carrier for every value that used to be one deck's hard-coded
   *  identity: its footer version, asset host and revisions, the
   *  error chrome's card ids and asset URLs, and the phantom item type.
   *  Absent = the stock deck, whose every delta pass is a no-op. The field
   *  rides the deck rather than the request options because the ERROR pages
   *  and the /files/ route read it after `deck()` has answered — they get
   *  the same object the render path does. */
  servedDeltas?: ServedEnvironmentDeltas;
}

/** The deltas for a deck, defaulting to the stock (empty) set. Every call
 *  site in this module goes through here so an unconfigured deployment has
 *  exactly one definition of "no deltas". */
export function deckServedDeltas(deck: Deck | ErrorPageDeckLike): ServedEnvironmentDeltas {
  return deck.servedDeltas ?? EMPTY_SERVED_DELTAS;
}

/** The error-page builder's structural view of a deck (its own ErrorPageDeck
 *  in bunny-edge-error-page.ts, named structurally here so this module does
 *  not import a type it does not otherwise need). */
interface ErrorPageDeckLike {
  servedDeltas?: ServedEnvironmentDeltas;
}

/** A deck the request boots only when it needs one. The live page path
 *  (liveRenderApplies) reads through the database driver alone and boots its
 *  own engines over its request store, so a cookieless page served live pays
 *  no deck boot: on a fresh isolate that is two sequential round trips and
 *  the boot's CPU. Every other arm (files, new-card form, /api/card, the
 *  normal render, the error and budget pages) awaits `deck()` first, which
 *  boots once per isolate exactly as before. */
export interface DeferredDeck {
  driver: SQLDatabaseDriver;
  deck: () => Promise<Deck>;
}

/** Per-request deadline behavior. Both fields are optional and BOTH DEFAULTS
 *  ARE OFF, so every pre-existing caller (and every pre-existing test) is
 *  byte-identical until it opts in. The edge entry opts in — see
 *  DEFAULT_EDGE_RENDER_BUDGET_MS. */
export interface EngineRequestOptions {
  /**
   * Wall-clock budget in milliseconds for the whole request. `undefined` or
   * any value <= 0 means UNBOUNDED (the behavior a budget replaces).
   */
  budgetMs?: number;
  /** `Retry-After` value, in seconds, on the budget-exceeded response.
   *  Default EDGE_BUDGET_RETRY_AFTER_SECONDS. */
  retryAfterSeconds?: number;
  /** The caller vouches the request is ANONYMOUS (no session): only then may
   *  a page take the request-local live render (see liveRenderApplies). */
  anonymous?: boolean;
  /** The edge env's DECKO_LIVE_RENDER ("0" turns the live render off). */
  liveRenderFlag?: string;
  /** The deployment's served-deltas boot options (servedBootOptionsFromEnv).
   *  The live render boots its own engines over the request store, so it
   *  must boot with the same configuration the isolate's deck does. */
  servedBootOptions?: ServedBootOptions;
  /** A resolved signed-in viewer. A signed-in page may take the live render
   *  too: every engine the live render boots renders under this viewer, and
   *  the render keeps nothing between requests (the kept-page store is keyed
   *  by page alone, so it must never hold a per-viewer render). */
  viewer?: ReadViewer;
}

/**
 * THE REQUEST-LOCAL LIVE RENDER (src/card/live/live-render.ts) serves an
 * anonymous GET page uncached in a handful of batched round trips, storing
 * nothing between requests. ON by default; DECKO_LIVE_RENDER=0 turns it off.
 * It applies only where it has been byte-checked against the normal render:
 * an anonymous GET/HEAD of a bare page path (/:card) with no ?view= and no
 * history query. Signed-in viewers, writes, /:card/:view paths and history
 * views take the normal render until they are covered.
 */
export function liveRenderApplies(
  request: Request,
  url: URL,
  options: EngineRequestOptions | undefined,
  pageView: string | undefined,
  historyParams: Record<string, unknown>,
): boolean {
  if (options?.anonymous !== true && options?.viewer === undefined) return false;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const flag =
    options.liveRenderFlag ?? (typeof process !== "undefined" ? process.env?.DECKO_LIVE_RENDER : undefined);
  if (flag === "0") return false;
  // Search vars, snippet editor binding and the slotter's main context are query inputs,
  // not history selectors. Preserve them through the same complete-answer
  // lifecycle, including actual CQL capability errors/fallbacks.
  const noHistorySelectors = Object.keys(historyParams).every(key => key === "search" || key === "editorParams");
  if (options?.viewer !== undefined) return noHistorySelectors;
  // Anonymous requested views use the same complete renderer and read
  // permission preparation as anonymous bare pages. Explicit layouts and
  // history selectors keep their established dispatch; forms remain local
  // to the request through renderLive's bare-view keep:false posture.
  if (url.searchParams.has("layout")) return false;
  return noHistorySelectors;
}

/** One render at a time per isolate, for the renders that use the
 *  process-global engine state: the normal render (it renders on the deck's
 *  own shared engine), and the live render on a runtime without
 *  AsyncLocalStorage (src/card/request-context.ts). The engine's sync name
 *  environment and boot bundle are process-global, and renders that
 *  interleave across awaits would read each other's environment. */
let renderLock: Promise<unknown> = Promise.resolve();
export function withIsolateRenderLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderLock.then(fn, fn);
  renderLock = run.catch(() => undefined);
  return run;
}

/**
 * THE DEADLINE (cold-render reliability).
 *
 * A cold render on this edge is a long SERIAL chain of database round trips:
 * one edge measured 1,151 HTTP round trips (4.9 MB of database response) to
 * produce ONE 76-byte page, and 814 for Home. Wall time is the sum of
 * ~1,000-odd independent hop latencies, and before this deadline the sum had
 * NO upper bound in code — the only thing that stopped a slow chain was the
 * PLATFORM ending the script, and the platform answers that with an opaque
 * 5xx after a long wait. That is the operator-visible failure: a page that
 * returns 500 after ~40 s and 200 on retry, because the chain is
 * deterministic and only the wait varied.
 *
 * This deadline makes the application, not the platform, the thing that ends
 * a slow request, and it ends it with an answer a client can act on: 503
 * (retryable by definition) + `Retry-After` + `no-store`. Two properties make
 * it safe:
 *   - it sits ABOVE every cold render measured on that edge (60 cold probes:
 *     p50 3.3 s, p95 5.0 s, max 13.5 s reproducibly on the heaviest card),
 *     so a render that would have succeeded still succeeds and its bytes are
 *     unchanged;
 *   - it sits BELOW the ~40 s point at which the platform was observed
 *     taking the request over, so the budget is spent before the platform is.
 * A 503 is `uncacheable` by both cache modules (edgeRouteCacheClass returns
 * "uncacheable" for any non-200), so no caching class moves.
 *
 * On trip the render is NOT cancelled — it is abandoned. Cancellation would
 * need a cooperative abort threaded through every engine call site, and the
 * request ends when the response is returned, so the isolate is reclaimed
 * either way.
 */
export const DEFAULT_EDGE_RENDER_BUDGET_MS = 20_000;

/** `Retry-After` on the budget-exceeded 503. Long enough that a retry does
 *  not land back inside the same slow window, short enough that the visitor
 *  is not left staring at a blank page. */
export const EDGE_BUDGET_RETRY_AFTER_SECONDS = 5;

/** Header naming the deadline trip, so the case is assertable from outside
 *  the isolate the same way X-Decko-Edge-Cache makes the cache decision so. */
export const EDGE_BUDGET_DIAGNOSTIC_HEADER = "X-Decko-Edge-Budget";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the entry's EdgeEnv. */
type EdgeEnv = Record<string, string | undefined>;

/** The edge script variable that retunes the deadline WITHOUT a publish —
 *  the same operational property DECKO_EDGE_CACHE_TTL has for the cache TTL
 *  (a variable update is effective on running isolates immediately). */
export const EDGE_RENDER_BUDGET_ENV_VAR = "DECKO_EDGE_RENDER_BUDGET_MS";

/** Resolve the per-request render budget from the edge environment.
 *  Absent or unparseable keeps DEFAULT_EDGE_RENDER_BUDGET_MS; an explicit
 *  "0" disables the deadline entirely, which is the operator's rollback that
 *  needs no republish. */
export function resolveEdgeRenderBudgetMs(env: EdgeEnv): number {
  const raw = env[EDGE_RENDER_BUDGET_ENV_VAR];
  if (raw === undefined) return DEFAULT_EDGE_RENDER_BUDGET_MS;
  const parsed = Number(raw);
  if (raw.trim() === "") return DEFAULT_EDGE_RENDER_BUDGET_MS;
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_EDGE_RENDER_BUDGET_MS;
  return Math.trunc(parsed);
}

/** The per-pipeline hop bound. The cold-render release shipped a 5,000 ms
 *  per-pipeline abort while the render still ran whole-deck recursive
 *  walks; real visitors' hops legitimately exceeded the bound and every page
 *  answered "Pipeline Transport failed ... signal timed out". With the query
 *  scoping in place the default raises to 15,000 ms
 *  (DEFAULT_PIPELINE_TIMEOUT_MS — above the scoped walks' worst case with
 *  headroom, below the 20,000 ms request budget), and this variable retunes
 *  the bound WITHOUT a republish — the same operational property
 *  DECKO_EDGE_RENDER_BUDGET_MS has for the whole-request deadline. */
export const EDGE_PIPELINE_TIMEOUT_ENV_VAR = "DECKO_EDGE_PIPELINE_TIMEOUT_MS";

/** Resolve the per-pipeline timeout from the edge environment. Same
 *  fail-safe semantics as the budget resolver: absent, empty, unparseable,
 *  or negative keeps DEFAULT_PIPELINE_TIMEOUT_MS; an explicit "0" passes 0
 *  through, which the driver maps to "no per-hop abort" — the operator's
 *  rollback that needs no republish. */
export function resolveEdgePipelineTimeoutMs(env: EdgeEnv): number {
  const raw = env[EDGE_PIPELINE_TIMEOUT_ENV_VAR];
  if (raw === undefined) return DEFAULT_PIPELINE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (raw.trim() === "") return DEFAULT_PIPELINE_TIMEOUT_MS;
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_PIPELINE_TIMEOUT_MS;
  return Math.trunc(parsed);
}

/** The budget-exceeded response. Constructed through the same html() helper
 *  as every other response here — same layout shell, same escaping, same
 *  `no-store` — so an escaping or header regression in the error path cannot
 *  hide behind a special case. It carries no card name (the request may not
 *  have parsed one yet) and no internal error text.
 *
 *  The body region is re-homed into the
 *  FULL-CHROME error page (bunny-edge-error-page.ts — the staging host's
 *  error builder port). No staging shape exists for an infra 503, so the
 *  title and body text are byte-identical to the bare page this replaced,
 *  and when the chrome cannot be built (or the chrome build outlives
 *  EDGE_ERROR_PAGE_GRACE_MS — the budget fired because the database is slow
 *  or dead, and the error page must not become a second long wait) the
 *  fallback IS the bare stub page below. Retry-After and the diagnostic
 *  header are set on whichever arm answered. */
async function budgetExceededResponse(
  deck: Deck,
  budgetMs: number,
  retryAfterSeconds: number,
): Promise<Response> {
  const bodyRegion =
    `<h1>Slow render</h1><p class='muted'>This page took longer than ` +
    `${escapeHtml(String(budgetMs))} ms to render and was stopped before it ` +
    `finished. That is a capacity limit, not a missing page — retrying in a ` +
    `few seconds usually succeeds.</p>`;
  const response = await renderFullChromeErrorPage(deck, {
    status: 503,
    viewHtml: bodyRegion,
    titleText: "Slow render",
    cardName: "",
    fallbackHtml: layoutPage("Slow render", bodyRegion),
    graceMs: EDGE_ERROR_PAGE_GRACE_MS,
  });
  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set(EDGE_BUDGET_DIAGNOSTIC_HEADER, `exceeded; budget_ms=${budgetMs}`);
  return response;
}

/** Race `work` against the budget. Resolves to work's response, or the 503
 *  when the budget wins — the 503 built by `slowPage` (which may itself
 *  take a bounded moment to assemble the full-chrome error page; see
 *  budgetExceededResponse). Rejections are the work's own outcome and
 *  propagate to the caller's existing try/catch — EXCEPT once the budget
 *  has already fired, where a late rejection must not turn a clean 503 back
 *  into a 500.
 */
async function withBudget(
  budgetMs: number,
  retryAfterSeconds: number,
  work: (signal: AbortSignal | undefined) => Promise<Response>,
  slowPage: () => Promise<Response>,
): Promise<Response> {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return await work(undefined);

  // When the budget fires, the abandoned work is told to stop: the live
  // render checks this signal before every pass and every round trip, so it
  // issues no more statements once its 503 is on the way.
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  let slow: Promise<Response> | undefined;
  const expiry = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      abort.abort();
      slow = slowPage();
      resolve(slow);
    }, budgetMs);
    // Never hold the process open on the timer alone: if the platform drops
    // the connection, the timer must not be the reason the isolate lingers.
    (timer as { unref?: () => void }).unref?.();
  });

  try {
    return await Promise.race([work(abort.signal), expiry]);
  } catch (err) {
    // The budget already produced its answer if it is going to. A work
    // rejection arriving after the timer fired is a symptom of the request
    // we already abandoned (the live render throws when it is told to
    // stop), not of the one we are answering — so answer the abandoned one
    // with the same 503, built once, and never let it surface as a 500.
    if (expired) return await (slow ?? slowPage());
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function html(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** `extraHeaders` is merged LAST, so a caller can add a header (the
 *  sign-out surface's Set-Cookie) without disturbing the two base ones.
 *  Two-argument calls are byte-identical to before it existed. */
export function json(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extraHeaders ?? {}),
    },
  });
}

// Same escaping the Cloudflare worker applies to its error pages
// (deploy/worker.ts errorPage/escapeHtml). The engine's render errors embed
// the requested card name verbatim (src/card/render.ts "card not found:
// ${cardName}"), and parsePath decodes the URL path before render, so a
// crafted URL name reaches the error page's <pre> — it must land as text,
// not markup. Every interpolation of error text in an HTML page goes
// through this. (Carried forward from the monolith through the
// engine-request split — the split initially dropped it; the deployed edge
// serves the hardened bytes, so this adoption must not un-ship the fix — a
// regression here would again let a crafted card name land in an error page
// as markup. One implementation, two call sites: the local copy is
// superseded by the single-source export this module now imports from
// worker.ts, which exports the identical body for layoutPage's <title>.)

export async function handleEngineRequest(
  request: Request,
  deck: Deck | DeferredDeck,
  options?: EngineRequestOptions,
): Promise<Response> {
  const source: DeferredDeck = "render" in deck ? { driver: deck.fetcher.driver, deck: async () => deck } : deck;
  const budgetMs = options?.budgetMs ?? 0;
  const retryAfterSeconds = options?.retryAfterSeconds ?? EDGE_BUDGET_RETRY_AFTER_SECONDS;
  return await withBudget(
    budgetMs,
    retryAfterSeconds,
    (signal) => dispatchEngineRequest(request, source, options, signal),
    async () => budgetExceededResponse(await source.deck(), budgetMs, retryAfterSeconds),
  );
}

/** The dispatch itself — every branch that touches the database. Split from
 *  handleEngineRequest so the deadline wraps ALL of them (the /api/card read
 *  gate queries too), not only the HTML render. */
async function dispatchEngineRequest(
  request: Request,
  source: DeferredDeck,
  options?: EngineRequestOptions,
  signal?: AbortSignal,
): Promise<Response> {
  const url = new URL(request.url);

  // The /files/ attachment route: a served deck's pages
  // reference EVERY image/script/css attachment by its absolute CDN
  // URL (measured: zero relative /files/ refs across five served gate
  // pages), so the served page bytes resolve without this route — but a
  // /files/ URL hit directly must not fall into the card grammar's
  // 404 HTML. The route resolves the card id, derives the SAME CDN URL the
  // engine's attachment views derive (derivedCloudAttachmentSource — Ruby's
  // action-id filename derivation, never the stored key), and 302s to it;
  // an unresolvable id answers the application's own shape for this path
  // (404, text/plain, "Could not find <id>.").
  if (/^\/files\/\d+\/[^/]+/.test(url.pathname)) {
    // THE FRESHNESS GATE (the shared-edge
    // counterpart of the gate both Cloudflare twins run at their data
    // routes, RenderEngine#ensureFreshness): this route resolves the
    // attachment through the ISOLATE-RETAINED engine (the handler's
    // one-deck-per-isolate boot retains it across requests), whose fetch
    // caches outlive the request — a committed content edit would keep
    // answering the pre-edit carrier URL here. Read the deck's
    // committed-write stamp and clear every derived cache when it moved,
    // BEFORE the fetch.
    const filesDeck = await source.deck();
    await filesDeck.render.ensureFreshness();
    return filesRouteResponse(filesDeck, url.pathname);
  }

  const parsed = parsePath(url.pathname, url.searchParams);

  // THE JSON-FORMAT VIEW DISPATCH (route line 51's .:format suffix — the
  // navbox typeahead's search_box_complete.json surface, the merge-57 route
  // surgery carried to this lineage): the ENGINE's view dispatch in the
  // json format — the ported json-format views' own bytes, Ruby's 422
  // unsupported-view otherwise. The request-term seam rides the search
  // params (search_params.rb: term_param || vars.keyword). The isolate
  // discipline mirrors the page arm: live-context renders when a request
  // context is available, the isolate lock (with the name-environment
  // handback) otherwise.
  if (!("kind" in parsed) && parsed.format === "rss") {
    const renderRss = async () => {
      const deck = await source.deck();
      deck.fetcher.installNameEnvironment?.();
      // Retained handlers must observe revocations before reading any format.
      await deck.render.ensureFreshness();
      const record = await deck.fetcher.fetchByName(parsed.name);
      if (record?.name === undefined) {
        return json(404, { error: "card not found", name: parsed.name });
      }
      const type = record.typeId === undefined
        ? undefined : await deck.fetcher.fetchById(record.typeId);
      if (!await deck.render.canReadCard(record, type?.name?.s)) {
        return json(403, { error: "permission denied", name: parsed.name });
      }
      const body = parsed.view === "feed"
        ? await renderFormatShow({
            fetchRenderCard: name => deck.render.fetchRenderCard(name),
            prepareItemForRender: name => deck.render.prepareItemForRender(name),
            render: (name, view) => deck.render.render(name, view),
            codenameById: id => deck.fetcher.codenames.nameForId(id),
          }, record.name.s, "rss", {
            // Same stock default as the retained Cloudflare format route.
            // Recognizing the URL must not silently enable disabled feeds.
            rssEnabled: false,
          })
        : await deck.render.render(record.name.s, parsed.view, {
            format: "rss", requestUrl: url.href,
          });
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    };
    try {
      return requestContextAvailable()
        ? await runInRequestContext(getNameEnvironment(), renderRss)
        : await withIsolateRenderLock(async () => {
            try { return await renderRss(); }
            finally { (await source.deck()).fetcher.installNameEnvironment?.(); }
          });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const mapped = mapRenderError(message);
      return json(mapped.status, { error: mapped.title, message });
    }
  }

  if (!("kind" in parsed) && parsed.format === "json") {
    const search = jsonViewSearchParams(url.searchParams);
    const params = {
      ...(search !== undefined ? { search } : {}),
      format: "json",
      requestUrl: url.href,
      ...(url.searchParams.has("compress") ? { compress: url.searchParams.get("compress") } : {}),
    };
    const renderJsonView = async () => {
      // Suggestions and image pickers prepare item cards and their rules.
      // On a cold deck those independent facts otherwise take thousands of
      // serial reads. Use the same fresh-engine complete-answer lifecycle
      // as bare views: no response or cross-request suggestion cache.
      if (["search_box_complete", "image_complete"].includes(parsed.view) && liveRenderApplies(
        request, url, options, parsed.view, search === undefined ? {} : { search },
      )) {
        const result = await liveRenderView(source.driver, parsed.name, async driver => {
          const engines = await bootEdgeServingEngines(driver, options?.servedBootOptions ?? {});
          if (options?.viewer !== undefined) {
            engines.render.viewer = options.viewer;
            engines.render.pageSession = options.viewer;
          }
          return engines;
        }, { requestedView: parsed.view, historyParams: params, signal });
        return result.html;
      }
      const deck = await source.deck();
      deck.fetcher.installNameEnvironment?.();
      return await deck.render.render(parsed.name, parsed.view, params);
    };
    let body: string;
    try {
      body = requestContextAvailable()
        ? await runInRequestContext(getNameEnvironment(), renderJsonView)
        : await withIsolateRenderLock(async () => {
            try {
              return await renderJsonView();
            } finally {
              (await source.deck()).fetcher.installNameEnvironment?.();
            }
          });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The 422 unsupported-view case stays the edge's own bare shape
      // (UnsupportedViewError's message, src/card/render.ts:18); the shared
      // mapRenderError table classifies the rest (NotFound -> 404, else 500).
      const mapped = mapRenderError(message);
      if (mapped.status === 422) {
        return new Response(message, {
          status: 422,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return json(mapped.status, { error: mapped.title, message });
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if ("kind" in parsed) {
    if (parsed.kind === "assetStub") {
      // engine_routes.rb:14-16 + rest.rb:22-27: the deprecated asset
      // prefixes answer card#asset's fixed installation-error 404, not a
      // card render and not the router's no-route stub.
      return deprecatedAssetStubResponse();
    }
    if (parsed.kind === "new") {
      // THE /new/:type ARM: decko's
      // engine_routes.rb:22 card-creation route — the signup journey's
      // route a deck's own chrome links as /new/Sign_up. The create
      // form/denial/not-found decision (the anonymous viewer's
      // ok?(:create) on the virtual card) lives in
      // bunny-edge-new-card-form.ts; the 404 this replaces was measured.
      // THE FRESHNESS GATE (same gate as the
      // /files arm above): the type fetch (fetchByKey) and the
      // create-verdict walk in bunny-edge-new-card-form.ts both read the
      // ISOLATE-RETAINED fetcher's card and rule caches, so a committed
      // rule revocation must move the deck's committed-write stamp and
      // clear those caches HERE, before the verdict is computed.
      const newCardDeck = await source.deck();
      await newCardDeck.render.ensureFreshness();
      const typeName = parsed.typeId === undefined
        ? parsed.typeName || await defaultNewCardTypeName(newCardDeck)
        : (await newCardDeck.fetcher.fetchById(parsed.typeId))?.name?.s;
      if (typeName === undefined) return await renderDeckoNotFoundErrorPage(newCardDeck, String(parsed.typeId));
      if (options?.viewer !== undefined) {
        // card[name] / card[content] in the query preset the form, as Ruby's
        // new view reads them off params.
        const page = await signedInNewCardPage(
          source,
          newCardDeck,
          typeName,
          options,
          signal,
          url.searchParams.get("card[name]") ?? parsed.cardName ?? "",
          url.searchParams.get("card[content]") ?? undefined,
          parsed.typeId !== undefined || Boolean(parsed.typeName),
        );
        return page ?? (await signedInNewCardRouteResponse(newCardDeck, typeName));
      }
      return await newCardRouteResponse(newCardDeck, typeName);
    }
    if (parsed.kind === "notFound") {
      // THE NO-ROUTE CLASS: paths that
      // never parse to a card route answer the staging ROUTER's own minimal
      // stub (vm-staging-server.mjs:2203 — `<pre>No route for <path></pre>`,
      // pathname escaped), not the full-chrome card not_found page: staging
      // routes only single-segment card names to the renderer, and the
      // platform router 404s this class bare too. The title stays the edge's
      // existing "Not found" (staging's default title is its own origin
      // name); headers keep the html() no-store pair.
      return noRouteNotFoundResponse(url.pathname);
    }
    if (url.pathname === "/api/status") {
      return json(200, {
        ok: true,
        runtime: edgeHostLabels().runtime,
        engine: "decko-ts",
        notes: "boot pattern: warm caches survive across requests in the same isolate",
      });
    }
    if (url.pathname.startsWith("/api/card/")) {
      // THE HARDENED DECODE (the shared decodeName
      // rule, worker-shared-surface.ts): a malformed % answers 400
      // {"error":"empty card name"}, never an unhandled URIError escaping
      // the handler; an empty name answers the same 400. The whole arm
      // sits inside the structured-500 try so no engine error escapes
      // unhandled — the shape the old third-twin handler answered with
      // and its parity pin holds.
      try {
        const name = decodeName(url.pathname.slice("/api/card/".length));
        if (name === undefined || name === "") {
          return json(400, { error: "empty card name" });
        }
        const deck = await source.deck();
        // THE FRESHNESS BOUNDARY BEFORE THE FETCH AND THE READ GATE: this
        // handler retains ONE deck per isolate (the handler's module-scope
        // deckPromise), and canReadCard's verdicts memoize on that retained
        // engine (readPermission, deniedVerdicts — render.ts), while the
        // fetcher caches the rule rows the verdict walk reads. Without this
        // gate a read rule revoked after the engine's last freshness check
        // kept serving 200 with the protected body here — the
        // grant-Anyone/read-200/revoke-to-Member/read-200 reproduction —
        // while the render entry clears its caches at this same gate on
        // every request (RenderEngine#render's renderHeld gate) and the
        // root Worker's /api/card branch has run RenderEngine#
        // ensureFreshness() since the earlier fix (worker.ts:310). One
        // stamp read, exactly what a warm render pays; a moved stamp
        // resets every derived cache so the fetch and verdict below answer
        // over the committed state.
        await deck.render.ensureFreshness();
        const record = await deck.fetcher.fetchByName(name);
        if (record === undefined || record.name === undefined) {
          return json(404, { error: "card not found", name });
        }
        // THE READ GATE: this route previously
        // served db_content_preview for cards the HTML views replace with the
        // denial span — the same hole the CF worker's record-JSON route had
        // and closed (deploy/worker.ts cardRecordJson:469-492): verified on a
        // deployed edge (GET /api/card/<name> -> 200 plus content of a denied
        // card while GET /<name> rendered the denial).
        // Ruby's GET of a denied card renders the denial (ok_to_read? fails,
        // set/all/permissions.rb:139-146); the JSON surface answers the CF
        // worker's exact shape, 403 {"error":"permission denied"} without the
        // protected fields, the verdict from the same engine state the HTML
        // path judges with (RenderEngine#canReadCard — the non-HTML-entry
        // permission seam, src/card/render.ts: stored-rule verdict, the mod
        // set-module overrides, and the fail-closed live rule walk incl.).
        // Pin: tests/deploy/bunny-edge-engine-request-api-card-read-gate.test.ts
        // (red with the gate removed, green with it). A second host
        // implemented the same gate as an inline anonymous walk (403 "read
        // denied"); unification keeps the canReadCard delegation — one
        // verdict path shared with the HTML judgments, override layer
        // included — and the CF worker's response shape; that host's pin's
        // unique cases ride in
        // tests/deploy/bunny-edge-engine-api-card-read-gate.test.ts.
        const typeRecord =
          record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
        const readable = await deck.render.canReadCard(record, typeRecord?.name?.s);
        if (!readable) {
          return json(403, { error: "permission denied", name });
        }
        return json(200, {
          id: record.id ?? null,
          name: record.name.s,
          key: record.name.key,
          type_id: record.typeId ?? null,
          codename: record.codename ?? null,
          db_content_preview: publicDbContent(record).slice(0, 200),
        });
      } catch (error) {
        return json(500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // Same no-route class as the parsePath notFound branch above (an api
    // subpath that is neither /api/status nor /api/card/<name>).
    return noRouteNotFoundResponse(url.pathname);
  }

  try {
    // THE FULL PAGE SHELL: the page is
    // the engine's own show_with_page_layout assembly — renderPageBytes
    // (src/card/render/page.ts: the per-card *layout rule, the *header/
    // *footer nests, the html_page head with favicon/stylesheet/script
    // tags) — with the five served-environment deltas the staging host has
    // applied (bunny-edge-page-shell.ts, constants byte-verbatim
    // from vm-staging-server.mjs:1586-1626). The former shell wrapped the
    // bare view in worker.ts layoutPage (inline <style>, a two-link nav,
    // nothing else) — measured at 0 <link>/0 <script> tags against a
    // served site's 3/9, no navbar, no footer, no favicon.
    //
    // VIEW SEMANTICS (Ruby route-faithful): the bare single-segment arm
    // (/:mark, rest.rb line 19) is show(nil) — the layout's {{_main|view}}
    // chunk names the main view, so requestedView stays undefined; an
    // explicit path-view arm (/:mark/:view, rest.rb line 51) shows THAT
    // view. parsePath reports the bare arm as view "open" (the demo CF
    // worker's default, worker.ts:98) — its contract is pinned, so the
    // bareness is re-derived here from the path shape instead of changing
    // it. The ?view=/ ?v= query is the page path's requestedView upstream
    // (page.ts:124-129), which parsePath does not carry — the engine's
    // UnsupportedViewError still maps to 422 below.
    //
    // HISTORY VIEWS ride the page path too: they used to keep
    // the bare layoutPage shell because HistoryRenderParams had no page-path
    // seam.
    // renderPageBytes's historyParams argument (src/card/render/page.ts)
    // threads the query into the prepare render's RenderEngine.render, whose
    // prepareHistoryRender seats the render-time history reader the sync
    // history ViewFns read — so the full-chrome shell wraps the SAME view
    // bytes the bare engine.render(name, view, params) machinery produces,
    // with act_from_context's semantics intact: act_id present -> THAT act,
    // absent -> the last action's act. The wire keys parsePath extracts
    // (act_id/action_id/... — worker.ts:104-109) translate to the seam's
    // camelCase fields HERE (historyRenderParamsFromWire); the bare shell
    // passed them untranslated, where the views could not read them — the
    // measured base state: ?act_id=<real> and no param rendered identical
    // last-act bodies.
    //
    // the query view REACHES the page path — the bare
    // arm's requestedView is queryViewFromUrl (the shared view_from_params
    // shape, rest.rb:100-103: first NON-BLANK of ?view=/ ?v=), the
    // capability the old third-twin handler carried and its parity pin
    // ("?view= fills the view-less arm") holds. An explicit path view still
    // wins (the action arg never falls through to params).
    const pageView = pathViewIsBareArm(url.pathname) ? queryViewFromUrl(url) : parsed.view;
    // mark.rb:42-44 on the BARE ROOT arm ("/"): load_mark's implicit_mark
    // lands on home_mark — `Card::Rule.global_setting(:home) || "Home"` —
    // read per request (globalSettingContent's :home fetch; whitespace-only
    // content falls back, rule.rb:5-9's strip check). parsePath hardcodes
    // "Home" (its sync contract is pinned); the resolution happens here,
    // where the async rule read rides the request. The ?mark= query keeps
    // precedence (Card.uri_fetch uses params[:mark] first — the parsePath
    // arm's own rule), so the rule only names the card when the query is
    // absent. Every page arm below (render/render/page assemblies and the
    // location-history push) renders the RESOLVED card.
    const bareRootArm = (url.pathname === "/" || url.pathname === "") && url.searchParams.get("mark") === null;
    const pageName = bareRootArm
      ? await homeMarkContent((await source.deck()).render)
      : parsed.name;
    const search = jsonViewSearchParams(url.searchParams);
    const historyParams = { ...historyRenderParamsFromWire(parsed.params), ...(search !== undefined ? { search } : {}) };
    // CardController's XHR read returns a slot, unless an explicit layout
    // was requested. Inserting a complete page here duplicates the chrome.
    const bareRead = isXhr(request) && !url.searchParams.has("layout");
    // Ruby Card.uri_fetch assigns the submitted type before rendering the
    // board's replacement editor. This GET must not persist the preview.
    const assignedType = bareRead && url.searchParams.get("assign") === "true"
      ? url.searchParams.get("card[type]") : null;
    let newFieldTypeId: number | undefined;
    if (assignedType !== null && pageView === "new_fields") {
      const deck = await source.deck();
      await deck.render.ensureFreshness();
      newFieldTypeId = (await deck.fetcher.fetchByName(assignedType))?.id;
      if (newFieldTypeId === undefined) return renderDeckoNotFoundErrorPage(deck, assignedType);
    }
    const editorParams = assignedType !== null
      ? { ...historyParams, assignedType,
          ...(pageView === "new_fields" ? { absentCard: true, newCard: {
            typeId: newFieldTypeId!, typePreset: false,
            ...(url.searchParams.has("card[content]") ? { content: url.searchParams.get("card[content]")! } : {}),
          } } : {}),
          viewOpts: { show: url.searchParams.getAll("slot[show][]") } }
      : historyParams;
    const renderNormal = async () => {
      const deck = await source.deck();
      if (!bareRead) return renderPageWithStatus(deck.render, pageName, pageView, historyParams);
      const view = pageView ?? deck.render.defaultHtmlViewConfig();
      if (url.searchParams.get("slot[main]") === "true") {
        return renderPageWithStatus(deck.render, pageName, view, historyParams, {
          nest_name: "_main", nest_syntax: `_main|${view}`, main: true,
          home_view: url.searchParams.get("slot[home_view]") ?? view,
        });
      }
      const html = await deck.render.render(pageName, view, { ...editorParams, focalRoot: true });
      return { html, status: deck.render.pageErrorStatus ?? 200 };
    };
    const renderLive = async () => {
      const view = bareRead ? pageView ?? (await source.deck()).render.defaultHtmlViewConfig() : pageView;
      const focalSlot = bareRead && url.searchParams.get("slot[main]") === "true";
      return await (bareRead && !focalSlot ? liveRenderView : liveRenderPage)(
          source.driver,
          pageName,
          async (driver) => {
            const engines = await bootEdgeServingEngines(driver, options?.servedBootOptions ?? {});
            const viewer = options?.viewer;
            if (viewer !== undefined) {
              engines.render.viewer = viewer;
              engines.render.pageSession = viewer;
            }
            return engines;
          },
          {
            requestedView: view,
            historyParams: bareRead && !focalSlot ? { ...editorParams, focalRoot: true } : historyParams,
            signal,
            ...(bareRead ? { keep: false } : {}),
            ...(focalSlot ? { bareMainOpts: {
              nest_name: "_main", nest_syntax: `_main|${view}`, main: true,
              home_view: url.searchParams.get("slot[home_view]") ?? view,
            } } : {}),
            // Signed-in renders keep their rows per viewer: a kept entry is
            // never shared across viewers or with the anonymous path.
            ...(options?.viewer !== undefined ? { keepScope: `viewer:${permissionViewerKey(options.viewer)}` } : {}),
          },
        );
    };
    // Each arm answers the page's HTML and its status (403 when the main
    // card is read-denied: Ruby's root.error_status, format/error.rb:27-31).
    const page = !liveRenderApplies(request, url, options, pageView, historyParams as Record<string, unknown>)
      ? await withIsolateRenderLock(renderNormal)
      : requestContextAvailable()
        ? // CONCURRENT: the live render boots its own engines over its own
          // request store, and runs in its own request context (name
          // environment, name memos, boot bundle), so live renders in one
          // isolate run side by side and never take the lock. Its passes'
          // environments stay inside the context.
          await (options?.viewer !== undefined
            ? withSignedInRenderSlot(() => runInRequestContext(getNameEnvironment(), renderLive))
            : runInRequestContext(getNameEnvironment(), renderLive))
        : await withIsolateRenderLock(async () => {
            try {
              return await renderLive();
            } finally {
              // The passes' engines installed their own name environments;
              // hand the process-global one back to the isolate's deck.
              (await source.deck()).fetcher.installNameEnvironment?.();
            }
          });
    const pageHtml = applyServedEnvironmentDeltas(page.html, deckServedDeltas(await source.deck()));
    // Signed-in only: those responses bypass every shared cache, whose keys
    // carry no X-Requested-With.
    const pageResponse = html(page.status, options?.viewer !== undefined && isXhr(request) ? ajaxSlotFromPage(pageHtml) : pageHtml);
    // THE READ-PATH LOCATION HISTORY (card-mod-session set/all/location_history.rb
    // :6-8, `event :save_current_location, before: :show_page, on: :read` +
    // lib/card/env/location_history.rb save_location): a page show of a KNOWN
    // card — the denial page included; save_location? asks the card's own
    // known-ness, not the view's success — pushes the request's original URL
    // onto the visitor session's location history (the decko_visit cookie),
    // unless the view is an ajax slot read or the card is *signin
    // (location_history.rb:47-51 save_location?: !Env.ajax? && Env.html? &&
    // card.known? && card.codename != :signin). The *signin success mark
    // (set/self/signin.rb:170-174, `{ redirect: true, mark: "*previous" }`)
    // resolves that history's last entry, so an anonymous visitor who follows
    // a denial's sign-in link lands back on the card they were denied on
    // instead of on the history default "/". Without this read-path save, the
    // history stayed at its default and every sign-in landed on "/" — the
    // 2026-10-16 native-whole S5 fail (landedOn "/") that this fixes.
    // Post-render because the port's page has no pre-show event hook; a
    // history-write failure never fails an already-rendered page.
    if (!isXhr(request)) {
      try {
        const deckForHistory = await source.deck();
        const shown = await deckForHistory.fetcher.fetchByName(pageName);
        if (
          shouldSaveLocation({
            known: shown !== undefined && shown.name !== undefined,
            html: true,
            ajax: false,
            codename: shown?.codename,
          })
        ) {
          const visit = readVisitorSession(request.headers.get("cookie") ?? undefined);
          const beforeCookie = visitorSessionCookie(visit);
          // request.original_url's shape (scheme, host, path, query). The
          // forwarders name the visitor's own host in x-forwarded-host /
          // x-forwarded-proto (bunny-edge-read-handler.ts forwardToFullEngine),
          // so the split-script engine records the visitor's address, not the
          // internal forward target.
          const host = request.headers.get("x-forwarded-host") ?? url.host;
          const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
          saveLocation(visit, `${proto}://${host}${url.pathname}${url.search}`);
          const afterCookie = visitorSessionCookie(visit, { secure: proto === "https" });
          if (afterCookie !== beforeCookie) pageResponse.headers.set("Set-Cookie", afterCookie);
        }
      } catch {
        // a location-history read or write must never turn a rendered page
        // into an error; the visitor just keeps the previous history
      }
    }
    return pageResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The error surfaces name the card the request was about — on the bare
    // root arm that is the RESOLVED home mark (mark.rb:42-44; the try body's
    // pageName is out of scope here, so re-derive it under the same
    // conditions; only the bare-root case pays the extra rule read).
    const errorCardName = (url.pathname === "/" || url.pathname === "") && url.searchParams.get("mark") === null
      ? await homeMarkContent((await source.deck()).render)
      : parsed.name;
    // Status mapping aligned with the CF worker's render path
    // (deploy/worker.ts:462-466): a missing card is a 404 — Ruby answers 404
    // for a missing card too (this edge previously fell through to 500). The
    // 422 unsupported-view case stays the edge's own (UnsupportedViewError's
    // message shape, src/card/render.ts:18); anything else is a 500.
    //
    // THE FULL-CHROME ERROR SURFACES: the
    // 404 and the 500 route through the staging host's error builder port
    // (bunny-edge-error-page.ts) — the not_found slot page (404, noindex,
    // "Could not find <Name>.") and the Wild Card deck error page (500),
    // both in the deck's Default-Layout chrome, with the staging builder's
    // minimal-stub fallback when the chrome cannot be built. The 422 has no
    // staging shape (the unsupported-view mapping is the edge's own) and
    // keeps the bare page below, escape convention unchanged: the crafted
    // name rides the message, so every interpolation of it is escaped.
    //
    // THE CLASSIFICATION: mapRenderError — the
    // shared-surface table BOTH Cloudflare twins answer with — replaces the
    // carried two-regex arm. Same coverage for the two carried classes
    // (card not found: -> 404 chrome; view ( -> 422 bare) and one union
    // addition: the id-doesn't-exist / codename-doesn't-exist NotFound
    // family (name/errors.ts -> error.rb:88-89) now answers the not_found
    // chrome instead of falling to the 500 Wild Card — the shape the old
    // third-twin handler answered and its /~999999 parity pin holds.
    const mapped = mapRenderError(message);
    if (mapped.status === 403) {
      const viewHtml = `<h1>Forbidden</h1><pre>${escapeHtml(message)}</pre>`;
      return renderFullChromeErrorPage(await source.deck(), {
        status: 403, titleText: "Forbidden", cardName: errorCardName, viewHtml,
        fallbackHtml: layoutPage("Forbidden", viewHtml),
      });
    }
    if (mapped.status === 422) {
      return html(
        422,
        layoutPage(
          "Error",
          `<h1>${escapeHtml("Unsupported view")}</h1><pre>${escapeHtml(message)}</pre>`,
        ),
      );
    }
    if (mapped.status === 404) {
      // A signed-in viewer reaching an unknown card gets the new-card form
      // with the name filled in (page_view_for_unknown's :new for a viewer
      // who may create), typed by the deck's *all+*default rule.
      // Action routes (/delete/x, /update/x, ...) are never a card to create.
      const firstSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
      const actionRoute = ["create", "read", "update", "delete", "card"].includes(firstSegment);
      if (options?.viewer !== undefined && !actionRoute) {
        const deck = await source.deck();
        const typeName = await defaultNewCardTypeName(deck);
        if (isXhr(request)) {
          // The slotter's modal mode appends the answer to body and shows it.
          const typeRecord = await deck.fetcher.fetchByKey(DeckoName.parse(typeName).key, { skipVirtual: true }).catch(() => undefined);
          if (typeRecord?.id !== undefined && typeRecord.name !== undefined) {
            const cardName = url.searchParams.get("card[name]") ?? newCardNameFor(errorCardName);
            const form = signedInNewCardFormBodyHtml(typeRecord.name.s, typeRecord.id, typeRecord.codename ?? undefined, cardName);
            return html(
              200,
              `<div class='modal fade _modal-slot' role='dialog'><div class='modal-dialog modal-dialog-centered modal-lg'>` +
                `<div class='modal-content'><div class='modal-body'>${form}</div></div></div></div>`,
            );
          }
        }
        const page = await signedInNewCardPage(source, deck, typeName, options, signal, newCardNameFor(errorCardName), undefined, false)
          .catch(() => undefined);
        if (page !== undefined) return page;
      }
      return renderDeckoNotFoundErrorPage(await source.deck(), errorCardName);
    }
    return renderDeckoServerErrorPage(await source.deck(), errorCardName, err);
  }
}

// The history views' WIRE-KEY -> seam translation lives in the shared surface
// (src/server/worker-shared-surface.ts#historyRenderParamsFromWire) so the
// bunny edge and both Cloudflare twins share one copy. Re-exported here for
// the pinned seam test that imports it from this module.
export { historyRenderParamsFromWire };

/** True when the request path is the BARE single-segment card arm (/:mark,
 *  or the empty path's /Home dispatch) — parsePath's view field is its
 *  "open" default there, not a requested view. Mirrors the grammar
 *  worker.ts parsePath dispatched: strip trailing + leading slashes, one
 *  segment (or zero) = bare; an api dispatch never reaches the page path. */
/** The signed-in /new/:type page: the type card's page, live-rendered under
 *  the viewer so the chrome and decko.signed_in are the session's, with the
 *  new-card form in place of the main slot. undefined when the type does not
 *  resolve or the page has no main slot (the caller falls back). */
async function signedInNewCardPage(
  source: DeferredDeck,
  deck: Deck,
  typeName: string,
  options: EngineRequestOptions,
  signal: AbortSignal | undefined,
  cardName = "",
  content?: string,
  typePreset = true,
): Promise<Response | undefined> {
  const viewer = options.viewer;
  if (viewer === undefined) return undefined;
  return await withLiveRenderScope(async (requestScope) => {
    const keepScope = `new-form-viewer:${permissionViewerKey(viewer)}`;
  const typeKey = DeckoName.parse(typeName);
  const typeRecord = await deck.fetcher.fetchByKey(typeKey.key, { skipVirtual: true }).catch(() => undefined);
  if (typeRecord === undefined || typeRecord.name === undefined || typeRecord.id === undefined) return undefined;
  const render = (base: string) => () =>
    liveRenderPage(
      source.driver,
      base,
      async (driver) => {
        const engines = await bootEdgeServingEngines(driver, options.servedBootOptions ?? {});
        engines.render.viewer = viewer;
        engines.render.pageSession = viewer;
        return engines;
      },
      // The cheapest main view: the slot is replaced by the form, and a
      // cardtype's own page lists every card of the type.
      { signal, keep: false, requestedView: "link", requestScope, keepScope },
    );
  const renderChrome = (base: string) =>
    requestContextAvailable()
      ? runInRequestContext(getNameEnvironment(), render(base))
      : withIsolateRenderLock(render(base));
  // The type card carries the type's own chrome; Home is the fallback when
  // the type card's page does not render.
  let page: Awaited<ReturnType<typeof liveRenderPage>>;
  try {
    page = await renderChrome(typeRecord.name.s);
  } catch {
    try {
      page = await renderChrome("Home");
    } catch {
      return undefined;
    }
  }
  const pageHtml = applyServedEnvironmentDeltas(page.html, deckServedDeltas(deck));
  const mainAt = pageHtml.indexOf('<div id="main">');
  const main = mainAt >= 0 ? divSubtree(pageHtml, mainAt) : undefined;
  if (main === undefined) return undefined;
  // Use the actual mod-composed new form. In particular File/Image must
  // dispatch carrierwave's chooser and preliminary-upload fields, Phrase
  // its text input, and pointer types their configured editors. A generic
  // TinyMCE textarea cannot represent these types.
  const renderForm = async () => {
    const result = await liveRenderView(source.driver, cardName, async (driver) => {
      const engines = await bootEdgeServingEngines(driver, options.servedBootOptions ?? {});
      engines.render.viewer = viewer;
      engines.render.pageSession = viewer;
      engines.render.renderAbsentCards = true;
      return engines;
    }, { signal, requestedView: "new", requestScope, keepScope, historyParams: { focalRoot: true, newCard: { typeId: typeRecord.id, typePreset, ...(content === undefined ? {} : { content }) } } });
    return result;
  };
  const form = await (requestContextAvailable()
    ? runInRequestContext(getNameEnvironment(), renderForm)
    : withIsolateRenderLock(renderForm));
  const body =
    pageHtml.slice(0, mainAt) + `<div id="main">${form.html}</div>` + pageHtml.slice(mainAt + main.length);
  const title = `New ${escapeHtml(typeRecord.name.s)}`;
  return html(form.status, body.replace(/<title>[^<]*?( - [^<]*)?<\/title>/, (_t, site: string | undefined) => `<title>${title}${site ?? ""}</title>`));
  });
}

/** The name a new-card form starts with for a requested unknown card: the
 *  card's display name, or blank for Decko's *new page. */
function newCardNameFor(slug: string): string {
  const name = slug.replace(/_/g, " ");
  return name.toLowerCase() === "*new" ? "" : name;
}

/** The type a new card takes when none is given: the type of the deck's
 *  *all+*default rule card, else Basic. */
async function defaultNewCardTypeName(deck: Deck): Promise<string> {
  try {
    const rule = await deck.fetcher.fetchByKey(DeckoName.parse("*all+*default").key, { skipVirtual: true });
    if (rule?.typeId !== undefined) {
      const type = await deck.fetcher.fetchById(rule.typeId);
      if (type?.name !== undefined) return type.name.s;
    }
  } catch {
    // fall through to Basic
  }
  return "Basic";
}

/** One signed-in live render at a time per isolate. Each boots its own
 *  engines over its own request store; several at once exhausted the
 *  isolate and every in-flight request failed together. */
let signedInRenderChain: Promise<unknown> = Promise.resolve();
function withSignedInRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = signedInRenderChain.then(fn, fn);
  signedInRenderChain = run.catch(() => undefined);
  return run;
}

/** Rails' request.xhr?: X-Requested-With carries XMLHttpRequest. */
function isXhr(request: Request): boolean {
  return /XMLHttpRequest/i.test(request.headers.get("x-requested-with") ?? "");
}

/** The outer HTML of the <div> whose open tag starts at `start`, by
 *  counting nested div tags; undefined when it never closes. */
function divSubtree(pageHtml: string, start: number): string | undefined {
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(pageHtml); m !== null; m = tag.exec(pageHtml)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return pageHtml.slice(start, m.index + m[0].length);
  }
  return undefined;
}

/** An ajax GET answers without the layout, as Card::Env.ajax? does: the
 *  modal slot when the page carries a filled one (the slotter's modal mode
 *  appends it to body and shows it), otherwise the main slot's contents. */
function ajaxSlotFromPage(pageHtml: string): string {
  const modalAt = pageHtml.search(/<div class='modal fade _modal-slot'/);
  if (modalAt >= 0) {
    const modal = divSubtree(pageHtml, modalAt);
    if (modal !== undefined && /class=['"]modal-body['"]>\s*<div/.test(modal)) return modal;
  }
  const mainAt = pageHtml.indexOf('<div id="main">');
  if (mainAt >= 0) {
    const main = divSubtree(pageHtml, mainAt);
    if (main !== undefined) return main.slice('<div id="main">'.length, -"</div>".length);
  }
  return pageHtml;
}

function pathViewIsBareArm(pathname: string): boolean {
  const segments = pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
  return segments.length <= 1;
}

/** The /files/<id>/<leaf> attachment route (see the dispatch comment in
 *  handleEngineRequest): resolve the file card by id, derive the carrierwave
 *  cloud URL exactly as the attachment views do, 302 to it. */
async function filesRouteResponse(deck: Deck, pathname: string): Promise<Response> {
  const match = /^\/files\/(\d+)\/([^/]+)/.exec(pathname);
  if (match === null) {
    // Unreachable through the dispatch guard; kept for type-totality.
    return filesNotFoundResponse("");
  }
  const id = match[1] ?? "";
  const leaf = decodeURIComponent(match[2] ?? "");
  let record: Awaited<ReturnType<FetchEngine["fetchById"]>> | undefined;
  try {
    record = await deck.fetcher.fetchById(Number(id));
  } catch {
    record = undefined;
  }
  const source = record?.dbContent;
  if (record === undefined || record.name === undefined || typeof source !== "string") {
    return filesNotFoundResponse(id);
  }
  const target = derivedCloudAttachmentSource(
    source,
    deckServedDeltas(deck).assetHost,
    filesLeafVariant(leaf),
  );
  if (target === "") {
    return filesNotFoundResponse(id);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

/** The application's own /files/ answer for an id it cannot resolve:
 *  404, text/plain, "Could not find <id>." */
function filesNotFoundResponse(id: string): Response {
  return new Response(filesNotFoundBody(id), {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
