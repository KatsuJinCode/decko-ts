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
//   test-named — no graded operation renders it, but one of the mod's own
//              test files (tests/card/mod-loader/<mod>*.test.ts) names the
//              view in a string literal and that file carries
//              toBe('<literal>') pins. A pointer for the reader only: the
//              name match does not show what is asserted or where the
//              expected bytes came from, so it never counts as evidence.
//   named    — (events only) a test file anywhere under tests/ names the
//              event in a string literal. Also a pointer only.
//   unexercised — none of the above.
//
// Attribution is by view name AND set membership: an operation credits a
// declaration only when the operation's card is in the declaring file's set
// (self/right/type/type_plus_right/star/rstar/rule decided from the deck's
// codenames and types, recorded per operation in graded-ops.json; set cards
// are virtual and typed Set by name shape). all/, lib/ and abstract/ modules
// apply by name alone: abstract modules reach a card through include_set,
// which this layer does not resolve. Page operations (no view) credit no
// declaration. All fixture operations render the html format; a view a mod
// declares in base format (outside any format block, or `format do`) is
// inherited by html and is credited, every other format is not.
//
// A mod is behaviour-complete only when every view it declares is graded
// byte-identical to Ruby by a graded operation and it declares no event (no
// instrument here grades events). A mod whose views are all graded identical
// but which declares events is "views-graded-events-ungraded".

import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const HTML_LIKE = new Set(["html", "base"]);

