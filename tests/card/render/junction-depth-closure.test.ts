// Depth-3+ junction inclusion closure: the defect-2 regression tests.
//
// DEFECT (docs/deploy-notes.md finding 2): the prefetcher could not resolve
// junction (NULL-key) nest targets deeper than two parts. The SQL walk
// matched frontier keys against cards.key - which junction rows do not
// carry - and the JS fallback's side-key join required BOTH sides of a
// junction reference to be simple keys, so "A+B+C" (left side "A+B" is
// itself compound) never resolved and the render threw
// "nest target not found: A+B+C" where Ruby rendered.
//
// FIX (src/card/render/prefetch.ts): (1) the SQL walk resolves frontier
// keys through a `resolved` recursive CTE that composes every junction
// row's key from its sides (the DbLexicon.nameToLex walk in SQL), so
// junction targets enter the SQL frontier at ANY depth; (2) the JS
// fallback resolves compound references recursively through their sides'
// ids (the UNIQUE left_id/right_id pair join) when the SQL walk missed.
//
// NAMING in these fixtures: parts use digit-suffixed names (chain_c1,
// chain_c2, ...) because DeckoName.key SINGULARIZES (measured: key of
// "beta" is "betum"), so alphabetic stems make the span-extracted
// reference key diverge from the composed key - the plural-stem miss the
// last test below covers deliberately.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

interface ChainCard {
  id: number;
  name?: string;
  leftId?: number;
  rightId?: number;
  dbContent?: string;
}

/** Junction rows carry NULL name/key columns and resolve through their
 *  sides (the 2020 Lexicon convention) - exactly what seedCard stores.
 *  Depth 2 is "chain_c1+chain_c2"; each further level appends one part
 *  to the right of the previous junction (left-associative, the compound
 *  the DeckoName algebra composes). */
function chainCards(depth: number): ChainCard[] {
  const cards: ChainCard[] = [
    { id: 701, name: "chain_c1" },
    { id: 702, name: "chain_c2" },
  ];
  if (depth < 2) return cards;
  // depth 2: the c1+c2 junction itself
  cards.push({ id: 712, leftId: 701, rightId: 702, dbContent: "junction depth 2 body" });
  let previousId = 712;
  for (let level = 3; level <= depth; level++) {
    const sideId = 700 + level;
    cards.push({ id: sideId, name: `chain_c${level}` });
    const junctionId = 700 + level + 100;
    cards.push({
      id: junctionId,
      leftId: previousId,
      rightId: sideId,
      dbContent: `junction depth ${level} body`,
    });
    previousId = junctionId;
  }
  return cards;
}

describe("depth-3+ junction inclusion closure (deploy-notes finding 2 fix)", () => {
  it("renders a depth-3 junction inclusion chain, covered by the SQL walk", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(3)) {
        await seedCard(storage, card);
      }
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>deep: {{chain_c1+chain_c2+chain_c3}}</p>",
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction depth 3 body");
      expect(html).toContain("titled-view"); // the html default nest view
      // The SQL `resolved` closure composed the junction keys, so the JS
      // fallback had nothing left to fetch.
      expect(storage.engine.lastRenderStats?.fallbackRounds).toBe(0);
      // The #1282 shape holds: one root fetch + one batch (2 walk statements
      // + 3 folded read-permission statements) + 3 rule-lookup candidates -
      // the same constant as simple chains. The permission statements joined
      // the closure batch (read-permission stream): round trips unchanged.
      const snapshot = storage.counting.snapshot();
      expect(snapshot.roundTrips).toBe(5);
      expect(snapshot.statements).toBe(10); // +3 read-permission + 1 codename codehash (rule? ids), all folded
    } finally {
      storage.close();
    }
  });

  it("renders a depth-4 junction inclusion chain, covered by the SQL walk", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(4)) {
        await seedCard(storage, card);
      }
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>deeper: {{chain_c1+chain_c2+chain_c3+chain_c4}}</p>",
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction depth 4 body");
      expect(storage.engine.lastRenderStats?.fallbackRounds).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("resolves a depth-3 junction through the recursive side-id fallback when the SQL key transform misses", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The junction's tag is "Oracle Basics" - its canonical key is
      // "oracle_basic" (singularized), while the SQL walk's best-effort
      // transform of the authored reference keeps "basics". The SQL miss
      // exercises the fallback: sides resolve, then the junction row joins
      // by its (left_id, right_id) pair - and the composed junction record
      // resolves across fallback rounds through the lexicon.
      await seedCard(storage, { id: 2, name: "RichText" });
      await seedCard(storage, { id: 701, name: "chain_c1" });
      await seedCard(storage, { id: 702, name: "Oracle Basics", dbContent: "stemmed body" });
      await seedCard(storage, { id: 712, leftId: 701, rightId: 702, dbContent: "pair body" });
      await seedCard(storage, { id: 703, name: "chain_c3" });
      await seedCard(storage, { id: 803, leftId: 712, rightId: 703, dbContent: "deep body" });
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>miss: {{chain_c1+Oracle Basics+chain_c3}}</p>",
      });
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("deep body");
      expect(storage.engine.lastRenderStats!.fallbackRounds).toBeGreaterThanOrEqual(1);
    } finally {
      storage.close();
    }
  });

  it("keeps a depth-2 junction render at the constant query shape (no regression)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(2)) {
        await seedCard(storage, card);
      }
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>pair: {{chain_c1+chain_c2}}</p>",
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction depth 2 body");
      const snapshot = storage.counting.snapshot();
      expect(snapshot.roundTrips).toBe(5);
      expect(snapshot.statements).toBe(10); // +3 folded read-permission statements + 1 folded codename codehash (rule? ids)
    } finally {
      storage.close();
    }
  });
});
