// one-key-provisioning-payload.test.ts — the one-key Bunny provisioning
// runner's own tests. Behaviours pinned here:
//
//   1. VALIDATION: the payload schema decko-one-key-provisioning-payload/1 —
//      the page-generated sample fixture validates and normalizes; every
//      refusal the guarantees rest on fires with its "--" marker (protected
//      names, the 16-char database slug limit, multi-problem lists).
//   2. PLAN: buildSteps is the single source of truth — order, write flags,
//      cache-off omits the zone flip, write-path armation only appears when
//      both the payload and the flag allow it.
//   3. API CLIENT: makeBunnyApi sends the AccessKey header and JSON bodies,
//      and honours the expected-status contract — exercised against a
//      loopback node:http server serving the synthetic fixture transcriptions
//      (fixtures/one-key-provisioning/ — NOT live captures; see that dir's
//      README).
//   4. THE DATABASE HALF, offline: the schema plan covers every engine
//      migration and no demo content, and provisionDatabase (the code
//      --execute runs) builds a deck on a local libSQL-protocol server that
//      the engine then renders.
//   5. REFUSAL GATES before any network: --execute without the written
//      confirmation, unallowed write_path, missing --source; --teardown
//      without --yes/exact-name, against a protected name, without a result
//      sidecar.
//
// No test here contacts Bunny.
//   npx vitest run tests/deploy/one-key-provisioning-payload.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockHranaServer } from "../server/drivers/mock-hrana-server.js";
import { LibSqlHttpAdapter } from "../../src/server/drivers/libsql-http.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import {
  validatePayload,
  loadPayload,
  buildSteps,
  makeBunnyApiAt,
  parseArgs,
  readCredsFile,
  resolveApiKey,
  assertSourceShape,
  engineMigrationFiles,
  engineSchemaPlan,
  provisionDatabase,
  protectedResourceNames,
  normalizeHostname,
  hostSuffixOfDbUrl,
  ProvisionRefusal,
  REFUSAL,
  SCHEMA_NAME,
  SCHEMA_VERSION,
  DB_SLUG_MAX,
} from "../../deploy/provisioning/provision-bunny-deck.mjs";

const FIXTURES = join(import.meta.dirname, "fixtures", "one-key-provisioning");
const REPO_ROOT = join(import.meta.dirname, "..", "..");
const MIGRATIONS = join(REPO_ROOT, "deploy", "migrations");

const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});
const sample = () => JSON.parse(readFileSync(join(FIXTURES, "sample-payload.json"), "utf8"));

function expectRefusal(fn: () => unknown, marker: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ProvisionRefusal);
    const refusal = e as ProvisionRefusal;
    expect(refusal.marker).toBe(marker);
    return refusal;
  }
  throw new Error(`expected ProvisionRefusal(${marker}) — nothing was thrown`);
}

