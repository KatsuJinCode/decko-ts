// Rule lookup tests — the storage walk side of the rule system.
//
// Tests use the same render-test-storage helper as the renderer tests
// (in-memory better-sqlite3 + the real LocalSqliteDriver, schema loaded
// from db/schema.sqlite.sql). Rule cards are seeded directly as rows.
//
// Compound names (the rule-card norm, e.g. "*all+*read") are stored with
// name=NULL/key=NULL and ride the junction (left_id/right_id) — the
// 2020 Lexicon convention. We seed them
// explicitly with leftId/rightId so the lookup walks the junction path
// the engine actually uses in production.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { findRule, findRules, nameAsPatternCardInput } from "../../../src/card/rules/lookup.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  // Seed the minimum deck for rule lookup.
  // The "setting" cards (codenames all/read/write) and the "*all" set
  // module come first; compound rule cards ride the junction.
  await seedCard(storage, { id: 1, name: "*all", codename: "all" });
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic" });
  await seedCard(storage, { id: 9, name: "*read", codename: "read" });
  await seedCard(storage, { id: 10, name: "*write", codename: "write" });
  // The junction row that glues *all + *read into the compound name.
  // leftId=1 (the *all set), rightId=9 (the *read setting).
  await seedCard(storage, { id: 3, leftId: 1, rightId: 9, dbContent: "1" });
  // A type-specific rule on Basic+*type + *read.
  await seedCard(storage, { id: 4, name: "Basic+*type" });
  await seedCard(storage, { id: 5, leftId: 4, rightId: 9, dbContent: "1" });
  // A leaf card of type Basic (so the patternsForCard walk yields Basic+*type)
  await seedCard(storage, { id: 6, name: "Leaf", typeId: 2, typeName: "Basic", dbContent: "leaf content" });
  // An orphan card with no type, so only *all applies
  await seedCard(storage, { id: 7, name: "Orphan", dbContent: "no type" });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("findRule", () => {
  it("returns undefined when no candidates exist", async () => {
    const s = storage!;
    const result = await findRule(s.fetcher, nameAsPatternCardInput("Leaf"), "*nonexistent");
    expect(result).toBeUndefined();
  });

  it("finds *all+*read when the card has no type-specific rule", async () => {
    const s = storage!;
    const result = await findRule(s.fetcher, nameAsPatternCardInput("Orphan"), "*read");
    expect(result).toBeDefined();
    expect(result!.rule.id).toBe(3);
    expect(result!.rule.dbContent).toBe("1");
    expect(result!.candidates).toContain("*all+*read");
  });

  it("returns all candidates for debugging", async () => {
    const s = storage!;
    const result = await findRule(s.fetcher, nameAsPatternCardInput("Leaf"), "*read");
    expect(result).toBeDefined();
    // Leaf is a real card, so patternsForCard yields at least *self + *all.
    // (*type requires a richer setup; covered by the set-patterns tests.)
    expect(result!.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result!.candidates).toContain("*all+*read");
    expect(result!.candidates).toContain("Leaf+*self+*read");
  });

  it("walks candidates in registry precedence order", async () => {
    // Verified indirectly: the *all candidate appears AFTER the *self
    // candidate in the candidates list (registry precedence puts *self
    // first). The set-patterns tests cover this exhaustively.
    const s = storage!;
    const result = await findRule(s.fetcher, nameAsPatternCardInput("Leaf"), "*read");
    expect(result).toBeDefined();
    expect(result!.candidates.indexOf("Leaf+*self+*read")).toBeLessThan(
      result!.candidates.indexOf("*all+*read"),
    );
  });
});

describe("findRules (multiple settings)", () => {
  it("finds both *read and *write rules independently", async () => {
    const s = storage!;
    // Seed a *write rule on *all (junction row).
    await seedCard(s, { id: 8, leftId: 1, rightId: 10, dbContent: "1" });
    const results = await findRules(s.fetcher, nameAsPatternCardInput("Orphan"), ["*read", "*write"]);
    expect(results.length).toBe(2);
    const settings = results.map((r) => r.rule.name?.s ?? "").sort();
    expect(settings).toEqual(["*all+*read", "*all+*write"]);
  });
});
