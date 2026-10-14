// decko-ts Cloudflare Workers entry — the M2 one-click deploy harness.
//
// A THIN edge shell around the same engine the Node tests drive (see
// tests/deploy/deploy-worker-miniflare.test.ts for the workerd proof): the
// D1 adapter from src/server/drivers/d1.ts (miniflare-proven, see
// docs/decisions/0003-edge-native-driver-interfaces.md), FetchEngine, RenderEngine, and the CQL executor.
// Web-standard Request/Response only — no Node APIs on this path. The one
// Node import inside the engine graph (node:crypto in
// src/card/render/slot-html.ts) is routed around at bundle time by the
// [alias] table in wrangler.toml -> shims/node-crypto-shim.ts; src/ is left
// untouched and the import is reported there instead.
//
// Routes (the whole surface):
//   GET  /              -> render the "Home" card, :open view (HTML)
//   GET  /:card-name    -> render that card, :open view (HTML)
//   ...both of the above honor ?view=X (or ?v=X) - Ruby's card#read ->
//   show(nil) -> view_from_params (rest.rb:100-103); a path view wins
//   GET  /:card-name.json -> the card record as JSON
//   GET  /:mark/view/:view  -> the same card, the named view
//   GET  /:card-name/:view  -> ditto (engine_routes.rb:51)
//   POST /api/query     -> { "cql": <CQL JSON> } body -> CQL result JSON
//   GET  /_status        -> engine + database health JSON
//   GET  /__metrics      -> per-isolate request/SQL/D1-rows aggregate
//                           (GATED: 404 unless the METRICS_TOKEN binding is
//                           set, 403 without the matching X-Decko-Metrics-Token
//                           header — see metricsAuthorized)
//
// Static assets (/assets/*, /robots.txt) never reach this file: the wrangler
// [assets] directory configured in wrangler.oneclick.toml serves them from
// the assets layer before the worker is invoked (read-path demo: zero D1
// traffic for assets). Card pages link them via PAGE_HEAD_TAGS below.
//
// Deploy recipe: deploy/README.md. Architecture + compatibility notes:
// docs/deploy-cloudflare.md.

import { CloudflareD1Adapter, type D1DatabaseLike } from "../src/server/drivers/d1.js";
import type { SQLQueryResult } from "../src/server/driver.js";
import { FetchEngine } from "../src/card/fetch.js";
import { RenderEngine } from "../src/card/render.js";
import {
  renderFormatShow,
  type FormatEngineSurface,
} from "../src/card/render/format-families.js";
import { executeQuery } from "../src/cql/execute.js";
import { CqlBadQuery } from "../src/cql/ast.js";
import { DeckoName } from "../src/card/name.js";
import { applyDeckInflections } from "../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../src/card/name/oracle-deck-inflections.js";
import { createVirtualCardLookup } from "../src/card/fetch/virtual-cards.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../src/card/rules/structure.js";
import { MetricsRecorder, type MetricsRoute } from "./src/worker-metrics.js";
import {
  decodeName,
  decodeViewSegment,
  historyViewParams,
  jsonViewSearchParams,
  mapRenderError,
  queryViewFromUrl,
} from "../src/server/worker-shared-surface.js";

/** Bindings declared in wrangler.toml ([[d1_databases]]). */
interface Env {
  DB: D1DatabaseLike;
  /** OPTIONAL secret binding. /__metrics answers only when this is bound and
   *  the request carries the matching token (see metricsAuthorized). Absent
   *  is the deployed default — the route is not merely empty, it is not
   *  there. */
  METRICS_TOKEN?: string;
}

/** The header the /__metrics gate reads. A query parameter is deliberately
 *  NOT accepted: tokens in a URL land in access logs, browser history and
 *  Referer headers, which is the reason the header form exists. */
const METRICS_TOKEN_HEADER = "x-decko-metrics-token";

/** Constant-time-ish string comparison. Not cryptographic and does not claim
 *  to be: the token is an operator secret compared inside a Worker, and the
 *  real defence is that the binding is absent by default. The length check
 *  short-circuits before the loop so a wrong-length token costs nothing. */
