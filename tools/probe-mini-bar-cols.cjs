const Db = require('better-sqlite3');
const db = new Db('benchmarks/corpus-v2/bench-corpus-v2.sqlite3', {readonly: true});

// Find any card with name containing 'bar_cols' (escaping wildcard)
const cards = db.prepare("SELECT id, name, codename, content FROM cards WHERE name LIKE 'kfnvyby%' AND trash = 0 LIMIT 30").all();
console.log('kfnvyby cards:', JSON.stringify(cards, null, 2));

// Find card types like xnhrjk
const types = db.prepare("SELECT id, name, codename FROM cards WHERE name = 'xnhrjk' AND trash = 0").get();
console.log('xnhrjk type:', JSON.stringify(types));

// Find all rule cards (right_id = setting codename id)
// First find setting codename id
const settingCn = db.prepare("SELECT id FROM cards WHERE codename = 'setting' AND trash = 0").get();
console.log('Setting codename id:', JSON.stringify(settingCn));

if (settingCn) {
  // count of rule cards
  const count = db.prepare("SELECT COUNT(*) as c FROM cards WHERE right_id = ? AND trash = 0").get(settingCn.id);
  console.log('Rule cards count:', JSON.stringify(count));
}
