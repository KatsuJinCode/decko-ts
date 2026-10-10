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
//     (Ruby answers 404 for a missing card; before 2026-10-02 this edge fell
//     through to 500).
//   view (<v>) not supported for <n>  -> 422 "Unsupported view" bare page
//     (UnsupportedViewError's message shape, src/card/render.ts:18 — the
//     edge's own case, no staging shape exists for it; the CF render path
//     500s these instead)
//   anything else                     -> 500 Decko's full-chrome Wild Card
//     deck error page (the same port; live_Introduction.html shape)
// The no-route 404s (parsePath notFound + the api fallthrough) answer the
// staging ROUTER's minimal stub — a different route class from the card
// not_found page (vm-staging-server.mjs:2203). The budget 503 answers the
// full chrome around the edge's own Slow-render body region, grace-bounded
// back to the bare pre-lane page when the database is too slow to build
// chrome (EDGE_ERROR_PAGE_GRACE_MS). Every error surface stays no-store.

import type { FetchEngine } from "../../src/card/fetch.js";
import type { RenderEngine } from "../../src/card/render.js";
import { DEFAULT_PIPELINE_TIMEOUT_MS } from "../../src/card/drivers/bunny-db.js";
import { edgeHostLabels } from "./edge-host-labels.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { renderPageWithStatus } from "../../src/card/render/page.js";
import { liveRenderPage } from "../../src/card/live/live-render.js";
import { requestContextAvailable, runInRequestContext } from "../../src/card/request-context.js";
import { getNameEnvironment } from "../../src/card/name/environment.js";
import { bootEdgeServingEngines } from "./bunny-edge-deck-boot.js";
import { derivedCloudAttachmentSource } from "../../src/card/render/views.js";
import type { HistoryRenderParams } from "../../src/card/history/render-seam.js";
import {
  decodeName,
  mapRenderError,
  publicDbContent,
  queryViewFromUrl,
} from "../../src/server/worker-shared-surface.js";
import { escapeHtml, layoutPage, parsePath } from "./bunny-edge-lineage-worker-surface.js";
import {
  SPACES_ASSET_HOST,
  applyServedEnvironmentDeltas,
  filesLeafVariant,
  filesNotFoundBody,
} from "./bunny-edge-page-shell.js";
import {
  EDGE_ERROR_PAGE_GRACE_MS,
  noRouteNotFoundResponse,
  renderDeckoNotFoundErrorPage,
  renderDeckoServerErrorPage,
  renderFullChromeErrorPage,
} from "./bunny-edge-error-page.js";
import { newCardRouteResponse } from "./bunny-edge-new-card-form.js";

/** The deck the engine request renders through; booted once per isolate by
 *  the entry (getDeck) and passed in, so this module never touches env or
 *  the driver. */
