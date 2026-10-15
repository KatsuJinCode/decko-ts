#!/usr/bin/env node
// Compares two engines' journey results item by item.
//
//   node reference-harness/browser/compare-journeys.mjs --expected <rubyDir> --actual <tsDir> [--report report.json]
//
// Items per journey:
//   - completion: every step ran on both engines (a step that fails on the
//     reference is a broken journey and is reported, not graded);
//   - each observation, on four aspects: address (URL and HTTP status), text
//     (what the page says), structure (its element tree) and fields (the form
//     controls offered);
//   - editor: which editor (tinymce, ace or the plain field) took each
//     editor step's content;
//   - mail: the messages sent;
//   - rows: the row delta left in Decko's card tables.
// A journey passes when every item passes. Failures are grouped by cause: the
// first difference of each failing item, reduced to its shape.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stable } from "../runner/normalize.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
}

const load = (dir) =>
  Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("run-meta"))
      .map((f) => {
        const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
        return [r.id, r];
      }),
  );

const eq = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function firstTextDiff(a, b) {
  const wa = String(a).split(" ");
  const wb = String(b).split(" ");
  let i = 0;
  while (i < wa.length && i < wb.length && wa[i] === wb[i]) i++;
  const ctx = (w) => w.slice(Math.max(0, i - 4), i + 8).join(" ");
  return { at: i, expected: ctx(wa), actual: ctx(wb) };
}

function firstLineDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { at: i, expected: a[i] ?? "(end)", actual: b[i] ?? "(end)" };
}

function rowSummary(rows) {
  const out = {};
  for (const [t, d] of Object.entries(rows ?? {})) out[t] = `+${d.inserted.length} ~${d.updated.length} -${d.deleted.length}`;
  return out;
}

const args = parseArgs(process.argv.slice(2));
const expected = load(args.expected);
const actual = existsSync(args.actual) ? load(args.actual) : {};
const items = [];
const journeys = [];

for (const [id, exp] of Object.entries(expected)) {
  const act = actual[id];
  const jItems = [];
  const add = (kind, label, pass, detail) => {
    const item = { journey: id, kind, label, pass, ...(pass ? {} : { detail }) };
    jItems.push(item);
    items.push(item);
  };
  if (!exp.completed) {
    journeys.push({ id, status: "reference-broken", detail: exp.steps?.find((s) => s.outcome === "failed") ?? exp.error });
    continue;
  }
  if (!act) {
    journeys.push({ id, status: "not-run" });
    continue;
  }
  const failedStep = act.steps?.find((s) => s.outcome === "failed");
  add("completion", "all steps", act.completed, failedStep ? { step: failedStep.i, do: failedStep.step, error: failedStep.error } : { error: act.error });
  // Which editor took each editor step's content (tinymce, ace, plain).
  const vias = (r) => (r.steps ?? []).filter((s) => "editor" in s.step).map((s) => s.via ?? "(not recorded)");
  if (vias(exp).length > 0) add("editor", "editor used", eq(vias(exp), vias(act)), { expected: vias(exp), actual: vias(act) });
  const actObs = Object.fromEntries((act.observations ?? []).map((o) => [o.label, o]));
  for (const o of exp.observations ?? []) {
    const a = actObs[o.label];
    if (!a) {
      for (const k of ["address", "text", "structure", "fields"]) add(k, o.label, false, { missing: "not reached" });
      continue;
    }
    add("address", o.label, o.url === a.url && o.status === a.status, { expected: `${o.status} ${o.url}`, actual: `${a.status} ${a.url}` });
    add("text", o.label, o.text === a.text, firstTextDiff(o.text, a.text));
    add("structure", o.label, eq(o.structure, a.structure), firstLineDiff(o.structure, a.structure));
    add("fields", o.label, eq(o.fields, a.fields), { expected: o.fields, actual: a.fields });
  }
  add("mail", "mail", eq(exp.mail ?? [], act.mail ?? []), {
    expected: (exp.mail ?? []).map((m) => `${m.to.join(",")}: ${m.subject}`),
    actual: (act.mail ?? []).map((m) => `${m.to.join(",")}: ${m.subject}`),
  });
  add("rows", "rows", eq(exp.rows ?? {}, act.rows ?? {}), { expected: rowSummary(exp.rows), actual: rowSummary(act.rows) });
  journeys.push({ id, status: jItems.every((i) => i.pass) ? "pass" : "fail", failed: jItems.filter((i) => !i.pass).map((i) => `${i.kind}:${i.label}`) });
}

const kinds = {};
for (const it of items) {
  kinds[it.kind] ??= { pass: 0, total: 0 };
  kinds[it.kind].total++;
  if (it.pass) kinds[it.kind].pass++;
}
// A failure's cause: its kind and the shape of its first difference.
function causeOf(it) {
  const d = it.detail ?? {};
  const shape = (s) => String(s ?? "").replace(/\d+/g, "N").replace(/"[^"]*"/g, '"…"').slice(0, 100);
  switch (it.kind) {
    case "completion":
      return `step failed: ${Object.keys(d.do ?? {})[0] ?? "?"} ${shape(JSON.stringify(Object.values(d.do ?? {})[0]))} - ${shape(d.error)}`;
    case "address":
      return d.missing ? "observation not reached" : `address: ${shape(d.expected)} vs ${shape(d.actual)}`;
    case "rows":
      return `rows: ${shape(JSON.stringify(d.expected))} vs ${shape(JSON.stringify(d.actual))}`;
    case "mail":
      return `mail: ${(d.expected ?? []).length} vs ${(d.actual ?? []).length} messages`;
    default:
      return d.missing ? "observation not reached" : `${it.kind} differs`;
  }
}
const causes = {};
for (const it of items.filter((i) => !i.pass)) {
  const c = causeOf(it);
  (causes[c] ??= []).push(`${it.journey} / ${it.label}`);
}

const graded = journeys.filter((j) => j.status === "pass" || j.status === "fail");
const report = {
  journeys: { pass: graded.filter((j) => j.status === "pass").length, graded: graded.length, total: journeys.length },
  kinds,
  perJourney: journeys,
  causes: Object.entries(causes).sort((a, b) => b[1].length - a[1].length).map(([cause, where]) => ({ cause, count: where.length, where })),
  failures: items.filter((i) => !i.pass),
};
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 1));

console.log(`journeys: ${report.journeys.pass} / ${report.journeys.graded} pass (${journeys.length - graded.length} not graded)`);
for (const [k, v] of Object.entries(kinds)) console.log(`  ${k.padEnd(10)} ${v.pass} / ${v.total}`);
for (const j of journeys) if (j.status !== "pass") console.log(`  ${j.status.padEnd(16)} ${j.id}${j.failed ? "  " + j.failed.join(", ") : ""}`);
console.log("causes:");
for (const c of report.causes) console.log(`  ${String(c.count).padStart(3)}  ${c.cause}`);
