// Cloudflare Workers entry — the one-click Cloudflare demo (M2). The same
// engine code runs on Node (see tests/ for the LocalSqliteDriver wiring) and
// on Workers via this file.
//
// First-time deploy recipe (one-time setup, ~2 min):
//   1. Edit `database_id` in wrangler.toml after `wrangler d1 create`.
//   2. `wrangler d1 execute decko-ts --file db/schema.sqlite.sql`  (DDL only)
//   3. `wrangler d1 execute decko-ts --file db/seed.sql`           (optional)
//   4. `wrangler deploy`
//   5. curl https://decko-ts.<account>.workers.dev/             → "Hello world" card
//   6. curl https://decko-ts.<account>.workers.dev/Hello_World   → renders that card
//
// Runtime seam (src/server/drivers/d1.ts): the engine never imports vendor
// SDKs. The D1 binding from `env` is duck-typed as D1DatabaseLike; see
// docs/decisions/0003-edge-native-driver-interfaces.md for the verified shapes (meta.last_row_id, batch
// semantics, bigint-bind rejection).
//
// TWIN SURFACE: this entry and deploy/worker.ts answer the same read
// surface through the shared module src/server/worker-shared-surface.ts
// (error-status mapping, hardened decode, history params, boot prime) —
// the parity is pinned by
// tests/deploy/worker-twins-shared-surface-parity.test.ts.

import { CloudflareD1Adapter, type D1DatabaseLike } from "./src/server/drivers/d1.js";
import { FetchEngine } from "./src/card/fetch.js";
import {
  CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS,
  setPbkdf2IterationLimit,
} from "./src/card/auth/password-hash.js";
import { RenderEngine } from "./src/card/render.js";
import {
  handleWorkersWriteSurface,
  readWorkersRequest,
  toWebResponse,
} from "./src/server/cloudflare-write-routes.js";
import { applyDeckInflections } from "./src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "./src/card/name/oracle-deck-inflections.js";
import { createVirtualCardLookup } from "./src/card/fetch/virtual-cards.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "./src/card/rules/structure.js";
import {
  decodeName,
  historyViewParams,
  installDeckNameEnvironment,
  mapRenderError,
  publicDbContent,
  queryViewFromUrl,
} from "./src/server/worker-shared-surface.js";

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
// (the #1282 promise: warm re-render issues zero queries). A FAILED boot is
// never cached: the next request retries (a transient D1 hiccup on first
// hit must not poison the isolate — the deploy entry's proven pattern).
// Cloudflare's production runtime refuses PBKDF2 above 100,000 iterations
// (cloudflare/workerd issue 1346), so new password hashes use that count here
// (docs/SECURITY.md, "Passwords").
setPbkdf2IterationLimit({ iterations: CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS, runtime: "Cloudflare Workers" });

const decks = new Map<string, Promise<Deck>>();

async function bootDeck(env: Env): Promise<Deck> {
  // THE DECK'S INFLECTION TABLE, APPLIED BEFORE ANY NAME IS PARSED — the
  // rule oracle-deck-inflections.ts:1-13 states for every deck-serving
  // origin ("the same moment a Rails deck's config/initializers/
  // inflections.rb runs"). Without it every key derives gem-default
  // (`Anonymous` keyed `anonymou`) and the divergence rides into the
  // rendered slot class tokens — visible in the card BYTES.
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  const driver = new CloudflareD1Adapter(env.DB);
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  // The sync name environment (mark URLs /~<id> and /:<codename>) reads
  // only warm caches; install + warm at boot or the marks 500 (the
  // deploy entry's F4 pins cover the behavior; this is the shared prime).
  await installDeckNameEnvironment(driver, fetcher);
  // Virtual-card rule universe (src/card/fetch/virtual-cards.ts:44-49, the
  // storage factory's responsibility): without this hook compound names
  // that resolve only through the structure rule walk 404 even when the
  // live deck has the rule.
  const [universeResult] = await driver.batch([structureRuleUniverseStatement()]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universeResult),
    ruleTypeIds: structureRuleTypesFromResults(universeResult),
  });
  return { fetcher, render };
}