export interface Deck {
  fetcher: FetchEngine;
  render: RenderEngine;
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
   * any value <= 0 means UNBOUNDED (the behavior this lane replaced).
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
  if (options?.anonymous !== true) return false;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const flag =
    options.liveRenderFlag ?? (typeof process !== "undefined" ? process.env?.DECKO_LIVE_RENDER : undefined);
  if (flag === "0") return false;
  if (!pathViewIsBareArm(url.pathname) || pageView !== undefined) return false;
  return Object.keys(historyParams).length === 0;
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
 * THE DEADLINE (cold-render reliability, 2026-10-03 — measured, see
 * an internal work log).
 *
 * A cold render on this edge is a long SERIAL chain of database round trips:
 * the trial edge measured 1,151 HTTP round trips (4.9 MB of database
 * response) to produce ONE 76-byte page, and 814 for Home. Wall time is the
 * sum of ~1,000-odd independent hop latencies, and before this deadline the
 * sum had NO upper bound in code — the only thing that stopped a slow chain
 * was the PLATFORM ending the script, and the platform answers that with an
 * opaque 5xx after a long wait. That is the operator-visible failure: a page
 * that returns 500 after ~40 s and 200 on retry, because the chain is
 * deterministic and only the wait varied.
 *
 * This deadline makes the application, not the platform, the thing that ends
 * a slow request, and it ends it with an answer a client can act on: 503
 * (retryable by definition) + `Retry-After` + `no-store`. Two properties make
 * it safe:
 *   - it sits ABOVE every cold render measured on the trial edge (60 cold
 *     probes: p50 3.3 s, p95 5.0 s, max 13.5 s reproducibly on the heaviest
 *     card), so a render that would have succeeded still succeeds and its
 *     bytes are unchanged;
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
 *  (a variable update is effective on running isolates immediately, proven
 *  live 2026-10-02 in an internal work log). */
export const EDGE_RENDER_BUDGET_ENV_VAR = "DECKO_EDGE_RENDER_BUDGET_MS";

/** Resolve the per-request render budget from the edge environment.
 *  Absent or unparseable keeps DEFAULT_EDGE_RENDER_BUDGET_MS; an explicit
 *  "0" disables the deadline entirely (the pre-lane behavior), which is the
 *  operator's rollback that needs no republish. */
export function resolveEdgeRenderBudgetMs(env: EdgeEnv): number {
  const raw = env[EDGE_RENDER_BUDGET_ENV_VAR];
  if (raw === undefined) return DEFAULT_EDGE_RENDER_BUDGET_MS;
  const parsed = Number(raw);
  if (raw.trim() === "") return DEFAULT_EDGE_RENDER_BUDGET_MS;
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_EDGE_RENDER_BUDGET_MS;
  return Math.trunc(parsed);
}

/** The per-pipeline hop bound (P1 incident 2026-10-03, edge-incident-fix
 *  lane). The cold-render release shipped a 5,000 ms per-pipeline abort
 *  while the render still ran whole-deck recursive walks; real visitors'
 *  hops legitimately exceeded the bound and every page answered "Pipeline
 *  Transport failed ... signal timed out". The query scoping lands with
 *  this lane and the default raises to 15,000 ms
 *  (DEFAULT_PIPELINE_TIMEOUT_MS — above the scoped walks' worst case with
 *  headroom, below the 20,000 ms request budget), and this variable retunes
 *  the bound WITHOUT a republish — the same operational property
 *  DECKO_EDGE_RENDER_BUDGET_MS has for the whole-request deadline. */
export const EDGE_PIPELINE_TIMEOUT_ENV_VAR = "DECKO_EDGE_PIPELINE_TIMEOUT_MS";

/** Resolve the per-pipeline timeout from the edge environment. Same
 *  fail-safe semantics as the budget resolver: absent, empty, unparseable,
 *  or negative keeps DEFAULT_PIPELINE_TIMEOUT_MS; an explicit "0" passes 0
 *  through, which the driver maps to "no per-hop abort" (the pre-lane
 *  behavior — the operator's rollback that needs no republish). */
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
 *  p2-error-shell lane (2026-10-03): the body region is re-homed into the
 *  FULL-CHROME error page (bunny-edge-error-page.ts — the staging host's
 *  error builder port). No staging shape exists for an infra 503, so the
 *  title and body text are byte-identical to the bare page this replaced,
 *  and when the chrome cannot be built (or the chrome build outlives
 *  EDGE_ERROR_PAGE_GRACE_MS — the budget fired because the database is slow
 *  or dead, and the error page must not become a second long wait) the
 *  fallback IS the bare pre-lane page below. Retry-After and the diagnostic
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
// through this. (Carried forward from the error-page-escape lane's 70d2042
// monolith entry through the engine-request split — the split initially
// dropped it; the deployed edge serves the hardened bytes, so this
// adoption must not un-ship the fix — a regression here would again let a
// crafted card name land in an error page as markup. edge-true-union merge:
// the local copy is superseded by the single-source export this module now
// imports from worker.ts — 5dd6ab0 exported the identical body there when
// it escaped layoutPage's <title>; one implementation, two call sites.)

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

