import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planEvents } from "../../../tools/compat-report/behaviour-probes.mjs";
import { summariseProbes } from "../../../tools/compat-report/behaviour.mjs";
import { normalizeForRecord, normalizeHtml } from "../normalize.mjs";
import { makeFixture, runFake } from "./helpers.mjs";

test("each event gets a separate scenario with action-specific baselines", () => {
  const declarations = ["create", "update", "delete"].map((on) => ({ event: `on_${on}`, on, set: { pattern: "all" }, file: "set/all/example.rb" }));
  const { plan, scenarios } = planEvents({ cards: [] }, declarations);
  assert.equal(new Set(scenarios.map((s) => s.id)).size, 3);
  for (const p of plan) {
    const scenario = scenarios.find((s) => s.id === p.scenario);
    assert.deepEqual(scenario.steps.slice(...[p.baseline.steps[0], p.baseline.steps[1] + 1]).map((s) => s.action), ["create", "update", "delete"]);
    assert.ok(scenario.steps.some((s) => s.action === p.on && s.card === p.card));
  }
});

test("concurrent fresh sessions preserve sequential scenario bytes and output order", () => {
  const root = mkdtempSync(join(tmpdir(), "decko-mod-workers-test-"));
  try {
    const fixture = makeFixture(root);
    const sequential = join(root, "sequential");
    const concurrent = join(root, "concurrent");
    for (const [out, workers] of [[sequential, "1"], [concurrent, "2"]]) {
      const run = runFake(fixture, out, { extraArgs: ["--kinds", "scenarios", "--scenario-workers", workers] });
      assert.equal(run.status, 0, run.stderr);
    }
    // The fake adapter emits a random slot ID, covered by the existing N1.
    const answers = (out) => readFileSync(join(out, "scenarios.jsonl"), "utf8").trim().split("\n").map((line) => {
      const scenario = JSON.parse(line);
      for (const step of scenario.steps) if (step.result?.html) step.result.html = normalizeHtml(step.result.html);
      return scenario;
    });
    assert.deepEqual(answers(concurrent), answers(sequential));
    const meta = JSON.parse(readFileSync(join(concurrent, "run-meta.json"), "utf8"));
    assert.equal(meta.runs.scenarios.complete, true);
    assert.equal(meta.runs.scenarios.scenario_workers, 2);
    assert.equal(meta.runs.scenarios.session_timings.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("User creation carries actual nested account/email/password writes", () => {
  const index = { cards: [{ name: "User", facts: { codename: "user", compound: false, type: "cardtype" } }] };
  const { scenarios } = planEvents(index, [{ event: "account", on: "create", set: { pattern: "type", anchor: "user" } }]);
  const writes = scenarios[0].steps.filter((s) => s.action === "create");
  for (const write of writes) {
    assert.match(write.fields.fields["+*account"].fields["+*email"], /@example.test$/);
    assert.equal(typeof write.fields.fields["+*account"].fields["+*password"], "string");
  }
});

const step = (count) => ({ result: { saved: true }, rows: { cards: { inserted: Array.from({ length: count }, () => ({})), updated: [], deleted: [] } } });
function eventEvidence(on, baseline, setup, action) {
  const root = mkdtempSync(join(tmpdir(), "decko-mod-probe-test-"));
  try {
    const expected = join(root, "reference-harness/fixtures/synthetic-v2-mod-probes/expected");
    mkdirSync(expected, { recursive: true });
    writeFileSync(join(expected, "scenarios.jsonl"), JSON.stringify({ id: "probe-e1", steps: [...baseline, setup, action] }) + "\n");
    const probes = { render: { plan: [] }, events: { plan: [{ status: "planned", event: "example", scenario: "probe-e1", probe: "e1", on, steps: [2, 3], baseline: { steps: [0, 1] }, labels: [{ action: "create" }, { action: on }, { action: "create" }, { action: on }] }] } };
    return summariseProbes(root, { verdict: "pass", failures: {}, summary: {} }, probes).events.example.evidence;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("setup creation cannot prove a delete event fired", () => {
  assert.equal(eventEvidence("delete", [step(1), step(0)], step(2), step(0)), "not-observed");
});

test("an update is compared with its update baseline", () => {
  assert.equal(eventEvidence("update", [step(1), step(0)], step(1), step(1)), "graded-identical");
});

test("a baseline exception cannot prove an event fired", () => {
  assert.equal(eventEvidence("update", [step(1), { error: { class: "Error", message: "invalid baseline" } }], step(1), step(0)), "not-observed");
});

test("partial and invalid grades cannot produce completion claims", () => {
  for (const verdict of ["partial", "invalid", undefined]) {
    assert.throws(() => summariseProbes("unused", { verdict }, {}), /complete valid grade/);
  }
});

test("record-time rules remove frame paths and preserve all other canonical forms", () => {
  const html = '<p class="z a" data-slot-id="0123456789abcdef0123">before 2 days ago after</p><span title="&lt;h3&gt;Error message (visible to admin only)&lt;/h3&gt;&lt;p&gt;broken&lt;/p&gt;&lt;div&gt;C:/capture-host/secret.rb:7&lt;/div&gt;">x</span>';
  const recorded = normalizeForRecord({ html }).html;
  assert.ok(recorded.includes('class="z a"'));
  assert.ok(recorded.includes('data-slot-id="0123456789abcdef0123"'));
  assert.ok(recorded.includes("before 2 days ago after"));
  assert.ok(recorded.includes("N6#frames"));
  assert.ok(!recorded.includes("secret.rb"));
  assert.equal(normalizeHtml(recorded), normalizeHtml(html));
  const objectAddress = '<p title="#&lt;Card:0x000012345678abcd&gt;">#&lt;Card:0x000012345678abcd&gt;</p>';
  // N9 belongs to comparison, not the N6/N7-only recording boundary.
  assert.equal(normalizeForRecord({ html: objectAddress }).html, objectAddress);
  const applied = new Set();
  normalizeHtml(objectAddress, { applied });
  assert.ok(applied.has("N9"));
});
