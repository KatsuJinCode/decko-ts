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
// THE ERROR MAPPING (handleEngineRequest's catch), aligned with the CF
// worker's render path (deploy/worker.ts:462-466):
//   card not found: <name>            -> 404 "Card not found"
//     (the throw site is src/card/render.ts:706-708; Ruby answers 404 for a
//     missing card, and before 2026-10-02 this edge fell through to 500)
//   view (<v>) not supported for <n>  -> 422 "Unsupported view"
//     (UnsupportedViewError's message shape, src/card/render.ts:18 — the
//     edge's own case; the CF render path 500s these instead)
//   anything else                     -> 500 "Render error"

import type { FetchEngine } from "../../src/card/fetch.js";
import type { RenderEngine } from "../../src/card/render.js";
import { DEFAULT_PIPELINE_TIMEOUT_MS } from "../../src/card/drivers/bunny-db.js";
import { renderPageBytes } from "../../src/card/render/page.js";
import { derivedCloudAttachmentSource } from "../../src/card/render/views.js";
import { escapeHtml, layoutPage, parsePath } from "../../worker.js";
import {
  SPACES_ASSET_HOST,
  applyServedEnvironmentDeltas,
  filesLeafVariant,
  filesNotFoundBody,
} from "./bunny-edge-page-shell.js";

/** The deck the engine request renders through; booted once per isolate by
 *  the entry (getDeck) and passed in, so this module never touches env or
 *  the driver. */
export interface Deck {
  fetcher: FetchEngine;
  render: RenderEngine;
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
}

/**
 * THE DEADLINE (cold-render reliability, 2026-10-03 — measured, see
 * tmp/wrong-goal-hunt/cold-render-reliability-lane.md).
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
 *  live 2026-10-02 in tmp/wrong-goal-hunt/ttl-24h-apply-lane.md). */
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
 *  have parsed one yet) and no internal error text. */
