// The grader: checks that a results directory is a complete run of the named
// fixture by one engine, then compares it with the oracle's expected outputs
// item by item on the four parity kinds, checks that reads wrote nothing the
// oracle did not, and checks that each write step's changes outside Decko's
// card tables are the oracle's, or declared. See reference-harness/SPEC.md,
// "Runner" and "Grading".

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { EXPECTED_MANIFEST_FORMAT, resultFiles, storedFileHashes, verifyFixture } from "./manifest.mjs";
import { normalizeErrorRecord, normalizeRender, sameFailure, sameJson, stable } from "./normalize.mjs";

export const RESULTS_FORMAT = 2;
export const PROTOCOL = 1;
export const KINDS = ["rendering", "semantics", "persistence", "side_effects"];
const RUN_KINDS = ["render", "semantics", "scenarios"];

/** Exit status for a verdict. */
export const EXIT = { pass: 0, fail: 1, invalid: 2, partial: 2 };

/**
 * Grades `actual` against `expected` (default `<fixture>/expected`).
 * `allowPartial` lets a run with a --filter/--limit selection or missing kinds
 * be graded on what it holds, for development; its verdict is "partial",
 * never "pass".
 * `classTokenOrder` applies the harness's N3 rule (class tokens inside a
 * `class` attribute compared as a set). It is on by default and is recorded in
 * the report; `false` grades with N3 off, which is how the raw class-token
 * order counts on its own is measured.
 * `declaredOtherTables` is the declared-difference record for write steps'
 * changes outside Decko's card tables, keyed on step id then table name:
 * `{ "create-then-render#1": { "sessions": "why the engine's row differs" } }`.
 * A difference named here is graded as declared (recorded, with its why, in
 * the report); every other difference fails the grade.
 */