function tokenMatches(expected: string, presented: string): boolean {
  if (expected.length !== presented.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return diff === 0;
}

/** Whether this request may read the isolate metrics. Both halves are
 *  required: the binding must exist AND the request must present it. */
function metricsAuthorized(request: Request, env: Env): boolean {
  const expected = env.METRICS_TOKEN;
  if (expected === undefined || expected === "") return false;
  const presented = request.headers.get(METRICS_TOKEN_HEADER);
  return presented !== null && tokenMatches(expected, presented);
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
  // THE CARD GEM'S INFLECTION INITIALIZER, APPLIED BEFORE ANY NAME IS PARSED.
  //
  // `CARD_GEM_INITIALIZER_INFLECTIONS` is the card gem's own
  // config/initializers/inflections.rb (src/card/name/oracle-deck-inflections.ts
  // :1-13), and its own header is the rule this call is the first
  // instance of: "Every deck-serving origin MUST apply this table at boot,
  // BEFORE any name is parsed or any row is primed - the same moment a
  // Rails deck's config/initializers/inflections.rb runs." This worker is
  // a deck-serving origin and it did not, so every key it derived was the
  // gem default instead of the deck's: `Anonymous` keyed `anonymou`,
  // `Team's Notes` keyed `team__note`, `delete this`
  // keyed `delete_thi` (three uncountables, oracle-deck-inflections.ts
  // :44-50). Those keys ride into the rendered slot class tokens
  // (`SELF-anonymous-bar-view` vs `SELF-anonymou-bar-view`), so the divergence
  // is visible in the
  // card BYTES, not only in lookups.
  //
  // The call is idempotent (it swaps an immutable table snapshot and drops
  // DeckoName's memoized keys, name.ts:115-120) and it must stay ABOVE the
  // row loop in primeCqlNameResolver, which derives every keyToId entry
  // from DeckoName.parse.
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  const driver = new CloudflareD1Adapter(env.DB);
  observeDriverQueries(driver, recorder());
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  const resolveCardId = await primeCqlNameResolver(driver, fetcher);
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
    recorder.observeQuery({
      sql,
      rowsRead: result.rowsRead,
      rowsWritten: result.rowsWritten,
      // Exact iff the D1 adapter surfaced the provider's own counters
      // (drivers/d1.ts maps meta.rows_read / meta.rows_written); an
      // absent number leaves the recorder's ESTIMATE tally governing.
      // The two fields were missing here and only surfaced once the route
      // tests made the worker part of the tsc program (tsconfig's
      // include list has no deploy/**; nothing under src/ tests/ benchmarks/
      // imported the worker before).
      exact: typeof result.rowsRead === "number",
    });
    return result;
  };
  const rawBatch = driver.batch.bind(driver);
  (driver as { batch: typeof rawBatch }).batch = async (statements) => {
    const results = await rawBatch(statements);
    results.forEach((result, index) => {
      recorder.observeQuery({
        sql: statements[index]?.sql ?? "",
        rowsRead: result.rowsRead,
        rowsWritten: result.rowsWritten,
        exact: typeof result.rowsRead === "number",
      });
    });
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
// (ParseOptions.resolveCardId — the equivalent of Card::Lexicon.id). Without one,
// a name condition collapses to the Ruby -999 sentinel and silently matches
// nothing (src/cql/parser.ts idFromVal). The render path primes its own
// idsByKey map during prefetch; /api/query has no prefetch, so this entry
// primes an equivalent map once per isolate.
//
// Budget honesty: this loads the id/name/left_id/right_id of EVERY
// non-trashed card. For a demo deck (16 rows) that is one cheap query; on a
// large deck (tens of thousands of cards) it would be megabytes of isolate
// memory. A
// production entry would swap in a real sync-lexicon strategy — documented
// in docs/deploy-cloudflare.md, deliberately not improvised here.

interface IdRow {
  id: number;
  name: string | null;
  left_id: number | null;
  right_id: number | null;
}

async function primeCqlNameResolver(
  driver: CloudflareD1Adapter,
  fetcher: FetchEngine,
): Promise<(name: string) => number | undefined> {
  const { rows } = await driver.query<IdRow>(
    "SELECT id, name, left_id, right_id FROM cards WHERE trash = 0",
    [],
  );
  const byId = new Map<number, IdRow>();
  const idToName = new Map<number, string>();
  const keyToId = new Map<string, number>();
  // Each stored name is otherwise parsed three times during the boot (here,
  // in the composed-key loop and in the lexicon warm). A string with no
  // id/codename mark parses to the same name whenever it is parsed (the
  // rule DeckoName.parse's own request memo uses), so those are parsed once.
  const parsedNames = new Map<string, DeckoName>();
  const parseOnce = (text: string): DeckoName => {
    if (text.includes("~") || text.includes(":")) return DeckoName.parse(text);
    let parsed = parsedNames.get(text);
    if (parsed === undefined) {
      parsed = DeckoName.parse(text);
      parsedNames.set(text, parsed);
    }
    return parsed;
  };
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.name !== null && row.name !== "") {
      const name = parseOnce(row.name);
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
    if (name !== undefined) keyToId.set(parseOnce(name).key, row.id);
  }
  // The sync name environment (DeckoName's mark resolution for "~<id>" and
  // ":<codename>" strings, name.ts parse -> idFromString) reads ONLY the
  // warm caches through the engine's peek adapters, so the worker boot has
  // to install the adapters and warm the caches BEFORE the first request:
  // without this, "/~9" 500s with "id doesn't exist: 9" (DeckoName.badMark,
  // the NameNotFoundError path) and "/:search_type" 500s with
  // "codename doesn't exist: search_type" — the mark URLs are unusable.
  // The lexicon warm reuses the row load above (no second full scan);
  // the codename codehash is its own small query. Mirrors FetchEngine#
  // warmLexicon + installNameEnvironment, the composition the local
  // engine boots with.
  fetcher.installNameEnvironment();
  await fetcher.codenames.ensureLoaded();
  for (const row of rows) {
    if (row.left_id !== null && row.right_id !== null) {
      const joined = composedName(row.id);
      if (joined === undefined) continue;
      fetcher.lexicon.write(row.id, parseOnce(joined), [row.left_id, row.right_id]);
    } else if (row.name !== null && row.name !== "") {
      const name = parseOnce(row.name);
      fetcher.lexicon.write(row.id, name, row.name);
    }
  }
  // Virtual-card rule universe: the
  // storage factory's responsibility per
  // src/card/fetch/virtual-cards.ts:44-49. Without this hook, compound
  // names that resolve only through the structure rule walk return
  // undefined from `FetchEngine.fetchByName` and the serving path 404s
  // them even when the stored deck carries the rule (e.g. a compound name
  // reachable only through a `+*right` rule row).
  {
    const [universeResult] = await driver.batch([structureRuleUniverseStatement()]);
    fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
      contents: structureUniverseFromResults(universeResult),
      ruleTypeIds: structureRuleTypesFromResults(universeResult),
    });
  }
  return (nameish: string) => keyToId.get(DeckoName.parse(nameish).key);
}

