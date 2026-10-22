// cap-P5 (continued) - the three rule-set legs read the VISITED CARD's own slot
// and visit a card the rule can actually answer for.
//
//   node --test tools/edge-signed-in-exercise/test/p5-visited-card-and-own-slot.test.mjs
//
// THE PIN, part 1: the read. A card page renders SEVERAL card slots and the
// FIRST one is the breadcrumb's nav-link dropdown, not the card. The committed
// page captures of every compound card this harness visits show the anchors
// that decide which rule can answer - SELF-<this card>, RIGHT-<its right side>,
// TYPE_PLUS_RIGHT-<left type>-<right> - all on the `titled` slot. Reading slot 0
// measured the breadcrumb, which is why the signed-in run of 2026-10-22 graded
// "noRIGHTToken" and "noSELFToken" for cards whose own bytes carried those
// tokens, with every leg's setKeys reading ["ALL","TYPE-basic_c"], which is
// exactly slot 0's row.
//
// THE PIN, part 2: the fixtures. A *right rule is keyed on the card's RIGHT
// SIDE, so the card that renders it is a COMPOUND one whose right side is the
// set card - Ruby visits "/Test+cereal" for exactly that reason. A *type plus
// right rule is keyed on a left TYPE card, so its left part must be a real card
// and the leg must visit cards of that type. And a create normalizes the left
// part to the DECK's spelling of that card: the signed-in run captured the
// resulting page titled "basic+..." where the fixture had written "Basic+...",
// so the post-create lookup for the fixture's spelling found nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allSlotSetKeys, slotSetKeys } from "../lib/rule-set-legs.mjs";

const checks = readFileSync(new URL("../checks-cover-b.mjs", import.meta.url), "utf8");
const setKeys = readFileSync(new URL("../../../src/card/render/set-keys.ts", import.meta.url), "utf8");

/** The leg's own source, from its attempt name to the next attempt name. */
function legSource(name) {
  const start = checks.indexOf(`await attempt("${name}"`);
  assert.ok(start !== -1, `the ${name} leg is present`);
  const next = checks.indexOf('await attempt("', start + 1);
  return checks.slice(start, next === -1 ? undefined : next);
}

test("the port pins the shape the *right fixture now visits", () => {
  // src/card/render/set-keys.ts: a card's safe_set_keys carries "RIGHT-<right>"
  // for a `<x>+legacy` card, and the SELF token is dropped only for a NEW card.
  assert.match(setKeys, /RIGHT-legacy/);
  assert.match(setKeys, /carries NO SELF- token/);
});

test("the read is scoped to the visited card's own slot, not the page's first", () => {
  assert.match(checks, /const P5_OWN_SLOT_VIEW = "titled-view";/);
  // Every graded read goes through the scoped helper.
  const graded = [...checks.matchAll(/slotSetKeys\(html,? ?([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(graded.length > 0, "the legs read set keys");
  for (const arg of graded) assert.equal(arg, "P5_OWN_SLOT_VIEW");
  // And no leg still reads the page's first slot.
  assert.equal(/slotSetKeys\(html\)/.test(checks), false);
});

test("every slot is reported, so the next reader can see which one was graded", () => {
  assert.match(checks, /import \{P5_CHECK_NAMES, allSlotSetKeys, ruleLegHolds, slotSetKeys\}/);
  assert.match(checks, /slots: allSlotSetKeys\(html\),/);
});

test("the *right leg visits a compound card whose right side is the set card", () => {
  const leg = legSource("P5 *right Set");
  // Ruby visits /Test+cereal for the *right rule named on "cereal".
  assert.match(leg, /const holder = ensure\("Harness_CB_Cereal_Holder"\);/);
  assert.match(leg, /p5Leg\("right", `\$\{card\}\+\*right\+\*help`, "poopoo", `\/\$\{holder\}\+\$\{card\}`, P5_DEFAULT\)/);
  // The set card itself is no longer the visited card: a one-part card carries
  // no RIGHT token at all, so the rule could not answer however it was read.
  assert.equal(/p5Leg\("right", `\$\{card\}\+\*right\+\*help`, "poopoo", `\/\$\{card\}`, P5_DEFAULT\)/.test(leg), false);
});

test("the *type plus right leg's left part is a real card, not a bare type word", () => {
  const leg = legSource("P5 *type plus right Set");
  assert.match(leg, /const leftTypeCard = ensure\("Harness_CB_TPR_User"\);/);
  assert.match(leg, /const typeRule = `\$\{leftTypeCard\}\+\$\{card\}\+\*type plus right\+\*help`;/);
  // The old spelling: "Basic" is a TYPE name, and a create normalizes the left
  // part to the deck's spelling of that card, so the lookup could never match.
  assert.equal(/Basic\+\$\{card\}\+\*type plus right/.test(leg), false);
  assert.equal(leg.includes('ensure("Basic")'), false);
});

test("the *type plus right leg reads two cards, as Ruby's spec does", () => {
  const leg = legSource("P5 *type plus right Set");
  // rules.spec.coffee visits "/Joe User+cereal" then "/Joe Admin+cereal" and
  // asserts the rule renders on both.
  assert.match(leg, /ensure\("Harness_CB_TPR_LeftA"\)/);
  assert.match(leg, /ensure\("Harness_CB_TPR_LeftB"\)/);
  assert.match(leg, /for \(const left of \[leftA, leftB\]\)/);
  assert.match(leg, /visits\.every\(v => v\.ok\)/);
});

test("the Self leg still visits the card itself, which is what Ruby does", () => {
  const leg = legSource("P5 Self Set");
  // rules.spec.coffee: cy.visit "cereal" - the Self leg's fixture was already
  // right, and only the read was wrong.
  assert.match(leg, /p5Leg\("self", `\$\{card\}\+\*self\+\*structure`, `\[\[\$\{structure\}\]\]`, `\/\$\{card\}`, P5_DEFAULT\)/);
});

test("the scoped read separates the breadcrumb slot from the card's own slot", () => {
  // The committed capture's own shape, rebuilt here so the pin does not depend
  // on a run having happened.
  const page = String.raw`
    <div class="card-slot unknown-view ALL TYPE-basic_c"></div>
    <div class="card-slot titled-view ALL ALL_PLUS TYPE-pointer RIGHT-harness_cb_role
                TYPE_PLUS_RIGHT-rich_text-harness_cb_role SELF-harness_cb_boxy"></div>
    <div class="card-slot content-view ALL TYPE-html SELF-Xfooter"></div>`;
  const rows = allSlotSetKeys(page);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { view: "unknown-view", keys: ["ALL", "TYPE-basic_c"] });
  // The unscoped read returned the breadcrumb: the bug the legs recorded.
  assert.deepEqual(slotSetKeys(page), ["ALL", "TYPE-basic_c"]);
  // The scoped read returns the card: RIGHT-<its right side> and SELF-<itself>.
  assert.deepEqual(slotSetKeys(page, "titled-view"), [
    "ALL",
    "ALL_PLUS",
    "TYPE-pointer",
    "RIGHT-harness_cb_role",
    "TYPE_PLUS_RIGHT-rich_text-harness_cb_role",
    "SELF-harness_cb_boxy",
  ]);
});