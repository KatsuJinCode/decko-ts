// Lane p22-rulestable probe: the engine's EXACT permission + count SQL chain
// against the RAW corpus copy (the db the oracle expected-v2 captures rendered
// from). SQL copied verbatim from src/card/permissions/read-rules.ts
// (readPermissionStatements) and src/card/render/help-popover.ts
// (settingRuleCountsStatement).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const db = new Database(
  new URL("./bench-corpus-raw-lane-copy.sqlite3", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  { readonly: true },
);

// -- statement 1: codename cards (readPermissionStatements[0])
const codenameRows = db
  .prepare(
    `SELECT id, codename FROM cards WHERE codename IN ` +
      `('anyone', 'anyone_signed_in', 'anonymous', 'administrator', 'deckobot') ` +
      `AND trash = 0`,
  )
  .all();
console.log("codename rows:", JSON.stringify(codenameRows));
const byCodename = new Map(codenameRows.map((r) => [r.codename, r.id]));
const anyone = byCodename.get("anyone");
const anonymousId = byCodename.get("anonymous");

// -- statement 2: the read-rule cache (readPermissionStatements[1])
const cacheRows = db
  .prepare(
    `SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId ` +
      `FROM cards read_rules ` +
      `JOIN card_references refs ON refs.referer_id = read_rules.id ` +
      `JOIN cards sets ON read_rules.left_id = sets.id ` +
      `WHERE read_rules.right_id = ` +
      `  (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1) ` +
      `AND sets.type_id = ` +
      `  (SELECT id FROM cards WHERE codename = 'set' AND trash = 0 ORDER BY id LIMIT 1) ` +
      `AND read_rules.trash = 0 AND sets.trash = 0`,
  )
  .all();
const cache = new Map();
for (const row of cacheRows) {
  const list = cache.get(row.partyId);
  if (list === undefined) cache.set(row.partyId, [row.readRuleId]);
  else list.push(row.readRuleId);
}
console.log(
  "read_rule_cache parties:", JSON.stringify([...cache.entries()].map(([p, ids]) => ({ party: p, n: ids.length }))),
);

// -- the anonymous state's parties + readableRuleIds (readPermissionStateFromViewerResults)
const parties = [anyone, anonymousId].filter((x) => x !== undefined);
const readableRuleIds = new Set();
for (const party of parties) {
  for (const ruleId of cache.get(party) ?? []) readableRuleIds.add(ruleId);
}
console.log("anonymous parties:", JSON.stringify(parties), "readableRuleIds size:", readableRuleIds.size);

// -- the count statement with that readable set (settingRuleCountsStatement, hasFilter path)
const setTypeId = db.prepare(`SELECT id FROM cards WHERE codename='set' AND trash=0 ORDER BY id LIMIT 1`).get().id;
const settingTypeId = db.prepare(`SELECT id FROM cards WHERE codename='setting' AND trash=0 ORDER BY id LIMIT 1`).get().id;
const readableIds = [...readableRuleIds];
const headRow = db.prepare(`SELECT id FROM cards WHERE key='*head' AND trash=0`).get();
console.log("*head id in raw corpus:", headRow?.id);

const countSql =
  `SELECT settings.id AS sid, COUNT(*) AS c ` +
  `FROM cards rules ` +
  `  JOIN cards sets ON rules.left_id = sets.id ` +
  `  JOIN cards settings ON rules.right_id = settings.id ` +
  `WHERE sets.type_id = ? AND settings.type_id = ? ` +
  `  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0 ` +
  `  AND (rules.read_rule_id IS NULL OR rules.read_rule_id IN (` +
  readableIds.map(() => "?").join(",") + `)) ` +
  `GROUP BY settings.id`;
const countRows = db.prepare(countSql).all(setTypeId, settingTypeId, ...readableIds);
const head = countRows.find((r) => r.sid === headRow?.id);
console.log("ENGINE-SHAPE count for *head (anonymous readable set):", head?.c ?? "absent(0)");

// which *head rules exist and are they readable?
const headRules = db
  .prepare(
    `SELECT r.id, r.name, r.read_rule_id, r.trash FROM cards r WHERE r.right_id=? ORDER BY r.id`,
  )
  .all(headRow?.id);
for (const r of headRules) {
  console.log(
    `  ${r.name} (id ${r.id}) trash=${r.trash} read_rule_id=${r.read_rule_id} ` +
      `readable=${readableRuleIds.has(r.read_rule_id)}`,
  );
}

// Also: which read rules DO the readable ids contain (the grants)?
const grantRows = db
  .prepare(`SELECT id, name FROM cards WHERE id IN (${readableIds.slice(0, 30).join(",")})`)
  .all();
console.log("readable rule cards (first 30):", JSON.stringify(grantRows.map((g) => `${g.id}:${g.name}`)));
