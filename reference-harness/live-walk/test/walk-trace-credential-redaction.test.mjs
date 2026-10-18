// Regression tests for R1 trace redaction (lib/walker.mjs traceStepRecord).
//
// The defect this closes: R1 capture redaction covered the exchange records
// (lib/normalize-exchange.mjs redactForStorage, applied by
// attachExchangeCapture before anything is stored), but the walk's OTHER
// stored record — the journey trace, result.steps, written as
// <out>/<side>/<journey>.json by walk-and-compare.mjs — kept a fill/type/
// editor step's raw value. A production credential typed into a password
// field landed in the saved JSON in plaintext.
//
// The tests drive walkJourney itself over a stub browser (no window, no
// network: every locator call is answered in-process), so the exact push
// sites on all three outcome paths (ok / failed / skipped) are what is under
// test, and the serialized result is grepped the way the saved file is
// written (walk-and-compare.mjs's JSON.stringify of the journey record).
// Nothing here sends a request anywhere: the stub browser has no transport.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { walkJourney, stepTargetsCredentialField } from "../lib/walker.mjs";

const SECRET = "Stage-Real-Passw0rd!42";
const TOKEN = "R1#redacted";

// A stub locator answering every method the step executor can call. The
// injected failOn makes exactly one selector's action throw, with the value
// embedded in the message — the error-path metadata the redaction must scrub.
function fakeLocator({ failOn, action } = {}) {
  const locator = {
    filter: () => locator,
    count: async () => 1,
    first: () => locator,
    waitFor: async () => {},
    isVisible: async () => true,
    isChecked: async () => false,
    inputValue: async () => "",
    evaluate: async fn => fn({type:"text",name:"ordinary",id:"ordinary",autocomplete:""}),
    fill: async (value) => { if (failOn === "fill") throw new Error(`fill rejected: value ${value} refused by stub for ${action}`); },
    click: async () => { if (failOn === "click") throw new Error(`click refused by stub for ${action}`); },
    pressSequentially: async () => { if (failOn === "type") throw new Error(`type refused by stub for ${action}`); },
    check: async () => {},
    uncheck: async () => {},
    selectOption: async () => {},
    setInputFiles: async () => {},
  };
  return locator;
}

function fakePage() {
  const page = {
    url: () => "http://127.0.0.1:8642/",
    setDefaultTimeout: () => {},
    on: () => {},
    goto: async () => {},
    waitForLoadState: async () => {},
    evaluate: async () => 0, // settle(): no jQuery, nothing in flight
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    screenshot: async () => {},
    keyboard: { press: async () => {} },
    getByText: () => fakeLocator(),
    locator: (selector) =>
      fakeLocator({
        failOn: selector.includes("password_confirmation") ? "fill" : selector.includes("boom") ? "click" : undefined,
        action: selector,
      }),
  };
  return page;
}

function fakeBrowserFactory() {
  const page = fakePage();
  const browser = {
    version: "stub-browser-0",
    context: {
      pages: () => [],
      newPage: async () => page,
      on: () => {},
      off: () => {},
      route: async () => {},
    },
    close: async () => {},
  };
  return async () => browser;
}

