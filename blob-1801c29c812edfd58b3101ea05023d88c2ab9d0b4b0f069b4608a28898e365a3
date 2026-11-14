// Shared transaction conformance suite: every adapter that offers
// transaction() must pass it. It checks the properties every adapter
// promises (src/server/driver.ts SQLTransactionGuarantee): a failure
// anywhere inside the unit of work leaves the rows as they were, a success
// persists all of it, the work reads its own writes, and two transactions
// through one driver object never interleave.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { supportsTransactions } from "../../../src/server/driver.js";

export interface TransactionalDriverUnderTest {
  driver: SQLDatabaseDriver;
  dispose?: () => void | Promise<void>;
}

/** The factory must give a driver over a fresh database in which the table
 *  `conf_tx` (created by the suite) is covered by the adapter's
 *  transaction (compensating adapters: journaled). */
export function runTransactionConformance(
  suiteName: string,
  factory: () => TransactionalDriverUnderTest | Promise<TransactionalDriverUnderTest>,
): void {
  describe(suiteName, () => {
    let handle: TransactionalDriverUnderTest;
    let driver: SQLDatabaseDriver;

    beforeAll(async () => {
      handle = await factory();
      driver = handle.driver;
      await driver.query("CREATE TABLE conf_tx (id INTEGER PRIMARY KEY AUTOINCREMENT, s TEXT, n INTEGER)", []);
    }, 60_000);

    afterAll(async () => {
      await handle?.dispose?.();
    });

    const rows = async () =>
      (await driver.query<{ id: number; s: string; n: number | null }>("SELECT id, s, n FROM conf_tx ORDER BY id", []))
        .rows.map((r) => ({ id: Number(r.id), s: r.s, n: r.n === null ? null : Number(r.n) }));

    const reset = async () => {
      await driver.query("DELETE FROM conf_tx", []);
      await driver.query("INSERT INTO conf_tx (id, s, n) VALUES (1, 'one', 1), (2, 'two', 2)", []);
    };

    it("declares its guarantee, and it is atomic on failure", () => {
      expect(supportsTransactions(driver)).toBe(true);
      expect(driver.transactionGuarantee?.atomicOnFailure).toBe(true);
    });

    it("persists every write of a unit of work that succeeds", async () => {
      await reset();
      const value = await driver.transaction!(async () => {
        await driver.query("INSERT INTO conf_tx (s, n) VALUES (?, ?)", ["three", 3]);
        await driver.query("UPDATE conf_tx SET s = ? WHERE id = 1", ["uno"]);
        await driver.query("DELETE FROM conf_tx WHERE id = 2", []);
        return "done";
      });
      expect(value).toBe("done");
      expect((await rows()).map((r) => r.s)).toEqual(["uno", "three"]);
    });

    it("reads its own writes inside the unit of work", async () => {
      await reset();
      await driver.transaction!(async () => {
        await driver.query("INSERT INTO conf_tx (s, n) VALUES ('seen', 9)", []);
        const inside = await driver.query<{ c: number }>("SELECT COUNT(*) AS c FROM conf_tx WHERE s = 'seen'", []);
        expect(Number(inside.rows[0].c)).toBe(1);
      });
    });

    it("undoes inserts, updates, deletes and batches when the work throws, and rethrows the same error", async () => {
      await reset();
      const before = await rows();
      const failure = new Error("injected failure");
      await expect(
        driver.transaction!(async () => {
          await driver.query("INSERT INTO conf_tx (s, n) VALUES ('new', 3)", []);
          await driver.query("UPDATE conf_tx SET s = 'changed', n = NULL WHERE id = 1", []);
          await driver.query("DELETE FROM conf_tx WHERE id = 2", []);
          await driver.batch([
            { sql: "INSERT INTO conf_tx (s, n) VALUES ('batched', 4)", params: [] },
            { sql: "UPDATE conf_tx SET n = 99 WHERE s = 'new'", params: [] },
          ]);
          // A row inserted, updated and deleted inside the same unit.
          const ins = await driver.query("INSERT INTO conf_tx (s, n) VALUES ('transient', 5)", []);
          await driver.query("UPDATE conf_tx SET s = 'transient2' WHERE id = ?", [Number(ins.lastInsertRowId)]);
          await driver.query("DELETE FROM conf_tx WHERE id = ?", [Number(ins.lastInsertRowId)]);
          // A pre-existing row deleted and its id re-used.
          await driver.query("INSERT INTO conf_tx (id, s, n) VALUES (2, 'reused id', 7)", []);
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await rows()).toEqual(before);
    });

    it("undoes the work when a statement inside it fails", async () => {
      await reset();
      const before = await rows();
      await expect(
        driver.transaction!(async () => {
          await driver.query("UPDATE conf_tx SET s = 'changed' WHERE id = 1", []);
          await driver.query("INSERT INTO conf_tx (id, s) VALUES (1, 'duplicate primary key')", []);
        }),
      ).rejects.toThrow();
      expect(await rows()).toEqual(before);
    });

    it("lets the next transaction run after one fails", async () => {
      await reset();
      await expect(driver.transaction!(async () => Promise.reject(new Error("first fails")))).rejects.toThrow("first fails");
      await driver.transaction!(async () => {
        await driver.query("UPDATE conf_tx SET n = 10 WHERE id = 1", []);
      });
      expect((await rows())[0].n).toBe(10);
    });

    it("never interleaves two transactions on one driver object (no lost update)", async () => {
      await reset();
      const increment = () =>
        driver.transaction!(async () => {
          const r = await driver.query<{ n: number }>("SELECT n FROM conf_tx WHERE id = 1", []);
          const n = Number(r.rows[0].n);
          // Yield so the other transaction would run here if not serialized.
          await new Promise((resolve) => setTimeout(resolve, 20));
          await driver.query("UPDATE conf_tx SET n = ? WHERE id = 1", [n + 1]);
        });
      await Promise.all([increment(), increment(), increment()]);
      expect((await rows())[0].n).toBe(4);
    });
  });
}
