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

  it("round 9: with a context name, plus-shaped refs absolutize against the instance", () => {
    const ctx = DeckoName.parse("Aikido Oak Cliff");
    // The chunk/reference.rb referencing-card contract: {{+image}} names
    // <instance>+image — the key the closure walkers must prepare. Before
    // round 9 the walkers kept the literal "+image", which matched no row
    // and rendered every template child as the unknown-card empty slot.
    expect(templateReferenceNames("<p>{{+image|size:large}}</p>", ctx)).toEqual([
      "Aikido Oak Cliff+image",
    ]);
    // Already-absolute refs pass through the name algebra unchanged.
    expect(templateReferenceNames("{{Some Page}}", ctx)).toEqual(["Some Page"]);
    // Underscore refs stay render-time (the format context resolves them).
    expect(templateReferenceNames("{{_left|open}}{{_main}}", ctx)).toEqual([]);
  });
});

describe("structureRuleUniverseStatement", () => {
  it("matches rule rows by the *structure setting card's right_id (indexed, composed-key CTE)", () => {
    const statement = structureRuleUniverseStatement();
    // The rule rows match the setting card's id on right_id (indexed); each
    // rule's composed key is built by walking UP from its set card (the
    // speed-fix rule universe: same rows and order as composing every name
    // in the deck, 34 ms -> 1 ms on the trial deck).
    expect(statement.sql).toContain("r.right_id = (SELECT id FROM setting)");
    expect(statement.sql).toContain("up(rid, cur, suffix)");
    expect(statement.params).toEqual(["*structure", "*structure"]);
  });

  it("DECKO_LEGACY_RULE_UNIVERSE=1 keeps the whole-deck composed-key statement", () => {
    const prior = process.env.DECKO_LEGACY_RULE_UNIVERSE;
    process.env.DECKO_LEGACY_RULE_UNIVERSE = "1";
    let statement: ReturnType<typeof structureRuleUniverseStatement>;
    try {
      statement = structureRuleUniverseStatement();
    } finally {
      if (prior === undefined) delete process.env.DECKO_LEGACY_RULE_UNIVERSE;
      else process.env.DECKO_LEGACY_RULE_UNIVERSE = prior;
    }
    expect(statement.sql).toContain("r.right_id = (SELECT id FROM cards");
    // Round 9 re-pin: the composed-key side is the RECURSIVE name_walk CTE
    // (landed for the depth-3 *type plus right universe keys — 24/139 rules
    // composed NULL under the old flat one-junction CASE) — not the flat
    // `sl."key" || '+' || p."key"` join this assertion pinned before that
    // round. The statement body itself is unchanged by round 9; only the
    // setting name is parameterized now (the same function builds the
    // *default universe).
    expect(statement.sql).toContain("WITH RECURSIVE name_walk(id, composed)");
    expect(statement.sql).toContain("COALESCE(w.composed, '') || '+' || COALESCE(r.\"key\", '')");
    // The setting name is bound as a statement parameter, not interpolated
    // into the SQL text.
    expect(statement.params).toEqual(["*structure", "*structure"]);
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

  it("the universe statement folds into the cold batch: one round trip, warm re-render pays only the freshness stamp", async () => {
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
      // The prelude batch = [type row fold, set-pattern anchor priming,
      // perm x3, codehash, universe, *default universe] (the universe
      // statements are FOLDED: +3 statements, +0 round trips). R17's A-36
      // correction rides through the prelude in merge pass 9 prep:
      // default_nest_view is process config (html.rb:17-19), never a deck
      // rule, so render.ts's fold composition no longer appends the
      // *default_html_view universe statement - one fewer prelude statement
      // than the cold-query port's own tree measured (14 -> 13). The
      // remaining round trips are the root fetchByName and the view-override
      // rule walk (this deck measured 13 statements / 8 round trips before
      // the 2026-09-23 per-key closure rounds; 14/8 through round 10's
      // folded *default_html_view universe; 13/6 since the 2026-09-27
      // cold-query: the prelude batch folds the type row and the
      // rule-walk anchor priming, so the enrich and rule-lookup point round
      // trips became cache hits). The head read-set (2026-09-28
      // async-view-handle) added one statement back into the SAME
      // prelude batch (13 -> 14): card-mod-format's head views read
      // deck-level setting cards no reference closure can reach. Round
      // trips stay at 6. The p20-email port added TWO always-pushed,
      // SQL-gated prelude primes (14 -> 16, round trips still 6): the
      // +*test_context junction probe (prefetch.ts, commits 3c79ef3/
      // d68953e/a55b477) and the nine email field-setting anchor keys
      // (prefetch.ts, commit 76a1887). Both carry an EXISTS gate on the
      // root's type codename = 'email_template', so non-email decks get
      // zero rows and byte-identical renders (the 20 other tests here
      // pass unchanged) - the pushed statement itself is what counts.
      // The rule-defaults lane (2026-10-02) added ONE folded prelude
      // statement (16 -> 17, round trips still 6): the template TYPE-NAME
      // read (templateTypeNameStatement — both universes' rule-card types
      // joined to their type cards' names). newCardDefaultType's
      // dup_structure leg (templating.rb:61-65) answers a *structure rule
      // card's own type and must resolve its NAME synchronously; an
      // IN-list would need the universe rows first, so the name read is a
      // self-contained JOIN pushed with the universes. Zero render-byte
      // change (this deck's other tests pass unchanged).
      //
      // 2026-10-03 net-reds-fixforward re-pin (16 -> 24 statements, 6 -> 10
      // round trips), per-statement Ruby derivation (the waves' batched
      // priming answers the SAME questions Ruby resolves per-card through
      // Card::Cache - the byte oracles prove the answers; only the request
      // batching differs):
      //  +1  templateTypeNameStatement rides the prelude batch (the deploy
      //      port of the rule-defaults lane's 53cc57d: type_id_from_template
      //      reads the template rule card's own type_id AND its NAME -
      //      templating.rb:25-27 + type.rb:78-80; the restored-side commit
      //      re-pinned its own pins with this justification, the deploy-side
      //      cherry-pick dropped the pin bump). +0 round trips.
      //  +1  W2b type-card prime (one chunked IN-list over every prepared
      //      record's typeId - Ruby's Card#type_card quick_fetch(type_id)
      //      per prepared card, type.rb:32-35) folded INTO the first wave
      //      batch by the net-reds-fixforward W4 fold (was its own round
      //      trip at the waves tip; measured 11 RT there).
      //  +2  wave seating round 1 (the rule candidates of the view-time
      //      settings - resolveOptionsCard's *content options,
      //      setHostOptionsParseFailure's *help/*structure/*default; Ruby's
      //      Set#rule/rule_card fetches walk the same candidate names,
      //      rule/all.rb - as chunked key IN-list + the depth-2 side-key
      //      junction join).
      //  +1  wave round 1's composition type fetch (a seated row's type
      //      card - enrichAndStore's retrieveFromCacheById miss; the same
      //      ladder-residue class the root composition has always paid).
      //  +2  wave seating round 2 (depth-3 junction candidates whose sides
      //      round 1 seated - "a junction's ids are the previous round's
      //      ANSWERS", the receipt's justification class 3).
      //  +1  wave round 2's composition type fetch (same class as above).
      //  -1  REMOVED: the pre-waves rule-candidate PAIR point query
      //      (SELECT .. left_id=? AND right_id=? - Ruby's rule_card fetch
      //      by composed name): the wave seats (or negatively primes) the
      //      candidates, so the findRule ladder answers from cache.
      //  Net statements 16 + 8 = 24 (8 additions - 1 removal + the port's
      //  +1 counted above); net round trips 6 - 1 (removed pair point) + 4
      //  (wave rounds 1+2 and their two composition type fetches) = 10; the
      //  warm re-render stays 0 (ask memory + ruleCandidatesPrimedFor).
      // Freshness lane 2026-10-05 (composed onto the deployed fold by the
      // lineage-reconciliation lane): +1 statement (the deck_data_version
      // stamp read folded LAST into the cold batch), +0 round trips
      // (24 -> 25).
      expect(cold.statements).toBe(25);
      expect(cold.roundTrips).toBe(10);
      // Warm re-render: the structured pass is pure memory; the render pays
      // exactly the freshness stamp (one statement, one round trip — the
      // delivery-contract:79 warm-render floor).
      fresh.counting.reset();
      await fresh.engine.render("Doc1", "title");
      expect(fresh.counting.snapshot()).toEqual({ statements: 1, roundTrips: 1 });
    } finally {
      fresh.close();
    }
  });

  it("universe parse: junction-style composed keys land in the map (driver-level)", async () => {
    const s = storage!;
    const universeStatement = structureRuleUniverseStatement();
    const result = await s.fetcher.driver.query(universeStatement.sql, universeStatement.params);
    const universe = structureUniverseFromResults(result as SQLQueryResult);
    // The junction-composed rule key (NULL name row, sides composed).
    expect(universe.has("page+*type+*structure")).toBe(true);
    expect(universe.get("page+*type+*structure")).toContain("TYPE TEMPLATE");
    expect(universe.has("note+*type+*structure")).toBe(true);
  });

  it("candidate keys and composed universe keys agree (DeckoName.key on both sides)", () => {
    const candidate = DeckoName.parse("Doc1+*type+*structure").key;
    expect(candidate).toBe("doc1+*type+*structure");
    // The anchor part keys through the same algorithm the rows store.
    expect(DeckoName.parse("Page+*type+*structure").key).toBe("page+*type+*structure");
  });

  it("round 9, +thing arm: a NON-discussion nest-miss child's :open substitutes :unknown (createable denies on a rule-less deck)", async () => {
    // Ruby dispatch for an UNKNOWN child whose set chain declares no
    // unknown-capable :open:
    //  - `view :open` (card 0.20 mod/bar_and_box set/all/bar.rb:44
    //    `view :open, cache: :yes`) carries NO `unknown: true`;
    //  - view/permission.rb:21-30 alter_unknown: setting(:unknown) is nil
    //    for this chain (only card-mod-comment set/right/discussion.rb:1-6
    //    redeclares `view :open, unknown: true`, set RIGHT-discussion) ->
    //    view_for_unknown substitutes :unknown;
    //  - mod/format set/all/html/error.rb:15-21 `view :unknown do
    //    createable { wrap { unknown_link ... } } end` with `createable =
    //    card.ok?(:create) ? yield : ""` — this deck seeds NO *create
    //    rules, so ok?(:create) is false and the nest renders "".
    // The p20-nest-selection (9a0d5c1) retired the pre-fix GLOBAL
    // open:true decl this test originally pinned; the corpus-proven
    // selection is pinned independently by
    // tests/card/render/nest-miss-unknown-view-selection-corpus-replay.
    // The type-inheritance MECHANISM below still has its open-view pin —
    // in the +discussion arm (the test's own cited oracle shape).
    const fresh = await createRenderTestStorage();
    try {
      await seedCard(fresh, { id: 100, name: "Page" });
      // The *default setting card + the *right pattern card + the set
      // junction "thing+*right" (NULL-key junction rows) + the rule row
      // "thing+*right+*default" typed Page — the type the new child
      // inherits.
      await seedCard(fresh, { id: 102, name: "*default", codename: "default" });
      await seedCard(fresh, { id: 101, name: "*right", codename: "right" });
      await seedCard(fresh, { id: 300, name: "thing" });
      await seedCard(fresh, { id: 303, leftId: 300, rightId: 101 }); // thing+*right
      await seedCard(fresh, {
        id: 304,
        leftId: 303,
        rightId: 102,
        typeId: 100, // the rule card's own type = the new-child type
      });
      await seedCard(fresh, {
        id: 305,
        name: "Thing Host",
        typeId: 100,
        dbContent: "<p>{{+thing|open}}</p>",
      });
      const html = await fresh.engine.render("Thing Host", "open");
      // No child slot at all: the :unknown view rendered "" (createable
      // deny), so nothing carrying the child's url-key form may appear.
      expect(html).not.toContain("Thing_Host+thing");
      // The host's own content view body is the processed db_content with
      // the nest consumed to nothing: "<p>" + "" + "</p>".
      expect(html).toContain("<p></p></div>");
    } finally {
      fresh.close();
    }
  });

  it("round 9, +discussion arm: a nest-miss child renders the *default rule's type on the open view (RIGHT-discussion unknown:true)", async () => {
    // The new-card template type chain: format/nest/fetch.rb#new_card ->
    // Card.fetch new: -> type_id_from_template -> template&.type_id, where
    // the template for a NEW card is the *default rule card (templating.rb
    // new_card_template). Oracle: raw-ground-truth 9625/13421/14382 render
    // the absent "+Discussion" child's open-view slot with
    // data-card-type-id=3 (RichText) from the discussion+*right+*default
    // rule card's own type. The open view renders on the unknown child
    // because card-mod-comment set/right/discussion.rb:1-6 redeclares
    // `%i[open open_content titled titled_content].each { view viewname,
    // unknown: true }` for the RIGHT-discussion set — the port's compiled
    // UNKNOWN_VIEW_DECLS row (format.ts), dispatch via viewForUnknown.
    const fresh = await createRenderTestStorage();
    try {
      await seedCard(fresh, { id: 100, name: "Page" });
      // The *default setting card + the *right pattern card + the set
      // junction "discussion+*right" (NULL-key junction rows) + the rule
      // row "discussion+*right+*default" typed Page — the type the new
      // child inherits (the child's right part "discussion" is what the
      // RIGHT pattern matches, any left).
      await seedCard(fresh, { id: 102, name: "*default", codename: "default" });
      await seedCard(fresh, { id: 101, name: "*right", codename: "right" });
      await seedCard(fresh, { id: 300, name: "discussion" });
      await seedCard(fresh, { id: 303, leftId: 300, rightId: 101 }); // discussion+*right
      await seedCard(fresh, {
        id: 304,
        leftId: 303,
        rightId: 102,
        typeId: 100, // the rule card's own type = the new-child type
      });
      await seedCard(fresh, {
        id: 305,
        name: "Thing Host",
        typeId: 100,
        dbContent: "<p>{{+discussion|open}}</p>",
      });
      const html = await fresh.engine.render("Thing Host", "open");
      // The child slot renders as an open-view with the *default rule's
      // type attributes (no data-card-id: the child has no row).
      expect(html).toContain("thing_host-discussion-open-view");
      expect(html).toContain('data-card-type-id="100"');
      expect(html).toContain('data-card-type-name="Page"');
      // The class chain carries the inherited TYPE token plus the
      // RIGHT-discussion set token the unknown:true decl rides.
      expect(html).toContain("TYPE-page");
      expect(html).toContain("RIGHT-discussion");
      // ...and the nest resolved contextually: <instance>+discussion
      // (round 9's absolutization), not the literal "+discussion". The
      // NAME-FORM port's slot_cardname rule (card-mod-format wrap.rb:50-53:
      // an UNSAVED COMPOUND card displays the url_key form — live pin
      // Conflict_Done_Well.html) shapes the display: url_key
      // "Thing_Host+discussion", case kept, underscore for the space.
      expect(html).toContain('data-card-name="Thing_Host+discussion"');
      // discussion.rb:2-5 `voo.show :comment_box` before super() — the
      // show list in the slot JSON carries it.
      expect(html).toContain("&quot;comment_box&quot;");
    } finally {
      fresh.close();
    }
  });
});
