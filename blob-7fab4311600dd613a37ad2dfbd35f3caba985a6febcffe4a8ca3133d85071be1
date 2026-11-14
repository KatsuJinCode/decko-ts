// follow-dashboard-expectations.test.mjs
//
// The oracle-matched tests for the ACT-155 probe leg's two dashboard
// expectations. Each leg below names the Ruby it is the counterpart of; the
// port is never consulted, so a port that renders the wrong label fails the
// check instead of defining it.
//
//   node --test reference-harness/browser/test/follow-dashboard-expectations.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SET_SHORT_LABEL,
  FOLLOWERS_JUNCTION_TAG,
  UNASTERISKED_FOLLOWERS_TAG,
  dashboardNamesAllSet,
  dashboardNamesSelfSet,
  followersJunctionPath,
  isFollowersListAddress,
  namesFollowersList,
  namesUnknownJunctionCreateForm,
  selfSetShortLabel,
} from "../lib/follow-dashboard-expectations.mjs";

test("the self set's short label is the anchor's own name (09_self.rb:5-6)", () => {
  assert.equal(selfSetShortLabel("HarnessW4AdminFollows_mvimyby12ue"), "HarnessW4AdminFollows_mvimyby12ue");
});

test("a dashboard naming the card-scoped set satisfies the admin clause (09_self.rb:5-6)", () => {
  const text = "Follow Ignore check HarnessW4AdminFollows_mvimyby12ue";
  assert.equal(dashboardNamesSelfSet("HarnessW4AdminFollows_mvimyby12ue", text), true);
});

test("the same name with a space separator satisfies the admin clause (the rendered title's separator)", () => {
  const text = "Follow Ignore check HarnessW4AdminFollows mvimyby12ue";
  assert.equal(dashboardNamesSelfSet("HarnessW4AdminFollows_mvimyby12ue", text), true);
});

test("a dashboard naming some other card does not satisfy the admin clause", () => {
  const text = "Follow Ignore check HarnessW4MemberFollows_mvimyby15qu";
  assert.equal(dashboardNamesSelfSet("HarnessW4AdminFollows_mvimyby12ue", text), false);
});

test("an empty dashboard satisfies neither clause", () => {
  assert.equal(dashboardNamesSelfSet("HarnessW4AdminFollows_mvimyby12ue", ""), false);
  assert.equal(dashboardNamesAllSet(""), false);
});

test("the all set's short label is 'everything' (01_all.rb:5-7)", () => {
  assert.equal(ALL_SET_SHORT_LABEL, "everything");
});

test("a dashboard naming the deck-wide set satisfies the member clause (01_all.rb:5-7)", () => {
  assert.equal(dashboardNamesAllSet("Mira Member+follow Follow Ignore check everything"), true);
});

test("a dashboard naming the deck-wide set's codename alone does not satisfy the member clause (the label is the short label, not the codename)", () => {
  assert.equal(dashboardNamesAllSet("Mira Member+follow Follow Ignore *all"), false);
});

test("a dashboard naming a per-card materialization for the member does not satisfy the member clause (Ruby materializes nothing per card for a deck-wide follow)", () => {
  const text = "Mira Member+follow Follow Ignore check HarnessW4MemberFollows_mvimyby15qu";
  assert.equal(dashboardNamesAllSet(text), false);
});

test("the member clause and the admin clause cannot be satisfied by the same text", () => {
  const text = "Follow Ignore check HarnessW4AdminFollows_mvimyby12ue";
  assert.equal(dashboardNamesSelfSet("HarnessW4AdminFollows_mvimyby12ue", text), true);
  assert.equal(dashboardNamesAllSet(text), false);
});

// ── the followers LIST address, settled against a live Ruby oracle ─────────
// Ruby 3.3.12 / card 1.110.0 / card-mod-follow 0.20.0, real HTTP GETs through
// the Decko router; see docs/reports/oracle-followers-address-settle-2026-10-22.md.

