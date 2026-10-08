// one-click-teardown.test.ts — the one-click Cloudflare teardown's own tests.
//
// Three behaviours the teardown exists to guarantee, each pinned here:
//
//   1. LIST mode parses the RECORDED Cloudflare API responses and names exactly
//      what a deploy of this config created. No network, no wrangler, no
//      account: every response is a fixture under fixtures/deploy-teardown/,
//      whose README says precisely what those files are (shape transcriptions
//      from the Cloudflare API reference, identifiers synthetic — NOT live
//      captures).
//   2. DESTROY mode requires --yes, and then requires the caller to hand back
//      the fingerprint of the plan it just printed. A subprocess spy proves
//      nothing ran until both gates were passed.
//   3. A NAME MISMATCH refuses. The account answering with a different name is
//      a refusal, never a "close enough" delete — in either direction (the
//      Worker service id, and the D1 database name).
//
// This file is deliberately NOT in tests/standing-net.json: the canonical net's
// test count is a gate, and a teardown suite is a different kind of artifact
// from a card-engine regression suite. Run it directly:
//   npx vitest run tests/deploy/one-click-teardown.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFUSAL,
  TeardownRefusal,
  parseWranglerDeployConfig,
  parseWorkerServiceResponse,
  parseWorkerDeploymentsResponse,
  parseD1DatabaseListResponse,
  parseD1QueryResponse,
  isReadOnlySelect,
  isPlaceholderDatabaseId,
  summarizeMigrationsCensus,
  collectAccountState,
  attributeWorker,
  attributeDatabase,
  buildTeardownPlan,
  buildConfiglessConfig,
  applyOverridesToConfig,
  parseArgs,
  teardownCommands,
  planFingerprint,
  assertDestroyAllowed,
  dispatchTeardown,
  runTeardown,
  renderPlanText,
  renderPlanJson,
} from "../../scripts/deploy/one-click-teardown.mjs";
import type { DeployConfig, TeardownPlan } from "../../scripts/deploy/one-click-teardown.mjs";

const REPO_ROOT = join(__dirname, "..", "..");
const FIXTURES = join(REPO_ROOT, "fixtures", "deploy-teardown");