// Parse a Ruby set file into view and event declarations with the format each
// view is declared under. A `format :x do` line opens a block that closes at
// the first `end` with the same indentation; a view outside any block (or in a
// bare `format do`) belongs to the base format.
//
// Two dynamic forms are expanded: a view or event declared inside a
// `%i[a b].each do |x|` loop with `view x` / `event :"..#{x}.."` is one
// declaration per list element; an event whose symbol interpolates a value
// the file does not enumerate (`event :store_#{column}_event`, carrierwave's
// mount_uploader) is recorded with the interpolation shown as `<column>`.
export function parseDeclarations(src) {
  const lines = src.split(/\r?\n/);
  const stack = []; // { kind: "format", fmt, indent } | { kind: "loop", names, var, indent }
  const views = [];
  const events = [];
  const currentFormat = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === "format") return stack[i].fmt;
    return "base";
  };
  const loopFor = (v) => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === "loop" && stack[i].var === v) return stack[i];
    return null;
  };
  const expand = (tmpl) => {
    // interpolate #{x} with loop values; otherwise mark the hole
    const holes = [...tmpl.matchAll(/#\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((h) => h[1]);
    if (!holes.length) return [tmpl];
    const loop = holes.map(loopFor).find(Boolean);
    if (!loop) return [tmpl.replace(/#\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "<$1>")];
    return loop.names.map((n) => tmpl.replaceAll(`#{${loop.var}}`, n).replace(/#\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "<$1>"));
  };
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
      stack.push({ kind: "format", fmt: m[1] ?? "base", indent });
      continue;
    }
    m = raw.match(/^[ \t]*%[iw][[(]([^\])]*)[\])]\.each[ \t]+do[ \t]*\|[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\|/);
    if (m) {
      stack.push({ kind: "loop", names: m[1].trim().split(/\s+/), var: m[2], indent });
      continue;
    }
    m = raw.match(/^[ \t]*view[ \t]*\(?[ \t]*:([A-Za-z0-9_?!]+)(?:[ \t]*,[ \t]*:([A-Za-z0-9_?!]+))?/);
    if (m) {
      views.push({ format: currentFormat(), view: m[1], alias: m[2] ?? null });
      continue;
    }
    m = raw.match(/^[ \t]*view[ \t]*\(?[ \t]*([a-z_][A-Za-z0-9_]*)\b/);
    if (m && loopFor(m[1])) {
      for (const n of loopFor(m[1]).names) views.push({ format: currentFormat(), view: n, alias: null });
      continue;
    }
    m = raw.match(/^[ \t]*event[ \t]+:(?:"([^"]+)"|([A-Za-z0-9_?!]*(?:#\{[A-Za-z_][A-Za-z0-9_]*\}[A-Za-z0-9_?!]*)*))/);
    if (m && (m[1] ?? m[2])) events.push(...expand(m[1] ?? m[2]));
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

// The set a declaring file belongs to, from its path under the gem:
// set/<pattern>/<anchor>.rb, set/<pattern>/<anchor>/<sub>.rb, or lib/.
export function setOfFile(rel) {
  const parts = rel.replaceAll("\\", "/").split("/");
  if (parts[0] !== "set") return { pattern: "lib", anchor: null, sub: null, file: rel };
  const strip = (x) => (x ? x.replace(/\.rb$/, "") : null);
  return { pattern: parts[1], anchor: strip(parts[2]), sub: strip(parts[3] ?? null), file: parts.join("/") };
}

export function gemDeclarations(gemPath) {
  const files = [...walk(join(gemPath, "set")), ...walk(join(gemPath, "lib"))].filter((f) =>
    f.endsWith(".rb"),
  );
  const views = new Map(); // "fmt:view@file" -> declaration
  const events = new Set();
  for (const f of files) {
    const set = setOfFile(f.slice(gemPath.length + 1));
    const d = parseDeclarations(readFileSync(f, "utf8"));
    for (const v of d.views) views.set(`${v.format}:${v.view}@${set.file}`, { ...v, set });
    for (const e of d.events) events.add(e);
  }
  return {
    views: [...views.values()].sort((a, b) =>
      `${a.format}:${a.view}@${a.set.file}`.localeCompare(`${b.format}:${b.view}@${b.set.file}`),
    ),
    events: [...events].sort(),
  };
}

// ---------------------------------------------------------------------------
// graded operations
// ---------------------------------------------------------------------------

// Reduce a grade report (reference-harness/runner/grade.mjs --report) and the
// fixture's op list to { fixture, commit, verdict, ops: { id: {view, pass} } }.
// `extra` grades an op list kept beside this report (extra-ops.jsonl) and run
// on synthetic-v2's deck: the Ruby oracle's answers are captured with the
// runner's ruby adapter and the port graded against them with grade.mjs
// --expected (see the report's Method section for the commands).
export function summariseGrade(repo, gradeReport, extra = null) {
  const fixture = extra ? `${extra.deck} + extra-ops` : gradeReport.fixture;
  const fixtureDir = join(repo, "reference-harness", "fixtures", extra ? extra.deck : fixture);
  const failed = new Set((gradeReport.failures?.rendering ?? []).map((f) => f.id));
  const reproduced = new Set((gradeReport.reproduced?.rendering ?? []).map((f) => f.id));
  const cards = deckCardIndex(join(fixtureDir, "deck", "deck.sqlite3"));
  partKeyIndex = new Set([...cards.byKey.keys()].filter((k) => !k.includes("+")));
  const ops = {};
  const opFiles = extra
    ? [{ path: extra.ops, withheld: false }]
    : [
        { path: join(fixtureDir, "ops", "render.jsonl"), withheld: false },
        { path: join(fixtureDir, "withheld", "ops", "render.jsonl"), withheld: true },
      ];
  for (const { path, withheld } of opFiles) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const op = JSON.parse(line);
      if (op.op !== "render") continue;
      ops[op.id] = {
        card: op.card,
        view: op.view ?? null,
        set: cardSetFacts(cards, op.card),
        ...(withheld ? { withheld: true } : {}),
        result: failed.has(op.id) ? "differs" : reproduced.has(op.id) ? "reproduced-upstream-failure" : "identical",
      };
    }
  }
  partKeyIndex = null;
  const graded = Object.keys(ops).length;
  const fail = Object.values(ops).filter((o) => o.result === "differs").length;
  return {
    fixture,
    ...(extra ? { verdict_note: "graded against Ruby answers captured for this op list; the grader's fixture-manifest checks do not apply" } : {}),
    adapter_commit: gradeReport.adapter_checkout?.commit ?? null,
    adapter_dirty: gradeReport.adapter_checkout?.dirty ?? null,
    graded_at: gradeReport.graded_at ?? null,
    verdict: extra ? (fail ? "fail" : "pass") : gradeReport.verdict,
    rendering: extra
      ? { graded, pass: graded - fail, fail }
      : gradeReport.summary?.rendering
      ? { graded: gradeReport.summary.rendering.graded, pass: gradeReport.summary.rendering.pass, fail: gradeReport.summary.rendering.fail }
      : null,
    ops,
  };
}

// ---------------------------------------------------------------------------
// set membership of an operation's card
// ---------------------------------------------------------------------------

// Decko's name key, close enough for the fixture decks' names: each part
// lower-cased, runs of other characters folded to "_".
// Decko also singularizes each word (`*follow defaults` keys as
// `*follow_default`); the plain "-s" rule below covers the fixture decks'
// names, and lookups fall back to it only when the unsingularized key
// misses.
const plainPartKey = (p) => p.trim().toLowerCase().replace(/[^a-z0-9*]+/g, "_").replace(/^_+|_+$/g, "");
const singular = (k) => k.split("_").map((w) => (/[^s]s$/.test(w) && w.length > 3 ? w.slice(0, -1) : w)).join("_");
let partKeyIndex = null; // set while summarising one deck
const partKey = (p) => {
  const k = plainPartKey(p);
  if (!partKeyIndex || partKeyIndex.has(k)) return k;
  const s = singular(k);
  return partKeyIndex.has(s) ? s : k;
};
const nameKey = (n) => n.split("+").map(partKey).join("+");

// A compound card's row stores no name and no key (left_id/right_id only);
// its key is derived from its parts.
function deckRows(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db
    .prepare("SELECT id, key, codename, type_id, left_id, right_id, db_content FROM cards WHERE trash = 0 OR trash IS NULL")
    .all();
  db.close();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const keyOf = (r, depth = 0) => {
    if (r.key) return r.key;
    if (r.left_id == null || r.right_id == null || depth > 8) return null;
    const l = byId.get(r.left_id);
    const rt = byId.get(r.right_id);
    const lk = l && keyOf(l, depth + 1);
    const rk = rt && keyOf(rt, depth + 1);
    return lk && rk ? `${lk}+${rk}` : null;
  };
  for (const r of rows) r.key = keyOf(r);
  return { rows, byId };
}

function deckCardIndex(dbPath) {
  const { rows, byId } = deckRows(dbPath);
  const byKey = new Map();
  for (const r of rows) if (r.key) byKey.set(r.key, r);
  return { byKey, byId };
}

// The facts set matching needs, recorded with each graded operation so the
// report does not need the deck to regenerate: the card's own codename, its
// type's codename, and for a compound name the right part's codename and the
// left part's type codename. A name not in the deck (a virtual or unknown
// card) has no type and no codename.
// Set cards are virtual: a name whose right part is a set-pattern card
// (Topic+*type, *all+*create's left) or that names a whole-deck set has
// type Set by Decko's default *type rules, with no stored row to say so.
const SET_PATTERN_CODES = new Set(["type", "right", "self", "type_plus_right", "all_plus", "star", "rstar"]);
const WHOLE_DECK_SETS = new Set(["*all", "*all_plus", "*star", "*rstar"]);

function cardSetFacts(cards, name) {
  const typeOf = (row) => (row ? cards.byId.get(row.type_id)?.codename ?? null : null);
  const typeOfName = (n) => {
    const row = cards.byKey.get(nameKey(n));
    if (row) return typeOf(row);
    const ps = n.split("+");
    if (ps.length === 1) return WHOLE_DECK_SETS.has(nameKey(n)) ? "set" : null;
    const r = cards.byKey.get(partKey(ps[ps.length - 1]));
    return r && SET_PATTERN_CODES.has(r.codename) ? "set" : null;
  };
  const parts = name.split("+");
  const self = cards.byKey.get(nameKey(name)) ?? null;
  const facts = { codename: self?.codename ?? null, type: typeOfName(name), compound: parts.length > 1 };
  if (parts.length > 1) {
    const right = cards.byKey.get(partKey(parts[parts.length - 1])) ?? null;
    facts.right = right?.codename ?? null;
    facts.right_name = parts[parts.length - 1].trim();
    facts.left_type = typeOfName(parts.slice(0, -1).join("+"));
  }
  facts.name = name;
  return facts;
}

// Does a declaration's set contain the operation's card? Patterns whose
// membership the recorded facts decide are decided; `all` and `lib`
// always apply; `abstract` modules are included into other sets by
// include_set, which this layer does not resolve, so they apply by name.
export function setContains(set, facts) {
  if (!facts) return true;
  switch (set.pattern) {
    case "all":
    case "lib":
    case "abstract":
      return true;
    case "all_plus":
      return facts.compound;
    case "self":
      return facts.codename === set.anchor;
    case "right":
      return facts.compound && facts.right === set.anchor;
    case "type":
      return facts.type === set.anchor;
    case "type_plus_right":
      return facts.compound && facts.left_type === set.anchor && facts.right === set.sub;
    case "star":
      return facts.name.startsWith("*");
    case "rstar":
      return facts.compound && facts.right_name.startsWith("*");
    case "rule":
      return facts.compound && facts.right_name.startsWith("*") && facts.left_type === "set";
    default:
      return true;
  }
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

const GENERAL = new Set(["all", "abstract", "lib"]);

// An all/abstract/lib declaration does not render for a card that a more
// specific set (in any mod) also declares the view for: Ruby's set modules
// for self/right/type/... are included after all/ and override it.
export function specificDeclarations(gemPaths) {
  const byView = new Map();
  for (const gp of gemPaths) {
    for (const v of gemDeclarations(gp).views) {
      if (GENERAL.has(v.set.pattern) || !HTML_LIKE.has(v.format)) continue;
      if (!byView.has(v.view)) byView.set(v.view, []);
      byView.get(v.view).push(v.set);
    }
  }
  return byView;
}

export function evaluateMod(repo, gemPath, modId, grades, specific = new Map()) {
  const decl = gemDeclarations(gemPath);
  const tests = modTestFiles(repo, modId);
  const pinnedTests = tests.filter((t) => hasBytePins(t.src));

  // view name -> [{fixture, id, result, set}]
  const opsByView = new Map();
  for (const g of grades) {
    for (const [id, o] of Object.entries(g.ops)) {
      if (!o.view) continue;
      if (!opsByView.has(o.view)) opsByView.set(o.view, []);
      opsByView.get(o.view).push({ fixture: g.fixture, id, result: o.result, set: o.set });
    }
  }

  const views = decl.views.map((v) => {
    const entry = { format: v.format, view: v.view, alias: v.alias, set: v.set.file };
    const ops = HTML_LIKE.has(v.format)
      ? (opsByView.get(v.view) ?? []).filter(
          (o) =>
            setContains(v.set, o.set) &&
            !(GENERAL.has(v.set.pattern) && (specific.get(v.view) ?? []).some((s) => setContains(s, o.set))),
        )
      : [];
    if (ops.length) {
      const differs = ops.filter((o) => o.result === "differs");
      entry.evidence = differs.length ? "graded-differs" : "graded-identical";
      entry.ops = ops.map((o) => `${o.fixture}#${o.id}`);
      if (differs.length) entry.differing_ops = differs.map((o) => `${o.fixture}#${o.id}`);
      return entry;
    }
    const pins = pinnedTests.filter((t) => namesLiteral(t.src, v.view));
    if (pins.length) {
      entry.evidence = "test-named";
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
    views_test_named: count(views, "test-named"),
    views_unexercised: count(views, "unexercised"),
    events: decl.events.length,
    events_named: count(events, "named"),
    events_unexercised: count(events, "unexercised"),
  };
  // Only a graded operation compares the port's bytes with Ruby's. A test
  // that names a view or event is a link for the reader, not evidence of
  // byte-identity (the name match does not show what the test asserts, nor
  // where its expected bytes came from), so it never completes a mod. No
  // instrument here grades an event, so a mod that declares events cannot
  // be complete until one does.
  const complete =
    summary.views_graded_identical === summary.views && summary.events === 0;
  const viewsComplete = summary.views_graded_identical === summary.views;
  return {
    // A mod that declares neither views nor events (its behaviour lives in
    // helper methods, assets or configuration) has nothing this layer can
    // grade; calling it complete would be true only vacuously.
    status: summary.views === 0 && summary.events === 0
      ? "no-gradable-declarations"
      : complete
      ? "behaviour-complete"
      : viewsComplete
        ? "views-graded-events-ungraded"
        : "behaviour-incomplete",
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

// ---------------------------------------------------------------------------
// seed-only mods (card-mod-defaults): compare the seed with decks
// ---------------------------------------------------------------------------

// The fixtures dump (data/fixtures/real/cards.yml) is the seeded deck Ruby
// produces; each `cards_NNN:` entry carries id, key, codename, type_id, trash
// and db_content. Only those fields are read.
function yamlScalar(raw) {
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1).replaceAll("''", "'");
  if (/^".*"$/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

function parseCardsDump(src) {
  const cards = [];
  let cur = null;
  let block = null; // field name of an open |- block
  let quoted = null; // { field, text } of an open multi-line "..." scalar
  const closesQuote = (t) => /(^|[^\\])"$/.test(t);
  for (const line of src.split(/\r?\n/)) {
    if (quoted) {
      // YAML double-quoted folding: continuation lines join with one space,
      // an empty line is a newline, a trailing backslash joins with none.
      const t = line.trim();
      if (t === "") quoted.text += "\\n";
      else if (quoted.text.endsWith("\\") && !quoted.text.endsWith("\\\\")) quoted.text = quoted.text.slice(0, -1) + t;
      else quoted.text += (quoted.text.endsWith("\\n") ? "" : " ") + t;
      if (closesQuote(t)) {
        cur[quoted.field] = yamlScalar(quoted.text);
        quoted = null;
      }
      continue;
    }
    if (/^cards_\d+:\s*$/.test(line)) {
      cur = {};
      cards.push(cur);
      block = null;
      continue;
    }
    if (!cur) continue;
    if (block) {
      if (line.startsWith("    ") || line === "") {
        cur[block] = cur[block] === "" ? line.slice(4) : `${cur[block]}\n${line.slice(4)}`;
        continue;
      }
      cur[block] = cur[block].replace(/\n+$/, "");
      block = null;
    }
    const m = line.match(/^  ([a-z_]+):(?: (.*))?$/);
    if (!m) continue;
    const [, field, raw = ""] = m;
    if (raw.startsWith('"') && (raw.length === 1 || !closesQuote(raw.slice(1)))) {
      quoted = { field, text: raw };
      continue;
    }
    if (raw === "|-" || raw === "|") {
      cur[field] = "";
      block = field;
    } else {
      cur[field] = yamlScalar(raw);
    }
  }
  return cards;
}

export function evaluateSeedMod(repo, gemPath) {
  const dumpPath = join(gemPath, "data", "fixtures", "real", "cards.yml");
  if (!existsSync(dumpPath)) return null;
  const dump = parseCardsDump(readFileSync(dumpPath, "utf8")).filter((c) => String(c.trash) !== "1");
  const dumpById = new Map(dump.map((c) => [String(c.id), c]));
  // A compound card's dump row carries no key: it is left key + right key.
  const keyOf = (c, depth = 0) => {
    if (c.key) return c.key;
    if (!c.left_id || !c.right_id || depth > 8) return "";
    const l = dumpById.get(String(c.left_id));
    const r = dumpById.get(String(c.right_id));
    return l && r ? `${keyOf(l, depth + 1)}+${keyOf(r, depth + 1)}` : "";
  };
  for (const c of dump) c.key = keyOf(c);
  const typeCode = (c) => dumpById.get(String(c.type_id))?.codename || null;

  // The port's own seed. src/card/auth/boot-seed.ts (bootstrapFreshDeck) is
  // what a fresh port-provisioned deck receives: the core fixture's rows
  // (CORE_FIXTURE_SEED_CARDS, junctions by side ids) and the account-system
  // cards (ACCOUNT_MOD_SEED_CARDS, matched to the dump by codename, or by
  // name when the entry has none). db/seed.sql is the demo deck's seed.
  const bootSrc = existsSync(join(repo, "src", "card", "auth", "boot-seed.ts"))
    ? readFileSync(join(repo, "src", "card", "auth", "boot-seed.ts"), "utf8")
    : "";
  const section = (name) => {
    const i = bootSrc.indexOf(`export const ${name}`);
    return i < 0 ? "" : bootSrc.slice(i, bootSrc.indexOf("\n];", i));
  };
  const core = [...section("CORE_FIXTURE_SEED_CARDS").matchAll(
    /\{ id: (\d+), name: (?:"[^"]*"|null), key: (?:"([^"]*)"|null), codename: (?:"[^"]*"|null), leftId: (\d+|null), rightId: (\d+|null)/g,
  )].map((m) => ({ id: m[1], key: m[2] ?? null, left: m[3], right: m[4] }));
  const coreById = new Map(core.map((c) => [c.id, c]));
  const coreKey = (c) => c.key ?? `${coreKey(coreById.get(c.left))}+${coreKey(coreById.get(c.right))}`;
  const dumpByCodename = new Map(dump.filter((c) => c.codename).map((c) => [c.codename, c]));
  const dumpKeys = new Set(dump.map((c) => c.key));
  const bootKeys = new Set(core.map(coreKey));
  const unmatchedBoot = [];
  for (const m of section("ACCOUNT_MOD_SEED_CARDS").matchAll(/\{ name: "([^"]*)"(?:, codename: "([^"]*)")?/g)) {
    const hit = m[2] ? dumpByCodename.get(m[2]) : null;
    if (hit) bootKeys.add(hit.key);
    else if (dumpKeys.has(nameKey(m[1]))) bootKeys.add(nameKey(m[1]));
    else unmatchedBoot.push(m[1]);
  }
  const seedSql = existsSync(join(repo, "db", "seed.sql")) ? readFileSync(join(repo, "db", "seed.sql"), "utf8") : "";
  const portKeys = new Set([...seedSql.matchAll(/VALUES \(\s*\d+,\s*'[^']*',\s*'([^']*)'/g)].map((m) => m[1]));
  const bootInSeed = [...bootKeys].filter((k) => dumpKeys.has(k));

  const deckPath = join(repo, "reference-harness", "fixtures", "synthetic-v2", "deck", "deck.sqlite3");
  const { rows, byId } = deckRows(deckPath);
  const deck = new Map(rows.filter((r) => r.key).map((r) => [r.key, { ...r, type: byId.get(r.type_id)?.codename ?? null }]));

  const out = {
    seed_cards: dump.length,
    port_boot_seed: {
      cards: bootKeys.size + unmatchedBoot.length,
      in_seed: bootInSeed.length,
      not_in_seed: [...[...bootKeys].filter((k) => !dumpKeys.has(k)), ...unmatchedBoot],
      seed_cards_not_booted: dump.length - bootInSeed.length,
    },
    port_seed: { cards: portKeys.size, present: 0 },
    deck: { name: "synthetic-v2", present: 0, missing: [], codename_differs: [], type_differs: [], content_differs: [] } };
  for (const c of dump) {
    if (portKeys.has(c.key)) out.port_seed.present++;
    const r = deck.get(c.key);
    if (!r) {
      out.deck.missing.push(c.key);
      continue;
    }
    out.deck.present++;
    if ((c.codename || null) !== (r.codename || null)) out.deck.codename_differs.push(c.key);
    if (typeCode(c) !== (r.type || null)) out.deck.type_differs.push(c.key);
    if ((c.db_content ?? "").trim() !== (r.db_content ?? "").trim()) out.deck.content_differs.push(c.key);
  }
  return out;
}
