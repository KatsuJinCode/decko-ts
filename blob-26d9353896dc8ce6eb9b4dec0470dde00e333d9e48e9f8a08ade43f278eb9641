// Bunny Database reports a held write lock differently from SQLite. A second
// writer's BEGIN IMMEDIATE does not fail with "database is locked"; Bunny
// waits on the lock and then answers in-band with
//   { "type": "error", "error": { "message": "Transaction timed out", "code": "TRANSACTION_TIMEOUT" } }
// (observed against a real Bunny database, docs/hosted-conformance.md).
//
// Expected behaviour (each is asserted below):
//  1. That answer to BEGIN means another writer holds the lock: the driver
//     waits and retries within the transaction lock timeout, and both
//     transactions commit.
//  2. The same code on a statement inside an open transaction means the
//     save failed: it surfaces at once, the transaction is not retried and
//     BEGIN is sent once.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";

const BUNNY_BUSY = { message: "Transaction timed out", code: "TRANSACTION_TIMEOUT" };

const dirs: string[] = [];
const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function beginRequests(server: MockHranaServer): number {
  return server.requests.filter((r) => {
    const entries = (r.body as { requests?: { stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
    return entries.some((e) => e.stmt?.sql === "BEGIN IMMEDIATE");
  }).length;
}

describe("BunnyDbDriver: Bunny's TRANSACTION_TIMEOUT", () => {
  it("on BEGIN, waits for the other writer and retries; both transactions commit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-bunny-timeout-"));
    dirs.push(dir);
    const server = await startMockHranaServer({ path: join(dir, "deck.sqlite"), busyError: BUNNY_BUSY });
    servers.push(server);
    const a = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    const b = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    await a.query("CREATE TABLE t (v TEXT)", []);

    let second: Promise<string> | undefined;
    await a.transaction(async () => {
      await a.query("INSERT INTO t (v) VALUES (?)", ["first"]);
      second = b
        .transaction(async () => {
          await b.query("INSERT INTO t (v) VALUES (?)", ["second"]);
        })
        .then(
          () => "committed",
          (error: unknown) => String(error),
        );
      // Hold the write lock long enough for b's BEGIN to be refused.
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(await second).toBe("committed");

    const rows = await a.query<{ v: string }>("SELECT v FROM t ORDER BY rowid", []);
    expect(rows.rows.map((r) => r.v)).toEqual(["first", "second"]);
    // a's BEGIN, at least one refused BEGIN from b, and b's successful one.
    expect(beginRequests(server)).toBeGreaterThanOrEqual(3);
    expect(server.violations).toEqual([]);
  }, 30_000);

  it("inside an open transaction, surfaces at once and is not retried", async () => {
    const server = await startMockHranaServer();
    servers.push(server);
    const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    await driver.query("CREATE TABLE t (v TEXT)", []);

    const failed = driver.transaction(async () => {
      server.enqueueRawResponse(
        JSON.stringify({ baton: "baton-after-error", base_url: null, results: [{ type: "error", error: BUNNY_BUSY }] }),
      );
      await driver.query("INSERT INTO t (v) VALUES (?)", ["lost"]);
    });
    await expect(failed).rejects.toThrow(/Transaction timed out \(code TRANSACTION_TIMEOUT\)/);
    expect(beginRequests(server)).toBe(1);
  }, 30_000);
});
