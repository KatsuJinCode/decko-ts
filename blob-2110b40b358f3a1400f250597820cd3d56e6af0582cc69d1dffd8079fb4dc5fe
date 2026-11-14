// The C8 harness predicate — "creating a card whose name already exists
// shows a visible validation error" — graded against Ruby's own answer.
//
//   node --test tools/edge-signed-in-exercise/test/duplicate-name-error.test.mjs
//
// The positive fixture is the COMMITTED RUBY ANSWER: the write battery's
// side-effects-ruby.json, step "create-duplicate-name" (status 422) - the
// page Ruby renders when a create's name is already taken. It is read from
// the file, not transcribed.
//
// Registry row cap-C8 (tools/edge-signed-in-exercise/capabilities.json, id C8)
// recorded "Refusal and unchanged Home checked; visible validation error is
// not asserted." The predicate it replaces was /already|taken|exists/i over
// the whole page after the refused submit. Tests 3 and 4 are the pages that
// regex cannot tell apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RUBY_ALERT_CLASS,
  duplicateNameError,
  errorAlertRegion,
  pickErrorAlert,
  readRefusedCreateError,
  rubyNameExistsMessage,
  rubyNameExistsMessageText,
  showsVisibleValidationError,
} from "../lib/duplicate-name-error.mjs";

