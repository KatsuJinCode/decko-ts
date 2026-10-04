// deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts — the deploy
// lineage's root worker.ts URL/request surface (SUPPORTED_VIEWS + parsePath +
// PAGE_STYLE + escapeHtml + layoutPage), carried VERBATIM from
// lane-dbroundtrip-deploy tip 12bd5236 by the fold-11 integrator.
//
// WHY THIS EXISTS: the four p2 lanes (error-shell / history-seam / person /
// codename) were built on the deploy lineage, whose root worker.ts exports
// escapeHtml and a two-arg parsePath(pathname, searchParams) that returns the
// wire params (act_id / action_id / page / ...). The integration line's root
// worker.ts evolved independently: its parsePath takes only a pathname and
// returns no params, and escapeHtml is not exported there. Merging the two
// worker surfaces is the deliberate cross-lineage project fold-10 deferred,
// NOT a fold-11 item. This shim gives the carried p2 request surface
// (bunny-edge-engine-request.ts + bunny-edge-error-page.ts + their pin
// files) the exact worker contract it was written and gated against, while
// the integration line's serving worker stays untouched. Unwired from the
// entry — the fold-10 session-surface precedent.
//
// Byte-provenance: everything below is verbatim 12bd5236:worker.ts (lines
// 75-86, 87-122, 144-151, 153-166, 168-178).

const SUPPORTED_VIEWS = new Set([
  "open", "closed", "content", "title", "titled", "menu",
  "core", "card_list", "naked", "bar", "bar_left", "bar_middle",
  "bar_right", "bar_bottom",
  // card-mod-history render-time views (src/card/history/render-seam.ts):
  // GET /<name>/history[?act_id=&page=], /<name>/act[?act_id=],
  // /<name>/action_summary[?action_id=] - anonymous reads history exactly
  // when it reads the card (the views carry no perms directive; the render
  // gate enforces the card's read rule).
  "history", "act", "action_summary",
]);


function parsePath(
  pathname: string,
  searchParams?: URLSearchParams,
): { name: string; view: string; params?: Record<string, string> } | { kind: "api" } | { kind: "notFound" } {
  // strip trailing slash, drop leading slash
  const path = pathname.replace(/\/+$/, "").replace(/^\/+/, "");
  if (path === "") return { name: "Home", view: "open" };
  if (path === "api/status") return { kind: "api" };
  if (path.startsWith("api/card/")) return { kind: "api" };

  const segments = path.split("/");
  if (segments.length === 1) return { name: decodeURIComponent(segments[0]), view: "open" };
  if (segments.length === 2 && SUPPORTED_VIEWS.has(segments[1])) {
    // The history views read Card::Env.params equivalents (act_id /
    // action_id / page / act_seq / action_view / hide_diff / act_context)
    // from the query string; other views ignore them.
    const params: Record<string, string> = {};
    if (searchParams !== undefined) {
      for (const key of ["act_id", "action_id", "page", "act_seq", "action_view", "hide_diff", "act_context"]) {
        const value = searchParams.get(key);
        if (value !== null) params[key] = value;
      }
    }
    return {
      name: decodeURIComponent(segments[0]),
      view: segments[1],
      ...(Object.keys(params).length > 0 ? { params } : {}),
    };
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
