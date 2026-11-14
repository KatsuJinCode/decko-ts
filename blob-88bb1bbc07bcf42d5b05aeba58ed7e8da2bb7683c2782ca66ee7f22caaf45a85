// sign-in-surfaces.oracle.test.mjs — the six sign-in rows' instrument,
// pinned to RUBY's own captured bytes.
//
// THE ROWS. The roster's sign-in group is six rows and all six are graded by
// the same instrument: the "1. sign in, and stay signed in" group of
// tools/edge-signed-in-exercise.mjs.
//
//   mx-B-001  admin signs in through the sign-in form and stays signed in
//   mx-B-002  member signs in through the sign-in form and stays signed in
//   mx-B-003  home shows the account name and Sign out
//   mx-B-004  stays signed in across navigation
//   mx-B-005  stays signed in after browser Back
//   mx-B-006  stays signed in after reload
//
// WHAT IS PINNED HERE, AND WHERE THE LINE IS. The sign-in form, the sign-in
// card's key and the sign-out link are RUBY's own bytes, read from the
// committed capture by arm id and never transcribed. The session cookie's
// name and the page's signed-in marker are the PORT's own facts
// (src/server/write-routes.ts:363 and the port's own JS), so they are named
// here as the port's and are not claimed as oracle-matched.
//
// No browser, no network, no deck.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/sign-in-surfaces.oracle.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { signOutLinkElement, hasSignOut, signInFormAction, SIGN_IN_CARD_KEY, SIGN_OUT_LINK_CLASS, SIGNED_IN_MARKER_RE } from "../lib/sign-in-surfaces.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTURE = join(HERE, "..", "..", "..", "reference-harness", "fixtures", "synthetic-v2-mod-probes", "expected", "render.jsonl");

const arms = new Map();
for (const line of readFileSync(CAPTURE, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const arm = JSON.parse(trimmed);
  arms.set(arm.id, arm.result?.html ?? null);
}

const SIGN_IN_FORM_ARM = "probe-view:17:core@set/self/signin.rb";
const SIGN_IN_CARD_ARM = "probe-view:26:open@set/self/signin.rb";
const SIGN_IN_TITLE_ARM = "probe-view:29:title@set/self/signin.rb";
const SIGN_OUT_ARM = "probe-view:406:sign_out@set/self/account_links.rb";

test("the oracle arms this test reads are in the committed capture", () => {
  for (const arm of [SIGN_IN_FORM_ARM, SIGN_IN_CARD_ARM, SIGN_IN_TITLE_ARM, SIGN_OUT_ARM]) {
    assert.ok(arms.has(arm), `${arm} must be in the capture`);
    assert.equal(typeof arms.get(arm), "string");
  }
});

test("Ruby's sign-in form posts to the sign-in card's own update route", () => {
  const action = signInFormAction(arms.get(SIGN_IN_FORM_ARM));
  assert.equal(action, "/update/*signin");
  assert.ok(action.includes(SIGN_IN_CARD_KEY), "the route names the sign-in card");
});

test("Ruby's sign-in card's key is the path the exercise signs in at", () => {
  const markup = arms.get(SIGN_IN_CARD_ARM);
  const key = SIGN_IN_CARD_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(markup, new RegExp(`data-card-name="${key}"`));
  assert.match(markup, new RegExp(`data-card-link-name="${key}"`));
});

test("Ruby's sign-in card carries the title Sign In", () => {
  assert.equal(arms.get(SIGN_IN_TITLE_ARM), '<span class="card-title" title="Sign In">Sign In</span>');
});

test("Ruby's sign-out link carries the signout-link class, the href and the text", () => {
  const link = signOutLinkElement(arms.get(SIGN_OUT_ARM));
  assert.ok(link, "the sign-out link must be found by its Ruby class");
  assert.equal(link.href, "/delete/*signin");
  assert.equal(link.text, "Sign out");
  assert.ok(link.classes.includes(SIGN_OUT_LINK_CLASS));
  assert.equal(hasSignOut(arms.get(SIGN_OUT_ARM)), true);
});

test("the port renders the sign-out link's bytes, and the oracle test says so", () => {
  // The port's own source, read here so the oracle pin covers both sides:
  // src/card/render/navbar-views.ts:369 renders the anchor Ruby's capture
  // carries, byte for byte once the known-card class is filled in.
  const source = readFileSync(join(HERE, "..", "..", "..", "src", "card", "render", "navbar-views.ts"), "utf8");
  const rubysBytes = arms.get(SIGN_OUT_ARM);
  const anchor = /<a class="nav-link signout-link[^`]*>Sign out<\/a>/.exec(source);
  assert.ok(anchor, "the port's source must render the sign-out anchor");
  const rendered = anchor[0].replace("$\{knownClass(known.signin)\}", "known-card");
  assert.equal(rendered, rubysBytes, "the port's sign-out anchor must be Ruby's bytes");
});

test("a page without a sign-out link does not read as signed out", () => {
  assert.equal(hasSignOut("<html><body>nothing here</body></html>"), false);
  assert.equal(signOutLinkElement("<html><body>nothing here</body></html>"), null);
  assert.equal(signInFormAction("<html><body>nothing here</body></html>"), null);
});

test("the port's own signed-in marker is named as the port's, not as Ruby's", () => {
  // Ruby knows a signed-in visitor by its session. The page marker below is
  // the port's own, so this test names it as such: it is a named-instrument
  // fact for the four "stays signed in" rows, never an oracle-matched one.
  assert.equal(SIGNED_IN_MARKER_RE.test("<script>decko.signed_in=true;</script>"), true);
  assert.equal(SIGNED_IN_MARKER_RE.test("<script>decko.signed_in = true;</script>"), true);
  assert.equal(SIGNED_IN_MARKER_RE.test("<script>decko.signed_in=false;</script>"), false);
});
