// behaviour-probes.mjs — writes the operation lists that grade what each mod
// DECLARES, on the synthetic-v2 deck, so that both engines answer the same
// questions and the answers are compared with Ruby's.
//
//   node tools/compat-report/behaviour-probes.mjs plan <fixtureDir> <gemDir> [--out <dir>]
//
// <fixtureDir> is a fixture holding deck/deck.sqlite3 (the synthetic-v2 deck).
// <gemDir> is <GEM_HOME>/gems. The planner writes, into <out> (default:
// <fixtureDir>/ops):
//
//   render.jsonl     one html render per declared html-like view declaration
//                    (view@file), on the first deck card that the declaring
//                    file's set contains, as admin. Attribution is the same
//                    setContains rule behaviour.mjs uses to credit a view.
//   scenarios.json   one scenario, "mod-event-probes": a baseline create,
//                    update and delete per shape, then for every event
//                    declaration a probe on a card its set contains, performing
//                    the write its `on:` names. Each write is one step, so its
//                    row delta is graded on its own.
//   probes.json      the plan: which declaration each op or step probes, which
//                    card and action, and why a declaration has no probe.
//
// A declaration with no probe is listed with its reason and is never credited.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { evaluateMod, gemDeclarations, loadGrades, setContains, setOfFile, specificDeclarations } from "./behaviour.mjs";

const HTML_LIKE = new Set(["html", "base"]);
const GENERAL = new Set(["all", "abstract", "lib"]);

// ---------------------------------------------------------------------------
// deck index: each live card with the facts a set declaration is matched on
// ---------------------------------------------------------------------------

export function deckIndex(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db
    .prepare("SELECT c.id, c.name, c.key, c.codename, c.left_id, c.right_id, c.type_id, t.codename AS tcode, t.name AS tname FROM cards c LEFT JOIN cards t ON c.type_id = t.id WHERE c.trash = 0 OR c.trash IS NULL")
    .all();
  db.close();
  const byId = new Map(rows.map((r) => [r.id, r]));
  // A compound card has no stored name: derive it from its parts.
  const nameOf = (r, depth = 0) => {
    if (r.name) return r.name;
    if (r.left_id == null || r.right_id == null || depth > 8) return null;
    const l = byId.get(r.left_id);
    const rt = byId.get(r.right_id);
    const ln = l && nameOf(l, depth + 1);
    const rn = rt && nameOf(rt, depth + 1);
    return ln != null && rn != null ? `${ln}+${rn}` : null;
  };
  const cards = [];
  for (const r of rows) {
    const name = nameOf(r);
    if (name == null) continue;
    const facts = { codename: r.codename ?? null, type: r.tcode ?? null, compound: r.left_id != null && r.right_id != null };
    if (facts.compound) {
      const right = byId.get(r.right_id);
      const left = byId.get(r.left_id);
      facts.right = right?.codename ?? null;
      facts.right_name = right ? (right.name ?? "") : "";
      facts.left_type = left ? left.tcode ?? null : null;
    }
    cards.push({ id: r.id, name, typeName: r.tname ?? null, facts: { ...facts, name } });
  }
  return { cards, byCodename: new Map(cards.filter((c) => c.facts.codename && !c.facts.compound).map((c) => [c.facts.codename, c])) };
}

// ---------------------------------------------------------------------------
// render probes
// ---------------------------------------------------------------------------

export function planRenders(index, declarations) {
  const ops = [];
  const plan = [];
  let n = 0;
  for (const d of declarations) {
    const card = index.cards.find((c) => setContains(d.set, c.facts));
    if (!card) {
      plan.push({ decl: `${d.format}:${d.view}@${d.set.file}`, status: "no-card", reason: `no deck card is in set ${d.set.pattern}/${d.set.anchor ?? ""}` });
      continue;
    }
    const id = `probe-view:${++n}:${d.view}@${d.set.file}`;
    // A non-html view names its format; the harness renders it through that
    // format (the adapters refuse a format they cannot dispatch).
    const format = HTML_LIKE.has(d.format) ? undefined : d.format;
    ops.push({ id, op: "render", actor: "admin", card: card.name, view: d.view, ...(format ? { format } : {}) });
    plan.push({ decl: `${d.format}:${d.view}@${d.set.file}`, status: "planned", op: id, card: card.name });
  }
  return { ops, plan };
}

