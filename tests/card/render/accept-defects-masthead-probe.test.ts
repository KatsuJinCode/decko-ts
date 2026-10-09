// ACCEPTANCE-DEFECTS LANE SCRATCH PROBE (not for commit):
// reproduce the masthead lowercasing on a side-less compound row.
import { describe, it, expect } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

describe("accept-defects masthead probe", () => {
  it("renders the stored proper name on a side-less compound card", { timeout: 120_000 }, async () => {
    const storage: RenderTestStorage = await createRenderTestStorage();
    try {
      // sides
      await seedCard(storage, { id: 9001, name: "Dream Team", dbContent: "left" });
      await seedCard(storage, { id: 9002, name: "Associations", dbContent: "right" });
      // the side-less compound row of record (the 3270 shape)
      await seedCard(storage, {
        id: 9003,
        name: "Dream Team+Associations",
        dbContent: "body",
        typeId: 3,
        typeName: "RichText",
      });
      const fetched = await storage.fetcher.fetchByName("Dream Team+Associations");
      console.log("FETCH name:", fetched?.name?.s, "key:", fetched?.key, "id:", fetched?.id);
      const page = await storage.engine.renderPage("Dream Team+Associations");
      const m = page.match(/<span class="card-title" title="([^"]*)"/);
      console.log("FIRST card-title:", m && m[1]);
      const denial = page.match(/denial-view/);
      console.log("has denial-view:", Boolean(denial));
      expect(true).toBe(true);
    } finally {
      storage.close();
    }
  });
});