// ---------------------------------------------------------------------------
// HTTP plumbing (Web-standard only)
// ---------------------------------------------------------------------------

const HOME_CARD_NAME = "Home";
const OPEN_VIEW = "open";

/** The static-asset head tags, in the same order and shape a decko page
 *  serves: viewport meta, the Material Icons font stylesheet, the compiled
 *  decko skin stylesheet, then the script tags — jQuery + jquery-ujs from CDNs
 *  (the compiled all-script.js BUNDLES jquery-ui and
 *  bootstrap but NOT jQuery itself; without jQuery loaded first, jquery-ui's
 *  factory throws and nothing after it in the bundle registers), the compiled
 *  decko JS bundle next, the per-deck config after it. `defer` preserves
 *  document execution order, so the config assignments land after decko.js
 *  has defined the global — the same effective order as a decko page's
 *  inline config block, without blocking first paint. The files ride the
 *  wrangler [assets] directory
 *  (scripts/deploy/one-click-deck/demo-static-assets/): the assets layer
 *  serves them before the worker runs, so each asset request costs zero D1
 *  reads and zero D1 writes. */
const PAGE_HEAD_TAGS =
  `<meta content="width=device-width, initial-scale=1.0" name="viewport">` +
  `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css">` +
  `<link media="all" rel="stylesheet" type="text/css" href="/assets/all-style.css">` +
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" defer crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>` +
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" defer crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>` +
  `<script src="/assets/all-script.js" defer></script>` +
  `<script src="/assets/decko-config.js" defer></script>`;

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