// ---------------------------------------------------------------------------
// event probes
// ---------------------------------------------------------------------------

// Each event declaration with the `on:` it names, from its source line(s).
// parseDeclarations (behaviour.mjs) records names only; the options follow the
// name on the same line or the next two, so they are read here.
export function eventDeclarations(gemPath) {
  const out = [];
  const files = walkRb(join(gemPath, "set")).concat(walkRb(join(gemPath, "lib")));
  for (const f of files) {
    const rel = f.slice(gemPath.length + 1).replaceAll("\\", "/");
    const set = setOfFile(rel);
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((raw, i) => {
      if (/^\s*#/.test(raw)) return;
      const m = raw.match(/^[ \t]*event[ \t]+:(?:"([^"]+)"|([A-Za-z0-9_?!]*(?:#\{[A-Za-z_][A-Za-z0-9_]*\}[A-Za-z0-9_?!]*)*))/);
      if (!m) return;
      const name = m[1] ?? m[2];
      if (!name || name.includes("#{")) return; // interpolated names are not probed
      const text = [raw, lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ");
      const on = text.match(/\bon:[ \t]*:([a-z_]+)/);
      const when = text.match(/\bwhen:[ \t]*:([A-Za-z0-9_?!]+)/);
      out.push({ event: name, set, file: rel, line: i + 1, on: on ? on[1] : null, when: when ? when[1] : null });
    });
  }
  return out;
}

function walkRb(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkRb(p, acc);
    else if (p.endsWith(".rb")) acc.push(p);
  }
  return acc;
}

// Which probe shape a declaration's set needs. Only sets whose membership the
// deck can realise are probed; the rest name their reason.
function probeShape(index, set) {
  if (GENERAL.has(set.pattern)) return { kind: "plain" };
  if (set.pattern === "type") {
    const t = index.cards.find((c) => c.facts.codename === set.anchor && !c.facts.compound && c.facts.type === "cardtype");
    if (!t) return { kind: "none", reason: `no cardtype with codename ${set.anchor} in the deck` };
    return { kind: "typed", typeName: t.name, typeCode: set.anchor };
  }
  if (set.pattern === "right") {
    const r = index.cards.find((c) => c.facts.codename === set.anchor && !c.facts.compound && (c.name ?? "").startsWith("*"));
    if (!r) return { kind: "none", reason: `no right card with codename ${set.anchor} in the deck` };
    return { kind: "right", rightName: r.name, rightCode: set.anchor };
  }
  // A type_plus_right set (Type+*right) and a rule set (*set+*right) name a
  // compound card, not a card the planner may create: probe an existing one.
  if (set.pattern === "type_plus_right") {
    const c = index.cards.find((x) => x.facts.compound && x.facts.left_type === set.anchor && x.facts.right === set.sub);
    if (!c) return { kind: "none", reason: `no card of type ${set.anchor} with right ${set.sub} in the deck` };
    return { kind: "self", cardName: c.name };
  }
  if (set.pattern === "rule") {
    const c = index.cards.find((x) => x.facts.compound && x.facts.left_type === "set" && (x.facts.right_name ?? "").startsWith("*"));
    if (!c) return { kind: "none", reason: "no rule card (*set+*setting) in the deck" };
    return { kind: "self", cardName: c.name };
  }
  if (set.pattern === "self") {
    const s = index.cards.find((c) => c.facts.codename === set.anchor && !c.facts.compound);
    if (!s) return { kind: "none", reason: `no card with codename ${set.anchor} in the deck` };
    return { kind: "self", cardName: s.name };
  }
  return { kind: "none", reason: `set pattern ${set.pattern} is not probed by this planner` };
}

// The steps a probe performs for one event. `on` is the declaration's `on:`.
// The probe card is created (save/create), then updated (update), then deleted
// (delete), as far as its `on:` needs. Steps are harness write operations:
// { op: "write", actor, action, card, fields: { type?, content?, fields? } }.
function probeSteps(shape, on, tag) {
  const cardFor = (shape) => {
    if (shape.kind === "plain") return { name: `Probe Plain ${tag}`, type: "RichText" };
    if (shape.kind === "typed") return { name: `Probe ${shape.typeName} ${tag}`, type: shape.typeName };
    if (shape.kind === "right") return { name: `Probe ${tag}+${shape.rightName}`, type: "RichText" };
    return { name: shape.cardName };
  };
  const card = cardFor(shape);
  const steps = [];
  const write = (action, fields) => ({ op: "write", actor: "admin", action, card: card.name, fields });
  if (shape.kind === "self") {
    steps.push(write("update", { content: `probe ${tag}` }));
    return { card: card.name, steps, action: "update" };
  }
  steps.push(write("create", card.type ? { type: card.type, content: `probe ${tag}` } : { content: `probe ${tag}` }));
  if (on === "update" || on === "save" || on === null) {
    steps.push(write("update", { content: `probe ${tag} updated` }));
  }
  if (on === "delete") {
    steps.push(write("delete", {}));
  }
  return { card: card.name, steps, action: on ?? "create" };
}

export function planEvents(index, declarations) {
  const steps = [];
  const plan = [];
  // Baselines: the same write shapes on a card that carries no declaration of
  // its own (a plain Basic card), so an event's effect can be seen against it.
  steps.push({ tag: "baseline:create", op: "write", actor: "admin", action: "create", card: "Probe Baseline Plain", fields: { type: "RichText", content: "baseline" } });
  steps.push({ tag: "baseline:update", op: "write", actor: "admin", action: "update", card: "Probe Baseline Plain", fields: { content: "baseline updated" } });
  steps.push({ tag: "baseline:delete", op: "write", actor: "admin", action: "delete", card: "Probe Baseline Plain", fields: {} });
  let n = 0;
  for (const d of declarations) {
    const shape = probeShape(index, d.set);
    if (shape.kind === "none") {
      plan.push({ event: d.event, file: d.file, status: "no-probe", reason: shape.reason });
      continue;
    }
    n++;
    const tag = `e${n}`;
    // A same-shape baseline: create, update and delete a card of the probe's
    // shape under a name that is not the probe's. The probe's rows are read
    // against it, so a row the event adds is seen. Shapes with no baseline
    // (the self card, which is the event's own card) are recorded as such.
    let base = null;
    if (shape.kind !== "self") {
      const baseName = shape.kind === "right" ? `Probe Base ${tag}+${shape.rightName}` : `Probe Base ${tag}`;
      const baseType = shape.kind === "typed" ? shape.typeName : "RichText";
      const b0 = steps.length;
      steps.push({ tag: `base:${tag}`, probe: tag, op: "write", actor: "admin", action: "create", card: baseName, fields: { type: baseType, content: `base ${tag}` } });
      steps.push({ tag: `base:${tag}`, probe: tag, op: "write", actor: "admin", action: "update", card: baseName, fields: { content: `base ${tag} updated` } });
      steps.push({ tag: `base:${tag}`, probe: tag, op: "write", actor: "admin", action: "delete", card: baseName, fields: {} });
      base = { card: baseName, steps: [b0, b0 + 2] };
    }
    const p = probeSteps(shape, d.on, tag);
    const first = steps.length;
    for (const s of p.steps) steps.push({ tag: `${d.event}`, probe: tag, ...s });
    plan.push({
      event: d.event,
      file: d.file,
      status: "planned",
      on: d.on,
      when: d.when,
      probe: tag,
      card: p.card,
      steps: [first, steps.length - 1],
      baseline: base,
    });
  }
  return { steps, plan };
}

// ---------------------------------------------------------------------------
// the whole plan for one fixture
// ---------------------------------------------------------------------------

export function planAll({ dbPath, gemRoot }) {
  const index = deckIndex(dbPath);
  const gems = readdirSync(gemRoot).filter((n) => n.startsWith("card-mod-")).sort();
  const declarations = [];
  const events = [];
  for (const g of gems) {
    const gp = join(gemRoot, g);
    const decl = gemDeclarations(gp);
    for (const v of decl.views) declarations.push({ ...v, gem: g });
    for (const e of eventDeclarations(gp)) events.push({ ...e, gem: g });
  }
  const renders = planRenders(index, declarations);
  const ev = planEvents(index, events);
  return { renders, events: ev, gems };
}

// Written ops: render.jsonl and scenarios.json, with the plan beside them.
export function writePlan({ fixtureDir, gemRoot, outDir }) {
  const p = planAll({ dbPath: join(fixtureDir, "deck", "deck.sqlite3"), gemRoot });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "render.jsonl"), p.renders.ops.map((o) => JSON.stringify(o)).join("\n") + "\n");
  // Scenario steps carry only the operation; the labels live in probes.json.
  const steps = p.events.steps.map(({ tag, probe, ...s }) => s);
  writeFileSync(join(outDir, "scenarios.json"), JSON.stringify({ scenarios: [{ id: "mod-event-probes", steps }] }, null, 1) + "\n");
  writeFileSync(
    join(outDir, "probes.json"),
    JSON.stringify(
      {
        format: "decko-mod-behaviour-probes/1",
        render: { planned: p.renders.ops.length, plan: p.renders.plan },
        events: { steps: p.events.steps.length, plan: p.events.plan },
        step_labels: p.events.steps.map((s, i) => ({ index: i, label: s.tag, probe: s.probe ?? null, action: s.action, card: s.card })),
      },
      null,
      1,
    ) + "\n",
  );
  return p;
}

