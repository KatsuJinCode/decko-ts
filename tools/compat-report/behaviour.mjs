// behaviour.mjs — the behavioural layer of the mod compatibility report.
//
// The declaration layer (generate-mod-compat-report.mjs) asks whether a mod's
// view NAMES exist in the engine. This layer asks whether each view and event
// a mod declares is EXERCISED, and whether what was exercised matched Ruby.
//
// Evidence, per declaration, in the order it is consulted:
//
//   graded   — an operation of a reference-harness fixture (synthetic-v1,
//              synthetic-v2) renders a view of that name, and the grade of
//              record says whether every such operation was byte-identical to
//              the oracle's captured answer (after the grader's N1-N8 rules).
//   pinned   — no graded operation renders it, but one of the mod's own test
//              files (tests/card/mod-loader/<mod>*.test.ts) names the view in
//              a string literal and that file carries toBe('<literal>') pins.
//   named    — (events only) a test file anywhere under tests/ names the
//              event in a string literal or symbol.
//   unexercised — none of the above.
//
// Attribution is by NAME, and that is the stated limit of this layer: a
// graded operation names a view, not the set module whose definition Ruby
// chose for that card, so when two mods declare the same view name an
// operation is credited to both. Page operations (no view) are credited to no
// mod-specific view. All fixture operations render the html format; a view a
// mod declares in base format (outside any format block, or `format do`) is
// inherited by html and is credited, every other format is not.
//
// A mod is behaviourally complete when every view it declares is graded-pass
// or pinned, and every event it declares is named by a test. Nothing weaker.

import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HTML_LIKE = new Set(["html", "base"]);