  // The /files/ attachment route (edge-site-shell lane): live's pages
  // reference EVERY image/script/css attachment by its absolute Spaces CDN
  // URL (measured 2026-10-02: zero relative /files/ refs across the five
  // live gate pages), so the served page bytes resolve without this route —
  // but a /files/ URL hit directly must not fall into the card grammar's
  // 404 HTML. The route resolves the card id, derives the SAME CDN URL the
  // engine's attachment views derive (derivedCloudAttachmentSource — Ruby's
  // action-id filename derivation, never the stored key), and 302s to it;
  // an unresolvable id answers the LIVE app's own shape for this path
  // (404, text/plain, "Could not find <id>." — measured on the live
  // site's /files/103/3649-small.jpg path).
  if (/^\/files\/\d+\/[^/]+/.test(url.pathname)) {
    return filesRouteResponse(await source.deck(), url.pathname);
  }

  const parsed = parsePath(url.pathname, url.searchParams);

  if ("kind" in parsed) {
    if (parsed.kind === "new") {
      // THE /new/:type ARM (route-gaps lane, 2026-10-05): decko's
      // engine_routes.rb:22 card-creation route — the signup journey's
      // route the deck's own chrome links as /new/Sign_up. The create
      // form/denial/not-found decision (the anonymous viewer's
      // ok?(:create) on the virtual card) lives in
      // bunny-edge-new-card-form.ts; the measured 404 this replaces is
      // capture-log-demo-nav.jsonl seq 97.
      return await newCardRouteResponse(await source.deck(), parsed.typeName);
    }
    if (parsed.kind === "notFound") {
      // THE NO-ROUTE CLASS (p2-error-shell lane, 2026-10-03): paths that
      // never parse to a card route answer the staging ROUTER's own minimal
      // stub (vm-staging-server.mjs:2203 — `<pre>No route for <path></pre>`,
      // pathname escaped), not the full-chrome card not_found page: staging
      // routes only single-segment card names to the renderer, and live's
      // Rails router 404s this class bare too. The title stays the edge's
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
      // THE HARDENED DECODE (deploy-surface-union: the third twin's arm
      // shape — the twins' shared decodeName rule,
      // worker-shared-surface.ts): a malformed % answers 400
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
        const record = await deck.fetcher.fetchByName(name);
        if (record === undefined || record.name === undefined) {
          return json(404, { error: "card not found", name });
        }
        // THE READ GATE (api-leak-fix lane, 2026-10-02): this route previously
        // served db_content_preview for cards the HTML views replace with the
        // denial span — the same hole the CF worker's record-JSON route had
        // and closed (deploy/worker.ts cardRecordJson:469-492, the probe
        // battery's batch-05 KNOWN HOLE there): verified live
        // (GET /api/card/Taking%20Stock -> 200 + 200 chars of the denied
        // card's content while GET /Taking%20Stock rendered the denial).
        // Ruby's GET of a denied card renders the denial (ok_to_read? fails,
        // set/all/permissions.rb:139-146); the JSON surface answers the CF
        // worker's exact shape, 403 {"error":"permission denied"} without the
        // protected fields, the verdict from the same engine state the HTML
        // path judges with (RenderEngine#canReadCard — the non-HTML-entry
        // permission seam, src/card/render.ts: stored-rule verdict, the mod
        // set-module overrides, and the fail-closed live rule walk incl.).
        // Pin: tests/deploy/bunny-edge-engine-request-api-card-read-gate.test.ts
        // (red with the gate removed — queue job api-leak-lane-j2 —, green
        // with it). The concurrent edge-redeploy lane's 89efcab implemented
        // the same gate as an inline anonymous walk (403 "read denied");
        // unification keeps the canReadCard delegation — one verdict path
        // shared with the HTML judgments, override layer included — and the
        // CF worker's response shape; the redeploy pin's unique cases ride in
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
    // THE FULL PAGE SHELL (edge-site-shell lane, 2026-10-02): the page is
    // the engine's own show_with_page_layout assembly — renderPageBytes
    // (src/card/render/page.ts: the per-card *layout rule, the *header/
    // *footer nests, the html_page head with favicon/stylesheet/script
    // tags) — with the five served-environment deltas the staging host has
    // applied since r18 (bunny-edge-page-shell.ts, constants byte-verbatim
    // from vm-staging-server.mjs:1586-1626). The former shell wrapped the
    // bare view in worker.ts layoutPage (inline <style>, a two-link nav,
    // nothing else) — measured live 2026-10-02 as 0 <link>/0 <script> tags
    // against the live site's 3/9, no navbar, no footer, no favicon.
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
    // HISTORY VIEWS ride the page path too (p2-history-seam lane,
    // 2026-10-03 — closes the edge-site-shell residual: they kept the bare
    // layoutPage lane because HistoryRenderParams had no page-path seam).
    // renderPageBytes's historyParams argument (src/card/render/page.ts)
    // threads the query into the prepare render's RenderEngine.render, whose
    // prepareHistoryRender seats the render-time history reader the sync
    // history ViewFns read — so the full-chrome shell wraps the SAME view
    // bytes the bare engine.render(name, view, params) machinery produces,
    // with act_from_context's semantics intact: act_id present -> THAT act,
    // absent -> the last action's act. The wire keys parsePath extracts
    // (act_id/action_id/... — worker.ts:104-109) translate to the seam's
    // camelCase fields HERE (historyRenderParamsFromWire); the bare lane
    // passed them untranslated, where the views could not read them — the
    // measured base state: ?act_id=<real> and no param rendered identical
    // last-act bodies.
    //
    // deploy-surface-union: the query view REACHES the page path — the bare
    // arm's requestedView is queryViewFromUrl (the shared view_from_params
    // shape, rest.rb:100-103: first NON-BLANK of ?view=/ ?v=), the
    // capability the old third-twin handler carried and its parity pin
    // ("?view= fills the view-less arm") holds. An explicit path view still
    // wins (the action arg never falls through to params).
    const pageView = pathViewIsBareArm(url.pathname) ? queryViewFromUrl(url) : parsed.view;
    const historyParams = historyRenderParamsFromWire(parsed.params);
    const renderLive = async () =>
      (
        await liveRenderPage(source.driver, parsed.name, (driver) => bootEdgeServingEngines(driver), {
          requestedView: pageView,
          historyParams,
          signal,
        })
      );
    // Each arm answers the page's HTML and its status (403 when the main
    // card is read-denied: Ruby's root.error_status, format/error.rb:27-31).
    const page = !liveRenderApplies(request, url, options, pageView, historyParams as Record<string, unknown>)
      ? await source.deck().then((d) => withIsolateRenderLock(() => renderPageWithStatus(d.render, parsed.name, pageView, historyParams)))
      : requestContextAvailable()
        ? // CONCURRENT: the live render boots its own engines over its own
          // request store, and runs in its own request context (name
          // environment, name memos, boot bundle), so live renders in one
          // isolate run side by side and never take the lock. Its passes'
          // environments stay inside the context.
          await runInRequestContext(getNameEnvironment(), renderLive)
        : await withIsolateRenderLock(async () => {
            try {
              return await renderLive();
            } finally {
              // The passes' engines installed their own name environments;
              // hand the process-global one back to the isolate's deck.
              (await source.deck()).fetcher.installNameEnvironment?.();
            }
          });
    return html(page.status, applyServedEnvironmentDeltas(page.html));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Status mapping aligned with the CF worker's render path
    // (deploy/worker.ts:462-466): a missing card is a 404 — Ruby answers 404
    // for a missing card too (this edge previously fell through to 500). The
    // 422 unsupported-view case stays the edge's own (UnsupportedViewError's
    // message shape, src/card/render.ts:18); anything else is a 500.
    //
    // THE FULL-CHROME ERROR SURFACES (p2-error-shell lane, 2026-10-03): the
    // 404 and the 500 route through the staging host's error builder port
    // (bunny-edge-error-page.ts) — the not_found slot page (404, noindex,
    // "Could not find <Name>.") and the Wild Card deck error page (500),
    // both in the deck's Default-Layout chrome, with the staging builder's
    // minimal-stub fallback when the chrome cannot be built. The 422 has no
    // staging shape (the unsupported-view mapping is the edge's own) and
    // keeps the bare page below, escape convention unchanged: the crafted
    // name rides the message, so every interpolation of it is escaped.
    //
    // THE CLASSIFICATION (deploy-surface-union): mapRenderError — the
    // shared-surface table BOTH Cloudflare twins answer with — replaces the
    // carried two-regex arm. Same coverage for the two carried classes
    // (card not found: -> 404 chrome; view ( -> 422 bare) and one union
    // addition: the id-doesn't-exist / codename-doesn't-exist NotFound
    // family (name/errors.ts -> error.rb:88-89) now answers the not_found
    // chrome instead of falling to the 500 Wild Card — the shape the old
    // third-twin handler answered and its /~999999 parity pin holds.
    const mapped = mapRenderError(message);
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
      return renderDeckoNotFoundErrorPage(await source.deck(), parsed.name);
    }
    return renderDeckoServerErrorPage(await source.deck(), parsed.name);
  }
}