// ---------------------------------------------------------------------------
// grading one mod
// ---------------------------------------------------------------------------

// The evidence for one mod, read from the committed grade records: the
// per-operation view grades (graded-ops.json) and the probe grades
// (graded-probes.json), put through the same set-membership attribution
// evaluateMod uses. This is the report's behaviour layer for that mod alone;
// the report is the same computation over every mod.
export function gradeMod(repo, modId, grades, specific = new Map(), probes = null) {
  const gems = join(gemDirFromEnv(), "gems");
  const name = readdirSync(gems).find((n) => n === modId || n === `${modId}-0.20.0` || n.replace(/-\d+\.\d+\.\d+$/, "") === modId);
  if (!name) throw new Error(`no installed card-mod gem matches "${modId}" under ${gems}`);
  return { gem: name, ...evaluateMod(repo, join(gems, name), name.replace(/-\d+\.\d+\.\d+$/, ""), grades, specific, probes) };
}

function gemDirFromEnv() {
  const gemHome = process.env.GEM_HOME;
  if (!gemHome) throw new Error("set GEM_HOME to the Ruby gem home (e.g. C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0)");
  return gemHome.endsWith("gems") ? join(gemHome, "..") : gemHome;
}

function reportMod(gem, b, asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify(b, null, 2) + "\n");
    return;
  }
  const s = b.summary;
  process.stdout.write(
    `${gem}  ${b.status}\n` +
      `  views: ${s.views} declared, ${s.views_graded_identical} graded identical, ${s.views_graded_differs} graded differing, ${s.views_test_named} only named by a test, ${s.views_unexercised} unexercised\n` +
      `  events: ${s.events} declared, ${s.events_graded_identical} graded identical on rows, ${s.events_graded_differs} graded differing, ${s.events_not_observed} ran with no effect seen, ${s.events_not_probed} with no probe, ${s.events_named ?? 0} only named by a test\n`,
  );
  for (const v of b.views) {
    if (v.evidence === "graded-identical") continue;
    process.stdout.write(`  VIEW  ${v.evidence}  ${v.format}:${v.view} [${v.set}]${v.ops ? ` ops: ${v.ops.join("; ")}` : ""}${v.tests ? ` tests: ${v.tests.join(", ")}` : ""}\n`);
  }
  for (const e of b.events) {
    if (e.evidence === "graded-identical") continue;
    process.stdout.write(
      `  EVENT ${e.evidence}  ${e.event}${e.source ? ` [${e.source}]` : ""}${e.probe ? ` probe ${e.probe} on ${e.card} (on: ${e.on ?? "none"}, when: ${e.when ?? "none"})` : ""}${e.differing_steps ? ` differs at: ${e.differing_steps.join("; ")}` : ""}${e.reason ? ` reason: ${e.reason}` : ""}${e.tests ? ` tests: ${e.tests.join(", ")}` : ""}\n`,
    );
  }
}

