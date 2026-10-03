// deploy/bunny-worker-src/bunny-edge-engine-handler.ts — the Bunny Edge
// full-engine request handler, EXTRACTED from bunny-edge-engine-entry.ts so
// it can be driven in-process (the entry itself calls
// BunnySDK.net.http.serve at module scope, which makes the entry
// un-importable: @bunny.net/edgescript-sdk is an edge-runtime dependency,
// not installed here — tests/deploy/deploy-origin-deck-inflection-boot.test.ts
// documents the constraint). The entry keeps ONLY the SDK registration and
// delegates here; tests/deploy/bunny-edge-engine-handler-parity.test.ts
// drives THIS module against the local fixture.
//
// Platform contract unchanged: web-standard Request/Response, credentials
// via the passed env bag (process.env on the edge), read-only surface.

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { layoutPage, parsePath } from "../../worker.js";
import {
  decodeName,
  historyViewParams,
  installDeckNameEnvironment,
  mapRenderError,
  queryViewFromUrl,
} from "../../src/server/worker-shared-surface.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the reader's WorkerEnv. */
export type EdgeEnv = Record<string, string | undefined>;

/** Credential name pairs accepted, documented pair first — same order and
 *  same rationale as the reader (bunny-worker.ts DB_CREDENTIAL_VAR_NAMES):
 *  BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN are the names bunny.net
 *  writes via "Add Secrets to Edge Script"; BUNNY_DB_URL / BUNNY_DB_TOKEN
 *  are this repo's historical names. */
const DB_CREDENTIAL_VAR_NAMES = [
  { url: "BUNNY_DATABASE_URL", token: "BUNNY_DATABASE_AUTH_TOKEN" },
  { url: "BUNNY_DB_URL", token: "BUNNY_DB_TOKEN" },
] as const;

