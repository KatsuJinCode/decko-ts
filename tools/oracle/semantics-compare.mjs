// semantics-compare.mjs -- diff the Ruby and TypeScript semantics answers.
//
// Scoring is at ITEM level, not question level: a question whose answer is a
// list of 47,235 cards scores as 47,235 items, so a single naming or
// permission difference cannot hide inside a bulk question's pass mark.
//
// A list of records is compared record by record (deep equality per index);
// a list of scalars is compared for membership and for order separately,
// because "the wrong cards" and "the right cards in the wrong order" are
// different bugs. An object answer scores one item per top-level key.
// view_defs_full, event_defs_full, role_permissions, id_fetch and
// inflection_rows have their own scorers (below).
//
// Every item is attributed to the Ruby mod whose code answers it, so the
// report can say per mod what was asked and what matched.
//
// usage: node semantics-compare.mjs <ruby1.json[,ruby2.json,...]> <ts.json> <questions.json> <out.json>
//   later Ruby files override earlier ones per question id.

import { readFileSync, writeFileSync } from "node:fs";

const [rubyPaths, tsPath, questionsPath, outPath] = process.argv.slice(2);
const ruby = {};
for (const p of rubyPaths.split(",")) Object.assign(ruby, JSON.parse(readFileSync(p, "utf8")).answers);
const ts = JSON.parse(readFileSync(tsPath, "utf8")).answers;
const questions = JSON.parse(readFileSync(questionsPath, "utf8")).questions;

// NORMALISATIONS (every one is listed in the report):
//  1. Boolean storage form: SQLite integer 0/1 == false/true.
//  2. Absent vs null: a key one engine omits and the other sets to null.
//  3. Ruby predicates that answer nil for "no" (Cardname#rstar? on a simple
//     name): nil == false for the name-algebra predicate keys only.
//  4. Module names: Ruby "Card::Set::All::History::Views::HtmlFormat" and
//     the TS registry's "All::History::Views" / "all/history/views" name the
//     same set module (format suffix and namespace stripped, CamelCase to
//     snake_case for paths).
//  8. Rendered HTML (render_core): data-slot-id is a random per-render
//     token in both engines and is masked, as in the byte gate.
// Nothing else is masked. Ids are compared.
const PREDICATE_KEYS = new Set(["rstar", "star", "simple", "compound", "relative", "absolute", "starts_with_joint"]);
function norm(v, key) {
  if (v === 0 || v === false) return false;
  if (v === 1 || v === true) return true;
  if (v === undefined) return null;
  if (v === null && key !== undefined && PREDICATE_KEYS.has(key)) return false;
  if (key === "core" && typeof v === "string") return v.replace(/data-slot-id="[0-9a-f]+"/g, 'data-slot-id="X"');
  return v;
}
const isErr = (v) => typeof v === "string" && v.startsWith("ERR:");
const isNotPorted = (v) => typeof v === "string" && v.startsWith("ERR:NotPorted");
//  5. Errors: the same rejection carries a different exception class name in
//     each language (Card::Error::BadQuery vs CqlBadQuery); two errors match
//     when their messages match.
//  7. Ruby's NoMethodError message ends with the receiver's inspect
//     ("for #<Card:0x...>", "for an instance of Card"), which carries a
//     per-process object address: an undefined-method error matches on the
//     method name alone.
const errMessage = (v) => {
  const m = /^ERR:(?:[A-Za-z0-9_]+::)*[A-Za-z0-9_]+:(.*)$/s.exec(v);
  const msg = m === null ? v : m[1].trim();
  const nm = /^undefined method `([^']+)'/.exec(msg);
  return nm === null ? msg : `undefined method \`${nm[1]}'`;
};

