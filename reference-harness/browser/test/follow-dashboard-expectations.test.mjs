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
  dashboardNamesAllSet,
  dashboardNamesSelfSet,
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
