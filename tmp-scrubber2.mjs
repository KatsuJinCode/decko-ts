import Database from 'better-sqlite3';
const db = new Database('tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3', {readonly: true});

// Inspect the surviving card_references after my prior prune
// What ref_types remain and how many are still dangling?
const total = db.prepare(`SELECT COUNT(*) as c FROM card_references`).get().c;
console.log("Current card_references in scrubbed deck:", total);

// refs where referee_id points to a non-existent card (still dangling)
const stillDangling = db.prepare(`SELECT ref_type, COUNT(*) as c FROM card_references WHERE referee_id IS NOT NULL AND referee_id NOT IN (SELECT id FROM cards) GROUP BY ref_type`).all();
console.log("Still dangling refs by type:", stillDangling);

// refs where referee_id is unresolved (NULL) - these were unresolved before, not affected
const unresolved = db.prepare(`SELECT ref_type, COUNT(*) as c FROM card_references WHERE referee_id IS NULL GROUP BY ref_type`).all();
console.log("Unresolved refs (referee_id NULL) by type:", unresolved);
db.close();
