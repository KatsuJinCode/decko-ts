// The E20 harness predicate — "the Engage tab shows follow, advanced,
// followers, all followed cards, and discussion" — graded against the bytes
// Ruby renders.
//
//   node --test tools/edge-signed-in-exercise/test/engage-tab.test.mjs
//
// The positive fixtures are the RUBY arms of
// fixtures/captured/board-views.json, captured inside the live decko-0.20.0
// demo app (tests/card/mod-loader/oracle-capture-board-views.rb): the
// :engage_tab view of both captured targets ("Oracle Basics", "Home") for both
// signed-in actors. Nothing here is transcribed — the test reads the recorded
// Ruby bytes and grades them.
//
// That capture is also what pins the PORT: tests/card/mod-loader/
// card-mod-edit-views.test.ts renders :engage_tab for the same two targets and
// both actors and byte-compares it against these arms (BOARD_PINNED_VIEWS), so
// the bytes this predicate accepts are the bytes the port emits.
//
// Registry row cap-E20 (tools/edge-signed-in-exercise/capabilities.json, id
// E20) recorded the gap this closes: "Follow controls present only;
// advanced/followers/discussion not checked." The predicate it replaces was
// `/follow|watch|discussion/i.test(engageBody)` over the whole page after the
// tab click. Tests 3 and 4 are the pages that regex cannot tell apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { engageTabLegs, followersLabelOk, hasFullEngageTab } from "../lib/engage-tab.mjs";

const BOARD = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/board-views.json", import.meta.url), "utf8"),
);

test("Ruby renders all five legs on a signed-in Engage tab", () => {
  for (const target of ["basic_note", "deck_level"]) {
    for (const actor of ["bot", "tova"]) {
      const arms = BOARD.targets[target].views[actor];
      const verdict = hasFullEngageTab(arms.engage_tab);
      assert.equal(verdict.ok, true, `${target}/${actor}: ${verdict.failures.join(", ")}`);
    }
  }
});

test("the five legs are read as Ruby's spec reads them, each by its own rule", () => {
  const member = engageTabLegs(BOARD.targets.basic_note.views.tova.engage_tab);
  // follow button (follow_link.rb:24-33 + engage_tab.spec.coffee:13-19): the
  // anchor carries the class AND the verb span; the verb says following, the
  // title says stop, and the advanced control is its group sibling.
  assert.equal(member.followLink.verb, "following");
  assert.equal(member.followLink.title, "stop sending emails about changes to Oracle Basics");
  assert.equal(member.followLink.hover, "unfollow");
  assert.match(member.followLink.href, /^\/update\/Oracle_Basics\+\*self\+Tova\+\*follow\?card%5Bcontent%5D=/);
  assert.equal(member.followLink.advancedSibling, true);
  // advanced (follow_section.rb:22-29): the data-cy key AND the overlay_rule
  // destination, not just a node named advanced.
  assert.match(member.advanced.href, /^\/Oracle_Basics\+\*self\+Tova\+\*follow\/overlay_rule\?slot%5Bitems%5D%5Bview%5D=closed$/);
  // followers (follow_section.rb:31-36): "1 follower", singular.
  assert.equal(member.followers.text, "1 follower");
  assert.match(member.followers.href, /^\/Oracle_Basics\+\*followers\/content\?/);
  // all followed cards (follow_section.rb:16-20): the literal label.
  assert.equal(member.overview.text, "all followed cards");
  // discussion (tab_views.rb:39-44 + comment.rb:46-70): the +discussion nest,
  // its title, the comment field the spec types into, and its submit button.
  assert.equal(member.discussion.title, "Discussion");
  assert.equal(member.discussion.nestName, "Oracle Basics+discussion");
  assert.equal(member.discussion.commentField, "card[comment]");
  assert.equal(member.discussion.commentSubmit, "button");

  // The admin follows nothing on this deck, so the same capture carries the
  // other verb - Ruby's spec asserts both ("follow" then "following").
  const admin = engageTabLegs(BOARD.targets.basic_note.views.bot.engage_tab);
  assert.equal(admin.followLink.verb, "follow");
  assert.equal(admin.followLink.title, "send emails about changes to Oracle Basics");
  assert.equal(admin.followLink.hover, null);
});

