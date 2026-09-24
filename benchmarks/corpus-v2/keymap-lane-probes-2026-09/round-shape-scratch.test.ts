// keymap-lane scratch (diagnosis of new round shapes; not a lasting pin):
// prints the statement log + prefetch stats for the depth-2/3 fixtures so
// the updated junction-depth-closure pins carry measured constants.
import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
} from "../../../tests/card/render/render-test-storage.js";

function chainCards(depth: number): Array<ChainCard> {
  const cards: ChainCard[] = [
    { id: 701, name: "chain_c1" },
    { id: 702, name: "chain_c2" },
  ];
  if (depth < 2) return cards;
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

interface ChainCard {
  id: number;
  name?: string;
  leftId?: number;
  rightId?: number;
  dbContent?: string;
}

describe("scratch: round shapes", () => {
  it("prints depth-2/3/4 statement logs", async () => {
    for (const depth of [2, 3, 4] as const) {
      const storage = await createRenderTestStorage();
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(depth)) await seedCard(storage, card);
      const parts = chainCards(depth).map((c) => c.name).filter(Boolean);
      const target = chainCards(depth).map((c) => c.name ?? undefined).filter(Boolean).join("+");
      void parts;
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: `<p>deep: {{${target}}}</p>`,
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain(`junction depth ${depth} body`);
      console.log(`\n== depth ${depth} ==`, JSON.stringify(storage.counting.snapshot()));
      console.log("stats:", JSON.stringify(storage.engine.lastRenderStats));
      for (const s of storage.counting.statements) {
        console.log(`  STMT ${s.slice(0, 90).replace(/\s+/g, " ")}`);
      }
      storage.close();
    }
  }, 60_000);
});
