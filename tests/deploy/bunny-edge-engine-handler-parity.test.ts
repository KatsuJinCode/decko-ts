// Third-twin parity — the Bunny Edge full-engine handler
// (deploy/bunny-worker-src/bunny-edge-engine-handler.ts) driven IN-PROCESS.
// The entry (bunny-edge-engine-entry.ts) calls BunnySDK.net.http.serve at
// module scope with an edge-runtime-only SDK that is not installed here, so
// before the handler was extracted from the entry this surface had ZERO test
// coverage; the inflection-boot pin could only read its source (see that
// file's stated constraint).
//
// The DB seam needs no production change: BunnyDbDriver speaks Hrana v2
// over plain fetch (src/card/drivers/bunny-db.ts), so the test stubs
// globalThis.fetch with a translator over the SAME local fixture the
// sibling worker tests use (0001-schema + demo seed) and the REAL driver
// runs against it. globalThis.fetch is bound at driver CONSTRUCTION
// (fetch.bind(globalThis), bunny-db.ts), and the handler boots its deck on
// the first request — so the stub must be installed before the first
// request, which beforeAll guarantees.
//
// Ruby truth under test (same cites as the twin parity suites):
//   - card 1.110.0 lib/card/error.rb:21 Card::Error base status_code = 422
//     (UserError inherits; :88-89 NotFound 404; :46-51 ServerError 500)
//   - src/card/name/errors.ts the mark errors are the NotFound family
//   - the shared surface: src/server/worker-shared-surface.ts mapRenderError
//     is what BOTH Cloudflare twins answer with; the third twin must not
//     drift (it shared root's catch shape and carried the same missing-404
//     defect since fixed everywhere else).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

const CREDENTIAL_ENV = {
  BUNNY_DATABASE_URL: "https://fixture-db.lite.bunnydb.net",
  BUNNY_DATABASE_AUTH_TOKEN: "fixture-token",
};

/** The same env PLUS the production deployment's served deltas, in the
 *  loose-variable form an operator would paste.
 *  This suite drives the REAL handler through the REAL boot, so it is the
 *  end-to-end proof that the deltas reach the served bytes from the
 *  environment alone — no test-only injection. */
const CONFIGURED_ENV = {
  ...CREDENTIAL_ENV,
  DECKO_SERVED_DELTAS: JSON.stringify(CONFIGURED_DECK_SERVED_DELTAS),
};

/** Translate BunnyDbDriver's Hrana-v2 pipeline POSTs into local sqlite
 *  queries and encode the results back in the wire shape the driver
 *  decodes (bunny-db.ts: request {requests:[{type:"execute",stmt:{sql,
 *  args,want_rows}},...,{type:"close"}]}, response {results:[{type:"ok",
 *  response:{type:"execute",result:{cols,rows}}}]}, cells tagged
 *  {type:"null"|"integer"|"float"|"text", value}). */
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
  // The page shell's rows: the wired serving path is the engine's OWN page
  // assembly (renderPageBytes — the per-card *layout rule, the
  // *header/*footer nests, the html_page head), whose layout machinery
  // resolves exactly these rows. The demo seed predates the page path:
  // without them the code-default-layout interior raises on the first
  // codename-mark nest (CodenameNotFoundError: header — the recorded
  // boundary: body-mark parses in format.ts resolveNestName are outside the
  // head-guard's scope), and Ruby answers an error page for such a deck the
  // same way (wrap_and_render -> rescue_view). The row set mirrors
  // tests/deploy/bunny-edge-engine-request-error-mapping.test.ts seedShellHeadDeck (the page-head
  // codename cards, *all+*layout -> Default Layout with a body, *header,
  // *footer) over the demo schema.
  const T = "2026-09-20 00:00:00.000";
  const insert = (values: string): string =>
    `INSERT OR IGNORE INTO cards (\n` +
    `  id, name, key, codename, left_id, right_id, current_revision_id,\n` +
    `  created_at, updated_at, creator_id, updater_id,\n` +
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content\n` +
    `) VALUES (\n${values}\n)`;
  for (const statement of [
    insert(`22746, '*all', '*all', 'all', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22747, '*layout', '*layout', 'layout', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22748, NULL, NULL, NULL, 22746, 22747, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, 'Default Layout'`),
    insert(`22749, 'Default Layout', 'default_layout', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 22756, '<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>'`),
    insert(`22750, '*header', '*header', 'header', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>'`),
    insert(`22751, '*footer', '*footer', 'footer', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>'`),
    insert(`22752, '*title', '*title', 'title', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, 'Test Site'`),
    insert(`22753, '*favicon', '*favicon', 'favicon', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '(my_bucket)/103/3649.jpg'`),
    insert(`22754, '*ace', '*ace', 'ace', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '{}'`),
    insert(`22755, '*tiny_mce', '*tiny_mce', 'tiny_mce', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '{}'`),
    insert(`22756, 'Html', 'html', 'html', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22757, 'Basic', 'basic', 'basic', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
  ]) {
    await driver.query(statement, []);
  }
  // The stub must exist BEFORE the first request boots the deck: the
  // driver binds globalThis.fetch at construction.
  globalThis.fetch = makeBunnyFetchStub(driver!);
  const module = await import("../../deploy/bunny-worker-src/bunny-edge-engine-handler.js");
  handler = module.handleBunnyEngineRequest;
});

afterAll(() => {
  driver?.close();
});

function get(path: string, env: Record<string, string> = CREDENTIAL_ENV): Promise<Response> {
  return handler(new Request(`https://decko-edge.test${path}`), env);
}

