// cap-H1 - a card's history page, pinned on a committed real-Ruby capture
// that ships with the seed state that produced it.
//
// THE PIN. fixtures/captured/history-views.json is a capture of the REAL Ruby
// history views over a seeded deck. Its `probe#history` arm is the rendered
// card history page; its `state.actions` is what the deck held when it was
// rendered. That pairing is what makes this row's grade checkable at all: the
// expected act set is READ from the capture's own seed state, not asserted
// here, so a test that graded a made-up expectation would prove nothing.
//
// Measured on the committed file, and re-measured by test 1 below:
//   state.actions            6 rows
//   action-list <ul>         6
//   action_id in data-slot   6, in the order 4985 4983 4982 4981 4980 4979
//   state.acts ids           109533 109534 109535 109536 109537 109538
//
// So the capture's own page lists 6 entries for 6 stored actions, in
// DESCENDING ACT ORDER: action 4985 belongs to act 109538 (the newest) and
// 4979 to 109533 (the oldest). The order leg below is graded against that
// pairing rather than against a hand-built sequence.
//
// The ORDER CLAUSE itself is committed Ruby SOURCE, vendored and sha256-pinned
// like the search gem's: card-mod-history-0.20.0 set/all/history/acts.rb:3,
// `Act.all_with_actions_on(history_card_ids, true).order id: :desc`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  historyEntryActionIds,
  historyEntries,
  isHistoryPage,
  isDescending,
  cardHistoryPage,
  CARD_HISTORY_CHECKS,
} from "../lib/card-history-acts.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-history-0.20.0/", import.meta.url);
const CAPTURE = new URL("../../../fixtures/captured/history-views.json", import.meta.url);
const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "set/all/history/acts.rb":
    "053a057947be6550a9347245ce84bf34dc654a53bb07a1155ab9d663aae3cc92",
  "set/all/history/act_listing.rb":
    "c052e20ba7d8de7b375132b8778e68bfd4b4f698f203958fb08e499e2effd39f",
};

const CAPTURED = JSON.parse(readFileSync(CAPTURE, "utf8"));
const RUBY_HISTORY_PAGE = CAPTURED.rendered["probe#history"];

test("the vendored Ruby history sources are the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-history-0.20.0`);
  }
});