test("anonymous renders neither leg: show_follow? needs Auth.signed_in?", () => {
  // follow_section.rb:3 `return unless show_follow?`, and
  // follow_link_views.rb:6-8 show_follow? = Auth.signed_in? && ... . The
  // discussion nest is set-scoped too, so Ruby's anonymous arm is the
  // wrapper div and nothing inside it. Every leg must read as absent, not
  // as an empty string.
  for (const target of ["basic_note", "deck_level"]) {
    const arms = BOARD.targets[target].views.anonymous;
    const verdict = hasFullEngageTab(arms.engage_tab);
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.failures, [
      "followLink",
      "advanced",
      "followers",
      "overview",
      "discussion",
    ]);
    const legs = engageTabLegs(arms.engage_tab);
    assert.equal(legs.followLink, null);
    assert.equal(legs.discussion, null);
  }
});

test("a navbar word is not the Engage tab (the cap-E20 defect)", () => {
  // The replaced regex passed on the follow word in a link the board always
  // carries, with no tab, no selector and no destination read.
  const navbarOnly =
    '<nav><a class="nav-link" href="/">Home</a>' +
    '<a class="nav-link" href="/*search">Search</a>' +
    '<a class="signout-link" href="/delete/*signin">Sign out</a>' +
    '<a class="nav-link" href="/*follow">Watch what I follow</a></nav>';
  assert.equal(hasFullEngageTab(navbarOnly).ok, false);
  assert.deepEqual(hasFullEngageTab(navbarOnly).failures, [
    "engageTabRegion",
    "followLink",
    "advanced",
    "followers",
    "overview",
    "discussion",
  ]);
  // The follow controls with no discussion nest: four legs present, and the
  // missing one named rather than absorbed. Cut Ruby's own arm at the
  // discussion slot, which is what a comment-hidden render looks like here.
  const signed = engageTabLegs(BOARD.targets.basic_note.views.tova.engage_tab);
  const cut = signed.region.indexOf('<div id="oracle_basic-discussion-titled-view"');
  const followOnly =
    '<div class="m-3 mt-4 _engage-tab">' + signed.region.slice(0, cut) + "</div>";
  const partial = hasFullEngageTab(followOnly);
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.failures, ["discussion"]);
});

test("each control is graded by shape, not by a word", () => {
  const arms = BOARD.targets.basic_note.views.tova.engage_tab;
  const swap = (from, to) => arms.replace(from, to);
  // The followers label carries a count and Ruby's plural (follow_section.rb:33).
  assert.equal(followersLabelOk("1 follower"), true);
  assert.equal(followersLabelOk("2 followers"), true);
  assert.equal(followersLabelOk("0 followers"), true);
  assert.equal(followersLabelOk("1 followers"), false);
  assert.equal(followersLabelOk("followers"), false);
  // Renaming the overview button breaks its leg even with the href intact.
  const relabelled = swap(">all followed cards<", ">your followed cards<");
  assert.deepEqual(hasFullEngageTab(relabelled).failures, ["overview"]);
  // Dropping the advanced data-cy breaks that leg alone.
  const noAdvanced = swap('data-cy="follow-advanced" ', "");
  assert.deepEqual(hasFullEngageTab(noAdvanced).failures, ["advanced"]);
  // The discussion nest without the comment field is not a discussion.
  const noComment = swap(
    '<textarea rows="3" class=" form-control" name="card[comment]" id="card_comment">',
    '<textarea rows="3" class=" form-control" name="card[body]" id="card_body">',
  );
  assert.deepEqual(hasFullEngageTab(noComment).failures, ["discussion"]);
});
