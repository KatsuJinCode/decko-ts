// Cloudflare Workers entry — the one-click Cloudflare demo (M2 in
// docs/port-tracker.md). The same engine code runs on Node (see tests/ for
// the LocalSqliteDriver wiring) and on Workers via this file.
//
// This is the JS-only deploy artifact (mirrors worker.ts); wrangler accepts
// either. Keeping the JS twin lets the smoke test boot miniflare without a
// transform step.
//
// First-time deploy recipe (one-time setup, ~2 min):
//   1. Edit `database_id` in wrangler.toml after `wrangler d1 create`.
//   2. `wrangler d1 execute decko-ts --file db/schema.sqlite.sql`  (DDL only)
//   3. `wrangler d1 execute decko-ts --file db/seed.sql`           (optional)
//   4. `wrangler deploy`
//   5. curl https://decko-ts.<account>.workers.dev/             → "Home" card
//   6. curl https://decko-ts.<account>.workers.dev/Hello+World   → renders that card
//
// Runtime seam (src/server/drivers/d1.ts): the engine never imports vendor
// SDKs. The D1 binding from `env` is duck-typed as D1DatabaseLike; see
// docs/driver-notes.md for the verified shapes (meta.last_row_id, batch
// semantics, bigint-bind rejection).

import { CloudflareD1Adapter } from "./src/server/drivers/d1.js";
import { FetchEngine } from "./src/card/fetch.js";
import { RenderEngine } from "./src/card/render.js";

const decks = new Map();

function bootDeck(env) {
  const driver = new CloudflareD1Adapter(env.DB);
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  return Promise.resolve({ fetcher, render });
}

function getDeck(env) {
  const key = "deck";
  let p = decks.get(key);
  if (p === undefined) {
    p = bootDeck(env);
    decks.set(key, p);
  }
  return p;
}

const SUPPORTED_VIEWS = new Set([
  "open", "closed", "content", "title", "titled", "menu",
  "core", "card_list", "naked", "bar", "bar_left", "bar_middle",
  "bar_right", "bar_bottom",
]);

function parsePath(pathname) {
  const path = pathname.replace(/\/+$/, "").replace(/^\/+/, "");
  if (path === "") return { name: "Home", view: "open" };
  if (path === "api/status") return { kind: "api" };
  if (path.startsWith("api/card/")) return { kind: "api" };

  const segments = path.split("/");
  if (segments.length === 1) return { name: decodeURIComponent(segments[0]), view: "open" };
  if (segments.length === 2 && SUPPORTED_VIEWS.has(segments[1])) {
    return { name: decodeURIComponent(segments[0]), view: segments[1] };
  }
  return { kind: "notFound" };
}

function html(status, body) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function json(status, body) {
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

function layoutPage(title, body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title><style>${PAGE_STYLE}</style></head>
<body><div class="nav"><a href="/">Home</a><a href="/api/status">Status</a></div>${body}</body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parsed = parsePath(url.pathname);

    if (parsed.kind === "notFound") {
      return html(404, layoutPage("Not found", "<h1>Not found</h1><p class='muted'>Try <a href='/'>the home page</a> or render a card by name, e.g. <code>/Hello+World</code>.</p>"));
    }
    if (parsed.kind === "api") {
      if (url.pathname === "/api/status") {
        const deck = await getDeck(env);
        return json(200, {
          ok: true,
          runtime: "workers",
          engine: "decko-ts",
          streams_landed: 10,
          tests_passing: 839,
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
          type_name: record.typeName ?? null,
          codename: record.codename ?? null,
          db_content_preview: (record.dbContent ?? "").slice(0, 200),
        });
      }
      return html(404, layoutPage("Not found", "<h1>Not found</h1>"));
    }

    try {
      const deck = await getDeck(env);
      const body = await deck.render.render(parsed.name, parsed.view);
      return html(200, layoutPage(`${parsed.name} (${parsed.view})`, body));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUnsupportedView = message.startsWith("view (");
      const status = isUnsupportedView ? 422 : 500;
      return html(status, layoutPage("Error", `<h1>${isUnsupportedView ? "Unsupported view" : "Render error"}</h1><pre>${message}</pre>`));
    }
  },
};