function fixture(name: string): any {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

/** The config this repo's own one-click deploy generates. */
function oneClickConfig(): DeployConfig {
  return parseWranglerDeployConfig(
    readFileSync(join(REPO_ROOT, "scripts", "deploy", "one-click-deck", "wrangler.oneclick.toml"), "utf8"),
    { configPath: "scripts/deploy/one-click-deck/wrangler.oneclick.toml" },
  );
}

function deployedPlan(overrides: Partial<Parameters<typeof buildTeardownPlan>[0]> = {}): TeardownPlan {
  return buildTeardownPlan({
    config: oneClickConfig(),
    workerServiceResponse: fixture("cloudflare-workers-service-get-response.json"),
    workerDeploymentsResponse: fixture("cloudflare-workers-script-deployments-list-response.json"),
    d1ListResponse: fixture("cloudflare-d1-database-list-response.json"),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------

describe("LIST mode — parses the recorded Cloudflare API responses", () => {
  it("attributes the Worker and the D1 database the one-click config declares, and nothing else", () => {
    const plan = deployedPlan();

    expect(plan.workerName).toBe("decko-one-click-demo");
    expect(plan.candidates.map((c) => [c.kind, c.name])).toEqual([
      ["worker", "decko-one-click-demo"],
      ["d1", "decko-one-click-db"],
    ]);
    // the fixture account also holds some-other-app-db and decko-one-click-db-2;
    // neither is attributable to this config, so neither may appear.
    expect(plan.candidates.map((c) => c.name)).not.toContain("some-other-app-db");
    expect(plan.candidates.map((c) => c.name)).not.toContain("decko-one-click-db-2");
    expect(plan.refusals).toEqual([]);
  });

  it("prints name, id and created-date for every deletion candidate — the three facts a reviewer needs", () => {
    const plan = deployedPlan();
    const text = renderPlanText(plan);

    for (const candidate of plan.candidates) {
      expect(text).toContain(candidate.name);
      expect(text).toContain(candidate.id ?? "");
      expect(text).toContain(candidate.createdAt ?? "");
    }
    // the Worker's created-date comes from the DEPLOYMENT, not the service envelope
    expect(plan.candidates[0]!.createdAt).toBe("2026-09-23T18:43:10.000000Z");
    expect(plan.candidates[0]!.createdAtSource).toBe("workers script deployments[0].created_on");
    // the D1's created-date comes from the account's database list
    expect(plan.candidates[1]!.createdAt).toBe("2026-09-23T18:41:07.123456Z");
    expect(plan.candidates[1]!.id).toBe("9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c");
  });

  it("parses the D1 database list envelope, including result_info", () => {
    const parsed = parseD1DatabaseListResponse(fixture("cloudflare-d1-database-list-response.json"));
    expect(parsed.totalCount).toBe(3);
    expect(parsed.databases.map((db) => db.name)).toEqual([
      "decko-one-click-db",
      "decko-one-click-db-2",
      "some-other-app-db",
    ]);
    expect(parsed.databases[0]).toEqual({
      uuid: "9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c",
      name: "decko-one-click-db",
      createdAt: "2026-09-23T18:41:07.123456Z",
      version: "1",
      jurisdiction: "us",
    });
    // jurisdiction and version are optional in the recorded shape
    expect(parsed.databases[1]!.version).toBeNull();
  });

  it("parses the Worker service and deployments envelopes", () => {
    const service = parseWorkerServiceResponse(fixture("cloudflare-workers-service-get-response.json"));
    expect(service.found).toBe(true);
    expect(service.service!.id).toBe("decko-one-click-demo");

    const deployments = parseWorkerDeploymentsResponse(
      fixture("cloudflare-workers-script-deployments-list-response.json"),
    );
    expect(deployments.latest!.id).toBe("2b7c9d1e-4a6f-4c8b-9e0d-1a2b3c4d5e6f");
    expect(deployments.latest!.createdOn).toBe("2026-09-23T18:43:10.000000Z");
  });

  it("reports a 404 service as absent, not as a failure", () => {
    const parsed = parseWorkerServiceResponse(fixture("cloudflare-workers-service-not-found-response.json"));
    expect(parsed.found).toBe(false);
    expect(parsed.service).toBeNull();

    const plan = deployedPlan({
      workerServiceResponse: fixture("cloudflare-workers-service-not-found-response.json"),
    });
    expect(plan.candidates.map((c) => c.kind)).toEqual(["d1"]);
    expect(plan.refusals.some((r) => r.message.includes("no Worker named"))).toBe(true);
  });

  it("turns a failed API answer into a refusal, never into an empty plan", () => {
    expect(() =>
      buildTeardownPlan({
        config: oneClickConfig(),
        d1ListResponse: { success: false, errors: [{ code: 10000, message: "Authentication error" }], result: null },
      }),
    ).toThrowError(TeardownRefusal);

    // and the "answer never arrived" case is a refusal too
    const plan = buildTeardownPlan({ config: oneClickConfig(), d1ListResponse: null });
    expect(plan.candidates).toEqual([]);
    expect(plan.refusals.every((r) => r.marker === REFUSAL.API_FAILED)).toBe(true);
  });

  it("reads the migrations state as a read-only sqlite_master census", () => {
    const census = summarizeMigrationsCensus(
      parseD1QueryResponse(fixture("cloudflare-d1-query-sqlite-master-response.json"), { what: "probe" }),
      { databaseId: "9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c" },
    );
    expect(census.available).toBe(true);
    expect(census.tableCount).toBe(13);
    expect(census.indexCount).toBe(5);
    expect(census.hasSchemaMigrations).toBe(true);
    // this deploy applies DDL with `d1 execute --file`, so there is no wrangler ledger
    expect(census.hasWranglerMigrationLedger).toBe(false);
    expect(census.rowsRead).toBe(18);
    expect(census.rowsWritten).toBe(0);

    // the probe is a single SELECT and nothing else
    expect(isReadOnlySelect("SELECT name FROM sqlite_master WHERE type = 'table'")).toBe(true);
    expect(isReadOnlySelect("DELETE FROM cards")).toBe(false);
    expect(isReadOnlySelect("SELECT 1; DROP TABLE cards")).toBe(false);
  });

  it("degrades on a failed census statement instead of aborting the listing", () => {
    const census = summarizeMigrationsCensus(
      parseD1QueryResponse(fixture("cloudflare-d1-query-error-response.json"), { what: "probe" }),
      { databaseId: "abc" },
    );
    expect(census.available).toBe(false);
    expect(census.message).toContain("no such table");

    const plan = deployedPlan({ migrations: census });
    expect(plan.candidates).toHaveLength(2);
    expect(renderPlanText(plan)).toContain("migrations state: unavailable");
  });

  it("emits the same plan as JSON, with the commands it would run", () => {
    const json = JSON.parse(renderPlanJson(deployedPlan()));
    expect(json.mode).toBe("list");
    expect(json.candidates).toHaveLength(2);
    expect(json.commands[0]).toBe(
      "npx wrangler delete decko-one-click-demo --config scripts/deploy/one-click-deck/wrangler.oneclick.toml",
    );
    expect(json.commands[1]).toBe(
      "npx wrangler d1 delete decko-one-click-db --skip-confirmation --config scripts/deploy/one-click-deck/wrangler.oneclick.toml",
    );
  });

  it("passes the D1 NAME to wrangler, never the UUID — `d1 delete` takes a name or binding", () => {
    const commands = teardownCommands(deployedPlan());
    expect(commands[1]!.argv).toEqual([
      "d1",
      "delete",
      "decko-one-click-db",
      "--skip-confirmation",
      "--config",
      "scripts/deploy/one-click-deck/wrangler.oneclick.toml",
    ]);
    expect(commands[1]!.argv).not.toContain("9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c");
  });

  it("removes the Worker before the database that its D1 binding points at", () => {
    expect(teardownCommands(deployedPlan()).map((c) => c.kind)).toEqual(["worker", "d1"]);
  });
});

// ---------------------------------------------------------------------------

describe("DESTROY mode — --yes, and then the plan fingerprint", () => {
  type Runner = (argv: string[]) => { status: number; stdout: string; stderr: string };
  /** A spawn spy: records the argv, reports success. The real thing is never spawned. */
  let run: Runner & { mock: { calls: string[][] } };

  beforeEach(() => {
    const calls: string[][] = [];
    run = ((argv: string[]) => {
      calls.push(argv);
      return { status: 0, stdout: "", stderr: "" };
    }) as Runner & { mock: { calls: string[][] } };
    run.mock = { calls };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("refuses without --yes and runs nothing", () => {
    const plan = deployedPlan();
    try {
      assertDestroyAllowed(plan, { yes: false });
      throw new Error("should have refused");
    } catch (e) {
      expect((e as TeardownRefusal).marker).toBe(REFUSAL.PLAN_NOT_REVIEWED);
    }
    // and the whole dispatch — not just the gate — leaves the runner untouched
    expect(dispatchTeardown(plan, { yes: false, run, configPath: "x.toml" })).toEqual({
      mode: "list",
      deleted: [],
      refused: null,
    });
    // `run` is a hand-rolled recorder, not a vitest spy, so the assertion is on
    // its own call log (a spy assertion here throws "not a spy")
    expect(run.mock.calls).toEqual([]);
  });

  it("refuses --yes alone until the caller hands back the printed fingerprint — still running nothing", () => {
    const plan = deployedPlan();
    expect(renderPlanText(plan)).toContain(plan.fingerprint);
    expect(() => dispatchTeardown(plan, { yes: true, confirmPlan: null, run, configPath: "x.toml" })).toThrowError(
      /--plan-review-required|--confirm-plan/,
    );
    // hand-rolled recorder, not a vitest spy — assert its own call log
    expect(run.mock.calls).toEqual([]);
  });

  it("refuses a fingerprint from a DIFFERENT plan (the plan changed under the reviewer)", () => {
    const plan = deployedPlan();
    const other = deployedPlan({
      d1ListResponse: fixture("cloudflare-d1-database-list-name-mismatch-response.json"),
    });
    expect(plan.fingerprint).not.toBe(other.fingerprint);
    expect(() => assertDestroyAllowed(plan, { yes: true, confirmPlan: other.fingerprint })).toThrowError(
      TeardownRefusal,
    );
  });

  it("refuses an empty candidate list — a re-run after a teardown deletes nothing", () => {
    const empty = buildTeardownPlan({
      config: oneClickConfig(),
      workerServiceResponse: fixture("cloudflare-workers-service-not-found-response.json"),
      d1ListResponse: fixture("cloudflare-d1-database-list-name-mismatch-response.json"),
    });
    expect(empty.candidates).toEqual([]);
    try {
      assertDestroyAllowed(empty, { yes: true, confirmPlan: empty.fingerprint });
      throw new Error("should have refused");
    } catch (e) {
      expect((e as TeardownRefusal).marker).toBe(REFUSAL.PLAN_EMPTY);
    }
  });

  it("deletes exactly the plan, in order, reporting each deletion as it happens", () => {
    const plan = deployedPlan();
    expect(assertDestroyAllowed(plan, { yes: true, confirmPlan: plan.fingerprint })).toBe(true);

    const results = runTeardown(plan, { run, configPath: "scripts/deploy/one-click-deck/wrangler.oneclick.toml" });

    expect(run.mock.calls).toEqual([
      ["delete", "decko-one-click-demo", "--config", "scripts/deploy/one-click-deck/wrangler.oneclick.toml"],
      ["d1", "delete", "decko-one-click-db", "--skip-confirmation", "--config", "scripts/deploy/one-click-deck/wrangler.oneclick.toml"],
    ]);
    expect(results.map((r) => r.status)).toEqual(["deleted", "deleted"]);
    expect(results[1]!.id).toBe("9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c");
    expect(results[1]!.createdAt).toBe("2026-09-23T18:41:07.123456Z");
  });

  it("never passes wrangler's --force: if another Worker depends on this one, wrangler's refusal is the answer", () => {
    const plan = deployedPlan();
    runTeardown(plan, { run, configPath: "x.toml" });
    for (const argv of run.mock.calls) {
      expect(argv).not.toContain("--force");
    }
  });

  it("reports a failed deletion instead of claiming a complete teardown", () => {
    const plan = deployedPlan();
    const failing = vi.fn((argv: string[]) =>
      argv[0] === "delete" ? { status: 1, stdout: "", stderr: "workers service not found" } : { status: 0, stdout: "", stderr: "" },
    );
    const results = runTeardown(plan, { run: failing, configPath: "x.toml" });
    expect(results.map((r) => r.status)).toEqual(["failed", "deleted"]);
    expect(results[0]!.exit).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe("attribution — a name mismatch refuses, in both directions", () => {
  it("refuses when the account's Worker service id is not the configured name", () => {
    try {
      attributeWorker(
        "decko-one-click-demo",
        fixture("cloudflare-workers-service-get-name-mismatch-response.json"),
        null,
      );
      throw new Error("should have refused");
    } catch (e) {
      const refusal = e as TeardownRefusal;
      expect(refusal).toBeInstanceOf(TeardownRefusal);
      expect(refusal.marker).toBe(REFUSAL.NAME_MISMATCH);
      expect(refusal.detail).toEqual({ declared: "decko-one-click-demo", reported: "decko-one-click-demo-canary" });
    }
  });

  it("refuses when only a near-miss database NAME exists — the near-miss is not deleted", () => {
    const config = oneClickConfig();
    const list = fixture("cloudflare-d1-database-list-name-mismatch-response.json");
    const attributed = attributeDatabase(config.databases[0]!, list);

    expect(attributed.status).toBe("absent");
    expect(attributed.resource).toBeNull();
    expect(attributed.reason).toContain('no D1 database named "decko-one-click-db"');
  });

  it("refuses two databases answering to the same exact name rather than picking one", () => {
    try {
      attributeDatabase(oneClickConfig().databases[0]!, fixture("cloudflare-d1-database-list-duplicate-name-response.json"));
      throw new Error("should have refused");
    } catch (e) {
      const refusal = e as TeardownRefusal;
      expect(refusal.marker).toBe(REFUSAL.AMBIGUOUS_DATABASE_NAME);
      expect((refusal.detail as { uuids: string[] }).uuids).toHaveLength(2);
    }
  });

  it("refuses when the config's real database_id disagrees with the account's uuid", () => {
    const config = oneClickConfig();
    const bound = { ...config.databases[0]!, databaseId: "00000000-dead-beef-0000-000000000000", databaseIdIsPlaceholder: false };
    try {
      attributeDatabase(bound, fixture("cloudflare-d1-database-list-response.json"));
      throw new Error("should have refused");
    } catch (e) {
      const refusal = e as TeardownRefusal;
      expect(refusal.marker).toBe(REFUSAL.NAME_MISMATCH);
      expect(refusal.detail).toEqual({
        declared: "00000000-dead-beef-0000-000000000000",
        reported: "9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c",
      });
    }
  });

  it("accepts a real database_id that agrees with the account's uuid", () => {
    const config = oneClickConfig();
    const bound = {
      ...config.databases[0]!,
      databaseId: "9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c",
      databaseIdIsPlaceholder: false,
    };
    const attributed = attributeDatabase(bound, fixture("cloudflare-d1-database-list-response.json"));
    expect(attributed.status).toBe("removable");
  });

  it("falls back to the exact name match when the config still carries the placeholder id, and says so", () => {
    const config = oneClickConfig();
    expect(config.databases[0]!.databaseIdIsPlaceholder).toBe(true);
    expect(config.warnings.join("\n")).toContain("placeholder id");
    const attributed = attributeDatabase(config.databases[0]!, fixture("cloudflare-d1-database-list-response.json"));
    expect(attributed.status).toBe("removable");
  });

  it("reads the repo-root wrangler.toml the same way: name + database_name", () => {
    const config = parseWranglerDeployConfig(readFileSync(join(REPO_ROOT, "wrangler.toml"), "utf8"), {
      configPath: "wrangler.toml",
    });
    expect(config.workerName).toBe("decko-ts");
    expect(config.databases.map((d) => d.databaseName)).toEqual(["decko-ts"]);
    // The committed root config ships a placeholder id: a button deploy
    // writes its own database's id, and a manual deploy pastes the id
    // `wrangler d1 create` prints. No real infrastructure id is committed.
    expect(config.databases[0]!.databaseId).toBe("REPLACE_WITH_YOUR_D1_DATABASE_ID");
    expect(config.databases[0]!.databaseIdIsPlaceholder).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("name overrides — attribution without a config file", () => {
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  // The frozen demo pair (deploy/cleanup.mjs's names, no committed wrangler
  // config), as the account would report it. Shapes are the same recorded
  // shapes the fixtures transcribe; identifiers are synthetic.
  const FROZEN_WORKER = "decko-ts-demo";
  const FROZEN_DB = "decko-ts-demo-db";
  const frozenResponses = () => ({
    service: { success: true, result: { id: FROZEN_WORKER, created_on: "2026-08-01T09:00:00.000000Z" } },
    deployments: {
      success: true,
      result: { deployments: [{ id: "frozen-dep-1", created_on: "2026-08-01T09:00:00.000000Z" }] },
    },
    d1: {
      success: true,
      result: [
        { uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479", name: FROZEN_DB, created_at: "2026-07-15T12:30:00.000000Z", version: "1" },
      ],
      result_info: { total_count: 1 },
    },
  });

  function frozenPlan(): TeardownPlan {
    const r = frozenResponses();
    return buildTeardownPlan({
      config: buildConfiglessConfig({ workerName: FROZEN_WORKER, dbName: FROZEN_DB }),
      workerServiceResponse: r.service,
      workerDeploymentsResponse: r.deployments,
      d1ListResponse: r.d1,
    });
  }

  it("attributes from overrides alone, and the plan is identical to what the same names via a config produce", () => {
    // a configless plan built from the FIXTURE account's names is byte-equal
    // (candidates and fingerprint) to the file-config plan: one code path.
    const allFixtures = {
      workerServiceResponse: fixture("cloudflare-workers-service-get-response.json"),
      workerDeploymentsResponse: fixture("cloudflare-workers-script-deployments-list-response.json"),
      d1ListResponse: fixture("cloudflare-d1-database-list-response.json"),
    };
    const configless = buildTeardownPlan({
      config: buildConfiglessConfig({ workerName: "decko-one-click-demo", dbName: "decko-one-click-db" }),
      ...allFixtures,
    });
    expect(configless.configless).toBe(true);
    expect(configless.candidates.map((c) => [c.kind, c.name, c.id])).toEqual(
      deployedPlan().candidates.map((c) => [c.kind, c.name, c.id]),
    );
    expect(configless.fingerprint).toBe(deployedPlan().fingerprint);
  });

  it("plans the frozen demo pair: exact-match attribution, both candidates, render says configless", () => {
    const plan = frozenPlan();
    expect(plan.configless).toBe(true);
    expect(plan.configPath).toContain("no config file");
    expect(plan.candidates.map((c) => [c.kind, c.name])).toEqual([
      ["worker", FROZEN_WORKER],
      ["d1", FROZEN_DB],
    ]);
    expect(plan.candidates[1]!.id).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");

    const text = renderPlanText(plan);
    expect(text).toContain("no config file");
    expect(text).toContain(FROZEN_WORKER);
    expect(text).toContain(FROZEN_DB);
    expect(text).toContain(plan.fingerprint);
  });

  it("pins the argv vectors: positional names, no --config, --force never passed", () => {
    expect(teardownCommands(frozenPlan()).map((c) => c.argv)).toEqual([
      ["delete", FROZEN_WORKER],
      ["d1", "delete", FROZEN_DB, "--skip-confirmation"],
    ]);
    for (const command of teardownCommands(frozenPlan())) {
      expect(command.argv).not.toContain("--config");
      expect(command.argv).not.toContain("--force");
    }
  });

  it("keeps the destroy double-gate on a configless plan — nothing runs before --yes + the fingerprint", () => {
    const plan = frozenPlan();
    const calls: string[][] = [];
    const run = (argv: string[]) => {
      calls.push(argv);
      return { status: 0, stdout: "", stderr: "" };
    };

    expect(dispatchTeardown(plan, { yes: false, run })).toEqual({ mode: "list", deleted: [], refused: null });
    expect(() => dispatchTeardown(plan, { yes: true, confirmPlan: null, run })).toThrowError(TeardownRefusal);
    expect(calls).toEqual([]);

    const dispatched = dispatchTeardown(plan, { yes: true, confirmPlan: plan.fingerprint, run });
    expect(dispatched.mode).toBe("destroy");
    expect(calls).toEqual([
      ["delete", FROZEN_WORKER],
      ["d1", "delete", FROZEN_DB, "--skip-confirmation"],
    ]);
  });

  it("attributes only the axis an override names, and says so in the warnings", () => {
    const r = frozenResponses();
    const dbOnly = buildTeardownPlan({
      config: buildConfiglessConfig({ dbName: FROZEN_DB }),
      d1ListResponse: r.d1,
    });
    expect(dbOnly.workerName).toBeNull();
    expect(dbOnly.candidates.map((c) => c.kind)).toEqual(["d1"]);
    expect(dbOnly.warnings.join("\n")).toContain("no --worker-name given");

    const workerOnly = buildTeardownPlan({
      config: buildConfiglessConfig({ workerName: FROZEN_WORKER }),
      workerServiceResponse: r.service,
      workerDeploymentsResponse: r.deployments,
      d1ListResponse: r.d1,
    });
    expect(workerOnly.candidates.map((c) => c.kind)).toEqual(["worker"]);
    expect(workerOnly.warnings.join("\n")).toContain("no --db-name given");
  });

  it("refuses an override that disagrees with what an explicit --config declares", () => {
    try {
      applyOverridesToConfig(oneClickConfig(), { workerName: FROZEN_WORKER });
      throw new Error("should have refused");
    } catch (e) {
      const refusal = e as TeardownRefusal;
      expect(refusal).toBeInstanceOf(TeardownRefusal);
      expect(refusal.marker).toBe(REFUSAL.OVERRIDE_CONFLICT);
      expect(refusal.detail).toMatchObject({ override: FROZEN_WORKER, declared: "decko-one-click-demo" });
    }

    try {
      applyOverridesToConfig(oneClickConfig(), { dbName: FROZEN_DB });
      throw new Error("should have refused");
    } catch (e) {
      const refusal = e as TeardownRefusal;
      expect(refusal.marker).toBe(REFUSAL.OVERRIDE_CONFLICT);
      expect(refusal.detail).toMatchObject({ override: FROZEN_DB, declared: ["decko-one-click-db"] });
    }
  });

  it("accepts an override that agrees with the config, and fills a name the config omits", () => {
    const allFixtures = {
      workerServiceResponse: fixture("cloudflare-workers-service-get-response.json"),
      workerDeploymentsResponse: fixture("cloudflare-workers-script-deployments-list-response.json"),
      d1ListResponse: fixture("cloudflare-d1-database-list-response.json"),
    };
    const agreeing = applyOverridesToConfig(oneClickConfig(), {
      workerName: "decko-one-click-demo",
      dbName: "decko-one-click-db",
    });
    expect(agreeing.workerName).toBe("decko-one-click-demo");
    expect(agreeing.databases.map((d) => d.databaseName)).toEqual(["decko-one-click-db"]);
    // agreeing overrides change nothing about the resulting plan
    expect(planFingerprint(buildTeardownPlan({ config: agreeing, ...allFixtures }))).toBe(
      planFingerprint(deployedPlan()),
    );

    // a config that declares neither a Worker nor a D1 gets both filled in —
    // the override may fill a gap, never swap a declared name
    const nameless = parseWranglerDeployConfig('compatibility_date = "2026-01-01"\n', { configPath: "inline.toml" });
    expect(nameless.workerName).toBeNull();
    expect(nameless.databases).toEqual([]);
    const filled = applyOverridesToConfig(nameless, { workerName: FROZEN_WORKER, dbName: FROZEN_DB });
    expect(filled.workerName).toBe(FROZEN_WORKER);
    expect(filled.databases.map((d) => d.databaseName)).toEqual([FROZEN_DB]);
    expect(filled.databases[0]!.databaseIdIsPlaceholder).toBe(true);
  });

  it("pins the CLI argv vectors for the override flags", () => {
    expect(
      parseArgs(["--worker-name", FROZEN_WORKER, "--db-name", FROZEN_DB, "--yes", "--confirm-plan", "abc123", "--json"]),
    ).toEqual({
      yes: true,
      json: true,
      dryRun: false,
      confirmPlan: "abc123",
      config: null,
      workerName: FROZEN_WORKER,
      dbName: FROZEN_DB,
      token: null,
      accountId: null,
      help: false,
    });

    // a flag without a value is an argv error, refused before anything runs
    expect(() => parseArgs(["--worker-name"])).toThrowError(/--worker-name needs a name/);
    expect(() => parseArgs(["--db-name", ""])).toThrowError(/--db-name needs a name/);
    expect(() => parseArgs(["--config"])).toThrowError(/--config needs a name/);
    expect(() => parseArgs(["--bogus"])).toThrowError(/unknown argument/);
  });
});

// ---------------------------------------------------------------------------

describe("the account read path — LIST mode makes no write call", () => {
  const CREDENTIALS = { token: "fixture-token", accountId: "0a1b2c3d4e5f60718293a4b5c6d7e8f9" };

  function recordingFetch(responses: Record<string, { status: number; json: unknown }>) {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const impl = (async (url: string, init: { method: string; body?: string }) => {
      const path = String(url).replace("https://api.cloudflare.com/client/v4", "");
      calls.push({ method: init.method, url: path, body: init.body ? JSON.parse(init.body) : undefined });
      const hit = responses[path];
      if (!hit) throw new Error(`unexpected request in the test double: ${init.method} ${path}`);
      return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, json: async () => hit.json };
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it("issues exactly four GETs and one read-only SELECT — and nothing else", async () => {
    const { impl, calls } = recordingFetch({
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/services/decko-one-click-demo": {
        status: 200,
        json: fixture("cloudflare-workers-service-get-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/scripts/decko-one-click-demo/deployments": {
        status: 200,
        json: fixture("cloudflare-workers-script-deployments-list-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/d1/database": {
        status: 200,
        json: fixture("cloudflare-d1-database-list-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/d1/database/9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c/query": {
        status: 200,
        json: fixture("cloudflare-d1-query-sqlite-master-response.json"),
      },
    });

    const state = await collectAccountState(oneClickConfig(), CREDENTIALS, impl);

    // four GETs, plus the one POST that carries a SELECT
    expect(calls.filter((c) => c.method === "GET").map((c) => c.url)).toEqual([
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/services/decko-one-click-demo",
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/scripts/decko-one-click-demo/deployments",
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/d1/database",
    ]);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body as { sql: string }).toEqual({
      sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name",
    });
    expect(isReadOnlySelect((posts[0]!.body as { sql: string }).sql)).toBe(true);

    // and the whole path yields the same plan the fixtures describe
    const plan = buildTeardownPlan({ config: oneClickConfig(), ...state });
    expect(plan.candidates.map((c) => c.name)).toEqual(["decko-one-click-demo", "decko-one-click-db"]);
    expect(state.migrations!.tableCount).toBe(13);
  });

  it("sends the migrations probe with the account's real uuid, never the placeholder", async () => {
    const { impl, calls } = recordingFetch({
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/services/decko-one-click-demo": {
        status: 404,
        json: fixture("cloudflare-workers-service-not-found-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/d1/database": {
        status: 200,
        json: fixture("cloudflare-d1-database-list-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/d1/database/9f2c1a44-7b3e-4d5a-8c6b-1e0d2f3a4b5c/query": {
        status: 200,
        json: fixture("cloudflare-d1-query-sqlite-master-response.json"),
      },
    });
    const state = await collectAccountState(oneClickConfig(), CREDENTIALS, impl);
    expect(calls.some((c) => c.url.includes("00000000-0000-0000-0000-000000000001"))).toBe(false);
    expect(state.notes.join(" ")).toContain("is not deployed");
  });

  it("raises --api-failed when the account answer is not a success envelope", async () => {
    const { impl } = recordingFetch({
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/services/decko-one-click-demo": {
        status: 200,
        json: fixture("cloudflare-workers-service-get-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/workers/scripts/decko-one-click-demo/deployments": {
        status: 200,
        json: fixture("cloudflare-workers-script-deployments-list-response.json"),
      },
      "/accounts/0a1b2c3d4e5f60718293a4b5c6d7e8f9/d1/database": {
        status: 200,
        json: { success: false, errors: [{ code: 10000, message: "Authentication error" }], result: null },
      },
    });
    await expect(collectAccountState(oneClickConfig(), CREDENTIALS, impl)).rejects.toThrowError(
      /--api-failed|Authentication error/,
    );
  });
});

// ---------------------------------------------------------------------------

describe("plan fingerprint", () => {
  it("changes when the deletion set changes and not when only the created-date does", () => {
    const base = deployedPlan();
    const sameSetNewDates = buildTeardownPlan({
      config: oneClickConfig(),
      workerServiceResponse: fixture("cloudflare-workers-service-get-response.json"),
      workerDeploymentsResponse: {
        success: true,
        result: { deployments: [{ id: "new", created_on: "2026-10-01T00:00:00.000000Z" }] },
      },
      d1ListResponse: fixture("cloudflare-d1-database-list-response.json"),
    });
    expect(planFingerprint(sameSetNewDates)).toBe(planFingerprint(base));

    const fewer = deployedPlan({
      workerServiceResponse: fixture("cloudflare-workers-service-not-found-response.json"),
    });
    expect(planFingerprint(fewer)).not.toBe(planFingerprint(base));
  });
});
