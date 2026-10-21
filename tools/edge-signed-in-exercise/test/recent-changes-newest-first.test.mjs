// cap-N5 - the Changes page's order, pinned against the Ruby bytes.
//
// WHAT IS PINNED, AND WHERE EACH PIN LIVES.
//
// 1. THE ACT TEMPLATE. The committed real-Ruby capture
//    reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
//    arm `probe-view:373:history@set/all/history/views.rb` carries the Ruby
//    history view as the engine rendered it, with the act id in the bytes:
//    `data-bs-target='#act-id-105328'` on the collapse button and
//    `id='act-id-105328'` on the panel (accordion_item.haml, card-mod-bootstrap
//    set/all/bootstrap). Every item-level assertion below runs on THOSE bytes,
//    with nothing added.
//
// 2. THE ORDER CLAUSE. The captured arms carry one act each - a view probe
//    renders one view, not a feed - so the ORDER this row is about is not in
//    any committed capture. It is in committed Ruby SOURCE, so that is what is
//    vendored: fixtures/vendor/card-mod-search-0.20.0/set/self/recent.rb,
//    copied verbatim from the gem and sha256-pinned below (test 1), the same
//    discipline the carrierwave vendor uses. The assertions that matter are
//    `ACTS_PER_PAGE = 25` and `.order id: :desc` - if either drifts, the pin
//    fails by name instead of the predicate quietly grading a contract Ruby
//    no longer has.
//
// 3. THE PAGE SHAPE. acts_layout (act_listing.rb:18-27) emits the accordion
//    row as SIBLING accordion items under one `.accordion` div, so a multi-act
//    page is exactly the captured item concatenated. Every multi-act case below
//    is built that way: no byte of any accordion item is written by hand in
//    this file, only the digits of its id.
//
// WHAT IS NOT CLAIMED. No signed-in run happens here, so nothing below says
// the live page passes. These are the shape and the order contract, graded on
// Ruby's own bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  recentFeedActIds,
  isStrictlyDescending,
  recentChangesNewestFirst,
  RECENT_CHANGES_CHECKS,
} from "../lib/recent-changes-newest-first.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-search-0.20.0/", import.meta.url);
const PROBE_CAPTURE = new URL(
  "../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl",
  import.meta.url,
);
const HISTORY_CAPTURE = new URL("../../../fixtures/captured/history-views.json", import.meta.url);

const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The sha256 of each vendored file, taken when the copy was made from
 *  decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-search-0.20.0/. */
const VENDORED = {
  "set/self/recent.rb":
    "f5554c2b7bd8ad4120a6be29b56d2cd7922fc438e223dffd71b82c30d725914d",
  "set/abstract/0_search/views.rb":
    "d3316f488eac0568602ff3540cf33a1113fbb141069dbce6da25be33bab344ce",
};

function probeArm(id) {
  for (const line of readFileSync(PROBE_CAPTURE, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = JSON.parse(line);
    if (entry.id === id) return entry.result.html;
  }
  throw new Error(`committed Ruby capture has no arm ${id}`);
}

// The real Ruby bytes, unchanged.
const RUBY_HISTORY_ARM = probeArm("probe-view:373:history@set/all/history/views.rb");
const RUBY_ACT_ARM = probeArm("probe-view:366:act@set/all/history/views.rb");

test("the vendored Ruby search source is the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-search-0.20.0`);
  }
});

test("the pinned Ruby source carries the order clause and the page cap this row grades", () => {
  const recent = readVendor("set/self/recent.rb").toString("utf8");
  // recent.rb:1 - the cap. A page rendering more than this is a different
  // page, so the predicate's overPageCap leg reads this number.
  assert.match(recent, /^ACTS_PER_PAGE = 25$/m);
  // recent.rb:14-21 - the order. `.order id: :desc` on card_acts.id, which is
  // what "newest first" means for this feed; NOT updated_at, NOT a relevance
  // score.
  assert.match(recent, /\.order id: :desc/);
  // recent.rb:28-33 - the cap reaches the view, so it is a rendered contract.
  assert.match(recent, /@acts_per_page = ACTS_PER_PAGE/);
  // The viewable read gate and the draft arm ride in the same clause; a feed
  // that shows drafts is not this feed.
  assert.match(recent, /\.where\("draft is not true"\)/);
  assert.match(recent, /Query::CardQuery\.viewable_sql/);
});

test("the committed Ruby act template is read as one titled, actor-credited, id-paired item", () => {
  const items = recentFeedActIds(RUBY_HISTORY_ARM);
  assert.equal(items.length, 1);
  const [item] = items;
  // The id is IN the rendered bytes, on both halves of the collapse.
  assert.equal(item.buttonId, "105328");
  assert.equal(item.panelId, "105328");
  // Ruby's own actor credit is on the item: the act's actor, as a known-card
  // link. Without it the item is a timestamp, not an act.
  assert.equal(item.actor, "Decko_Bot");
  assert.notEqual(item.headerText, null);
  // The act sequence Ruby renders in this arm is in the header text.
  assert.match(item.headerText, /#1 Decko Bot/);
});

test("the capture-normalized Ruby arm is read but not graded on order", () => {
  // fixtures/captured/history-views.json renders the collapse id as the literal
  // token N (the same normalization its data-card-id="N" uses). The template
  // is Ruby's; the digits are not. So the extractor must read it, and the
  // ORDER grade must refuse it rather than compare tokens.
  const capture = JSON.parse(readFileSync(HISTORY_CAPTURE, "utf8"));
  const arm = capture.rendered["probe#act(child_act)"];
  const items = recentFeedActIds(arm);
  assert.equal(items.length, 1);
  assert.equal(items[0].buttonId, "N");
  assert.equal(items[0].panelId, "N");
  const verdict = recentChangesNewestFirst({ html: arm });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("nonNumericOrderKey"));
  assert.ok(verdict.failures.includes("tooFewActs"));
});

