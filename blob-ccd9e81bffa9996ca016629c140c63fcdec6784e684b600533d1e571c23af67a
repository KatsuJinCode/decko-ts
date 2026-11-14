// Lane p22-rulestable corpus probe: *head setting-link count facts.
// Readonly against the lane's own COPY of the corpus db (originals untouched).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const db = new Database(
  new URL("./bench-corpus-v2-lane-copy.sqlite3", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  { readonly: true },
);

const head = db
  .prepare("SELECT id, name, key, type_id, codename, trash FROM cards WHERE key = '*head'")
  .all();
console.log("*head card rows:", JSON.stringify(head));

const setT = db.prepare("SELECT id, name FROM cards WHERE codename='set' AND trash=0").get();
const settingT = db.prepare("SELECT id, name FROM cards WHERE codename='setting' AND trash=0").get();
console.log("Set type id:", setT?.id, " Setting type id:", settingT?.id);

const headId = head[0]?.id;
const rules = db
  .prepare(
    `SELECT r.id, r.name, r.trash, r.type_id, r.left_id, r.right_id, r.read_rule_id,
            l.name AS left_name, l.type_id AS left_type_id, l.trash AS left_trash
     FROM cards r LEFT JOIN cards l ON r.left_id = l.id
     WHERE r.right_id = ?`,
  )
  .all(headId);
console.log("rows with right_id=*head id:", JSON.stringify(rules, null, 1));

// The engine's exact count statement (help-popover.ts settingRuleCountsStatement),
// alwaysOk shape (no read filter), for EVERY setting — then show *head's number.
const countRows = db
  .prepare(
    `SELECT settings.id AS sid, settings.key AS skey, COUNT(*) AS c
     FROM cards rules
       JOIN cards sets ON rules.left_id = sets.id
       JOIN cards settings ON rules.right_id = settings.id
     WHERE sets.type_id = ? AND settings.type_id = ?
       AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0
     GROUP BY settings.id`,
  )
  .all(setT.id, settingT.id);
console.log("engine count SQL (alwaysOk shape) rows for *head:",
  JSON.stringify(countRows.filter((r) => r.sid === headId)));
console.log("sample of all counts:", JSON.stringify(countRows.slice(0, 15)));

// Ruby CQL shape check: Card.search left: {type: SetID}, right: id.
// Question: does the left card of a *head rule have type_id = Set's id?
for (const r of rules) {
  console.log(
    `rule ${r.id} (${r.name}) trash=${r.trash} left=${r.left_name} left_type_id=${r.left_type_id}` +
    ` (Set id=${setT.id}) read_rule_id=${r.read_rule_id}`,
  );
}

// What does the *head rules' page render? The rule cards *all+*head and ZQVT+*self+*head.
const ruleCards = db
  .prepare("SELECT id, name, key, trash FROM cards WHERE key IN ('*all+*head','zqvt+*self+*head')")
  .all();
console.log("the two rule cards:", JSON.stringify(ruleCards));