export function gradeRun({ fixture, actual, expected, allowPartial = false, classTokenOrder = true, declaredOtherTables = {} }) {
  const declared = validateDeclaredOtherTables(declaredOtherTables);
  const normalizeOptions = { classTokenOrder };
  const fixtureDir = path.resolve(fixture);
  const actualDir = path.resolve(actual);
  const expectedDir = path.resolve(expected ?? path.join(fixtureDir, "expected"));
  const problems = []; // make the run unusable as a grade
  const partial = []; // a selection that --allow-partial accepts
  const warnings = []; // recorded in the report, do not change the verdict

  // ---- fixture identity --------------------------------------------------------
  const fixtureCheck = verifyFixture(fixtureDir);
  for (const p of fixtureCheck.problems) problems.push(`fixture: ${p}`);
  const digest = fixtureCheck.digest;
  const ops = loadOps(fixtureDir);

  // ---- expected outputs: manifest, hashes, oracle variant, completeness ---------
  const expManifest = readJson(path.join(expectedDir, "MANIFEST.json"));
  let oracle = null;
  if (!expManifest.ok) {
    problems.push(`expected: ${expManifest.error}`);
  } else {
    const m = expManifest.value;
    if (m.format !== EXPECTED_MANIFEST_FORMAT) problems.push(`expected: manifest format is ${m.format}, expected ${EXPECTED_MANIFEST_FORMAT}`);
    if (m.fixture !== path.basename(fixtureDir)) problems.push(`expected: captured for fixture "${m.fixture}", not "${path.basename(fixtureDir)}"`);
    if (digest && m.fixture_digest !== digest) problems.push(`expected: captured on fixture digest ${m.fixture_digest}, fixture is ${digest}`);
    oracle = { variant: m.oracle?.variant ?? null, patches: m.oracle?.patches ?? null, engine: m.engine ?? null };
    if (!oracle.variant) problems.push("expected: manifest names no oracle variant");
    else if (oracle.variant === "stock" && (oracle.patches ?? []).length > 0) problems.push("expected: a stock oracle manifest lists patches");
    else if (oracle.variant !== "stock" && (oracle.patches ?? []).length === 0) problems.push(`expected: patched variant "${oracle.variant}" lists no patches`);
    if (oracle.variant && oracle.variant !== "stock" && path.basename(expectedDir) === "expected") {
      problems.push(`expected: patched variant "${oracle.variant}" is stored in expected/, which holds the stock oracle only`);
    }
    if (oracle.variant === "stock" && path.basename(expectedDir) !== "expected") {
      warnings.push(`expected: stock oracle outputs read from ${path.basename(expectedDir)}/ rather than expected/`);
    }
    const listed = m.files ?? {};
    for (const [file, h] of Object.entries(listed)) {
      const abs = path.join(expectedDir, file);
      if (!existsSync(abs)) problems.push(`expected: file missing: ${file}`);
      else if (storedFileHashes(abs).sha256 !== h.sha256) problems.push(`expected: file changed since its manifest: ${file}`);
    }
    if (existsSync(expectedDir)) for (const f of resultFiles(expectedDir)) if (!(f in listed)) problems.push(`expected: file not in its manifest: ${f}`);
  }
  const expRuns = expManifest.ok ? expManifest.value.runs ?? {} : {};
  const exp = loadResults(expectedDir, "expected", ops, problems, problems);

  // ---- actual results: metadata, identity, completeness ------------------------
  const metaRead = readJson(path.join(actualDir, "run-meta.json"));
  const meta = metaRead.ok ? metaRead.value : null;
  const actRuns = meta?.runs ?? {};
  if (!metaRead.ok) problems.push(`results: ${metaRead.error}`);
  else {
    if (meta.results_format !== RESULTS_FORMAT) problems.push(`results: run-meta.json results_format is ${meta.results_format}, the grader reads ${RESULTS_FORMAT}`);
    if (meta.fixture !== path.basename(fixtureDir)) problems.push(`results: run-meta.json names fixture "${meta.fixture}", not "${path.basename(fixtureDir)}"`);
    for (const kind of RUN_KINDS) checkRunRecord(kind, actRuns[kind], { digest, ops, problems, partial, warnings });
    checkOneEngine(actRuns, problems, warnings);
  }
  const act = loadResults(actualDir, "results", ops, problems, partial);

  // ---- item comparison -----------------------------------------------------------
  const tally = Object.fromEntries(KINDS.map((k) => [k, { graded: 0, pass: 0, fail: 0, reproduced_upstream_failures: 0, oracle_errors: 0, missing: 0, groups: {} }]));
  const failures = Object.fromEntries(KINDS.map((k) => [k, []]));
  const reproduced = Object.fromEntries(KINDS.map((k) => [k, []]));
  const readWrites = { graded: 0, pass: 0, fail: 0, failures: [] };
  const otherTableWrites = [];
  const otherTables = { graded: 0, pass: 0, declared: 0, fail: 0, failures: [] };
  const selected = (kind, id) => !allowPartial || act.present[kind].has(id);

  const grade = (kind, group, id, e, a, mode) => {
    const t = tally[kind];
    t.groups[group] ??= { graded: 0, pass: 0 };
    if (e.error) {
      // The oracle's recorded answer is itself a failure. Two disjoint cases.
      // A capture-side fault (the CAPTURE_ERROR sentinel the capture scripts
      // record when their own machinery threw) says nothing about the site
      // and stays ungraded. A recorded upstream failure - the oracle raised
      // while serving - is the upstream behavior the port must reproduce
      // (reproducing a recorded upstream failure is a success, not a
      // divergence: a faithful port breaks where the original breaks).
      // Identity is still the bar: the engine's
      // failure must equal the oracle's under N7 (the class's host naming
      // canonicalized) with the message byte-exact, and a match is counted
      // as a reproduced upstream failure, its own success category. Any
      // other answer - a different failure, or a render where the oracle
      // failed - fails the item.
      if (isCaptureFault(e.error)) {
        t.oracle_errors++;
        return;
      }
      t.graded++;
      t.groups[group].graded++;
      if (a === undefined) {
        t.missing++;
        t.fail++;
        failures[kind].push({ id, group, reason: "no result recorded" });
        return;
      }
      if (a.error === undefined || a.error === null) {
        t.fail++;
        failures[kind].push({
          id,
          group,
        reason: `upstream failure not reproduced: the oracle raised ${e.error.class}: ${e.error.message} and the engine rendered a result`,
        diff: firstDifference(stable(e.error), stable(a.value ?? null)),
        });
        return;
      }
      if (sameFailure(e.error, a.error)) {
        t.reproduced_upstream_failures++;
        reproduced[kind].push({ id, group, oracle: e.error, engine: a.error });
        return;
      }
      t.fail++;
      failures[kind].push({
        id,
        group,
        reason: `reproduced a different failure: the oracle raised ${e.error.class}: ${e.error.message}, the engine ${a.error.class}: ${a.error.message}`,
        diff: firstDifference(normalizeErrorRecord(e.error), normalizeErrorRecord(a.error)),
      });
      return;
    }
    t.graded++;
    t.groups[group].graded++;
    if (a === undefined) {
      t.missing++;
      t.fail++;
      failures[kind].push({ id, group, reason: "no result recorded" });
      return;
    }
    if (a.error) {
      t.fail++;
      failures[kind].push({ id, group, reason: `adapter error ${a.error.class}: ${a.error.message}` });
      return;
    }
    if (sameJson(e.value, a.value)) {
      t.pass++;
      t.groups[group].pass++;
    } else {
      t.fail++;
      failures[kind].push({ id, group, reason: "differs", diff: firstDifference(e.value, a.value), ...(mode === "rows" ? { differences: leafDifferences(e.value, a.value) } : {}) });
    }
  };
  const gradeReadWrites = (id, expWrites, actWrites) => {
    readWrites.graded++;
    if (actWrites === undefined) {
      readWrites.fail++;
      readWrites.failures.push({ id, reason: "not recorded" });
    } else if (sameJson(expWrites ?? {}, actWrites)) {
      readWrites.pass++;
    } else {
      readWrites.fail++;
      readWrites.failures.push({ id, reason: "wrote rows the oracle did not", differences: leafDifferences(expWrites ?? {}, actWrites) });
    }
  };
  // A write step's `other_tables` are Ruby-recorded truth just like its `rows`:
  // the engine's changed non-card tables must equal the oracle's, and every
  // differing table must be declared (step id + table) or the grade fails.
  const gradeOtherTables = (id, expOther, actOther) => {
    const record = { id, expected: expOther, actual: actOther };
    otherTableWrites.push(record);
    otherTables.graded++;
    if (sameJson(expOther, actOther)) {
      record.verdict = "pass";
      otherTables.pass++;
      return;
    }
    const tables = [...new Set([...Object.keys(expOther), ...Object.keys(actOther)])].sort();
    const differing = tables.filter((t) => !sameJson(expOther[t] ?? {}, actOther[t] ?? {}));
    const why = (t) => declared[id]?.[t];
    const undeclared = differing.filter((t) => why(t) === undefined);
    if (undeclared.length === 0) {
      record.verdict = "declared";
      record.declared = differing.map((t) => ({ table: t, why: why(t) }));
      otherTables.declared++;
      return;
    }
    record.verdict = "fail";
    otherTables.fail++;
    otherTables.failures.push({
      id,
      reason: "wrote rows in tables outside the card tables that the oracle's write did not, and not declared",
      tables: undeclared,
      differences: differing.map((t) => ({ table: t, declared: why(t) !== undefined, differences: leafDifferences(expOther[t] ?? {}, actOther[t] ?? {}) })),
    });
  };
  const wrap = (line, norm) => (line === undefined ? undefined : line.error ? { error: line.error } : { value: norm(line.result) });
  const ident = (r) => r;

  for (const [id, e] of exp.render) {
    if (!selected("render", id)) continue;
    const [view, actor] = id.split(":");
    grade("rendering", `${view === "page" ? "page" : "view"} / ${actor}`, id, wrap(e, (r) => normalizeRender(r, normalizeOptions)), wrap(act.render.get(id), (r) => normalizeRender(r, normalizeOptions)));
  }
  for (const [id, e] of exp.semantics) {
    if (!selected("semantics", id)) continue;
    grade("semantics", id.split(":")[0], id, wrap(e, ident), wrap(act.semantics.get(id), ident));
  }
  // Reads must write only what the oracle's reads wrote (in practice nothing).
  for (const kind of ["render", "semantics"]) {
    if (allowPartial && !actRuns[kind]) continue;
    gradeReadWrites(`${kind} session`, expRuns[kind]?.session_writes, actRuns[kind]?.session_writes);
  }
  for (const [sid, e] of exp.scenarios) {
    if (!selected("scenarios", sid)) continue;
    const steps = ops.scenarios.get(sid)?.steps ?? [];
    const a = act.scenarios.get(sid);
    e.steps.forEach((step, i) => {
      const op = steps[i];
      const id = `${sid}#${i + 1}`;
      const actStep = a?.steps?.[i];
      if (op.op === "render") grade("rendering", "after write", id, wrap(step, (r) => normalizeRender(r, normalizeOptions)), wrap(actStep, (r) => normalizeRender(r, normalizeOptions)));
      else if (op.op === "ask") grade("semantics", "after write", id, wrap(step, ident), wrap(actStep, ident));
      else {
        // A write's or sign-in's answer is its side effect: saved or refused,
        // the errors shown, the mail sent, the identity signed in.
        grade("side_effects", op.op === "signin" ? "sign-in" : `write ${op.action}`, id, wrap(step, ident), wrap(actStep, ident));
      }
      if (op.op === "write") {
        if (step.rows === undefined && !step.error) problems.push(`expected: scenario step ${id} has no row delta`);
        const rows = (s) => (s === undefined ? undefined : s.rows === undefined ? { error: { class: "HarnessMissingRows", message: "no row delta recorded" } } : { value: s.rows });
        grade("persistence", `write ${op.action}`, id, rows(step), rows(actStep), "rows");
        if (step.other_tables || actStep?.other_tables) gradeOtherTables(id, step.other_tables ?? {}, actStep?.other_tables ?? {});
      } else {
        const all = (s) => (s === undefined ? undefined : { ...(s.rows ?? {}), ...(s.other_tables ?? {}) });
        gradeReadWrites(id, all(step), actStep && actStep.rows !== undefined ? all(actStep) : undefined);
      }
    });
  }

  const summary = Object.fromEntries(
    KINDS.map((k) => [k, { ...tally[k], rate: tally[k].graded ? +((tally[k].pass / tally[k].graded) * 100).toFixed(2) : null }]),
  );
  const allPass = KINDS.every((k) => summary[k].fail === 0) && readWrites.fail === 0 && otherTables.fail === 0;
  const verdict = problems.length > 0 ? "invalid" : partial.length > 0 ? (allowPartial ? "partial" : "invalid") : allPass ? "pass" : "fail";
  if (!allowPartial) problems.push(...partial.map((p) => `incomplete: ${p}`));
  // Report paths are workspace-relative: a report records where a run sat
  // relative to the repository, never the absolute layout of the machine that
  // produced it. Directories outside the workspace keep a truthful ../-form.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const workspaceRelative = (dir) => {
    const rel = path.relative(repoRoot, dir);
    return (rel === "" ? "." : rel).split(path.sep).join("/");
  };
  return {
    fixture: path.basename(fixtureDir),
    fixture_digest: digest,
    actual: workspaceRelative(actualDir),
    expected: workspaceRelative(expectedDir),
    oracle,
    engine: meta ? firstEngine(actRuns) : null,
    adapter_checkout: actRuns.render?.adapter_checkout ?? actRuns.scenarios?.adapter_checkout ?? null,
    verdict,
    problems,
    partial: allowPartial ? partial : [],
    warnings,
    normalization: ["N1", "N2", ...(classTokenOrder ? ["N3"] : [])],
    summary,
    read_writes: readWrites,
    other_tables: otherTables,
    other_table_writes: otherTableWrites,
    failures,
    reproduced,
  };
}

