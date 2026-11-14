// checks-catalog-edit-create.test.mjs — the catalog-edit-create instrument's
// check bodies must be able to RUN at all.
//
// THE DEFECT THIS PINS. The E11b check (checks-catalog-edit-create.mjs) read
// `database`, `page`, `visit` and `record` as BARE FREE VARIABLES, while
// every other check in the same file destructures the same surfaces out of
// the ctx the runner passes (lib/check-modules.mjs calls check.run(ctx)).
// A bare free variable the module does not define is a ReferenceError at run
// time, so every selected run of this module died with "database is not
// defined" BEFORE the check reached a single assertion — the check could not
// report a verdict at all, only a crash. The repair rides the branch
// fix/e11b-module-context-20261020 (commit 1aa15d47): destructure the four
// surfaces from ctx.
//
// WHAT THE TEST DOES. It calls the check body directly with a stub ctx whose
// database() answers "no canonical summary row", and asserts the body REACHES
// that first real assertion instead of dying on a free variable. The test
// fails if the binding is removed again: the ReferenceError comes back, the
// message stops being the summary refusal, and the assertion below turns red.
//
// No browser, no network, no deck: the body is stopped at its first
// assertion, so nothing beyond the stub is exercised.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/checks-catalog-edit-create.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { checks } from "../checks-catalog-edit-create.mjs";

const e11b = checks.find((check) => check.name.startsWith("E11b "));
assert.ok(e11b, "the E11b check must exist in the catalog-edit-create module");

/** A ctx whose database() answers "no canonical summary row is stored". */
const ctxWithoutSummary = () => ({
  database: () => ({ prepare: () => ({ get: () => undefined }) }),
  page: {},
  visit: async () => {},
  record: () => {},
  created: [],
  stack: { origin: "https://127.0.0.1:1" },
  captureEvidence: () => undefined,
});

test("the E11b check body reads its harness surfaces from ctx and reaches its first assertion", async () => {
  const error = await e11b.run(ctxWithoutSummary()).then(() => null, (thrown) => thrown);
  assert.ok(error, "the stub ctx stores no canonical summary row, so the check must refuse");
  assert.equal(error.name, "Error", "a ReferenceError means the body read an unbound name");
  assert.match(error.message, /Canonical summary tag is unavailable/);
  assert.doesNotMatch(error.message, /is not defined/, "the body read a free variable the module does not define");
});

test("every check in the module names a body the runner can call with a ctx", () => {
  for (const check of checks) {
    assert.equal(typeof check.name, "string");
    assert.equal(typeof check.run, "function");
  }
});