function snake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
}
/** Canonical set-module path: "all/history/views". */
function modulePath(owner) {
  if (owner === undefined || owner === null) return "";
  let s = String(owner);
  if (s.includes("/")) return s.toLowerCase();
  s = s.replace(/^Card::Set::/, "").replace(/::(Html|Base|Text|Json|Css|Js|Rss|Email\w*|Csv|File)?Format$/, "");
  return s.split("::").map(snake).join("/");
}
const RUBY_MOD_ALIASES = (m) => String(m ?? "").replace(/^card-mod-/, "");

// --------------------------------------------------------------- attribution
// The Ruby source that answers each kind of question (located in the frozen
// gem set; see the report's attribution table).
function attribute(kind, field) {
  switch (kind) {
    case "rule_cards":
    case "per_card":
      if (field === "read_rule_id" || field === "read_rule_class") return "card-mod-permissions";
      return "core";
    case "set_subcard_order":
      return field === "visible_setting_codenames" ? "card-mod-rules" : "core";
    case "read_all":
    case "role_permissions":
    case "roles":
      return "card-mod-permissions";
    default:
      return "core";
  }
}

// ------------------------------------------------------------------- diffing
function diffDeep(path, a, b, diffs, key) {
  const isObjA = a !== null && typeof a === "object";
  const isObjB = b !== null && typeof b === "object";
  if (!isObjA || !isObjB) {
    if (isErr(a) && isErr(b) && !isNotPorted(b) && errMessage(a) === errMessage(b)) return;
    if (norm(a, key) !== norm(b, key)) {
      diffs.push({
        path, ruby: a ?? null, ts: b ?? null,
        class: isNotPorted(b) ? "not-ported" : isErr(a) || isErr(b) ? "error-mismatch" : "value",
      });
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
  for (const k of [...keys].sort()) diffDeep(`${path}.${k}`, a[k], b[k], diffs, k);
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
    rubyLen: a.length, tsLen: b.length, firstDiffIndex: firstDiff,
    rubyAt: firstDiff >= 0 ? a[firstDiff] ?? null : null,
    tsAt: firstDiff >= 0 ? b[firstDiff] ?? null : null,
    onlyInRubyCount: onlyA.length, onlyInTsCount: onlyB.length,
    onlyInRuby: onlyA.slice(0, 20), onlyInTs: onlyB.slice(0, 20),
  };
}

// ------------------------------------------------------------ mod tallies
const perMod = {};
function tally(mod, category, pass, notPorted = false) {
  const m = (perMod[mod] ??= { items: 0, passed: 0, notPorted: 0, byCategory: {} });
  m.items += 1;
  if (pass) m.passed += 1;
  if (notPorted) m.notPorted += 1;
  const c = (m.byCategory[category] ??= { items: 0, passed: 0 });
  c.items += 1;
  if (pass) c.passed += 1;
}

// ---------------------------------------------------------- custom scorers
function scoreViews(q, a, b) {
  // Item = (set, view) in the union. Presence must agree. Owner agreement is
  // a second measure, counted where TS has a set-module owner (not ENGINE).
  const diffs = [];
  let items = 0;
  let passed = 0;
  const owner = { compared: 0, agreed: 0, engineFlat: 0 };
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ra = a[i];
    const tb = b[i];
    if (ra?.missing || tb?.missing) {
      items += 1;
      if (ra?.missing && tb?.missing) passed += 1;
      else diffs.push({ path: `${q.id}.${i}`, class: "value", ruby: ra?.missing ?? null, ts: tb?.missing ?? null });
      continue;
    }
    const rv = new Map((ra?.views ?? []).map((v) => [v.view, v]));
    const tv = new Map((tb?.views ?? []).map((v) => [v.view, v]));
    for (const name of new Set([...rv.keys(), ...tv.keys()])) {
      items += 1;
      const r = rv.get(name);
      const t = tv.get(name);
      const mod = r?.mod ?? "ts-only";
      const ok = r !== undefined && t !== undefined;
      if (ok) passed += 1;
      else diffs.push({ path: `${q.id}.${i}.${name}`, set: ra.set, view: name, class: "membership",
        side: r === undefined ? "ts-only" : "ruby-only", rubyOwner: r?.owner ?? null, rubyMod: r?.mod ?? null, tsOwner: t?.owner ?? null });
      tally(mod, "views", ok);
      if (ok) {
        if (t.owner === "ENGINE") owner.engineFlat += 1;
        else {
          owner.compared += 1;
          if (modulePath(r.owner) === modulePath(t.owner)) owner.agreed += 1;
          else diffs.push({ path: `${q.id}.${i}.${name}.owner`, set: ra.set, view: name, class: "owner",
            rubyOwner: r.owner, rubyMod: r.mod, tsOwner: t.owner });
        }
      }
    }
  }
  return { items, passed, diffs, extra: { owner } };
}

