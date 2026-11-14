// Unit controls for the restart-persistence verdict (lib/restart-persistence-verdict.mjs):
// the grader passes a real restart receipt and fails a forged one, a failed
// post-restart assertion, and dirty provenance. These are labelled unit
// fixtures: only actual browser runs substantiate a product claim.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gradeRestartPersistence } from "../lib/restart-persistence-verdict.mjs";

const CANDIDATE = "a".repeat(40);
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const DEFINITION = {
  format: "decko-browser-journeys/1",
  journeys: [
    {
      id: "unit-restart-journey",
      steps: [
        { signin: "member" },
        { visit: "/Probe" },
        { observe: "before" },
        { fresh_session: true },
        { restart: true },
        { visit: "/Probe" },
        { observe: "after restart" },
        { assert: { field: "*email", value: "kept@example.test" } },
      ],
    },
    { id: "unit-no-restart-journey", steps: [{ visit: "/" }] },
  ],
};

function step(i, kind, outcome = "ok", extra = {}) {
  return { i, step: { [kind]: kind === "restart" ? true : "x" }, outcome, ...extra };
}

function writeRun(dir, steps, { commit = CANDIDATE, dirty = false, buildCommit = CANDIDATE } = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "unit-restart-journey.json"), JSON.stringify({ id: "unit-restart-journey", steps }));
  writeFileSync(
    path.join(dir, "run-meta.json"),
    JSON.stringify({ provenance: { source: { commit, dirty, statusSha256: dirty ? "nonempty" : EMPTY_SHA }, buildReceipt: { sourceCommit: buildCommit } } }),
  );
}

function withDefinition(work, mutate) {
  const definition = JSON.parse(JSON.stringify(DEFINITION));
  mutate?.(definition);
  const file = path.join(work, "journeys.json");
  writeFileSync(file, JSON.stringify(definition));
  return file;
}

test("a real restart receipt with a held post-restart assertion passes", () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "restart-verdict-pass-"));
  try {
    const run = path.join(work, "run");
    writeRun(run, [
      step(0, "signin"),
      step(1, "visit"),
      step(2, "observe"),
      step(3, "fresh_session"),
      step(4, "restart", "ok", { restart: { previousPid: 100, pid: 200, bootMs: 512 } }),
      step(5, "visit"),
      step(6, "observe"),
      step(7, "assert"),
    ]);
    const report = gradeRestartPersistence({ run, journeysFile: withDefinition(work), candidate: CANDIDATE });
    assert.equal(report.verdict, "pass");
    assert.equal(report.perJourney.length, 1);
    assert.equal(report.perJourney[0].pass, true);
    assert.deepEqual(report.skippedJourneys, ["unit-no-restart-journey"]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("a failed post-restart assertion names the step and fails", () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "restart-verdict-assert-"));
  try {
    const run = path.join(work, "run");
    const steps = [
      step(0, "signin"),
      step(1, "visit"),
      step(2, "observe"),
      step(3, "fresh_session"),
      step(4, "restart", "ok", { restart: { previousPid: 100, pid: 200, bootMs: 512 } }),
      step(5, "visit"),
      step(6, "observe"),
      step(7, "assert", "failed", { error: "field value differs" }),
    ];
    writeRun(run, steps);
    const report = gradeRestartPersistence({ run, journeysFile: withDefinition(work), candidate: CANDIDATE });
    assert.equal(report.verdict, "fail");
    assert.ok(report.perJourney[0].problems.some((p) => p.includes("step 7") || p.includes("did not hold")), JSON.stringify(report.perJourney[0].problems));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("forged restart evidence (one pid on both sides) fails", () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "restart-verdict-forged-"));
  try {
    const run = path.join(work, "run");
    writeRun(run, [
      step(0, "signin"),
      step(1, "visit"),
      step(2, "observe"),
      step(3, "fresh_session"),
      step(4, "restart", "ok", { restart: { previousPid: 200, pid: 200, bootMs: 1 } }),
      step(5, "visit"),
      step(6, "observe"),
      step(7, "assert"),
    ]);
    const report = gradeRestartPersistence({ run, journeysFile: withDefinition(work), candidate: CANDIDATE });
    assert.equal(report.verdict, "fail");
    assert.ok(report.perJourney[0].problems.some((p) => p.includes("one pid")), JSON.stringify(report.perJourney[0].problems));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("dirty provenance or a build receipt from another commit fails closed", () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "restart-verdict-provenance-"));
  try {
    const run = path.join(work, "run");
    const steps = [
      step(0, "signin"),
      step(1, "visit"),
      step(2, "observe"),
      step(3, "fresh_session"),
      step(4, "restart", "ok", { restart: { previousPid: 100, pid: 200, bootMs: 512 } }),
      step(5, "visit"),
      step(6, "observe"),
      step(7, "assert"),
    ];
    writeRun(run, steps, { dirty: true, buildCommit: "b".repeat(40) });
    const report = gradeRestartPersistence({ run, journeysFile: withDefinition(work), candidate: CANDIDATE });
    assert.equal(report.verdict, "fail");
    assert.ok(report.problems.some((p) => p.includes("dirty tree")));
    assert.ok(report.problems.some((p) => p.includes("build receipt names commit")));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("a missing result and an unexpected result are named", () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "restart-verdict-missing-"));
  try {
    const run = path.join(work, "run");
    mkdirSync(run, { recursive: true });
    writeFileSync(path.join(run, "stranger.json"), JSON.stringify({ id: "stranger", steps: [] }));
    writeFileSync(path.join(run, "run-meta.json"), JSON.stringify({ provenance: { source: { commit: CANDIDATE, dirty: false }, buildReceipt: { sourceCommit: CANDIDATE } } }));
    const report = gradeRestartPersistence({ run, journeysFile: withDefinition(work), candidate: CANDIDATE });
    assert.equal(report.verdict, "fail");
    assert.ok(report.perJourney[0].problems.includes("no run result"));
    assert.ok(report.problems.some((p) => p.includes("unexpected run result: stranger")));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