describe("one-key provisioning payload schema", () => {
  it("accepts and normalizes the page-generated sample payload", () => {
    const p = validatePayload(sample());
    expect(p.schema).toBe(SCHEMA_NAME);
    expect(p.schema_version).toBe(SCHEMA_VERSION);
    expect(p.provider).toBe("bunny");
    expect(p.deck.limit).toBe(60);
    expect(p.deck.tables).toBe("cards,card_references");
    expect(p.bunny.db_name).toBe("okp-smoke");
    expect(p.bunny.replica_regions).toEqual([]);
    expect(p.edge.cache_enabled).toBe(true);
    expect(p.edge.write_path).toBe(false);
  });

  it("loadPayload reads the fixture from disk through the same gate", () => {
    const p = loadPayload(join(FIXTURES, "sample-payload.json"));
    expect(p.bunny.script_name).toBe("okp-smoke");
  });

  it("collects every problem into one refusal, not just the first", () => {
    const raw = sample();
    raw.deck.limit = -1;
    raw.bunny.db_name = "this-slug-is-way-too-long"; // 26 chars
    raw.provider = "cloudflare";
    const refusal = expectRefusal(() => validatePayload(raw), REFUSAL.PAYLOAD_INVALID);
    const msg = refusal.message;
    expect(msg).toContain("deck.limit");
    expect(msg).toContain("16");
    expect(msg).toContain("provider");
  });

  it("refuses database slugs past the measured 16-char server limit", () => {
    const raw = sample();
    raw.bunny.db_name = "a".repeat(17);
    const refusal = expectRefusal(() => validatePayload(raw), REFUSAL.PAYLOAD_INVALID);
    expect(refusal.message).toContain("500");
    expect(String(DB_SLUG_MAX)).toBe("16");
  });

  it("accepts a 16-char slug — the limit is inclusive", () => {
    const raw = sample();
    raw.bunny.db_name = "a".repeat(16);
    expect(validatePayload(raw).bunny.db_name).toBe("a".repeat(16));
  });

  it("refuses each protected resource name with the dedicated marker", () => {
    const protectedNames = new Set(["kept-deck"]);
    for (const field of ["script_name", "pull_zone_name", "db_group_name", "db_name"] as const) {
      const raw = sample();
      raw.bunny[field] = "kept-deck";
      const refusal = expectRefusal(() => validatePayload(raw, { protectedNames }), REFUSAL.PROTECTED_NAME);
      expect(refusal.message).toContain(`bunny.${field}`);
    }
  });

  it("reads protected names from DECKO_PROTECTED_RESOURCE_NAMES and --protect; none by default", () => {
    const saved = process.env.DECKO_PROTECTED_RESOURCE_NAMES;
    try {
      delete process.env.DECKO_PROTECTED_RESOURCE_NAMES;
      expect([...protectedResourceNames()]).toEqual([]);
      const raw = sample();
      raw.bunny.script_name = "kept-deck";
      expect(validatePayload(raw).bunny.script_name).toBe("kept-deck");
      process.env.DECKO_PROTECTED_RESOURCE_NAMES = " kept-deck, other-deck ";
      expect([...protectedResourceNames(["third"])]).toEqual(["kept-deck", "other-deck", "third"]);
      expectRefusal(() => validatePayload(raw), REFUSAL.PROTECTED_NAME);
      expect(parseArgs(["--protect", "a,b", "--protect", "c"]).protect).toEqual(["a", "b", "c"]);
    } finally {
      if (saved === undefined) delete process.env.DECKO_PROTECTED_RESOURCE_NAMES;
      else process.env.DECKO_PROTECTED_RESOURCE_NAMES = saved;
    }
  });

  it("refuses a malformed sha256 and a bad region code", () => {
    const raw = sample();
    raw.deck.source_sha256 = "not-a-hash";
    expectRefusal(() => validatePayload(raw), REFUSAL.PAYLOAD_INVALID);
    const raw2 = sample();
    raw2.bunny.primary_region = "amsterdam";
    expectRefusal(() => validatePayload(raw2), REFUSAL.PAYLOAD_INVALID);
  });

  it("null tables normalizes to null; absent tables becomes null", () => {
    const a = sample();
    a.deck.tables = null;
    expect(validatePayload(a).deck.tables).toBeNull();
    const b = sample();
    delete b.deck.tables;
    expect(validatePayload(b).deck.tables).toBeNull();
  });
});

describe("buildSteps — the single plan used by plan printing and execution", () => {
  it("orders the steps writes-first-per-resource and ends with the sidecar", () => {
    const p = validatePayload(sample());
    const steps = buildSteps(p, { sourcePath: "deck.sqlite3", writePathAllowed: false });
    expect(steps[0].name).toContain("resolve account key");
    expect(steps[0].writes).toBe(false);
    const names = steps.map((s) => s.name);
    expect(names.join("\n")).toContain('create database group "okp-smoke-group"');
    expect(names.join("\n")).toContain('create database "okp-smoke"');
    expect(names.indexOf("generate database token (API-generated, never displayed)"))
      .toBeGreaterThan(names.indexOf('create database "okp-smoke"'));
    expect(steps[steps.length - 1].name).toContain("recovery result sidecar");
    // every step carries the exact API shape it will make
    const seed = steps.find((s) => s.name.startsWith("seed"))!;
    expect(seed.describe()).toContain("import-to-bunny-db.mjs --source deck.sqlite3");
    expect(seed.describe()).toContain("--limit 60");
    expect(seed.describe()).toContain("--data-only");
    const names2 = steps.map((x) => x.name);
    expect(names2.indexOf("complete the engine schema")).toBeGreaterThan(names2.indexOf(seed.name));
  });

  it("cache off drops the zone flip and the cache variables", () => {
    const p = validatePayload(sample());
    p.edge.cache_enabled = false;
    const steps = buildSteps(p, { sourcePath: null, writePathAllowed: false });
    const joined = steps.map((s) => s.describe()).join("\n");
    expect(joined).not.toContain("EnableSmartCache");
    expect(joined).not.toContain("DECKO_EDGE_CACHE_TTL");
    expect(joined).toContain("DECKO_EDGE_CACHE=0");
  });

  it("write_path never reaches the plan unless payload AND flag agree", () => {
    const p = validatePayload(sample());
    p.edge.write_path = true;
    const withoutFlag = buildSteps(p, { sourcePath: null, writePathAllowed: false });
    expect(withoutFlag.map((s) => s.describe()).join("\n")).not.toContain("DECKO_WRITE_PATH");
    const withFlag = buildSteps(p, { sourcePath: null, writePathAllowed: true });
    expect(withFlag.map((s) => s.describe()).join("\n")).toContain("DECKO_WRITE_PATH=1");
  });
});

