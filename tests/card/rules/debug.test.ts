// Debug — see what the fetcher does with compound names after seeding a junction row.
import { describe, it, expect } from "vitest";
import { createRenderTestStorage, seedCard } from "../render/render-test-storage.js";

describe("debug: junction lookup", () => {
  it("fetches *all+*read after seeding junction row", async () => {
    const s = await createRenderTestStorage();
    await seedCard(s, { id: 1, name: "*all", codename: "all" });
    await seedCard(s, { id: 2, name: "*read", codename: "read" });
    await seedCard(s, { id: 3, leftId: 1, rightId: 2, dbContent: "rule content" });

    const r1 = await s.fetcher.fetchByName("*all");
    const r2 = await s.fetcher.fetchByName("*read");
    const r3 = await s.fetcher.fetchByName("*all+*read");
    const r3byId = await s.fetcher.fetchById(3);

    expect(r1?.name?.s).toBe("*all");
    expect(r2?.name?.s).toBe("*read");
    console.log("r3:", r3);
    console.log("r3byId:", r3byId);
    s.close();
  });
});
