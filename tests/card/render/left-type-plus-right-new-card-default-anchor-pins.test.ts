// left-type-plus-right-new-card-default-anchor-pins.test.ts — the
// TYPE_PLUS_RIGHT anchor of a card whose LEFT is not a stored card is
// Card's DEFAULT type, never the nesting context card's type.
//
// MECHANISM (gem source, REPO_ROOT/archive/decko-fork-study/decko/):
//
//   card/lib/card/set/pattern/class_methods.rb:59-71 is the whole rule —
//
//       def left_type card
//         card.superleft&.type_name || quick_type(card.name.left_name)
//       end
//
//       def quick_type name
//         if name.present?
//           card = Card.fetch name, skip_modules: true, new: {}
//           card.include_set_modules if card.new? && name.to_name.compound?
//           card&.type_name
//         else
//           "RichText"
//         end
//       end
//
//   card/mod/core/set_pattern/08_type_plus_right.rb:30-32
//       def anchor_name card
//         "#{left_type(card)}+#{card.name.tag}"
//       end
//
//   card/lib/card/set/pattern/base.rb:70-73 #safe_key renders that anchor
//   as the pattern's `TYPE_PLUS_RIGHT-<anchor>` fragment.
//
// THE NESTING CONTEXT'S TYPE APPEARS NOWHERE IN THAT CHAIN. `quick_type`
// fetches the LEFT NAME with `new: {}`, so a left that is not a stored card
// is a NEW card; `include_set_modules` runs for a new compound; and a new
// card with no type assignment takes Card's DEFAULT type, RichText — the
// very default the pattern registry already applies one line away
// (src/card/set-patterns/registry.ts:186-191,
//  `card.leftTypeName == null ? "RichText" : ...`).
//
// THE DEFECT. RenderFormat#leftTypeNameFor
// (src/card/render/format.ts:1772) ended in `return this.card.typeName` —
// the NESTING card's type. The two implementations therefore disagreed
// whenever a new left was nested from inside a differently-typed context,
// and the slot's `TYPE_PLUS_RIGHT-` fragment took the context's type.
//
// ORACLE PINS — the frozen expected-v2 bytes, each reproduced by a solo
// byte probe at this commit (PASS, byte-identical after slot-id
// normalization):
//   page  recapture-raw-shard-000022 Soma+tags:page
//   page  recapture-raw-shard-000024 Ellery+Vacations:page
//   page  recapture-raw-shard-000024 Ellery+Vacations+Pages:page
//   view  recapture-raw-shard-000022 Soma+tags:open
//   view  recapture-raw-shard-000024 Ellery+Vacations+Pages:open
// The captured fragments are TYPE_PLUS_RIGHT-rich_text-aikido and
// TYPE_PLUS_RIGHT-rich_text-20180623_0728, in a List-typed context; the
// pre-fix engine emitted TYPE_PLUS_RIGHT-list-... for both.
//
// The stored-left arms are pinned so the fix cannot be satisfied by always
// answering "RichText": a STORED left keeps its OWN type (the RVW shape
// leftTypeNameFor's own block comment names), whatever that type is.
//
// FIXTURE SHAPE. The right parts are plain words, not `+set` cards: the
// seeded-junction walk does not resolve a `+`-prefixed right part through
// `fetchByName`, and the mechanism under test is the TYPE_PLUS_RIGHT anchor,
// not the name algebra. The corpus shape that matters is preserved exactly —
// a List-typed compound host whose content nests a NOT-STORED compound card.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

