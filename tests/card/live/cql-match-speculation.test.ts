import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { LiveStoreDriver } from "../../../src/card/live/live-store-driver.js";
import { executeQuery } from "../../../src/cql/execute.js";
import { registerSqliteRegexpFunction } from "../../../src/cql/sqlite-regexp.js";
import { splitSqlStatements } from "../render/render-test-storage.js";
import { startMockHranaServer } from "../../server/drivers/mock-hrana-server.js";

for (const mode of ["native-regexp", "http-no-udf"] as const) {
  describe(`speculative CQL match: ${mode}`, () => {
    it("preserves actual capability errors and complete matching/count/window semantics", async () => {
      const server = mode === "http-no-udf" ? await startMockHranaServer() : undefined;
      const local = server ? undefined : new LocalSqliteDriver({ path: ":memory:" });
      if (local) registerSqliteRegexpFunction(local);
      const base = local ?? new BunnyDbDriver({ url: server!.url, authToken: "owned-local" });
      try {
        for (const sql of splitSqlStatements(readFileSync(new URL("../../../db/schema.sqlite.sql", import.meta.url), "utf8"))) await base.query(sql, []);
        for (const [id, name] of [[12, "First Needle"], [13, "Second nEeDlE"], [14, "Unrelated"]] as const) {
          await base.query("INSERT INTO cards(id,name,key,type_id,trash,db_content,creator_id,updater_id,created_at,updated_at) VALUES(?,?,?,3,0,'',1,1,'2026-10-15 12:00:00','2026-10-15 12:00:00')", [id,name,name.toLowerCase().replaceAll(" ","_")]);
        }
        const live = new LiveStoreDriver(base, { compact: true });
        live.mode = "spec";
        const complete = async (query: Record<string, unknown>) => {
          for (let pass=0;pass<10;pass++) {
            const result = await executeQuery(live, query);
            if (live.pendingCount === 0) return result;
            await live.flushSpeculative();
          }
          throw new Error("CQL did not reach a complete answer");
        };
        const first = await complete({ match: "needle", sort: "id", dir: "asc", limit: 1 });
        expect("rows" in first && first.rows.map(row=>row.id)).toEqual([12]);
        const second = await complete({ match: "needle", sort: "id", dir: "asc", limit: 1, offset: 1 });
        expect("rows" in second && second.rows.map(row=>row.id)).toEqual([13]);
        const count = await complete({ match: "needle", return: "count" });
        expect("count" in count && count.count).toBe(2);
        const absent = await complete({ match: "zz_no_such_card_harness", limit: 20 });
        expect("rows" in absent && absent.rows).toEqual([]);
        await expect(complete({ match: "~~(" })).rejects.toThrow(/invalid REGEXP|regular expression|user-defined function/i);
        expect(server?.violations ?? []).toEqual([]);
        live.close();
      } finally { local?.close(); await server?.close(); }
    });
  });
}

