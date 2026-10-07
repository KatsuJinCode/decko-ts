// bar-bottom-rule-shape-type-refutation-pins.test.ts — a 3-part rule ROW
// whose left is itself a rule row is NOT a RULE-pattern card: its open
// view's bar_bottom renders the STANDARD content view, whose wrap emits
// the content-view slot inside the accordion body.
//
// MECHANISM (gem source, REPO_ROOT/archive/decko-fork-study/decko/):
//
//   Ruby's RULE set pattern is pattern_applies? -> card.rule?
//   (card/mod/core/set_pattern/06_rule.rb:16) and
//   card/lib/card/rule/all.rb:33-40
//       def rule?
//         standard_rule? || preference?
//       end
//       def standard_rule?
//         (Card.fetch_type_id(name.right) == SettingID) &&
//           (Card.fetch_type_id(name.left) == SetID)
//       end
//       def preference?
//         name.parts.length > 2 && ... (name[0..-3]) == SetID) && ...
//
//   Anonymous+*account+*email: right `*email` IS Setting-typed, but the
//   left `Anonymous+*account` is a Phrase-typed RULE ROW (not a Set) and
//   name[0..-3] `Anonymous` is RichText (not a Set) — BOTH arms fail, so
//   the card takes the RSTAR pattern (the capture's slot classes: "ALL
//   ALL_PLUS TYPE-phrase RSTAR RIGHT-Xemail TYPE_PLUS_RIGHT-rich_text-
//   Xemail SELF-anonymous-Xaccount-Xemail", NO RULE token). bar.rb:30-33
//   `view :bar_bottom do view = :content; render view, home_view: view end`
//   and html/views.rb:10-18 `view :content do wrap do ... end end` — the
//   wrap ALWAYS emits the slot (html/wrap.rb:6-13 method_wrap, :22-26
//   slot_attributes). The captured bytes:
//   recapture-raw-shard-000015 Anonymous+*account+*email:open carries
//     <div id="anonymous-Xaccount-Xemail-content-view" class="card-slot
//     content-view ... d0-card-content" ...><a class="email-link"
//     href="mailto:noreply@wagn.org">noreply@wagn.org</a></div>
//   inside the accordion body.
//
// THE DEFECT. barBottomView's rule detection fell back to the NAME SHAPE
// ("3 parts whose right starts with *") whenever the setKeys RULE token
// was absent — which every 3-part rule-shape row matches, regardless of
// the card TYPES rule? reads. The email card took the bare
// `renderView("core")` arm: the anchor rendered with no content-view slot
// (solo probe delta -614). THE FIX: the shape guess yields when BOTH
// Ruby arms are refuted by RESOLVED rows (left is a stored non-Set card
// AND name[0..-3] is a stored non-Set card — views.ts
// nameShapeRuleRefutedByTypes); trunks the closure never reached keep
// the guess. Solo probe: FAIL -614 with the shape guess, PASS
// byte-identical with the refutation (same-tree revert = file overwrite,
// no git).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const EMAIL_ROW = "Anonymous+*account+*email";

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 52, name: "Phrase", codename: "phrase", typeId: 5 });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text", typeId: 5 });
  await seedCard(s, { id: 10, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 15, name: "Anonymous", typeId: 4, dbContent: "" });
  await seedCard(s, { id: 22700, name: "*account", codename: "account", typeId: 2 });
  await seedCard(s, { id: 22710, name: "*email", codename: "email", typeId: 2 });
  // The left of the row under test is ITSELF a rule row (Phrase-typed),
  // NOT a Set — standard_rule?'s left arm refutes on this row.
  await seedCard(s, {
    id: 19977,
    name: "Anonymous+*account",
    leftId: 15,
    rightId: 22700,
    typeId: 52,
    dbContent: "1",
  });
  await seedCard(s, {
    id: 19978,
    name: EMAIL_ROW,
    leftId: 19977,
    rightId: 22710,
    typeId: 52,
    dbContent: "noreply@wagn.org",
  });
  // Everything readable: *all+*read = "Anyone".
  await seedCard(s, {
    id: 800,
    name: "*all+*read",
    leftId: 274,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  await seedReference(s, 800, 10, "anyone", "L");
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  storage.fetcher.codenames.ensureLoaded();
  storage.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("a rule row whose left is a rule row is RSTAR, not RULE (rule/all.rb:33-46)", () => {
  it("the open view's bar_bottom wraps the email anchor in the content-view slot", async () => {
    const html = await storage!.engine.render(EMAIL_ROW, "open");
    // html/views.rb:10-18's wrap ran: the content-view slot exists, with
    // the d0-card-content class_up the content view's before hook adds.
    // (The slot id's safe-key spelling is this fixture deck's own — the
    // corpus's is anonymous-Xaccount-Xemail — so the assertion keys on
    // the class + the card-name data attribute, not the id.)
    const slotIdAt = html.indexOf('-Xemail-content-view"');
    expect(slotIdAt, "the email card's content-view slot renders").toBeGreaterThanOrEqual(0);
    // emitAttrs emits id before class: the slot's own class sits FORWARD
    // of the id, inside the same tag.
    const tagCloseAt = html.indexOf(">", slotIdAt);
    const slotTag = html.slice(slotIdAt, tagCloseAt);
    expect(slotTag, "the slot is the content-view slot").toContain("card-slot content-view");
    expect(slotTag, "the content view's d0-card-content class_up").toContain("d0-card-content");
    // The anchor is INSIDE that slot, not a bare replacement for it.
    const anchorAt = html.indexOf('<a class="email-link" href="mailto:noreply@wagn.org">');
    expect(anchorAt, "the email anchor renders inside the slot").toBeGreaterThan(slotIdAt);
  });
});