interface ResolvedDbConfig {
  /** https(s) URL for the BunnyDbDriver pipeline endpoint. */
  url: string;
  authToken: string;
  /** Which env-var name pair supplied the values (names only, never
   *  values — echoed by /_status). */
  urlVar: string;
  tokenVar: string;
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolveDbConfig(env: EdgeEnv): ResolvedDbConfig | { error: string } {
  for (const names of DB_CREDENTIAL_VAR_NAMES) {
    const rawUrl = env[names.url];
    const token = env[names.token];
    if (isNonEmpty(rawUrl) && isNonEmpty(token)) {
      // Bunny injects the database URL as libsql://<id>.lite.bunnydb.net/ —
      // the libsql scheme @libsql/client/web rewrites to https: (runbook
      // section 5). BunnyDbDriver speaks raw fetch, so the rewrite happens
      // here. https:// URLs pass through untouched.
      const url = rawUrl.replace(/^libsql:\/\//i, "https://");
      return { url, authToken: token, urlVar: names.url, tokenVar: names.token };
    }
    if (isNonEmpty(rawUrl) || isNonEmpty(token)) {
      const present = isNonEmpty(rawUrl) ? names.url : names.token;
      return {
        error: `${present} is set but its partner (${
          isNonEmpty(rawUrl) ? names.token : names.url
        }) is not`,
      };
    }
  }
  return {
    error: `no database credentials in env; set ${DB_CREDENTIAL_VAR_NAMES[0].url} and ${DB_CREDENTIAL_VAR_NAMES[0].token}`,
  };
}

interface Deck {
  fetcher: FetchEngine;
  render: RenderEngine;
}

// One deck per isolate (the Workers reuse pattern worker.ts uses): the first
// request boots the engine, later requests share the warm caches.
let deckPromise: Promise<Deck> | undefined;

async function bootDeck(config: ResolvedDbConfig): Promise<Deck> {
  // The deck's inflection table, applied BEFORE any name is parsed --
  // oracle-deck-inflections.ts:1-13 states the rule ("Every deck-serving
  // origin MUST apply this table at boot") and deploy/worker.ts:95 is the
  // Cloudflare origin's instance of it. Without it this edge derives the
  // gem defaults (`anonymou`, `_carol`, `brandon_`, `delete_thi`) and the
  // rendered slot class tokens carry them.
  applyDeckInflections(ORACLE_DECK_INFLECTIONS);
  const driver = new BunnyDbDriver({ url: config.url, authToken: config.authToken });
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  // The sync name environment (mark URLs /~<id> and /:<codename>) reads
  // only warm caches; install + warm at boot or the marks 500 (the same
  // prime the two Cloudflare twins run — the shared module's composition).
  await installDeckNameEnvironment(driver, fetcher);
  return { fetcher, render };
}

function getDeck(config: ResolvedDbConfig): Promise<Deck> {
  if (deckPromise === undefined) {
    deckPromise = bootDeck(config).catch((error) => {
      // Do not cache a failed boot: the next request retries (a transient
      // database hiccup on first hit must not poison the edge isolate).
      deckPromise = undefined;
      throw error;
    });
  }
  return deckPromise;
}

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

async function statusResponse(
  config: ResolvedDbConfig | { error: string },
): Promise<Response> {
  if ("error" in config) {
    return json(500, { ok: false, error: "database credentials missing", detail: config.error });
  }
  try {
    const deck = await getDeck(config);
    const r = await deck.fetcher.driver.query<{ n: unknown }>(
      "SELECT COUNT(*) AS n FROM cards WHERE trash = 0",
      [],
    );
    const n = Number(r.rows[0]?.n);
    return json(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "bunny-edge-scripting",
      view: "full render engine (SUPPORTED_VIEWS dispatch + layout shell)",
      database: {
        ok: true,
        driver: "BunnyDbDriver (hrana v2 over fetch)",
        card_count: n,
        // Names only, never values.
        url_var: config.urlVar,
        token_var: config.tokenVar,
      },
      version: "2.0.0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(503, { ok: false, database: { ok: false, error: message } });
  }
}

async function handleEngineRequest(
  request: Request,
  config: ResolvedDbConfig,
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parsePath(url.pathname);

  if ("kind" in parsed) {
    if (parsed.kind === "notFound") {
      return html(
        404,
        layoutPage(
          "Not found",
          "<h1>Not found</h1><p class='muted'>Try <a href='/'>the home page</a> or render a card by name, e.g. <code>/Hello_World</code>.</p>",
        ),
      );
    }
    if (url.pathname === "/api/status") {
      return json(200, {
        ok: true,
        runtime: "bunny-edge-scripting",
        engine: "decko-ts",
        notes: "boot pattern: warm caches survive across requests in the same isolate",
      });
    }
    if (url.pathname.startsWith("/api/card/")) {
      // Root's arm shape verbatim (worker.ts /api/card): the shared hardened
      // decode (a malformed % answers 400, never an escaped URIError — the
      // twins' decodeName rule), the whole arm inside a structured-500 try
      // so no engine error escapes the handler unhandled.
      try {
        const name = decodeName(url.pathname.slice("/api/card/".length));
        if (name === undefined || name === "") {
          return json(400, { error: "empty card name" });
        }
        const deck = await getDeck(config);
        const record = await deck.fetcher.fetchByName(name);
        if (record === undefined || record.name === undefined) {
          return json(404, { error: "card not found", name });
        }
        // The read gate (the same probe-battery batch-05 leak class the
        // Cloudflare twins closed): Ruby's GET of a denied card renders the
        // denial (ok_to_read? fails, set/all/permissions.rb:139-146); the
        // JSON surface answers 403 without the protected fields. Same engine
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
          db_content_preview: (record.dbContent ?? "").slice(0, 200),
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
    const deck = await getDeck(config);
    const view = parsed.view ?? queryViewFromUrl(url) ?? "open";
    const htmlBody = await deck.render.render(parsed.name, view, historyViewParams(url.searchParams));
    return html(200, layoutPage(`${parsed.name} (${view})`, htmlBody));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The Card::Error status_code table (prototype/lib/card/error.rb),
    // SHARED with both Cloudflare twins via mapRenderError: NotFound ->
    // 404, the UserError raise for an unregistered view -> 422
    // (error.rb:21), else 500. This entry carried root's pre-fix catch —
    // the same missing-404 the deploy-button lane fixed everywhere else.
    const mapped = mapRenderError(message);
    return html(
      mapped.status,
      layoutPage(
        mapped.title,
        `<h1>${mapped.title}</h1><pre>${message}</pre>`,
      ),
    );
  }
}

/** The serve callback body: the Bunny SDK registration in
 *  bunny-edge-engine-entry.ts delegates every request here with the edge
 *  env bag. */
export async function handleBunnyEngineRequest(
  request: Request,
  env: EdgeEnv,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Read-only edge: mirrors the Cloudflare worker with both write flags
    // unset (every non-GET/HEAD verb answers 403 and the engine is never
    // called).
    return json(403, { error: "forbidden: this edge deploy is read-only" });
  }

  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") === "/_status") {
    return await statusResponse(resolveDbConfig(env));
  }

  const resolved = resolveDbConfig(env);
  if ("error" in resolved) {
    return json(500, { error: "database credentials missing", detail: resolved.error });
  }
  return await handleEngineRequest(request, resolved);
}