const cmd = process.argv[2];
if (process.argv[1] && basename(process.argv[1]) === "behaviour-probes.mjs" && cmd === "plan") {
  const [, , , fixtureDir, gemRoot, ...rest] = process.argv;
  const outIdx = rest.indexOf("--out");
  const outDir = outIdx >= 0 ? rest[outIdx + 1] : join(fixtureDir, "ops");
  const p = writePlan({ fixtureDir, gemRoot, outDir });
  const planned = p.events.plan.filter((x) => x.status === "planned").length;
  process.stdout.write(
    `render ops: ${p.renders.ops.length} (of ${p.renders.plan.length} html-like declarations; ${p.renders.plan.filter((x) => x.status !== "planned").length} without a card)\n` +
      `event probes: ${planned} of ${p.events.plan.length} event declarations; ${p.events.steps.length} scenario steps\n`,
  );
} else if (process.argv[1] && basename(process.argv[1]) === "behaviour-probes.mjs" && (cmd === "grade" || cmd === "grades")) {
  const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const here = dirname(fileURLToPath(import.meta.url));
  const grades = loadGrades(join(here, "graded-ops.json"));
  const probesFile = join(here, "graded-probes.json");
  const probes = existsSync(probesFile) ? JSON.parse(readFileSync(probesFile, "utf8")).grade : null;
  const gemRoot = join(gemDirFromEnv(), "gems");
  const gemPaths = readdirSync(gemRoot).filter((n) => n.startsWith("card-mod-")).map((n) => join(gemRoot, n));
  const specific = specificDeclarations(gemPaths);
  const asJson = process.argv.includes("--json");
  if (cmd === "grades") {
    const ids = readdirSync(gemRoot).filter((n) => n.startsWith("card-mod-")).sort();
    const rows = ids.map((n) => gradeMod(repo, n, grades, specific, probes));
    if (asJson) {
      process.stdout.write(JSON.stringify(rows.map((r) => ({ gem: r.gem, status: r.status, summary: r.summary })), null, 2) + "\n");
    } else {
      for (const r of rows) reportMod(r.gem, r, false);
      process.stdout.write(`\nbehaviour-complete: ${rows.filter((r) => r.status === "behaviour-complete").length} of ${rows.filter((r) => r.status !== "no-gradable-declarations").length} evaluated\n`);
    }
  } else {
    const modId = process.argv[3];
    if (!modId) throw new Error("usage: behaviour-probes.mjs grade <mod> [--json]");
    const r = gradeMod(repo, modId, grades, specific, probes);
    reportMod(r.gem, r, asJson);
    process.exitCode = r.status === "behaviour-complete" ? 0 : 1;
  }
}