/** The declared-difference record's shape: `{ "<step id>": { "<table>": "why" } }`. */
function validateDeclaredOtherTables(declared) {
  const bad = "declaredOtherTables must be { \"<step id>\": { \"<table>\": \"why\" } }";
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) throw new TypeError(bad);
  for (const [id, tables] of Object.entries(declared)) {
    if (tables === null || typeof tables !== "object" || Array.isArray(tables)) throw new TypeError(`${bad}; "${id}" does not map to a table object`);
    for (const [table, why] of Object.entries(tables)) if (typeof why !== "string") throw new TypeError(`${bad}; the why of "${id}" table "${table}" is not a string`);
  }
  return declared;
}

/**
 * A capture-side fault sentinel, not a recorded site behavior: the capture
 * scripts (benchmarks/capture-*.rb) record `CAPTURE_ERROR: <class>:
 * <message>` - as the error record or as the payload itself - when their own
 * machinery threw, so the oracle's bytes hold no site behavior to reproduce
 * and the operation cannot be graded. A real exception class the oracle
 * raised while serving is the site's behavior and is graded (see `grade`).
 */
function isCaptureFault(error) {
  if (error === null || typeof error !== "object") return false;
  if (typeof error.class === "string" && error.class.includes("CAPTURE_ERROR")) return true;
  if (typeof error.message === "string" && error.message.startsWith("CAPTURE_ERROR:")) return true;
  return false;
}

