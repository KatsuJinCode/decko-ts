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
//      difference. card_changes values for the type_id, left_id and right_id
//      fields (fields 1, 4 and 5), and cards.type_id and read_rule_id, hold
//      a raw card id and map the same way when the id is a probe card. The GLOBAL id order of acts and actions is compared as a
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
// DELIBERATE DIFFERENCES. An optional fourth argument names a JSON file of
// declared, reasoned differences: { differences: [{ step, title, reason,
// deltaFaults: [...] }] }. A step whose delta faults are EXACTLY the declared
// list (same faults, same values, nothing more or less) is counted as a
// deliberate difference, not a mismatch. A declared step whose faults change
// in any way, or that starts matching, is reported as a mismatch, so the
// declaration cannot drift from what the engines actually do.
//
// Exit 0 when every step's state matches, 1 on any difference, 2 on a missing
// input (never silently skips).

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, pbkdf2Sync } from "node:crypto";

const [rubyDir, tsFile, reportFile, expectFile] = process.argv.slice(2);
if (!rubyDir || !tsFile) {
  console.error(
    "usage: compare-persist.mjs <rubyStepsDir> <tsStateJson> [reportJson] [deliberateDifferencesJson]",
  );
  process.exit(2);
}
for (const p of [rubyDir, tsFile, ...(expectFile ? [expectFile] : [])]) {
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

// 4. ACCOUNT SECRETS. A +*salt card's content is random (a digest of the
//    clock); it becomes "<salt>". A +*password card's content is
//    Auth.encrypt(password, salt) = SHA1("<salt>--<password>--") over its own
//    account's salt; it becomes "<digest of P>" when it is that digest of one
//    of the probe's plaintexts P, and "<digest of an unknown password>"
//    otherwise. A wrong digest therefore still differs. The port's PBKDF2
//    hashes (random salt) become "<pbkdf2 digest of P>" the same way, so a
//    PBKDF2 hash still differs from Ruby's digest: the difference is
//    declared, not normalised away. Both dumps record the deck's salt and
//    password codename ids (codename_ids).
const PROBE_PASSWORDS = ["Probe-pass-123", "Probe-pass-456"];
function accountSecrets(state, ids) {
  if (!ids || !state?.cards) return state;
  const saltOf = new Map();
  for (const c of state.cards) {
    if (Number(c.right_id) === Number(ids.salt)) saltOf.set(Number(c.left_id), c.db_content ?? "");
  }
  const cards = state.cards.map((c) => {
    if (Number(c.right_id) === Number(ids.salt)) return { ...c, db_content: "<salt>" };
    if (Number(c.right_id) !== Number(ids.password)) return c;
    // The port's PBKDF2 format (docs/SECURITY.md, "Passwords"): its salt is
    // random, so it becomes "<pbkdf2 digest of P>" when it verifies P.
    const pbkdf2 = /^pbkdf2_sha256\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(c.db_content ?? "");
    if (pbkdf2 !== null) {
      const plain = PROBE_PASSWORDS.find(
        (p) =>
          pbkdf2Sync(p, Buffer.from(pbkdf2[2], "base64"), Number(pbkdf2[1]), 32, "sha256").toString("base64") ===
          pbkdf2[3],
      );
      return {
        ...c,
        db_content: plain === undefined ? "<pbkdf2 digest of an unknown password>" : `<pbkdf2 digest of ${plain}>`,
      };
    }
    const salt = saltOf.get(Number(c.left_id)) ?? "";
    const plain = PROBE_PASSWORDS.find(
      (p) => createHash("sha1").update(`${salt}--${p}--`).digest("hex") === c.db_content,
    );
    return { ...c, db_content: plain === undefined ? "<digest of an unknown password>" : `<digest of ${plain}>` };
  });
  return { ...state, cards };
}

/** state -> { table: Map(key -> row) , order: { acts: [...], actions: [...] } } */
function normalise(state) {
  const names = composedNames(state.cards ?? []);
  const card = (v) => (v === null || v === undefined ? null : (names.get(Number(v)) ?? `#${v}`));
  // An id list stores items as "~<id>": a probe card id there maps to its name.
  // An attachment identifier "~<card>/<action><ext>" maps both ids.
  const idMarks = (v) =>
    typeof v === "string"
      ? v
          .replace(/~(\d+)\/(\d+)/g, (m, id, action) =>
            names.has(Number(id)) ? `~${card(id)}/${actionKey(action)}` : m,
          )
          .replace(/~(\d+)(?![\d/])/g, (m, id) => (names.has(Number(id)) ? `~${card(id)}` : m))
      : v;
  // A column that may name a probe card or a deck card (type_id,
  // read_rule_id): probe cards map to their name, deck cards stay raw.
  const probeOrRaw = (v) => (v !== null && v !== undefined && names.has(Number(v)) ? card(v) : fold(v));

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
    put("cards", card(r.id), {
      ...row,
      id: card(r.id),
      left_id: card(r.left_id),
      right_id: card(r.right_id),
      type_id: probeOrRaw(r.type_id),
      read_rule_id: probeOrRaw(r.read_rule_id),
      db_content: idMarks(row.db_content),
    });
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
    // Fields 1, 4 and 5 (type_id, left_id, right_id) store a raw card id as text.
    const value =
      [1, 4, 5].includes(Number(r.field)) && r.value !== null && names.has(Number(r.value))
        ? card(r.value)
        : Number(r.field) === 2
          ? idMarks(row.value)
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
  // 5. STORED FILES. A file name starts with its action id ("<action><ext>",
  //    "<action>-<version><ext>"), which maps like any action id.
  for (const r of state.files ?? []) {
    const file = String(r.file).replace(/^(\d+)/, (m, action) => actionKey(action));
    const k = `${card(r.card_id)}/${file}`;
    put("files", k, { id: k, sha1: r.sha1 ?? null });
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

const TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_virtuals", "files"];

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

const declared = new Map();
if (expectFile) {
  for (const d of JSON.parse(readFileSync(expectFile, "utf8")).differences ?? []) {
    declared.set(Number(d.step), d);
  }
}
/** Order-insensitive, key-order-insensitive identity of a fault list. */
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const EMPTY = { tables: {}, order: { card_acts: [], card_actions: [] } };
let prevRuby = EMPTY;
let prevTs = EMPTY;
const report = {
  steps: [],
  totals: { steps: 0, stateMatching: 0, deltaMatching: 0, deltaDeliberate: 0 },
};
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
    const a = normalise(accountSecrets(ruby.state, ruby.codename_ids));
    const b = normalise(accountSecrets(ts.state, ts.codename_ids));
    entry.stateFaults = diffState(a, b);
    entry.deltaFaults = diffState(delta(prevRuby, a), delta(prevTs, b));
    prevRuby = a;
    prevTs = b;
  }
  const decl = declared.get(Number(ts.step));
  entry.deliberate = null;
  if (decl !== undefined) {
    const exact =
      entry.deltaFaults.length > 0 && canonical(entry.deltaFaults) === canonical(decl.deltaFaults ?? []);
    entry.deliberate = { title: decl.title, declaredFaultsMatch: exact };
  }
  // A mismatch is any delta fault not covered, exactly, by a declaration.
  entry.unexpectedDeltaFaults = entry.deliberate?.declaredFaultsMatch ? [] : entry.deltaFaults;
  if (decl !== undefined && !entry.deliberate.declaredFaultsMatch && entry.deltaFaults.length === 0) {
    // The declared difference vanished: the declaration is stale.
    entry.unexpectedDeltaFaults = [{ kind: "declared-difference-absent", step: ts.step }];
  }
  report.steps.push(entry);
  report.totals.steps += 1;
  if (entry.stateFaults.length === 0) report.totals.stateMatching += 1;
  if (entry.deltaFaults.length === 0) report.totals.deltaMatching += 1;
  else if (entry.unexpectedDeltaFaults.length === 0) report.totals.deltaDeliberate += 1;
}
report.passRate = {
  state: `${report.totals.stateMatching}/${report.totals.steps}`,
  delta: `${report.totals.deltaMatching}/${report.totals.steps}`,
  deltaDeliberate: report.totals.deltaDeliberate,
  deltaUnexpected:
    report.totals.steps - report.totals.deltaMatching - report.totals.deltaDeliberate,
};
const text = JSON.stringify(report, null, 2) + "\n";
if (reportFile) writeFileSync(reportFile, text);
else process.stdout.write(text);
for (const s of report.steps) {
  console.error(
    `${String(s.step).padStart(2)} ${s.label.padEnd(48)} ruby=${s.rubyOk} ts=${s.tsOk} ` +
      `state=${s.stateFaults.length} delta=${s.deltaFaults.length}` +
      (s.deliberate ? ` deliberate=${s.deliberate.declaredFaultsMatch ? "as-declared" : "DRIFTED"}` : ""),
  );
}
console.error(
  `state ${report.passRate.state} matching, delta ${report.passRate.delta} matching, ` +
    `${report.passRate.deltaDeliberate} deliberate, ${report.passRate.deltaUnexpected} unexpected`,
);
process.exit(report.totals.steps > 0 && report.totals.stateMatching === report.totals.steps ? 0 : 1);
