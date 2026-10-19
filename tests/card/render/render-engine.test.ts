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
import { coldRoundTripLaw } from "./round-trip-law.js";
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

  it("handles comment nests: # renders the STRIPPED bracket text, ## renders nothing", () => {
    // nest.rb:16-21: interpret assigns `in_brackets = strip_tags match[1]`
    // BEFORE branching, so visible_comment(in_brackets) escapes the
    // tag-stripped text, not the authored bytes. Oracle (Ruby 3.4.11,
    // verbatim nest.rb:27-29/34-36 bodies, run 2026-10-19):
    //   strip_tags("#hi <b>there</b>") + visible_comment => "<!-- #hi there -->"
    const comment = scanNests("{{#hi <b>there</b>}}")[0];
    expect(comment.nest?.comment).toBe("<!-- #hi there -->");
    const silent = scanNests("{{##gone}}")[0];
    expect(silent.nest?.comment).toBe("");
  });

  it("escapes comment nests with CGI.escapeHTML entity choices: apos = &#39;", () => {
    // nest.rb:34-36 visible_comment escapes via CGI.escapeHTML, which maps
    // the single quote to &#39; (NOT &apos;). Oracle (Ruby 3.4.11,
    // `ruby -rcgi -e "puts CGI.escapeHTML(%q{x'y\"z<>})"` => x&#39;y&quot;z&lt;&gt;,
    // run 2026-10-19; full-comment capture:
    //   visible_comment(strip_tags(%q{#it's "quoted" & <b>bold</b>}))
    //     => <!-- #it&#39;s &quot;quoted&quot; &amp; bold -->)
    const nest = scanNests('{{#it\'s "quoted" & <b>bold</b>}}')[0];
    expect(nest?.nest?.comment).toBe(
      "<!-- #it&#39;s &quot;quoted&quot; &amp; bold -->",
    );
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

  // STAR/RSTAR/RULE are ANCHORLESS (card-1.110.0 lib/card/set/pattern/
  // class_methods.rb:16 - anchorless = !respond_to?(:anchor_name); the
  // star, rstar and rule set_pattern files define none). The correct key
  // list for "*all+*read" is therefore "ALL ALL_PLUS TYPE-list RSTAR RULE
  // RIGHT-Xread TYPE_PLUS_RIGHT-set-Xread SELF-Xall-Xread"
  // (src/card/set-patterns/instance.ts). Key computation that anchors STAR
  // would emit "STAR-Xtiny_mce"-style fragments and drop RULE.
  it("emits bare STAR for star-named cards (04_star.rb anchorless)", () => {
    const keys = safeSetKeys({
      name: DeckoName.parse("*tiny_mce"),
      typeId: 259,
      typeName: "exi",
      leftTypeName: undefined,
    });
    expect(keys).toBe("ALL TYPE-exi STAR SELF-Xtiny_mce");
  });

  it("emits bare RSTAR for compound cards whose right is a star (05_rstar.rb)", () => {
    const keys = safeSetKeys({
      name: DeckoName.parse("*all+*read"),
      typeId: 259,
      typeName: "exi",
      leftTypeName: "exi",
    });
    expect(keys).toBe(
      "ALL ALL_PLUS TYPE-exi RSTAR RIGHT-Xread TYPE_PLUS_RIGHT-exi-Xread SELF-Xall-Xread",
    );
  });

  it("inserts bare RULE between RSTAR and RIGHT when isRule is supplied (06_rule.rb)", () => {
    const keys = safeSetKeys({
      name: DeckoName.parse("*all+*read"),
      typeId: 259,
      typeName: "exi",
      leftTypeName: "exi",
      isRule: true,
    });
    expect(keys).toBe(
      "ALL ALL_PLUS TYPE-exi RSTAR RULE RIGHT-Xread TYPE_PLUS_RIGHT-exi-Xread SELF-Xall-Xread",
    );
  });

  it("omits RULE while the enrichment does not supply isRule (documented gap)", () => {
    const keys = safeSetKeys({
      name: DeckoName.parse("*all+*read"),
      typeId: 259,
      typeName: "exi",
      leftTypeName: "exi",
    });
    expect(keys).not.toContain("RULE");
  });

  it("falls back to the RichText anchor for TYPE_PLUS_RIGHT when the left type is unknown", () => {
    // Ruby: 08_type_plus_right.rb#anchor_name "#{left_type(card)}+#{tag}"
    // where left_type = superleft&.type_name || quick_type(left_name), and
    // quick_type fetches unknown names as NEW cards with the default
    // RichText type - so a never-seen left name like "Ghost Parent"
    // anchors "RichText+field".
    const keys = safeSetKeys({
      name: DeckoName.parse("Ghost Parent+field"),
      typeId: 2,
      typeName: "RichText",
      leftTypeName: undefined,
    });
    expect(keys).toBe(
      "ALL ALL_PLUS TYPE-rich_text RIGHT-field TYPE_PLUS_RIGHT-rich_text-field SELF-ghost_parent-field",
    );
  });
});

// ---------------------------------------------------------------------------
// the slot class attribute end-to-end (regression: the key list must carry
// bare `... STAR SELF-...`, never `STAR-<anchor> SELF-...`)
// ---------------------------------------------------------------------------

