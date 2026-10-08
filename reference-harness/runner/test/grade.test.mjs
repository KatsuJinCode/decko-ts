// The grader refuses what is not a grade and fails what wrote during reads.
// Each case is a negative control: a positive run, then one fault injected,
// and the verdict that fault must produce.
//
//   node --test reference-harness/runner/test/

import assert from "node:assert/strict";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { gradeRun } from "../grade-lib.mjs";
import { writeExpectedManifest } from "../manifest.mjs";
import { HARNESS, copyDir, gradeCli, makeCapturedFixture, readJson, runFake, scratch, writeJson } from "./helpers.mjs";

let tmp;
let fixture;
let expected;
let good; // a clean, complete actual run

before(() => {
  tmp = scratch();
  ({ fixture, expected } = makeCapturedFixture(tmp.dir));
  good = path.join(tmp.dir, "good");
  const r = runFake(fixture, good);
  assert.equal(r.status, 0, r.stderr);
});
after(() => tmp.cleanup());

let n = 0;
/** A fresh copy of the clean run to tamper with. */
const copyGood = () => copyDir(good, path.join(tmp.dir, `case-${++n}`));
const grade = (actual, opts = {}) => gradeRun({ fixture, actual, ...opts });
const metaOf = (dir) => path.join(dir, "run-meta.json");

describe("positive control", () => {
  it("a complete run of an engine that matches passes, exit 0", () => {
    const report = grade(good);
    assert.deepEqual(report.problems, []);
    assert.equal(report.verdict, "pass");
    for (const k of ["rendering", "semantics", "persistence", "side_effects"]) assert.equal(report.summary[k].fail, 0, k);
    assert.equal(report.summary.rendering.graded, 4); // 3 renders + 1 render after a write
    assert.equal(report.read_writes.graded, 4); // two read sessions, a render step and a sign-in step
    assert.equal(report.read_writes.pass, 4);
    assert.equal(gradeCli(["--fixture", fixture, "--actual", good]).status, 0);
  });

  it("a real rendering difference fails, exit 1", () => {
    const dir = path.join(tmp.dir, "wrong-html");
    assert.equal(runFake(fixture, dir, { mode: "wrong-html:Beta" }).status, 0);
    const report = grade(dir);
    assert.equal(report.verdict, "fail");
    assert.equal(report.summary.rendering.fail, 1);
    assert.equal(gradeCli(["--fixture", fixture, "--actual", dir]).status, 1);
  });
});

describe("mutations during reads (finding 12)", () => {
  it("rows written by a read session fail the grade even when every answer matches", () => {
    const dir = path.join(tmp.dir, "read-writes");
    assert.equal(runFake(fixture, dir, { mode: "read-writes" }).status, 0);
    const report = grade(dir);
    assert.equal(report.summary.rendering.fail, 0, "the answers themselves still match");
    assert.equal(report.verdict, "fail");
    assert.deepEqual(report.read_writes.failures.map((f) => f.id), ["render session", "create-then-render#2"]);
    assert.ok(report.read_writes.failures[0].differences.some((d) => d.path === "/cards" && d.actual.inserted.length > 0));
    const cli = gradeCli(["--fixture", fixture, "--actual", dir]);
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /render session: wrote rows the oracle did not/);
  });

  it("rows written by a read step inside a write scenario fail the grade", () => {
    const dir = path.join(tmp.dir, "step-read-writes");
    assert.equal(runFake(fixture, dir, { mode: "step-read-writes" }).status, 0);
    const report = grade(dir);
    assert.equal(report.verdict, "fail");
    assert.deepEqual(report.read_writes.failures.map((f) => f.id), ["create-then-render#2"]);
  });

  it("an injected read-session write in the recorded metadata fails the grade", () => {
    const dir = copyGood();
    const meta = readJson(metaOf(dir));
    meta.runs.semantics.session_writes = { cards: { inserted: [{ id: 999999, name: "Unexpected read write" }], updated: [], deleted: [] } };
    writeJson(metaOf(dir), meta);
    const report = grade(dir);
    assert.equal(report.verdict, "fail");
    assert.deepEqual(report.read_writes.failures.map((f) => f.id), ["semantics session"]);
  });

  it("the reviewer's control (expected outputs copied, a read write added, nothing else) is not a pass", () => {
    const dir = copyDir(expected, path.join(tmp.dir, "reviewer"));
    rmSync(path.join(dir, "MANIFEST.json"));
    writeJson(metaOf(dir), {
      render_session_row_changes: { cards: { inserted: [{ id: 999999, name: "Unexpected read write" }] } },
      semantics_session_row_changes: {},
    });
    const report = grade(dir);
    assert.equal(report.verdict, "invalid");
    assert.notEqual(gradeCli(["--fixture", fixture, "--actual", dir]).status, 0);
  });
});

