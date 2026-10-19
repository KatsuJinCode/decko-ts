// event :validate_delete (card-1.110.0 mod/core set/all/trash.rb:29-49) runs
// through the ModEventFn execution seam with its REAL body — all three Ruby
// checks — and the delete path's inline built-in codename check STANDS DOWN
// when the name is registered (the takeover contract's shape).
//
// Sources every expectation derives from (upstream source, card-1.110.0):
// - trash.rb:31-43, verbatim:
//     unless codename.blank?
//       errors.add :delete, t(:core_error_system_card, name: ..., codename: ...)
//     end
//     undeletable_all_rules_tags = %w[default style layout create read update delete]
//     if compound? && left&.codename == :all &&
//        undeletable_all_rules_tags.member?(right.codename.to_s)
//       errors.add :delete, t(:core_error_indestructible, name: name)
//     end
//     errors.add :delete, t(:core_error_user_edits, name: name) if account && has_edits?
// - en.yml:13 "%{name} is an indestructible rule"; en.yml:18 "%{name} is is
//   a system card. (%{codename})" (the doubled "is" is the shipped
//   template's); en.yml:20 "Edits have been made with %{name}'s user
//   account.\nDeleting this card would mess up our history."
// - `account` is nil on plain cards (card-mod-account set/all/account.rb:8)
//   and truthy on the AccountHolder sets (set/type/user.rb:1 includes
//   Abstract::AccountHolder); has_edits? (card-mod-history set/all/history.rb
//   :47-49) = Card::Act.where(actor_id: id).where("card_id IS NOT NULL").present?.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";

registerDeckModEventCardStateSources();

function coreRegistry() {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

function engine(
  storage: ActionsTestStorage,
  opts: { forceSkip?: string[] } = {},
): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: { id: 9, name: "Joe User" },
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: {
      registry: coreRegistry(),
      predicates: coreModEventPredicates,
      ...(opts.forceSkip !== undefined ? { forceSkip: opts.forceSkip } : {}),
    },
  });
}

/** The delete-guard deck: the seeded codename card (*all at 7), a codenamed
 *  non-rule card, the *all rule cards for a protected and an unprotected
 *  tag, and a User-typed holder with and without acts. */
async function guardDeck(storage: ActionsTestStorage): Promise<{
  codenameCardId: number;
  protectedRuleId: number;
  unprotectedRuleId: number;
  holderWithEditsId: number;
  holderWithoutEditsId: number;
}> {
  const codenameCard = await seedCard(storage, {
    id: 71,
    name: "Badged Card",
    codename: "badged",
    typeId: 2,
  });
  const allId = 7; // seedStandardDeck seeds *all, codename "all"
  // seedStandardDeck already seeds the *all+*default rule (the deck's
  // basic-type default) — that row IS the protected rule.
  const seededDefaultRule = await storage.selectOne<{ id: number }>(
    "SELECT id FROM cards WHERE left_id = 7 AND right_id = 8 AND trash = 0",
    [],
  );
  const protectedRule = { id: seededDefaultRule?.id ?? 0 };
  const titleSetting = await seedCard(storage, { id: 73, name: "*title", codename: "title", typeId: 14 });
  const unprotectedRule = await seedCard(storage, {
    id: 75,
    leftId: allId,
    rightId: titleSetting.id,
    typeId: 2,
    dbContent: "Widget",
  });
  const userType = await seedCard(storage, { id: 76, name: "User", codename: "user", typeId: 3 });
  void userType;
  const holderWithEdits = await seedCard(storage, { id: 77, name: "Editor Joe", typeId: 76 });
  await storage.driver.query(
    "INSERT INTO card_acts (card_id, actor_id, acted_at, ip_address) VALUES (?, ?, ?, ?)",
    [50, holderWithEdits.id, Date.now(), "192.0.2.7"],
  );
  const holderWithoutEdits = await seedCard(storage, { id: 78, name: "Fresh Sam", typeId: 76 });
  void holderWithoutEdits;
  return {
    codenameCardId: codenameCard.id,
    protectedRuleId: protectedRule.id,
    unprotectedRuleId: unprotectedRule.id,
    holderWithEditsId: holderWithEdits.id,
    holderWithoutEditsId: holderWithoutEdits.id,
  };
}

describe("validate_delete — the three checks through the seam (trash.rb:29-49)", () => {
  it("a codenamed card refuses with the en.yml system-card message", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { codenameCardId } = await guardDeck(storage);
    await expect(engine(storage).deleteCard({ cardId: codenameCardId })).rejects.toMatchObject({
      code: "protected-card",
      errorsByAttribute: { delete: "Badged Card is is a system card. (badged)" },
    });
    storage.close();
  });

  it("an *all rule with a protected tag refuses as an indestructible rule", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { protectedRuleId } = await guardDeck(storage);
    await expect(engine(storage).deleteCard({ cardId: protectedRuleId })).rejects.toMatchObject({
      code: "protected-card",
      errorsByAttribute: { delete: "*all+*default is an indestructible rule" },
    });
    storage.close();
  });

  it("an *all rule with an unprotected tag deletes", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { unprotectedRuleId } = await guardDeck(storage);
    const result = await engine(storage).deleteCard({ cardId: unprotectedRuleId });
    expect(result).not.toBeNull();
    storage.close();
  });

  it("a User holder with prior acts refuses with the user-edits message", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { holderWithEditsId } = await guardDeck(storage);
    await expect(engine(storage).deleteCard({ cardId: holderWithEditsId })).rejects.toMatchObject({
      code: "protected-card",
      errorsByAttribute: {
        delete:
          "Edits have been made with Editor Joe's user account.\nDeleting this card would mess up our history.",
      },
    });
    storage.close();
  });

  it("a User holder with no acts deletes", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { holderWithoutEditsId } = await guardDeck(storage);
    const result = await engine(storage).deleteCard({ cardId: holderWithoutEditsId });
    expect(result).not.toBeNull();
    storage.close();
  });

  it("a plain card with none of the three shapes deletes", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine0 = engine(storage);
    const plain = await engine0.createCard({ name: "Plain Thing", content: "x" });
    const result = await engine0.deleteCard({ cardId: plain.cardId });
    expect(result).not.toBeNull();
    storage.close();
  });

  it("skip_event! :validate_delete drops every check", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { codenameCardId, protectedRuleId, holderWithEditsId } = await guardDeck(storage);
    const skipping = engine(storage, { forceSkip: ["validate_delete"] });
    await expect(skipping.deleteCard({ cardId: codenameCardId })).resolves.not.toBeNull();
    await expect(skipping.deleteCard({ cardId: protectedRuleId })).resolves.not.toBeNull();
    await expect(skipping.deleteCard({ cardId: holderWithEditsId })).resolves.not.toBeNull();
    storage.close();
  });
});
