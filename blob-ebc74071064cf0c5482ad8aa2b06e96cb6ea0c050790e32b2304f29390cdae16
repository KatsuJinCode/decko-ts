// THE FRESH-ISOLATE ORIGIN: with DECKO_DECK_ORIGIN set, the FIRST page a
// fresh process renders must carry the configured origin in decko.rootUrl —
// not Ruby's requestless '/' — and so must every page after it.
//
// WHY THIS IS A FILE OF ITS OWN. The handler memoizes one deck per isolate
// (deckPromise in bunny-edge-engine-handler.ts) and the boot reads the
// environment exactly once, so the FIRST request in a process is the one that
// exercises boot order. On Bunny most requests land on a fresh isolate, so
// "the first page" is the common case, not a rare one. vitest's `forks` pool
// gives each file its own process; nothing in this file runs in the same
// isolate as a configured-parity suite.
//
// WHAT IT PROVES, with no test-only injection: the only configuration
// channel is the environment bag the credentials come from
// (DECKO_DECK_ORIGIN — the deck's own Cardio.config.deck_origin, one of the
// loose served-variable spellings), and the handler's own request path —
// whichever arm serves the page — installs it before any page bytes are
// rendered. The anonymous GET page arm takes the request-local live render
// (src/card/live/live-render.ts), which boots its own engines over the
// request store rather than the isolate's deck; that boot must configure the
// origin too, or the first page of every fresh isolate prints '/'.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

const DECK_ORIGIN = "https://deck-origin.example";
const CREDENTIAL_ENV = {
  BUNNY_DATABASE_URL: "https://fixture-db.lite.bunnydb.net",
  BUNNY_DATABASE_AUTH_TOKEN: "fixture-token",
};
const CONFIGURED_ENV = { ...CREDENTIAL_ENV, DECKO_DECK_ORIGIN: DECK_ORIGIN };

/** Translate BunnyDbDriver's Hrana-v2 pipeline POSTs into local sqlite
 *  queries and encode the results back in the wire shape the driver
 *  decodes (the stub bunny-edge-engine-handler-parity.test.ts drives; its
 *  header carries the full encoding contract). */
function makeBunnyFetchStub(driver: LocalSqliteDriver): typeof fetch {
  const encodeCell = (value: unknown): Record<string, unknown> => {
    if (value === null || value === undefined) return { type: "null" };
    if (typeof value === "number") {
      return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
    }
    return { type: "text", value: String(value) };
  };
  return (async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      requests: Array<
        | { type: "execute"; stmt: { sql: string; args: Array<Record<string, unknown>> } }
        | { type: "close" }
      >;
    };
    const results = [];
    for (const request of body.requests ?? []) {
      if (request.type !== "execute") {
        results.push({ type: "ok", response: { type: "close" } });
        continue;
      }
      const result = await driver.query<Record<string, unknown>>(
        request.stmt.sql,
        request.stmt.args.map((a) => a.value),
      );
      const cols = Object.keys(result.rows[0] ?? {});
      results.push({
        type: "ok",
        response: {
          type: "execute",
          result: {
            cols: cols.map((name) => ({ name })),
            rows: result.rows.map((row) => cols.map((col) => encodeCell(row[col]))),
            affected_row_count: 0,
          },
        },
      });
    }
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

let driver: LocalSqliteDriver | undefined;
let handler: (request: Request, env: Record<string, string | undefined>) => Promise<Response>;

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    const sql = readFileSync(file, "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await driver.query(statement, []);
    }
  }
  // The seed deck's stock read substrate and the page shell's rows, as
  // bunny-edge-engine-handler-parity.test.ts lays them down: without them the
  // page path has no *all+*layout rule to render through.
  const SEED_ALL_ID = 25;
  const SEED_CATCH_ALL_READ_RULE_ID = 30;
  const SEED_SETTING_TYPE_ID = 8;
  const T = "2026-09-20 00:00:00.000";
  const insert = (values: string): string =>
    `INSERT OR IGNORE INTO cards (\n` +
    `  id, name, key, codename, left_id, right_id, current_revision_id,\n` +
    `  created_at, updated_at, creator_id, updater_id,\n` +
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content\n` +
    `) VALUES (\n${values}\n)`;
  for (const statement of [
    insert(`22747, '*layout', '*layout', 'layout', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, ${SEED_SETTING_TYPE_ID}, NULL`),
    insert(`22748, NULL, NULL, NULL, ${SEED_ALL_ID}, 22747, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 3, 'Default Layout'`),
    insert(`22749, 'Default Layout', 'default_layout', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 22756, '<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>'`),
    insert(`22750, '*header', '*header', 'header', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 3, '<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>'`),
    insert(`22751, '*footer', '*footer', 'footer', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 3, '<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>'`),
    insert(`22752, '*title', '*title', 'title', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 3, 'Test Site'`),
    insert(`22753, '*favicon', '*favicon', 'favicon', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 3, '(my_bucket)/103/3649.jpg'`),
    insert(`22756, 'Html', 'html', 'html', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', ${SEED_CATCH_ALL_READ_RULE_ID}, NULL, 0, 3, NULL`),
  ]) {
    await driver!.query(statement, []);
  }
  // The stub must exist BEFORE the first request boots the deck: the driver
  // binds globalThis.fetch at construction.
  globalThis.fetch = makeBunnyFetchStub(driver!);
  const module = await import("../../deploy/bunny-worker-src/bunny-edge-engine-handler.js");
  handler = module.handleBunnyEngineRequest;
});

function get(path: string): Promise<Response> {
  return handler(new Request(`https://decko-edge.test${path}`), CONFIGURED_ENV);
}

async function rootUrlOf(path: string): Promise<string | null> {
  const response = await get(path);
  expect(response.status).toBe(200);
  const html = await response.text();
  const match = /decko\.rootUrl='([^']*)';/.exec(html);
  return match?.[1] ?? null;
}

describe("a fresh isolate's FIRST page uses the configured deck origin", () => {
  it("prints the configured origin on the anonymous GET page (the live-render arm)", async () => {
    expect(await rootUrlOf("/")).toBe(`${DECK_ORIGIN}/`);
  });

  it("keeps printing it on every later page of the same isolate", async () => {
    expect(await rootUrlOf("/About")).toBe(`${DECK_ORIGIN}/`);
    expect(await rootUrlOf("/About?view=core")).toBe(`${DECK_ORIGIN}/`);
    expect(await rootUrlOf("/About/core")).toBe(`${DECK_ORIGIN}/`);
  });

  it("prints it on the non-live page arm too (the isolate's deck boot)", async () => {
    // A history view is not served by the live arm, so it rides the isolate's
    // memoized deck — the boot-order channel the origin was configured
    // through before the live arm existed.
    expect(await rootUrlOf("/?view=history")).toBe(`${DECK_ORIGIN}/`);
  });
});