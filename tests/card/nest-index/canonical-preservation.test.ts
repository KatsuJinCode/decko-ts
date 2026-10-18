import { describe, expect, it } from "vitest";
import { createActionsTestStorage, seedCard, seedStandardDeck } from "../actions/actions-test-storage.js";
import { ensureNestIndex, readNestIndexMarker } from "../../../src/card/nest-index.js";
import { nestIndexStatement } from "../../../src/card/render/prefetch.js";
import { refreshReferencesOut, clearReferencesOnDelete } from "../../../src/card/actions/refresh-references-out.js";
import { hasNestEdgeCache, nestEdgeCacheAvailable } from "../../../src/card/nest-index-cache.js";

describe("derived nest cache preserves canonical relationships", () => {
  it("shares boot discovery with the same database's render wrapper without probing during render", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      expect(nestEdgeCacheAvailable(storage.engine.driver)).toBe(false);
      expect(await hasNestEdgeCache(storage.engine.driver)).toBe(false);
      await ensureNestIndex(storage.driver, storage.engine.lexicon);
      expect(nestEdgeCacheAvailable(storage.engine.driver)).toBe(true);
    } finally { storage.close(); }
  });
  it("retains structured and actor-dependent references, their identities, and history across boot", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await seedCard(storage, { id: 901, name: "Structured", dbContent: "" });
      await seedCard(storage, { id: 902, name: "Field", dbContent: "field" });
      await seedCard(storage, { id: 903, name: "Mixed", dbContent: "{{Field}} [[Field]] {{_user}}" });
      await storage.driver.query("INSERT INTO card_references(id,referer_id,referee_id,referee_key,ref_type) VALUES (801,901,902,'field','I'),(802,903,902,'field','L'),(803,903,901,'structured','I')", []);
      const snapshot = async () => {
        const rows: Record<string, unknown[]> = {};
        for (const table of ["cards", "card_references", "card_acts", "card_actions", "card_changes"])
          rows[table] = await storage.selectAll(`SELECT * FROM ${table} ORDER BY id`);
        return rows;
      };
      const before = await snapshot();
      expect((await ensureNestIndex(storage.driver, storage.engine.lexicon)).state).toBe("built");
      expect(await snapshot()).toEqual(before);
      const query = nestIndexStatement(901, true);
      expect((await storage.selectAll<{id:number}>(query.sql, query.params)).map(row => row.id)).toContain(902);
      const cached = await storage.selectAll("SELECT * FROM decko_nest_edges ORDER BY referer_id,referee_key");
      expect(cached.length).toBeGreaterThan(0);
      expect(await ensureNestIndex(storage.driver, storage.engine.lexicon)).toEqual({state:"current",dropped:0,scanned:0});
      expect(await storage.selectAll("SELECT * FROM decko_nest_edges ORDER BY referer_id,referee_key")).toEqual(cached);
      expect(await snapshot()).toEqual(before);
    } finally { storage.close(); }
  });

  it("invalidates hints on content refresh and deletion without removing other cards' hints", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await seedCard(storage, {id:901,name:"Holder",dbContent:"{{Target}}"});
      await seedCard(storage, {id:902,name:"Target",dbContent:"{{Holder}}"});
      await ensureNestIndex(storage.driver,storage.engine.lexicon);
      const name = await storage.engine.lexicon.name(901);
      if (!name) throw new Error("seeded Holder has no name");
      await refreshReferencesOut(storage.driver,storage.engine.lexicon,901,name,"plain");
      expect(await storage.selectAll("SELECT * FROM decko_nest_edges WHERE referer_id=901")).toEqual([]);
      expect(await storage.selectAll("SELECT * FROM decko_nest_edges WHERE referer_id=902")).toHaveLength(1);
      await clearReferencesOnDelete(storage.driver,902);
      expect(await storage.selectAll("SELECT * FROM decko_nest_edges")).toEqual([]);
    } finally { storage.close(); }
  });

  it("rejects a current marker whose derived table is absent and rebuilds without canonical writes", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await storage.driver.query("CREATE TABLE nest_index_meta(meta_key VARCHAR(64) PRIMARY KEY,meta_value VARCHAR(255))",[]);
      await storage.driver.query("INSERT INTO nest_index_meta VALUES('build_version','2')",[]);
      const before = await storage.selectAll("SELECT * FROM card_references ORDER BY id");
      expect(await readNestIndexMarker(storage.driver)).toEqual({state:"missing",version:2});
      expect((await ensureNestIndex(storage.driver,storage.engine.lexicon)).state).toBe("built");
      expect(await readNestIndexMarker(storage.driver)).toEqual({state:"current",version:2});
      expect(await storage.selectAll("SELECT * FROM card_references ORDER BY id")).toEqual(before);
    } finally { storage.close(); }
  });
});