function getDeck(env: Env): Promise<Deck> {
  // env.DB is stable per isolate; the binding object identity is enough.
  const key = "deck";
  let p = decks.get(key);
  if (p === undefined) {
    p = bootDeck(env).catch((error) => {
      decks.delete(key);
      throw error;
    });
    decks.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// URL routing — the read grammar the two entries share
// ---------------------------------------------------------------------------
//
//   GET /                  → render "Home" (view from ?view=/?v=, else :open)
//   GET /<name>            → render <name>   (view from ?view=/?v=, else :open)
//   GET /<name>/<view>     → render <name> <view>   (the path view wins)
//   GET /<name>/view/<view>→ the same render (engine_routes.rb:24)
//   GET /api/status        → JSON health
//   GET /api/card/<name>   → JSON metadata (read-gated)
//   everything else        → 404 with explanation
//
// The view name rides VERBATIM into the engine (engine_routes.rb:51's
// ":mark/:view" constrains nothing): a view no module registers raises
// UnsupportedViewError and the error mapper answers the UserError shape
// (422). The former 17-view allowlist was a divergence — Ruby's route
// matches any view and the ENGINE decides.

type ParsedPath =
  | { name: string; view?: string }
  | { kind: "api" }
  | { kind: "notFound" };

function parsePath(pathname: string): ParsedPath {
  // strip trailing slash, drop leading slash
  const path = pathname.replace(/\/+$/, "").replace(/^\/+/, "");
  if (path === "") return { name: "Home" };
  if (path === "api/status") return { kind: "api" };
  if (path.startsWith("api/card/")) return { kind: "api" };

  const segments = path.split("/");
  if (segments.length === 1) {
    const name = decodeName(segments[0]!);
    if (name === undefined || name === "") return { kind: "notFound" };
    // no view in the path: Ruby's card#read -> show(nil) — view_from_params
    // consults the query before the :open default applies (rest.rb:92-103)
    return { name };
  }
  if (segments.length === 3 && segments[1] === "view") {
    const name = decodeName(segments[0]!);
    const view = decodeName(segments[2]!);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "notFound" };
    }
    return { name, view };
  }
  if (segments.length === 2) {
    const name = decodeName(segments[0]!);
    const view = decodeName(segments[1]!);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "notFound" };
    }
    return { name, view };
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
 *  renders in the SAME layout shell. The title is escaped here, at the
 *  emitter — every call site's title (200-pages, error pages) is covered;
 *  the body is HTML-by-contract and its dynamic interpolations are escaped
 *  at their own call sites.
 *
 *  deploy-surface-union (2026-10-03): the ESCAPE is the deploy lineage's
 *  5dd6ab0 fix (the one the deployed edge serves) — a parsed card name rides
 *  the title on 200-pages, so a crafted URL-path name must land as text.
 *  The lineage's root worker.ts has had this since edge-true-union; this
 *  line's copy predated it (the carried layout-page-title-escape pin
 *  exposed the gap). escapeHtml's body is verbatim
 *  12bd5236:worker.ts:144-151 (the same body the carried shim
 *  bunny-edge-lineage-worker-surface.ts serves the bunny path from). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layoutPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
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

    const parsed = parsePath(url.pathname);

    if ("kind" in parsed) {
      if (parsed.kind === "notFound") {
        return html(404, layoutPage("Not found", "<h1>Not found</h1><p class='muted'>Try <a href='/'>the home page</a> or render a card by name, e.g. <code>/Hello_World</code>.</p>"));
      }
      // api routes
      if (url.pathname === "/api/status") {
        try {
          await getDeck(env);
          return json(200, {
            ok: true,
            runtime: "workers",
            engine: "decko-ts",
            notes: "boot pattern: warm caches survive across requests in the same isolate",
          });
        } catch (error) {
          // an unbootable deck (missing/broken binding) is a structured
          // 500, never an unhandled rejection
          return json(500, {
            ok: false,
            runtime: "workers",
            engine: "decko-ts",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (url.pathname.startsWith("/api/card/")) {
        try {
          const name = decodeName(url.pathname.slice("/api/card/".length));
          if (name === undefined || name === "") {
            return json(400, { error: "empty card name" });
          }
          const deck = await getDeck(env);
          // The freshness boundary BEFORE any fetch or permission check:
          // canReadCard's verdicts (and the permission state behind them)
          // memoize on the isolate's retained engine, so a read rule revoked
          // after this engine's last freshness check would still serve
          // content here — the render path clears its caches at this same
          // gate on every request (RenderEngine#render), and the API surface
          // must answer over the same committed state.
          await deck.render.ensureFreshness();
          const record = await deck.fetcher.fetchByName(name);
          if (record === undefined || record.name === undefined) {
            return json(404, { error: "card not found", name });
          }
          // The read gate (the deploy entry's .json gate, probe battery
          // batch-05): Ruby's GET of a denied card renders the denial
          // (ok_to_read? fails, set/all/permissions.rb:139-146); the JSON
          // surface answers 403 without the protected fields. Same engine
          // verdict the HTML path judges with (RenderEngine#canReadCard).
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
      return html(404, layoutPage("Not found", "<h1>Not found</h1>"));
    }

    try {
      const deck = await getDeck(env);
      const view = parsed.view ?? queryViewFromUrl(url) ?? "open";
      const htmlBody = await deck.render.render(
        parsed.name,
        view,
        historyViewParams(url.searchParams),
      );
      return html(200, layoutPage(`${parsed.name} (${view})`, htmlBody));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The Card::Error status_code table (prototype/lib/card/error.rb),
      // shared with deploy/worker.ts via mapRenderError: NotFound -> 404,
      // the UserError raise for an unregistered view -> 422, else 500.
      // This entry shipped a blanket 500 for missing cards until the
      // deploy-button verification lane caught it live (the public
      // lineage's 90d5f31); the mapping is now shared code, not a twin.
      const mapped = mapRenderError(message);
      // title AND message are entity-escaped at the emitter (the deploy
      // entry's errorPage does the same): the message can embed the raw
      // requested view or card name (format.ts UnsupportedViewError —
      // "view (X) not supported for Y"), so an unescaped interpolation
      // reflects executable markup back onto the requesting browser.
      return html(
        mapped.status,
        layoutPage(
          mapped.title,
          `<h1>${escapeHtml(mapped.title)}</h1><pre>${escapeHtml(message)}</pre>`,
        ),
      );
    }
  },
};
