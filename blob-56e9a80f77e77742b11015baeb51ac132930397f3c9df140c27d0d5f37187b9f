// benchmarks/cold-render/probe-reached-rules-walk-wire.ts
// WHAT THIS IS: the wire ground truth for the SECOND whole-deck walk — the
// `WITH RECURSIVE reached(id)` rules walk prepareRuleCache issues
// (src/card/mod-loader/mods/card-mod-rules.ts). It reports the rule-card
// seed count, the transitive side-closure size, and the row count the
// shipped `SELECT c.*` projection returns, so the receipt states what that
// walk costs rather than inferring it from one HTTP hop.
//
// WHY counts and not the rows: the shipped projection is `SELECT c.*` over
// the whole reached set. Returning it over the wire exceeded the driver's
// response ceiling (the probe aborted with a transport failure), which is
// itself the finding — the walk's output is unbounded by anything the page
// asked for.
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
const driver = new BunnyDbDriver({
  url: creds.BUNNY_TRIAL_DB_URL.replace(/^libsql:\/\//, "https://"),
  authToken: creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN,
});

const SEED = `SELECT rules.id FROM cards rules
    JOIN cards sets ON rules.left_id = sets.id
    JOIN cards settings ON rules.right_id = settings.id
    WHERE sets.type_id = ? AND settings.type_id = ?
      AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0`;
// The shipped recursive step, verbatim: `s.id IN (j.left_id, j.right_id)`.
const SHIPPED_REACHED = `WITH RECURSIVE reached(id) AS (
  ${SEED}
  UNION
  SELECT s.id FROM reached r
    JOIN cards j ON j.id = r.id AND j.trash = 0
    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL
) SELECT COUNT(*) n FROM reached`;
// The same closure with the two-valued IN split into two indexed arms.
const TWO_ARM_REACHED = `WITH RECURSIVE reached(id) AS (
  ${SEED}
  UNION
  SELECT j.left_id FROM reached r JOIN cards j ON j.id = r.id AND j.trash = 0 AND j.left_id IS NOT NULL
  UNION
  SELECT j.right_id FROM reached r JOIN cards j ON j.id = r.id AND j.trash = 0 AND j.right_id IS NOT NULL
) SELECT COUNT(*) n FROM reached`;

async function count(label: string, sql: string, params: unknown[]) {
  const t0 = process.hrtime.bigint();
  try {
    const res = await driver.query<{ n: number }>(sql, params);
    return { label, n: res.rows[0]?.n ?? -1, ms: Math.round((Number(process.hrtime.bigint() - t0) / 1e6) * 10) / 10 };
  } catch (err) {
    return { label, n: -1, ms: Math.round((Number(process.hrtime.bigint() - t0) / 1e6) * 10) / 10, error: String(err).slice(0, 160) };
  }
}

const ids = await driver.query<{ codename: string; id: number }>(
  `SELECT codename, id FROM cards WHERE codename IN ('set', 'setting')`, [],
);
const setId = ids.rows.find((r) => r.codename === "set")?.id;
const settingId = ids.rows.find((r) => r.codename === "setting")?.id;
if (setId === undefined || settingId === undefined) { console.log("FATAL: no set/setting codename card"); process.exit(2); }

const out = [
  await count("rule_card_seed", `SELECT COUNT(*) n FROM (${SEED})`, [setId, settingId]),
  await count("shipped_reached_closure", SHIPPED_REACHED, [setId, settingId]),
  await count("two_arm_reached_closure", TWO_ARM_REACHED, [setId, settingId]),
  await count("shipped_reached_closure_WARM", SHIPPED_REACHED, [setId, settingId]),
  await count("two_arm_reached_closure_WARM", TWO_ARM_REACHED, [setId, settingId]),
];
console.log(JSON.stringify({ set_id: setId, setting_id: settingId, out }, null, 2));
