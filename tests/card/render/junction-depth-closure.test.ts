// Depth-3+ junction inclusion closure: regression tests for the
// deep-junction resolution defect.
//
// DEFECT: the prefetcher could not resolve
// junction (NULL-key) nest targets deeper than two parts. The original walk
// matched frontier keys against cards.key - which junction rows do not
// carry - and the JS fallback's side-key join required BOTH sides of a
// junction reference to be simple keys, so "A+B+C" (left side "A+B" is
// itself compound) never resolved and the render threw
// "nest target not found: A+B+C" where Ruby rendered.
//
// FIX (src/card/render/prefetch.ts): the closure rounds resolve compound
// references recursively through their sides - simple sides by the indexed
// key column, compound sides by the UNIQUE left_id/right_id pair join once
// the sides' rows are cached - so junction targets resolve at ANY depth.
// (A read-cost fix replaced the whole-deck `resolved` CTE with
// these rounds; the mechanism under test is the same side-recursion.)
//
// NAMING in these fixtures: parts use digit-suffixed names (chain_c1,
// chain_c2, ...) because DeckoName.key SINGULARIZES (measured: key of
// "beta" is "betum"), so alphabetic stems make the span-extracted
// reference key diverge from the composed key - the plural-stem miss the
// last test below covers deliberately.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

interface ChainCard {
  id: number;
  name?: string;
  leftId?: number;
  rightId?: number;
  dbContent?: string;
}

/** Junction rows carry NULL name/key columns and resolve through their
 *  sides (the 2020 Lexicon convention) - exactly what seedCard stores.
 *  Depth 2 is "chain_c1+chain_c2"; each further level appends one part
 *  to the right of the previous junction (left-associative, the compound
 *  the DeckoName algebra composes). */
