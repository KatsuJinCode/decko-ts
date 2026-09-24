// decko-ts Cloudflare Workers entry — the M2 one-click deploy harness.
//
// A THIN edge shell around the same engine the Node tests drive (see
// tests/deploy/deploy-worker-miniflare.test.ts for the workerd proof): the
// D1 adapter from src/server/drivers/d1.ts (miniflare-proven, see
// docs/driver-notes.md), FetchEngine, RenderEngine, and the CQL executor.
// Web-standard Request/Response only — no Node APIs on this path. The one
// Node import inside the engine graph (node:crypto in
// src/card/render/slot-html.ts) is routed around at bundle time by the
// [alias] table in wrangler.toml -> shims/node-crypto-shim.ts; reported,
// not edited, per stream boundaries.
//
// Routes (the whole surface):
//   GET  /              -> render the "Home" card, :open view (HTML)
//   GET  /:card-name    -> render that card, :open view (HTML)
//   GET  /:card-name.json -> the card record as JSON
//   POST /api/query     -> { "cql": <CQL JSON> } body -> CQL result JSON
//   GET  /_status        -> engine + database health JSON
//   GET  /__metrics      -> per-isolate request/SQL/D1-rows aggregate
//
// Deploy recipe: deploy/README.md. Architecture + compatibility notes:
// docs/deploy-notes.md.

import { CloudflareD1Adapter, type D1DatabaseLike } from "../src/server/drivers/d1.js";
import type { SQLQueryResult } from "../src/server/driver.js";
import { FetchEngine } from "../src/card/fetch.js";
import { RenderEngine } from "../src/card/render.js";
import { executeQuery } from "../src/cql/execute.js";
import { CqlBadQuery } from "../src/cql/ast.js";
import { DeckoName } from "../src/card/name.js";
import { MetricsRecorder, type MetricsRoute } from "./src/worker-metrics.js";

/** Bindings declared in wrangler.toml ([[d1_databases]]). */
interface Env {
  DB: D1DatabaseLike;
}

/** Per-isolate measurement for the Gate-6 set: request wall-time histogram,
 *  SQL statement counts, D1 rows read/written. /__metrics prints the
 *  aggregate. Constructed lazily because workerd's module-init clock reads
 *  epoch — the first request is the honest anchor for the since field. */
let metrics: MetricsRecorder | undefined;
function recorder(): MetricsRecorder {
  return (metrics ??= new MetricsRecorder());
}

/** The per-isolate engine bundle. The first request boots it; every later
 *  request in the same isolate reuses the warm caches (the #1282 promise:
 *  a warm render issues zero queries). */
interface Deck {
  driver: CloudflareD1Adapter;
  fetcher: FetchEngine;
  render: RenderEngine;
  /** Sync name -> id resolver for CQL interpretation (primed once). */
  resolveCardId: (name: string) => number | undefined;
  primedAt: string;
}

let deckPromise: Promise<Deck> | undefined;

function getDeck(env: Env): Promise<Deck> {
  if (deckPromise === undefined) {
    deckPromise = bootDeck(env).catch((error) => {
      // Do not cache a failed boot: the next request retries (a transient
      // D1 hiccup on first hit should not poison the isolate).
      deckPromise = undefined;
      throw error;
    });
  }
  return deckPromise;
}

async function bootDeck(env: Env): Promise<Deck> {
  const driver = new CloudflareD1Adapter(env.DB);
  observeDriverQueries(driver, recorder());
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  const resolveCardId = await primeCqlNameResolver(driver);
  return { driver, fetcher, render, resolveCardId, primedAt: new Date().toISOString() };
}

/** Feed every adapter SQL call into the recorder. query() carries D1 meta
 *  (rows_read/rows_written) on its result; batch() carries it per statement,
 *  observed one-by-one. meta-absent results are counted by the recorder's
 *  ESTIMATE labelling (worker-metrics.ts). The casts exist because query()
 *  is generic on the adapter class while the observer wraps it erasing T;
 *  callers reach the driver through the SQLDatabaseDriver interface, whose
 *  generic signature the wrapped instance still satisfies at runtime. */
function observeDriverQueries(driver: CloudflareD1Adapter, recorder: MetricsRecorder): void {
  type ErasedQueryFn = (sql: string, params: unknown[]) => Promise<SQLQueryResult<unknown>>;
  const rawQuery = driver.query.bind(driver) as ErasedQueryFn;
  (driver as { query: ErasedQueryFn }).query = async (sql, params) => {
    const result = await rawQuery(sql, params);
    recorder.observeQuery({ rowsRead: result.rowsRead, rowsWritten: result.rowsWritten });
    return result;
  };
  const rawBatch = driver.batch.bind(driver);
  (driver as { batch: typeof rawBatch }).batch = async (statements) => {
    const results = await rawBatch(statements);
    for (const result of results) {
      recorder.observeQuery({ rowsRead: result.rowsRead, rowsWritten: result.rowsWritten });
    }
    return results;
  };
}