test("the pinned Ruby source carries the order clause and the listing this row grades", () => {
  const acts = readVendor("set/all/history/acts.rb").toString("utf8");
  // acts.rb:2-4 - history_acts is `Act.all_with_actions_on(...).order id: :desc`.
  // The order is the ACT id, descending; not a timestamp and not a sequence.
  assert.match(acts, /def history_acts/);
  assert.match(acts, /Act\.all_with_actions_on\(history_card_ids, true\)\.order id: :desc/);
  // act_listing.rb:20-26 - the page is the legend plus row(12) { act_list },
  // and the paging row is COMMENTED OUT in the gem, so a history page carries
  // no page-of-acts links to be mistaken for entries.
  const listing = readVendor("set/all/history/act_listing.rb").toString("utf8");
  assert.match(listing, /def acts_layout acts, context, draft_legend=:hide/);
  assert.match(listing, /row\(12\) \{ act_list acts, context \}/);
  assert.match(listing, /# row\(12\) \{ act_paging acts, context \}/);
});

test("the committed Ruby capture renders one act entry per stored act", () => {
  // This is the measurement the whole row rests on, read off the committed
  // file: not asserted from memory, counted.
  const storedActions = CAPTURED.state.actions;
  const entries = historyEntries(RUBY_HISTORY_PAGE);
  assert.equal(storedActions.length, 6);
  assert.equal(entries.length, storedActions.length);
  assert.equal(historyEntryActionIds(RUBY_HISTORY_PAGE).length, storedActions.length);
  // The capture's own action-list rows, counted from the raw bytes.
  assert.equal((RUBY_HISTORY_PAGE.match(/<ul class="action-list w-100">/g) ?? []).length, storedActions.length);
});

test("the committed Ruby page lists its acts newest first, by act id", () => {
  // The capture pairs each action with its act; the rendered order must be the
  // descending one of those act ids.
  const actIdFor = new Map(CAPTURED.state.actions.map((a) => [a.id, a.card_act_id]));
  const renderedActionIds = historyEntryActionIds(RUBY_HISTORY_PAGE);
  const renderedActIds = renderedActionIds.map((id) => actIdFor.get(id));
  assert.equal(renderedActIds.some((id) => id === undefined), false, "every rendered action maps to a stored act");
  assert.ok(isDescending(renderedActIds), `Ruby rendered ${JSON.stringify(renderedActIds)}`);
});

test("the committed Ruby page is a history view, and the old regex would have passed a page with no acts", () => {
  assert.equal(isHistoryPage(RUBY_HISTORY_PAGE), true);
  // The defect the row's finding names: /act|change|edit|history/i is satisfied
  // by the history-view class alone, on a page carrying no act entries at all.
  const stripped = RUBY_HISTORY_PAGE.replace(/<li class="(?:create|update|delete)">[\s\S]*?<\/li>/gi, "");
  const oldRegex = /act|change|edit|history/i;
  assert.equal(oldRegex.test(stripped), true, "the old regex still passes with every act entry removed");
  assert.equal(historyEntries(stripped).length, 0, "and the page really has no act entries left");
  assert.equal(cardHistoryPage({ html: stripped, storedActs: CAPTURED.state.actions.map((a) => ({ actionId: a.id, actId: a.card_act_id })) }).ok, false);
});

/** The stored acts the capture's seed state records, newest act first. */
const CAPTURED_STORED_ACTS = () =>
  [...CAPTURED.state.actions]
    .map((action) => ({ actionId: action.id, actId: action.card_act_id }))
    .sort((a, b) => b.actId - a.actId);

test("the committed Ruby page grades green against the capture's own seed state", () => {
  const verdict = cardHistoryPage({ html: RUBY_HISTORY_PAGE, storedActs: CAPTURED_STORED_ACTS() });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.counts.rendered, 6);
  assert.equal(verdict.counts.stored, 6);
});

/** The page's act-entry blocks, in order. They are NOT contiguous - Ruby puts
 *  closing markup between them - so a mutation rewrites them in place, one at
 *  a time, by match index. */
function entryBlocks(html) {
  return [...String(html).matchAll(/<li class="(?:create|update|delete)">[\s\S]*?<\/li>/gi)].map((m) => m[0]);
}

/** The page with its entries replaced, in place, by `build(index)` per entry.
 *  Returning "" from `build` drops that entry and leaves the rest of the page
 *  byte-identical. */
function withEntries(html, build) {
  let index = 0;
  return String(html).replace(
    /<li class="(?:create|update|delete)">[\s\S]*?<\/li>/gi,
    () => build(index++),
  );
}

test("a page listing only some of the card's acts fails the count, which the old check passed", () => {
  // Drop the last two act entries. The page still answers 200, still is a
  // history view, and still matches /act|change|edit|history/i - and the old
  // check recorded a node count without ever comparing it to anything.
  const full = cardHistoryPage({ html: RUBY_HISTORY_PAGE, storedActs: CAPTURED_STORED_ACTS() });
  assert.equal(full.ok, true);
  const blocks = entryBlocks(RUBY_HISTORY_PAGE);
  assert.equal(blocks.length, 6);
  const trimmed = withEntries(RUBY_HISTORY_PAGE, (i) => (i >= 4 ? "" : blocks[i]));
  assert.equal(/act|change|edit|history/i.test(trimmed), true);
  const verdict = cardHistoryPage({ html: trimmed, storedActs: CAPTURED_STORED_ACTS() });
  assert.ok(verdict.failures.includes("actCountMismatch"), JSON.stringify(verdict.failures));
  assert.ok(verdict.failures.includes("wrongActSet"));
  assert.equal(verdict.ok, false);
});