export function escapeHtml(text: string): string {
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

/** decodeName moved to src/server/worker-shared-surface.ts — the hardened
 *  decode is SHARED surface (the root entry answers the same joint rules),
 *  extracted so the twins cannot drift again. The joint story lives on the
 *  shared function. */

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** One resolved read route: the card's name plus the view to render it in.
 *  `view` is undefined exactly when the path names no view (the bare
 *  /:mark arm) - Ruby's show(nil), where view_from_params (the ?view=/?v=
 *  query) fills the gap (rest.rb:92-103). The path-view arms always carry
 *  the path's view. */
type ParsedRoute =
  | { readonly kind: "card"; readonly name: string; readonly view?: string }
  /** A one-segment path whose mark decodes to nothing - the 400 the
   *  single-segment route has always answered (not a missing route). */
  | { readonly kind: "empty-name" }
  /** Nothing in the grammar matches: the 404. */
  | { readonly kind: "no-route" };

/** The read-route grammar, in Ruby's own order (engine_routes.rb:19, 24, 51).
 *
 *  `/:mark`              line 19  - show(nil): the query param (or the
 *                                  :open default) picks the view
 *  `/:mark/view/:view`   line 24  - "simplifies API documentation"
 *  `/:mark/:view`        line 51  - "for super-lazy under-achievers"
 *
 * The three remaining alternate GET lines are NOT here, and that is
 * deliberate rather than forgotten:
 *  - `new/:type` (line 22) builds a NEW card of a type (mark.rb:38-44
 *    `view_does_not_require_name?` -> ViewOpts.unknown_ok[view]); it needs
 *    the new-card view machinery this shell has no loader for.
 *  - `type/:type` (line 23) renders the type's Search card;
 *    the CF shell has no search-card route.
 *  - `card/:view(/:mark)` (line 25) is legacy and Ruby CONSTRAINS its view
 *    to /new|edit/ — both of which need the same new/edit machinery as the
 *    first entry. Unconstrained it would shadow nothing (three segments
 *    with a literal "card" first are unambiguous), so it is left out until
 *    the edit/new views land rather than half-served.
 *
 * An empty segment (a doubled slash) is not a card route, matching Rails:
 * a path segment never goes empty in these patterns. */
function parseCardRoute(pathname: string): ParsedRoute {
  const segments = pathname.replace(/^\/+/, "").split("/");
  if (segments.some((segment) => segment === "")) return { kind: "no-route" };

  if (segments.length === 1) {
    const name = decodeName(segments[0]!);
    if (name === undefined || name === "") return { kind: "empty-name" };
    // no view in the path: Ruby's card#read -> show(nil) - view_from_params
    // consults the query before the :open default applies (rest.rb:92-103)
    return { kind: "card", name };
  }

  if (segments.length === 3 && segments[1] === "view") {
    const name = decodeName(segments[0]!);
    const view = decodeViewSegment(segments[2]!);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "no-route" };
    }
    return { kind: "card", name, view };
  }

  if (segments.length === 2) {
    const name = decodeName(segments[0]!);
    const view = decodeViewSegment(segments[1]!);
    if (name === undefined || view === undefined || name === "" || view === "") {
      return { kind: "no-route" };
    }
    return { kind: "card", name, view };
  }

  return { kind: "no-route" };
}

/** queryViewFromUrl moved to src/server/worker-shared-surface.ts — the
 *  view_from_params read (rest.rb:100-103) is shared surface; the local
 *  copy was the twins' third drift risk. */

