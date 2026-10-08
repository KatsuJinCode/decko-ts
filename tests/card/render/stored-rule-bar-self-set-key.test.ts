// Mechanism 1 of the live-wire page-render defect verdict
// (REPO_DIR an internal work log, 2026-09-28):
// the engine OMITS the `SELF-X<left>-X<right>` class token from STORED rule
// cards' bar class lists. Probe evidence: `TYPE_PLUS_RIGHT-set-Xfollow_field
// SELF-Xall-Xfollow_field` — snapshot=2, engine=0, live wire=2 (the live
// site and the 2026-09-24 snapshot agree, the engine diverges).
//
// The oracle arbitrates VIRTUAL vs STORED on one page (the snapshot *all
// page, the captured 2026-09-28 oracle bytes):
//
//   VIRTUAL rule bar `*all+*autoname` (no data-card-id — Ruby's
//   rule_lists.rb:96-101 `card.fetch setting, new: {}` miss):
//     class="card-slot bar-view ALL ALL_PLUS TYPE-phrase RSTAR RULE
//     RIGHT-Xautoname TYPE_PLUS_RIGHT-set-Xautoname _rule-item
//     _category-all"   <- NO SELF token (correct: pattern/all.rb:27-29
//     `patterns`: a NEW card drops concrete_patterns[0] = *self; the
//     concrete table's reverse-file registration order puts *self first)
//
//   STORED rule bar `*all+*follow fields` (data-card-id="22730", corpus row
//   left_id 274 + right_id 22726, junction name composed from the lexicon):
//     class="card-slot bar-view ALL ALL_PLUS TYPE-list RSTAR RULE
//     RIGHT-Xfollow_field TYPE_PLUS_RIGHT-set-Xfollow_field
//     SELF-Xall-Xfollow_field _rule-item _category-all _category-recent"
//     <- WITH the SELF token (states.rb:70-75 new?: new_record? is FALSE
//     for a stored row, so `patterns` keeps all nine concrete patterns and
//     safe_set_keys (pattern/all.rb:40-42) emits `SELF-Xall-Xfollow_field`:
//     Base#safe_key (pattern/base.rb:70-73) joins SELF with the anchor
//     name's safe_key (variants.rb:19-21 key.tr("*","X").tr("+","-"));
//     Cardname#key retains the "*" on setting parts, and the oracle deck's
//     inflection singularizes "fields" -> "field" in the KEY, so the
//     `*follow fields` part keys to `*follow_field`).
//
// This test pins the STORED shape with a minimal deck mirroring the corpus
// rows (r16-rule-bar-and-stored-verdict-parity.test.ts's harness): the
// set card, the setting card, and the stored junction rule row whose name
// composes from the sides (the corpus stores junction names as NULL).
//
// The engine's VIRTUAL bars already match (no SELF — asserted here too as
// the negative control so the fix cannot "succeed" by adding SELF to
// virtual bars, where the oracle omits it).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;

async function seedDeck(): Promise<void> {
  const s = storage!;
  // Type cards (the codename column feeds the codehash).
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  // Parties.
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  // The catch-all set card + the two settings the bars below render.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 22, name: "*autoname", codename: "autoname", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 36, name: "*follow fields", codename: "follow_fields", typeId: SETTING_TYPE_ID });
  // The deck's readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The *recent settings card: the recent category membership is DECK DATA
  // (setting_categories.rb:64-67), so the fixture carries the corpus's
  // *recent settings card; the pinned bar's `_category-recent` class
  // derives from its list (follow_fields is an item).
  await seedCard(s, {
    id: 42,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: LIST_TYPE_ID,
    dbContent:
      "*read\n*structure\n*script\n*content options\n*input type\n*default\n*layout\n*help\n*thanks\n*update\n*guide\n*head\n*follow\n*style\n*content option view\n*create\n*follow fields\n*delete\n*captcha\n*table of contents\n*comment",
  });
  // THE STORED RULE the test pins: *all+*follow fields (corpus id 22730:
  // left_id 274 -> *all, right_id 22726 -> *follow fields, type List,
  // junction name column NULL - the name composes from the sides).
  await seedCard(s, { id: 51, leftId: 10, rightId: 36, typeId: LIST_TYPE_ID, dbContent: "" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  for (const name of ["*read", "*autoname", "*follow fields", "*recent settings"]) {
    try {
      await storage.engine.render(name, "open");
    } catch {
      // best-effort warm-up only
    }
  }
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** The bar slot's outer class attribute, verbatim from the oracle window
 *  (snapshot *all page offset 57356). */
const ORACLE_SLOT_CLASS =
  "card-slot bar-view ALL ALL_PLUS TYPE-list RSTAR RULE RIGHT-Xfollow_field " +
  "TYPE_PLUS_RIGHT-set-Xfollow_field SELF-Xall-Xfollow_field _rule-item " +
  "_category-all _category-recent";

describe("stored rule bar: SELF-X set-key token (live-wire mechanism 1)", () => {
  it("emits SELF-Xall-Xfollow_field on the STORED *all+*follow fields bar", async () => {
    const html = await storage!.engine.render("*all", "content");
    const at = html.indexOf("Xfollow_field-bar-view");
    expect(at).toBeGreaterThan(-1); // the bar renders at all
    const slotStart = html.lastIndexOf("<div", at);
    const slot = html.slice(slotStart, slotStart + 400);
    expect(slot).toContain(ORACLE_SLOT_CLASS);
    // ... and the token appears on the inner bar element too (the oracle
    // counts 2 occurrences on the page: slot class + bar class).
    expect(
      (html.match(/SELF-Xall-Xfollow_field/g) ?? []).length,
    ).toBe(2);
  });

  it("keeps the VIRTUAL *all+*autoname bar SELF-free (negative control)", async () => {
    const html = await storage!.engine.render("*all", "content");
    const at = html.indexOf("Xautoname-bar-view");
    expect(at).toBeGreaterThan(-1);
    expect((html.match(/SELF-Xall-Xautoname/g) ?? []).length).toBe(0);
  });
});