async function walk(journey) {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "walk-trace-redaction-test-"));
  try {
    return await walkJourney({
      base: "http://127.0.0.1:8642",
      journey,
      actors: {},
      outDir,
      browserFactory: fakeBrowserFactory(),
      label: "trace-redaction-test",
      side: "a",
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/** The saved form of a journey record: exactly what walk-and-compare.mjs
 *  writes to <out>/<side>/<journey>.json. */
const savedJsonOf = (result) =>
  JSON.stringify({ ...result, exchangesInMemory: undefined, exchanges: result.exchanges }, null, 1);

const plaintextHits = (json, needle) => json.split(needle).length - 1;

test("a password fill survives no plaintext in the serialized trace, on any outcome path", async () => {
  const journey = {
    id: "trace-redaction-all-paths",
    steps: [
      { visit: "/" },
      { fill: { field: "*email" }, value: "mira.member@example.test" },
      { fill: { field: "*password" }, value: SECRET }, // ok path: the sign-in fill
      { type: { css: "input[name='account[secret_key]']" }, value: SECRET }, // ok path, type kind
      { editor: { name: "card[subcards][+*token][content]" }, value: SECRET }, // ok path, editor kind
      { fill: { css: "input[name='account[password_confirmation]']" }, value: SECRET }, // failed path; the stub's error embeds the value
      { click: { button: "Sign in" } }, // skipped path
      { observe: "never reached" }, // skipped path
    ],
  };

  const result = await walk(journey);
  const saved = savedJsonOf(result);

  // The grep: zero hits for the password — whole and distinctive fragment —
  // in the serialized record exactly as it is saved.
  assert.equal(plaintextHits(saved, SECRET), 0, "the serialized trace contains the plaintext secret");
  assert.equal(plaintextHits(saved, "Passw0rd"), 0, "the serialized trace contains a secret fragment");
  assert.ok(saved.includes(TOKEN), "the redaction token never appears although credential steps ran");

  // Verdicts: ok / ok / ok / ok / ok / failed / skipped / skipped.
  assert.deepEqual(result.steps.map((s) => s.outcome), ["ok", "ok", "ok", "ok", "ok", "failed", "skipped", "skipped"]);
  assert.equal(result.completed, false, "the failed step must still fail the journey");

  // Non-secret steps byte-intact.
  assert.deepEqual(result.steps[0].step, { visit: "/" });
  assert.deepEqual(result.steps[1].step, { fill: { field: "*email" }, value: "mira.member@example.test" });
  assert.deepEqual(result.steps[6].step, { click: { button: "Sign in" } });
  assert.deepEqual(result.steps[7].step, { observe: "never reached" });

  // Credential steps: the value alone replaced, the step otherwise intact.
  assert.deepEqual(result.steps[2].step, { fill: { field: "*password" }, value: TOKEN });
  assert.deepEqual(result.steps[3].step, { type: { css: "input[name='account[secret_key]']" }, value: TOKEN });
  assert.deepEqual(result.steps[4].step, { editor: { name: "card[subcards][+*token][content]" }, value: TOKEN });

  // Failed path: the step's value is redacted AND the error text scrubbed —
  // the stub's message embeds the value it was filling — while the error
  // keeps its shape (action word + selector) as evidence.
  assert.deepEqual(result.steps[5].step, { fill: { css: "input[name='account[password_confirmation]']" }, value: TOKEN });
  assert.equal(plaintextHits(result.steps[5].error, SECRET), 0, "the failed step's error carries the secret");
  assert.match(result.steps[5].error, /fill rejected/);
  assert.match(result.steps[5].error, /password_confirmation/);
  assert.ok(result.steps[5].error.includes(TOKEN), "the error does not mark where the secret was scrubbed");

  // The journey list itself is untouched: the second side of a comparison
  // must still walk with the real value.
  assert.equal(journey.steps[2].value, SECRET);
  assert.equal(journey.steps[5].value, SECRET);
});

test("a skipped credential step is redacted too, non-credential skipped steps are not", async () => {
  const journey = {
    id: "trace-redaction-skipped-path",
    steps: [
      { click: { css: ".boom-button" } }, // fails in the stub
      { fill: { field: "*password" }, value: SECRET }, // never runs: skipped
      { fill: { field: "*email" }, value: "ada.admin@example.test" }, // never runs: skipped, non-credential
    ],
  };

  const result = await walk(journey);
  assert.deepEqual(result.steps.map((s) => s.outcome), ["failed", "skipped", "skipped"]);
  assert.deepEqual(result.steps[1].step, { fill: { field: "*password" }, value: TOKEN });
  assert.deepEqual(result.steps[2].step, { fill: { field: "*email" }, value: "ada.admin@example.test" });
  assert.equal(plaintextHits(savedJsonOf(result), SECRET), 0, "the serialized trace contains the plaintext secret");
});

test("the credential classifier matches the field's name, selector and type words, and nothing else", () => {
  // The ask's word list: password, passwort, token, secret — matched against
  // the target's naming/selection strings.
  assert.equal(stepTargetsCredentialField({ fill: { field: "*password" }, value: "x" }), true);
  assert.equal(stepTargetsCredentialField({ fill: { field: "*passwort" }, value: "x" }), true);
  assert.equal(stepTargetsCredentialField({ fill: { name: "card[subcards][+*password][content]" }, value: "x" }), true);
  assert.equal(stepTargetsCredentialField({ fill: { css: "input[type='password']" }, value: "x" }), true);
  assert.equal(stepTargetsCredentialField({ type: { css: "input[name=authenticity_token]" }, value: "x" }), true);
  assert.equal(stepTargetsCredentialField({ editor: { field: "*secret" }, value: "x" }), true);
  // Not value-bearing kinds, or non-credential targets: untouched.
  assert.equal(stepTargetsCredentialField({ click: { field: "*password" } }), false);
  assert.equal(stepTargetsCredentialField({ fill: { field: "*email" }, value: "x" }), false);
  assert.equal(stepTargetsCredentialField({ fill: { field: "*content" }, value: "x" }), false);
  assert.equal(stepTargetsCredentialField({ visit: "/" }), false);
});
