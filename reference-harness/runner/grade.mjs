#!/usr/bin/env node
// Grades an engine's recorded results against a fixture's reference outputs,
// on the four parity kinds: rendering, semantics, persistence, side effects.
//
//   node reference-harness/runner/grade.mjs --fixture <fixtureDir> \
//        --actual <resultsDir> [--report <report.json>]
//
// Exit status 0 when every graded item matches, 1 otherwise.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { normalizeHtml, normalizeWriteResult, stable } from "./normalize.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (i % 2 === 0 ? [...acc, [v.replace(/^--/, ""), a[i + 1]]] : acc), []),
);
const fixture = path.resolve(args.fixture);
const actualDir = path.resolve(args.actual);
const expectedDir = path.join(fixture, "expected");

// A results file may be stored gzipped (<name>.jsonl.gz), as the large
// reference outputs are.
const readText = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
    : existsSync(file + ".gz")
      ? gunzipSync(readFileSync(file + ".gz")).toString("utf8")
      : "";
const readLines = (file) =>
  readText(file).split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

const KINDS = ["rendering", "semantics", "persistence", "side_effects"];
const tally = Object.fromEntries(KINDS.map((k) => [k, { graded: 0, pass: 0, fail: 0, oracle_errors: 0, missing: 0, groups: {} }]));
const failures = Object.fromEntries(KINDS.map((k) => [k, []]));

function firstDifference(a, b) {
  const sa = typeof a === "string" ? a : JSON.stringify(stable(a));
  const sb = typeof b === "string" ? b : JSON.stringify(stable(b));
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  return { at: i, expected: sa.slice(Math.max(0, i - 60), i + 120), actual: sb.slice(Math.max(0, i - 60), i + 120) };
}

/** Grades one item. `expected`/`actual` are already normalised values, or
 *  undefined when the recorded line carried an adapter error instead. */
function grade(kind, group, id, exp, act) {
  const t = tally[kind];
  t.groups[group] ??= { graded: 0, pass: 0 };
  if (exp.error) {
    t.oracle_errors++;
    return;
  }
  t.graded++;
  t.groups[group].graded++;
  if (act === undefined) {
    t.missing++;
    t.fail++;
    failures[kind].push({ id, group, reason: "no result recorded" });
    return;
  }
  if (act.error) {
    t.fail++;
    failures[kind].push({ id, group, reason: `adapter error ${act.error.class}: ${act.error.message}` });
    return;
  }
  const a = JSON.stringify(stable(exp.value));
  const b = JSON.stringify(stable(act.value));
  if (a === b) {
    t.pass++;
    t.groups[group].pass++;
  } else {
    t.fail++;
    failures[kind].push({ id, group, reason: "differs", diff: firstDifference(exp.value, act.value) });
  }
}

const wrap = (line, norm) => (line === undefined ? undefined : line.error ? { error: line.error } : { value: norm(line.result) });
const renderNorm = (r) => (r && typeof r === "object" ? { ...r, html: normalizeHtml(r.html) } : r);
const ident = (r) => r;

// ---- read operations ------------------------------------------------------------
const renderActual = byId(readLines(path.join(actualDir, "render.jsonl")));
for (const exp of readLines(path.join(expectedDir, "render.jsonl"))) {
  const [view, actor] = exp.id.split(":");
  grade("rendering", `${view === "page" ? "page" : "view"} / ${actor}`, exp.id, wrap(exp, renderNorm), wrap(renderActual.get(exp.id), renderNorm));
}
const semActual = byId(readLines(path.join(actualDir, "semantics.jsonl")));
for (const exp of readLines(path.join(expectedDir, "semantics.jsonl"))) {
  grade("semantics", exp.id.split(":")[0], exp.id, wrap(exp, ident), wrap(semActual.get(exp.id), ident));
}

// ---- write scenarios: each step graded on the kinds it exercises --------------
const scenarioOps = new Map(
  JSON.parse(readFileSync(path.join(fixture, "ops", "scenarios.json"), "utf8")).scenarios.map((s) => [s.id, s]),
);
const scenActual = byId(readLines(path.join(actualDir, "scenarios.jsonl")));
for (const exp of readLines(path.join(expectedDir, "scenarios.jsonl"))) {
  const ops = scenarioOps.get(exp.id).steps;
  const act = scenActual.get(exp.id);
  exp.steps.forEach((step, i) => {
    const op = ops[i];
    const id = `${exp.id}#${i + 1}`;
    const actStep = act?.steps?.[i];
    if (op.op === "render") {
      grade("rendering", "after write", id, wrap(step, renderNorm), wrap(actStep, renderNorm));
    } else if (op.op === "ask") {
      grade("semantics", "after write", id, wrap(step, ident), wrap(actStep, ident));
    } else {
      // A write's or sign-in's answer is its side effect: saved or refused,
      // the errors shown, the mail sent, the identity signed in.
      grade("side_effects", op.op === "signin" ? "sign-in" : `write ${op.action}`, id, wrap(step, normalizeWriteResult), wrap(actStep, normalizeWriteResult));
    }
    if (op.op === "write") {
      const rows = (s) => (s === undefined ? undefined : { value: s.rows ?? {} });
      grade("persistence", `write ${op.action}`, id, rows(step), rows(actStep));
    } else if (step.rows && Object.keys(step.rows).length > 0) {
      // A read that wrote rows in the oracle is itself graded as persistence.
      grade("persistence", "read side writes", id, { value: step.rows }, actStep ? { value: actStep.rows ?? {} } : undefined);
    }
  });
}

// ---- report ------------------------------------------------------------------------
const summary = Object.fromEntries(
  KINDS.map((k) => [k, { ...tally[k], rate: tally[k].graded ? +(tally[k].pass / tally[k].graded * 100).toFixed(2) : null }]),
);
const report = { fixture: path.basename(fixture), actual: actualDir, graded_at: new Date().toISOString(), summary, failures };
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");
for (const k of KINDS) {
  const s = summary[k];
  console.log(`${k.padEnd(13)} ${String(s.pass).padStart(5)} / ${String(s.graded).padEnd(5)} ${s.rate === null ? "-" : s.rate + "%"}` +
    (s.oracle_errors ? `  (${s.oracle_errors} oracle errors not graded)` : ""));
  for (const [g, v] of Object.entries(s.groups)) console.log(`    ${g.padEnd(24)} ${v.pass} / ${v.graded}`);
}
process.exit(KINDS.every((k) => summary[k].fail === 0) ? 0 : 1);
