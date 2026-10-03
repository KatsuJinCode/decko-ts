// benchmarks/cold-render/probe-rule-closure-shapes-locally.ts
// WHAT THIS IS: the statement-shape comparison for the rule-key resolution
// walk, run against a LOCAL mirror of the trial deck
// (dump-trial-deck-to-local-sqlite.ts) so every candidate costs
// microseconds instead of seconds-per-shape over the network.
//
// WHY here and not on the wire: the boundary condition that keeps the
// recursive arms off the deck's non-rule junctions is a PLAN question.
// Measured over the network AND locally, a `j.id IN (SELECT id FROM
// spine)` arm bound costs 20 s (network: 25 s) against a 142 ms whole-deck
// walk, so comparing shapes on the wire is dominated by one bad plan.
// This probe ranks the shapes; probe-rule-closure-statement-shapes.ts
// confirms the winner against the real database and checks the two
// universes AGREE on every rule-shaped key.
//
// Run:
//   npx esbuild --bundle --format=esm --platform=node --target=node20 \
//     "--external:node:*" --external:better-sqlite3 --external:sass --external:coffeescript \
//     --outfile=benchmarks/cold-render/probe-rule-closure-shapes-locally.mjs \
//     benchmarks/cold-render/probe-rule-closure-shapes-locally.ts
//   node benchmarks/cold-render/probe-rule-closure-shapes-locally.mjs

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const db = new Database("benchmarks/cold-render/trial-deck-mirror.sqlite3", { readonly: true });
const SETTINGS = ["*read", "*create", "*update", "*delete"];
const keys: string[] = JSON.parse(
  readFileSync("benchmarks/cold-render/diag-rule-keys.json", "utf8"),
) as string[];
const RULE_SHAPED_WHERE = SETTINGS.map((s) => `rs.ckey LIKE '%+${s}'`).join(" OR ");

interface Row { ckey: string; id: number }

/** A: the shipped whole-deck universe statement (read-rules.ts verbatim). */
const A = `WITH RECURSIVE resolved(id, ckey) AS (
  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND +trash = 0
  UNION
  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
    JOIN cards j ON j.left_id = l.id AND +j.trash = 0
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
  UNION
  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
    JOIN cards j ON j.right_id = r.id AND +j.trash = 0
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
)
SELECT rs.ckey, rs.id FROM resolved rs`;

/** The shipped arms, parameterised by an optional seed restriction and an
 *  optional arm restriction, so the variants below differ in exactly one
 *  clause and the comparison is attributable. */
function resolvedWalk(seed: string, armLeft: string, armRight: string, tail = ""): string {
  return `WITH RECURSIVE
anc(id) AS (
  SELECT r.left_id FROM cards r JOIN cards st ON st.id = r.right_id
    WHERE +r.trash = 0 AND st."key" IN (?, ?, ?, ?) AND r.left_id IS NOT NULL
  UNION
  SELECT j.left_id FROM anc a JOIN cards j ON j.id = a.id WHERE j.left_id IS NOT NULL
),
resolved(id, ckey) AS (
  ${seed}
  UNION
  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
    JOIN cards j ON j.left_id = l.id AND +j.trash = 0 ${armLeft}
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
  UNION
  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
    JOIN cards j ON j.right_id = r.id AND +j.trash = 0 ${armRight}
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
)
SELECT rs.ckey, rs.id FROM resolved rs${tail}`;
}

const SEED_ANC = `SELECT c.id, c."key" FROM cards c
    WHERE c."key" IS NOT NULL AND +c.trash = 0 AND c.id IN (SELECT id FROM anc)`;
const BOUND_IN = "AND j.id IN (SELECT id FROM anc)";
const BOUND_NOT = "";

/** M: the SAFE scoped seed. `anc` is the BOTH-sided side closure of every
 *  rule card, so the seed set contains the simple card at the bottom of
 *  every spine a rule-shaped composed key can be built from - for a rule
 *  card composed by the shipped statement's RIGHT arm (key(left) || '+' ||
 *  ckey(right)) the needed left ancestor sits on the RIGHT spine, which a
 *  left-only ancestor walk misses. Arms stay UNBOUNDED: a bounded arm
 *  (`j.id IN (SELECT id FROM anc)`) measured 20-25 s against this deck. */
