// deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts — the deploy
// lineage's root worker.ts URL/request surface (parsePath + PAGE_STYLE +
// escapeHtml + layoutPage), carried VERBATIM from lane-dbroundtrip-deploy
// tip 12bd5236 by the fold-11 integrator.
//
// WHY THIS EXISTS: the four p2 lanes (error-shell / history-seam / person /
// codename) were built on the deploy lineage, whose root worker.ts exports
// escapeHtml and a two-arg parsePath(pathname, searchParams) that returns the
// wire params (act_id / action_id / page / ...). The integration line's root
// worker.ts evolved independently: its parsePath takes only a pathname and
// returns no params. This shim gives the carried p2 request surface
// (bunny-edge-engine-request.ts + bunny-edge-error-page.ts + their pin
// files) the exact worker contract it was written and gated against.
//
// THE deploy-surface-union LANE (2026-10-03) WIRED this surface: the serving
// handler (bunny-edge-engine-handler.ts) dispatches through the carried
// request core, whose URL grammar is THIS parsePath. Union resolution
// (superset-of-information, recorded in
// an internal work log): parsePath below is the
// LINEAGE grammar PLUS the integration root worker.ts's three verified
// upgrades, because the wired serving path must lose no capability either
// lineage carried:
//   1. the hardened decodeName (a malformed % answers the no-route 404,
//      never an unescaped URIError — worker-shared-surface.ts, the twins'
//      rule; the lineage's raw decodeURIComponent threw unhandled);
//   2. ANY-view two-segment arm (the root worker's divergence fix: Ruby's
//      route matches any view and the ENGINE decides — engine_routes.rb:51
//      constrains nothing; an unregistered view raises
//      UnsupportedViewError and maps to 422; the lineage's 17-view
//      allowlist 404'd mod-registered views this line's engine carries);
//   3. the three-segment /:mark/view/:view arm (root worker + the CF
//      harness's documented route).
// The lineage's own additions are RETAINED: the wire-param extraction
// (act_id/action_id/page/act_seq/action_view/hide_diff/act_context) on
// card routes — the history views read them, every other view ignores
// them (Rack hands the controller all params and the views pick), so the
// extraction rides any card route. The former SUPPORTED_VIEWS allowlist
// is retired as a strict subset of the any-view arm. escapeHtml and
// layoutPage below remain byte-verbatim 12bd5236:worker.ts.
//
// Byte-provenance of the unchanged members: escapeHtml/PAGE_STYLE/
// layoutPage are verbatim 12bd5236:worker.ts (lines 144-151, 153-166,
// 168-178); parsePath is the union shape documented above.

import { decodeName, decodeViewSegment } from "../../src/server/worker-shared-surface.js";