/** A multi-act page built ONLY by concatenating the captured Ruby item with
 *  its id digits replaced. The item's every other byte is the gem's. */
function feed(ids) {
  return `<div class="accordion">${ids
    .map((id) => RUBY_ACT_ARM.split("act-id-105328").join(`act-id-${id}`))
    .join("")}</div>`;
}

test("acts in Ruby's descending act-id order grade green", () => {
  const verdict = recentChangesNewestFirst({
    html: feed([105330, 105329, 105328]),
    perPage: 25,
    expectedIds: [105330, 105329, 105328],
    expectedNewestActId: 105330,
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.order, [105330, 105329, 105328]);
  // The evidence leg, not the predicate: the run's newest act is on top.
  assert.equal(verdict.newestActFirst, true);
});

test("the same acts in ascending order fail by name, which is what the old positional check could not see", () => {
  const verdict = recentChangesNewestFirst({ html: feed([105328, 105329, 105330]), perPage: 25 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("notNewestFirst"));
});

test("an alphabetical-looking order that is neither descending nor ascending fails by name", () => {
  // 105300 < 105330 < 105329 - out of order pairwise in the middle only. A
  // check that grades "the newest card is near the top" would call this a
  // pass; a check that grades the relation calls it what it is.
  const verdict = recentChangesNewestFirst({ html: feed([105300, 105330, 105329]), perPage: 25 });
  assert.ok(verdict.failures.includes("notNewestFirst"));
});

test("a one-act page cannot satisfy a relation and fails tooFewActs", () => {
  const verdict = recentChangesNewestFirst({ html: feed([105328]), perPage: 25 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("tooFewActs"));
  assert.ok(!verdict.failures.includes("notNewestFirst"));
});

test("an empty page cannot pass by having no out-of-order pair", () => {
  const verdict = recentChangesNewestFirst({ html: "<div class=\"accordion\"></div>", perPage: 25 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("tooFewActs"));
});

test("a page over Ruby's ACTS_PER_PAGE cap fails overPageCap even when correctly ordered", () => {
  const ids = Array.from({ length: 26 }, (_, i) => 105353 - i);
  const verdict = recentChangesNewestFirst({ html: feed(ids), perPage: 25 });
  assert.ok(isStrictlyDescending(verdict.order));
  assert.ok(verdict.failures.includes("overPageCap"));
  assert.equal(verdict.ok, false);
});

test("a descending page that drops an act the deck recorded fails wrongActSet", () => {
  const verdict = recentChangesNewestFirst({
    html: feed([105330, 105328]),
    perPage: 25,
    expectedIds: [105330, 105329, 105328],
  });
  assert.ok(isStrictlyDescending(verdict.order));
  assert.ok(verdict.failures.includes("actCountMismatch"));
  assert.ok(verdict.failures.includes("wrongActSet"));
});

test("a descending page that reorders an act the deck recorded fails wrongActOrder", () => {
  const verdict = recentChangesNewestFirst({
    html: feed([105330, 105328, 105329]),
    perPage: 25,
    expectedIds: [105330, 105329, 105328],
  });
  assert.ok(verdict.failures.includes("wrongActOrder"));
});

test("two acts sharing one id fail the pairwise order, because a repeat is not a relation", () => {
  const verdict = recentChangesNewestFirst({ html: feed([105328, 105328]), perPage: 25 });
  assert.ok(verdict.failures.includes("notNewestFirst"));
});

test("an item whose two collapse halves disagree fails accordionIdMismatch", () => {
  // A template that stamped the button and the panel from different acts is a
  // different renderer, and its order is not this feed's order.
  const broken = RUBY_ACT_ARM.replace("id='act-id-105328'", "id='act-id-105327'");
  const verdict = recentChangesNewestFirst({ html: `<div class="accordion">${broken}${RUBY_ACT_ARM}</div>`, perPage: 25 });
  assert.ok(verdict.failures.includes("accordionIdMismatch"));
  assert.equal(verdict.ok, false);
});

test("an item with no id at all fails unreadableOrderKey rather than being skipped", () => {
  const stripped = RUBY_ACT_ARM.split("act-id-105328").join("");
  const verdict = recentChangesNewestFirst({ html: `<div class="accordion">${stripped}${RUBY_ACT_ARM}</div>`, perPage: 25 });
  assert.ok(verdict.failures.includes("unreadableOrderKey"));
  assert.equal(verdict.ok, false);
});

test("the check names name their own legs", () => {
  assert.match(RECENT_CHANGES_CHECKS.order, /^the Changes page orders its acts newest first/);
  assert.match(RECENT_CHANGES_CHECKS.nonEmpty, /at least two acts/);
});