// Twin-worker shared-surface parity — root worker.ts (the wrangler.toml
// `main` the Deploy-to-Cloudflare button ships) and deploy/worker.ts (the
// deploy/wrangler.toml harness) driven through the SAME in-process fixture:
// one LocalSqliteDriver behind the same D1-shaped shim, the same
// 0001-schema + demo-seed rows. Both default exports are the SHIPPED
// modules, not re-implementations.
//
// Why this file exists: the two worker entries once handled the same
// failure differently — the button's entry answered errors with a
// blanket-500 catch while deploy/worker.ts mapped a missing card to 404 —
// so the behavior both entries share was extracted into
// src/server/worker-shared-surface.ts and both entries now delegate to
// it. Each pin below failed against the pre-unification entries and pins
// the unified behavior with its Ruby cite:
//   - prototype/lib/card/error.rb:21 Card::Error base status_code = 422
//     (UserError inherits; :88-89 NotFound 404; :46-51 ServerError 500)
//   - src/card/render/format.ts:79-81 UnsupportedViewError = the UserError
//     raise (render.rb#view_method)
//   - src/card/name/errors.ts NameNotFoundError/CodenameNotFoundError =
//     Card::Error::NotFound family
//   - decko-0.20.0 lib/card_controller/rest.rb:92-103 show(nil) +
//     view_from_params (?view=/?v=, path view wins)
//   - config/engine_routes.rb:7,19,24,51 the read-route grammar
//   - set/all/permissions.rb:139-146 the read denial (403 on JSON)

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

/** The D1 binding both workers duck-type, backed by the local sqlite
 *  driver (the same shim shape tests/deploy/deploy-worker-view-routes.test.ts
 *  proves against deploy/worker.ts). */
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

/** Two renders differ only in the per-render slot nonce; normalize it so
 *  bodies compare byte-wise where the shells agree. */
function withoutSlotNonce(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="<nonce>"');
}

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
  // The read-denial fixture is the same recipe
  // tests/deploy/deploy-worker-miniflare.test.ts pins for its denied-card
  // JSON check: the codename carriers the permission statements'
  // subselects need, a probe card, its *self set, and a *read rule card
  // granting NOBODY (no card_references rows).
  const T = "2026-09-20 00:00:00.000";
  const insert = (values: string): string =>
    `INSERT INTO cards (\n` +
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

