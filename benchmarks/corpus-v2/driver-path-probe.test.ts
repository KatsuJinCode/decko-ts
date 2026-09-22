// Scratch probe (delete after reading): on the SEEDED engine storage (full
// corpus deck), bisects the driver path that the raw-sqlite experiments
// cleared: trivial query through the driver, fetchByName, then the composed
// walk. Times each separately.
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

describe("driver path bisection (seeded engine storage)", () => {
  it(
    "times driver trivial query, fetchByName, then the composition",
    { timeout: 3_600_000 },
    async () => {
      const t0 = Date.now();
      const db = new Database(CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      db.close();
      storage = await createStructureSeededStorageFor(new Set(everyLiveId));
      console.log(`SEED_MS ${Date.now() - t0} rows=${everyLiveId.length}`);

      let t = Date.now();
      await storage.fetcher.driver.query("SELECT COUNT(*) AS n FROM cards", []);
      console.log(`TRIVIAL_QUERY_MS ${Date.now() - t}`);

      let t = Date.now();
      const watch = setInterval(() => {
        const stmts = storage!.counting.statements;
        const last = stmts[stmts.length - 1] ?? "(none)";
        console.log(
          `WATCH ${((Date.now() - t) / 1000) | 0}s stmts=${stmts.length} last=${last.slice(0, 140)}`,
        );
      }, 10_000);
      const card = await storage.fetcher.fetchByName(first.name);
      clearInterval(watch);
      console.log(`FETCH_BY_NAME_MS ${Date.now() - t} key=${card?.key ?? "none"}`);
      expect(card).toBeDefined();

      const RESOLVED =
        `WITH RECURSIVE resolved(id, ckey) AS (\n` +
        `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
        `  UNION\n` +
        `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
        `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
        `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
        `  UNION\n` +
        `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
        `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
        `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
        `)\n` +
        `SELECT COUNT(*) AS n FROM resolved`;
      t = Date.now();
      const res = await storage.fetcher.driver.query(RESOLVED, []);
      console.log(
        `RESOLVED_COUNT_MS ${Date.now() - t} rows=${(res.rows[0] as { n: number }).n}`,
      );
      expect(true).toBe(true);
    },
  );
});
