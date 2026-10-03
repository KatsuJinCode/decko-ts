// deploy/bunny-worker-src/bunny-edge-engine-entry.ts — the FULL decko render
// engine deployed as a Bunny Edge Scripting STANDALONE script.
//
// This is the engine counterpart of bunny-edge-entry.ts (the lightweight
// reader that was the live release before this entry). Same platform
// contract, read out of the same sources (see that file's header for the
// citations):
//
//   import * as BunnySDK from "@bunny.net/edgescript-sdk";
//   BunnySDK.net.http.serve(async (request: Request) => new Response("hi"));
//
// The handler receives ONLY a Request (no env argument); secrets arrive as
// environment globals read via process.env.
//
// WHAT MAKES THIS "THE FULL ENGINE" (vs the reader in bunny-worker.ts):
//   - RenderEngine + FetchEngine (src/card/render.ts + src/card/fetch.ts) —
//     the same objects worker.ts boots on Cloudflare Workers, with the same
//     SUPPORTED_VIEWS URL dispatch (parsePath, imported from worker.ts so
//     the two entries cannot drift) and the same full layout shell
//     (layoutPage, likewise imported).
//   - The database seam is BunnyDbDriver
//     (src/card/drivers/bunny-db.ts): Hrana v2 over plain fetch against the
//     Bunny Database /v2/pipeline endpoint — no npm client, no node builtins
//     in the driver itself.
//   - Read-only: the write surface (sign-in, /setup, card writes) is NOT
//     armed. Non-GET/HEAD verbs answer 403, matching the Cloudflare worker's
//     behavior with both DECKO_WRITE_PATH and DECKO_FIRST_RUN unset.
//
// RUNTIME FACTS THIS ENTRY DEPENDS ON (verified empirically on script 93646
// unless cited):
//   - The live reader bundle already imports node:process and runs — the
//     Bunny runtime resolves node: imports (deploy/bunny-edge-trial-runbook.md
//     section 5 cites the docs for env-via-process.env).
//   - The bundled graph retains exactly these node: imports, each with a
//     stated dependency: node:crypto (request-time randomBytes in
//     src/card/render/slot-html.ts — must WORK per render), node:fs +
//     node:url (module-load resolution only; the reads in
//     src/card/render/bootstrap-code-files.ts are lazy + memoized and fire
//     only when rendering the bootstrap SCSS cards), node:net + node:tls
//     (module-load resolution only; the SMTP transport is write-path only
//     and is never constructed on this read-only edge).
//
// ROUTES (the worker.ts surface, plus the reader's /_status health route):
//   GET /                  -> render "Home" :open in the full layout shell
//   GET /<name>            -> render <name> :open
//   GET /<name>/<view>     -> render <name> <view> (worker.ts SUPPORTED_VIEWS)
//   GET /_status           -> JSON health (db_ok, card_count, env var NAMES)
//   GET /api/status        -> JSON health (worker.ts shape)
//   GET /api/card/<name>   -> JSON metadata (worker.ts shape)
//   anything else          -> 404 (layout shell); non-GET/HEAD -> 403

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import process from "node:process";

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { layoutPage, parsePath } from "../../worker.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the reader's WorkerEnv. */
type EdgeEnv = Record<string, string | undefined>;

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

function resolveDbConfig(env: EdgeEnv): ResolvedDbConfig | { error: string } {
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

function bootDeck(config: ResolvedDbConfig): Deck {
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
  return { fetcher, render };
}

function getDeck(config: ResolvedDbConfig): Promise<Deck> {
  if (deckPromise === undefined) {
    deckPromise = Promise.resolve(bootDeck(config));
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
  const parsed = parsePath(url.pathname, url.searchParams);

  if ("kind" in parsed) {
    if (parsed.kind === "notFound") {
      return html(
        404,
        layoutPage(
          "Not found",
          "<h1>Not found</h1><p class='muted'>Try <a href='/'>the home page</a> or render a card by name, e.g. <code>/Hello+World</code>.</p>",
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
      const name = decodeURIComponent(url.pathname.slice("/api/card/".length));
      const deck = await getDeck(config);
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
    const deck = await getDeck(config);
    const htmlBody = await deck.render.render(parsed.name, parsed.view, parsed.params ?? {});
    return html(200, layoutPage(`${parsed.name} (${parsed.view})`, htmlBody));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isUnsupportedView = message.startsWith("view (");
    const status = isUnsupportedView ? 422 : 500;
    return html(
      status,
      layoutPage(
        "Error",
        `<h1>${isUnsupportedView ? "Unsupported view" : "Render error"}</h1><pre>${message}</pre>`,
      ),
    );
  }
}

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  const env = process.env as EdgeEnv;

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
});
