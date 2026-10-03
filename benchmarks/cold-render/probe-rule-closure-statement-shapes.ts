// benchmarks/cold-render/probe-rule-closure-statement-shapes.ts
// WHAT THIS IS: the WIRE confirmation of the rule-key resolution walk's
// replacement. It runs the shipped whole-deck universe and the candidate
// scoped shapes against the SAME trial database a cold render reads, and
// checks the scoped shape answers every rule-shaped key the whole-deck
// universe answers - identically.
//
// The ranking itself is done locally (probe-rule-closure-shapes-locally.ts,
// against a mirror of this deck) because a network round trip per candidate
// prices the LINK, not the plan. This probe exists to price the link: the
// scoped shapes' win is response bytes and server time, and only the real
// database shows what those are worth over a wire.
//
// WHY the scoped shape is safe: every key a render asks the resolver for
// ends in a task setting name (measured: 99 of 99 keys on a cold `Home`),
// because every rule candidate is a pattern name joined to a setting. So a
// card's composed key is needed only when the card sits on a rule card's
// spine, and the walk only has to start from the simple cards on those
// spines.
//
// Run:
//   npx esbuild --bundle --format=esm --platform=node --target=node20 \
//     "--external:node:*" --external:sass --external:coffeescript \
//     --outfile=benchmarks/cold-render/probe-rule-closure-statement-shapes.mjs \
//     benchmarks/cold-render/probe-rule-closure-statement-shapes.ts
//   node benchmarks/cold-render/probe-rule-closure-statement-shapes.mjs

import { readFileSync } from "node:fs";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";

function readCreds(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const creds = readCreds("C:/localProjects/brandonDojoTech/library/data/creds");
const url = creds.BUNNY_TRIAL_DB_URL.replace(/^libsql:\/\//, "https://");
const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
const driver = new BunnyDbDriver({ url, authToken: tok });

const keys: string[] = JSON.parse(
  readFileSync("benchmarks/cold-render/diag-rule-keys.json", "utf8"),
) as string[];
const SETTINGS = ["*read", "*create", "*update", "*delete"];
const RULE_SHAPED_WHERE = SETTINGS.map((s) => `rs.ckey LIKE '%+${s}'`).join(" OR ");

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

/** L: the scoped walk. `anc` is the left-ancestor chain of every rule card;
 *  the composition keeps the shipped arms and adds the rule-shaped
 *  projection, so the response is the deck's rule keys instead of the
 *  deck's keys. */
const L = `WITH RECURSIVE
anc(id) AS (
  SELECT r.left_id FROM cards r JOIN cards st ON st.id = r.right_id
    WHERE +r.trash = 0 AND st."key" IN (?, ?, ?, ?) AND r.left_id IS NOT NULL
  UNION
  SELECT j.left_id FROM anc a JOIN cards j ON j.id = a.id WHERE j.left_id IS NOT NULL
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
SELECT rs.ckey, rs.id FROM resolved rs WHERE ${RULE_SHAPED_WHERE}`;

/** G: the per-call prefix-boundary walk - the boundary is every proper
 *  prefix of every requested key. One statement per distinct key set, so
 *  its price is round trips. */
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

interface Row { ckey: string; id: number }
interface Timing { label: string; ms: number; rows: number; error?: string }

async function timed(label: string, sql: string, params: unknown[]): Promise<{ t: Timing; rows: Row[] }> {
  const t0 = process.hrtime.bigint();
  try {
    const res = await driver.query<Row>(sql, params);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { t: { label, ms: Math.round(ms * 10) / 10, rows: res.rows.length }, rows: res.rows };
  } catch (err) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { t: { label, ms: Math.round(ms * 10) / 10, rows: -1, error: String(err).slice(0, 300) }, rows: [] };
  }
}

const timings: Timing[] = [];
await timed("warmup_point", 'SELECT id FROM cards WHERE "key" = ?', ["*all"]); // pay connect cost once

const a = await timed("A_whole_deck_universe", A, []);
timings.push(a.t);
const l = await timed("L_scoped_rule_shaped_walk", L, [...SETTINGS]);
timings.push(l.t);
const gAll = prefixBoundaryForm(keys);
const g = await timed(`G_prefix_boundary_all_${keys.length}_keys`, gAll.sql, gAll.params);
timings.push(g.t);
const gOne = prefixBoundaryForm(keys.slice(0, 5));
const g1 = await timed("G_prefix_boundary_5_keys", gOne.sql, gOne.params);
timings.push(g1.t);

const rtt: number[] = [];
for (let i = 0; i < 5; i += 1) {
  rtt.push((await timed("rtt", 'SELECT id, "key" FROM cards WHERE "key" = ? AND +trash = 0', ["*all"])).t.ms);
}
// Warm repeats: no shape may be credited with (or charged for) connect cost.
timings.push((await timed("A_whole_deck_universe_WARM", A, [])).t);
timings.push((await timed("L_scoped_rule_shaped_walk_WARM", L, [...SETTINGS])).t);
timings.push((await timed("G_prefix_boundary_all_WARM", gAll.sql, gAll.params)).t);

const aMap = new Map(a.rows.map((r) => [r.ckey, r.id]));
const lMap = new Map(l.rows.map((r) => [r.ckey, r.id]));
const gMap = new Map(g.rows.map((r) => [r.ckey, r.id]));
const isRuleShaped = (k: string): boolean => SETTINGS.some((s) => k.endsWith("+" + s));
const universeRuleShaped = [...aMap.keys()].filter(isRuleShaped);
const measureBytes = (rows: Row[]): number => Buffer.byteLength(JSON.stringify(rows), "utf8");

console.log(
  JSON.stringify(
    {
      rtt_ms: rtt,
      timings: timings.map((t) => ({ ...t, json_bytes: t.rows > 0 ? undefined : 0 })),
      response_json_bytes: {
        A_whole_deck: measureBytes(a.rows),
        L_scoped: measureBytes(l.rows),
        G_prefix_boundary_all: measureBytes(g.rows),
      },
      equivalence: {
        whole_deck_rule_shaped_keys: universeRuleShaped.length,
        L_missing: universeRuleShaped.filter((k) => !lMap.has(k)).length,
        L_disagreeing: universeRuleShaped.filter((k) => lMap.has(k) && lMap.get(k) !== aMap.get(k)).length,
        L_non_rule_shaped: [...lMap.keys()].filter((k) => !isRuleShaped(k)).length,
        L_invented_keys: [...lMap.keys()].filter((k) => !aMap.has(k)).length,
        G_asked_missing: keys.filter((k) => aMap.has(k) && !gMap.has(k)).length,
        G_asked_disagreeing: keys.filter((k) => gMap.has(k) && aMap.has(k) && gMap.get(k) !== aMap.get(k)).length,
        G_asked_resolved: keys.filter((k) => gMap.has(k)).length,
        asked_keys: keys.length,
      },
    },
    null,
    2,
  ),
);