describe("missing or incomplete metadata (finding 12)", () => {
  it("no run-meta.json is not a grade, exit 2", () => {
    const dir = copyGood();
    rmSync(metaOf(dir));
    assert.equal(grade(dir).verdict, "invalid");
    const cli = gradeCli(["--fixture", fixture, "--actual", dir]);
    assert.equal(cli.status, 2);
    assert.match(cli.stdout, /NOT A GRADE/);
    assert.doesNotMatch(cli.stdout, /rendering\s+\d/, "no pass rate is printed for an invalid run");
  });

  for (const [kind, field] of [["render", "session_writes"], ["semantics", "session_writes"], ["render", "engine"], ["scenarios", "fixture_digest"], ["semantics", "finished"]]) {
    it(`a ${kind} run record without ${field} is not a grade`, () => {
      const dir = copyGood();
      const meta = readJson(metaOf(dir));
      delete meta.runs[kind][field];
      writeJson(metaOf(dir), meta);
      const report = grade(dir);
      assert.equal(report.verdict, "invalid");
      assert.ok(report.problems.some((p) => p.includes(`${kind} run record lacks ${field}`)), report.problems.join("\n"));
    });
  }

  it("results in an older format are not a grade", () => {
    const dir = copyGood();
    const meta = readJson(metaOf(dir));
    meta.results_format = 1;
    writeJson(metaOf(dir), meta);
    assert.equal(grade(dir).verdict, "invalid");
  });

  it("kinds answered by different engine versions are not a grade", () => {
    const dir = copyGood();
    const other = path.join(tmp.dir, "v2");
    assert.equal(runFake(fixture, other, { version: 2, extraArgs: ["--kinds", "semantics"] }).status, 0);
    for (const f of ["semantics.jsonl"]) writeFileSync(path.join(dir, f), readFileSync(path.join(other, f)));
    const meta = readJson(metaOf(dir));
    meta.runs.semantics = readJson(metaOf(other)).runs.semantics;
    writeJson(metaOf(dir), meta);
    const report = grade(dir);
    assert.equal(report.verdict, "invalid");
    assert.ok(report.problems.some((p) => p.includes("different adapters, engines or commits")));
  });
});

describe("fixture identity (finding 12)", () => {
  it("results recorded on another fixture digest are not a grade", () => {
    const dir = copyGood();
    const meta = readJson(metaOf(dir));
    meta.runs.render.fixture_digest = "0".repeat(64);
    writeJson(metaOf(dir), meta);
    const report = grade(dir);
    assert.equal(report.verdict, "invalid");
    assert.ok(report.problems.some((p) => p.includes("render was run on fixture digest")));
  });

  it("results naming another fixture are not a grade", () => {
    const dir = copyGood();
    const meta = readJson(metaOf(dir));
    meta.fixture = "synthetic-v1";
    writeJson(metaOf(dir), meta);
    assert.equal(grade(dir).verdict, "invalid");
  });

  it("a fixture changed after its manifest is not a grade", () => {
    const t = scratch();
    try {
      const c = makeCapturedFixture(t.dir);
      const actual = path.join(t.dir, "actual");
      assert.equal(runFake(c.fixture, actual).status, 0);
      assert.equal(gradeRun({ fixture: c.fixture, actual }).verdict, "pass");
      appendFileSync(path.join(c.fixture, "ops", "render.jsonl"), "");
      writeFileSync(path.join(c.fixture, "deck.json"), readFileSync(path.join(c.fixture, "deck.json"), "utf8").replace("deck.example", "deck.example.org"));
      const report = gradeRun({ fixture: c.fixture, actual });
      assert.equal(report.verdict, "invalid");
      assert.ok(report.problems.some((p) => p.includes("fixture file changed since its manifest: deck.json")));
    } finally {
      t.cleanup();
    }
  });

  it("a run on a fixture that did not match its manifest is not a grade", () => {
    const dir = copyGood();
    const meta = readJson(metaOf(dir));
    meta.runs.scenarios.fixture_problems = ["fixture file changed since its manifest: deck.json"];
    writeJson(metaOf(dir), meta);
    assert.equal(grade(dir).verdict, "invalid");
  });

  it("expected outputs changed after their manifest are not a grade", () => {
    const t = scratch();
    try {
      const c = makeCapturedFixture(t.dir);
      const actual = path.join(t.dir, "actual");
      assert.equal(runFake(c.fixture, actual).status, 0);
      appendFileSync(path.join(c.expected, "semantics.jsonl"), "");
      writeFileSync(path.join(c.expected, "semantics.jsonl"), readFileSync(path.join(c.expected, "semantics.jsonl"), "utf8").replace("card:Alpha", "card:Alpha2"));
      const report = gradeRun({ fixture: c.fixture, actual });
      assert.equal(report.verdict, "invalid");
      assert.ok(report.problems.some((p) => p.includes("expected: file changed since its manifest: semantics.jsonl")));
    } finally {
      t.cleanup();
    }
  });
});