/** The history views' WIRE-KEY -> seam translation (p2-history-seam lane):
 *  worker.ts parsePath extracts the query under Ruby's param names
 *  (act_id/action_id/page/act_seq/action_view/hide_diff/act_context — the
 *  Card::Env.params keys, worker.ts:104-109), while HistoryRenderParams and
 *  the view fns read the camelCase fields (src/card/history/render-seam.ts).
 *  The bare lane passed the wire-keyed object straight through, where
 *  `reader.params.actId` was undefined for every request — the act_id
 *  filter silently inert (measured at base 12bd5236: ?act_id=<real> and no
 *  param rendered identical bodies). This mapping is the seam's carrier:
 *  unknown keys are dropped, absent input maps to {} (renderPageBytes's
 *  undefined-safe contract), values pass verbatim (the views' own integer/
 *  enum parsing is unchanged downstream). */
export function historyRenderParamsFromWire(
  params: Record<string, string> | undefined,
): HistoryRenderParams {
  if (params === undefined) return {};
  const out: HistoryRenderParams = {};
  if (params["act_id"] !== undefined) out.actId = params["act_id"];
  if (params["action_id"] !== undefined) out.actionId = params["action_id"];
  if (params["act_seq"] !== undefined) out.actSeq = params["act_seq"];
  if (params["action_view"] !== undefined) out.actionView = params["action_view"];
  if (params["hide_diff"] !== undefined) out.hideDiff = params["hide_diff"];
  if (params["act_context"] !== undefined) out.actContext = params["act_context"];
  if (params["page"] !== undefined) out.page = params["page"];
  return out;
}

/** True when the request path is the BARE single-segment card arm (/:mark,
 *  or the empty path's /Home dispatch) — parsePath's view field is its
 *  "open" default there, not a requested view. Mirrors the grammar
 *  worker.ts parsePath dispatched: strip trailing + leading slashes, one
 *  segment (or zero) = bare; an api dispatch never reaches the page path. */
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
  const target = derivedCloudAttachmentSource(source, SPACES_ASSET_HOST, filesLeafVariant(leaf));
  if (target === "") {
    return filesNotFoundResponse(id);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

/** The live app's own /files/ answer for an id it cannot resolve:
 *  404, text/plain, "Could not find <id>." (measured on the live
 *  site's /files/103/3649-small.jpg path, 2026-10-02). */
function filesNotFoundResponse(id: string): Response {
  return new Response(filesNotFoundBody(id), {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
