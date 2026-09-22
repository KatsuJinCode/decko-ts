// Scratch probe (delete after reading): times ONE cold render's recorded
// statements individually on the seeded full deck, so the remaining heavy
// statement class is ranked by measured wall time (absolute numbers are
// skewed by a concurrent process; the RANKING is the output).
import { describe, expect, it, afterAll } from "vitest";
import Database from "better-sqlite3";
import {
  createStructureSeededStorageFor,
} from "../../tests/card/render/structure-corpus-seeding.js";
import { readShardLines, CORPUS_DB } from "../../tests/card/render/permission-corpus-seeding.js";

let storage: Awaited<ReturnType<typeof createStructureSeededStorageFor>> | undefined;
afterAll(() => {
  storage?.close();
});

describe("cold render statement costs (seeded full deck)", () => {
  it(
    "renders once, then times each recorded statement",
    { timeout: 3_600_000 },
    async () => {
      const t0 = Date.now();
      const db = new Database(CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      db.close();
      storage = await createStructureSeededStorageFor(new Set(everyLiveId));
      console.log(`SEED_MS ${Date.now() - t0}`);

      const first = readShardLines()[0] as { name: string };
      const t1 = Date.now();
      await storage.engine.render(first.name, "closed");
      console.log(`FIRST_RENDER_MS ${Date.now() - t1}`);

      const t2 = Date.now();
      await storage.engine.render(readShardLines()[1] as { name: string }, "closed");
      console.log(`SECOND_RENDER_MS ${Date.now() - t2}`);

      // Re-run each DISTINCT recorded statement once, ranked by wall time.
      const seen = new Map<string, number>();
      for (const sql of storage.counting.statements) {
        if (sql.startsWith("INSERT") || sql.startsWith("CREATE")) continue;
        if (!seen.has(sql)) seen.set(sql, 0);
      }
      const ranked: Array<{ sql: string; ms: number }> = [];
      for (const sql of seen.keys()) {
        const t = Date.now();
        try {
          await storage.fetcher.driver.query(sql, []);
        } catch {
          /* parametrized statements can't re-run bare; skip */
        }
        ranked.push({ sql, ms: Date.now() - t });
      }
      ranked.sort((a, b) => b.ms - a.ms);
      for (const r of ranked.slice(0, 8)) {
        console.log(`STMT_MS ${r.ms} :: ${r.sql.replace(/\s+/g, " ").slice(0, 150)}`);
      }
      expect(true).toBe(true);
    },
  );
});
