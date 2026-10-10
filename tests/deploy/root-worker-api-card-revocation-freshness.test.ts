// Review round 2, finding 2 — stale permission verdicts through the root
// Worker card API. The isolate retains ONE engine across requests (worker.ts
// getDeck's memoized boot promise) and RenderEngine memoizes the read-
// permission state plus per-card verdicts. The HTML render path guards that
// memo with the deck_data_version freshness gate (render.ts, the top of
// renderHeld: the stamp moves on every committed write and the derived
// caches reset). The /api/card route fetched and judged canReadCard through
// the SAME memo WITHOUT passing that gate, so a read rule revoked after the
// engine's last freshness check still served the protected content over JSON
// (reproduced before the fix: revocation answered 200 with the protected
// body through the API path while a freshly constructed engine refused).
//
// The regression mirrors the reproduction steps: grant Anyone -> read 200;
// revoke to a member-only party (the rule card's content AND its
// card_references party row — the committed party list the permission state
// reads, the freshness suite's scenario-4 commit shape) -> the next read
// must refuse. The deploy twin's record-JSON surface carries the same
// retained-engine seam and is pinned alongside.
//
// Harness: both SHIPPED worker modules driven through the same in-process
// D1-shaped shim the twin-parity suite uses.

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

/** The D1 binding both workers duck-type, backed by the local sqlite driver
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

const T = "2026-09-20 00:00:00.000";
const SECRET = "FRESHNESS PROBE SECRET BODY";
const PROBE_CARD_ID = 9210;
const RULE_CARD_ID = 9212;
const ROLE_A_ID = 9207;

/** The read-rule skeleton over the demo seed (ids mirror the freshness
 *  suite's shape, renumbered into the 92xx band the seed does not use):
 *  the codename carriers the permission statements' subselects need, the
 *  party cards, the probe card, its *self set, and the *read rule card
 *  whose content starts as [[Anyone]]. */
const SKELETON_STATEMENTS = [
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9201, '*read', 'read', 'read', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9202, '*all', 'all', 'all', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9203, 'Set', 'set', 'set', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9204, '*self', 'self', 'self', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9205, 'Anyone', 'anyone', 'anyone', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9206, 'Anonymous', 'anonymous', 'anonymous', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9207, 'Role A', 'role_a', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 5, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9210, 'Freshness Probe', 'freshness_probe', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 5, '${SECRET}')`,
  // the probe's *self set (junction row) and its *read rule card
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (9211, NULL, NULL, NULL, ${PROBE_CARD_ID}, 9204, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 9203, NULL)`,
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id,
     read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   VALUES (${RULE_CARD_ID}, NULL, NULL, NULL, 9211, 9201, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 5, '[[Anyone]]')`,
  // the rule's committed party list rides card_references (read-rules.ts,
  // the read_rule_cache.rb port) — [[Anyone]] -> the Anyone card
  `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
   VALUES (${RULE_CARD_ID}, 'anyone', 9205, 'L', NULL)`,
  `UPDATE cards SET read_rule_id = ${RULE_CARD_ID}, read_rule_class = 'R' WHERE id = ${PROBE_CARD_ID}`,
];

let driver: LocalSqliteDriver | undefined;
let rootWorker: { fetch: (request: Request, env: unknown) => Promise<Response> };
let deployWorker: { fetch: (request: Request, env: unknown) => Promise<Response> };

async function getRoot(path: string): Promise<Response> {
  return rootWorker.fetch(new Request(`https://root.test${path}`), {
    DB: d1Shim(driver!),
  });
}
async function getDeploy(path: string): Promise<Response> {
  return deployWorker.fetch(new Request(`https://deploy.test${path}`), {
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
  for (const statement of SKELETON_STATEMENTS) {
    await driver.query(statement, []);
  }
  const rootModule = await import("../../worker.js");
  rootWorker = (rootModule.default ?? rootModule) as unknown as {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  };
  const deployModule = await import("../../deploy/worker.js");
  deployWorker = (deployModule.default ?? deployModule) as unknown as {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  };
}, 60_000);

afterAll(() => {
  driver?.close();
});

describe("the card API honors a committed read-rule revocation on the retained engine", () => {
  it("while the rule grants Anyone the API serves the probe card (200)", async () => {
    const root = await getRoot("/api/card/Freshness%20Probe");
    expect(root.status).toBe(200);
    const rootBody = (await root.json()) as { db_content_preview?: string };
    expect(rootBody.db_content_preview).toContain(SECRET);

    // The same grant state on the deploy twin's record-JSON surface.
    const deploy = await getDeploy("/Freshness%20Probe.json");
    expect(deploy.status).toBe(200);
  });

  it("after the revocation commits, the next API read refuses (no stale 200, no leaked body)", async () => {
    // The revocation commit, in the freshness suite's scenario-4 shape: the
    // rule's content AND its party reference row (a content-only save would
    // not revoke — the permission state reads the card_references graph).
    await driver!.query(`UPDATE cards SET db_content = '[[Role A]]' WHERE id = ${RULE_CARD_ID}`, []);
    await driver!.query(
      `UPDATE card_references SET referee_id = ${ROLE_A_ID}, referee_key = 'role_a' WHERE referer_id = ${RULE_CARD_ID}`,
      [],
    );

    // The retained isolate engine must notice the moved deck_data_version
    // stamp (the freshness boundary) and re-derive the verdict.
    const root = await getRoot("/api/card/Freshness%20Probe");
    expect(root.status, "the root /api/card route served a pre-revocation verdict").toBe(403);
    const rootBody = (await root.json()) as { error?: string; name?: string };
    expect(rootBody).toMatchObject({ error: "permission denied", name: "Freshness Probe" });
    expect(JSON.stringify(rootBody)).not.toContain(SECRET);

    const deploy = await getDeploy("/Freshness%20Probe.json");
    expect(deploy.status, "the deploy record-JSON route served a pre-revocation verdict").toBe(403);
    const deployBody = (await deploy.json()) as { error?: string; name?: string };
    expect(deployBody).toMatchObject({ error: "permission denied", name: "Freshness Probe" });
    expect(JSON.stringify(deployBody)).not.toContain(SECRET);
  });
});
