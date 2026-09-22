// Scratch probe (delete after reading): measures the corpus replay's two
// cost centers on the FULL corpus deck, so the 48-shard run can be sized
// before launch:
//   1. seed wall time (full-deck rows + both rule universes + closure)
//   2. one cold prefetch batch's wall time (the two walkStatement calls —
//      each recomputes the whole-deck `resolved` junction-key closure)
//   3. a warm re-render of the same card (must be ~0)
// Run: npx vitest run benchmarks/corpus-v2/cte-cost-probe.test.ts

import { describe, expect, it, afterAll } from "vitest";
import { createStructureSeededStorageFor } from "../../tests/card/render/structure-corpus-seeding.js";
import { readShardLines } from "../../tests/card/render/permission-corpus-seeding.js";

let storage: Awaited<ReturnType<typeof createStructureSeededStorageFor>> | undefined;
afterAll(() => {
  storage?.close();
});

describe("corpus replay cost probe", () => {
  it(
    "measures seed + cold prefetch + warm render wall time on the full deck",
    { timeout: 3_600_000 },
    async () => {
      const t0 = Date.now();
      const corpus = await import("better-sqlite3");
      const Database = corpus.default;
      const { CORPUS_DB } = await import("../../tests/card/render/permission-corpus-seeding.js");
      const db = new Database(CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      db.close();
      storage = await createStructureSeededStorageFor(new Set(everyLiveId));
      const seedMs = Date.now() - t0;
      console.log(`SEED_MS ${seedMs} (${everyLiveId.length} live rows)`);

      const first = readShardLines()[0] as { name: string };
      const card = await storage.fetcher.fetchByName(first.name);
      expect(card, `shard entry ${first.name} seeded`).toBeDefined();

      const t1 = Date.now();
      await storage.engine.render(first.name, "closed");
      const coldMs = Date.now() - t1;

      const t2 = Date.now();
      await storage.engine.render(first.name, "closed");
      const warmMs = Date.now() - t2;

      console.log(`COLD_MS ${coldMs}  WARM_MS ${warmMs}  card=${first.name}`);
      expect(true).toBe(true);
    },
  );
});