async function renderCardPage(
  deck: Deck,
  cardName: string,
  requestedView = OPEN_VIEW,
  params: Record<string, string> = {},
): Promise<Response> {
  try {
    const view = await deck.render.render(cardName, requestedView, params);
    // Body wrapper = the decko page shell: everything visible
    // rides inside <article class="container flex-shrink-0" role="main"> —
    // the decko page gutter. Without it, anything the shell emits as a
    // direct body child (here the record-JSON/status menu line) sits at
    // x=0: Bootstrap's reboot zeroes body margin, and the card slot's
    // ~24px inset comes from its OWN internal paddings (accordion-body /
    // d0-card-header), not from any page container — so a bare body-level
    // <p> renders flush against the viewport edge, visually clipped
    // between the card's bottom border and the background. The menu line
    // is a shell affordance, not a card-menu, so it rides the same
    // guttered container as the card (nothing user-visible is
    // bare in the body). The .card-view div stays the test hook.
    return htmlResponse(
      200,
      `<!doctype html><html class="h-100"><head><meta charset="utf-8"><title>${escapeHtml(cardName)} — decko-ts</title>${PAGE_HEAD_TAGS}</head>` +
        `<body class="d-flex flex-column h-100">` +
        `<article class="container flex-shrink-0" role="main"><div id="main">` +
        `<div class="card-view" data-card="${escapeHtml(cardName)}" data-view="${escapeHtml(requestedView)}">${view}</div>` +
        `<p><a href="/${encodeURIComponent(cardName)}.json">record JSON</a> · <a href="/_status">status</a></p>` +
        `</div></article></body></html>`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The Card::Error status_code table (card 1.110.0 lib/card/error.rb),
    // SHARED with the root entry via mapRenderError: NotFound -> 404, the
    // UserError raise for an unregistered view -> 422 (error.rb:21 — the
    // base status_code this entry's former 500 contradicted), else 500.
    const mapped = mapRenderError(message);
    return errorPage(mapped.status, mapped.title, message);
  }
}

async function cardRecordJson(deck: Deck, cardName: string): Promise<Response> {
  // Freshness before the fetch and the read gate (RenderEngine#ensureFreshness
  // — the render path's own gate): the retained engine memoizes permission
  // verdicts, so a rule revoked after the last render must not keep serving
  // the record JSON.
  await deck.render.ensureFreshness();
  const record = await deck.fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  // The read gate: this route previously served db_content for cards the
  // HTML views replace with the denial span. Ruby's GET of a denied card
  // renders the denial
  // (ok_to_read? fails, set/all/permissions.rb:139-146); the JSON surface
  // answers 403 without the protected fields. The verdict comes from the
  // same engine state the HTML path judges with (RenderEngine#canReadCard).
  const typeRecord =
    record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
  const readable = await deck.render.canReadCard(record, typeRecord?.name?.s);
  if (!readable) {
    return jsonResponse(403, { error: "permission denied", name: cardName });
  }
  // The 200 body is the RUBY JSON-FORMAT SHAPE: the json format's show
  // default :molecule —
  // atom + items + links + ancestors + html_url + type nest + timestamps,
  // wrapped by page_details (url + requested_at), pretty-printed. The
  // engine-side byte pins are the format-families-oracle suite (not in the public package).
  // The former engine-record shape (snake_case row dump) diverged from that
  // molecule; the record row remains available over /api/query.
  //
  // No urlBase override: the format renders RELATIVE paths ("/Home" —
  // format-families.ts FormatShowOptions.urlBase's documented default ""),
  // and the miniflare deploy proof pins that shape. A
  // `urlBase: new URL(request.url).origin` prefix would produce
  // "https://<host>/Home", which the proof's molecule.url pin rejects.
  try {
    const body = await renderFormatShow(formatEngineSurface(deck), cardName, "json");
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "json render failed", message });
  }
}

/** The FormatEngineSurface wiring over the deck's engines. */
function formatEngineSurface(deck: Deck): FormatEngineSurface {
  return {
    fetchRenderCard: (name: string) => deck.render.fetchRenderCard(name),
    prepareItemForRender: (name: string) => deck.render.prepareItemForRender(name),
    render: (name: string, view: string) => deck.render.render(name, view),
    codenameById: async (id: number) => await deck.fetcher.codenames.nameForId(id),
  };
}

/** The `/:mark.csv` and `/:mark.rss` route arms (engine_routes.rb:22
 *  `get "/:mark(.:format)" => "card#read"`; the format families are
 *  byte-pinned in
 *  the format-families-oracle suite (not in the public package)). */
