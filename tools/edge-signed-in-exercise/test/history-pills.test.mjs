// The E21 harness predicate — "the board History tab lists changes in pills"
// — graded against the bytes Ruby renders, with the leg Ruby's spec actually
// asserts: the pill's own text names the actor and the age of the change.
//
//   node --test tools/edge-signed-in-exercise/test/history-pills.test.mjs
//
// The positive fixtures are the RUBY arms of
// fixtures/captured/board-views.json (captured in the live decko-0.20.0 demo
// app, tests/card/mod-loader/oracle-capture-board-views.rb) — the
// :history_tab view of both captured targets for all three actors. Nothing is
// transcribed: the test reads the recorded Ruby bytes.
//
// That capture is also what pins the PORT:
// tests/card/mod-loader/card-mod-edit-views.test.ts renders :history_tab for
// the same targets and actors and byte-compares it against these arms
// (BOARD_PINNED_VIEWS), so the bytes this predicate accepts are the bytes the
// port emits.
//
// Registry row cap-E21 (tools/edge-signed-in-exercise/capabilities.json, id
// E21) recorded "History tab present; changes pills not asserted." The
// harness read the tab links and the act_id inside each href; a pill whose
// text never named the actor, or whose age was missing or free text, scored a
// pass. Tests 4 and 5 are those pages.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardPillAnchors, historyPills, listsChangeAsPills } from "../lib/history-pills.mjs";

const BOARD = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/board-views.json", import.meta.url), "utf8"),
);

const arms = (target, actor, view) => BOARD.targets[target].views[actor][view];

test("Ruby renders the history tab's pills for every captured arm", () => {
  for (const target of ["basic_note", "deck_level"]) {
    for (const actor of ["tova", "bot", "anonymous"]) {
      const verdict = listsChangeAsPills(arms(target, actor, "history_tab"));
      assert.equal(verdict.ok, true, `${target}/${actor}: ${verdict.failures.join(", ")}`);
      assert.equal(verdict.pills.length > 0, true);
    }
  }
});

test("each pill carries the actor and the age Ruby's spec asserts", () => {
  // history_tab.spec.coffee:13  cy.contains("Joe Admin less than a minute ago")
  // - the actor's NAME and the RELATIVE AGE, in one pill. board_act_renderer.rb
  // :11-13 composes ["#seq", actor.name, small(edited_ago)], and
  // act_renderer.rb:105-109 appends " ago" to time_ago_in_words.
  const { pills } = historyPills(arms("basic_note", "tova", "history_tab"));
  assert.deepEqual(
    pills.map((pill) => [pill.seq, pill.actor, pill.ago]),
    [
      [3, "Decko Bot", "1 day ago"],
      [2, "Decko Bot", "1 day ago"],
      [1, "Decko Bot", "10 days ago"],
    ],
  );
  // current_act_seq counts DOWN from acts.size, and the href's act_seq and the
  // title's #seq are the same number (board_act_renderer.rb:27 and :11-13).
  assert.deepEqual(pills.map((pill) => [pill.actId, pill.actSeq, pill.seq]), [
    [109528, 3, 3],
    [109527, 2, 2],
    [105329, 1, 1],
  ]);
  // The destination is board_act with the act id, not a bare href (path.rb).
  assert.match(pills[0].href, /^\/Oracle_Basics\/board_act\?act_id=109528&amp;act_seq=3&amp;slot%5Bitems%5D%5Bview%5D=closed$/);
  // board_pills.rb:1-4: the ul carries board-pills and each item an li.nav-item
  // around a data-bs-toggle="pill" anchor classed nav-link.
  assert.equal(boardPillAnchors(arms("basic_note", "tova", "history_tab")).length, 3);
  assert.equal(pills.every((pill) => pill.pillToggle === "pill" && pill.navLink), true);
});

test("the run's own act is graded by its id, in the href and in the list", () => {
  const html = arms("basic_note", "tova", "history_tab");
  assert.equal(listsChangeAsPills(html, 109527).ok, true);
  assert.deepEqual(listsChangeAsPills(html, 999999).failures, ["expectedAct"]);
});

test("the Related tab's pills cannot answer for the History tab", () => {
  // board_pill_sections (board_pills.rb:35-46) builds the SAME ul.board-pills
  // for the Related tab, so a predicate that reads the pill classes without
  // the slot would grade the Related pills as history. Ruby's own slot wrap
  // (tab_views.rb:6-10, a card-slot history_tab-view) is what separates them.
  const related = arms("basic_note", "tova", "related_tab");
  assert.equal(boardPillAnchors(related).length > 0, true, "the control must carry real pills");
  assert.equal(listsChangeAsPills(related).ok, false);
  assert.deepEqual(listsChangeAsPills(related).failures, ["historyTabSlot"]);
  // The board's rules tab carries no pill list at all.
  assert.equal(listsChangeAsPills(arms("basic_note", "tova", "rules_tab")).ok, false);
});

test("a pill that does not name the actor, or the age, fails (the cap-E21 defect)", () => {
  const html = arms("basic_note", "tova", "history_tab");
  const swap = (from, to) => html.replace(from, to);
  // The actor's name gone: the id is what a fallback renderer would print, and
  // Ruby's renderer interpolates actor.name, never the id.
  const bareId = swap("#3 Decko Bot <small>", "#3 1 <small>");
  assert.equal(listsChangeAsPills(bareId).ok, false);
  assert.ok(listsChangeAsPills(bareId).failures.includes("actor0"));
  // The age gone (edited_ago is "" only with no acted_at; a live act has one).
  const noAge = swap("<small>1 day ago</small>", "<small></small>");
  assert.ok(listsChangeAsPills(noAge).failures.includes("agoMissing0"));
  // The age as free text rather than one of Ruby's distance_in_words phrases.
  const freeText = swap("<small>1 day ago</small>", "<small>recently</small>");
  assert.ok(listsChangeAsPills(freeText).failures.includes("agoPhrase0"));
  // A pill list with no act destination at all.
  const noActs = swap(/board_act\?act_id=\d+&amp;act_seq=\d+/g, "content");
  assert.equal(listsChangeAsPills(noActs).ok, false);
  assert.deepEqual(listsChangeAsPills(noActs).failures, ["noPills"]);
  // An empty pill list is not a history tab that lists changes.
  const emptied = swap(/(<li class="nav-item">[\s\S]*?<\/li>\n?)+/, "");
  assert.deepEqual(listsChangeAsPills(emptied).failures, ["noPills"]);
});

test("the sequence is graded, not just the presence of pills", () => {
  // Two pills whose act_seq and title agree with each other but count the
  // wrong way (1 then 2) are not the list Ruby renders: current_act_seq runs
  // from acts.size down to 1.
  const html = arms("basic_note", "tova", "history_tab");
  const swapped = html
    .replace("act_id=109528&amp;act_seq=3", "act_id=109528&amp;act_seq=1")
    .replace(">#3 Decko Bot", ">#1 Decko Bot");
  const verdict = listsChangeAsPills(swapped);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("seq0"), verdict.failures.join(", "));
});
