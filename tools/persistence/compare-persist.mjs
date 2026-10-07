// compare-persist.mjs -- diff the Ruby and TypeScript persistence dumps.
//
//   node tools/persistence/compare-persist.mjs <rubyStepsDir> <tsStateJson> [reportJson]
//
// Both sides dump the same shape after every step: the probe's own rows in
// cards, card_acts, card_actions, card_changes, card_references and
// card_virtuals. Rows are compared under these normalisations and nothing
// else:
//
//   1. TIMESTAMPS. cards.created_at/updated_at and card_acts.acted_at are
//      replaced by "T": the two engines run on different clocks.
//   2. ROW IDS. A card id becomes the card's composed name. An act becomes
//      "<card>/act<n>", an action "<card>/<action_type><n>" (n = ordinal per
//      card, in id order), a change "<action>/<field>", a reference
//      "<referer>-><referee_key>/<ref_type>". Foreign keys map through the
//      same tables, so a row pointing at the wrong card or action IS a
//      difference. card_changes values for the left_id and right_id fields
//      (fields 4 and 5) hold a raw card id and map the same way when the id
//      is a probe card. The GLOBAL id order of acts and actions is compared as a
//      separate "order" check, so an ordering difference is reported once
//      instead of shifting every later row.
//   3. BOOLEANS. true/false are folded to 1/0.
//
// Every other column is compared exactly. A row present on one side only is
// a "missing" / "extra" fault.
//
// Two scores:
//   * state  -- the whole probe state after step N matches.
//   * delta  -- the rows step N added, removed or changed match. This
//               measures each operation on its own, so one early divergence
//               does not fail every later step by inheritance.
//
// Exit 0 when every step's state matches, 1 on any difference, 2 on a missing
// input (never silently skips).

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const [rubyDir, tsFile, reportFile] = process.argv.slice(2);
if (!rubyDir || !tsFile) {
  console.error("usage: compare-persist.mjs <rubyStepsDir> <tsStateJson> [reportJson]");
  process.exit(2);
}
for (const p of [rubyDir, tsFile]) {
  if (!existsSync(p)) {
    console.error(`MISSING INPUT: ${p}`);
    process.exit(2);
  }
}

const TIMESTAMP_COLUMNS = new Set(["created_at", "updated_at", "acted_at"]);

function composedNames(cards) {
  const byId = new Map();
  for (const row of cards) byId.set(Number(row.id), row);
  const memo = new Map();
  const composed = (id) => {
    if (memo.has(id)) return memo.get(id);
    const row = byId.get(id);
    if (row === undefined) return `#${id}`;
    let name;
    if (row.left_id === null || row.left_id === undefined) {
      name = typeof row.name === "string" ? row.name : `#${id}`;
    } else {
      memo.set(id, `#${id}`); // cycle guard
      name = `${composed(Number(row.left_id))}+${composed(Number(row.right_id))}`;
    }
    memo.set(id, name);
    return name;
  };
  for (const id of byId.keys()) composed(id);
  return memo;
}

const fold = (v) => (v === true ? 1 : v === false ? 0 : v === undefined ? null : v);

function clean(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = TIMESTAMP_COLUMNS.has(k) ? "T" : fold(v);
  return out;
}