const M = `WITH RECURSIVE
anc(id) AS (
  SELECT r.id FROM cards r JOIN cards st ON st.id = r.right_id
    WHERE +r.trash = 0 AND st."key" IN (?, ?, ?, ?)
  UNION
  SELECT s.id FROM anc n JOIN cards j ON j.id = n.id
    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL
),
resolved(id, ckey) AS (
  SELECT c.id, c."key" FROM cards c
    WHERE c."key" IS NOT NULL AND +c.trash = 0 AND c.id IN (SELECT id FROM anc)
  UNION
  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
    JOIN cards j ON j.left_id = l.id AND +j.trash = 0
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
  UNION
  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
    JOIN cards j ON j.right_id = r.id AND +j.trash = 0
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
)
SELECT rs.ckey, rs.id FROM resolved rs`;

/** G: the per-call prefix-boundary walk - the boundary is every proper
 *  prefix of every requested key. Correct AND fast, but one statement per
 *  distinct key set, so its price is round trips, not server time. */
function prefixBoundaryForm(requested: string[]): { sql: string; params: unknown[] } {
  const prefixes = new Set<string>();
  for (const key of requested) {
    const segs = key.split("+");
    for (let n = 1; n <= segs.length; n += 1) prefixes.add(segs.slice(0, n).join("+"));
  }
  const p = [...prefixes].map(() => "?").join(", ");
  return {
    sql:
      `WITH RECURSIVE resolved(id, ckey) AS (
  SELECT id, "key" FROM cards WHERE "key" IN (${p}) AND +trash = 0
  UNION
  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
    JOIN cards j ON j.left_id = l.id AND +j.trash = 0
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
   WHERE (l.ckey || '+' || r."key") IN (${p})
  UNION
  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
    JOIN cards j ON j.right_id = r.id AND +j.trash = 0
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
   WHERE (l."key" || '+' || r.ckey) IN (${p})
)
SELECT rs.ckey, rs.id FROM resolved rs WHERE rs.ckey IN (${requested.map(() => "?").join(", ")})`,
    params: [...prefixes, ...prefixes, ...prefixes, ...requested],
  };
}

interface Shape { label: string; ms: number; rows: number; bytes: number; plan: string; error?: string }

function run(label: string, sql: string, params: unknown[]): { shape: Shape; rows: Row[] } {
  try {
    const stmt = db.prepare(sql);
    const t0 = process.hrtime.bigint();
    const rows = stmt.all(params) as Row[];
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const plan = (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as { detail: string }[])
      .map((r) => r.detail).join(" | ").slice(0, 300);
    return { shape: { label, ms: Math.round(ms * 10) / 10, rows: rows.length, bytes: JSON.stringify(rows).length, plan }, rows };
  } catch (err) {
    return { shape: { label, ms: -1, rows: -1, bytes: 0, plan: "", error: String(err).slice(0, 200) }, rows: [] };
  }
}

const variants: { label: string; sql: string; params: unknown[] }[] = [
  { label: "A_whole_deck_universe", sql: A, params: [] },
  { label: "H_seed_left_anc_arms_unbounded", sql: resolvedWalk(SEED_ANC, BOUND_NOT, BOUND_NOT), params: [...SETTINGS] },
  {
    label: "L_seed_left_anc_rule_shaped",
    sql: resolvedWalk(SEED_ANC, BOUND_NOT, BOUND_NOT, ` WHERE ${RULE_SHAPED_WHERE}`),
    params: [...SETTINGS],
  },
  { label: "M_seed_both_sided_closure", sql: M, params: [...SETTINGS] },
  { label: "N_seed_both_sided_closure_rule_shaped", sql: M + ` WHERE ${RULE_SHAPED_WHERE}`, params: [...SETTINGS] },
  { label: "I_seed_left_anc_arms_bounded_IN", sql: resolvedWalk(SEED_ANC, BOUND_IN, BOUND_IN), params: [...SETTINGS] },
];
const gAll = prefixBoundaryForm(keys);
variants.push({ label: `G_prefix_boundary_all_${keys.length}_keys`, sql: gAll.sql, params: gAll.params });
const gOne = prefixBoundaryForm(keys.slice(0, 5));
variants.push({ label: "G_prefix_boundary_5_keys", sql: gOne.sql, params: gOne.params });

