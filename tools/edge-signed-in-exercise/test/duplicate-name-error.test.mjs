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
  rubyNameExistsMessage,
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
