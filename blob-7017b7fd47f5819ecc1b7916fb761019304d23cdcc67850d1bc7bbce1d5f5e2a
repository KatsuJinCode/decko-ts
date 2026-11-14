// SCRATCH (uncommitted): cost of the TWO walk shapes on this deck, using the
// REAL statement text lifted out of read-rules.ts, plus their row-set
// equivalence on the rule-shaped keys.
//
// read-rules.ts's doc claims the rule-closure walk is ~10x cheaper than the
// whole-deck walk on a ~19k-card deck. The save ladder does not show that.
// Which is right?

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const SRC = readFileSync("src/card/permissions/read-rules.ts", "utf8");

/** Lift one top-level `const NAME = ...;` verbatim out of the source and strip
 *  the TS type annotations, so the SQL measured is the SQL that ships. */
function liftConst(name) {
  const plain = SRC.indexOf(`\nconst ${name}`);
  const exported = SRC.indexOf(`\nexport const ${name}`);
  const start = plain >= 0 ? plain : exported;
  if (start < 0) throw new Error(`not found: ${name}`);
  const lines = SRC.slice(start + 1).split("\n");
  const out = [lines[0].replace(/: readonly string\[\] =/, " =").replace(/^export /, "")];
  for (let i = 1; i < lines.length; i += 1) {
    out.push(lines[i]);
    if (/^\s*\];\s*$/.test(lines[i]) || /`\s*;\s*$/.test(lines[i])) break;
  }
  return out.join("\n");
}

// read-rules.ts:44 and :1087 — the four task setting names, in order.
const NAMES = ["*read", "*create", "*update", "*delete"];

const fnStart = SRC.indexOf("function endsInRuleSuffix(");
const endsInRuleSuffix = SRC
  .slice(fnStart, SRC.indexOf("\n}\n", fnStart) + 3)
  .replace("function endsInRuleSuffix(col: string): string", "function endsInRuleSuffix(col)");

const parts = [
  `const TASK_RULE_SETTING_NAMES = ${JSON.stringify(NAMES)};`,
  endsInRuleSuffix,
  liftConst("RULE_SUFFIX_LAST_CHARS"),
  liftConst("RULE_KEY_UNIVERSE_STATEMENT"),
  liftConst("RULE_KEY_RULE_CLOSURE_STATEMENT"),
];
const mod = new Function(
  `${parts.join("\n\n")}\nreturn { RULE_KEY_UNIVERSE_STATEMENT, RULE_KEY_RULE_CLOSURE_STATEMENT };`,
)();
const WHOLE = mod.RULE_KEY_UNIVERSE_STATEMENT;
const CLOSURE = mod.RULE_KEY_RULE_CLOSURE_STATEMENT;
if (!WHOLE.includes("WITH RECURSIVE resolved(id, ckey)")) throw new Error("whole-deck lift looks wrong");
if (!CLOSURE.includes("anc(id)")) throw new Error("rule-closure lift looks wrong");
console.log(`lifted from source: whole-deck ${WHOLE.length} chars, rule-closure ${CLOSURE.length} chars`);

const db = new DatabaseSync("C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3", {
  readOnly: true,
});

console.log(
  "deck census:",
  JSON.stringify(
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM cards WHERE +trash = 0) AS live,
                (SELECT COUNT(*) FROM cards WHERE "key" IS NOT NULL AND +trash = 0) AS keyed,
                (SELECT COUNT(*) FROM cards WHERE left_id IS NOT NULL AND right_id IS NOT NULL AND +trash = 0) AS junctions`,
      )
      .get(),
  ),
);

function ms(fn) {
  const t = process.hrtime.bigint();
  const v = fn();
  return { v, ms: Number(process.hrtime.bigint() - t) / 1e6 };
}

const wq = db.prepare(WHOLE);
const rq = db.prepare(CLOSURE);
let wRows = 0;
let rRows = 0;
const wTimes = [];
const rTimes = [];
for (let i = 0; i < 6; i += 1) {
  const w = ms(() => wq.all());
  const r = ms(() => rq.all(...NAMES));
  wRows = w.v.length;
  rRows = r.v.length;
  wTimes.push(w.ms);
  rTimes.push(r.ms);
}
const stat = (a) => {
  const warm = a.slice(1).sort((x, y) => x - y);
  return `cold ${a[0].toFixed(1)} | warm min ${Math.min(...warm).toFixed(1)} | warm median ${warm[Math.floor(warm.length / 2)].toFixed(1)} ms`;
};
console.log(`\nWHOLE DECK   ${String(wRows).padStart(6)} rows | ${stat(wTimes)}`);
console.log(`RULE CLOSURE ${String(rRows).padStart(6)} rows | ${stat(rTimes)}`);
console.log(
  `warm-min ratio (whole-deck / rule-closure): ${(Math.min(...wTimes.slice(1)) / Math.min(...rTimes.slice(1))).toFixed(2)}x`,
);

const universe = new Map();
for (const row of wq.all()) universe.set(row.ckey, row.id);
const closure = new Map();
for (const row of rq.all(...NAMES)) closure.set(row.ckey, row.id);
const isRuleShaped = (k) => {
  const segs = k.split("+");
  for (let i = 0; i < segs.length; i += 1) if (NAMES.includes(segs.slice(i).join("+"))) return true;
  return false;
};
let missing = 0;
let disagree = 0;
let invented = 0;
let ruleShaped = 0;
for (const [k] of closure) if (!universe.has(k)) invented += 1;
for (const [k, id] of universe) {
  if (!isRuleShaped(k)) continue;
  ruleShaped += 1;
  if (!closure.has(k)) missing += 1;
  else if (closure.get(k) !== id) disagree += 1;
}
console.log(`\nrule-shaped composed keys on this deck: ${ruleShaped}`);
console.log(`  closure walk vs whole-deck: missing ${missing}, disagreeing ${disagree}, invented ${invented}`);
for (const [k, id] of universe) {
  if (!isRuleShaped(k)) continue;
  if (!closure.has(k)) {
    const card = db.prepare('SELECT id, name, key, trash, left_id, right_id, type_id FROM cards WHERE id = ?').get(id);
    console.log('    MISSING', JSON.stringify(k), '-> card', JSON.stringify(card));
    const parts = k.split('+');
    for (let i = 0; i < parts.length; i++) {
      const sub = parts.slice(i).join('+');
      console.log('        run', JSON.stringify(sub), 'in closure?', closure.has(sub), ' in whole-deck?', universe.has(sub));
    }
  }
}
db.close();