function checkRunRecord(kind, run, { digest, ops, problems, partial, warnings }) {
  if (!run) {
    partial.push(`${kind}: not run`);
    return;
  }
  const need = ["started", "finished", "complete", "ops_total", "ops_run", "adapter", "engine", "fixture_digest"];
  if (kind !== "scenarios") need.push("session_writes");
  for (const f of need) if (!(f in run) || run[f] === null) problems.push(`results: ${kind} run record lacks ${f}`);
  if (run.complete !== true) problems.push(`results: ${kind} run did not complete (${run.ops_run ?? "?"} of ${run.ops_total ?? "?"} operations ran)`);
  if (run.selection) partial.push(`${kind}: run with a selection ${JSON.stringify(run.selection)}`);
  const total = kind === "scenarios" ? ops.scenarios.size : ops[kind].size;
  if (run.ops_total !== undefined && run.ops_total !== total) problems.push(`results: ${kind} ran a fixture with ${run.ops_total} operations; this fixture has ${total}`);
  if (!run.selection && run.complete === true && run.ops_run !== total) problems.push(`results: ${kind} ran ${run.ops_run} of ${total} operations`);
  if (digest && run.fixture_digest && run.fixture_digest !== digest) problems.push(`results: ${kind} was run on fixture digest ${run.fixture_digest}, fixture is ${digest}`);
  if ((run.fixture_problems ?? []).length > 0) problems.push(`results: ${kind} was run on a fixture that did not match its manifest`);
  if (run.engine && run.engine.protocol !== PROTOCOL) problems.push(`results: ${kind} engine speaks protocol ${run.engine.protocol}, grader reads ${PROTOCOL}`);
  if (run.engine_changed) problems.push(`results: ${kind} sessions were answered by different engine versions`);
  if (kind !== "scenarios" && run.session_writes !== undefined && (run.session_writes === null || typeof run.session_writes !== "object")) {
    problems.push(`results: ${kind} session_writes is not a row delta`);
  }
  if (run.adapter_checkout === null) warnings.push(`${kind}: adapter source is not a git checkout; the result names no commit`);
  else if (run.adapter_checkout?.dirty) warnings.push(`${kind}: adapter checkout ${run.adapter_checkout.commit} had uncommitted changes; not a release grade`);
}