const shapes: Shape[] = [];
const rowsByLabel = new Map<string, Row[]>();
for (const v of variants) {
  const r = run(v.label, v.sql, v.params);
  shapes.push(r.shape);
  rowsByLabel.set(v.label, r.rows);
}
// warm repeats: plan cache + JIT noise made visible
for (const v of variants) {
  const r = run(`${v.label}_WARM`, v.sql, v.params);
  shapes.push(r.shape);
  rowsByLabel.set(`${v.label}_WARM`, r.rows);
}
const ancSizes = {
  left_ancestor_ids: (db.prepare(`WITH RECURSIVE anc(id) AS (
      SELECT r.left_id FROM cards r JOIN cards st ON st.id = r.right_id
        WHERE +r.trash = 0 AND st."key" IN (?,?,?,?) AND r.left_id IS NOT NULL
      UNION
      SELECT j.left_id FROM anc a JOIN cards j ON j.id = a.id WHERE j.left_id IS NOT NULL
    ) SELECT COUNT(*) n FROM anc`).get(...SETTINGS) as { n: number }).n,
  both_sided_ids: (db.prepare(`WITH RECURSIVE anc(id) AS (
      SELECT r.id FROM cards r JOIN cards st ON st.id = r.right_id
        WHERE +r.trash = 0 AND st."key" IN (?,?,?,?)
      UNION
      SELECT s.id FROM anc n JOIN cards j ON j.id = n.id
        JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL
    ) SELECT COUNT(*) n FROM anc`).get(...SETTINGS) as { n: number }).n,
  rule_cards: (db.prepare(`SELECT COUNT(*) n FROM cards r JOIN cards st ON st.id = r.right_id
      WHERE +r.trash = 0 AND st."key" IN (?,?,?,?)`).get(...SETTINGS) as { n: number }).n,
};

const aMap = new Map((rowsByLabel.get("A_whole_deck_universe") ?? []).map((r) => [r.ckey, r.id]));
const isRuleShaped = (k: string): boolean => SETTINGS.some((s) => k.endsWith("+" + s));
const universeRuleShaped = [...aMap.keys()].filter(isRuleShaped);
/** `perCall` shapes answer only the keys they were asked for, so the
 *  equivalence question for them is "did they answer the asked keys the
 *  whole-deck universe answers, identically" - not "did they enumerate
 *  every rule-shaped key". */
const check = (rows: Row[], perCall: boolean) => {
  const m = new Map(rows.map((r) => [r.ckey, r.id]));
  const reference = perCall ? keys : universeRuleShaped;
  return {
    reference_keys: reference.length,
    missing: reference.filter((k) => aMap.has(k) && !m.has(k)).length,
    missing_sample: reference.filter((k) => aMap.has(k) && !m.has(k)).slice(0, 6),
    disagreeing: reference.filter((k) => m.has(k) && aMap.has(k) && m.get(k) !== aMap.get(k)).length,
    answered_keys_whole_deck_also_answers: [...m.keys()].filter((k) => !aMap.has(k)).length,
    asked_keys_resolved: keys.filter((k) => m.has(k)).length,
  };
};
const PER_CALL = new Set(["G_prefix_boundary_all_99_keys", "G_prefix_boundary_5_keys"]);

console.log(
  JSON.stringify(
    {
      live_cards: db.prepare("SELECT COUNT(*) n FROM cards WHERE trash = 0").get(),
      asked_keys: keys.length,
      closure_sizes: ancSizes,
      shapes: shapes.map((s) => {
        const base = s.label.replace(/_WARM$/, "");
        return {
          label: s.label, ms: s.ms, rows: s.rows, bytes: s.bytes,
          equivalence: check(rowsByLabel.get(base) ?? [], PER_CALL.has(base)),
          error: s.error,
        };
      }),
    },
    null,
    2,
  ),
);
