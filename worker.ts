// Cloudflare Workers entry — the one-click Cloudflare demo. The same
// engine code runs on Node (see tests/ for the LocalSqliteDriver wiring) and
// on Workers via this file.
//
// Deploy: `npm run deploy` (what the Deploy to Cloudflare button runs) applies
// deploy/migrations/ to the D1 database, issues the one-time first-run setup
// token (printed in the deploy output), and deploys this Worker with the
// bindings wrangler.toml declares:
//   DB       D1 — the deck
//   FILES    R2 — uploads, image renditions and stored asset outputs
//   DELAYED  Queue — delayed work, consumed by the `queue` handler below
//   cron     the `scheduled` handler below enqueues the periodic sweep
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
import { getDefaultModLoader } from "./src/card/mod-loader.js";
import { defaultDeckLoader } from "./src/card/mod-loader/default-mod-deck.js";
import { R2BlobDriver, type R2BucketLike } from "./src/blob/r2.js";
import { BlobAttachmentStore } from "./src/card/attachments/attachment-store.js";
import { handleAttachmentRoute } from "./src/server/file-routes.js";
import {
  runDelayedWork,
  sweepMessage,
  type DelayedWorkMessage,
  type QueueProducerLike,
} from "./src/server/edge-delayed-work.js";
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
  jsonViewSearchParams,
  mapRenderError,
  publicDbContent,
  queryViewFromUrl,
  decodeViewSegment,
} from "./src/server/worker-shared-surface.js";

interface Env {
  /** D1 binding declared in wrangler.toml [[d1_databases]]. */
  DB: D1DatabaseLike;
  /** "1" arms the /setup first-run window (checked together with the write path). */
  DECKO_FIRST_RUN?: string;
  /** "1" turns the card write path on. Both unset = the read-only deploy. */
  DECKO_WRITE_PATH?: string;
  /** Optional operator-chosen first-run setup token (a secret), accepted
   *  beside the deploy-issued one (src/card/auth/setup-token.ts). */
  DECKO_SETUP_TOKEN?: string;
  /** R2 binding: the deck's files (uploads and asset outputs). Optional: a
   *  deploy without it serves no files and refuses uploads by name. */
  FILES?: R2BucketLike;
  /** Queue producer binding for delayed work. Optional. */
  DELAYED?: QueueProducerLike;
}

interface Deck {
  fetcher: FetchEngine;
  render: RenderEngine;
}

// One Deck per isolate (the Workers reuse pattern). The first request in
// the isolate boots the engine; subsequent requests share the warm caches.
// A warm re-render issues one query, not zero: the render reads the deck's
// data-version stamp on every request (a single-row SELECT) and resets the
// retained state if it has moved since the last render, which is what stops
// a warm isolate from serving anything older than the last committed write
// (src/card/render.ts; ARCHITECTURE.md, "What is request-local, and
// what is retained"). A FAILED boot is
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
  // THE MOD DECK, loaded before the render engine exists (RenderEngine's
  // constructor binds getDefaultModLoader()): reads and the write surface's
  // GET arms render through the ported mods' per-set chain, and the save
  // path's event runtime (write-routes.ts servingModEventRuntime) walks the
  // same loader instead of loading a second, event-only copy. Ruby loads
  // every mod at boot (dirs.rb:54-62, loader.rb:16-21); the Node host and
  // the Bunny edge do the same. No query; the guard keeps a retried boot on
  // the loader already bound.
  if (getDefaultModLoader() === undefined) defaultDeckLoader();
  const render = new RenderEngine(fetcher);
  // The sync name environment (mark URLs /~<id> and /:<codename>) reads
  // only warm caches; install + warm at boot or the marks 500.
  await installDeckNameEnvironment(driver, fetcher);
  // Virtual-card rule universe (src/card/fetch/virtual-cards.ts:44-49, the
  // storage factory's responsibility): without this hook compound names
  // that resolve only through the structure rule walk 404 even when the
  // deck has the rule.
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
  | { name: string; view?: string; format?: "json" }
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
    // Ruby route line 51: get ":mark/:view(.:format)" => "card#read" — the
    // .:format suffix is part of the VIEW segment (the navbox typeahead's
    // search_box_complete.json: view search_box_complete, format json), not
    // the card name. The view identifier is snake_case and matched
    // literally (decodeViewSegment — no underscore fold; the mark rides
    // decodeName). A suffixed path dispatches the view in the json format;
    // the bare form stays the html-format read.
    const rawView = segments[1]!;
    const isJson = rawView.endsWith(".json");
    const view = decodeViewSegment(isJson ? rawView.slice(0, -".json".length) : rawView);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "notFound" };
    }
    return isJson ? { name, view, format: "json" } : { name, view };
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
 *  at their own call sites. The escape matters because a parsed card name
 *  rides the title on 200-pages, so a crafted URL-path name must land as
 *  text. */
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