function chainCards(depth: number): ChainCard[] {
  const cards: ChainCard[] = [
    { id: 701, name: "chain_c1" },
    { id: 702, name: "chain_c2" },
  ];
  if (depth < 2) return cards;
  // depth 2: the c1+c2 junction itself
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

describe("depth-3+ junction inclusion closure (recursive compound-side resolution)", () => {
  it("renders a depth-3 junction inclusion chain, covered by the per-key closure rounds", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(3)) {
        await seedCard(storage, card);
      }
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>deep: {{chain_c1+chain_c2+chain_c3}}</p>",
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction depth 3 body");
      expect(html).toContain("titled-view"); // the html default nest view
      // The closure rounds resolve level by level: round 0 fetches the
      // simple sides + the depth-2 junction (side-key pair join), round 1
      // joins the depth-3 junction by its sides' resolved ids.
      expect(storage.engine.lastRenderStats?.fallbackRounds).toBe(2);
      // Measured shape: 1 root fetch +
      // the PRELUDE batch (src/card/render/prefetch.ts: the root's side
      // priming, the root's TYPE row (enrichment fold), the root's
      // set-pattern anchor priming (the rule walk's *self/*type/*all
      // lex_to_id point queries became cache entries), and the folded
      // engine statements: 3 read-permission + codename codehash +
      // structure universe + *default universe + the HEAD READ-SET
      // statement. default_nest_view is process config (html.rb:17-19),
      // never a deck rule, so render.ts's fold composition no longer
      // appends the *default html view universe statement. The head
      // read-set rides THIS SAME prelude batch as a 13th statement rather
      // than as a query of its own: card-mod-format's head views
      // read deck-level setting cards that no reference closure can
      // reach. ROUND TRIPS are
      // unchanged at 4 - that is the cost that matters on a cold boot) +
      // round-0 batch (fetch shapes only) + round-1 batch (1
      // side-id join). The rule-lookup candidates cost ZERO point queries
      // since the prelude primes their anchors. Constant in deck size;
      // +1 batch per chain LEVEL. The email-template work added TWO
      // prelude statements (13 -> 15), both inside the SAME batch so round
      // trips stay at 4: the email-template read_form's field-setting
      // anchors (prefetch.ts emailFieldAnchorSlot — EXISTS-gated,
      // zero rows for non-template roots) and the +*test context
      // junction priming for email-template/message roots (the read_form
      // nests the junction programmatically and no content reference
      // reaches it; same batch, same EXISTS gate shape).
      const snapshot = storage.counting.snapshot();
      // The freshness stamp read folded into the cold batch: +1 statement,
      // +0 round trips. The wave-seating architecture replaced the single
      // round-0 fetch-shapes batch with the per-wave seating ladder
      // (chunked key IN-lists + side-key joins + resolution rounds,
      // refined by negative-priming ask/answer handling and the closure
      // retirement of proven-unresolvables), which re-pinned this
      // constant. The deck here carries the stock `*all+*read` rule card
      // (createRenderTestStorage seeds it; Ruby has no rule-less reading
      // deck), and the read permission's one-time setup rides the prelude
      // batch, so it adds statements and no round trips: 7 round trips /
      // 26 statements. The invariant the pin guards is intact at these
      // readings: depth-3 (7/26) minus depth-2 (6/25) = +1 round trip
      // +1 statement per chain level, constant in deck size; renders stay
      // byte-correct (the html assertions above are untouched and pass).
      expect(snapshot.roundTrips).toBe(7);
      expect(snapshot.statements).toBe(26); // wave-seating ladder, see above
    } finally {
      storage.close();
    }
  });

  it("renders a depth-4 junction inclusion chain, covered by the per-key closure rounds", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(4)) {
        await seedCard(storage, card);
      }
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>deeper: {{chain_c1+chain_c2+chain_c3+chain_c4}}</p>",
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction depth 4 body");
      expect(storage.engine.lastRenderStats?.fallbackRounds).toBe(3);
    } finally {
      storage.close();
    }
  });

  it("resolves a depth-3 junction through the recursive side-id fallback when the SQL key transform misses", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The junction's tag is "Oracle Basics" - its canonical key is
      // "oracle_basic" (singularized), while the SQL walk's best-effort
      // transform of the authored reference keeps "basics". The SQL miss
      // exercises the fallback: sides resolve, then the junction row joins
      // by its (left_id, right_id) pair - and the composed junction record
      // resolves across fallback rounds through the lexicon.
      await seedCard(storage, { id: 2, name: "RichText" });
      await seedCard(storage, { id: 701, name: "chain_c1" });
      await seedCard(storage, { id: 702, name: "Oracle Basics", dbContent: "stemmed body" });
      await seedCard(storage, { id: 712, leftId: 701, rightId: 702, dbContent: "pair body" });
      await seedCard(storage, { id: 703, name: "chain_c3" });
      await seedCard(storage, { id: 803, leftId: 712, rightId: 703, dbContent: "deep body" });
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>miss: {{chain_c1+Oracle Basics+chain_c3}}</p>",
      });
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("deep body");
      expect(storage.engine.lastRenderStats!.fallbackRounds).toBeGreaterThanOrEqual(1);
    } finally {
      storage.close();
    }
  });

  it("keeps a depth-2 junction render at the constant query shape (no regression)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      for (const card of chainCards(2)) {
        await seedCard(storage, card);
      }
      await seedCard(storage, {
        id: 900,
        name: "Junction Renderer",
        dbContent: "<p>pair: {{chain_c1+chain_c2}}</p>",
      });
      storage.counting.reset();
      const html = await storage.engine.render("Junction Renderer", "content");
      expect(html).toContain("junction depth 2 body");
      const snapshot = storage.counting.snapshot();
      // Measured shape (integrated with the default_nest_view
      // correction): 1 root fetch +
      // the PRELUDE batch (side priming + TYPE row fold + set-pattern
      // anchor priming + the folded engine statements) + the round-0 batch
      // (fetch shapes only). The rule-lookup candidates cost ZERO point
      // queries since the prelude primes their anchors. Constant in deck
      // size; the depth-3/4 tests show the +1 batch per chain level.
      // default_nest_view is process config (html.rb:17-19),
      // never a deck rule, so render.ts's fold
      // composition no longer appends the *default html view universe
      // statement (13 -> 12). The head read-set added one back
      // (11 -> 12), inside the
      // SAME prelude batch, so round trips stay at 3. The email-template
      // work added TWO prelude statements (12 -> 14, see the depth-3 test
      // above): the email field-setting anchors and the +*test context
      // junction priming - same batch, round trips unchanged.
      // The freshness stamp read folded LAST into the cold batch: +1
      // statement, +0 round trips. The wave-seating architecture (with
      // the negative-priming and closure-retirement refinements)
      // restructured the cold render's post-prelude batches from one
      // fetch-shapes round into the per-wave seating ladder, re-pinning
      // this constant. As in the depth-3 case above, this deck carries the
      // stock `*all+*read` rule card and the read permission's setup rides
      // the prelude batch: 6 round trips / 25 statements.
      // +1 batch per chain level still holds (6 here vs the depth-3
      // case's 7).
      expect(snapshot.roundTrips).toBe(6);
      expect(snapshot.statements).toBe(25);
    } finally {
      storage.close();
    }
  });
});