// Parse a Ruby set file into view and event declarations with the format each
// view is declared under. A `format :x do` line opens a block that closes at
// the first `end` with the same indentation; a view outside any block (or in a
// bare `format do`) belongs to the base format.
export function parseDeclarations(src) {
  const lines = src.split(/\r?\n/);
  const stack = []; // { fmt, indent }
  const views = [];
  const events = [];
  for (const raw of lines) {
    if (/^\s*#/.test(raw)) continue;
    const indent = raw.match(/^[ \t]*/)[0].length;
    const top = stack[stack.length - 1];
    if (top && indent === top.indent && /^\s*end\b/.test(raw)) {
      stack.pop();
      continue;
    }
    let m = raw.match(/^[ \t]*format(?:[ \t]*\(?[ \t]*:([A-Za-z0-9_]+))?[ \t]*\)?[ \t]*(?:do|\{)/);
    if (m) {
      stack.push({ fmt: m[1] ?? "base", indent });
      continue;
    }
    m = raw.match(/^[ \t]*view[ \t]*\(?[ \t]*:([A-Za-z0-9_?!]+)(?:[ \t]*,[ \t]*:([A-Za-z0-9_?!]+))?/);
    if (m) {
      const fmt = stack.length ? stack[stack.length - 1].fmt : "base";
      views.push({ format: fmt, view: m[1], alias: m[2] ?? null });
      continue;
    }
    m = raw.match(/^[ \t]*event[ \t]+:([A-Za-z0-9_?!]+)/);
    if (m) events.push(m[1]);
  }
  return { views, events };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function gemDeclarations(gemPath) {
  const files = [...walk(join(gemPath, "set")), ...walk(join(gemPath, "lib"))].filter((f) =>
    f.endsWith(".rb"),
  );
  const views = new Map(); // "fmt:view" -> { format, view, alias }
  const events = new Set();
  for (const f of files) {
    const d = parseDeclarations(readFileSync(f, "utf8"));
    for (const v of d.views) views.set(`${v.format}:${v.view}`, v);
    for (const e of d.events) events.add(e);
  }
  return {
    views: [...views.values()].sort((a, b) =>
      `${a.format}:${a.view}`.localeCompare(`${b.format}:${b.view}`),
    ),
    events: [...events].sort(),
  };
}

// ---------------------------------------------------------------------------
// graded operations
// ---------------------------------------------------------------------------

// Reduce a grade report (reference-harness/runner/grade.mjs --report) and the
// fixture's op list to { fixture, commit, verdict, ops: { id: {view, pass} } }.
export function summariseGrade(repo, gradeReport) {
  const fixture = gradeReport.fixture;
  const opsPath = join(repo, "reference-harness", "fixtures", fixture, "ops", "render.jsonl");
  const failed = new Set((gradeReport.failures?.rendering ?? []).map((f) => f.id));
  const reproduced = new Set((gradeReport.reproduced?.rendering ?? []).map((f) => f.id));
  const ops = {};
  for (const line of readFileSync(opsPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const op = JSON.parse(line);
    if (op.op !== "render") continue;
    ops[op.id] = {
      view: op.view ?? null,
      result: failed.has(op.id) ? "differs" : reproduced.has(op.id) ? "reproduced-upstream-failure" : "identical",
    };
  }
  return {
    fixture,
    adapter_commit: gradeReport.adapter_checkout?.commit ?? null,
    adapter_dirty: gradeReport.adapter_checkout?.dirty ?? null,
    graded_at: gradeReport.graded_at ?? null,
    verdict: gradeReport.verdict,
    rendering: gradeReport.summary?.rendering
      ? { graded: gradeReport.summary.rendering.graded, pass: gradeReport.summary.rendering.pass, fail: gradeReport.summary.rendering.fail }
      : null,
    ops,
  };
}

// ---------------------------------------------------------------------------
// test linkage
// ---------------------------------------------------------------------------

function modTestFiles(repo, modId) {
  const dir = join(repo, "tests", "card", "mod-loader");
  if (!existsSync(dir)) return [];
  const stems = new Set([modId, modId.replaceAll("_", "-")]);
  return readdirSync(dir)
    .filter((n) => n.endsWith(".test.ts") && [...stems].some((s) => n === `${s}.test.ts` || n.startsWith(`${s}-`)))
    .sort()
    .map((n) => ({ rel: `tests/card/mod-loader/${n}`, src: readFileSync(join(dir, n), "utf8") }));
}

let allTestsCache = null;
function allTestSources(repo) {
  if (allTestsCache) return allTestsCache;
  allTestsCache = walk(join(repo, "tests"))
    .filter((f) => /\.test\.(ts|mjs|js)$/.test(f))
    .map((f) => ({ rel: f.slice(repo.length + 1).replaceAll("\\", "/"), src: readFileSync(f, "utf8") }));
  return allTestsCache;
}

const hasBytePins = (src) => /expect\([^)]*\)\.toBe\(\s*['"`]/.test(src);
// A string literal that is exactly the name ("name", 'name', `name`).
const namesLiteral = (src, name) => {
  const n = name.replace(/[?!]/g, "\\$&");
  return new RegExp(`["'\`]${n}["'\`]`).test(src);
};

// ---------------------------------------------------------------------------
// per-mod evaluation
// ---------------------------------------------------------------------------

export function evaluateMod(repo, gemPath, modId, grades) {
  const decl = gemDeclarations(gemPath);
  const tests = modTestFiles(repo, modId);
  const pinnedTests = tests.filter((t) => hasBytePins(t.src));

  // view name -> [{fixture, id, result}]
  const opsByView = new Map();
  for (const g of grades) {
    for (const [id, o] of Object.entries(g.ops)) {
      if (!o.view) continue;
      if (!opsByView.has(o.view)) opsByView.set(o.view, []);
      opsByView.get(o.view).push({ fixture: g.fixture, id, result: o.result });
    }
  }

  const views = decl.views.map((v) => {
    const entry = { format: v.format, view: v.view, alias: v.alias };
    const ops = HTML_LIKE.has(v.format) ? opsByView.get(v.view) ?? [] : [];
    if (ops.length) {
      const differs = ops.filter((o) => o.result === "differs");
      entry.evidence = differs.length ? "graded-differs" : "graded-identical";
      entry.ops = ops.map((o) => `${o.fixture}#${o.id}`);
      if (differs.length) entry.differing_ops = differs.map((o) => `${o.fixture}#${o.id}`);
      return entry;
    }
    const pins = pinnedTests.filter((t) => namesLiteral(t.src, v.view));
    if (pins.length) {
      entry.evidence = "pinned";
      entry.tests = pins.map((t) => t.rel);
      return entry;
    }
    entry.evidence = "unexercised";
    return entry;
  });

  const events = decl.events.map((e) => {
    const named = allTestSources(repo).filter((t) => namesLiteral(t.src, e));
    return named.length
      ? { event: e, evidence: "named", tests: named.map((t) => t.rel) }
      : { event: e, evidence: "unexercised" };
  });

  const count = (arr, ev) => arr.filter((x) => x.evidence === ev).length;
  const summary = {
    views: decl.views.length,
    views_graded_identical: count(views, "graded-identical"),
    views_graded_differs: count(views, "graded-differs"),
    views_pinned: count(views, "pinned"),
    views_unexercised: count(views, "unexercised"),
    events: decl.events.length,
    events_named: count(events, "named"),
    events_unexercised: count(events, "unexercised"),
  };
  const complete =
    summary.views_graded_differs === 0 &&
    summary.views_unexercised === 0 &&
    summary.events_unexercised === 0;
  return {
    status: complete ? "behaviour-complete" : "behaviour-incomplete",
    summary,
    tests: tests.map((t) => t.rel),
    views,
    events,
  };
}

export function loadGrades(path) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")).grades ?? [];
}

export function saveGrades(path, grades) {
  writeFileSync(path, JSON.stringify({ format: "decko-ts-graded-ops/1", grades }, null, 1) + "\n");
}
