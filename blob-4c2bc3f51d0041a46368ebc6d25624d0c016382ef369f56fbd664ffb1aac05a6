const Db = require('better-sqlite3');
const db = new Db('benchmarks/corpus-v2/bench-corpus-v2.sqlite3', {readonly: true});

// Find all rule cards by type = setting
const rules = db.prepare("SELECT id, name, content FROM cards WHERE type_id = 278 AND trash = 0 AND content IS NOT NULL AND content != ''").all();
console.log('Rule cards with content:', rules.length);
console.log(JSON.stringify(rules.slice(0, 10), null, 2));

// Find setting cards with content
const settingCards = db.prepare("SELECT id, name, content FROM cards WHERE codename IS NOT NULL AND type_id = 278 AND content IS NOT NULL AND content != ''").all();
console.log('Setting cards with content:', settingCards.length);
console.log(JSON.stringify(settingCards.slice(0, 10), null, 2));

// Check bar_cols / mini_bar_cols
const colsCards = db.prepare("SELECT id, name, codename, content FROM cards WHERE name LIKE 'bar_cols' OR name LIKE 'mini_bar_cols' OR codename LIKE 'bar_cols' OR codename LIKE 'mini_bar_cols'").all();
console.log('bar_cols cards:', JSON.stringify(colsCards, null, 2));

// All setting codename cards
const codenames = db.prepare("SELECT id, name, codename FROM cards WHERE type_id = 278 AND codename IS NOT NULL").all();
console.log('Setting codenames count:', codenames.length);
console.log(JSON.stringify(codenames.slice(0, 30), null, 2));
