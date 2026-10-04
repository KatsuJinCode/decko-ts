// THE NEST'S MARK NAMES A FABRICATED UNKNOWN CARD (Aiki casing, runbook
// mechanism #4).
//
// THE DEFECT (parity-restore-runbook.md:184, `Aiki:page`, −3342): the
// capture renders `data-card-name="Aiki+*referred_to_by"`; the port rendered
// `data-card-name="aiki+*referred_to_by"` (the KEY-cased form).
//
// THE MECHANISM, TRACED THIS LANE (not inferred):
//   * `resolveNestName` is CORRECT. Instrumented, the Aiki page logged
//     {raw: "_self+*referred_to_by", cardName: "Aiki", cardKey: "aiki",
//     cardId: 2705} and `DeckoName.absoluteName` answers
//     "Aiki+*referred_to_by". The name algebra is not the defect.
//   * A DIFFERENT card reached the nest target first. Instrumented at
//     rules/structure.ts#templateReferenceNames:
//       {refName: "aiki+*referred_to_by", relative: false,
//        ctx: "Aiki+references", out: "aiki+*referred_to_by"}
//     — the corpus row `Aiki+references` (27199) stores its reference in KEY
//     case, so the structure walk's compound-ref warm
//     (render.ts#applyStructureContent -> fetcher.fetchByName) fetched
//     "aiki+*referred_to_by", MISSED (corpus: left 2705 + right 3945 has no
//     row), and cached a `Card.new` placeholder named FROM THE MARK — the
//     key form. Instrumented at enrichAndStore's renderCards.set:
//       {name: "aiki+*referred_to_by", recIsNew: true, typeName: "Search"}.
//   * The page's own nest then resolved the right name, but the render-side
//     read is `fetchRenderCard` — a PURE key lookup — and HIT that
//     placeholder.
//
// WHY RUBY DOES NOT HAVE THIS: results.rb:30-32 `assign_name` runs on EVERY
// fetch, so the MARK names the card the caller gets back even when the shared
// cache already holds it under its key (store.rb:21-28 keys the placeholder
// by key; the returned object's @name still follows the mark).
//
// THE FIX (format.ts#nest): re-bind the mark's name onto an id-less
// fabricated card whose name differs. A STORED card is never re-bound — its
// row's name is the truth, and re-binding would let an authored `{{aiki}}`
// rename the "Aiki" card's slots.
//
// HONEST SCOPE OF THIS FIXTURE — IT IS A REGRESSION GUARD, NOT A RED PIN.
// Run against the BASE tree (69648930) this file also passes 2/2: the
// synthetic deck does not reproduce the corpus race. Reproducing it needs the
// *structure universe the real corpus loads (applyStructureContent early-
// returns when structureContents is undefined), so the key-case warm never
// fires here. The defect is therefore pinned on the CORPUS, not here: on the
// graded corpus the Aiki page's first slot-id-normalized difference moves
// from offset 20940 (the data-card-name casing) to 23902 after the fix, and
// the page's data-card-name attrs for the target read
// "Aiki+*referred_to_by" (measured: tmp/lane-defaulttype/
// probe-aiki-after-fix.mjs, probe-aiki-casing-2/3/4.mjs). What this file
// guards is the stored-card half of the fix — a known card keeps its row's
// name, so the mark re-binding can never rename a stored card from an
// authored key-case nest.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

/** Card 2705 `Aiki` (Research-typed in the capture; the deck skeleton here
 *  only needs a resolvable type card) and the two children whose contents
 *  race over the shared unknown junction target. */
async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 650, name: "Research", typeId: 5 });
  await seedCard(s, { id: 3945, name: "*referred to by", codename: "referred_to_by", typeId: 47 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  // The page card, stored with a NAME whose case differs from its key.
  await seedCard(s, { id: 2705, name: "Aiki", typeId: 650, dbContent: "<p>{{_self+*referred to by}}</p>" });
  // A sibling whose stored content names the SAME unknown junction target in
  // KEY case — the structure walk warms this name first, and the fetch miss
  // fabricates a placeholder named from the key.
  await seedCard(s, {
    id: 27199,
    name: "Aiki+references",
    leftId: 2705,
    rightId: 658,
    typeId: 3,
    dbContent: "<p>{{aiki+*referred_to_by}}</p>",
  });
  await seedCard(s, { id: 658, name: "references", typeId: 2 });
  await seedCard(s, { id: 3, name: "RichText", typeId: 5 });
  await seedCard(s, { id: 22281, name: "BasicCs", typeId: 5 });
  await seedCard(s, { id: 318, name: "*default", codename: "default", typeId: 278 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 28, name: "*all+*default", leftId: 274, rightId: 318, typeId: 22281, dbContent: "" });
}

describe("the nest's MARK names a fabricated unknown card (Aiki casing)", () => {
  it(
    "an unknown junction target nested in MARK case renders the mark-cased data-card-name, not the key-cased one a structure warm pre-seeded",
    async () => {
      storage = await createRenderTestStorage();
      await seedDeck(storage);

      // RENDER ORDER IS THE RACE: the sibling goes first and its key-case
      // content warms the key-named placeholder; the page card then nests the
      // SAME junction target in mark case. Exactly the Aiki page order.
      await storage.engine.render("Aiki+references", "content");
      const html = await storage.engine.render("Aiki", "content");

      // The shared unknown junction target, rendered under the MARK's case.
      // At base the slot carries data-card-name="aiki+*referred_to_by".
      expect(html).toContain('data-card-name="Aiki+*referred_to_by"');
      expect(html).not.toContain('data-card-name="aiki+*referred_to_by"');
      // The slot id rides the safe_key form either way — the defect is the
      // NAME attribute only, so the id is unchanged and is pinned here so a
      // future over-correction (renaming the slug too) fails.
      expect(html).toContain('id="aiki-Xreferred_to_by-');
    },
  );

  it(
    "a STORED card keeps its row's name: an authored key-case nest never renames a known card's slot",
    async () => {
      storage?.close();
      storage = await createRenderTestStorage();
      await seedDeck(storage);

      // `Aiki+references` is a STORED junction (left 2705 + right 27198). The
      // authored content names `aiki+*referred_to_by` in key case; the row's
      // own name is "Aiki+references" and the nested target is ABSENT, so
      // the guard under test is that a stored card's slot is not re-bound
      // while its id-less unknown CHILD is.
      const html = await storage.engine.render("Aiki+references", "content");
      expect(html).toContain('data-card-id="27199"');
      expect(html).toContain('data-card-name="Aiki+references"');
    },
  );
});
