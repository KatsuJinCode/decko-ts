// An unset parameter (undefined) binds as NULL, as it does on the local
// driver (better-sqlite3). Before this, BunnyDbDriver threw a TypeError for
// it, so the same save failed on Bunny and succeeded locally.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";

const servers: MockHranaServer[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("BunnyDbDriver: undefined parameters bind as NULL", () => {
  it("a stand-alone query and a batch store NULL, the same as the local driver", async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-bunny-undef-"));
    dirs.push(dir);
    const server = await startMockHranaServer({ path: join(dir, "deck.sqlite") });
    servers.push(server);
    const bunny = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    const local = new LocalSqliteDriver({ path: ":memory:" });
    try {
      for (const driver of [bunny, local]) {
        await driver.query("CREATE TABLE t (a TEXT, b INTEGER)", []);
        await driver.query("INSERT INTO t (a, b) VALUES (?, ?)", [undefined, undefined]);
        await driver.batch([{ sql: "INSERT INTO t (a, b) VALUES (?, ?)", params: [undefined, 2] }]);
      }
      const onBunny = await bunny.query<{ a: unknown; b: unknown }>("SELECT a, b FROM t ORDER BY rowid", []);
      const onLocal = await local.query<{ a: unknown; b: unknown }>("SELECT a, b FROM t ORDER BY rowid", []);
      expect(onBunny.rows).toEqual([
        { a: null, b: null },
        { a: null, b: 2 },
      ]);
      expect(onBunny.rows).toEqual(onLocal.rows);
      expect(server.violations).toEqual([]);
    } finally {
      local.close();
    }
  });

  it("a non-bindable value still fails loudly", async () => {
    const server = await startMockHranaServer();
    servers.push(server);
    const bunny = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    await expect(bunny.query("SELECT ?", [{ not: "bindable" }])).rejects.toThrow(/unsupported parameter type/);
  });
});