test("the followers list is the ASTERISKED junction (set/right/followers.rb:1 'X+*followers')", () => {
  assert.equal(FOLLOWERS_JUNCTION_TAG, "*followers");
  assert.equal(UNASTERISKED_FOLLOWERS_TAG, "followers");
});

test("the followers list path is the asterisked junction", () => {
  assert.equal(followersJunctionPath("HarnessW4MemberFollows_mvimyby15qu"), "/HarnessW4MemberFollows_mvimyby15qu+*followers");
  assert.equal(followersJunctionPath("Ada Admin"), "/Ada_Admin+*followers");
  assert.equal(followersJunctionPath(""), null);
});

test("the asterisked address is the followers list address", () => {
  assert.equal(isFollowersListAddress("/HarnessW4MemberFollows_mvimyby15qu+*followers"), true);
  assert.equal(isFollowersListAddress("/Ada_Admin+*followers/core"), true);
  assert.equal(isFollowersListAddress("/Ada_Admin+*followers?view=core"), true);
});

test("the un-asterisked address is NOT the followers list address (the settled finding)", () => {
  assert.equal(isFollowersListAddress("/HarnessW4MemberFollows_mvimyby15qu+followers"), false);
  assert.equal(isFollowersListAddress("/Ada_Admin+followers"), false);
  assert.equal(isFollowersListAddress("/Ada_Admin+follow"), false);
});

test("the measured list page names the asterisked junction and satisfies the clause", () => {
  // measured oracle firstView=titled text, port fixture
  const text = "Ada_Admin+*followers Mira Member";
  assert.equal(namesFollowersList("Ada Admin", text), true);
  // the live oracle's own body, same shape
  const live = "Oracle Followers Address Probe + *followers help edit space_dashboard";
  assert.equal(namesFollowersList("Oracle Followers Address Probe", live), true);
});

test("matrix tranche-6's recorded text is NOT a followers list: it names the un-asterisked junction", () => {
  // verbatim followersText from
  // docs/reports/receipts/row-mx-155-act155-probe-leg-2026-10-21-tranche6.json
  const text = "HarnessW4MemberFollows mvin9svw6s1+followers Mira Member";
  assert.equal(namesFollowersList("HarnessW4MemberFollows_mvin9svw6s1", text), false);
  assert.equal(namesUnknownJunctionCreateForm("HarnessW4MemberFollows_mvin9svw6s1", text), true);
});

test("a create form that names the signed-in member does not satisfy the followers clause (the defect this replaces)", () => {
  // the old predicate was /Mira/i over the page text, which the create form's
  // own chrome satisfies; this is the page it was passing.
  const text = "HarnessW4MemberFollows mvin9svw6s1+followers Mira Member";
  assert.match(text, /Mira/i, "the old predicate was satisfied by this text");
  assert.equal(namesFollowersList("HarnessW4MemberFollows_mvin9svw6s1", text), false);
});

test("the list clause cannot be satisfied by another card's junction", () => {
  assert.equal(namesFollowersList("Ada Admin", "Mira Member+*followers Ada Admin"), false);
});

test("empty and non-string inputs satisfy neither followers clause", () => {
  assert.equal(namesFollowersList("Ada Admin", ""), false);
  assert.equal(namesFollowersList("Ada Admin", null), false);
  assert.equal(namesFollowersList("", "Ada_Admin+*followers Mira Member"), false);
  assert.equal(namesUnknownJunctionCreateForm("Ada Admin", ""), false);
});

test("a page naming BOTH spellings reads as the list, not the create form (the asterisk is the discriminator)", () => {
  const text = "Ada_Admin+*followers Ada_Admin+followers Mira Member";
  assert.equal(namesFollowersList("Ada Admin", text), true);
  assert.equal(namesUnknownJunctionCreateForm("Ada Admin", text), false);
});