/** Route tag for the recorder — the same normalization handle() applies. */
function routeTag(pathname: string, method: string): MetricsRoute {
  if (pathname === "/") return method === "GET" ? "/" : "other";
  if (pathname === "/_status") return "/_status";
  if (pathname === "/__metrics") return "/__metrics";
  if (pathname === "/api/query") return method === "POST" ? "/api/query" : "other";
  if (method !== "GET") return "other";
  if (pathname.endsWith(".json")) return "/<card-name>.json";
  if (!pathname.slice(1).includes("/")) return "/<card-name>";
  return "other";
}

// ---------------------------------------------------------------------------
// CQL name resolution (the one engine seam this entry has to supply)
// ---------------------------------------------------------------------------
//
// CQL's name-valued conditions (type: "Note", left: "Demo Guide", ...) are
// interpreted to ids during parsing via a SYNCHRONOUS resolver
// (ParseOptions.resolveCardId — the port of Card::Lexicon.id). Without one,
// a name condition collapses to the Ruby -999 sentinel and silently matches
// nothing (src/cql/parser.ts idFromVal). The render path primes its own
// idsByKey map during prefetch; /api/query has no prefetch, so this entry
// primes an equivalent map once per isolate.
//
// Budget honesty: this loads the id/name/left_id/right_id of EVERY
// non-trashed card. For a demo deck (16 rows) that is one cheap query; at
// corpus scale (47k cards) it would be megabytes of isolate memory. A
// production entry would swap in a real sync-lexicon strategy — documented
// in docs/deploy-notes.md, deliberately not improvised here.

interface IdRow {
  id: number;
  name: string | null;
  left_id: number | null;
  right_id: number | null;
}

async function primeCqlNameResolver(driver: CloudflareD1Adapter): Promise<(name: string) => number | undefined> {
  const { rows } = await driver.query<IdRow>(
    "SELECT id, name, left_id, right_id FROM cards WHERE trash = 0",
    [],
  );
  const byId = new Map<number, IdRow>();
  const idToName = new Map<number, string>();
  const keyToId = new Map<string, number>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      idToName.set(row.id, name.s);
      keyToId.set(name.key, row.id);
    }
  }
  // Junction cards store NULL name columns and ride left_id/right_id (the
  // 2020 Lexicon convention, db/schema.sqlite.sql). Compose their names
  // recursively (left-associative chain, same as DbLexicon.lexToName),
  // cycle-guarded, then index by composed key.
  const composing = new Set<number>();
  const composedName = (id: number): string | undefined => {
    const direct = idToName.get(id);
    if (direct !== undefined) return direct;
    if (composing.has(id)) return undefined;
    const row = byId.get(id);
    if (row === undefined || row.left_id === null || row.right_id === null) return undefined;
    composing.add(id);
    try {
      const left = composedName(row.left_id);
      const right = composedName(row.right_id);
      if (left === undefined || right === undefined) return undefined;
      const joined = `${left}${DeckoName.JOINT}${right}`;
      idToName.set(id, joined);
      return joined;
    } finally {
      composing.delete(id);
    }
  };
  for (const row of rows) {
    const name = composedName(row.id);
    if (name !== undefined) keyToId.set(DeckoName.parse(name).key, row.id);
  }
  return (nameish: string) => keyToId.get(DeckoName.parse(nameish).key);
}

// ---------------------------------------------------------------------------
// HTTP plumbing (Web-standard only)
// ---------------------------------------------------------------------------

const HOME_CARD_NAME = "Home";
const OPEN_VIEW = "open";

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorPage(status: number, title: string, message: string): Response {
  return htmlResponse(
    status,
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(message)}</pre>` +
      `<p><a href="/">Home</a> · <a href="/_status">status</a></p></body></html>`,
  );
}

/** decodeURIComponent that 400s on malformed input instead of throwing,
 *  then restores '+' as a space: card URLs carry spaces in both forms
 *  (Ruby/decko treats /A+B and /A%20B as the same card; caught by the
 *  targeted Cloudflare test 2026-09-23 — multi-word cards 404'd on the
 *  '+' form while %20 worked). */
function decodeName(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function renderCardPage(deck: Deck, cardName: string): Promise<Response> {
  try {
    const view = await deck.render.render(cardName, OPEN_VIEW);
    return htmlResponse(
      200,
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(cardName)} — decko-ts</title></head>` +
        `<body><div class="card-view" data-card="${escapeHtml(cardName)}" data-view="${OPEN_VIEW}">${view}</div>` +
        `<p><a href="/${encodeURIComponent(cardName)}.json">record JSON</a> · <a href="/_status">status</a></p></body></html>`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/^card not found: /.test(message)) return errorPage(404, "Card not found", message);
    return errorPage(500, "Render error", message);
  }
}

