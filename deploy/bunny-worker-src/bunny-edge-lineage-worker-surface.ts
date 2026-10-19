// deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts — the root
// worker.ts URL/request surface (parsePath + PAGE_STYLE + escapeHtml +
// layoutPage) that the deployed serving path dispatches through.
//
// WHY THIS EXISTS: two roots of worker.ts evolved independently. The deploy
// lineage's root exports escapeHtml and a two-arg parsePath(pathname,
// searchParams) that returns the wire params (act_id / action_id / page /
// ...). The other root's parsePath takes only a pathname and returns no
// params. This shim gives the request core (bunny-edge-engine-request.ts +
// bunny-edge-error-page.ts + their pin files) the exact worker contract it
// was written and gated against.
//
// parsePath below is the lineage grammar PLUS the other root worker.ts's
// three verified upgrades, because the wired serving path must lose no
// capability either lineage carried:
//   1. the hardened decodeName (a malformed % answers the no-route 404,
//      never an unescaped URIError — worker-shared-surface.ts; a raw
//      decodeURIComponent threw unhandled);
//   2. ANY-view two-segment arm (Ruby's route matches any view and the
//      ENGINE decides — engine_routes.rb:51 constrains nothing; an
//      unregistered view raises UnsupportedViewError and maps to 422; a
//      fixed 17-view allowlist 404'd mod-registered views this engine
//      carries);
//   3. the three-segment /:mark/view/:view arm.
//
// The lineage's own additions are RETAINED: the wire-param extraction
// (act_id/action_id/page/act_seq/action_view/hide_diff/act_context) on
// card routes — the history views read them, every other view ignores them
// (Rack hands the controller all params and the views pick), so the
// extraction rides any card route. The former SUPPORTED_VIEWS allowlist is
// retired as a strict subset of the any-view arm.
//
// escapeHtml, PAGE_STYLE and layoutPage below remain byte-verbatim against
// worker.ts; parsePath is the union shape documented above.

import { decodeName, decodeViewSegment, isDeprecatedAssetRoute } from "../../src/server/worker-shared-surface.js";

