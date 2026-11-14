// The root Worker entry's error page — reflected
// script injection. An engine error MESSAGE embeds the raw request verbatim
// (UnsupportedViewError's text is "view (X) not supported for Y" —
// src/card/render/format.ts — and X is whatever rode the ?view= query), so
// the error page's <pre> interpolation must entity-escape it. Before the fix
// GET /Home?view=<img src=x onerror=alert(1)> answered 422 with the payload
// as live markup; after it the same bytes land as inert text.
//
// The escape is the deploy entry's errorPage behavior (deploy/worker.ts,
// escapeHtml at the emitter) applied to the root entry's catch — every
// interpolated error/title slot on the page is covered.
//
// Harness: the SHIPPED worker.ts module (the file wrangler.toml `main`
// points at) driven through the same in-process D1-shaped shim the
// twin-parity suite uses (tests/deploy/worker-twins-shared-surface-parity.test.ts).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import type {
  D1BindValue,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "../../src/server/drivers/d1.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

/** The D1 binding the worker duck-types, backed by the local sqlite driver
 *  (verbatim from the twin-parity suite). */
function d1Shim(driver: LocalSqliteDriver): D1DatabaseLike {
  const run = async (sql: string, params: D1BindValue[]): Promise<D1ResultLike> => {
    const result = await driver.query(sql, params as unknown[]);
    return {
      success: true,
      results: result.rows as Record<string, unknown>[],
      meta: { changes: 0, rows_read: result.rowsRead, rows_written: 0 },
    };
  };
  return {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: D1BindValue[] = [];
      const statement = {
        bind(...values: D1BindValue[]) {
          bound = values;
          return statement;
        },
        all: () => run(sql, bound),
        run: () => run(sql, bound),
      };
      return statement as unknown as D1PreparedStatementLike;
    },
    batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
      return Promise.all(
        statements.map((statement) =>
          (statement as unknown as { all: () => Promise<D1ResultLike> }).all(),
        ),
      );
    },
  };
}

const PAYLOAD = `<img src=x onerror=alert(1)>`;
const ESCAPED_PAYLOAD = `&lt;img src=x onerror=alert(1)&gt;`;

let driver: LocalSqliteDriver | undefined;
let rootWorker: { fetch: (request: Request, env: unknown) => Promise<Response> };

async function getRoot(path: string): Promise<Response> {
  return rootWorker.fetch(new Request(`https://root.test${path}`), {
    DB: d1Shim(driver!),
  });
}

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    const sql = readFileSync(file, "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await driver.query(statement, []);
    }
  }
  const rootModule = await import("../../worker.js");
  rootWorker = (rootModule.default ?? rootModule) as unknown as {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  };
}, 60_000);

afterAll(() => {
  driver?.close();
});

describe("root worker error pages entity-escape engine error text", () => {
  it("an unknown view with script markup answers 422 with the payload INERT, not executable", async () => {
    const response = await getRoot(`/Home?view=${encodeURIComponent(PAYLOAD)}`);
    // the UserError shape is unchanged (error.rb:21, the parity suite's pin)
    expect(response.status).toBe(422);
    const html = await response.text();
    // the attempted payload lands as escaped text ...
    expect(html).toContain(ESCAPED_PAYLOAD);
    // ... and no raw tag from it survives into the page
    expect(html).not.toContain("<img");
  });

  it("a missing card whose NAME carries script markup answers 404 escaped the same way", async () => {
    // The 404 arm interpolates the same message (card not found: <name>) —
    // the same sink, exercised through the other branch of mapRenderError.
    const response = await getRoot(`/${encodeURIComponent(`No${PAYLOAD}Card`)}`);
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain(ESCAPED_PAYLOAD);
    expect(html).not.toContain("<img");
  });
});