describe("incomplete runs (finding 12)", () => {
  it("an adapter that dies mid-run leaves a run the grader refuses", () => {
    const dir = path.join(tmp.dir, "crash");
    const r = runFake(fixture, dir, { mode: "crash-after:2" });
    assert.notEqual(r.status, 0, "the runner reports the crash");
    const meta = readJson(metaOf(dir));
    assert.equal(meta.runs.render.complete, false);
    const report = grade(dir);
    assert.equal(report.verdict, "invalid");
    assert.ok(report.problems.some((p) => p.includes("render run did not complete")));
  });

  it("a missing result line is not a grade", () => {
    const dir = copyGood();
    const file = path.join(dir, "render.jsonl");
    const lines = readFileSync(file, "utf8").trim().split("\n");
    writeFileSync(file, lines.slice(1).join("\n") + "\n");
    const report = grade(dir);
    assert.equal(report.verdict, "invalid");
    assert.ok(report.problems.some((p) => p.includes("1 of 3 render operations have no result")));
  });

  it("a scenario with fewer steps than the fixture is not a grade", () => {
    const dir = copyGood();
    const file = path.join(dir, "scenarios.jsonl");
    const rows = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    rows[0].steps.pop();
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    assert.equal(grade(dir).verdict, "invalid");
  });

  it("a duplicated or unknown result id is not a grade", () => {
    const dup = copyGood();
    const file = path.join(dup, "semantics.jsonl");
    const first = readFileSync(file, "utf8").split("\n")[0];
    appendFileSync(file, first + "\n");
    assert.equal(grade(dup).verdict, "invalid");
    const unknown = copyGood();
    appendFileSync(path.join(unknown, "semantics.jsonl"), JSON.stringify({ id: "card:anonymous:Zeta", result: {} }) + "\n");
    assert.equal(grade(unknown).verdict, "invalid");
  });

  it("a filtered run is not a grade; --allow-partial grades it as partial, never pass", () => {
    const dir = path.join(tmp.dir, "limited");
    assert.equal(runFake(fixture, dir, { extraArgs: ["--limit", "1"] }).status, 0);
    assert.equal(grade(dir).verdict, "invalid");
    const report = grade(dir, { allowPartial: true });
    assert.equal(report.verdict, "partial");
    assert.equal(report.summary.rendering.graded, 2); // one render, one render step
    assert.equal(gradeCli(["--fixture", fixture, "--actual", dir, "--allow-partial"]).status, 2);
  });

  it("a run of only some kinds is not a grade", () => {
    const dir = path.join(tmp.dir, "render-only");
    assert.equal(runFake(fixture, dir, { extraArgs: ["--kinds", "render"] }).status, 0);
    const report = grade(dir);
    assert.equal(report.verdict, "invalid");
    assert.ok(report.problems.some((p) => p.includes("semantics: not run")));
  });
});