const BATTERY = JSON.parse(
  readFileSync(
    new URL(
      "../../../reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const STEP = BATTERY.steps.find((step) => step.step === "create-duplicate-name");
const NAME = "Parity Probe Card";

test("Ruby's answer carries the duplicate-name error, and the harness reads it", () => {
  assert.ok(STEP !== undefined, "the write battery records the create-duplicate-name step");
  assert.equal(STEP.status, 422);
  const verdict = duplicateNameError(STEP.body, NAME);
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  // The alert's class string, byte for byte - "alert-dismissible " keeps its
  // trailing space and classy joins the list with another, so there are TWO
  // spaces before card-error-msg.
  assert.equal(verdict.alert.classes, "alert alert-warning alert-dismissible  card-error-msg");
  assert.equal(verdict.alert.classes, RUBY_ALERT_CLASS);
  // The heading: "Problems with <card name>".
  assert.equal(verdict.heading, `Problems with ${NAME}`);
  // The message: standard_error_message's paragraph, with Ruby's escaped
  // apostrophes.
  assert.equal(verdict.message, "must be unique; &#39;Parity Probe Card&#39; already exists.");
  assert.equal(verdict.message, rubyNameExistsMessage(NAME));
  // The paragraph's own shape: a <p> with a <strong> key.
  assert.match(STEP.body, /<p><strong>NAME:<\/strong> must be unique; &#39;Parity Probe Card&#39; already exists\.<\/p>/);
});

test("the error is the NAME error, not some other message", () => {
  // A different attribute's error (the abort shape is bare text, the
  // standard shape carries its own key).
  const otherKey = STEP.body.replace("<strong>NAME:</strong>", "<strong>CONTENT:</strong>");
  const verdict = duplicateNameError(otherKey, NAME);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("message"));
  // A different card's name in the message.
  const otherName = duplicateNameError(STEP.body, "Another Card");
  assert.equal(otherName.ok, false);
  assert.ok(otherName.failures.includes("message"));
  assert.ok(otherName.failures.includes("heading"));
});

test("a page that merely mentions the word is not the validation error (the cap-C8 defect)", () => {
  // The replaced regex passed on this: a page whose body contains "exists"
  // somewhere, with no alert at all.
  const mentions = "<html><body><p>This card already exists in the trash.</p></body></html>";
  const verdict = duplicateNameError(mentions, NAME);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failures, ["noErrorAlert"]);
  // A page with an alert of the wrong class.
  const wrongClass = STEP.body.replace(RUBY_ALERT_CLASS, "alert alert-warning");
  assert.ok(duplicateNameError(wrongClass, NAME).failures.includes("alertClass"));
  // A page whose alert has no message paragraph.
  const noMessage = STEP.body.replace(/<p><strong>NAME:<\/strong>[^<]*<\/p>/, "");
  assert.ok(duplicateNameError(noMessage, NAME).failures.includes("message"));
});

test("an alert that is not shown is not a visible error", () => {
  // The browser reports the element's classes; an element the page keeps
  // hidden is not a validation error a person can see.
  const shown = showsVisibleValidationError(STEP.body, NAME, RUBY_ALERT_CLASS);
  assert.equal(shown.ok, true);
  const hidden = showsVisibleValidationError(STEP.body, NAME, "alert alert-warning alert-dismissible d-none");
  assert.equal(hidden.ok, false);
  assert.ok(hidden.failures.includes("notVisible"));
  // With no visibility reading at all, the bytes still have to be right.
  assert.equal(showsVisibleValidationError(STEP.body, NAME).ok, true);
});

test("the alert region is read as the alert, not as a nested div", () => {
  const alert = errorAlertRegion(STEP.body);
  assert.ok(alert !== null);
  // The region holds the dismiss button, the heading and the message - and
  // stops at the alert's own close tag.
  assert.match(alert.inner, /btn-close/);
  assert.match(alert.inner, /alert-heading error/);
  assert.match(alert.inner, /<p><strong>NAME:<\/strong>/);
  assert.equal(/<footer/.test(alert.inner), false);
  assert.equal(errorAlertRegion("<html><body>no alert here</body></html>"), null);
});

test("the deck's own guide alert is not read as the error (the live defect)", () => {
  // THE DEFECT THIS PINS. A signed-in Decko page carries a role="alert"
  // element that is NOT the error: the deck's own guide block. The captured
  // signed-in page of 2026-10-22 carries it ABOVE the error
  // (.runtime/edge-signed-in/tranche6-base/report.md.raw/034.html, the
  // /new/RichText page the C8 leg starts from):
  //
  //   <div class="guide alert alert-secondary alert-dismissible " role="alert">
  //
  // The region was the FIRST div[role="alert"] on the page, so the leg
  // graded the guide block: failures ["alertClass","heading","message"],
  // heading null, message null, on a page whose error alert carried Ruby's
  // bytes exactly (the same run's 194-typed-fixture-create.html carries the
  // whole answer). The region is now the alert that carries the error's own
  // markers.
  const guide =
    `<div class="guide alert alert-secondary alert-dismissible " role="alert">` +
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n` +
    `<div class="guide-text"><span class="d-none"><a rel="nofollow" href="/">Culturesmith</a></span></div>\n` +
    `</div>\n`;
  const page = guide + STEP.body;
  const verdict = duplicateNameError(page, NAME);
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  assert.equal(verdict.heading, `Problems with ${NAME}`);
  assert.equal(verdict.message, rubyNameExistsMessage(NAME));
  // The guide alert is still a page element; it is simply not the error.
  const region = errorAlertRegion(page);
  assert.notEqual(region, null);
  assert.equal(region.classes, RUBY_ALERT_CLASS);
  assert.equal(/guide-text/.test(region.inner), false);
});

test("the error alert is picked by Ruby's own class_up, not by position", () => {
  // The browser reports the MEASUREMENTS of every alert; the pick is made
  // here, so the rule is testable without a browser.
  const guide = { classes: "guide alert alert-secondary alert-dismissible ", hidden: false };
  const error = { classes: RUBY_ALERT_CLASS, hidden: false };
  assert.deepEqual(pickErrorAlert([guide, error]), error);
  assert.deepEqual(pickErrorAlert([error, guide]), error);
  assert.equal(pickErrorAlert([guide]), null);
  assert.equal(pickErrorAlert([]), null);
  // A hidden error alert is still the error alert; the visibility is graded
  // separately, by showsVisibleValidationError.
  const hidden = { classes: RUBY_ALERT_CLASS, hidden: true };
  assert.deepEqual(pickErrorAlert([guide, hidden]), hidden);
});

test("the refused create's error is read off the page the error is on", async () => {
  // The reader takes the page's bytes and the error alert's own visibility,
  // and it takes BOTH before the caller navigates: a visibility reading
  // taken after a navigation belongs to a page that never carried the
  // error. The signed-in run of 2026-10-22 at this tip read it after the
  // visit to /Home and recorded alertClasses null, hidden null.
  const calls = [];
  const page = {
    content: async () => {
      calls.push("content");
      return STEP.body;
    },
    evaluate: async () => {
      calls.push("evaluate");
      return [
        { classes: "guide alert alert-secondary alert-dismissible ", hidden: false },
        { classes: RUBY_ALERT_CLASS, hidden: false },
      ];
    },
  };
  const read = await readRefusedCreateError(page);
  assert.deepEqual(calls, ["content", "evaluate"]);
  assert.equal(read.body, STEP.body);
  assert.equal(read.visibleAlert.classes, RUBY_ALERT_CLASS);
  assert.equal(read.visibleAlert.hidden, false);
  const verdict = showsVisibleValidationError(read.body, NAME, read.visibleAlert.classes);
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
});

test("the harness reads the error before it navigates away", () => {
  // The ORDER is the defect, and the order lives in the caller, so it is
  // pinned on the caller's own source: the reader's call must come before
  // the visit that replaces the page.
  const harness = readFileSync(
    new URL("../../edge-signed-in-exercise.mjs", import.meta.url),
    "utf8",
  );
  const leg = harness.slice(harness.indexOf('await attempt("C8 duplicate name refused"'));
  assert.notEqual(leg, "", "the C8 leg must be there");
  const readAt = leg.indexOf("readRefusedCreateError(page)");
  const visitAt = leg.indexOf('visit("/Home")');
  assert.notEqual(readAt, -1, "the leg must read the refused create's error");
  assert.notEqual(visitAt, -1, "the leg must still visit /Home");
  assert.ok(readAt < visitAt, "the error must be read before the page is navigated away");
});

test("the browser's DOM form of the message grades green too", () => {
  // The check reads the page through the browser, and the browser's DOM
  // serialization writes the text content's apostrophe as an apostrophe: the
  // page's own bytes carry Ruby's `h` escapes (&#39;) and the signed-in
  // page of 2026-10-22 carries the decoded form
  // (.runtime/edge-signed-in/tranche6-base/report.md.raw/
  // 194-typed-fixture-create.html). Both are the same answer, and the
  // predicate grades both - the escaped form is the committed Ruby answer,
  // the decoded form is what a person reads.
  const dom = STEP.body.replace(/&#39;/g, "'");
  assert.equal(dom.includes("must be unique; 'Parity Probe Card' already exists."), true);
  const verdict = duplicateNameError(dom, NAME);
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  assert.equal(verdict.message, rubyNameExistsMessageText(NAME));
  // A message that is neither form is still a failure.
  const wrong = dom.replace("must be unique; 'Parity Probe Card' already exists.", "taken");
  assert.ok(duplicateNameError(wrong, NAME).failures.includes("message"));
});