describe("bunny edge engine handler — the shared read surface", () => {
  it("GET / boots the engine over the stubbed seam and renders Home", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Welcome to the decko-ts synthetic demo deck");
  });

  it("GET /:mark/:view renders the path view verbatim (root parsePath is the shared grammar)", async () => {
    const response = await get("/About/closed");
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("only synthetic demo content");
  });

  it("a missing card answers 404 the minimal not_found stub on an UNCONFIGURED deployment", async () => {
    // THE UNCONFIGURED CASE, and the regression
    // guard for the defect itself: with no deltas in the environment the
    // builder has no layout-rule anchors to resolve this deck's Default
    // Layout with, so its documented fallback answers — and no other deck's
    // card id, private asset URL or version pin reaches it.
    //
    // This runs FIRST in the suite on purpose. The handler memoizes ONE deck
    // per isolate (`deckPromise` in bunny-edge-engine-handler.ts), and the
    // boot reads the environment once — so the first boot fixes the
    // configuration for every later request in this process. That is the
    // production contract, not a test artifact: one isolate, one
    // configuration. The CONFIGURED counterpart therefore has to run in its
    // own file (bunny-edge-handler-configured-parity.test.ts), which is a
    // separate isolate.
    const response = await get("/No+Such+Card");
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("<h1>Card not found</h1>");
    expect(body).not.toContain("22281");
    expect(body).not.toContain("basic_c");
    expect(body).not.toContain("production-storage");
    expect(body).not.toContain("Decko v0.0.0-synthetic");
  });

  it("an unregistered view answers the 422 UserError shape (error.rb:21)", async () => {
    const response = await get("/Home/nonsense");
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("<h1>Unsupported view</h1>");
  });

  it("an id mark resolves through the primed name environment (the boot prime the entry lacked)", async () => {
    const response = await get("/~10");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Welcome to the decko-ts synthetic demo deck");
  });

  it("a codename mark resolves through the primed codehash", async () => {
    const response = await get("/:search_type");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-card-name="Search"');
  });

  it("an id mark for a card that does not exist answers 404 Card not found (NotFound family, the twins' /~999999 pin on the third twin)", async () => {
    const response = await get("/~999999");
    expect(response.status).toBe(404);
    const body = await response.text();
    // The 404 answer is the not_found surface (the full chrome when the
    // deck carries a Default Layout, the builder's minimal stub otherwise —
    // this fixture has both states across its cards). The invariant is the
    // STATUS (the NotFound family, error.rb:88-89 — the shared
    // mapRenderError classification) and the requested mark reaching the
    // answer; the bare <h1>Card not found</h1> byte this pin used to hold
    // belonged to the older bare surface.
    expect(body).toContain("999999");
  });

  it("?view= fills the view-less arm (rest.rb:100-103)", async () => {
    const response = await get("/About?view=closed");
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("only synthetic demo content");
  });

  it("non-GET/HEAD stays 403 (read-only edge)", async () => {
    const response = await handler(
      new Request("https://decko-edge.test/Home", { method: "POST" }),
      CREDENTIAL_ENV,
    );
    expect(response.status).toBe(403);
  });

  it("/_status reports health through the stubbed seam", async () => {
    const response = await get("/_status");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean; database?: { card_count?: number } };
    expect(body.ok).toBe(true);
    expect(body.database?.card_count).toBeGreaterThan(0);
  });

  it("a read-denied card 403s on /api/card instead of serving db_content (permissions.rb:139-146)", async () => {
    // The denial fixture (mirror of tests/deploy/deploy-worker-miniflare.test.ts).
    // The shared base rows (*read/*all/Set/*self) are
    // INSERT OR IGNORE — the page-shell fixture above now seeds *all, and
    // the rule machinery needs one canonical row per name/key/codename:
    // codename carriers, a probe card, its *self set, a *read rule granting
    // NOBODY (no card_references rows).
    const T = "2026-09-20 00:00:00.000";
    const insert = (values: string): string =>
      `INSERT OR IGNORE INTO cards (\n` +
      `  id, name, key, codename, left_id, right_id, current_revision_id,\n` +
      `  created_at, updated_at, creator_id, updater_id,\n` +
      `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content\n` +
      `) VALUES (\n${values}\n)`;
    for (const statement of [
      insert(`9001, '*read', 'read', 'read', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
      insert(`9002, '*all', 'all', 'all', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
      insert(`9003, 'Set', 'set', 'set', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
      insert(`9004, '*self', 'self', 'self', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
      insert(`9010, 'Probe Restricted', 'probe_restricted', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 5, 'Restricted secret body'`),
      insert(`9011, NULL, NULL, NULL, 9010, 9004, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 9003, NULL`),
      insert(`9012, NULL, NULL, NULL, 9011, 9001, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 5, NULL`),
      `UPDATE cards SET read_rule_id = 9012, read_rule_class = 'R' WHERE id = 9010`,
    ]) {
      await driver!.query(statement, []);
    }
    const response = await get("/api/card/Probe%20Restricted");
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string; name?: string };
    expect(body).toMatchObject({ error: "permission denied", name: "Probe Restricted" });
    expect(JSON.stringify(body)).not.toContain("Restricted secret body");
  });

  it("a malformed-% name on /api/card refuses SAFELY (root's arm shape: shared decodeName -> 400, never an unhandled throw)", async () => {
    // The twins' shared-surface rule (worker-shared-surface.ts decodeName):
    // decodeURIComponent must never escape the handler — root answers
    // 400 {"error":"empty card name"}; the third twin must not throw
    // unhandled where the twins refuse safely (the divergence is the
    // STATUS, never an escaped throw).
    const response = await get("/api/card/%zz");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body).toMatchObject({ error: "empty card name" });
  });
});