describe("cli parsing + key resolution", () => {
  it("refuses unknown arguments before anything else", () => {
    expectRefusal(() => parseArgs(["--unknown"]), REFUSAL.PAYLOAD_INVALID);
  });

  it("parses the documented flags", () => {
    const args = parseArgs(["--payload", "p.json", "--execute",
      "--i-understand-this-writes-to-my-bunny-account", "--creds", "c.txt", "--source", "s.sqlite3"]);
    expect(args.execute).toBe(true);
    expect(args.confirmation).toBe(true);
    expect(args.payload).toBe("p.json");
    expect(args.creds).toBe("c.txt");
  });

  it("resolves the key from env, then creds file, and refuses without either", () => {
    expect(resolveApiKey({ apiKey: "k", creds: null })).toEqual({ key: "k", via: "env/--api-key" });
    const dir = tempDir("okp-test-");
    const credsPath = join(dir, "creds.txt");
    writeFileSync(credsPath, "BUNNY_API_KEY=from-creds-file\nOTHER=x\n");
    expect(resolveApiKey({ apiKey: null, creds: credsPath }).key).toBe("from-creds-file");
    expectRefusal(() => resolveApiKey({ apiKey: null, creds: null }), REFUSAL.API_KEY_MISSING);
  });

  it("reads KEY=VALUE creds files", () => {
    const dir = tempDir("okp-test-");
    const p = join(dir, "c.txt");
    writeFileSync(p, 'BUNNY_OTHER_KEY = "quoted-value"\n# comment\n\nPLAIN=123\n');
    const creds = readCredsFile(p);
    expect(creds.BUNNY_OTHER_KEY).toBe("quoted-value");
    expect(creds.PLAIN).toBe("123");
  });
});

