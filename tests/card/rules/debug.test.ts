// Quick debug smoke — see what fetchByName returns for the seeded rule cards.

import { describe, it, expect } from "vitest";
import { createRenderTestStorage, seedCard } from "../render/render-test-storage.js";

describe("debug: rule card fetch", () => {
  it("fetches *all+*read after seeding", async () => {
    const s = await createRenderTestStorage();
    await seedCard(s, { id: 1, name: "*all", codename: "all" });
    await seedCard(s, { id: 3, name: "*all+*read", dbContent: "test content" });

    const r1 = await s.fetcher.fetchByName("*all");
    const r3 = await s.fetcher.fetchByName("*all+*read");
    const byId = await s.fetcher.fetchById(3);

    expect(r1?.name?.s).toBe("*all");
    expect(r3?.name?.s).toBe("*all+*read");
    expect(r3?.dbContent).toBe("test content");
    expect(byId?.name?.s).toBe("*all+*read");
    s.close();
  });
});
