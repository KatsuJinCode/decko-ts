// Repro + regression for the staging-1197219 crash:
// DECKO_STORAGE_ZONE + DECKO_STORAGE_HOST + DECKO_STORAGE_PASSWORD all set on
// the edge script made EVERY canonical page answer 500 with a zero-byte body
// and no Server-Timing (receipts in tmp/promotion-fired-2026-10-20/), while
// the same code WITHOUT the config served every page 200. Driven against the
// in-process edge handler (deploy/bunny-worker-src/bunny-edge-engine-handler.ts),
// the same module the deployed bundle imports.
//
// WHY THIS REGRESSION EXISTS — the crash was NOT reproducible on the localhost
// harness (Node + the same handler module): the receipt documents that
// explicitly. The bug is a localhost-vs-edge divergence in the Bunny
// Deno-based runtime's throw-handling path. The local repro therefore cannot
// observe the 500 itself, but it can pin the CONTRACT this fix installs:
// a missing, empty-valued, OR malformed files config MUST degrade to "uploads
// fail with the engine's named rejection" (the upload-500 error boundary at
// cloudflare-write-routes.ts:532-539, lineage commit 53cfa84b) — it MUST NOT
// break pages that do not touch files.
//
// The earlier implementation threw on a half-configured pair and let the
// throw escape the per-request handler; the new contract returns undefined
// and reports the warning, so the page render path is never on the hook for
// a broken attachment driver.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

const CREDENTIAL_ENV = {
  BUNNY_DATABASE_URL: "https://fixture-db.lite.bunnydb.net",
  BUNNY_DATABASE_AUTH_TOKEN: "fixture-token",
};

/** Storage driver requests we expect NEVER to fire on a read-page request.
 *  If the read path ever reaches the storage driver, the records below
 *  will surface it — so the test fails loud rather than silently passing. */
interface StorageCallRecord { method: string; url: string; accessKeyPresent: boolean }
const storageCalls: StorageCallRecord[] = [];

function makeBunnyFetchStub(driver: LocalSqliteDriver): typeof fetch {
  const encodeCell = (value: unknown): Record<string, unknown> => {
    if (value === null || value === undefined) return { type: "null" };
    if (typeof value === "number") {
      return Number.isInteger(value)
        ? { type: "integer", value: String(value) }
        : { type: "float", value };
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
      const args = (request.stmt.args ?? []).map((arg) => {
        if (arg.type === "null") return null;
        if (arg.type === "integer") return Number(arg.value);
        if (arg.type === "float") return arg.value;
        return arg.value;
      });
      const result = await driver.query<Record<string, unknown>>(request.stmt.sql, args);
      const cols: string[] = [];
      for (const row of result.rows) {
        for (const key of Object.keys(row)) {
          if (!cols.includes(key)) cols.push(key);
        }
      }
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

function installStorageRecordingFetch(): typeof fetch {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (urlString.includes("storage.bunnycdn.com") || urlString.includes("127.0.0.1:") || urlString.startsWith("http://storage.")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      storageCalls.push({
        method: String(init?.method ?? "GET"),
        url: urlString,
        accessKeyPresent: typeof headers.AccessKey === "string",
      });
      if (urlString.endsWith("/")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("", { status: 404 });
    }
    return originalFetch(input as never, init);
  }) as typeof fetch;
  return originalFetch;
}

let driver: LocalSqliteDriver | undefined;
let handler: (request: Request, env: Record<string, string | undefined>) => Promise<Response>;
let originalFetch: typeof fetch | undefined;

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    const sql = readFileSync(file, "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await driver.query(statement, []);
    }
  }
  const T = "2026-09-20 00:00:00.000";
  const insert = (values: string): string =>
    `INSERT OR IGNORE INTO cards (\n` +
    `  id, name, key, codename, left_id, right_id, current_revision_id,\n` +
    `  created_at, updated_at, creator_id, updater_id,\n` +
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content\n` +
    `) VALUES (\n${values}\n)`;
  for (const statement of [
    insert(`22747, '*layout', '*layout', 'layout', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 8, NULL`),
    insert(`22748, NULL, NULL, NULL, 25, 22747, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, 'Default Layout'`),
    insert(`22749, 'Default Layout', 'default_layout', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 22756, '<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>'`),
    insert(`22750, '*header', '*header', 'header', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, '<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>'`),
    insert(`22751, '*footer', '*footer', 'footer', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, '<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>'`),
    insert(`22752, '*title', '*title', 'title', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, 'Test Site'`),
    insert(`22753, '*favicon', '*favicon', 'favicon', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, '(my_bucket)/103/3649.jpg'`),
    insert(`22756, 'Html', 'html', 'html', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, NULL`),
    insert(`22757, 'Basic', 'basic', 'basic', NULL, NULL, NULL, '${T}', '${T}', 1, 1, '*all', 30, NULL, 0, 3, NULL`),
  ]) {
    await driver.query(statement, []);
  }
  globalThis.fetch = makeBunnyFetchStub(driver!);
  originalFetch = installStorageRecordingFetch();
  const module = await import("../../deploy/bunny-worker-src/bunny-edge-engine-handler.js");
  handler = module.handleBunnyEngineRequest;
});

afterAll(() => {
  driver?.close();
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
});

function get(path: string, env: Record<string, string | undefined>): Promise<Response> {
  return handler(new Request(`https://decko-edge.test${path}`), env as Record<string, string | undefined>);
}

