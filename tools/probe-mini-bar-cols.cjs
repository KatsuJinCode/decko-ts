const Db = require('better-sqlite3');
const db = new Db('benchmarks/corpus-v2/bench-corpus-v2.sqlite3', {readonly: true});

// Check card 67 right_id
const c67 = db.prepare("SELECT id, name, left_id, right_id, type_id, content FROM cards WHERE id = 67").get();
console.log('Card 67:', JSON.stringify(c67, null, 2));

// Find *thanks card
const thanks = db.prepare("SELECT id, name, codename, type_id FROM cards WHERE name = '*thanks' OR codename = 'thanks'").get();
console.log('Thanks card:', JSON.stringify(thanks));

// Find *thanks card by type
if (thanks) {
  const rules = db.prepare("SELECT id, name, left_id, right_id, content FROM cards WHERE right_id = ? AND trash = 0").all(thanks.id);
  console.log('Rules for *thanks:', JSON.stringify(rules, null, 2));
}

// Check setting codename card
const settingCn = db.prepare("SELECT id, name, codename, type_id FROM cards WHERE id = 278").get();
console.log('Card 278:', JSON.stringify(settingCn, null, 2));

// Find all cards with codename starting with *
const cn = db.prepare("SELECT id, name, codename FROM cards WHERE codename IS NOT NULL AND name LIKE '%thanks%'").all();
console.log('Codename thanks:', JSON.stringify(cn));
