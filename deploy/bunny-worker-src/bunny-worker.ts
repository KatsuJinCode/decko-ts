// deploy/bunny-worker-src/bunny-worker.ts — request handler for the deck
// stored in Bunny Database, served by a Bunny Edge Scripting STANDALONE
// script.
//
// AUDIT against the current product docs (every page named here is cited
// again in deploy/bunny-edge-trial-runbook.md):
//
//   https://bunny.net/docs/scripting/standalone/overview.md
//   https://bunny.net/docs/scripting/environment-variables.md
//   https://bunny.net/docs/scripting/secrets.md
//   https://bunny.net/docs/scripting/runtime.md
//   https://bunny.net/docs/scripting/limits.md
//   https://bunny.net/docs/database/connect/scripting.md
//   https://bunny.net/docs/database/connect/sql-api.md
//
// WHAT CHANGED SINCE THE EARLIER ENTRY (that file is in git history; the
// diff is the audit's deliverable):
//   1. The old entry exported `default { fetch(request, env) }`. That is a
//      Workers-style module shape. A Bunny standalone script is NOT called
//      that way: it is started with BunnySDK.net.http.serve(handler), and the
//      handler receives ONLY a Request (standalone/overview.md, "The serve
//      function" + "Handler"). There is no second `env` argument, so the old
//      `env.BUNNY_DB_URL` reads could never have resolved at runtime.
//      -> The handler is now `handleRequest(request, env)`; the serve call
//         itself lives in the sibling entry module bunny-edge-entry.ts so this
//         file stays importable (and testable) with zero side effects.
//   2. Environment values are read from `process.env` (or Deno.env) —
//      environment-variables.md "Using environment variables" and
//      secrets.md "Using environment secrets". At the edge the entry passes
//      `process.env` in as `env`; locally a plain object can be passed.
//   3. Bunny's own database-connection docs inject the credentials under the
//      names BUNNY_DATABASE_URL and BUNNY_DATABASE_AUTH_TOKEN
//      (database/connect/scripting.md, "Access the environment variables"),
//      NOT the BUNNY_DB_URL / BUNNY_DB_TOKEN this repo has been using. Both
//      pairs are accepted, the documented pair first; /_status reports which
//      pair was used (names only, never values).
//   4. The old header claimed a "~1 MB edge bundle limit". The published
//      limit is 10 MB of script code (limits.md, "Script size"). The
//      "several MB minified, so it does NOT fit" conclusion for the FULL
//      decko-ts render engine still stands (better-sqlite3 / node:fs /
//      node:crypto are outside the edge runtime), but the size argument was
//      wrong and is corrected here.
//   5. Runtime: EdgeScript is Deno-based (runtime.md) with Web APIs; the
//      same file runs under `deno run -A` locally (standalone/overview.md,
//      "Local development"). BunySDK.net.http.serve() dispatches to
//      `Bunny.v1.serve(handler)` on the bunny runtime — see the extracted
//      package source quoted in bunny-edge-entry.ts.
//   6. `libsql://` URLs need no rewriting: @libsql/client/web calls
//      expandConfig(config, preferHttp=true), which maps a libsql: scheme to
//      https: (node_modules/@libsql/core/lib-esm/config.js). A separate
//      import script does rewrite it, but that is its own HTTP path.
//
// STILL THE SAME MINIMAL SCOPE (NOT THE FULL decko-ts engine): the render
// engine depends on better-sqlite3, node:fs and node:crypto, so this entry
// fetches the card and shapes a minimal HTML/JSON record response.
//
// STORED CONTENT IS NEVER SERVED. This entry has no session, no viewer
// identity and no read rule — handleRequest answers whatever URL it is given,
// so a route that returns db_content returns it to anyone who guesses the
// card name. On a real deck db_content carries an account's `+*password`
// digest, `+*salt` and `+*email` (src/card/auth/account-fields.ts), so the
// record view is metadata only: id, name, key, codename, type_id, left_id,
// right_id, trash and the timestamps. fetchCardByName does not SELECT
// db_content, so the column never reaches this module at all; that is the
// structural half of the fix, and a later route change cannot re-expose the
// content by forgetting to filter a response.
//
// This is deliberately NOT routed through the engine's read gate. Two reasons,
// both verified in this tree rather than assumed:
//   - canReadCard is a RenderEngine method (src/card/render.ts) whose verdict
//     needs a deck, a viewer and its read rules. Importing it here would pull
//     the engine — and the better-sqlite3 / node:fs / node:crypto deps this
//     entry exists to avoid — into the edge bundle. It is also vacuous here:
//     there is no viewer to ask about.
//   - publicDbContent (src/server/worker-shared-surface.ts) masks only a
//     `+*password` card's content and returns everything else verbatim, so
//     `+*salt` and `+*email` would still be served. It is the right helper
//     where a real viewer exists (the engine-based Bunny and Cloudflare
//     entries use it); it is not a fix for an anonymous route.
//
// ROUTES (unchanged from the earlier entry):
//   GET  /               -> render the "Home" card (minimal HTML record view)
//   GET  /_status        -> { ok, runtime, db_ok, cards_n, version }
//   GET  /<card-name>    -> minimal HTML record view of that card (200/404)
//   GET  /<card-name>.json -> the card record as JSON (metadata, no content)
//   anything else        -> 404
//
// Deployment (dashboard-first):
//   Edge Platform > Scripting > Add Script > Standalone > Default standalone,
//   paste deploy/dist/bunny-worker.bundle.js, set the two env secrets, Publish.
//   See deploy/bunny-edge-trial-runbook.md.

