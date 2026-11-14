// act155-w4-type-assignment-codename-read.test.ts
//
// THE PIN: the set-type-assignment walk's anchor read is the CODENAME of
// the anchor part, and that read is LEXICON-based - so a right part whose
// name is only a codename ("follow", the codename of the card "*follow")
// has NO codename of its own, and the walk finds no module key for it.
//
// WHY THIS MATTERS TO ROW mx-155 (the W4 row). The row's surfaces are the
// follow views, and one of them ("<User>+follow", the type-plus-right user
// follow set - card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb)
// renders the EDITOR of a card that is in the list family without being a
// list card. Which editor it renders is decided by the card's type, and
// the card's type is decided by the assignment walk:
//
//   card-1.110.0 mod/core/set/all/type.rb:58-66  ensure_type_id:
//     `type_id_from_code || type_id_from_template`
//   card-1.110.0 mod/core/set/all/type.rb:68-76  type_id_from_code:
//     for each type-assigning module key, `Card::Set::Type.assignment[key]&.card_id`
//   card-1.110.0 lib/card/set/pattern/base.rb:39-43  anchor_codenames:
//     `anchor_parts.map { |part| part.cardname&.codename || break }`
//   card-1.110.0 lib/card/name/name_variants.rb:37-39  Card::Name#codename:
//     `Codename[card_id]`, and card_id is `Lexicon.id self`
//     (lib/card/name/name_variants.rb:33-35)
//   card-1.110.0 lib/card/lexicon.rb:112-118  name_to_lex: a SIMPLE name
//     looks itself up - the card NAMED "follow" - and the deck's card is
//     named "*follow" (its codename is "follow"). So Ruby's codename read
//     for the name "follow" is NIL, the Right pattern's anchor_codenames
//     breaks, the walk builds no module key, and the card "X+follow" is NOT
//     List-typed.
//
//   The port answers the same way (this test): the walk answers ["list"] for
//   "X+*follow" (the starred name IS the card's name, so its codename
//   resolves) and [] for "X+follow" (the unstarred name is only a codename).
//
// WHAT THAT MEANS FOR THE SURFACE: the "X+follow" card is not a list card,
// so the list family's :input view reaches the editor module's :input view
// through Ruby's super() chain and renders the RICH TEXT editor - the pin
// in tests/card/mod-loader/card-mod-list-base-format-input-super-chain.test.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFetchTestStorage,
  seedCard,
  type FetchTestStorage,
} from "../fetch/fetch-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  listAssignedTypeNamesForCard,
  registerSetTypeAssignment,
} from "../../../src/card/set-patterns/set-type-assignment.js";

let storage: FetchTestStorage;

beforeEach(async () => {
  storage = await createFetchTestStorage();
});

afterEach(() => {
  storage.close();
});

describe("the assignment walk's anchor read is the lexicon-based codename (row mx-155)", () => {
  it("'X+*follow' carries the Right::Follow assignment; 'X+follow' carries none", async () => {
    // the deck's shape: the follow option card is named "*follow" and its
    // codename is "follow" (the fixture's own row: id 455).
    await seedCard(storage, { id: 455, name: "*follow", codename: "follow", typeId: 2 });
    await seedCard(storage, { id: 4, name: "List", codename: "list", typeId: 2 });
    await seedCard(storage, { id: 617, name: "Mira Member", key: "mira_member", typeId: 18 });
    await seedCard(storage, { id: 18, name: "User", codename: "user", typeId: 2 });
    // card-mod-follow-0.20.0/set/right/follow.rb:5 `assign_type :list`
    registerSetTypeAssignment("Right::Follow", "list");

    storage.engine.installNameEnvironment();
    await storage.engine.codenames.ensureLoaded();
    await storage.engine.lexicon.id("*follow");

    // the codename read: the card's OWN name carries it, the bare codename
    // does not (Lexicon.id "follow" is the card NAMED "follow" - there is
    // none, so Ruby's answer is nil and the port's is undefined).
    expect(DeckoName.parse("*follow").codename).toBe("follow");
    expect(DeckoName.parse("follow").codename).toBeUndefined();
    expect(await storage.engine.lexicon.id("follow")).toBeUndefined();

    // the walk: the starred name is List-typed, the unstarred one is not.
    expect(
      listAssignedTypeNamesForCard({ name: "Mira Member+*follow", isNew: true, leftTypeName: "User" }),
    ).toEqual(["list"]);
    expect(
      listAssignedTypeNamesForCard({ name: "Mira Member+follow", isNew: true, leftTypeName: "User" }),
    ).toEqual([]);
  });
});
