// Cloudflare Workers entry — the one-click Cloudflare demo (M2 in
// docs/port-tracker.md). The same engine code runs on Node (see tests/ for
// the LocalSqliteDriver wiring) and on Workers via this file.
//
// First-time deploy recipe (one-time setup, ~2 min):
//   1. Edit `database_id` in wrangler.toml after `wrangler d1 create`.
//   2. `wrangler d1 execute decko-ts --file db/schema.sqlite.sql`  (DDL only)
//   3. `wrangler d1 execute decko-ts --file db/seed.sql`           (optional)
//   4. `wrangler deploy`
//   5. curl https://decko-ts.<account>.workers.dev/             → "Hello world" card
//   6. curl https://decko-ts.<account>.workers.dev/Hello+World   → renders that card
//
// Runtime seam (src/server/drivers/d1.ts): the engine never imports vendor
// SDKs. The D1 binding from `env` is duck-typed as D1DatabaseLike; see
// docs/driver-notes.md for the verified shapes (meta.last_row_id, batch
// semantics, bigint-bind rejection).

import { CloudflareD1Adapter, type D1DatabaseLike } from "./src/server/drivers/d1.js";
import { FetchEngine } from "./src/card/fetch.js";
import { RenderEngine } from "./src/card/render.js";
import {
  handleWorkersWriteSurface,
  readWorkersRequest,
  toWebResponse,
} from "./src/server/cloudflare-write-routes.js";

interface Env {
  /** D1 binding declared in wrangler.toml [[d1_databases]]. */
  DB: D1DatabaseLike;
  /** "1" arms the /setup first-run window (checked together with the write path). */
  DECKO_FIRST_RUN?: string;
  /** "1" turns the card write path on. Both unset = the read-only deploy. */
  DECKO_WRITE_PATH?: string;
}

interface Deck {
  fetcher: FetchEngine;
  render: RenderEngine;
}

// One Deck per isolate (the Workers reuse pattern). The first request in
// the isolate boots the engine; subsequent requests share the warm caches
// (the #1282 promise: warm re-render issues zero queries).
const decks = new Map<string, Promise<Deck>>();

function bootDeck(env: Env): Promise<Deck> {
  const driver = new CloudflareD1Adapter(env.DB);
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  return Promise.resolve({ fetcher, render });
}

function getDeck(env: Env): Promise<Deck> {
  // env.DB is stable per isolate; the binding object identity is enough.
  const key = "deck";
  let p = decks.get(key);
  if (p === undefined) {
    p = bootDeck(env);
    decks.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// URL routing — minimum surface for the M2 demo
// ---------------------------------------------------------------------------
//
//   GET /                  → render "Home" :open
//   GET /<name>            → render <name> :open
//   GET /<name>/<view>     → render <name> <view>   (any view in SUPPORTED_VIEWS below)
//   GET /api/status        → JSON health
//   GET /api/card/<name>   → JSON metadata
//   everything else        → 404 with explanation

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

function html(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const PAGE_STYLE = `
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  .muted { color: #6b6b6b; font-size: 0.9rem; }
  pre { background: #f6f8fa; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; }
  .nav { display: flex; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #eaeaea; margin-bottom: 1rem; font-size: 0.9rem; }
  .nav a { color: #0066cc; text-decoration: none; }
`;

/** Shared with the Bunny Edge engine entry
 *  (deploy/bunny-worker-src/bunny-edge-engine-entry.ts) so both edges wrap
 *  renders in the SAME layout shell. */
export function layoutPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title><style>${PAGE_STYLE}</style></head>
<body><div class="nav"><a href="/">Home</a><a href="/api/status">Status</a></div>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// fetch handler — the Workers interface
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The WRITE surface — sign-in, the /setup first-run window, and card
    // create/update/delete. Additive and env-gated: with both flags unset,
    // a GET/HEAD skips this block entirely (zero added work, the read path
    // below is untouched), and only a non-GET verb reaches it, to be told
    // 403. See src/server/cloudflare-write-routes.ts for the gates, the
    // D1-backed session table, and the one honest delta to the old
    // method-blind POST behavior.
    const isReadVerb = request.method === "GET" || request.method === "HEAD";
    const writeSurfaceArmed =
      env.DECKO_FIRST_RUN === "1" || env.DECKO_WRITE_PATH === "1";
    if (writeSurfaceArmed || !isReadVerb) {
      const surfaceDeck = await getDeck(env);
      const inbound = await readWorkersRequest(request);
      const writeResult = await handleWorkersWriteSurface(
        { fetcher: surfaceDeck.fetcher, renderEngine: surfaceDeck.render },
        inbound,
        env,
      );
      if (writeResult !== null) return toWebResponse(writeResult, inbound);
    }

    const parsed = parsePath(url.pathname, url.searchParams);

    if ("kind" in parsed) {
      if (parsed.kind === "notFound") {
        return html(404, layoutPage("Not found", "<h1>Not found</h1><p class='muted'>Try <a href='/'>the home page</a> or render a card by name, e.g. <code>/Hello+World</code>.</p>"));
      }
      // api routes
      if (url.pathname === "/api/status") {
        const deck = await getDeck(env);
        return json(200, {
          ok: true,
          runtime: "workers",
          engine: "decko-ts",
          notes: "boot pattern: warm caches survive across requests in the same isolate",
        });
      }
      if (url.pathname.startsWith("/api/card/")) {
        const name = decodeURIComponent(url.pathname.slice("/api/card/".length));
        const deck = await getDeck(env);
        const record = await deck.fetcher.fetchByName(name);
        if (record === undefined || record.name === undefined) {
          return json(404, { error: "card not found", name });
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
      const deck = await getDeck(env);
      const htmlBody = await deck.render.render(parsed.name, parsed.view, parsed.params ?? {});
      return html(200, layoutPage(`${parsed.name} (${parsed.view})`, htmlBody));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUnsupportedView = message.startsWith("view (");
      const status = isUnsupportedView ? 422 : 500;
      return html(status, layoutPage("Error", `<h1>${isUnsupportedView ? "Unsupported view" : "Render error"}</h1><pre>${message}</pre>`));
    }
  },
};