function checkOneEngine(runs, problems) {
  const present = RUN_KINDS.filter((k) => runs[k]);
  const sig = (r) => JSON.stringify({ adapter: r.adapter, engine: stable(r.engine ?? null), commit: r.adapter_checkout?.commit ?? null });
  const sigs = new Set(present.map((k) => sig(runs[k])));
  if (sigs.size > 1) problems.push(`results: kinds were run by different adapters, engines or commits (${present.map((k) => `${k}: ${runs[k].adapter} ${runs[k].adapter_checkout?.commit ?? "no commit"}`).join("; ")})`);
}

function firstEngine(runs) {
  for (const k of RUN_KINDS) if (runs[k]?.engine) return runs[k].engine;
  return null;
}

/** The fixture's operation ids and scenario step lists. */
function loadOps(fixtureDir) {
  const ids = (file) => new Set(readLinesFrom(path.join(fixtureDir, "ops", file)).lines.map((o) => o.id));
  const scen = JSON.parse(readFileSync(path.join(fixtureDir, "ops", "scenarios.json"), "utf8")).scenarios;
  return { render: ids("render.jsonl"), semantics: ids("semantics.jsonl"), scenarios: new Map(scen.map((s) => [s.id, s])) };
}

/**
 * Reads a results directory. Malformed lines, duplicate ids, ids the fixture
 * does not have and short scenarios go to `problems`; operations with no line
 * go to `missing` (problems for expected outputs, a partial selection for
 * results, which --allow-partial accepts).
 */