function parsePath(
  pathname: string,
  searchParams?: URLSearchParams,
):
  | { name: string; view: string; params?: Record<string, string>; format?: "json" }
  | { kind: "new"; typeName: string }
  | { kind: "api" }
  | { kind: "notFound" } {
  // strip trailing slash, drop leading slash
  const path = pathname.replace(/\/+$/, "").replace(/^\/+/, "");
  if (path === "") return { name: "Home", view: "open" };
  if (path === "api/status") return { kind: "api" };
  if (path.startsWith("api/card/")) return { kind: "api" };

  // The history views' wire params (Card::Env.params equivalents — the
  // lineage's addition, retained): extracted on every card route; the
  // history views read them, every other view ignores them.
  const wireParams = (): Record<string, string> | undefined => {
    if (searchParams === undefined) return undefined;
    const params: Record<string, string> = {};
    for (const key of ["act_id", "action_id", "page", "act_seq", "action_view", "hide_diff", "act_context"]) {
      const value = searchParams.get(key);
      if (value !== null) params[key] = value;
    }
    return Object.keys(params).length > 0 ? params : undefined;
  };

  const segments = path.split("/");
  if (segments.length === 1) {
    const name = decodeName(segments[0]!);
    if (name === undefined || name === "") return { kind: "notFound" };
    // Bare single-segment arm: Ruby's card#read -> show(nil) — the page
    // path re-derives bareness for the requestedView (the "open" here is
    // parsePath's pinned default, not a requested view).
    return { name, view: "open" };
  }
  if (segments.length === 2 && segments[0] === "new") {
    // THE /new/:type ARM (route-gaps lane, 2026-10-05): decko's
    // engine_routes.rb:22 `get "new/:type" => "card#read", view: "new"` —
    // the card-creation route the deck's own chrome links as /new/Sign_up
    // (the *account_links navbar arm and the signin form's "...or sign up!"
    // link; live-signin-ref.html). ROUTE PRECEDENCE: Rails matches this arm
    // before the generic :mark/:view route (engine_routes.rb:51), so
    // /new/<anything> never renders the card "new" — the same precedence
    // here, ahead of the 2-segment arm below. The route carries NO mark:
    // card_class.rb:104-133 sets opts[:type] from the segment while
    // implicit_mark resolves to "" (the unknown:true :new view needs no
    // name) — the rendered card is a NEW card of the requested type.
    const typeName = decodeName(segments[1]!);
    if (typeName === undefined || typeName === "") return { kind: "notFound" };
    return { kind: "new", typeName };
  }
  if (segments.length === 2) {
    const name = decodeName(segments[0]!);
    // The view is a snake_case identifier matched literally — the fold is
    // uri_fetch_opts' for NAMES; a folded view misses the registered-view
    // table (action_summary -> "action summary" answered the 422).
    // Ruby route line 51: get ":mark/:view(.:format)" => "card#read" — the
    // .:format suffix is part of the VIEW segment (the navbox typeahead's
    // search_box_complete.json: view search_box_complete, format json), not
    // the card name. A suffixed path dispatches the view in the json
    // format; the bare form stays the html-format read.
    const rawView = segments[1]!;
    const isJson = rawView.endsWith(".json");
    const view = decodeViewSegment(isJson ? rawView.slice(0, -".json".length) : rawView);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "notFound" };
    }
    // Any view, verbatim — the engine decides (root worker's rule): an
    // unregistered view raises UnsupportedViewError and maps to 422.
    const params = wireParams();
    return {
      name,
      view,
      ...(params !== undefined ? { params } : {}),
      ...(isJson ? { format: "json" as const } : {}),
    };
  }
  if (segments.length === 3 && segments[1] === "view") {
    // The /:mark/view/:view arm (root worker + the CF harness route).
    const name = decodeName(segments[0]!);
    const view = decodeViewSegment(segments[2]!);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "notFound" };
    }
    const params = wireParams();
    return { name, view, ...(params !== undefined ? { params } : {}) };
  }
  return { kind: "notFound" };
}

// Named export for the tests: the URL parser under test is this exact
// function, not a copy of it. This file is the entry wrangler.toml `main`
// points at, so the tests and the deployed Worker run the same code.
export { parsePath };

const PAGE_STYLE = `
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  .muted { color: #6b6b6b; font-size: 0.9rem; }
  pre { background: #f6f8fa; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; }
  .nav { display: flex; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #eaeaea; margin-bottom: 1rem; font-size: 0.9rem; }
  .nav a { color: #0066cc; text-decoration: none; }
`;

/** The CF worker's own escapeHtml (deploy/worker.ts errorPage's helper,
 *  byte-matched) — the page title rides a parsed card name on 200-pages
 *  (`${parsed.name} (${parsed.view})`), and parsePath decodes the URL path,
 *  so a crafted name must land as text, not markup. Exported for the Bunny
 *  Edge engine request core (deploy/bunny-worker-src/
 *  bunny-edge-engine-request.ts), whose error pages interpolate the same
 *  name-carrying render-error messages. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared with the Bunny Edge engine entry
 *  (deploy/bunny-worker-src/bunny-edge-engine-entry.ts) so both edges wrap
 *  renders in the SAME layout shell. The title is escaped here, at the
 *  emitter — every call site's title (200-pages, error pages) is covered;
 *  the body is HTML-by-contract and its dynamic interpolations are escaped
 *  at their own call sites. */
export function layoutPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><div class="nav"><a href="/">Home</a><a href="/api/status">Status</a></div>${body}</body></html>`;
}