test("a page rendering no acts at all fails, and does so by name", () => {
  const empty = RUBY_HISTORY_PAGE.replace(/<li class="(?:create|update|delete)">[\s\S]*?<\/li>/gi, "");
  const verdict = cardHistoryPage({ html: empty, storedActs: CAPTURED_STORED_ACTS() });
  assert.equal(verdict.counts.rendered, 0);
  assert.ok(verdict.failures.includes("actCountMismatch"));
  assert.ok(verdict.failures.includes("wrongActSet"));
});

test("a page repeating one act twice fails duplicateActionEntries", () => {
  const first = [...RUBY_HISTORY_PAGE.matchAll(/<li class="(?:create|update|delete)">[\s\S]*?<\/li>/gi)][0][0];
  const doubled = RUBY_HISTORY_PAGE.replace(first, first + first);
  const verdict = cardHistoryPage({ html: doubled, storedActs: CAPTURED_STORED_ACTS() });
  assert.ok(verdict.failures.includes("duplicateActionEntries"));
  assert.equal(verdict.ok, false);
});

test("a page listing another card's acts fails wrongActSet", () => {
  // The same page, compared against a DIFFERENT card's acts. Every entry is a
  // real entry with a readable id; none of them is this card's.
  const otherCard = CAPTURED.state.actions.filter((a) => a.card_id !== CAPTURED.state.actions[0].card_id);
  const verdict = cardHistoryPage({
    html: RUBY_HISTORY_PAGE,
    storedActs: otherCard.map((a) => ({ actionId: a.id, actId: a.card_act_id })),
  });
  assert.ok(verdict.failures.includes("wrongActSet"));
  assert.equal(verdict.ok, false);
});

test("an ascending history page fails notNewestFirst", () => {
  // The page Ruby rendered, with its act entries reversed. Same six entries,
  // same six ids, the wrong order - which is a history page nobody can use
  // and which no other leg on this row could see.
  const blocks = entryBlocks(RUBY_HISTORY_PAGE);
  const reversed = withEntries(RUBY_HISTORY_PAGE, (i) => blocks[blocks.length - 1 - i]);
  const verdict = cardHistoryPage({ html: reversed, storedActs: CAPTURED_STORED_ACTS() });
  assert.equal(verdict.counts.rendered, 6);
  assert.equal(verdict.counts.rendered, verdict.counts.stored);
  assert.ok(verdict.failures.includes("notNewestFirst"));
  assert.equal(verdict.ok, false);
});

test("a driver that could not read the deck's acts measures nothing and says so", () => {
  for (const storedActs of [null, undefined, []]) {
    const verdict = cardHistoryPage({ html: RUBY_HISTORY_PAGE, storedActs });
    assert.ok(verdict.failures.includes("noStoredActsToCompare"));
    assert.equal(verdict.ok, false);
  }
});

test("an entry whose action id does not extract fails entryWithoutActionId", () => {
  // The slot is there and shaped right, but names no action.
  const broken = RUBY_HISTORY_PAGE.replace(/action_id&quot;:\d+/g, "action_id&quot;");
  const verdict = cardHistoryPage({ html: broken, storedActs: CAPTURED_STORED_ACTS() });
  assert.ok(verdict.failures.includes("entryWithoutActionId"));
  assert.equal(verdict.ok, false);
});

test("a page that is not a history view fails notAHistoryView even when its acts are right", () => {
  const verdict = cardHistoryPage({
    html: RUBY_HISTORY_PAGE.replace('class="card-slot history-view', 'class="card-slot some-other-view'),
    storedActs: CAPTURED_STORED_ACTS(),
  });
  assert.ok(verdict.failures.includes("notAHistoryView"));
});

test("the check names name their own legs and are four, not one", () => {
  assert.deepEqual(Object.keys(CARD_HISTORY_CHECKS).sort(), ["acts", "count", "order", "surface"]);
  for (const name of Object.values(CARD_HISTORY_CHECKS)) assert.equal(typeof name, "string");
});