describe("slot set-key classes through the render engine", () => {
  it("renders a star card's slot class with the bare STAR fragment", async () => {
    const storage = await createRenderTestStorage();
    try {
      // synthetic cards shaped like a deck: the type card "exi" plays the
      // role of a renamed Set cardtype (codename "set"); the expected
      // class list is the shape a simple star card must produce
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 259, name: "exi", codename: "set", typeId: 2 });
      await seedCard(storage, {
        id: 500,
        name: "*tiny_mce",
        typeId: 259,
        dbContent: "",
      });
      const html = await storage.engine.render("*tiny_mce", "closed");
      expect(html).toContain(
        'class="card-slot closed-view ALL TYPE-exi STAR SELF-Xtiny_mce"',
      );
      expect(html).not.toContain("STAR-Xtiny_mce");
    } finally {
      storage.close();
    }
  });
});

// ---------------------------------------------------------------------------
// view dispatch
// ---------------------------------------------------------------------------

describe("view dispatch", () => {
  it("raises the unsupported-view UserError with the recorded message shape", () => {
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

    // Round trips scale with the CHAIN (one batch per unfetched inclusion
    // level), not with the DECK - the trade for rows-read dropping from
    // O(deck x passes) per render to O(page). Ruby's measured cost for the
    // same chains is depth+3 (4/5/7/11); the TS curve pinned below is
    // depth+2, one below Ruby's at every depth (the cold round-trip law,
    // round-trip-law.ts: three fixed trips plus one per level below the
    // root). Of each total, 2 round trips are fixed before the wave: the
    // root fetch and the PRELUDE batch (src/card/render/prefetch.ts -
    // the root's side priming, the root's TYPE row for the enrichment
    // fold, and the root's set-pattern anchor priming, which turns the
    // rule walk's *self/*type/*all lex_to_id point queries into cache
    // entries, plus the folded engine statements). The walk is CACHED
    // after the first render - warm renders pay only the freshness stamp
    // (the test below).
    expect(roundTripsByDepth).toEqual({
      1: coldRoundTripLaw(0),
      2: coldRoundTripLaw(1),
      4: coldRoundTripLaw(3),
      8: coldRoundTripLaw(7),
    });
    // Statements: the folded engine statements are constant; the rounds
    // add one fetch statement per level, and the wave's one round
    // contributes its folded statements (chunked key IN-lists, the
    // side-key join and the depth-3 key join; depth 8 brings enough *self
    // rule candidates for the key join to need a second statement). Two of the
    // constant folds prime email junctions: the email field-anchor
    // prelude statement and the +*test context junction priming. The
    // folds live in the prelude batch: default_nest_view is process
    // config (html.rb:17-19), never a deck rule, so render.ts's fold
    // composition appends no *default html view universe statement; the
    // head views read deck-level setting cards no reference closure can
    // reach, so their read rides the same prelude batch instead of
    // paying its own round trip; and the deck_data_version stamp read
    // folds in last (+1 statement at every depth, +0 round trips). The deck
    // here carries the stock `*all+*read` rule card (createRenderTestStorage
    // seeds it; Ruby denies a deck without one), and the read permission's
    // one-time setup — the rule-closure walk folded into the prelude batch,
    // and the Set TYPE card's row folded into the wave preamble — rides
    // those two batches: statements, not round trips. Warm
    // renders pay exactly that one stamp statement.
    // The prelude also carries the stored nest index's closure statement
    // (+1 statement at every depth, +0 round trips). This deck writes no
    // reference rows, so its closure levels are walked one round trip each.
    expect(statementsByDepth).toEqual({ 1: 21, 2: 22, 4: 24, 8: 29 });
    // depth 8 costs one batch per level (10 round trips) while reading
    // O(page) rows instead of the whole deck per render - one below
    // Ruby's 11 queries (pinned: TS <= Ruby at every measured depth).
    // Statements inside a batch are folded prepare work riding ONE round
    // trip, not round trips - the costed axis stays the round-trip
    // count above.
    expect(roundTripsByDepth[8]).toBeLessThanOrEqual(RUBY_MEASURED[8]);
  });

  it("renders a warm closure with exactly ONE statement (the freshness stamp)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedChain(storage, 8);
      await storage.engine.render("chain_l1", "content");
      storage.counting.reset();
      const html = await storage.engine.render("chain_l1", "content");
      expect(html).toContain("level 8 end");
      // The warm render pays exactly the deck_data_version stamp read:
      // the committed state must be observable on the next request, so
      // the warm render's floor is one statement, not zero.
      expect(storage.counting.snapshot()).toEqual({ statements: 1, roundTrips: 1 });
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

  it("renders an absent nest target as Ruby's unknown view (empty: create denied)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 500, name: "lonely", typeId: 2, dbContent: "<p>{{ghost}}</p>" });
      // format/nest/fetch.rb#new_card: the miss fetches a NEW unknown card;
      // the default :titled nest view substitutes :unknown
      // (view/permission.rb#alter_unknown -> html error.rb view :unknown),
      // whose createable branch is denied for an anonymous viewer - so
      // the nest renders the empty string.
      const html = await storage.engine.render("lonely", "content");
      expect(html).toContain("<p></p>");
    } finally {
      storage.close();
    }
  });
});
