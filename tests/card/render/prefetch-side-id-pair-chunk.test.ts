// prefetch-side-id-pair-chunk.test.ts -- the cold prefetch closure's
// junction-id-pair round must not exceed SQLite's expression-depth limit.
//
// THE BUG (perm-leak, 2026-09-29): prefetchInclusionClosure's round
// builder (src/card/render/prefetch.ts, the sideIdPairs branch) joined a
// round's known-sided junction targets with one OR-tuple per pair —
// `(j.left_id = ? AND j.right_id = ?) OR ...` — unbounded in the frontier
// size. SQLite's SQLITE_MAX_EXPR_DEPTH (default 1000) counts every OR arm
// toward the expression tree, so a round with >~1000 pairs dies with
// "SqliteError: Expression tree is too large (maximum depth 1000)". The
// throw kills the WHOLE folded cold batch — the permission statements ride
// that batch (src/card/render.ts render()) — so the render-permission state
// never resolves, the prepare render dies, and (on the page path, which
// catches prepare errors and continues) the sync render runs with ZERO
// verdicts: isDenied answers false for every card and read-denied bodies
// render in full (the a work item triage's 130 denial-wrapper-leak pages;
// corpus proof: 20120122+BW+RVW's closure round carried 1019 id pairs).
//
// THE FIX: chunk the id pairs into statements of 400 pairs (800 params —
// under the depth limit and under the classic 999-variable limit), all
// riding the SAME driver.batch (still one round trip; small rounds keep
// the single-statement shape).
//
// This test builds the minimal deck that reproduces the frontier shape:
// 1100 compound-sided junction targets whose sides are already known, so
// one closure round emits 1100 id pairs. RED on the unchunked builder
// (SqliteError), GREEN with the chunk.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

const PAIRS = 1100; // > the 1000 expression-depth limit the bug trips

async function seedChunkStressDeck(storage: RenderTestStorage): Promise<string> {
  // Shared simple right side.
  await seedCard(storage, { id: 2, name: "Chunk Stress Right", typeId: 1 });
  // 1100 compound sides "Chunk Seed A i+Chunk Seed X i" (junction rows of two
  // simple cards) and 1100 targets "…+Chunk Stress Right" (compound-sided
  // junctions). The closure resolves the sides in one round (IN-list join)
  // and the targets in the NEXT round by side-ID pairs — the round shape
  // that blew the depth limit.
  for (let i = 1; i <= PAIRS; i++) {
    const aId = 1000 + i;
    const xId = 5000 + i;
    const sideId = 20000 + i;
    const targetId = 40000 + i;
    await seedCard(storage, { id: aId, name: `Chunk Seed A ${i}`, typeId: 1 });
    await seedCard(storage, { id: xId, name: `Chunk Seed X ${i}`, typeId: 1 });
    await seedCard(storage, {
      id: sideId,
      name: `Chunk Seed A ${i}+Chunk Seed X ${i}`,
      leftId: aId,
      rightId: xId,
      typeId: 1,
    });
    await seedCard(storage, {
      id: targetId,
      name: `Chunk Seed A ${i}+Chunk Seed X ${i}+Chunk Stress Right`,
      leftId: sideId,
      rightId: 2,
      typeId: 1,
    });
  }
  const nests: string[] = [];
  for (let i = 1; i <= PAIRS; i++) {
    nests.push(`{{Chunk Seed A ${i}+Chunk Seed X ${i}+Chunk Stress Right}}`);
  }
  await seedCard(storage, {
    id: 9,
    name: "Chunk Stress Page",
    typeId: 1,
    dbContent: nests.join("\n"),
  });
  return "Chunk Stress Page";
}

describe("prefetch closure junction-id-pair chunking", () => {
  it(
    `renders a page whose closure joins ${PAIRS} known-sided junction pairs in one round`,
    { timeout: 300_000 },
    async () => {
      const storage = await createRenderTestStorage();
      try {
        const pageName = await seedChunkStressDeck(storage);
        // The cold render's prefetch walk emits the 1100-pair round. RED
        // (unchunked): SqliteError "Expression tree is too large (maximum
        // depth 1000)" propagates out of render(). GREEN (chunked): the
        // render completes and the nests resolve.
        const html = await storage.engine.render(pageName, "content");
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain("Chunk Seed A 1");
        expect(html).toContain("Chunk Stress Right");
      } finally {
        storage.close();
      }
    },
  );
});