describe("Bunny edge: files-area config crash repro + regression (2026-10-19 staging 1197219)", () => {
  it("baseline — no DECKO_STORAGE_* at all: pages serve 200 (the 1196260 baseline's answer)", async () => {
    storageCalls.length = 0;
    const response = await get("/", CREDENTIAL_ENV);
    expect(response.status).toBe(200);
    expect(storageCalls, "no storage fetch expected on the read path without storage config").toEqual([]);
  });

  it("the 1197219 config (real zone + host + password): every read page still 200 with a body", async () => {
    storageCalls.length = 0;
    const env = {
      ...CREDENTIAL_ENV,
      DECKO_WRITE_PATH: "1",
      DECKO_STORAGE_ZONE: "culturesmith-b-edge-files",
      DECKO_STORAGE_HOST: "storage.bunnycdn.com",
      DECKO_STORAGE_PASSWORD: "fixture-password",
    };
    // The four canonical read pages from the receipt: the first three are
    // single-card renders (Home, About, Basic — the demo seed). The fourth
    // is the read-only /api/card/<name> JSON surface the receipt probes with.
    for (const path of ["/", "/About", "/Basic", "/api/card/About"]) {
      const response = await get(path, env);
      expect(response.status, `path ${path} must not 500 with zero-byte body`).toBe(200);
      const body = await response.text();
      expect(body.length, `path ${path} body must not be zero-byte`).toBeGreaterThan(0);
    }
    expect(storageCalls, "read path must not reach the storage driver; stray calls were: " + JSON.stringify(storageCalls)).toEqual([]);
  });

  it("half-configured pair — zone empty + password present (the 1197186 first-arm state): the handler MUST NOT throw; pages serve 200 with a body", async () => {
    storageCalls.length = 0;
    const env = {
      ...CREDENTIAL_ENV,
      DECKO_WRITE_PATH: "1",
      DECKO_STORAGE_ZONE: "",
      DECKO_STORAGE_HOST: "",
      DECKO_STORAGE_PASSWORD: "fixture-password",
    };
    // The pre-fix code threw here and let the exception escape the per-request
    // handler. On the Bunny Deno-based runtime that throw returned 500 with a
    // zero-byte body on every page (release 1197219 had a similar
    // localhost-vs-edge divergence from a related path; the 1197186 probe was
    // blocked at sign-in so the symptom was not recorded there). The fix
    // degrades to undefined and reports the warning; pages must be 200 with
    // a non-empty body.
    let response: Response | undefined;
    let caughtError: unknown;
    try {
      response = await get("/", env);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError, "the per-request handler MUST NOT throw on a half-configured files area").toBeUndefined();
    expect(response?.status).toBe(200);
    const body = await response?.text() ?? "";
    expect(body.length, "body must not be zero-byte").toBeGreaterThan(0);
    expect(storageCalls, "half-configured driver must not reach the storage driver; stray calls were: " + JSON.stringify(storageCalls)).toEqual([]);
  });

  it("half-configured pair — zone present + password empty: also degrades, never throws", async () => {
    storageCalls.length = 0;
    const env = {
      ...CREDENTIAL_ENV,
      DECKO_WRITE_PATH: "1",
      DECKO_STORAGE_ZONE: "culturesmith-b-edge-files",
      DECKO_STORAGE_HOST: "storage.bunnycdn.com",
      DECKO_STORAGE_PASSWORD: "",
    };
    let response: Response | undefined;
    let caughtError: unknown;
    try {
      response = await get("/", env);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError, "the per-request handler MUST NOT throw on a half-configured files area").toBeUndefined();
    expect(response?.status).toBe(200);
    expect(storageCalls, "half-configured driver must not reach the storage driver").toEqual([]);
  });

  it("whitespace-only values degrade the same way (a malformed zone name is a typo, not a page-path crash)", async () => {
    storageCalls.length = 0;
    const env = {
      ...CREDENTIAL_ENV,
      DECKO_WRITE_PATH: "1",
      DECKO_STORAGE_ZONE: "   ",
      DECKO_STORAGE_HOST: "storage.bunnycdn.com",
      DECKO_STORAGE_PASSWORD: "fixture-password",
    };
    let response: Response | undefined;
    let caughtError: unknown;
    try {
      response = await get("/", env);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError, "the per-request handler MUST NOT throw on a malformed zone name").toBeUndefined();
    expect(response?.status).toBe(200);
    expect(storageCalls, "no stray fetches").toEqual([]);
  });
});