// THE UNKNOWN-CARD DEFAULT TYPE IS DERIVED FROM THE DECK'S *all+*default
// RULE CARD, NEVER CONSTANT.
//
// THE DEFECT: for a pointer/list item whose name is ABSENT from the deck
// and whose host resolves no item type, the deck rendered the
// quiet-denial mini_bar carrying the DEFAULT-TYPE TOKENS of the deck's own
// `*all+*default` rule card (its TYPE token, data-card-type-id and
// data-card-type-name). The port emitted its own fallback — the RichText
// type's tokens at both sites — wrong type identity on every phantom.
//
// WHY THE CONSTANT WAS WRONG — THE PREMISE, FALSIFIED. views.ts#
// phantomIdentity carried this comment (now corrected there): "the deck
// carries NO *all+*default rule row at all". The row EXISTS. The
// verification query could not see it because a raw capture stores every
// JUNCTION row with `name IS NULL` (the junction name is composed from
// left_id/right_id by the name walk) — a SELECT by name finds nothing
// while a SELECT by left_id + right_id finds the rule. The engine's own
// recursive name-walk universe statement
// (rules/structure.ts#ruleUniverseStatementBySetting) composes the rule,
// and newCardDefaultType answers its type once the universe has loaded.
//
// DERIVE, DO NOT HARDCODE. The pin below therefore asserts the DERIVATION
// resolves (the deck's own rule row decides) and that a deck whose
// `*all+*default` rule card carries a DIFFERENT type emits THAT type's
// tokens — a constant could not pass the second assertion. The RichText
// literal survives only as the no-rule-deck fallback (no `*all+*default`
// row at all), which is the one case the old comment's reasoning reaches.
//
// SECOND PIN (the known-card guard): the derivation is reachable ONLY from
// the unknown-phantom arm. Every KNOWN card keeps its OWN stored type in
// its slot attrs and its `data-card-id`. The fixture's two known cards —
// a stored custom-typed card and a stored Cardtype — are asserted by id,
// name and type tokens, so a derivation that leaked into the known arms
// would fail here.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

/** The deck skeleton the phantom arm needs: the cardtype/setting cards, the
 *  permission parties, the two read rules, and a List host whose item line
 *  names a card that does NOT exist. `defaultRuleTypeId` is the type the
 *  deck's `*all+*default` rule card (id 28) carries — the parameter the
 *  second pin varies, so the assertion is on the DERIVATION and not on a
 *  transcribed constant. */
