// Structured-content unit + engine tests: the *structure rule template
// mechanism (src/card/rules/structure.ts + the render.ts prepare hook).
//
// Ruby oracle (card-1.110.0 / card-mod-content-0.20.0):
// - lib/card/content/all.rb:8-10  Card#content = structured_content ||
//   standard_content
// - content/all.rb:25-27          structured_content = structure &&
//   default_content (the template's db_content; "" is truthy and WINS)
// - content/all.rb:17-19          standard_content = db_content ||
//   (new_card? ? default_content : "")
// - card-mod-content set/all/templating.rb:40-48  structure /
//   structure_rule_card: the first <set>+*structure rule in pattern
//   precedence order; "_self" db_content nils it (the walk STOPS — no
//   fall-through to the next candidate)
// - card-1.110.0 mod/core/set/all/content.rb:26-28 default_content =
//   template&.db_content (NULL template content -> standard path)
//
// Seeding note: junction rows store NULL name/key (the 2020 convention
// render-test-storage.ts seeds by); the *structure universe statement
// composes rule-card keys from the sides (the resolved CTE), so both named
// and junction-style rule rows resolve.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  resolveStructuredContent,
  structuredCardContent,
  templateReferenceNames,
} from "../../../src/card/rules/structure.js";
import { DeckoName } from "../../../src/card/name.js";
import type { SQLQueryResult } from "../../../src/server/driver.js";

// ---------------------------------------------------------------------------
// pure mechanics
// ---------------------------------------------------------------------------

const universeOf = (entries: Record<string, string | null>): Map<string, string | null> =>
  new Map(Object.entries(entries));

describe("resolveStructuredContent (templating.rb#structure port)", () => {
  it("walks candidates in pattern precedence: self beats type beats all", () => {
    const universe = universeOf({
      "doc1+*self+*structure": "SELF TEMPLATE",
      "page+*type+*structure": "TYPE TEMPLATE",
      "*all+*structure": "ALL TEMPLATE",
    });
    const card = { name: "Doc1", typeId: 7, typeName: "Page" };
    const resolved = resolveStructuredContent(card, universe);
    expect(resolved?.templateContent).toBe("SELF TEMPLATE");
    expect(resolved?.ruleName).toBe("Doc1+*self+*structure");
    expect(resolved?.matchedIndex).toBe(0);
  });

  it("falls to the *type candidate when no *self rule exists", () => {
    const universe = universeOf({
      "page+*type+*structure": "TYPE TEMPLATE",
      "*all+*structure": "ALL TEMPLATE",
    });
    const resolved = resolveStructuredContent({ name: "Doc1", typeId: 7, typeName: "Page" }, universe);
    expect(resolved?.templateContent).toBe("TYPE TEMPLATE");
    expect(resolved?.matchedIndex).toBe(1);
  });

  it('"_self" content nils the structure and STOPS the walk (no fall-through)', () => {
    const universe = universeOf({
      "doc1+*self+*structure": "  _self\n",
      "*all+*structure": "ALL TEMPLATE",
    });
    // structure_rule_card (templating.rb:44-48): db_content.strip == "_self"
    // -> nil. Ruby does NOT continue to the next candidate.
    const resolved = resolveStructuredContent({ name: "Doc1", typeId: 7, typeName: "Page" }, universe);
    expect(resolved).toBeUndefined();
  });

  it("a NULL template content falls through to the standard path (default_content nil)", () => {
    const universe = universeOf({ "page+*type+*structure": null });
    const resolved = resolveStructuredContent({ name: "Doc1", typeId: 7, typeName: "Page" }, universe);
    expect(resolved).toBeUndefined();
  });

  it('an EMPTY template content WINS (Ruby: "" is truthy in structured_content)', () => {
    const universe = universeOf({ "page+*type+*structure": "" });
    const card = { name: "Doc1", typeId: 7, typeName: "Page" };
    const resolved = resolveStructuredContent(card, universe);
    expect(resolved?.templateContent).toBe("");
    expect(structuredCardContent(card, "own bytes", universe)).toBe("");
  });

  it("no candidates in the universe -> undefined (universe.size gate)", () => {
    const resolved = resolveStructuredContent({ name: "Doc1", typeName: "Page" }, new Map());
    expect(resolved).toBeUndefined();
  });
});