/** state -> { table: Map(key -> row) , order: { acts: [...], actions: [...] } } */
function normalise(state) {
  const names = composedNames(state.cards ?? []);
  const card = (v) => (v === null || v === undefined ? null : (names.get(Number(v)) ?? `#${v}`));

  const perCard = (rows, label) => {
    const counters = new Map();
    const ids = new Map();
    for (const r of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
      const c = card(r.card_id);
      const tag = label(r);
      const k = `${c}/${tag}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      ids.set(Number(r.id), `${k}${n}`);
    }
    return ids;
  };
  const acts = perCard(state.card_acts ?? [], () => "act");
  const actions = perCard(state.card_actions ?? [], (r) => String(r.action_type));
  const actKey = (v) => (v === null || v === undefined ? null : (acts.get(Number(v)) ?? `act#${v}`));
  const actionKey = (v) =>
    v === null || v === undefined ? null : (actions.get(Number(v)) ?? `action#${v}`);

  const tables = {};
  const put = (table, key, row) => {
    tables[table] ??= new Map();
    let k = key;
    let i = 1;
    while (tables[table].has(k)) k = `${key}~${++i}`;
    tables[table].set(k, row);
  };
  for (const r of state.cards ?? []) {
    const row = clean(r);
    put("cards", card(r.id), { ...row, id: card(r.id), left_id: card(r.left_id), right_id: card(r.right_id) });
  }
  for (const r of state.card_acts ?? []) {
    const row = clean(r);
    put("card_acts", actKey(r.id), { ...row, id: actKey(r.id), card_id: card(r.card_id) });
  }
  for (const r of state.card_actions ?? []) {
    const row = clean(r);
    put("card_actions", actionKey(r.id), {
      ...row,
      id: actionKey(r.id),
      card_id: card(r.card_id),
      card_act_id: actKey(r.card_act_id),
      super_action_id: actionKey(r.super_action_id),
    });
  }
  for (const r of state.card_changes ?? []) {
    const row = clean(r);
    const k = `${actionKey(r.card_action_id)}/${r.field}`;
    // Fields 4 and 5 (left_id, right_id) store a raw card id as text.
    const value =
      (Number(r.field) === 4 || Number(r.field) === 5) && r.value !== null && names.has(Number(r.value))
        ? card(r.value)
        : row.value;
    put("card_changes", k, { ...row, id: k, card_action_id: actionKey(r.card_action_id), value });
  }
  for (const r of state.card_references ?? []) {
    const row = clean(r);
    const k = `${card(r.referer_id)}->${r.referee_key}/${r.ref_type}`;
    put("card_references", k, {
      ...row,
      id: k,
      referer_id: card(r.referer_id),
      referee_id: card(r.referee_id),
    });
  }
  for (const r of state.card_virtuals ?? []) {
    const row = clean(r);
    const k = `${card(r.left_id)}+${card(r.right_id)}`;
    put("card_virtuals", k, { ...row, id: k, left_id: card(r.left_id), right_id: card(r.right_id) });
  }
  const order = {
    card_acts: [...(state.card_acts ?? [])].sort((a, b) => Number(a.id) - Number(b.id)).map((r) => actKey(r.id)),
    card_actions: [...(state.card_actions ?? [])]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((r) => actionKey(r.id)),
  };
  return { tables, order };
}

const TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_virtuals"];

function diffState(a, b) {
  const faults = [];
  for (const t of TABLES) {
    const ra = a.tables[t] ?? new Map();
    const rb = b.tables[t] ?? new Map();
    for (const [k, row] of ra) {
      const other = rb.get(k);
      if (other === undefined) {
        faults.push({ table: t, kind: "missing-in-ts", key: k, ruby: row });
        continue;
      }
      for (const col of new Set([...Object.keys(row), ...Object.keys(other)])) {
        if (JSON.stringify(row[col] ?? null) !== JSON.stringify(other[col] ?? null)) {
          faults.push({ table: t, kind: "field", key: k, column: col, ruby: row[col] ?? null, ts: other[col] ?? null });
        }
      }
    }
    for (const [k, row] of rb) {
      if (!ra.has(k)) faults.push({ table: t, kind: "extra-in-ts", key: k, ts: row });
    }
  }
  for (const t of ["card_acts", "card_actions"]) {
    const oa = a.order[t].filter((k) => b.order[t].includes(k));
    const ob = b.order[t].filter((k) => a.order[t].includes(k));
    if (JSON.stringify(oa) !== JSON.stringify(ob)) faults.push({ table: t, kind: "order", ruby: oa, ts: ob });
  }
  return faults;
}

/** Rows step N added, removed or changed, keyed as in normalise(). */
function delta(prev, cur) {
  const out = { tables: {}, order: { card_acts: [], card_actions: [] } };
  for (const t of TABLES) {
    const p = prev.tables[t] ?? new Map();
    const c = cur.tables[t] ?? new Map();
    const m = new Map();
    for (const [k, row] of c) if (JSON.stringify(p.get(k)) !== JSON.stringify(row)) m.set(k, row);
    for (const [k] of p) if (!c.has(k)) m.set(k, { __removed: true });
    out.tables[t] = m;
  }
  for (const t of ["card_acts", "card_actions"]) {
    out.order[t] = cur.order[t].filter((k) => !prev.order[t].includes(k));
  }
  return out;
}

const rubySteps = readdirSync(rubyDir)
  .filter((f) => /^step-\d+\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(rubyDir, f), "utf8")));
const tsSteps = JSON.parse(readFileSync(tsFile, "utf8"));

const EMPTY = { tables: {}, order: { card_acts: [], card_actions: [] } };
let prevRuby = EMPTY;
let prevTs = EMPTY;
const report = { steps: [], totals: { steps: 0, stateMatching: 0, deltaMatching: 0 } };
for (const ts of tsSteps) {
  const ruby = rubySteps.find((r) => Number(r.step) === Number(ts.step));
  const entry = {
    step: ts.step,
    label: ts.label,
    rubyOk: ruby ? (ruby.detail?.ok ?? null) : null,
    rubyError: ruby?.detail?.error ?? null,
    tsOk: ts.detail?.ok ?? null,
    tsError: ts.detail?.error ?? null,
    stateFaults: [],
    deltaFaults: [],
  };
  if (ruby === undefined) {
    entry.stateFaults.push({ kind: "missing-ruby-step" });
    entry.deltaFaults.push({ kind: "missing-ruby-step" });
  } else {
    const a = normalise(ruby.state);
    const b = normalise(ts.state);
    entry.stateFaults = diffState(a, b);
    entry.deltaFaults = diffState(delta(prevRuby, a), delta(prevTs, b));
    prevRuby = a;
    prevTs = b;
  }
  report.steps.push(entry);
  report.totals.steps += 1;
  if (entry.stateFaults.length === 0) report.totals.stateMatching += 1;
  if (entry.deltaFaults.length === 0) report.totals.deltaMatching += 1;
}
report.passRate = {
  state: `${report.totals.stateMatching}/${report.totals.steps}`,
  delta: `${report.totals.deltaMatching}/${report.totals.steps}`,
};
const text = JSON.stringify(report, null, 2) + "\n";
if (reportFile) writeFileSync(reportFile, text);
else process.stdout.write(text);
for (const s of report.steps) {
  console.error(
    `${String(s.step).padStart(2)} ${s.label.padEnd(48)} ruby=${s.rubyOk} ts=${s.tsOk} ` +
      `state=${s.stateFaults.length} delta=${s.deltaFaults.length}`,
  );
}
console.error(`state ${report.passRate.state} matching, delta ${report.passRate.delta} matching`);
process.exit(report.totals.steps > 0 && report.totals.stateMatching === report.totals.steps ? 0 : 1);