function scoreEvents(q, a, b) {
  const diffs = [];
  let items = 0;
  let passed = 0;
  let abstractIgnored = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ra = a[i];
    const tb = b[i];
    if (ra?.missing || tb?.missing) continue;
    const rv = new Map((ra?.events ?? []).map((v) => [v.event, v]));
    const tv = new Map((tb?.events ?? []).map((v) => [v.event, v]));
    for (const name of new Set([...rv.keys(), ...tv.keys()])) {
      const r = rv.get(name);
      const t = tv.get(name);
      if (r === undefined && t?.abstract) { abstractIgnored += 1; continue; }
      items += 1;
      const ok = r !== undefined && t !== undefined;
      const mod = r?.mod ?? (t ? `card-mod-${t.mod}` : "unknown");
      if (ok) passed += 1;
      else diffs.push({ path: `${q.id}.${i}.${name}`, set: ra.set, event: name, class: "membership",
        side: r === undefined ? "ts-only" : "ruby-only", rubyOwner: r?.owner ?? null, rubyMod: r?.mod ?? null,
        tsOwner: t?.owner ?? null });
      tally(mod === "card-mod-core" ? "core" : mod, "events", ok);
    }
  }
  return { items, passed, diffs, extra: { abstractIgnored } };
}

function scoreRolePermissions(q, a, b) {
  const diffs = [];
  let items = 0;
  let passed = 0;
  const perRole = {};
  if (!Array.isArray(b)) return { items: 1, passed: 0, diffs: [{ path: String(q.id), class: "missing", ts: b }] };
  const tsByRole = new Map(b.map((x) => [x.role, x]));
  const tasks = ["read", "create", "update", "delete"];
  for (const ra of a) {
    const tb = tsByRole.get(ra.role);
    if (ra.verdicts === null) continue;
    const pr = (perRole[ra.role] ??= { items: 0, passed: 0, byTask: {} });
    for (let i = 0; i < ra.verdicts.length; i++) {
      const rv = ra.verdicts[i];
      const tv = tb?.verdicts?.[i];
      for (let k = 0; k < 4; k++) {
        if (rv[1] === "missing") continue;
        items += 1;
        pr.items += 1;
        const bt = (pr.byTask[tasks[k]] ??= { items: 0, passed: 0 });
        bt.items += 1;
        const ok = tv !== undefined && norm(rv[k + 1]) === norm(tv[k + 1]);
        if (ok) { passed += 1; pr.passed += 1; bt.passed += 1; }
        else if (diffs.length < 400) diffs.push({ path: `${q.id}.${ra.role}.${rv[0]}.${tasks[k]}`, class: "value",
          role: ra.role, card: rv[0], task: tasks[k], ruby: rv[k + 1], ts: tv?.[k + 1] ?? null });
        tally("card-mod-permissions", "role_permissions", ok);
      }
    }
  }
  return { items, passed, diffs, extra: { perRole } };
}

