// cap-W2 - the unfollow round trip, graded on both link states and the stored
// rule.
//
// THE PINS. card-mod-follow-0.20.0's two link classes and the shared base
// class, plus card-mod-edit-0.20.0's follow_section.rb, are vendored verbatim
// and sha256-pinned. The graded values are READ OUT of those files rather than
// retyped, so a gem change fails the pin and the grade together.
//
// The rendered anchors are BUILT from those same files: the test assembles
// each state's bytes from the subclass constants and the base class's three
// templates, which is the same derivation Ruby performs. So a state the test
// cannot produce from the gem is a state the test refuses to grade.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  followLinkShape,
  expectedFollowState,
  followStateHolds,
  unfollowRoundTrip,
  UNFOLLOW_CHECKS,
} from "../lib/unfollow-from-board.mjs";

const VENDOR = new URL("../../../fixtures/vendor/", import.meta.url);
const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "card-mod-follow-0.20.0/set/all/follow/follow_link.rb":
    "7c133d3cf2992ada36f28e3f4991da89e18ad69ae13d9da2f22b418049639b74",
  "card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb":
    "345f1e57172af5c1014455344733a212bc688fbbab917f8b57de2c658755b175",
  "card-mod-follow-0.20.0/set/all/follow/start_follow_link.rb":
    "83dba7a194e14de076fdd1c934c96aaf18113e1280df4d500df08e0bdce0f93f",
  "card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb":
    "6f6c36bbaeaa2a2b36af99105fbcb8dc11a1dc63c8a4ef8abeb4c61714f8ee1a",
  "card-mod-edit-0.20.0/set/all/board/follow_section.rb":
    "ab7925558cc48b672f567483fd04029acf2f3843f2f5064c267f2c6220c99809",
};

test("the vendored Ruby follow sources are the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from the gem`);
  }
});

/** The constants Ruby derives, read out of the vendored subclass files. */
function gemConstants() {
  const pick = (file, key) => {
    const m = new RegExp(`@${key} = "([^"]*)"`).exec(readVendor(file).toString("utf8"));
    assert.ok(m !== null, `${key} not found in ${file}`);
    return m[1];
  };
  const start = {
    rule: pick("card-mod-follow-0.20.0/set/all/follow/start_follow_link.rb", "rule_content"),
    text: pick("card-mod-follow-0.20.0/set/all/follow/start_follow_link.rb", "link_text"),
    action: pick("card-mod-follow-0.20.0/set/all/follow/start_follow_link.rb", "action"),
  };
  const stop = {
    rule: pick("card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb", "rule_content"),
    text: pick("card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb", "link_text"),
    action: pick("card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb", "action"),
    hover: pick("card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb", "hover_text"),
    css: pick("card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb", "css_class"),
  };
  return { start, stop };
}