/** The deck's attachment store over the R2 binding, or undefined when the
 *  deploy binds no bucket. BlobAttachmentStore holds no state beyond the
 *  binding, so building it per request costs nothing. */
function attachmentStoreFor(env: Env): BlobAttachmentStore | undefined {
  return env.FILES === undefined ? undefined : new BlobAttachmentStore(new R2BlobDriver(env.FILES));
}

/** GET/HEAD /files/... — the stored bytes, served from R2 through the same
 *  route module the Node host composes (src/server/file-routes.ts), gated
 *  per request by the card's read rule. Uploads do not come through here:
 *  they are the write surface's multipart grammar. */
async function serveFile(request: Request, env: Env, store: BlobAttachmentStore): Promise<Response | null> {
  const deck = await getDeck(env);
  await deck.render.ensureFreshness();
  return handleAttachmentRoute(request, {
    driver: new CloudflareD1Adapter(env.DB),
    fetchEngine: deck.fetcher,
    attachmentStore: store,
    createEngine: () => {
      throw new Error("the Workers /files route serves reads only; uploads ride the write surface");
    },
    canReadCard: async (cardId) => {
      const record = await deck.fetcher.fetchById(cardId);
      if (record === undefined) return false;
      const typeRecord = record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
      return deck.render.canReadCard(record, typeRecord?.name?.s);
    },
  });
}

export default {
  /** Cron trigger (wrangler.toml [triggers]): enqueue the periodic sweep,
   *  or run it inline when no queue is bound. */
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const message = sweepMessage(new Date());
    if (env.DELAYED !== undefined) {
      await env.DELAYED.send(message);
      return;
    }
    await runDelayedWork(message, { driver: new CloudflareD1Adapter(env.DB), files: env.FILES === undefined ? undefined : new R2BlobDriver(env.FILES) });
  },

  /** Queue consumer (wrangler.toml [[queues.consumers]]). A message that
   *  throws is retried by the platform; one that is not delayed work at all
   *  is acknowledged and logged rather than retried forever. */
  async queue(batch: { messages: ReadonlyArray<{ body: unknown; ack(): void; retry(): void }> }, env: Env): Promise<void> {
    const driver = new CloudflareD1Adapter(env.DB);
    const files = env.FILES === undefined ? undefined : new R2BlobDriver(env.FILES);
    for (const message of batch.messages) {
      try {
        const outcome = await runDelayedWork(message.body as DelayedWorkMessage, { driver, files });
        console.log(`delayed work done: ${JSON.stringify(outcome)}`);
        message.ack();
      } catch (error) {
        console.error("delayed work failed", error instanceof Error ? error.message : String(error));
        message.retry();
      }
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const attachmentStore = attachmentStoreFor(env);

    if (attachmentStore !== undefined && (request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/files/")) {
      const served = await serveFile(request, env, attachmentStore);
      if (served !== null) return served;
    }

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
        {
          fetcher: surfaceDeck.fetcher,
          renderEngine: surfaceDeck.render,
          ...(attachmentStore === undefined ? {} : { attachmentStore }),
        },
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
          // The read gate: Ruby's GET of a denied card renders the denial
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
      if (parsed.format === "json") {
        // Ruby route line 51 with the .:format json suffix: the view
        // dispatch in the json format (the navbox typeahead's
        // search_box_complete among them; an unregistered view raises the
        // UnsupportedViewError the status table maps to 422). The
        // request-term seam rides the search params (search_params.rb:
        // term_param || vars.keyword).
        const search = jsonViewSearchParams(url.searchParams);
        const body = await deck.render.render(parsed.name, view, {
          ...(search !== undefined ? { search } : {}),
          format: "json",
        });
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
      const htmlBody = await deck.render.render(
        parsed.name,
        view,
        historyViewParams(url.searchParams),
      );
      return html(200, layoutPage(`${parsed.name} (${view})`, htmlBody));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The Card::Error status_code table (card 1.110.0 lib/card/error.rb),
      // shared with deploy/worker.ts via mapRenderError: NotFound -> 404,
      // the UserError raise for an unregistered view -> 422, else 500.
      // This entry previously shipped a blanket 500 for missing cards;
      // the mapping is now shared code, not a twin.
      const mapped = mapRenderError(message);
      if (parsed.format === "json") {
        // The json dispatch answers the mapped status in the staging's
        // shape: the 422 unsupported-view body is plain text (Ruby's
        // rendered error), everything else the structured json error.
        if (mapped.status === 422) {
          return new Response(message, {
            status: 422,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return json(mapped.status, { error: mapped.title, message });
      }
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