describe("stock and patched oracle expectations (finding 13)", () => {
  it("the stock oracle's outputs name their variant and list no patches", () => {
    const m = readJson(path.join(expected, "MANIFEST.json"));
    assert.equal(m.oracle.variant, "stock");
    assert.deepEqual(m.oracle.patches, []);
    assert.equal(grade(good).oracle.variant, "stock");
  });

  it("a patched variant is graded only from its own directory and is labelled", () => {
    const variantDir = copyDir(expected, path.join(fixture, "expected-patched", "demo-fix"));
    writeExpectedManifest(fixture, variantDir, { variant: "demo-fix", patches: [{ id: "demo-fix", what: "a test patch" }] });
    const report = grade(good, { expected: variantDir });
    assert.equal(report.verdict, "pass");
    assert.equal(report.oracle.variant, "demo-fix");
    const cli = gradeCli(["--fixture", fixture, "--actual", good, "--expected", variantDir]);
    assert.match(cli.stdout, /PATCHED ORACLE "demo-fix"/);
    rmSync(path.join(fixture, "expected-patched"), { recursive: true, force: true });
  });

  it("a stock manifest that lists patches, or a patched one stored as expected/, is refused", () => {
    assert.throws(() => writeExpectedManifest(fixture, expected, { variant: "stock", patches: [{ id: "x" }] }));
    assert.throws(() => writeExpectedManifest(fixture, expected, { variant: "demo-fix", patches: [] }));
    const t = scratch();
    try {
      const c = makeCapturedFixture(t.dir);
      const m = readJson(path.join(c.expected, "MANIFEST.json"));
      m.oracle = { ...m.oracle, variant: "demo-fix", patches: [{ id: "demo-fix" }] };
      writeJson(path.join(c.expected, "MANIFEST.json"), m);
      const actual = path.join(t.dir, "actual");
      assert.equal(runFake(c.fixture, actual).status, 0);
      const report = gradeRun({ fixture: c.fixture, actual });
      assert.equal(report.verdict, "invalid");
      assert.ok(report.problems.some((p) => p.includes("holds the stock oracle only")));
    } finally {
      t.cleanup();
    }
  });

  it("expected outputs without a manifest are not a reference", () => {
    const t = scratch();
    try {
      const c = makeCapturedFixture(t.dir);
      rmSync(path.join(c.expected, "MANIFEST.json"));
      const actual = path.join(t.dir, "actual");
      assert.equal(runFake(c.fixture, actual).status, 0);
      assert.equal(gradeRun({ fixture: c.fixture, actual }).verdict, "invalid");
    } finally {
      t.cleanup();
    }
  });
});

describe("synthetic-v1: the reviewer's controls on the published fixture", () => {
  const real = path.join(HARNESS, "fixtures", "synthetic-v1");

  it("its expected outputs with the reviewer's run-meta.json are not a grade", () => {
    const t = scratch();
    try {
      const dir = copyDir(path.join(real, "expected"), path.join(t.dir, "reviewer"));
      rmSync(path.join(dir, "MANIFEST.json"));
      writeJson(metaOf(dir), {
        render_session_row_changes: { cards: { inserted: [{ id: 999999, name: "Unexpected read write" }] } },
        semantics_session_row_changes: {},
      });
      const cli = gradeCli(["--fixture", real, "--actual", dir]);
      assert.equal(cli.status, 2);
      assert.match(cli.stdout, /NOT A GRADE/);
    } finally {
      t.cleanup();
    }
  });

  it("its expected outputs with a complete record plus one read write fail, exit 1", () => {
    const t = scratch();
    try {
      const dir = copyDir(path.join(real, "expected"), path.join(t.dir, "read-write"));
      const meta = readJson(metaOf(dir));
      meta.runs.render.session_writes = { cards: { inserted: [{ id: 999999, name: "Unexpected read write" }], updated: [], deleted: [] } };
      writeJson(metaOf(dir), meta);
      const cli = gradeCli(["--fixture", real, "--actual", dir]);
      assert.equal(cli.status, 1);
      assert.match(cli.stdout, /rendering\s+1754 \/ 1754/);
      assert.match(cli.stdout, /render session: wrote rows the oracle did not/);
      assert.match(cli.stdout, /verdict: fail/);
    } finally {
      t.cleanup();
    }
  });
});