test("the graded states are read out of the pinned Ruby, not retyped", () => {
  const { start, stop } = gemConstants();
  // start_follow_link.rb:4-11 / stop_follow_link.rb:4-11.
  assert.equal(start.rule, "*always");
  assert.equal(start.text, "follow");
  assert.equal(start.action, "send");
  assert.equal(stop.rule, "*never");
  assert.equal(stop.text, "following");
  assert.equal(stop.action, "stop sending");
  assert.equal(stop.hover, "unfollow");
  assert.equal(stop.css, "btn-item-delete");

  // The BASE class templates the bytes are assembled from.
  const base = readVendor("card-mod-follow-0.20.0/set/all/follow/follow_link.rb").toString("utf8");
  assert.match(base, /<span class="follow-verb">#\{link_text\}<\/span>/);
  assert.match(base, /def title\s*\n\s*"#\{action\} emails about changes to #\{@card\.follow_label\}"/);
  assert.match(base, /card: \{ content: "\[\[#\{rule_content\}\]\]" \}/);
  assert.match(base, /action: :update/);

  // The class is chosen BY STATE - that is the whole two-state contract.
  const views = readVendor("card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb").toString("utf8");
  assert.match(views, /card\.followed\? \? StopFollowLink : StartFollowLink/);

  // follow_section.rb:31-36 renders the follower count as the link's label,
  // which is why the count is a graded leg and not decoration.
  const section = readVendor("card-mod-edit-0.20.0/set/all/board/follow_section.rb").toString("utf8");
  assert.match(section, /cnt = card\.followers_count/);
  assert.match(section, /#\{cnt\} follower#\{'s' unless cnt == 1\}/);
});

const LABEL = "Harness_W2_Card";

/** One state's anchor, assembled from the gem's constants and the base
 *  class's templates - the same derivation Ruby performs. */
function anchor(state) {
  const { start, stop } = gemConstants();
  const c = state === "stop" ? stop : start;
  const verb = c.text;
  const title = `${c.action} emails about changes to ${LABEL}`;
  const option = c.rule.replace("*", "");
  const cls = state === "stop" ? `follow-link ${c.css} slotter btn btn-sm btn-primary` : "follow-link  slotter btn btn-sm btn-primary";
  const hover = state === "stop" ? ` data-hover-text="${c.hover}"` : "";
  return (
    `<a title="${title}" class="${cls}"${hover}` +
    ` href="/update/Label%2B*self%2BViewer%2B*follow` +
    `?card%5Bcontent%5D=%5B%5B%2A${option}%5D%5D&amp;success%5Bmark%5D=Label&amp;success%5Bview%5D=follow_section"` +
    ` data-remote="true"><span class="follow-verb">${verb}</span></a>`
  );
}

test("the assembled start anchor is read as Ruby's start state", () => {
  const shape = followLinkShape(anchor("start"));
  assert.equal(shape.verb, "follow");
  assert.equal(shape.ruleContent, "[[*always]]");
  assert.equal(shape.title, `send emails about changes to ${LABEL}`);
  assert.equal(shape.classes.includes("btn-item-delete"), false);
  assert.equal(shape.hover, null);
  assert.equal(followStateHolds(shape, "start", LABEL).ok, true);
});

test("the assembled stop anchor is read as Ruby's stop state", () => {
  const shape = followLinkShape(anchor("stop"));
  assert.equal(shape.verb, "following");
  assert.equal(shape.ruleContent, "[[*never]]");
  assert.equal(shape.title, `stop sending emails about changes to ${LABEL}`);
  assert.equal(shape.classes.includes("btn-item-delete"), true);
  assert.equal(shape.hover, "unfollow");
  assert.equal(followStateHolds(shape, "stop", LABEL).ok, true);
});

test("the two states differ on four independent bytes, and each drift is caught by name", () => {
  const good = followLinkShape(anchor("stop"));
  const mutations = {
    // The defect W1 cannot see: the anchor says "following" while its href
    // still writes *always. Clicking it would RE-follow the card.
    ruleContent: anchor("stop").replace("%2Anever", "%2Aalways"),
    verb: anchor("stop").replace(">following<", ">follow<"),
    title: anchor("stop").replace("stop sending", "send"),
    deleteClass: anchor("stop").replace("btn-item-delete ", ""),
    hoverText: anchor("stop").replace(` data-hover-text="unfollow"`, ""),
  };
  assert.equal(followStateHolds(followLinkShape(mutations.ruleContent), "stop", LABEL).failures.includes("ruleContent"), true);
  assert.equal(followStateHolds(followLinkShape(mutations.verb), "stop", LABEL).failures.includes("verb"), true);
  assert.equal(followStateHolds(followLinkShape(mutations.title), "stop", LABEL).failures.includes("title"), true);
  assert.equal(followStateHolds(followLinkShape(mutations.deleteClass), "stop", LABEL).failures.includes("deleteClass"), true);
  assert.equal(followStateHolds(followLinkShape(mutations.hoverText), "stop", LABEL).failures.includes("hoverText"), true);
  // And the stop state's link, mislabelled as the start state, fails the way
  // it should: a start link carrying the delete class is not a start link.
  assert.equal(followStateHolds(good, "start", LABEL).ok, false);
});

test("a delete class present in the START state fails, because the two states are opposites", () => {
  const polluted = anchor("start").replace("follow-link ", "follow-link btn-item-delete ");
  assert.equal(followStateHolds(followLinkShape(polluted), "start", LABEL).failures.includes("deleteClass"), true);
});

test("a page with no follow link at all reports noFollowLink", () => {
  assert.equal(followStateHolds(followLinkShape("<div>nothing here</div>"), "start", LABEL).failures.includes("noFollowLink"), true);
});

/** A full, correct round trip. */
function roundTrip(overrides = {}) {
  const base = {
    before: { shape: followLinkShape(anchor("start")), storedOption: "*never", followerCount: 0 },
    after: { shape: followLinkShape(anchor("stop")), storedOption: "*always", followerCount: 1 },
    stopped: { shape: followLinkShape(anchor("start")), storedOption: "*never", followerCount: 0 },
    followLabel: LABEL,
  };
  const merged = { ...base, ...overrides };
  for (const key of ["before", "after", "stopped"]) {
    merged[key] = { ...base[key], ...(overrides[key] ?? {}) };
  }
  return merged;
}

test("the complete round trip grades green", () => {
  const verdict = unfollowRoundTrip(roundTrip());
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
});

test("a link that says following over a stored *never fails afterNotFollowed - the inversion", () => {
  // The defect this row is actually about: correct bytes, wrong storage. The
  // card will never mail, and the page says it will.
  const verdict = unfollowRoundTrip(roundTrip({ after: { storedOption: "*never" } }));
  assert.ok(verdict.failures.includes("afterNotFollowed"));
});

test("an unfollow that did not change the storage fails afterNotUnfollowed", () => {
  const verdict = unfollowRoundTrip(roundTrip({ stopped: { storedOption: "*always" } }));
  assert.ok(verdict.failures.includes("afterNotUnfollowed"));
});

test("an unfollow that wrote a second rule under a different mark fails ruleChanged", () => {
  const other = followLinkShape(anchor("start").replace("%2Anever", "%2Aalways").replace("Label%2B*self%2BViewer%2B*follow", "Other%2B*self%2BViewer%2B*follow"));
  const verdict = unfollowRoundTrip(roundTrip({ stopped: { shape: other } }));
  assert.ok(verdict.failures.includes("ruleChanged"));
});

test("a stale follower cache fails the count legs, and the count is the only leg that sees it", () => {
  // Stored *never, correct bytes, correct rule - but the rendered count still
  // carries the former follower, because follower_ids is cached
  // (follower_ids.rb FOLLOWER_IDS_CACHE_KEY). Nothing else here can see it.
  const verdict = unfollowRoundTrip(roundTrip({ stopped: { followerCount: 1 } }));
  assert.ok(verdict.failures.includes("followCountDidNotFall"));
  const rising = unfollowRoundTrip(roundTrip({ after: { followerCount: 0 } }));
  assert.ok(rising.failures.includes("followCountDidNotRise"));
});

test("a control that never reverted to its start state fails stopped:verb", () => {
  const verdict = unfollowRoundTrip(roundTrip({ stopped: { shape: followLinkShape(anchor("stop")) } }));
  assert.ok(verdict.failures.includes("stopped:verb"));
  assert.ok(verdict.failures.includes("stopped:deleteClass"));
});

test("a card that was already followed before the run fails beforeNotUnfollowed", () => {
  const verdict = unfollowRoundTrip(roundTrip({ before: { storedOption: "*always" } }));
  assert.ok(verdict.failures.includes("beforeNotUnfollowed"));
});

test("the four check names are four legs, and they name the two-state nature", () => {
  assert.deepEqual(Object.keys(UNFOLLOW_CHECKS).sort(), ["reverted", "startLink", "stopLink", "storage"]);
  assert.match(UNFOLLOW_CHECKS.storage, /\*never/);
  assert.match(UNFOLLOW_CHECKS.reverted, /baseline/);
});