async function cardFormatShow(
  deck: Deck,
  cardName: string,
  format: "csv" | "rss",
): Promise<Response> {
  // Freshness before the fetch and the read gate (see cardRecordJson): the
  // csv/rss surfaces judge permissions against the same memoized engine
  // state and must not outlive a committed revocation.
  await deck.render.ensureFreshness();
  const record = await deck.fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  const typeRecord =
    record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
  const readable = await deck.render.canReadCard(record, typeRecord?.name?.s);
  if (!readable) {
    return jsonResponse(403, { error: "permission denied", name: cardName });
  }
  try {
    const body = await renderFormatShow(formatEngineSurface(deck), cardName, format, {
      // rss_enabled: Cardio.config default FALSE (lib/card/mod/format.rb:4);
      // this engine carries no config override surface yet. No urlBase
      // override either (see cardRecordJson): the format renders relative
      // paths and the deploy proof pins that shape.
      rssEnabled: false,
    });
    const contentType =
      format === "csv" ? "text/csv; charset=utf-8" : "application/rss+xml; charset=utf-8";
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    // Ruby's csv raise becomes the 500 shape (the "Wild Card!" error page's
    // route-level form; the csv NoMethodError raise is the oracle behavior).
    const message = error instanceof Error ? error.message : String(error);
    return errorPage(500, "Render error", message);
  }
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
    // Freshness before the permission filter and the query (see
    // cardRecordJson): cqlPermissionOptions reads the same memoized
    // readable-rule state, so a stale isolate would filter rows by the
    // pre-revocation rule set.
    await deck.render.ensureFreshness();
    // Permission filter (the equivalent of Where#permission_conditions): without
    // it the API returns db_content for cards the HTML views deny — the
    // same leak the record-JSON route had. The generator renders
    // `read_rule_id IN (...)` from the viewer's readable rule set, exactly
    // Ruby's Card::Query under Auth.always_ok? false.
    const permission = await deck.render.cqlPermissionOptions();
    const result = await executeQuery(deck.driver, cql, {
      parse: { resolveCardId: deck.resolveCardId },
      alwaysOk: permission.alwaysOk,
      readRuleIds: permission.readRuleIds,
    });
    // THE SQL LEAVES. The 200 body is the result and the result ONLY. The
    // generator's statement text used to ride alongside it, which handed an
    // anonymous caller the table shape, the aliasing convention, the bound
    // permission filter and every resolved id the query touched — none of
    // which the caller sent. Ruby's search API answers rows, and a
    // statement echo is a debugging affordance that does not belong on a
    // public route. The statement is still recorded where it belongs: the
    // per-isolate metrics recorder (worker-metrics.ts observeQuery), which
    // is gated rather than public.
    const { sql: _statement, params: _bound, ...payload } = result;
    void _statement;
    void _bound;
    return jsonResponse(200, payload);
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
      // GATED. The aggregate is an operational readout —
      // per-route request counts, wall-time percentiles, D1 rows read and
      // written — and it was served to anyone who asked. It is not card
      // content, so the read-permission gate does not apply to it and never
      // will; it needs its own door.
      //   * No METRICS_TOKEN binding (the deployed default) -> 404. Not 403:
      //     an unauthenticated caller should not learn that the route
      //     exists, let alone what it measures.
      //   * Binding present, token wrong or absent -> 403, which does say
      //     the route exists — correct, because the operator who bound the
      //     token wanted it reachable, just not to strangers.
      if (!metricsAuthorized(request, env)) {
        return env.METRICS_TOKEN === undefined || env.METRICS_TOKEN === ""
          ? errorPage(404, "Not found", "No route for " + pathname)
          : jsonResponse(403, { error: "metrics token required" });
      }
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
      // root "card#read" (engine_routes.rb:7): show(nil) - the query param
      // picks the view, the :open default otherwise (rest.rb:92-103)
      return renderCardPage(
        deck,
        HOME_CARD_NAME,
        queryViewFromUrl(new URL(request.url)) ?? OPEN_VIEW,
        historyViewParams(new URL(request.url).searchParams),
      );
    }

    // GET /:card-name.json — the card's json-format show (checked before
    // the render route so "Something.json" never renders as a card name).
    // A TWO-segment .json path is Ruby route line 51 with the format
    // suffix — get ":mark/:view(.:format)" => "card#read" — the ENGINE's
    // view dispatch in the json format (the navbox typeahead's
    // search_box_complete.json among them; an unregistered view raises the
    // UnsupportedViewError the 422 mapping serves, the same shape
    // renderCardPage serves the html arm). The request-term seam rides the
    // search params (search_params.rb: term_param || vars.keyword).
    if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      if (raw.includes("/")) {
        const slash = raw.indexOf("/");
        const markName = decodeName(raw.slice(0, slash));
        const rawView = raw.slice(slash + 1);
        const viewName = (() => {
          try {
            return decodeURIComponent(rawView);
          } catch {
            return undefined;
          }
        })();
        if (markName === undefined || markName === "" || viewName === undefined || viewName === "") {
          return jsonResponse(400, { error: "empty card name" });
        }
        const deck = await getDeck(env);
        const search = jsonViewSearchParams(new URL(request.url).searchParams);
        try {
          const body = await deck.render.render(markName, viewName, {
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof Error && error.name === "UnsupportedViewError") {
            // Ruby: an unsupported view is a UserError -> 422
            // (format/render.rb:60-64 raise + error.rb:21 status).
            return new Response(message, {
              status: 422,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          return jsonResponse(500, { error: "json view render failed", message });
        }
      }
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      const deck = await getDeck(env);
      return cardRecordJson(deck, name);
    }

    // GET /:card-name.csv / .rss — the csv/rss format shows (the same
    // `get "/:mark(.:format)"` route arm; the format URLs stay in the
    // relative shape the byte pins expect — see cardRecordJson).
    const csvSuffix = pathname.endsWith(".csv");
    const rssSuffix = !csvSuffix && pathname.endsWith(".rss");
    if (csvSuffix || rssSuffix) {
      const suffix = csvSuffix ? ".csv" : ".rss";
      const raw = pathname.slice(0, -suffix.length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      const deck = await getDeck(env);
      return cardFormatShow(deck, name, csvSuffix ? "csv" : "rss");
    }

    // GET /:card-name — rendered :open view. Compound names ride the URL
    // the decko way: '+' is the joint, %20 (or the underscore alias) the
    // space within a part ("/Demo%20Guide+Section%20One"). No slashes in
    // this surface.
    //
    // The ALTERNATE GET routes extend the same dispatch to the
    // multi-segment forms Ruby's engine_routes.rb declares:
    //   get ":mark/view/:view(.:format)" => "card#read"  (line 24)
    //   get ":mark/:view(.:format)"        => "card#read"  (line 51)
    // All three land on card#read, whose `read` -> `show` ->
    // `view_from_params` reads params[:view] out of the PATH
    // (decko-0.20.0 lib/card_controller/rest.rb:84-88, 100-103) — so the
    // view name is taken verbatim and handed to the engine, which raises
    // UnsupportedViewError for a view no module registers (the same raise
    // Ruby hits when the template is missing). No allowlist here on
    // purpose: a filter would silently answer 200-with-empty for a view
    // Ruby cannot render either.
    //
    // The ?view=/?v= QUERY param rides the same
    // card#read contract: the bare /:mark arm is show(nil), so
    // render_page's `view ||= view_from_params` (rest.rb:96, 100-103) fills
    // the view from the query - first non-blank of params[:view],
    // params[:v] - before the :open default. A path view (the action arg)
    // never falls through to params. Root "/" is card#read too
    // (engine_routes.rb:7) and gets the same treatment above.
    const route = parseCardRoute(pathname);
    if (route.kind === "no-route") {
      return errorPage(404, "Not found", "No route for " + pathname + " — try /<card-name> or /<card-name>.json");
    }
    if (route.kind === "empty-name") {
      return jsonResponse(400, { error: "empty card name" });
    }
    const deck = await getDeck(env);
    return renderCardPage(
      deck,
      route.name,
      route.view ?? queryViewFromUrl(new URL(request.url)) ?? OPEN_VIEW,
      historyViewParams(new URL(request.url).searchParams),
    );
  },
};
