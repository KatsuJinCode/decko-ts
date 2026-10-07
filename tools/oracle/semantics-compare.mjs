// semantics-compare.mjs -- diff two semantics answer files.
//
// Scoring is at ITEM level, not question level: a question whose answer is a
// list of 47,235 cards scores as 47,235 items, so a single naming or
// permission difference cannot hide inside a bulk question's pass mark.
//
// A list of records is compared record by record (deep equality per index);
// a list of scalars is compared for membership and for order separately,
// because "the wrong cards" and "the right cards in the wrong order" are
// different bugs. An object answer scores one item per top-level key.
//
// usage: node semantics-compare.mjs <answers-ruby.json> <answers-ts.json> <questions.json> <out.json>

import { readFileSync, writeFileSync } from "node:fs";

const [rubyPath, tsPath, questionsPath, outPath] = process.argv.slice(2);
const ruby = JSON.parse(readFileSync(rubyPath, "utf8")).answers;
const ts = JSON.parse(readFileSync(tsPath, "utf8")).answers;
const questions = JSON.parse(readFileSync(questionsPath, "utf8")).questions;

// NORMALISATIONS (every one is listed in the report):
//  1. Boolean storage form. The capture deck stores boolean columns as SQLite
//     integers; ActiveRecord on that schema hands back 0/1 for `trash?`, the
//     TS record hands back false/true. 0 == false and 1 == true, nothing else.
//  2. Absent vs null. A key one engine omits and the other sets to null is the
//     same answer ("no value").
// Nothing else is masked. Ids are compared.
function norm(v) {
  if (v === 0 || v === false) return false;
  if (v === 1 || v === true) return true;
  if (v === undefined) return null;
  return v;
}

function isErr(v) {
  return typeof v === "string" && v.startsWith("ERR:");
}

/** Collect leaf differences between a and b into diffs. */
function diffDeep(path, a, b, diffs) {
  const isObjA = a !== null && typeof a === "object";
  const isObjB = b !== null && typeof b === "object";
  if (!isObjA || !isObjB) {
    if (norm(a) !== norm(b)) {
      diffs.push({ path, ruby: a ?? null, ts: b ?? null, class: isErr(a) || isErr(b) ? "error-mismatch" : "value" });
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const scalarList = a.concat(b).every((x) => x === null || typeof x !== "object");
    if (scalarList) {
      const d = compareScalarList(path, a, b);
      if (d) diffs.push(d);
      return;
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diffDeep(`${path}.${i}`, a[i], b[i], diffs);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    diffs.push({ path, ruby: a, ts: b, class: "shape" });
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) diffDeep(`${path}.${k}`, a[k], b[k], diffs);
}

function compareScalarList(path, a, b) {
  if (a.length === b.length && a.every((v, i) => norm(v) === norm(b[i]))) return null;
  const setA = new Set(a.map(String));
  const setB = new Set(b.map(String));
  const onlyA = [...setA].filter((x) => !setB.has(x));
  const onlyB = [...setB].filter((x) => !setA.has(x));
  let firstDiff = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { firstDiff = i; break; }
  }
  return {
    path,
    class: onlyA.length === 0 && onlyB.length === 0 ? "order" : "membership",
    rubyLen: a.length,
    tsLen: b.length,
    firstDiffIndex: firstDiff,
    rubyAt: firstDiff >= 0 ? a[firstDiff] ?? null : null,
    tsAt: firstDiff >= 0 ? b[firstDiff] ?? null : null,
    onlyInRubyCount: onlyA.length,
    onlyInTsCount: onlyB.length,
    onlyInRuby: onlyA.slice(0, 20),
    onlyInTs: onlyB.slice(0, 20),
  };
}

const results = [];
let totalItems = 0;
let passedItems = 0;

for (const question of questions) {
  const id = String(question.id);
  const a = ruby[id];
  const b = ts[id];
  if (a === undefined || b === undefined) {
    results.push({
      id: Number(id), category: question.category, kind: question.kind,
      items: 0, passed: 0, status: "missing",
      note: a === undefined ? "no ruby answer" : "no typescript answer",
    });
    continue;
  }

  const diffs = [];
  diffDeep(id, a, b, diffs);

  let items;
  let itemFailures;
  const scalarList = Array.isArray(a) && a.every((x) => x === null || typeof x !== "object");
  if (scalarList) {
    // Membership: every element is an item. Order: one extra item.
    items = Math.max(a.length, Array.isArray(b) ? b.length : 0) + 1;
    const d = diffs[0];
    itemFailures = d === undefined ? 0
      : d.class === "order" ? 1
      : d.class === "membership" ? d.onlyInRubyCount + d.onlyInTsCount + (d.firstDiffIndex >= 0 ? 1 : 0)
      : items;
    itemFailures = Math.min(items, itemFailures);
  } else if (Array.isArray(a)) {
    items = Math.max(a.length, Array.isArray(b) ? b.length : 0);
    const bad = new Set();
    for (const d of diffs) {
      const m = /^(\d+)/.exec(d.path.slice(id.length + 1));
      bad.add(m === null ? -1 : Number(m[1]));
    }
    itemFailures = bad.has(-1) ? items : bad.size;
  } else if (a !== null && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...(b && typeof b === "object" ? Object.keys(b) : [])]);
    items = keys.size;
    const bad = new Set(diffs.map((d) => d.path.slice(id.length + 1).split(".")[0]));
    itemFailures = bad.size;
  } else {
    items = 1;
    itemFailures = diffs.length > 0 ? 1 : 0;
  }

  const passed = Math.max(0, items - itemFailures);
  totalItems += items;
  passedItems += passed;
  results.push({
    id: Number(id), category: question.category, kind: question.kind,
    items, passed, status: diffs.length === 0 ? "pass" : "fail",
    diffCount: diffs.length, diffs: diffs.slice(0, 400),
  });
}

const byCategory = {};
for (const r of results) {
  const c = (byCategory[r.category] ??= { items: 0, passed: 0, questions: 0, failing: 0, missing: 0 });
  c.questions += 1;
  if (r.status === "missing") { c.missing += 1; continue; }
  c.items += r.items;
  c.passed += r.passed;
  if (r.status === "fail") c.failing += 1;
}

const summary = {
  passRate: totalItems === 0 ? 0 : passedItems / totalItems,
  passedItems, totalItems,
  questions: results.length,
  failingQuestions: results.filter((r) => r.status === "fail").length,
  missingQuestions: results.filter((r) => r.status === "missing").length,
  byCategory,
};
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 1));
process.stdout.write(
  `SEMANTICS ${passedItems}/${totalItems} items (${(summary.passRate * 100).toFixed(2)}%), ` +
    `${summary.failingQuestions}/${summary.questions} questions failing, ${summary.missingQuestions} missing\n`,
);
for (const [cat, c] of Object.entries(byCategory)) {
  process.stdout.write(
    `  ${cat}: ${c.passed}/${c.items} (${c.questions} questions, ${c.failing} failing, ${c.missing} missing)\n`,
  );
}