function scoreIdFetch(q, a, b) {
  const diffs = [];
  let passed = 0;
  for (let i = 0; i < a.length; i++) {
    const ok = norm(a[i].fetch_by_id) === norm(b?.[i]?.fetch_by_id);
    if (ok) passed += 1;
    else diffs.push({ path: `${q.id}.${i}`, class: "value", id: a[i].id, ruby: a[i].fetch_by_id, ts: b?.[i]?.fetch_by_id ?? null,
      lexicon_name: a[i].lexicon_name, left_id: a[i].row?.left_id ?? null, right_id: a[i].row?.right_id ?? null });
    tally("core", "identity", ok);
  }
  return { items: a.length, passed, diffs };
}

function scoreInflection(q, a, b) {
  // Engine behaviour on mirror-keyed rows vs Ruby's under the card gem's own
  // inflections with the mirror's keys (the state the engine is in when it
  // reads such a deck is the captured-keys state; both are scored).
  const diffs = [];
  let items = 0;
  let passed = 0;
  const state = (a.states ?? []).find((s) => s.state === "card_gem_inflections+captured_keys");
  const tsRows = new Map((b?.rows ?? []).map((r) => [r.id, r]));
  for (const r of state?.rows ?? []) {
    const t = tsRows.get(r.id);
    for (const [rk, tk] of [["fetch_by_name", "fetch_by_name"], ["fetch_by_id", "fetch_by_id"], ["computed_key", "computed_key"]]) {
      items += 1;
      const ok = t !== undefined && norm(r[rk]) === norm(t[tk]);
      if (ok) passed += 1;
      else diffs.push({ path: `${q.id}.${r.id}.${rk}`, class: "value", name: r.name, ruby: r[rk], ts: t?.[tk] ?? null });
      tally("core", "naming", ok);
    }
  }
  return { items, passed, diffs };
}

const CUSTOM = {
  view_defs_full: scoreViews,
  event_defs_full: scoreEvents,
  role_permissions: scoreRolePermissions,
  id_fetch: scoreIdFetch,
  inflection_rows: scoreInflection,
};

// --------------------------------------------------------------- the loop
const results = [];
let totalItems = 0;
let passedItems = 0;
let notPortedItems = 0;

for (const question of questions) {
  const id = String(question.id);
  const a = ruby[id];
  const b = ts[id];
  if (b === "SUPERSEDED") {
    results.push({ id: Number(id), category: question.category, kind: question.kind, items: 0, passed: 0, status: "superseded" });
    continue;
  }
  if (a === undefined || b === undefined) {
    results.push({ id: Number(id), category: question.category, kind: question.kind, items: 0, passed: 0,
      status: "missing", note: a === undefined ? "no ruby answer" : "no typescript answer" });
    continue;
  }

  let items;
  let passed;
  let diffs;
  let extra;
  let notPorted = 0;
  if (CUSTOM[question.kind]) {
    ({ items, passed, diffs, extra } = CUSTOM[question.kind](question, a, b));
  } else {
    diffs = [];
    diffDeep(id, a, b, diffs);
    const scalarList = Array.isArray(a) && a.every((x) => x === null || typeof x !== "object");
    let itemFailures;
    if (scalarList) {
      items = Math.max(a.length, Array.isArray(b) ? b.length : 0) + 1;
      const d = diffs[0];
      itemFailures = d === undefined ? 0
        : d.class === "order" ? 1
        : d.class === "membership" ? d.onlyInRubyCount + d.onlyInTsCount + (d.firstDiffIndex >= 0 ? 1 : 0)
        : items;
      itemFailures = Math.min(items, itemFailures);
      for (let i = 0; i < items; i++) tally(attribute(question.kind), question.category, i >= itemFailures);
    } else if (Array.isArray(a)) {
      // Item = one record x one top-level field, so a record that differs on
      // one field does not fail its other fields.
      items = 0;
      const bad = new Set(diffs.map((d) => {
        const rest = d.path.slice(id.length + 1).split(".");
        return `${rest[0]}.${rest[1] ?? ""}`;
      }));
      const np = new Set(diffs.filter((d) => d.class === "not-ported").map((d) => {
        const rest = d.path.slice(id.length + 1).split(".");
        return `${rest[0]}.${rest[1] ?? ""}`;
      }));
      itemFailures = 0;
      const n = Math.max(a.length, Array.isArray(b) ? b.length : 0);
      for (let i = 0; i < n; i++) {
        const ra = a[i];
        const tb = Array.isArray(b) ? b[i] : undefined;
        const fields = ra !== null && typeof ra === "object" && !Array.isArray(ra)
          ? new Set([...Object.keys(ra), ...(tb && typeof tb === "object" ? Object.keys(tb) : [])])
          : new Set([""]);
        for (const f of fields) {
          items += 1;
          const key = `${i}.${f}`;
          const fail = bad.has(key) || bad.has(`${i}.`);
          if (fail) itemFailures += 1;
          if (np.has(key)) notPorted += 1;
          tally(attribute(question.kind, f), question.category, !fail, np.has(key));
        }
      }
    } else if (a !== null && typeof a === "object") {
      const keys = new Set([...Object.keys(a), ...(b && typeof b === "object" ? Object.keys(b) : [])]);
      items = keys.size;
      const bad = new Set(diffs.map((d) => d.path.slice(id.length + 1).split(".")[0]));
      itemFailures = bad.size;
      for (const k of keys) tally(attribute(question.kind, k), question.category, !bad.has(k));
    } else {
      items = 1;
      itemFailures = diffs.length > 0 ? 1 : 0;
      tally(attribute(question.kind), question.category, itemFailures === 0);
    }
    passed = Math.max(0, items - itemFailures);
  }

  totalItems += items;
  passedItems += passed;
  notPortedItems += notPorted;
  results.push({
    id: Number(id), category: question.category, kind: question.kind,
    items, passed, notPorted, status: diffs.length === 0 ? "pass" : "fail",
    diffCount: diffs.length, diffs: CUSTOM[question.kind] ? diffs : diffs.slice(0, 400), ...(extra ? { extra } : {}),
  });
}

