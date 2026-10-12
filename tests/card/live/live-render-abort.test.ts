// A live render whose request budget fired must stop sending statements:
// the edge answers 503 and an abandoned render would otherwise keep loading
// the database. The budget the edge enforces is 45 s.
import { describe, expect, it } from "vitest";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { LiveRenderAborted, LiveStoreDriver } from "../../../src/card/live/live-store-driver.js";

function countingDriver(): SQLDatabaseDriver & { batches: number } {
  const d = {
    batches: 0,
    async query<T>(): Promise<SQLQueryResult<T>> {
      d.batches += 1;
      return { rows: [], rowsAffected: 0 };
    },
    async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
      d.batches += 1;
      return stmts.map(() => ({ rows: [], rowsAffected: 0 }));
    },
  };
  return d as SQLDatabaseDriver & { batches: number };
}

describe("live render: the request budget stops it", () => {
  it("sends nothing once the signal is aborted", async () => {
    const base = countingDriver();
    const abort = new AbortController();
    const live = new LiveStoreDriver(base, { compact: false, signal: abort.signal });
    await live.query("SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["about"]);
    expect(base.batches).toBe(1);
    abort.abort();
    await expect(live.query("SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["home"])).rejects.toBeInstanceOf(
      LiveRenderAborted,
    );
    live.mode = "spec";
    await live.query("SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["zed"]);
    await expect(live.flushSpeculative()).rejects.toBeInstanceOf(LiveRenderAborted);
    expect(base.batches).toBe(1);
  });
});