import { createClient } from "@libsql/client/web";

/** The environment bag the entry passes in. On the edge this is
 *  `process.env`; in tests it is a plain object. Values are strings. */
export interface WorkerEnv {
  [name: string]: string | undefined;
}

/** Minimal structural view of the one @libsql/client/web surface used here,
 *  so a test can inject a mock without the real client. */
export interface CardRow {
  [column: string]: unknown;
}

export interface CardClient {
  execute(
    statement: string | { sql: string; args?: unknown[] },
    args?: unknown[],
  ): Promise<{ rows: CardRow[] }>;
}

export interface CardClientConfig {
  url: string;
  authToken: string;
}

export type CardClientFactory = (config: CardClientConfig) => CardClient;

export interface ResolvedDbConfig extends CardClientConfig {
  /** Which env-var name pair supplied the values (names only). */
  urlVar: string;
  tokenVar: string;
}

/** The credential name pairs this entry accepts, documented pair first.
 *  BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN are the names bunny.net
 *  itself writes when you use "Add Secrets to Edge Script" on a database's
 *  Access page (database/connect/scripting.md). BUNNY_DB_URL /
 *  BUNNY_DB_TOKEN are this repo's historical names, still honoured so an
 *  existing dashboard configuration keeps working. A name cannot be used as
 *  both a variable and a secret on one script (secrets.md), so a script that
 *  carries the documented pair must not also carry the legacy pair. */
export const DB_CREDENTIAL_VAR_NAMES = [
  { url: "BUNNY_DATABASE_URL", token: "BUNNY_DATABASE_AUTH_TOKEN" },
  { url: "BUNNY_DB_URL", token: "BUNNY_DB_TOKEN" },
] as const;

/** @libsql/client/web is the client the Bunny database docs use from an edge
 *  script (database/connect/scripting.md). */
export const defaultCardClientFactory: CardClientFactory = ({ url, authToken }) =>
  createClient({ url, authToken }) as unknown as CardClient;

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/** First name pair with BOTH halves present wins; a half-present pair is
 *  reported as such rather than silently ignored. */
export function resolveDbConfig(env: WorkerEnv): ResolvedDbConfig | { error: string } {
  for (const names of DB_CREDENTIAL_VAR_NAMES) {
    const url = env[names.url];
    const token = env[names.token];
    if (isNonEmpty(url) && isNonEmpty(token)) {
      return { url, authToken: token, urlVar: names.url, tokenVar: names.token };
    }
    if (isNonEmpty(url) || isNonEmpty(token)) {
      const present = isNonEmpty(url) ? names.url : names.token;
      return { error: `${present} is set but its partner (${isNonEmpty(url) ? names.token : names.url}) is not` };
    }
  }
  return {
    error: `no database credentials in env; set ${DB_CREDENTIAL_VAR_NAMES[0].url} and ${DB_CREDENTIAL_VAR_NAMES[0].token}`,
  };
}

