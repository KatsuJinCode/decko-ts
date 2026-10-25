// The W4 harness predicate - the followers list and the all-followed-cards
// view - pinned against the bytes Ruby renders.
//
//   node --test tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs
//
// THE FIXTURES ARE RECORDED RUBY BYTES, NOT TRANSCRIPTIONS:
//
//   fixtures/captured/board-views.json - the :engage_tab view of a signed-in
//     actor, captured inside the live decko-0.20.0 demo app
//     (tests/card/mod-loader/oracle-capture-board-views.rb). It carries the
//     two links this row is about, with Ruby's own hrefs and Ruby's own
//     label: href="/Oracle_Basics+*followers/content?layout=overlay&..." with
//     the text "1 follower", and href="/Tova+*follow/content?layout=overlay&..."
//     with the text "all followed cards".
//
//   fixtures/captured/followers-list.json - the pinned gemset's own source
//     for both views (card-mod-follow-0.20.0 set/right/followers.rb and
//     set/right/following.rb, and card-mod-edit-0.20.0
//     set/all/board/follow_section.rb), captured by
//     tests/card/mod-loader/oracle-capture-followers-list.rb.
//
//   fixtures/captured/smell-row-r4-2026-10-24/evaluate-follow-operations-ruby33.json
//     - the Ruby 3.3 oracle's own recorded observation of the follow
//     surfaces: "following more_horiz 2 followers all followed cards" after
//     the administrator's follow, and "1 follower" after the member's.
//
// The port's own rendering of the same views is pinned in the repository
// beside them: tests/card/set-modules/virtual-set-modules.test.ts records the
// oracle's answers for the same addresses (/Home+*followers answers
// firstView=titled with the follower names, /Mira Member+*follow answers
// firstView=titled with "Follow Ignore"), and
// tests/card/follow/act155-w4-followers-view-content.test.ts plus
// act155-w4-follow-overview-assembly.test.ts pin the port's own bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORACLE_CAPTURE,
  allFollowedCardsVerdict,
  followerCountFrom,
  followersLinkTargets,
  followersListVerdict,
  overviewLinkTargets,
  readFollowEditorRows,
} from "../lib/w4-follow-views.mjs";
import { engageTabLegs } from "../lib/engage-tab.mjs";