// engine_routes.rb:22,51: RSS is a format on the mark or view, not its name.
// Keep the existing JSON route precedence and every non-RSS path unchanged.
function parsePath(pathname: string, searchParams?: URLSearchParams): ReturnType<typeof parseBasePath> | {name:string;view:string;params?:Record<string,string>;format:"rss"} {
  const segments=pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
  const suffix=segments.length<=2&&pathname.endsWith(".rss");
  const requested=suffix||searchParams?.get("format")==="rss";
  if(!requested)return parseBasePath(pathname,searchParams);
  const normalized=suffix?pathname.slice(0,-4):pathname;
  if(suffix&&normalized.replace(/\//g,"")==="")return {kind:"notFound"};
  const parsed=parseBasePath(normalized,searchParams);
  if("kind" in parsed)return suffix?parseBasePath(pathname,searchParams):parsed;
  if(parsed.format==="json")return parsed;
  const view=segments.length<=1?(searchParams?.get("view")||searchParams?.get("v")||"feed"):parsed.view;
  return {...parsed,view,format:"rss"};
}

function parseBasePath(
  pathname: string,
  searchParams?: URLSearchParams,
):
  | { name: string; view: string; params?: Record<string, string>; format?: "json" }
  | { kind: "new"; typeName: string; cardName?: string; typeId?: number }
  | { kind: "typeHome"; typeName: string }
  | { kind: "actionRead"; rawMark?: string }
  | { kind: "api" }
  | { kind: "assetStub" }
  | { kind: "notFound" } {
  // The history views' wire params (Card::Env.params equivalents — the
  // lineage's addition, retained): extracted on every card route; the
  // history views read them, every other view ignores them.
  const wireParams = (): Record<string, string> | undefined => {
    if (searchParams === undefined) return undefined;
    const params: Record<string, string> = {};
    for (const key of ["act_id", "action_id", "page", "act_seq", "action_view", "hide_diff", "act_context", "tinymce_id", "tm_snippet_raw", "tm_snippet_start"]) {
      const value = searchParams.get(key);
      if (value !== null) params[key] = value;
    }
    return Object.keys(params).length > 0 ? params : undefined;
  };

  // Bare card URLs also carry XHR view/editor and history query params.
  const path = pathname.replace(/\/+$/, "").replace(/^\/+/, "");
  if (path === "") {
    const params = wireParams();
    // Rules' set selector submits to /?mark=<set>&view=... . Ruby's
    // Card.uri_fetch uses params[:mark] before falling back to the home card.
    // URLSearchParams already decoded the query; do not decode it twice.
    const mark = searchParams?.get("mark");
    return { name: mark ? mark.replace(/_/g, " ") : "Home", view: "open", ...(params ? { params } : {}) };
  }
  if (path === "api/status") return { kind: "api" };
  if (path.startsWith("api/card/")) return { kind: "api" };

  const segments = path.split("/");
  // engine_routes.rb:14-16 — the DEPRECATED asset routes
  // `%w[assets javascripts jasmine].each { |prefix| get "#{prefix}/*mark" =>
  // "card#asset" }`: a fixed installation-error 404 (rest.rb:22-27), not a
  // card render. The glob needs a segment after the prefix — `/assets` alone
  // stays on the standard /:mark arm (the card "assets"). Routed ahead of
  // the :mark/:view arm, which would otherwise parse /assets/<mark> as the
  // card "assets" in view <mark>.
  if (isDeprecatedAssetRoute(segments)) return { kind: "assetStub" };
  // engine_routes.rb:25 legacy card/:view(/:mark), view /new|edit/.
  // Query card params are already decoded by URLSearchParams; preserve names
  // rather than interpreting the literal "card" as a deck card.
  // engine_routes.rb:41-43's READ and ASSET alternatives
  // (`%w[create read update delete asset].each { get "(card)/#{action}
  // (/:mark)" => "card", action: action }`) — Ruby's table puts them ABOVE
  // the :mark/:view arm, so /read/<mark> is card#read OF <mark> (never the
  // card "read" in view <mark>). The read action is show(nil): no view
  // default, the query's ?view=/?v= applies (view_from_params) — the bare
  // arm's semantics with an explicit mark, so the request core rewrites to
  // that arm (the markless /read and /card/read resolve the implicit mark
  // -> the home-mark page). The asset action is card#asset — the same
  // fixed installation-error stub the deprecated prefixes answer. The
  // create/delete GET alternatives are NOT admitted: they are
  // state-changing GETs in Ruby (a plain link click would save or delete),
  // and the port's recorded hardening (C16 posture — same-origin-XHR-only
  // GET mutations, write-routes.ts:62-76's receipt) keeps them off the
  // plain-link surface. Named divergence, not a silent miss.
  if ((segments[0] === "read" && segments.length <= 2) ||
      (segments[0] === "card" && segments[1] === "read" && segments.length <= 3)) {
    return { kind: "actionRead", rawMark: segments.length >= 2 && segments[1] !== "" ? segments[1] : undefined };
  }
  if (segments[0] === "asset" ||
      (segments[0] === "card" && segments[1] === "asset" && segments.length <= 3)) {
    return { kind: "assetStub" };
  }
  if (segments[0] === "card" && segments[1] === "edit" && segments.length === 3 && segments[2] !== "") {
    // engine_routes.rb:25's edit arm (view constraint /new|edit/): the
    // legacy explicit form "/card/edit/<mark>" is a plain card route to
    // card#read in the :edit view — the same render /<mark>?view=edit
    // answers. Staging has carried both views since the register's A9
    // pass (vm-staging-server.mjs card/:view arm); the edge 404'd this
    // shape (3 segments, middle not "view" -> the no-route class).
    // Named remainder: the MARKLESS /card/edit shape (Ruby renders the
    // HOME card's edit view — implicit_mark) stays off this sync grammar;
    // the async home resolution lives in the request core's bare arm.
    const editName = decodeName(segments[2]!);
    if (editName === undefined || editName === "") return { kind: "notFound" };
    const params = wireParams();
    return { name: editName, view: "edit", ...(params ? { params } : {}) };
  }
  if (segments[0] === "card" && segments[1] === "new" && segments.length <= 3) {
    const typeId = searchParams?.get("card[type_id]");
    if (typeId !== undefined && typeId !== null && !/^\d+$/.test(typeId)) return { kind: "notFound" };
    const cardName = searchParams?.get("card[name]") ?? (segments[2] ? decodeName(segments[2]) : "");
    if (cardName === undefined) return { kind: "notFound" };
    return {
      kind: "new", typeName: searchParams?.get("type") ?? searchParams?.get("card[type]") ?? "",
      cardName, ...(typeId ? { typeId: Number(typeId) } : {}),
    };
  }
  if (segments.length === 1) {
    const rawName = segments[0]!;
    // Stock Select2 editors use /:search.json?view=image_complete (and
    // ?v= aliases), the mark-format arm plus view_from_params. Preserve
    // existing name-only behavior; an explicit JSON query view must reach
    // JSON dispatch rather than returning JSON-looking text as HTML.
    const jsonView = rawName.endsWith(".json")
      ? searchParams?.get("view") || searchParams?.get("v") || undefined
      : undefined;
    const name = decodeName(jsonView === undefined ? rawName : rawName.slice(0, -".json".length));
    if (name === undefined || name === "") return { kind: "notFound" };
    // Bare single-segment arm: Ruby's card#read -> show(nil) — the page
    // path re-derives bareness for the requestedView (the "open" here is
    // parsePath's pinned default, not a requested view).
    const params = wireParams();
    return { name, view: jsonView ?? "open", ...(params ? { params } : {}), ...(jsonView === undefined ? {} : { format: "json" as const }) };
  }
  if (segments.length === 2 && segments[0] === "type") {
    // engine_routes.rb:23 `get "type/:type" => "card#read"` — no view, no
    // mark. load_mark's implicit_mark (mark.rb:28-40) lands on home_mark
    // (mark.rb:42-44, the *home rule || "Home"): mark_from_card_hash is nil
    // and view_does_not_require_name? is false (the route sets no view).
    // uri_fetch_opts (card_class.rb:128-133) puts the segment in
    // opts[:type], which standard_uri_fetch applies only to the new-card
    // fallback — on any deck whose home mark exists, Card.fetch resolves
    // the EXISTING home card and the render is the home card's page. The
    // segment rides along as typeName for that missing-home fallback; the
    // request core resolves the home mark here (parsePath is sync; the rule
    // read is async) and renders the home card's page.
    return { kind: "typeHome", typeName: segments[1]! };
  }
  if (segments.length === 2 && segments[0] === "new") {
    // THE /new/:type ARM: decko's
    // engine_routes.rb:22 `get "new/:type" => "card#read", view: "new"` —
    // the card-creation route a deck's own chrome links as /new/Sign_up
    // (the *account_links navbar arm and the signin form's "...or sign up!"
    // link). ROUTE PRECEDENCE: Rails matches this arm
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