async function seedDeckWithDefaultRule(
  s: RenderTestStorage,
  defaultRuleTypeId: number,
  defaultRuleTypeName: string,
  opts: { withDefaultRule: boolean } = { withDefaultRule: true },
): Promise<void> {
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  // RichText (id 3) MUST exist: the old arm keyed off "the RichText card
  // resolves", so its absence would let a broken build pass by accident.
  await seedCard(s, { id: 3, name: "RichText", typeId: 5 });
  await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  // Rule 28's sides: *all (274, Set) and *default (318).
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 318, name: "*default", codename: "default", typeId: 278 });
  // The deck's default type card — the one `*all+*default` points at.
  await seedCard(s, { id: 22281, name: "BasicCs", codename: "basic_c", typeId: 5 });
  await seedCard(s, { id: 2979, name: "consideration", typeId: 5 });
  // A SECOND type card, so the varied-rule test can point the rule row at
  // a type other than the deck's default.
  await seedCard(s, { id: 444, name: "Practice", typeId: 5 });
  // The known card's stored type card — the known-card guard
  // asserts the card's OWN type name survives.
  await seedCard(s, { id: 423, name: "Pattern", typeId: 5 });
  // Permission parties.
  await seedCard(s, { id: 10, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 11, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
  await seedCard(s, { id: 12, name: "Anonymous", codename: "anonymous", typeId: 2 });
  // *all+*read = "Anyone" (the readable fallback rule).
  await seedCard(s, { id: 800, name: "*all+*read", leftId: 274, rightId: 704, typeId: 2, dbContent: "Anyone" });
  await seedReference(s, 800, 10, "anyone", "L");
  // <defaultType>+*type (rule 22282) and <defaultType>+*type+*read (rule
  // 22283) = "Anyone Signed In" — the Anonymous denial the denied phantom
  // body rides.
  await seedCard(s, { id: 22282, name: `${defaultRuleTypeName}+*type`, leftId: defaultRuleTypeId, rightId: 259, typeId: 259 });
  await seedCard(s, { id: 22283, name: `${defaultRuleTypeName}+*type+*read`, leftId: 22282, rightId: 704, typeId: 2, dbContent: "Anyone Signed In" });
  await seedReference(s, 22283, 11, "anyone_signed_in", "L");
  // THE DECK'S DEFAULT-TYPE RULE. `name` is left to the
  // seeder's junction handling (junction name IS NULL in a raw capture).
  if (opts.withDefaultRule) {
    await seedCard(s, { id: 28, name: "*all+*default", leftId: 274, rightId: 318, typeId: defaultRuleTypeId, dbContent: "" });
  }
  // A List host whose single item line names an ABSENT card and whose
  // host resolves NO item type (no *content options type rule) — the arm
  // phantomIdentity's unresolved-host path.
  await seedCard(s, { id: 99100, name: "phantom host", typeId: 47, dbContent: "absent item" });
  await seedCard(s, { id: 99101, name: "phantom host+*self", leftId: 99100, rightId: 708, typeId: 259 });
  // Two KNOWN cards whose stored types must survive untouched.
  await seedCard(s, { id: 629, name: "Narrative", typeId: 423, dbContent: "known narrative" });
  await seedCard(s, { id: 22749, name: "*footer", typeId: 5, dbContent: "known footer" });
}

/** The full rendering environment warms the WHOLE deck (every card id,
 *  then warmLexicon over all of them) before the first page render. The
 *  RichText type card is therefore in the engine's render-card map by the
 *  time a pointer item's phantom is built — which is why the old literal in
 *  phantomIdentity fired there. A synthetic deck that left RichText cold
 *  would let a build that DELETED the fallback pass by accident, so the
 *  fixture warms it explicitly. */
async function warmDeckLikeTheGradedRun(s: RenderTestStorage): Promise<void> {
  await s.engine.prepareItemForRender("RichText");
}

describe("unknown pointer/list item: the default type is DERIVED from the deck's *all+*default rule card", () => {
  it(
    "RED->GREEN: an unresolved-host phantom's mini_bar emits the *all+*default rule's type tokens (BasicCs / 22281 / TYPE-basic_c), not the RichText fallback",
    async () => {
      storage = await createRenderTestStorage();
      await seedDeckWithDefaultRule(storage, 22281, "BasicCs");
      await warmDeckLikeTheGradedRun(storage);

      const html = await storage.engine.render("phantom host", "content");

      // The denied two-span body — the arm under test.
      expect(html).toContain('class="denied"');
      // THE THREE-TOKEN PIN, at BOTH sites (the slot wrap and the inner
      // bar div). At base these read TYPE-rich_text / '3' / RichText.
      const slot = /<div id="absent_item-mini_bar-view" class="card-slot mini_bar-view ([^"]*)"([^>]*)>/.exec(html);
      expect(slot, `no mini_bar slot in:\n${html}`).not.toBeNull();
      expect(slot![1]).toContain("TYPE-basic_c");
      expect(slot![2]).toContain('data-card-type-id="22281"');
      expect(slot![2]).toContain('data-card-type-name="BasicCs"');
      const bar = /<div class='bar ([^']*)'([^>]*)>/.exec(html);
      expect(bar, `no denied bar div in:\n${html}`).not.toBeNull();
      expect(bar![1]).toContain("TYPE-basic_c");
      expect(bar![2]).toContain("data-card-type-id='22281'");
      expect(bar![2]).toContain("data-card-type-name='BasicCs'");
      // The RichText fallback must not appear ANYWHERE in the phantom's
      // two sites.
      expect(slot![1]).not.toContain("TYPE-rich_text");
      expect(html).not.toContain("data-card-type-name='RichText'");
    },
  );

  it(
    "the derivation is data-driven: point the deck's *all+*default rule card at Practice (444) and the phantom emits Practice tokens",
    async () => {
      storage?.close();
      storage = await createRenderTestStorage();
      await seedDeckWithDefaultRule(storage, 444, "Practice");
      await warmDeckLikeTheGradedRun(storage);

      const html = await storage.engine.render("phantom host", "content");

      const slot = /<div id="absent_item-mini_bar-view" class="card-slot mini_bar-view ([^"]*)"([^>]*)>/.exec(html);
      expect(slot, `no mini_bar slot in:\n${html}`).not.toBeNull();
      // A hardcoded BasicCs constant fails here; a derivation passes.
      expect(slot![1]).toContain("TYPE-practice");
      expect(slot![2]).toContain('data-card-type-id="444"');
      expect(slot![2]).toContain('data-card-type-name="Practice"');
    },
  );

  it(
    "a deck with NO *all+*default rule card keeps the RichText fallback (the one case the old premise reached)",
    async () => {
      storage?.close();
      storage = await createRenderTestStorage();
      await seedDeckWithDefaultRule(storage, 22281, "BasicCs", { withDefaultRule: false });
      await warmDeckLikeTheGradedRun(storage);

      const html = await storage.engine.render("phantom host", "content");

      const slot = /<div id="absent_item-mini_bar-view" class="card-slot mini_bar-view ([^"]*)"([^>]*)>/.exec(html);
      expect(slot, `no mini_bar slot in:\n${html}`).not.toBeNull();
      // With no rule card the walk answers nothing, so the engine's
      // documented literal fallback stands.
      expect(slot![2]).toContain('data-card-type-id="3"');
      expect(slot![2]).toContain('data-card-type-name="RichText"');
    },
  );

  it(
    "KNOWN-card guard: the derivation never touches a known card's stored type or data-card-id (Narrative 629, *footer 22749)",
    async () => {
      storage?.close();
      storage = await createRenderTestStorage();
      await seedDeckWithDefaultRule(storage, 22281, "BasicCs");
      await warmDeckLikeTheGradedRun(storage);

      const narrative = await storage.engine.render("Narrative", "content");
      const footer = await storage.engine.render("*footer", "content");

      // id + name + STORED type tokens survive (the seeded stored types:
      // one custom-typed card, one Cardtype).
      expect(narrative).toContain('data-card-id="629"');
      expect(narrative).toContain('data-card-name="Narrative"');
      expect(narrative).toContain('data-card-type-id="423"');
      expect(narrative).toContain('data-card-type-name="Pattern"');
      expect(footer).toContain('data-card-id="22749"');
      expect(footer).toContain('data-card-type-id="5"');
      expect(footer).toContain('data-card-type-name="Cardtype"');
      // A known card never renders through the unknown-phantom body, so
      // no denied-standalone spans in its own slot.
      expect(narrative).not.toContain('data-card-type-name="BasicCs"');
    },
  );
});
