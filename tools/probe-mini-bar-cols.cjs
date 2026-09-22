const Db = require('better-sqlite3');
const db = new Db('benchmarks/corpus-v2/bench-corpus-v2.sqlite3', {readonly: true});

// Find any card with right_id = setting codename id
const settingCn = db.prepare("SELECT id FROM cards WHERE codename = 'setting' AND trash = 0").get();
console.log('Setting codename id:', JSON.stringify(settingCn));

const rules = db.prepare("SELECT id, name, left_id, right_id, content FROM cards WHERE right_id = ? AND trash = 0 LIMIT 30").all(settingCn.id);
console.log('Rule cards:', JSON.stringify(rules, null, 2));
console.log('Total:', rules.length);