function loadResults(dir, label, ops, problems, missing) {
  const out = { render: new Map(), semantics: new Map(), scenarios: new Map(), present: {} };
  for (const kind of RUN_KINDS) {
    const file = path.join(dir, `${kind}.jsonl`);
    const read = readLinesFrom(file);
    if (!read.exists) {
      missing.push(`${label}: no ${kind}.jsonl`);
      out.present[kind] = new Set();
      continue;
    }
    for (const bad of read.bad) problems.push(`${label}: ${kind}.jsonl line ${bad} is not JSON`);
    const known = kind === "scenarios" ? ops.scenarios : ops[kind];
    for (const line of read.lines) {
      if (out[kind].has(line.id)) problems.push(`${label}: ${kind} id ${line.id} recorded twice`);
      else if (!known.has(line.id)) problems.push(`${label}: ${kind} id ${line.id} is not an operation of this fixture`);
      else out[kind].set(line.id, line);
    }
    if (kind === "scenarios") {
      for (const [id, line] of out.scenarios) {
        const want = ops.scenarios.get(id).steps.length;
        const have = Array.isArray(line.steps) ? line.steps.length : 0;
        if (have !== want) problems.push(`${label}: scenario ${id} recorded ${have} of ${want} steps`);
      }
    }
    const absent = [...known.keys()].filter((id) => !out[kind].has(id));
    if (absent.length) missing.push(`${label}: ${absent.length} of ${known.size} ${kind} operations have no result`);
    out.present[kind] = new Set(out[kind].keys());
  }
  return out;
}

function readLinesFrom(file) {
  const text = existsSync(file) ? readFileSync(file, "utf8") : existsSync(file + ".gz") ? gunzipSync(readFileSync(file + ".gz")).toString("utf8") : null;
  if (text === null) return { exists: false, lines: [], bad: [] };
  const lines = [];
  const bad = [];
  text.split("\n").forEach((l, i) => {
    if (l.trim() === "") return;
    try {
      lines.push(JSON.parse(l));
    } catch {
      bad.push(i + 1);
    }
  });
  return { exists: true, lines, bad };
}

function readJson(file) {
  if (!existsSync(file)) return { ok: false, error: `${path.basename(path.dirname(file))}/${path.basename(file)} is missing` };
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, error: `${path.basename(file)} is not JSON: ${error.message}` };
  }
}

export function firstDifference(a, b) {
  const sa = typeof a === "string" ? a : JSON.stringify(stable(a));
  const sb = typeof b === "string" ? b : JSON.stringify(stable(b));
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  return { at: i, expected: sa.slice(Math.max(0, i - 60), i + 120), actual: sb.slice(Math.max(0, i - 60), i + 120) };
}

/** Every leaf where two JSON values differ, as {path, expected, actual}. */
export function leafDifferences(a, b, at = "") {
  if (sameJson(a, b)) return [];
  const isObj = (v) => v !== null && typeof v === "object";
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return [{ path: at || "/", expected: a, actual: b }];
  const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.flatMap((k) => leafDifferences(a[k], b[k], `${at}/${k}`));
}

