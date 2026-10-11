// The CONFIGURED half of the edge handler's deck identity, in its own
// isolate.
//
// WHY A SEPARATE FILE. The handler memoizes ONE deck per isolate
// (`deckPromise` in bunny-edge-engine-handler.ts) and the boot reads the
// environment exactly once, so the first request in a process fixes that
// isolate's configuration for good. That is the production contract — one
// isolate, one configuration — not a test artifact, and it means a single
// suite cannot exercise both the configured and the unconfigured deployment.
// The unconfigured counterpart is
// bunny-edge-engine-handler-parity.test.ts; vitest's `forks` pool gives each
// FILE its own process, so the two configurations never share an isolate.
//
// WHAT THIS PROVES, end to end and with no test-only injection: the served
// deltas reach the served bytes from the ENVIRONMENT ALONE. The env carries
// `DECKO_SERVED_DELTAS` as one JSON blob — exactly the paste an operator
// makes (deploy/bunny-edge-trial-runbook.md section 3b) — and the handler's
// real boot reads it, hangs it on the Deck, and the page/error paths serve
// that deck's chrome.
//
// The deck here is the deploy seed plus the page-shell rows, with layout-rule
// anchors 274/255 so the CONFIGURED anchors in the deltas resolve it (the
// production deck's own anchor ids). That is the shape the configured error
// chrome needs; the unconfigured suite's identical seed has no anchors it
// could look up, which is exactly why it falls back to the minimal stub.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { PRODUCTION_DECK_SERVED_DELTAS } from "./fixtures/production-deck-served-deltas.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

const CREDENTIAL_ENV = {
  BUNNY_DATABASE_URL: "https://fixture-db.lite.bunnydb.net",
  BUNNY_DATABASE_AUTH_TOKEN: "fixture-token",
};

/** The one-paste form an operator uses: the whole delta set as one JSON
 *  blob. If the handler could not read this, every case below would see the
 *  stock (empty) deltas and fall back to the minimal stub. */
const CONFIGURED_ENV = {
  ...CREDENTIAL_ENV,
  DECKO_SERVED_DELTAS: JSON.stringify(PRODUCTION_DECK_SERVED_DELTAS),
};

/** Translate BunnyDbDriver's Hrana-v2 pipeline POSTs into local sqlite
 *  queries and encode the results back in the wire shape the driver
 *  decodes — the same stub bunny-edge-engine-handler-parity.test.ts drives
 *  (that file's header carries the full encoding contract). */
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
  // The page shell's rows over the deploy seed, with the CONFIGURED layout
  // anchors (274 = *all, 255 = *layout — the production deck's own ids, the
  // ones the deltas configure) so the error chrome can resolve this deck's
  // Default Layout through its configured rule anchors.
  const T = "2026-09-20 00:00:00.000";
  const insert = (values: string): string =>
    `INSERT OR IGNORE INTO cards (\n` +
    `  id, name, key, codename, left_id, right_id, current_revision_id,\n` +
    `  created_at, updated_at, creator_id, updater_id,\n` +
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content\n` +
    `) VALUES (\n${values}\n)`;
  for (const statement of [
    insert(`274, '*all', '*all', 'all', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`255, '*layout', '*layout', 'layout', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22748, NULL, NULL, NULL, 274, 255, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, 'Default Layout'`),
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
  // The stub must exist BEFORE the first request boots the deck: the driver
  // binds globalThis.fetch at construction.
  globalThis.fetch = makeBunnyFetchStub(driver);
  const module = await import("../../deploy/bunny-worker-src/bunny-edge-engine-handler.js");
  handler = module.handleBunnyEngineRequest;
});

function get(path: string): Promise<Response> {
  return handler(new Request(`https://decko-edge.test${path}`), CONFIGURED_ENV);
}

describe("bunny edge engine handler — a CONFIGURED deployment serves its own deck identity", () => {
  it("a missing card answers 404 Decko's not_found page in the full chrome", async () => {
    // The pin bunny-edge-engine-handler-parity.test.ts carried before the
    // deltas became configuration. It passes only because the handler's real
    // boot read DECKO_SERVED_DELTAS out of the environment: with no
    // configuration the builder has no layout anchors and answers the
    // minimal stub instead (that file's counterpart case).
    const response = await get("/No+Such+Card");
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain(`      <!DOCTYPE HTML>\n      <html class="h-100">`);
    expect(body).toContain("<meta content='noindex' name='robots'>");
    expect(body).toContain("Could not find");
    expect(body).toContain("No+Such+Card");
    // AND the chrome carries THIS deck's configured identity: the not-found
    // type's class chip and type attrs, the configured footer version pin,
    // and the configured asset host.
    expect(body).toContain(`TYPE-basic_c`);
    expect(body).toContain(`data-card-type-id="72281"`);
    expect(body).toContain(`Decko v0.19.1`);
    expect(body).toContain(PRODUCTION_DECK_SERVED_DELTAS.assetHost!);
  });

  it("/_status reports the deployment's configured identity without leaking its values", async () => {
    const response = await get("/_status");
    expect(response.status).toBe(200);
    const status = (await response.json()) as {
      served_identity: { configured: boolean; configured_fields: string[] };
    };
    // The operator can confirm at a glance that their configuration landed…
    expect(status.served_identity.configured).toBe(true);
    expect(status.served_identity.configured_fields).toContain("footerVersionPin");
    expect(status.served_identity.configured_fields).toContain("notFoundType");
    // …and the report carries NAMES only: a configured value can be a
    // private URL, and /_status is exposed.
    const raw = JSON.stringify(status);
    expect(raw).not.toContain("production-storage");
    expect(raw).not.toContain("0.19.1");
  });
});