describe("structuredCardContent (content/all.rb#content port)", () => {
  it("template wins over the card's own db_content", () => {
    const universe = universeOf({ "page+*type+*structure": "TEMPLATE" });
    expect(structuredCardContent({ name: "Doc1", typeId: 7, typeName: "Page" }, "own", universe)).toBe(
      "TEMPLATE",
    );
  });

  it("standard path: db_content verbatim when no structure applies", () => {
    const universe = universeOf({});
    expect(structuredCardContent({ name: "Doc1" }, "own bytes", universe)).toBe("own bytes");
  });

  it('standard path: NULL db_content renders "" (content/all.rb:17-19, real card)', () => {
    const universe = universeOf({});
    expect(structuredCardContent({ name: "Doc1" }, null, universe)).toBe("");
  });
});

describe("templateReferenceNames", () => {
  it("collects absolute refs, skips relative ones, uses the real nest parser", () => {
    expect(templateReferenceNames("{{Other Card}} {{_left|open}} {{|core}}")).toEqual([
      "Other Card",
    ]);
  });
});

describe("structureRuleUniverseStatement", () => {
  it("matches rule rows by the *structure setting card's right_id (flat, indexed)", () => {
    const statement = structureRuleUniverseStatement();
    expect(statement.sql).toContain("r.right_id = (SELECT id FROM cards");
    expect(statement.sql).toContain("sl.\"key\" || '+' || p.\"key\"");
    expect(statement.params).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// engine integration: the render.ts prepare hook
// ---------------------------------------------------------------------------

let storage: RenderTestStorage | undefined;

/** Type card "Page"=100, *type=101, *structure=102, set "Page+*type"=103,
 *  rules + docs as marked. Junction rule rows carry NULL name/key; the
 *  universe statement composes "page+*type+*structure" from the sides. */
beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 100, name: "Page" });
  await seedCard(s, { id: 101, name: "*type", codename: "type" });
  await seedCard(s, { id: 102, name: "*structure", codename: "structure" });
  await seedCard(s, { id: 103, leftId: 100, rightId: 101 }); // set "Page+*type"
  await seedCard(s, { id: 104, leftId: 103, rightId: 102, dbContent: "<p>TYPE TEMPLATE {{_self|title}}</p>" });
  // A _self rule on another type ("Note"+*type+*structure).
  await seedCard(s, { id: 110, name: "Note" });
  await seedCard(s, { id: 111, leftId: 110, rightId: 101 }); // set "Note+*type"
  await seedCard(s, { id: 112, leftId: 111, rightId: 102, dbContent: "_self" });
  // The governed cards.
  await seedCard(s, { id: 120, name: "Doc1", typeId: 100, dbContent: null });
  await seedCard(s, { id: 121, name: "Doc2", typeId: 100, dbContent: "OWN BYTES" });
  await seedCard(s, { id: 122, name: "Memo1", typeId: 110, dbContent: "MEMO OWN" });
  // Plain card, no applicable rule, NULL content.
  await seedCard(s, { id: 130, name: "Loose", dbContent: null });
  // An absolute template target the closure completion must prefetch.
  await seedCard(s, { id: 140, name: "Target", dbContent: "TARGET BODY" });
  // A second type whose template carries an absolute nest.
  await seedCard(s, { id: 150, name: "Spec" });
  await seedCard(s, { id: 151, leftId: 150, rightId: 101 }); // set "Spec+*type"
  await seedCard(s, { id: 152, leftId: 151, rightId: 102, dbContent: "<p>SPEC {{Target}}</p>" });
  await seedCard(s, { id: 153, name: "Spec1", typeId: 150, dbContent: null });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("RenderEngine structured content", () => {
  it("renders the type's *structure template for a NULL-content card", async () => {
    const s = storage!;
    const html = await s.engine.render("Doc1", "content");
    expect(html).toContain("<p>TYPE TEMPLATE ");
    expect(html).toContain(">Doc1</span></p>"); // {{_self|title}} resolves the STRUCTURED card's name
  });

  it("template wins over the card's own db_content (structured_content first)", async () => {
    const s = storage!;
    const html = await s.engine.render("Doc2", "content");
    expect(html).toContain("<p>TYPE TEMPLATE ");
    expect(html).toContain(">Doc2</span></p>");
    expect(html).not.toContain("OWN BYTES");
  });

  it("renders the template through :raw too (base.rb:75-77 structure_card&.content)", async () => {
    const s = storage!;
    const html = await s.engine.render("Doc1", "core");
    expect(html).toContain("<p>TYPE TEMPLATE ");
    expect(html).toContain(">Doc1</span></p>"); // {{_self|title}} resolves the STRUCTURED card's name
  });

  it('a "_self" structure rule renders the card\'s own content', async () => {
    const s = storage!;
    const html = await s.engine.render("Memo1", "content");
    expect(html).toContain("MEMO OWN");
  });

  it("a rule-less NULL-content card renders empty content", async () => {
    const s = storage!;
    const html = await s.engine.render("Loose", "content");
    // standard_content: db_content || "" -> the content span carries nothing.
    expect(html).not.toContain("TYPE TEMPLATE");
  });

  it("absolute template refs join the closure: an existing nest target renders its card", async () => {
    const s = storage!;
    const html = await s.engine.render("Spec1", "content");
    expect(html).toContain("TARGET BODY");
    expect(html).toContain("SPEC");
  });

  it("the universe statement folds into the cold batch: one round trip, warm re-render zero queries", async () => {
    const s = storage!;
    const fresh = await createRenderTestStorage();
    try {
      // Minimal copy of the governed pair (engine caches are per-instance).
      await seedCard(fresh, { id: 100, name: "Page" });
      await seedCard(fresh, { id: 101, name: "*type", codename: "type" });
      await seedCard(fresh, { id: 102, name: "*structure", codename: "structure" });
      await seedCard(fresh, { id: 103, leftId: 100, rightId: 101 });
      await seedCard(fresh, { id: 104, leftId: 103, rightId: 102, dbContent: "T {{_self|title}}" });
      await seedCard(fresh, { id: 120, name: "Doc1", typeId: 100, dbContent: null });
      fresh.counting.reset();
      const html = await fresh.engine.render("Doc1", "title");
      expect(html).toContain("Doc1"); // sanity
      const cold = fresh.counting.snapshot();
      // The closure batch = [round-0 fetches, perm x3, codehash, universe]
      // (the universe statement is FOLDED: +1 statement, +0 round trips).
      // The remaining round trips are the pre-existing profile — the root
      // fetchByName + the view-override rule walk (this deck measured
      // 13 statements / 8 round trips before this stream; 14/8 after the
      // structure stream; 12/8 since the 2026-09-23 per-key closure rounds
      // replaced the two whole-deck walk statements with round-0 folds).
      expect(cold.statements).toBe(12);
      expect(cold.roundTrips).toBe(8);
      // Warm re-render: the structured pass is pure memory.
      fresh.counting.reset();
      await fresh.engine.render("Doc1", "title");
      expect(fresh.counting.snapshot()).toEqual({ statements: 0, roundTrips: 0 });
    } finally {
      fresh.close();
    }
    void s;
  });

  it("universe parse: junction-style composed keys land in the map (driver-level)", async () => {
    const s = storage!;
    const result = await s.fetcher.driver.query(structureRuleUniverseStatement().sql, []);
    const universe = structureUniverseFromResults(result as SQLQueryResult);
    // The junction-composed rule key (NULL name row, sides composed).
    expect(universe.has("page+*type+*structure")).toBe(true);
    expect(universe.get("page+*type+*structure")).toContain("TYPE TEMPLATE");
    expect(universe.has("note+*type+*structure")).toBe(true);
  });

  it("candidate keys and composed universe keys agree (DeckoName.key on both sides)", () => {
    const candidate = DeckoName.parse("Doc1+*type+*structure").key;
    // The anchor part keys through the same algorithm the rows store.
    expect(DeckoName.parse("Page+*type+*structure").key).toBe("page+*type+*structure");
    void candidate;
  });
});