const byCategory = {};
for (const r of results) {
  const c = (byCategory[r.category] ??= { items: 0, passed: 0, notPorted: 0, questions: 0, failing: 0, missing: 0, superseded: 0 });
  c.questions += 1;
  if (r.status === "missing") { c.missing += 1; continue; }
  if (r.status === "superseded") { c.superseded += 1; continue; }
  c.items += r.items;
  c.passed += r.passed;
  c.notPorted += r.notPorted ?? 0;
  if (r.status === "fail") c.failing += 1;
}

const summary = {
  passRate: totalItems === 0 ? 0 : passedItems / totalItems,
  passRateExcludingNotPorted: totalItems - notPortedItems === 0 ? 0 : passedItems / (totalItems - notPortedItems),
  passedItems, totalItems, notPortedItems,
  questions: results.length,
  failingQuestions: results.filter((r) => r.status === "fail").length,
  missingQuestions: results.filter((r) => r.status === "missing").length,
  supersededQuestions: results.filter((r) => r.status === "superseded").length,
  byCategory, perMod,
};
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 1));
process.stdout.write(
  `SEMANTICS ${passedItems}/${totalItems} items (${(summary.passRate * 100).toFixed(2)}%), ` +
    `${notPortedItems} not ported, ${summary.failingQuestions}/${summary.questions} questions failing, ` +
    `${summary.missingQuestions} missing, ${summary.supersededQuestions} superseded\n`,
);
for (const [cat, c] of Object.entries(byCategory)) {
  process.stdout.write(`  ${cat}: ${c.passed}/${c.items} (${c.questions} q, ${c.failing} failing, ${c.missing} missing)\n`);
}
process.stdout.write("PER MOD\n");
for (const [mod, m] of Object.entries(perMod).sort()) {
  const cats = Object.entries(m.byCategory).map(([k, v]) => `${k} ${v.passed}/${v.items}`).join(", ");
  process.stdout.write(`  ${mod}: ${m.passed}/${m.items} (${cats})\n`);
}
