import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { registerSqliteRegexpFunction } from "../../../src/cql/sqlite-regexp.js";
import { ModLoader, setDefaultModLoader } from "../../../src/card/mod-loader.js";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";
import { startMockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import {
  BOOTSTRAP_READ_SUBSTRATE_IDS, CountingRenderDriver, seedCard, bindModLoaderToEngine,
  seedStockReadSubstrate, splitSqlStatements, type RenderTestStorage,
} from "./render-test-storage.js";

// The renderer must use the same executor as /api/query. Stock Ruby's
// modern SQLite3Adapter lacks #match; that adapter-specific failure is not
// the behavior of its MySQL/PostgreSQL implementations (decision 0005).
for (const mode of ["sqlite-regexp", "bunny-hrana-no-udf"] as const) {
  describe(`rendered CQL match through ${mode}`, () => {
    async function fixture() {
      const server = mode === "bunny-hrana-no-udf" ? await startMockHranaServer() : undefined;
      const local = server === undefined ? new LocalSqliteDriver({ path: ":memory:" }) : undefined;
      if (local !== undefined) registerSqliteRegexpFunction(local);
      const driver = local ?? new BunnyDbDriver({ url: server!.url, authToken: "local-test" });
      for (const sql of splitSqlStatements(readFileSync(new URL("../../../db/schema.sqlite.sql", import.meta.url), "utf8"))) {
        await driver.query(sql, []);
      }
      const counting = new CountingRenderDriver(driver);
      const fetcher = new FetchEngine(counting);
      const storage: RenderTestStorage = {
        counting, fetcher, engine: new RenderEngine(fetcher), close() { local?.close(); },
      };
      await seedStockReadSubstrate(storage);
      const read = { readRuleId: BOOTSTRAP_READ_SUBSTRATE_IDS.rule, readRuleClass: "*all" };
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2, ...read });
      await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2, ...read });
      await seedCard(storage, { id: 10, name: "Hidden Needle", dbContent: "SECRET_RESULT", typeId: 2, readRuleId: 999, readRuleClass: "*self" });
      await seedCard(storage, { id: 11, name: "Unrelated", dbContent: "NONMATCH_RESULT", typeId: 2, ...read });
      await seedCard(storage, { id: 12, name: "First nEeDlE", dbContent: "VISIBLE_RESULT_ONE", typeId: 2, ...read });
      await seedCard(storage, { id: 13, name: "Second Needle", dbContent: "VISIBLE_RESULT_TWO", typeId: 2, ...read });
      async function search(query: Record<string, unknown>, view = "content") {
        await seedCard(storage, { id: 500, name: "Match Results", typeId: 98, dbContent: JSON.stringify(query), ...read });
        return storage.engine.render("Match Results", view);
      }
      return { storage, server, search, async close() { storage.close(); await server?.close(); } };
    }

    it("filters case-insensitive substring matches and permissions before the result window", async () => {
      const f = await fixture();
      try {
        const html = await f.search({ match: "needle", type: 2, sort: "id", dir: "asc", limit: 1 });
        expect(html).toContain('data-card-id="12"');
        expect(html).not.toContain('data-card-id="13"');
        expect(html).not.toContain("Hidden Needle");
        expect(html).not.toContain("Unrelated");
        const second = await f.storage.engine.render("Match Results", "content", { search: { offset: 1 } });
        expect(second).toContain('data-card-id="13"');
        expect(second).not.toContain('data-card-id="12"');
        expect(f.storage.counting.statements.some(sql => /REGEXP/i.test(sql))).toBe(true);
        expect(f.server?.violations ?? []).toEqual([]);
      } finally { await f.close(); }
    });

    it("surfaces malformed regular expressions instead of a successful empty result", async () => {
      const f = await fixture();
      try {
        await expect(f.search({ match: "~~(unclosed", type: 2 })).rejects.toThrow(/invalid REGEXP pattern/);
      } finally { await f.close(); }
    });

    it("counts on demand without installing a whole-deck warm, then observes read revocation", async () => {
      const f = await fixture();
      const loader = new ModLoader([{ manifest: cardModSearch }]);
      loader.load();
      bindModLoaderToEngine(f.storage, loader);
      try {
        // An unreachable invalid search must not be parsed by a whole-deck warm.
        await seedCard(f.storage, { id: 501, name: "Unrelated broken search", typeId: 98, dbContent: "invalid" });
        expect(await f.search({ match: "needle", type: 2, limit: 1 }, "count")).toBe("2");
        expect(await f.storage.engine.render("Match Results", "content")).toContain('data-card-id="12"');
        await f.storage.counting.query("UPDATE cards SET read_rule_id = 999, read_rule_class = '*self' WHERE id = 13", []);
        expect(await f.storage.engine.render("Match Results", "count")).toBe("1");
        await f.storage.counting.query("UPDATE cards SET read_rule_id = 999, read_rule_class = '*self' WHERE id = 12", []);
        expect(await f.storage.engine.render("Match Results", "count")).toBe("0");
      } finally { loader.reset(); setDefaultModLoader(undefined); await f.close(); }
    });
  });
}