export interface CardRecord {
  id: number;
  name: string | null;
  key: string | null;
  codename: string | null;
  type_id: number | null;
  left_id: number | null;
  right_id: number | null;
  trash: number;
  created_at: string;
  updated_at: string;
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function htmlResponse(status: number, body: string, title = "decko-ts on Bunny Edge"): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Same contract as src/server/worker-shared-surface.ts#decodeNameMark: the
 *  URI mark decodes underscores to spaces BEFORE the fetch — card_class.rb
 *  :126-131 uri_fetch_opts `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`.
 *  Same key either way; the decode is what an absent-card render displays.
 *  A codename mark's underscore is the primed codehash key's own spelling,
 *  so the fold skips `:`-prefixed marks (name folding does not cover them). */
function decodeName(raw: string): string | undefined {
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith(":") ? decoded : decoded.replace(/_/g, " ");
  } catch {
    return undefined;
  }
}

const HOME_NAME = "Home";

/** The whole request surface. `createClientFn` is injected so the smoke test
 *  can drive every route against a mock database with no network call. */
export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  createClientFn: CardClientFactory = defaultCardClientFactory,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  try {
    const resolved = resolveDbConfig(env);
    if ("error" in resolved) {
      return jsonResponse(500, { error: "BUNNY_DB_URL or BUNNY_DB_TOKEN missing from env", detail: resolved.error });
    }
    const db = createClientFn({ url: resolved.url, authToken: resolved.authToken });

    if (pathname === "/_status") {
      return await status(db, resolved);
    }

    const cardName =
      pathname === "/" ? HOME_NAME :
      pathname.endsWith(".json") ? null :
      decodeName(pathname.slice(1));

    if (pathname === "/") {
      return await renderCardPage(db, HOME_NAME);
    }
    if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      return await cardRecordJson(db, name);
    }
    if (cardName !== null) {
      if (cardName === undefined || cardName === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      return await renderCardPage(db, cardName);
    }
    return htmlResponse(
      404,
      `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)} — try /<card-name> or /<card-name>.json</pre>`,
      "Not found",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "server error", message });
  }
}

async function status(db: CardClient, config: ResolvedDbConfig): Promise<Response> {
  try {
    const r = await db.execute("SELECT COUNT(*) AS n FROM cards WHERE trash = 0");
    const n = Number(r.rows[0]?.n);
    return jsonResponse(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "bunny-edge-scripting",
      view: "minimal record view (engine subset)",
      database: {
        ok: true,
        driver: "@libsql/client/web",
        card_count: n,
        // Names only, never values.
        url_var: config.urlVar,
        token_var: config.tokenVar,
      },
      version: "1.0.0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(503, { ok: false, database: { ok: false, error: message } });
  }
}

/** The card row as this entry is allowed to see it. `db_content` is absent by
 *  design — see the STORED CONTENT IS NEVER SERVED note in the header. */
async function fetchCardByName(db: CardClient, name: string): Promise<CardRecord | null> {
  const r = await db.execute({
    sql: "SELECT id, name, key, codename, type_id, left_id, right_id, trash, created_at, updated_at FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
    args: [name],
  });
  if (r.rows.length === 0) return null;
  return r.rows[0] as unknown as CardRecord;
}

async function cardRecordJson(db: CardClient, name: string): Promise<Response> {
  const rec = await fetchCardByName(db, name);
  if (rec === null) {
    return jsonResponse(404, { error: "card not found", name });
  }
  return jsonResponse(200, {
    id: rec.id,
    name: rec.name,
    key: rec.key,
    type_id: rec.type_id,
    codename: rec.codename,
    left_id: rec.left_id,
    right_id: rec.right_id,
    trash: rec.trash,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  });
}

async function renderCardPage(db: CardClient, name: string): Promise<Response> {
  const rec = await fetchCardByName(db, name);
  if (rec === null) {
    return htmlResponse(
      404,
      `<h1>Card not found</h1><pre>card not found: ${escapeHtml(name)}</pre>` +
        `<p><a href="/">Home</a> · <a href="/_status">status</a></p>`,
      "Card not found",
    );
  }
  const body =
    `<div class="card-view" data-card="${escapeHtml(name)}">` +
    `<h1>${escapeHtml(name)}</h1>` +
    `<p><strong>id:</strong> ${rec.id} · <strong>type_id:</strong> ${rec.type_id ?? "—"}` +
    (rec.codename ? ` · <strong>codename:</strong> ${escapeHtml(rec.codename)}` : "") +
    `</p>` +
    `<h2>db_content</h2>` +
    `<p><em>withheld — this entry serves card records, not stored content.</em></p>` +
    `<p><a href="/${encodeURIComponent(name)}.json">record JSON</a> · <a href="/_status">status</a> · <a href="/">Home</a></p>` +
    `</div>`;
  return htmlResponse(200, body, name);
}