// Type-card ids double as the typeId other rows carry (the house convention
// in bar-menu-wanted-card-name-query.test.ts).
const T_SET = 1;
const T_SETTING = 2;
const T_LIST = 3;
const T_RICH = 4;
const T_PHRASE = 5;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 5, name: "Phrase", codename: "phrase" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: T_SET, dbContent: "{}" });
  const settings: Array<[number, string, string]> = [
    [20, "*read", "read"],
    [21, "*default", "default"],
    [22, "*autoname", "autoname"],
    [23, "*structure", "structure"],
    [24, "*create", "create"],
    [25, "*update", "update"],
    [26, "*delete", "delete"],
    [27, "*captcha", "captcha"],
  ];
  for (const [id, name, codename] of settings) {
    await seedCard(s, { id, name, codename, typeId: T_SETTING });
  }
  // Readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: T_LIST, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");

  // -- case 1: a NEW left (no stored row for the left name) -----------------
  // `soma base+tags` is List-typed and nests `tic+aikido`; the target card
  // is not a stored row, so its own left `tic` is a new card too. This is
  // the exact corpus shape of the Soma / Ellery clusters.
  await seedCard(s, { id: 300, name: "soma base", typeId: T_RICH });
  await seedCard(s, { id: 301, name: "tags", typeId: T_RICH });
  await seedCard(s, {
    id: 302,
    name: "soma base+tags",
    leftId: 300,
    rightId: 301,
    typeId: T_LIST,
    dbContent: "{{tic+aikido|bar}}",
  });

  // -- case 2: a STORED left, RichText ---------------------------------------
  // The nest's left ROOT is the stored card, so `lvw+item_bar`'s left_name
  // is `lvw` — the RVW shape leftTypeNameFor's own block comment names.
  await seedCard(s, { id: 60, name: "lvw", typeId: T_RICH });
  await seedCard(s, { id: 310, name: "lvw base", typeId: T_RICH });
  await seedCard(s, { id: 311, name: "collection", typeId: T_RICH });
  await seedCard(s, {
    id: 312,
    name: "lvw base+collection",
    leftId: 310,
    rightId: 311,
    typeId: T_LIST,
    dbContent: "{{lvw+item|bar}}",
  });

  // -- case 3: a STORED left of a NON-default type --------------------------
  // Identical shape, but the stored left is a Phrase. If the fix were "when
  // in doubt answer RichText", this entry would read
  // TYPE_PLUS_RIGHT-rich_text-label_bar and the pin would fail.
  await seedCard(s, { id: 61, name: "pvw", typeId: T_PHRASE });
  await seedCard(s, { id: 320, name: "pvw base", typeId: T_RICH });
  await seedCard(s, {
    id: 322,
    name: "pvw base+collection",
    leftId: 320,
    rightId: 311, // +collection is shared with the case-2 fixture
    typeId: T_LIST,
    dbContent: "{{pvw+label|bar}}",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("left_type's last fallback is Card's DEFAULT type, not the context card (class_methods.rb:59-71)", () => {
  it("a NEW left nested from a LIST context anchors TYPE_PLUS_RIGHT-rich_text", async () => {
    const html = await storage!.engine.render("soma base+tags", "content");
    expect(html, "the anchored slot must render").toMatch(/card-slot/);
    // The `bar` view's own name suffix is part of the tag, exactly as the
    // corpus's `TYPE_PLUS_RIGHT-rich_text-aikido` slot reads.
    expect(html, "quick_type's new-card default is RichText").toContain(
      "TYPE_PLUS_RIGHT-rich_text-aikido_bar",
    );
    // The pre-fix fragment. Asserted absent so a regression back to the
    // context fallback is a named failure, not a silent one.
    expect(html).not.toContain("TYPE_PLUS_RIGHT-list-aikido_bar");
  });

  it("a STORED left keeps its OWN type (the RVW shape), not the default", async () => {
    const html = await storage!.engine.render("lvw base+collection", "content");
    expect(html, "the anchored slot must render").toMatch(/card-slot/);
    expect(html, "a stored left reads its OWN type").toContain(
      "TYPE_PLUS_RIGHT-rich_text-item_bar",
    );
    // The context card is a List, so the pre-fix fallback would have said
    // `list` here too. Asserted absent for the same reason as above.
    expect(html).not.toContain("TYPE_PLUS_RIGHT-list-item_bar");
  });

  it("a STORED left of a NON-default type is not overwritten by the default", async () => {
    const html = await storage!.engine.render("pvw base+collection", "content");
    expect(html, "the anchored slot must render").toMatch(/card-slot/);
    // If the fix were "when in doubt answer RichText", this entry would
    // read TYPE_PLUS_RIGHT-rich_text-label_bar and the pin would fail.
    expect(html, "a stored non-default left keeps Phrase").toContain(
      "TYPE_PLUS_RIGHT-phrase-label_bar",
    );
  });
});
