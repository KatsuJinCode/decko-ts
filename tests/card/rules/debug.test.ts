// Debug — minimal findRule test
import { describe, it, expect } from "vitest";
import { createRenderTestStorage, seedCard } from "../render/render-test-storage.js";
import { findRule, nameAsPatternCardInput } from "../../../src/card/rules/lookup.js";
import { DeckoName } from "../../../src/card/name.js";

describe("debug: findRule minimal", () => {
  it("finds *all+*read via findRule", async () => {
    const s = await createRenderTestStorage();
    await seedCard(s, { id: 1, name: "*all", codename: "all" });
    await seedCard(s, { id: 2, name: "*read", codename: "read" });
    await seedCard(s, { id: 3, leftId: 1, rightId: 2, dbContent: "rule content" });
    await seedCard(s, { id: 7, name: "Orphan", dbContent: "no type" });

    const result = await findRule(s.fetcher, nameAsPatternCardInput("Orphan"), "read");
    console.log("candidates:", result?.candidates);
    console.log("matched:", result?.rule.name?.s);
    console.log("dbContent:", result?.rule.dbContent);
    expect(result).toBeDefined();
    s.close();
  });
});