async function cardRecordJson(deck: Deck, cardName: string): Promise<Response> {
  const record = await deck.fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  const typeRecord =
    record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
  return jsonResponse(200, {
    id: record.id ?? null,
    name: record.name.s,
    key: record.name.key ?? null,
    type_id: record.typeId ?? null,
    type_name: typeRecord?.name?.s ?? null,
    codename: record.codename ?? null,
    left_id: record.leftId ?? null,
    right_id: record.rightId ?? null,
    trash: record.trash,
    created_at: record.createdAt ?? null,
    updated_at: record.updatedAt ?? null,
    creator_id: record.creatorId ?? null,
    updater_id: record.updaterId ?? null,
    db_content: record.dbContent ?? null,
  });
}

async function apiQuery(request: Request, deck: Deck): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "request body is not valid JSON" });
  }
  let cql: unknown = (body as { cql?: unknown } | null)?.cql;
  if (typeof cql === "string") {
    // Accept a JSON-encoded statement string as well as an inline object.
    try {
      cql = JSON.parse(cql);
    } catch {
      return jsonResponse(400, { error: "cql is a string but not valid JSON" });
    }
  }
  if (cql === undefined || cql === null || typeof cql !== "object" || Array.isArray(cql)) {
    return jsonResponse(400, { error: 'expected a JSON body like {"cql": {...}}' });
  }
  try {
    const result = await executeQuery(deck.driver, cql, {
      parse: { resolveCardId: deck.resolveCardId },
    });
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof CqlBadQuery) {
      return jsonResponse(400, { error: "bad CQL statement", message: error.message });
    }
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "CQL execution failed", message });
  }
}

async function status(deck: Deck): Promise<Response> {
  try {
    const { rows } = await deck.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards",
      [],
    );
    return jsonResponse(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "cloudflare-workers",
      view: "miniflare-proven (see tests/deploy/deploy-worker-miniflare.test.ts)",
      database: { ok: true, d1: true, card_count: rows[0]?.n ?? 0 },
      deck: { booted_at: deck.primedAt },
    });
  } catch (error) {
    return jsonResponse(503, {
      ok: false,
      engine: "decko-ts",
      runtime: "cloudflare-workers",
      database: { ok: false, error: error instanceof Error ? error.message : String(error) },
    });
  }
}

// ---------------------------------------------------------------------------
// The Workers fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const rec = recorder();
    const url = new URL(request.url);
    // Normalize: drop one trailing slash ("/Home/" and "/Home" are one card).
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    rec.startRequest(routeTag(pathname, request.method));
    let response: Response;
    try {
      response = await this.handle(request, env);
    } catch (error) {
      rec.endRequest(0);
      throw error;
    }
    rec.endRequest(response.status);
    return response;
  },

  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Normalize: drop one trailing slash ("/Home/" and "/Home" are one card).
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/_status") {
      if (request.method !== "GET") return jsonResponse(405, { error: "method not allowed" });
      try {
        return await status(await getDeck(env));
      } catch (error) {
        return jsonResponse(503, {
          ok: false,
          engine: "decko-ts",
          database: { ok: false, error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    if (pathname === "/__metrics") {
      if (request.method !== "GET") return jsonResponse(405, { error: "method not allowed" });
      return jsonResponse(200, recorder().getAggregate());
    }

    if (pathname === "/api/query") {
      if (request.method !== "POST") {
        return jsonResponse(405, { error: "POST a JSON body: {\"cql\": {...}}" });
      }
      const deck = await getDeck(env);
      return apiQuery(request, deck);
    }

    if (request.method !== "GET") {
      return jsonResponse(405, { error: "method not allowed" });
    }

    if (pathname === "/") {
      const deck = await getDeck(env);
      return renderCardPage(deck, HOME_CARD_NAME);
    }

    // GET /:card-name.json — the record JSON (checked before the render
    // route so "Something.json" never renders as a card name).
    if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      const deck = await getDeck(env);
      return cardRecordJson(deck, name);
    }

    // GET /:card-name — rendered :open view. Compound names ride the URL as
    // plus signs ("/Demo+Guide+Section+One"); no slashes in this surface.
    if (pathname.slice(1).includes("/")) {
      return errorPage(404, "Not found", "No route for " + pathname + " — try /<card-name> or /<card-name>.json");
    }
    const name = decodeName(pathname.slice(1));
    if (name === undefined || name === "") {
      return jsonResponse(400, { error: "empty card name" });
    }
    const deck = await getDeck(env);
    return renderCardPage(deck, name);
  },
};