function budgetExceededResponse(budgetMs: number, retryAfterSeconds: number): Response {
  const response = html(
    503,
    layoutPage(
      "Slow render",
      `<h1>Slow render</h1><p class='muted'>This page took longer than ` +
        `${escapeHtml(String(budgetMs))} ms to render and was stopped before it ` +
        `finished. That is a capacity limit, not a missing page — retrying in a ` +
        `few seconds usually succeeds.</p>`,
    ),
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set(EDGE_BUDGET_DIAGNOSTIC_HEADER, `exceeded; budget_ms=${budgetMs}`);
  return response;
}

/** Race `work` against the budget. Resolves to work's response, or the 503
 *  when the budget wins. Rejections are the work's own outcome and propagate
 *  to the caller's existing try/catch — EXCEPT once the budget has already
 *  fired, where a late rejection must not turn a clean 503 back into a 500.
 */
async function withBudget(
  budgetMs: number,
  retryAfterSeconds: number,
  work: () => Promise<Response>,
): Promise<Response> {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return await work();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const expiry = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve(budgetExceededResponse(budgetMs, retryAfterSeconds));
    }, budgetMs);
    // Never hold the process open on the timer alone: if the platform drops
    // the connection, the timer must not be the reason the isolate lingers.
    (timer as { unref?: () => void }).unref?.();
  });

  try {
    return await Promise.race([work(), expiry]);
  } catch (err) {
    // The budget already produced its answer if it is going to. A work
    // rejection arriving after the timer fired is a symptom of the request
    // we already abandoned, not of the one we are answering — so answer the
    // abandoned one the same way and never let it surface as a 500.
    if (expired) return budgetExceededResponse(budgetMs, retryAfterSeconds);
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
// dropped it; that hardening is deployed live on script 93646, release
// dAZ4TRWv, so this adoption must not un-ship it. edge-true-union merge:
// the local copy is superseded by the single-source export this module now
// imports from worker.ts — 5dd6ab0 exported the identical body there when
// it escaped layoutPage's <title>; one implementation, two call sites.)

export async function handleEngineRequest(
  request: Request,
  deck: Deck,
  options?: EngineRequestOptions,
): Promise<Response> {
  return await withBudget(
    options?.budgetMs ?? 0,
    options?.retryAfterSeconds ?? EDGE_BUDGET_RETRY_AFTER_SECONDS,
    () => dispatchEngineRequest(request, deck),
  );
}

/** The dispatch itself — every branch that touches the database. Split from
 *  handleEngineRequest so the deadline wraps ALL of them (the /api/card read
 *  gate queries too), not only the HTML render. */
async function dispatchEngineRequest(
  request: Request,
  deck: Deck,
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
  // (404, text/plain, "Could not find <id>." — measured on
  // culturesmith.com/files/103/3649-small.jpg).
  if (/^\/files\/\d+\/[^/]+/.test(url.pathname)) {
    return filesRouteResponse(deck, url.pathname);
  }

  const parsed = parsePath(url.pathname, url.searchParams);

  if ("kind" in parsed) {
    if (parsed.kind === "notFound") {
      return html(
        404,
        layoutPage(
          "Not found",
          "<h1>Not found</h1><p class='muted'>Try <a href='/'>the home page</a> or render a card by name, e.g. <code>/Hello+World</code>.</p>",
        ),
      );
    }
    if (url.pathname === "/api/status") {
      return json(200, {
        ok: true,
        runtime: "bunny-edge-scripting",
        engine: "decko-ts",
        notes: "boot pattern: warm caches survive across requests in the same isolate",
      });
    }
    if (url.pathname.startsWith("/api/card/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/card/".length));
      const record = await deck.fetcher.fetchByName(name);
      if (record === undefined || record.name === undefined) {
        return json(404, { error: "card not found", name });
      }
      // THE READ GATE (api-leak-fix lane, 2026-10-02): this route previously
      // served db_content_preview for cards the HTML views replace with the
      // denial span — the same hole the CF worker's record-JSON route had
      // and closed (deploy/worker.ts cardRecordJson:469-492, the probe
      // battery's batch-05 KNOWN HOLE there): verified live on script 93646
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
        db_content_preview: (record.dbContent ?? "").slice(0, 200),
      });
    }
    return html(404, layoutPage("Not found", "<h1>Not found</h1>"));
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
    // HISTORY VIEWS stay on the bare-view lane (edge-site-shell residual):
    // history/act/action_summary consume HistoryRenderParams (act_id, page,
    // ... — parsePath worker.ts:104-109 -> render.ts:1331
    // prepareHistoryRender), a per-render seam renderPageBytes does not
    // thread (its page.ts:184 prepare render passes no params; the staging
    // host's page entry has the same shape). Moving them would silently
    // drop the act filter they answer filtered today, so they keep the
    // exact pre-lane call and bytes; the page-shell gap for this view
    // family is a named residual, not a regression.
    if (HISTORY_PARAM_VIEWS.has(parsed.view)) {
      const htmlBody = await deck.render.render(parsed.name, parsed.view, parsed.params ?? {});
      return html(200, layoutPage(`${parsed.name} (${parsed.view})`, htmlBody));
    }
    const pageView = pathViewIsBareArm(url.pathname) ? undefined : parsed.view;
    const pageHtml = await renderPageBytes(deck.render, parsed.name, pageView);
    return html(200, applyServedEnvironmentDeltas(pageHtml));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Status mapping aligned with the CF worker's render path
    // (deploy/worker.ts:462-466): a missing card is a 404 — Ruby answers 404
    // for a missing card too (this edge previously fell through to 500). The
    // 422 unsupported-view case stays the edge's own (UnsupportedViewError's
    // message shape, src/card/render.ts:18); anything else is a 500.
    const isCardNotFound = /^card not found: /.test(message);
    const isUnsupportedView = message.startsWith("view (");
    const status = isCardNotFound ? 404 : isUnsupportedView ? 422 : 500;
    const title = isCardNotFound
      ? "Card not found"
      : isUnsupportedView
        ? "Unsupported view"
        : "Render error";
    // The message embeds the requested card name (the crafted-name payload
    // rides parsePath's decode), so the interpolations are escaped — the
    // same convention the CF worker's errorPage uses (deploy/worker.ts
    // errorPage -> escapeHtml) and the entry error pages got on 70d2042.
    return html(
      status,
      layoutPage(
        "Error",
        `<h1>${escapeHtml(title)}</h1><pre>${escapeHtml(message)}</pre>`,
      ),
    );
  }
}

/** The history views whose render consumes HistoryRenderParams
 *  (parsePath worker.ts:104-109); they keep the bare-view lane (see the
 *  dispatch comment in handleEngineRequest). */
const HISTORY_PARAM_VIEWS = new Set(["history", "act", "action_summary"]);

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
 *  404, text/plain, "Could not find <id>." (measured on
 *  culturesmith.com/files/103/3649-small.jpg, 2026-10-02). */
function filesNotFoundResponse(id: string): Response {
  return new Response(filesNotFoundBody(id), {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
