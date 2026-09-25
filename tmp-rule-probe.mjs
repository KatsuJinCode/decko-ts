import Database from 'better-sqlite3';
const db = new Database('tmp/raw-ground-truth/deck/corpus-v2.sqlite3', {readonly: true});

// Find the type_id values for "Rule" and "Pointer" cardtypes
const types = db.prepare(`SELECT id, name, codename FROM cards WHERE codename IN ('rule','pointer','basic','pointer_rule','search','user_rule','all','all_plus','everything') ORDER BY id`).all();
console.log("Type-relevant cards:", types);

// Now what are type_ids for rules and pointers
const typeIds = db.prepare(`SELECT type_id, COUNT(*) as c FROM cards WHERE type_id IN (SELECT id FROM cards WHERE codename LIKE '%rule%' OR codename LIKE '%pointer%' OR codename LIKE '%search%') GROUP BY type_id`).all();
console.log("type_ids used for rule/pointer/search cards:", typeIds);

// What is the Rule cardtype name and id?
const ruleCt = db.prepare(`SELECT id, name, codename FROM cards WHERE name IN ('Rule','Pointer','Search','*rule','*pointer')`).all();
console.log("Rule/Pointer cardtypes:", ruleCt);

// Check cards with type_id that's a Rule-type cardtype
const ruleCards = db.prepare(`SELECT id, name, type_id, trash FROM cards WHERE type_id IN (SELECT id FROM cards WHERE codename = 'rule' OR codename = 'pointer_rule' OR codename = 'user_rule')`).all();
console.log("Cards with type_id = rule/pointer_rule/user_rule:", ruleCards.length);
db.close();
