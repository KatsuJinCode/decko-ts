const Db = require('better-sqlite3');
const db = new Db('benchmarks/corpus-v2/bench-corpus-v2.sqlite3', {readonly: true});
const cards = db.prepare("SELECT id, name, codename, content FROM cards WHERE name LIKE '%mini%' AND trash = 0 LIMIT 20").all();
console.log('Cards with mini:', JSON.stringify(cards, null, 2));
const setting = db.prepare("SELECT id, name, codename FROM cards WHERE name = ? AND trash = 0").get('*mini_bar_cols');
console.log('Setting card:', JSON.stringify(setting));
