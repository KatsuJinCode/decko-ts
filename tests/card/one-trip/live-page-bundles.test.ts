import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { bootEdgeServingEngines } from "../../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import {
  clearKeptLivePages,
  diffLivePageBundle,
  liveRenderPage,
  liveSubstrateBundleKey,
} from "../../../src/card/live/live-render.js";
import type { SerializedLivePageBundle } from "../../../src/card/live/live-store-driver.js";
import { RequestStore } from "../../../src/card/live/request-store.js";
import { junctionChainQuery } from "../../../src/card/render/junction-chain-query.js";
import { copyFileSync, rmSync } from "node:fs";

describe("live_page_bundles 1-trip cold render and invalidation", () => {
  it("evaluates S17-junction-chain 3-part compound card queries accurately without off-by-one stride errors", () => {
    const store = new RequestStore();
    store.addRow({ id: 10, key: "*all", name: "*all", left_id: null, right_id: null, type_id: 1, trash: 0, db_content: "" }, true);
    store.addRow({ id: 20, key: "*create", name: "*create", left_id: null, right_id: null, type_id: 1, trash: 0, db_content: "" }, true);
    store.addRow({ id: 30, key: "*default", name: "*default", left_id: null, right_id: null, type_id: 1, trash: 0, db_content: "" }, true);
    store.addRow({ id: 40, key: "*all+*create", name: "*all+*create", left_id: 10, right_id: 20, type_id: 1, trash: 0, db_content: "" }, true);
    store.addRow({ id: 50, key: "*all+*create+*default", name: "*all+*create+*default", left_id: 40, right_id: 30, type_id: 1, trash: 0, db_content: "rule-val" }, true);
    store.leftComplete.add(10);
    store.leftComplete.add(40);

    const q = junctionChainQuery([["*all", "*create", "*default"]]);
    const miss = store.missing(q.sql, q.params ?? []);
    expect(miss).toBeDefined();
    expect(miss!.keys.length + miss!.lefts.length + miss!.fullIds.length).toBe(0);
    const ans = store.answer(q.sql, q.params ?? []);
    expect(ans.rows.length).toBe(1);
    expect(ans.rows[0]?.id).toBe(50);
    expect(ans.rows[0]?.db_content).toBe("rule-val");
  });

  it("handles concurrent cold discovery renders with persistBundles: true without corrupting substrate or deltas", async () => {
    const srcDb = "/tmp/corpus-v2-scrubbed.sqlite3";
    const testDb = `/tmp/test-live-bundles-concurrent-${process.pid}.sqlite3`;
    copyFileSync(srcDb, testDb);
    try {
      const initBase = new LocalSqliteDriver({ path: testDb });
      await initBase.query(`DROP TABLE IF EXISTS live_page_bundles`, []);
      clearKeptLivePages();

      const baseA = new LocalSqliteDriver({ path: testDb });
      const baseB = new LocalSqliteDriver({ path: testDb });
      const [discHome, discGlossary] = await Promise.all([
        liveRenderPage(
          baseA,
          "Home",
          async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
          { keepScope: "viewer:anonymous::default", persistBundles: true },
        ),
        liveRenderPage(
          baseB,
          "Glossary",
          async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
          { keepScope: "viewer:anonymous::default", persistBundles: true },
        ),
      ]);

      clearKeptLivePages();
      const coldBaseA = new LocalSqliteDriver({ path: testDb });
      const coldBaseB = new LocalSqliteDriver({ path: testDb });
      const coldHome = await liveRenderPage(
        coldBaseA,
        "Home",
        async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
        { keepScope: "viewer:anonymous::default", persistBundles: true },
      );
      const coldGlossary = await liveRenderPage(
        coldBaseB,
        "Glossary",
        async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
        { keepScope: "viewer:anonymous::default", persistBundles: true },
      );
      const norm = (s: string) => s.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "");
      expect(coldHome.stats.round_trips).toBe(1);
      expect(coldHome.stats.statements_sent).toBe(1);
      expect(norm(coldHome.html)).toBe(norm(discHome.html));
      expect(coldGlossary.stats.round_trips).toBe(1);
      expect(coldGlossary.stats.statements_sent).toBe(1);
      expect(norm(coldGlossary.html)).toBe(norm(discGlossary.html));
    } finally {
      try {
        rmSync(testDb, { force: true });
      } catch {
      }
    }
  }, 30000);

  it("serves cold renders in 1 round trip (1 statement, 1 pass) and invalidates on card update", async () => {
    const srcDb = "/tmp/corpus-v2-scrubbed.sqlite3";
    const testDb = `/tmp/test-live-bundles-${process.pid}.sqlite3`;
    copyFileSync(srcDb, testDb);
    try {
      const base1 = new LocalSqliteDriver({ path: testDb });
      await base1.query(
        `CREATE TABLE IF NOT EXISTS live_page_bundles (
          keep_key TEXT PRIMARY KEY,
          page_key TEXT NOT NULL,
          stamp INTEGER NOT NULL,
          payload_json TEXT NOT NULL
        )`,
        [],
      );
      await base1.query(`DELETE FROM live_page_bundles`, []);
      await base1.query(
        `CREATE TRIGGER IF NOT EXISTS trg_live_page_bundles_card_upd
         AFTER UPDATE ON cards
         BEGIN
           DELETE FROM live_page_bundles;
         END`,
        [],
      );

      let subBundle: SerializedLivePageBundle | undefined;
      let homeKey = "";
      let homeStamp = 0;
      const discHome = await liveRenderPage(
        base1,
        "Home",
        async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
        {
          onBundleDiscovered: (keepKey, stamp, bundle) => {
            homeKey = keepKey;
            homeStamp = stamp;
            subBundle = bundle;
          },
        },
      );
      expect(subBundle).toBeDefined();
      await base1.query(
        `INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)`,
        [liveSubstrateBundleKey(""), "__substrate__", homeStamp, JSON.stringify(subBundle)],
      );
      const homeDelta = diffLivePageBundle(subBundle!, subBundle!);
      await base1.query(
        `INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)`,
        [homeKey, "home", homeStamp, JSON.stringify(homeDelta)],
      );

      // Cold isolate render for Home
      clearKeptLivePages();
      const base2 = new LocalSqliteDriver({ path: testDb });
      const coldHome = await liveRenderPage(
        base2,
        "Home",
        async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
        { keepScope: "viewer:anonymous::default" },
      );
      const norm = (s: string) => s.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "");
      expect(coldHome.stats.round_trips).toBe(1);
      expect(coldHome.stats.statements_sent).toBe(1);
      expect(coldHome.passes.length).toBe(1);
      expect(norm(coldHome.html)).toBe(norm(discHome.html));

      // Edit Home card and verify invalidation
      await base2.query(
        `UPDATE cards SET db_content = db_content || '<!-- updated-marker-123 -->' WHERE key = 'home'`,
        [],
      );
      clearKeptLivePages();
      const base3 = new LocalSqliteDriver({ path: testDb });
      const afterEdit = await liveRenderPage(
        base3,
        "Home",
        async (d) => bootEdgeServingEngines(d, { skipNestIndexCheck: true }),
      );
      expect(afterEdit.html).toContain("<!-- updated-marker-123 -->");
    } finally {
      try {
        rmSync(testDb, { force: true });
      } catch {
      }
    }
  }, 30000);
});
