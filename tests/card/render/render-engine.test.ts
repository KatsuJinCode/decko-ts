// Render-engine tests: nest-syntax parsing units, set-key computation, and
// the #1282 query-cost proof - renders of inclusion chains at depths
// 1/2/4/8 measured through a counting driver, against Ruby's measured
// depth+3 (4/5/7/11 queries for the same chains).

import { describe, expect, it } from "vitest";
import {
  parseNestOptions,
  referencedNames,
  scanNests,
} from "../../../src/card/render/nest-syntax.js";
import { safeSetKeys } from "../../../src/card/render/set-keys.js";
import { UnsupportedViewError } from "../../../src/card/render.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

// ---------------------------------------------------------------------------
// nest-syntax.ts - the Chunk::Nest port
// ---------------------------------------------------------------------------

describe("nest syntax parsing (card-mod-content chunk/nest.rb port)", () => {
  it("splits content into literals and nests, preserving literal bytes", () => {
    const pieces = scanNests("<p>A {{One}} B</p> after {{Two|open}}");
    expect(pieces).toEqual([
      { kind: "text", text: "<p>A " },
      { kind: "nest", text: "{{One}}", nest: expect.objectContaining({ name: "One" }) },
      { kind: "text", text: " B</p> after " },
      { kind: "nest", text: "{{Two|open}}", nest: expect.objectContaining({ name: "Two" }) },
    ]);
  });

  it("parses pipe/semicolon options with the bare-value = view default", () => {
    const options = parseNestOptions("open;hide:menu");
    expect(options.view).toBe("open");
    expect(options.hide).toBe("menu");
  });

  it("folds nested option lists into items (nest.rb interpret_options)", () => {
    const options = parseNestOptions("bar|title");
    expect(options.view).toBe("bar");
    // the right-hand list folds into :items with the bare value as its view
    expect(options.items).toEqual({ view: "title" });
  });

  it("drops non-shark keys (option_string_to_hash)", () => {
    const options = parseNestOptions("open;not_a_shark_key:1");
    expect(options.view).toBe("open");
    expect(JSON.stringify(options)).not.toContain("not_a_shark_key");
  });

  it("handles comment nests: # renders the escaped bracket text, ## renders nothing", () => {
    // nest.rb: visible_comment(in_brackets) - the FULL bracket text,
    // including the '#', CGI-escaped
    const comment = scanNests("{{#hi <b>there</b>}}")[0];
    expect(comment.nest?.comment).toBe("<!-- #hi &lt;b&gt;there&lt;/b&gt; -->");
    const silent = scanNests("{{##gone}}")[0];
    expect(silent.nest?.comment).toBe("");
  });

  it("strips tags inside nest brackets before name parsing (nest.rb strip_tags)", () => {
    const pieces = scanNests("{{<b>Tagged</b> Name}}");
    expect(pieces[0]?.nest?.name).toBe("Tagged Name");
  });

  it("reports reference names for the prefetcher, flagging relative ones", () => {
    const refs = referencedNames("{{Some Card|open}} {{_self}} {{#skip}}");
    expect(refs).toEqual([
      { name: "Some Card", relative: false },
      { name: "_self", relative: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// set-keys.ts - the Pattern::Base#safe_key / All#safe_set_keys port
// ---------------------------------------------------------------------------

describe("set pattern keys (mod/core/set_pattern port)", () => {
  it("computes the captured simple-card key list (ALL TYPE SELF)", () => {
    const keys = safeSetKeys({
      name: DeckoName.parse("Oracle Basics"),
      typeId: 2,
      typeName: "RichText",
      leftTypeName: undefined,
    });
    expect(keys).toBe("ALL TYPE-rich_text SELF-oracle_basic");
  });

  it("computes the captured compound-card key list (ALL ... SELF)", () => {
    const keys = safeSetKeys({
      name: DeckoName.parse("Oracle Rich+rich_child"),
      typeId: 2,
      typeName: "RichText",
      leftTypeName: "RichText",
    });
    expect(keys).toBe(
      "ALL ALL_PLUS TYPE-rich_text RIGHT-rich_child TYPE_PLUS_RIGHT-rich_text-rich_child SELF-oracle_rich-rich_child",
    );
  });
});

// ---------------------------------------------------------------------------
// view dispatch
// ---------------------------------------------------------------------------

describe("view dispatch", () => {
  it("raises the unsupported-view UserError with the captured message shape", () => {
    const error = new UnsupportedViewError("definitely_not_a_view", "Oracle Basics");
    expect(error.message).toBe("view (definitely_not_a_view) not supported for Oracle Basics");
  });
});

// ---------------------------------------------------------------------------
// the #1282 query-cost proof
// ---------------------------------------------------------------------------

/** Seed a chain: chain_l1 includes chain_l2 ... includes chain_lN
 *  (simple names, so the SQL walk's key transform applies - the general
 *  fallback correctness is covered below). */
async function seedChain(storage: RenderTestStorage, depth: number): Promise<void> {
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  for (let i = 1; i <= depth; i++) {
    const content =
      i < depth ? `level ${i} body {{chain_l${i + 1}}}` : `level ${i} end`;
    await seedCard(storage, { id: 100 + i, name: `chain_l${i}`, typeId: 2, dbContent: content });
  }
}

describe("batched inclusion prefetch: queries per render (decko#1282)", () => {
  it("renders chains of depth 1/2/4/8 with a CONSTANT query count", async () => {
    const RUBY_MEASURED: Record<number, number> = { 1: 4, 2: 5, 4: 7, 8: 11 }; // depth+3
    const roundTripsByDepth: Record<number, number> = {};
    const statementsByDepth: Record<number, number> = {};

    for (const depth of [1, 2, 4, 8]) {
      const storage = await createRenderTestStorage();
      try {
        await seedChain(storage, depth);
        storage.counting.reset();
        const html = await storage.engine.render("chain_l1", "content");
        expect(html).toContain(`level ${depth} end`); // the whole chain rendered
        const snapshot = storage.counting.snapshot();
        roundTripsByDepth[depth] = snapshot.roundTrips;
        statementsByDepth[depth] = snapshot.statements;
      } finally {
        storage.close();
      }
    }

    // The claim: CONSTANT in depth (one root fetch + one batched round trip).
    // Ruby's measured truth for the same chains is depth+3: 4/5/7/11.
    expect(roundTripsByDepth).toEqual({ 1: 2, 2: 2, 4: 2, 8: 2 });
    expect(statementsByDepth).toEqual({ 1: 3, 2: 3, 4: 3, 8: 3 });
    // depth 8 within the target budget on BOTH axes; Ruby needed 11 queries.
    expect(roundTripsByDepth[8]).toBeLessThanOrEqual(6);
    expect(statementsByDepth[8]).toBeLessThanOrEqual(6);
    expect(statementsByDepth[8]).toBeLessThan(RUBY_MEASURED[8]);
  });

  it("renders a warm closure with ZERO queries", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedChain(storage, 8);
      await storage.engine.render("chain_l1", "content");
      storage.counting.reset();
      const html = await storage.engine.render("chain_l1", "content");
      expect(html).toContain("level 8 end");
      expect(storage.counting.snapshot()).toEqual({ statements: 0, roundTrips: 0 });
    } finally {
      storage.close();
    }
  });

  it("falls back to per-level fetching when the SQL walk cannot match a reference (plural-stem key)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      // "Oracle Basics" stems to key "oracle_basic" (not lowercase+underscore),
      // so the CTE's best-effort transform ('oracle_basics') misses; the JS
      // verification fetches it in a fallback round.
      await seedCard(storage, { id: 300, name: "Oracle Basics", typeId: 2, dbContent: "stemmed body" });
      await seedCard(storage, { id: 301, name: "Includer", typeId: 2, dbContent: "see {{Oracle Basics}} now" });
      const html = await storage.engine.render("Includer", "content");
      expect(html).toContain("stemmed body");
      const stats = storage.engine.lastRenderStats;
      expect(stats?.fallbackRounds).toBeGreaterThanOrEqual(1);
    } finally {
      storage.close();
    }
  });

  it("resolves compound references through the fallback (junction rows have NULL key columns)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 701, name: "rich_child", typeId: 2 });
      await seedCard(storage, { id: 611, name: "Parent Card", typeId: 2 });
      await seedCard(storage, {
        id: 613,
        name: "Parent Card+rich_child",
        leftId: 611,
        rightId: 701,
        typeId: 2,
        dbContent: "junction body",
      });
      await seedCard(storage, {
        id: 612,
        name: "Junction Renderer",
        typeId: 2,
        dbContent: "<p>nested: {{Parent Card+rich_child}}</p>",
      });
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction body");
      expect(html).toContain("titled-view"); // the html default nest view
    } finally {
      storage.close();
    }
  });

  it("terminates on inclusion cycles (UNION dedup + cache)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 400, name: "cycle_a", typeId: 2, dbContent: "A {{cycle_b}}" });
      await seedCard(storage, { id: 401, name: "cycle_b", typeId: 2, dbContent: "B {{cycle_a}}" });
      const html = await storage.engine.render("cycle_a", "title");
      expect(html).toContain("cycle_a");
    } finally {
      storage.close();
    }
  });

  it("rejects rendering a nest whose target does not exist (unknown-card views are wave 3)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 500, name: "lonely", typeId: 2, dbContent: "{{ghost}}" });
      await expect(storage.engine.render("lonely", "content")).rejects.toThrow(/nest target not found: ghost/);
    } finally {
      storage.close();
    }
  });
});