describe("worker twins — shared read surface parity", () => {
  it("GET / boots both engines and renders Home :open", async () => {
    const root = await getRoot("/");
    const deploy = await getDeploy("/");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    const rootHtml = await root.text();
    const deployHtml = await deploy.text();
    // the seeded Home body rides both shells
    expect(rootHtml).toContain("Welcome to the decko-ts synthetic demo deck");
    expect(deployHtml).toContain("Welcome to the decko-ts synthetic demo deck");
    expect(rootHtml).toContain('data-card-name="Home"');
    expect(deployHtml).toContain('data-card-name="Home"');
  });

  it("GET /:mark renders the open view on both twins", async () => {
    const root = await getRoot("/About");
    const deploy = await getDeploy("/About");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    expect(await root.text()).toContain("only synthetic demo content");
    expect(await deploy.text()).toContain("only synthetic demo content");
  });

  it("GET /:mark/:view renders the PATH view verbatim on both twins (engine_routes.rb:51)", async () => {
    const root = await getRoot("/About/closed");
    const deploy = await getDeploy("/About/closed");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    // the closed shape: the collapsed title, never the open body
    expect(await root.text()).not.toContain("only synthetic demo content");
    expect(await deploy.text()).not.toContain("only synthetic demo content");
  });

  it("GET /:mark/view/:view is the same render on both twins (engine_routes.rb:24)", async () => {
    const root = await getRoot("/About/view/closed");
    const deploy = await getDeploy("/About/view/closed");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    expect(await root.text()).not.toContain("only synthetic demo content");
    expect(await deploy.text()).not.toContain("only synthetic demo content");
  });

  it("a missing card answers 404 Card not found on BOTH twins (error.rb:88-89)", async () => {
    const root = await getRoot("/No+Such+Card");
    const deploy = await getDeploy("/No+Such+Card");
    expect(root.status).toBe(404);
    expect(deploy.status).toBe(404);
    expect(await root.text()).toContain("<h1>Card not found</h1>");
    expect(await deploy.text()).toContain("<h1>Card not found</h1>");
  });

  it("an unregistered view raises the UserError shape: 422 Unsupported view on BOTH twins (error.rb:21)", async () => {
    const root = await getRoot("/Home/nonsense");
    const deploy = await getDeploy("/Home/nonsense");
    expect(root.status).toBe(422);
    expect(deploy.status).toBe(422);
    const rootHtml = await root.text();
    const deployHtml = await deploy.text();
    expect(rootHtml).toContain("<h1>Unsupported view</h1>");
    expect(deployHtml).toContain("<h1>Unsupported view</h1>");
    expect(rootHtml).toContain("nonsense");
    expect(deployHtml).toContain("nonsense");
  });

  it("an id mark resolves through the primed name environment on BOTH twins", async () => {
    const root = await getRoot("/~10");
    const deploy = await getDeploy("/~10");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    expect(await root.text()).toContain("Welcome to the decko-ts synthetic demo deck");
    expect(await deploy.text()).toContain("Welcome to the decko-ts synthetic demo deck");
  });

  it("a codename mark resolves through the primed codehash on BOTH twins", async () => {
    const root = await getRoot("/:search_type");
    const deploy = await getDeploy("/:search_type");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    expect(await root.text()).toContain('data-card-name="Search"');
    expect(await deploy.text()).toContain('data-card-name="Search"');
  });

  it("an id mark for a card that does not exist answers 404 on BOTH twins (NotFound family)", async () => {
    const root = await getRoot("/~999999");
    const deploy = await getDeploy("/~999999");
    expect(root.status).toBe(404);
    expect(deploy.status).toBe(404);
    expect(await root.text()).toContain("999999");
    expect(await deploy.text()).toContain("999999");
  });

  it("?view= fills the view-less arm on BOTH twins (rest.rb:100-103 view_from_params)", async () => {
    const root = await getRoot("/About?view=closed");
    const deploy = await getDeploy("/About?view=closed");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    expect(await root.text()).not.toContain("only synthetic demo content");
    expect(await deploy.text()).not.toContain("only synthetic demo content");
  });

  it("?v= is the alias and a BLANK view= falls through, on BOTH twins (rest.rb:100-103)", async () => {
    for (const path of ["/About?v=closed", "/About?view=&v=closed"]) {
      const root = await getRoot(path);
      const deploy = await getDeploy(path);
      expect(root.status, path).toBe(200);
      expect(deploy.status, path).toBe(200);
      expect(await root.text()).not.toContain("only synthetic demo content");
      expect(await deploy.text()).not.toContain("only synthetic demo content");
    }
  });

  it("a PATH view wins over the query param on BOTH twins (show(view) never consults params)", async () => {
    const root = await getRoot("/About/closed?view=open");
    const deploy = await getDeploy("/About/closed?view=open");
    expect(root.status).toBe(200);
    expect(deploy.status).toBe(200);
    expect(await root.text()).not.toContain("only synthetic demo content");
    expect(await deploy.text()).not.toContain("only synthetic demo content");
  });

  it("no route is invented for the constrained legacy arm: /card/closed/:mark 404s on BOTH twins", async () => {
    const root = await getRoot("/card/closed/About");
    const deploy = await getDeploy("/card/closed/About");
    expect(root.status).toBe(404);
    expect(deploy.status).toBe(404);
  });

  it("a read-denied card 403s on root's /api/card JSON and deploy's .json JSON (permissions.rb:139-146)", async () => {
    const root = await getRoot("/api/card/Probe%20Restricted");
    expect(root.status).toBe(403);
    const rootBody = (await root.json()) as { error?: string; name?: string };
    expect(rootBody).toMatchObject({ error: "permission denied", name: "Probe Restricted" });
    expect(JSON.stringify(rootBody)).not.toContain("Restricted secret body");

    const deploy = await getDeploy("/Probe%20Restricted.json");
    expect(deploy.status).toBe(403);
    const deployBody = (await deploy.json()) as { error?: string; name?: string };
    expect(deployBody).toMatchObject({ error: "permission denied", name: "Probe Restricted" });
    expect(JSON.stringify(deployBody)).not.toContain("Restricted secret body");
  });

  it("a readable card still serves both twins' JSON surfaces (the gate is per-card)", async () => {
    const root = await getRoot("/api/card/About");
    expect(root.status).toBe(200);
    const deploy = await getDeploy("/About.json");
    expect(deploy.status).toBe(200);
  });

  it("history views ride verbatim on BOTH twins: 422 with the view named (no mod registry on either twin)", async () => {
    // Neither worker entry loads the card-mod-history mod, so the history
    // views raise UnsupportedViewError on BOTH — and both must answer the
    // same UserError shape (error.rb:21) with the verbatim view. The
    // act_id/params pass-through itself is unified in code
    // (worker-shared-surface.ts historyViewParams, consumed by both
    // handlers); its rendered effect is engine-side territory (the
    // mod-loaded history pins under tests/card/), because the twins share
    // this unloaded-mod limitation.
    await driver!.query(
      "INSERT INTO card_acts (card_id, actor_id, acted_at) VALUES (10, 1, '2026-09-21 00:00:00')",
      [],
    );
    const root = await getRoot("/Home/act?act_id=1");
    const deploy = await getDeploy("/Home/act?act_id=1");
    expect(root.status).toBe(422);
    expect(deploy.status).toBe(422);
    expect(await root.text()).toContain("act");
    expect(await deploy.text()).toContain("act");
  });
});