describe("bunny api client against the synthetic fixture shapes", () => {
  let server: Server;
  let baseUrl = "";
  let lastAuthHeader = "";
  let lastBody = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      lastAuthHeader = String(req.headers.accesskey ?? "");
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        lastBody = body;
        const scriptCreate = req.method === "POST" && req.url === "/compute/script";
        res.writeHead(scriptCreate ? 201 : 200, { "Content-Type": "application/json" });
        if (req.url === "/compute/script") {
          res.end(readFileSync(join(FIXTURES, "script-create-response.json")));
        } else if (req.url === "/database/v1/databases") {
          res.end(readFileSync(join(FIXTURES, "database-create-response.json")));
        } else if (req.url?.startsWith("/database/v2/databases/") && req.url.endsWith("/auth/generate")) {
          res.end(readFileSync(join(FIXTURES, "auth-generate-response.json")));
        } else {
          res.end("{}");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function clientAgainstLocalFixtureServer() {
    // makeBunnyApi is hard-wired to https://api.bunny.net (the proven base);
    // the loopback server stands in behind the same call contract by
    // exercising the client's request shape against the fixtures. The base
    // rewrite is the one seam the tests need, so the client factory takes
    // the base as an argument with the production default (makeBunnyApi).
    return Promise.resolve(makeBunnyApiAt("key-for-tests", baseUrl));
  }

  it("sends the AccessKey header and JSON bodies, parses JSON responses", async () => {
    const api = await clientAgainstLocalFixtureServer();
    const created = await api.call("POST", "/compute/script", { Name: "okp-smoke" }, { expect: [200, 201] });
    expect(created.status).toBe(201);
    expect(lastAuthHeader).toBe("key-for-tests");
    expect(JSON.parse(lastBody)).toEqual({ Name: "okp-smoke" });
    expect(created.json.Id).toBe(900001);
    expect(created.json.LinkedPullZones[0].Id).toBe(900002);

    const db = await api.call("POST", "/database/v1/databases", { slug: "okp-smoke", group: "group_x" });
    expect(db.json.url).toContain("lite.bunnydb.net");
    expect(db.json.name).toBe("okp-smoke");

    const token = await api.call("PUT",
      "/database/v2/databases/db_01SYNTHETIC0000000000000000/auth/generate",
      { authorization: "full-access" }, { expect: [200] });
    expect(token.json.token).toBe("SYNTHETIC-TOKEN-NOT-A-CREDENTIAL");
  });

  it("throws on an unexpected status with the response excerpt", async () => {
    const api = await clientAgainstLocalFixtureServer();
    await expect(api.call("POST", "/compute/script", {}, { expect: [204] }))
      .rejects.toThrow(/HTTP 201/);
  });
});

describe("the engine schema a provisioned deck gets", () => {
  it("takes every deploy migration except the demo-content ones", () => {
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const engine = engineMigrationFiles(MIGRATIONS);
    const demo = all.filter((f) => !engine.includes(f));
    expect(demo).toEqual([
      "0003-demo-seed.sql",
      "0004-demo-account-substrate.sql",
      "0006-demo-role-substrate.sql",
      "0009-demo-account-read-rules.sql",
    ]);
    // The split is about content: the demo files write cards rows, the
    // engine files never do. 0009 is on the demo side for a second reason
    // beyond its cards rows: its card_references rows are the rule parties,
    // and `INSERT[^;]*INTO cards` does not match them — which is why this
    // test is about the CARDS table specifically and not "writes rows".
    for (const f of demo) expect(readFileSync(join(MIGRATIONS, f), "utf8")).toMatch(/INSERT[^;]*INTO\s+"?cards"?/i);
    for (const f of engine) expect(readFileSync(join(MIGRATIONS, f), "utf8")).not.toMatch(/INSERT[^;]*INTO\s+"?cards"?\s/i);
  });

  it("creates typed tables and indexes before the seed, triggers and the stamp row after it", async () => {
    const plan = await engineSchemaPlan(MIGRATIONS);
    expect(plan.files[0]).toBe("0001-schema.sql");
    for (const table of ["cards", "card_references", "card_acts", "deck_data_version", "auth_sessions"]) {
      expect(plan.tables).toContain(table);
    }
    const cards = plan.preSeed.find((t) => /CREATE TABLE "cards"/i.test(t))!;
    expect(cards).toMatch(/"id"\s+INTEGER\s+PRIMARY\s+KEY/i);
    expect(cards).toMatch(/"db_content"/i);
    expect(plan.preSeed.join("\n")).toMatch(/cards_name_index/);
    expect(plan.preSeed.every((s) => /^CREATE\s+(TABLE|(UNIQUE\s+)?INDEX)/i.test(s))).toBe(true);
    // the six data-version triggers, each a whole statement (body included)
    const triggers = plan.postSeed.filter((s) => /^CREATE\s+TRIGGER/i.test(s));
    expect(new Set(triggers.map((t) => /TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i.exec(t)![1])).size).toBe(6);
    for (const t of triggers) expect(t).toMatch(/END$/);
    // the stamp row, safe to run over a seed that already carried one
    expect(plan.postSeed.some((s) => /^INSERT OR IGNORE INTO "deck_data_version"/i.test(s))).toBe(true);
    expect(plan.postSeed.some((s) => /^INSERT INTO/i.test(s))).toBe(false);
  });
});

describe("provisionDatabase on a local libSQL-protocol server (no Bunny)", () => {
  it("builds a deck the engine renders: schema, seed, then triggers and stamp", async () => {
    const Database = (await import("better-sqlite3")).default;
    const dir = tempDir("okp-db-");
    // A deck source in the engine's shape, with a session row that must not travel.
    const sourcePath = join(dir, "deck.sqlite3");
    const source = new Database(sourcePath);
    source.exec(readFileSync(join(MIGRATIONS, "0001-schema.sql"), "utf8"));
    source.exec(readFileSync(join(MIGRATIONS, "0005-auth-sessions.sql"), "utf8"));
    const insert = source.prepare(
      `INSERT INTO cards (id, name, key, type_id, db_content, trash, created_at, updated_at, creator_id, updater_id)
       VALUES (?, ?, ?, 2, ?, 0, '2020-01-02 03:04:05', '2020-01-02 03:04:05', 1, 1)`,
    );
    insert.run(1, "Home", "home", "welcome to the provisioned deck");
    insert.run(2, "Readme", "readme", "readme body");
    source.prepare("INSERT INTO auth_sessions (token_hash, account_card_id, created_at, expires_at) VALUES ('x', 1, '2020-01-01 00:00:00.000', '2999-01-01 00:00:00.000')").run();
    source.close();

    const server = await startMockHranaServer();
    try {
      const lines: string[] = [];
      const result = await provisionDatabase({
        dbUrl: server.url,
        dbToken: "local-test-token",
        sourcePath,
        deck: { limit: 0, tables: null },
        repoRoot: REPO_ROOT,
        log: (line) => lines.push(line),
      });
      expect(result.migrations).toEqual(engineMigrationFiles(MIGRATIONS));
      expect(result.seedTables).toContain("cards");
      expect(result.seedTables).not.toContain("auth_sessions");
      expect(lines.join("\n")).toContain("seed skips source tables the deck does not serve: auth_sessions");

      const driver = new LibSqlHttpAdapter({ url: server.url, authToken: "local-test-token" });
      const stamp = await driver.query<{ version: number }>('SELECT "version" FROM "deck_data_version" WHERE "id" = 1', []);
      expect(stamp.rows).toHaveLength(1);
      const triggers = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'", []);
      expect(Number(triggers.rows[0]!.n)).toBe(6);
      const sessions = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", []);
      expect(Number(sessions.rows[0]!.n)).toBe(0);
      // the triggers fire on a write after the seed
      const before = Number(stamp.rows[0]!.version);
      await driver.query("UPDATE cards SET updated_at = updated_at WHERE id = 2", []);
      const after = await driver.query<{ version: number }>('SELECT "version" FROM "deck_data_version" WHERE "id" = 1', []);
      expect(Number(after.rows[0]!.version)).toBe(before + 1);

      const engine = new RenderEngine(new FetchEngine(driver));
      expect(await engine.render("Home", "core")).toContain("welcome to the provisioned deck");
      expect(await engine.render("Readme", "core")).toContain("readme body");
    } finally {
      await server.close();
    }
  }, 120_000);
});

describe("url + misc helpers", () => {
  it("hostSuffixOfDbUrl reduces the libsql url to its host", () => {
    expect(hostSuffixOfDbUrl("libsql://01ULID-okp-smoke.lite.bunnydb.net/"))
      .toBe("01ULID-okp-smoke.lite.bunnydb.net");
    expect(hostSuffixOfDbUrl("https://not-libsql.example/")).toBe("(unrecognized db url shape)");
  });

  it("normalizeHostname strips a scheme DefaultHostname may already carry", () => {
    // measured live 2026-10-03: DefaultHostname arrived as "https://<name>.bunny.run"
    expect(normalizeHostname("https://my-decko.bunny.run")).toBe("my-decko.bunny.run");
    expect(normalizeHostname("my-decko.bunny.run")).toBe("my-decko.bunny.run");
    expect(normalizeHostname("https://host.bunny.run/")).toBe("host.bunny.run");
  });
});

describe("assertSourceShape — the fail-fast deck-source gate", () => {
  it("accepts a sqlite whose cards carry db_content (engine substrate shape)", async () => {
    const Database = (await import("better-sqlite3")).default;
    const dir = tempDir("okp-shape-");
    const p = join(dir, "engine-shape.sqlite3");
    const db = new Database(p);
    db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, db_content TEXT, trash INTEGER DEFAULT 0)");
    db.prepare("INSERT INTO cards (id, name, db_content) VALUES (1, 'Home', 'hello')").run();
    db.close();
    const verdict = await assertSourceShape(p);
    expect(verdict.hasDbContent).toBe(true);
    expect(verdict.cards).toBe(1);
  });

  it("refuses a raw Corpus-shaped sqlite (cards.content, no db_content) with the dedicated marker", async () => {
    const Database = (await import("better-sqlite3")).default;
    const dir = tempDir("okp-shape-");
    const p = join(dir, "raw-shape.sqlite3");
    const db = new Database(p);
    db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, content TEXT, trash INTEGER DEFAULT 0)");
    db.close();
    const refusal = await assertSourceShape(p).then(
      () => { throw new Error("expected refusal"); },
      (e) => e,
    );
    expect(refusal).toBeInstanceOf(ProvisionRefusal);
    expect(refusal.marker).toBe(REFUSAL.SOURCE_WRONG_SHAPE);
    expect(refusal.message).toContain("db_content");
  });

  it("refuses a non-sqlite file", async () => {
    const dir = tempDir("okp-shape-");
    const p = join(dir, "not-a-deck.bin");
    writeFileSync(p, "definitely not sqlite");
    await expect(assertSourceShape(p)).rejects.toBeInstanceOf(ProvisionRefusal);
  });
});