const BOARD = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/board-views.json", import.meta.url), "utf8"),
);
const RUBY33 = JSON.parse(
  readFileSync(
    new URL(
      "../../../fixtures/captured/smell-row-r4-2026-10-24/evaluate-follow-operations-ruby33.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

/** The signed-in actor's recorded Ruby engage tab. */
const rubyEngageTab = BOARD.targets.basic_note.views.tova.engage_tab;

test("the recorded Ruby engage tab names the two links this row opens", () => {
  const legs = engageTabLegs(rubyEngageTab);
  assert.notEqual(legs.followers, null);
  assert.notEqual(legs.overview, null);
  // followers_board_link_target: "link_to_card card.name.field(:followers),"
  assert.equal(followersLinkTargets(legs.followers.href, "Oracle Basics"), true);
  // follow_overview_button_target: "link_to_card [Auth.current, :follow],"
  assert.equal(overviewLinkTargets(legs.overview.href, "Tova"), true);
  // follow_overview_button_text: the literal "all followed cards"
  assert.equal(legs.overview.text, "all followed cards");
  // followers_board_link_label: "#{cnt} follower#{'s' unless cnt == 1}"
  assert.equal(legs.followers.text, "1 follower");
  assert.equal(followerCountFrom(legs.followers.text), 1);
  // A link that names another card's junction is not this card's link.
  assert.equal(followersLinkTargets(legs.followers.href, "Some Other Card"), false);
  // The overview link names the SIGNED-IN user's card, not another user's.
  assert.equal(overviewLinkTargets(legs.overview.href, "Mira Member"), false);
});

test("the Ruby oracle's recorded observations read the count the way Ruby writes it", () => {
  const observations = RUBY33.journeys.map((journey) => journey.finalObservation?.text ?? "");
  assert.ok(observations.length > 0);
  const twoFollowers = observations.find((text) => text.includes("2 followers"));
  const oneFollower = observations.find((text) => text.includes("1 follower"));
  assert.notEqual(twoFollowers, undefined);
  assert.notEqual(oneFollower, undefined);
  assert.equal(followerCountFrom("2 followers"), 2);
  assert.equal(followerCountFrom("1 follower"), 1);
  // Ruby's pluralization: "1 followers" is not a label Ruby writes.
  assert.equal(followerCountFrom("1 followers"), null);
  assert.equal(followerCountFrom("followers"), null);
  assert.equal(followerCountFrom("2 follower"), null);
});

test("the captured Ruby source carries the facts the predicate grades", () => {
  const facts = ORACLE_CAPTURE.facts;
  assert.match(facts.followers_board_link_target, /card\.name\.field\(:followers\)/);
  assert.match(facts.followers_board_link_label, /cnt\} follower/);
  assert.match(facts.follow_overview_button_target, /\[Auth\.current, :follow\]/);
  assert.match(facts.follow_overview_button_text, /all followed cards/);
  assert.match(facts.followers_content, /item_names\.to_pointer_content/);
  assert.match(facts.followers_item_names, /follower_names/);
  assert.match(facts.follower_names_method, /followers\.map\(&:name\)/);
});

test("the followers list is graded by the accounts it names, and nothing else", () => {
  // The oracle's own answer for the followers list names the accounts that
  // follow the card (the recorded oracle answer for /Home+*followers is
  // firstView=titled with "Mira Member", the deck-wide rule's holder).
  const items = [{ text: "Mira Member", hrefs: ["/Mira_Member"] }];
  const ok = followersListVerdict({ list: { wrapper: true, items }, expected: ["Mira Member"] });
  assert.equal(ok.ok, true, ok.failures.join(", "));

  // A name the stored rules do not support is an invented name.
  const invented = followersListVerdict({
    list: { wrapper: true, items: [...items, { text: "Someone Else", hrefs: [] }] },
    expected: ["Mira Member"],
  });
  assert.equal(invented.ok, false);
  assert.ok(invented.failures.includes("inventedFollowerNames"));

  // A missing name is a missing name.
  const missing = followersListVerdict({
    list: { wrapper: true, items: [{ text: "Someone Else", hrefs: [] }] },
    expected: ["Mira Member", "Harness Admin"],
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.failures.includes("missingFollowerNames"));

  // The unknown-card create form is the defect this row's finding named
  // ("answers 200 with a NEW-CARD CREATE FORM instead of the follower list").
  const createForm = followersListVerdict({
    list: { wrapper: true, items },
    expected: ["Mira Member"],
    createForm: true,
  });
  assert.equal(createForm.ok, false);
  assert.ok(createForm.failures.includes("createFormShown"));

  // Ruby's `left ? item_names.to_pointer_content : ""` arm: a card nobody
  // follows renders the empty pointer list, not a create form.
  const empty = followersListVerdict({ list: { wrapper: true, items: [] }, expected: [] });
  assert.equal(empty.ok, true, empty.failures.join(", "));
});
test("the all-followed-cards view is graded by the cards it lists", () => {
  const items = [
    { text: "Oracle Basics+*self+Tova+*follow", hrefs: ["/Oracle_Basics+*self+Tova+*follow"] },
    { text: "Deck Level+*self+Tova+*follow", hrefs: ["/Deck_Level+*self+Tova+*follow"] },
  ];
  const ok = allFollowedCardsVerdict({
    items,
    expected: ["Oracle Basics", "Deck Level"],
    forbidden: ["Card Nobody Follows"],
    ruleCount: 2,
  });
  assert.equal(ok.ok, true, ok.failures.join(", "));

  // A card the user does not follow must not be listed.
  const forbidden = allFollowedCardsVerdict({
    items: [...items, { text: "Card Nobody Follows+*self+Tova+*follow", hrefs: [] }],
    expected: ["Oracle Basics", "Deck Level"],
    forbidden: ["Card Nobody Follows"],
    ruleCount: 3,
  });
  assert.equal(forbidden.ok, false);
  assert.ok(forbidden.failures.includes("unfollowedCardListed"));

  // The item count is reconciled with the stored rules.
  const count = allFollowedCardsVerdict({
    items,
    expected: ["Oracle Basics", "Deck Level"],
    forbidden: [],
    ruleCount: 3,
  });
  assert.equal(count.ok, false);
  assert.ok(count.failures.includes("itemCountDisagreesWithStoredRules"));

  // A followed card the view does not name is missing.
  const missing = allFollowedCardsVerdict({
    items: [items[0]],
    expected: ["Oracle Basics", "Deck Level"],
    forbidden: [],
    ruleCount: 1,
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.failures.includes("missingFollowedCard"));
});

test("the follow editor rows are the dashboard surface the doors render", () => {
  // follow_editor.haml, byte-shaped: the editor wraps the rows in
  // .pointer-list-editor > ul.delete-list.list-group > li.list-group-item,
  // and the empty walk renders the literal 'no entries' row. The dashboard's
  // :core is the tab machinery (user/follow.rb:39-43), which shadows the
  // list family's pointer core, so the doors render THIS surface, never
  // .card-list.pointer-list. The shim is the exact DOM the reader walks
  // (querySelector + querySelectorAll + a[href] + innerText).
  const page = new EditorDom([
    {
      text: "Oracle Basics check",
      hrefs: ["/Oracle_Basics"],
    },
    {
      text: "Deck Level check",
      hrefs: ["/Deck_Level"],
    },
  ]);
  globalThis.document = page.document();
  const withRows = readFollowEditorRows();
  assert.notEqual(withRows, null);
  assert.equal(withRows.wrapper, true);
  assert.equal(withRows.items.length, 2);
  assert.match(withRows.items[0].text, /Oracle Basics/);
  assert.ok(withRows.items[0].hrefs.includes("/Oracle_Basics"));

  // The verdict grades the editor rows the same way it grades the pointer
  // list: by the cards the rows name, against the deck's FOLLOWING rules.
  const ok = allFollowedCardsVerdict({
    items: withRows.items,
    expected: ["Oracle Basics", "Deck Level"],
    forbidden: ["Card Nobody Follows"],
    ruleCount: 2,
  });
  assert.equal(ok.ok, true, ok.failures.join(", "));

  // The empty walk's 'no entries' row is the editor's empty arm, not an
  // item: a page that renders it carries no rows, and the verdict fails on
  // the missing names rather than on an invented one.
  const emptyPage = new EditorDom([{ text: "no entries", hrefs: [] }]);
  globalThis.document = emptyPage.document();
  const empty = readFollowEditorRows();
  assert.notEqual(empty, null);
  assert.equal(empty.items.length, 0);
  const emptyVerdict = allFollowedCardsVerdict({
    items: empty.items,
    expected: ["Oracle Basics"],
    forbidden: [],
    ruleCount: 1,
  });
  assert.equal(emptyVerdict.ok, false);
  assert.ok(emptyVerdict.failures.includes("missingFollowedCard"));

  // No editor on the page (the door refused): the reader answers null.
  globalThis.document = { querySelector: () => null };
  assert.equal(readFollowEditorRows(), null);
  globalThis.document = undefined;
});

/** A minimal DOM over the follow editor's bytes: the reader walks
 *  .pointer-list-editor and its ul.delete-list li.list-group-item rows,
 *  reading each row's innerText and a[href]s - exactly this shape. */
class EditorDom {
  constructor(rows) {
    this.rows = rows;
  }
  document() {
    const li = (row) => ({
      innerText: row.text,
      querySelectorAll: (sel) =>
        sel === "a[href]"
          ? row.hrefs.map((href) => ({ getAttribute: (name) => (name === "href" ? href : null) }))
          : [],
    });
    const ul = {
      querySelectorAll: (sel) =>
        sel === "ul.delete-list li.list-group-item" ? this.rows.map(li) : [],
    };
    const editor = {
      // the reader asks the EDITOR for its rows
      querySelectorAll: (sel) => (sel === "ul.delete-list li.list-group-item" ? this.rows.map(li) : []),
    };
    return {
      querySelector: (sel) => (sel === ".pointer-list-editor" ? editor : null),
    };
  }
}
