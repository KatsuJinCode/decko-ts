import Database from 'better-sqlite3';
import fs from 'fs';

const SRC = 'tmp/raw-ground-truth/deck/corpus-v2.sqlite3';
const DEST = 'tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3';

// EXACT portal classifier (review-server.mjs lines 518-533)
function dateJournalMatcher() {
  const RX_PREFIX = /^(?:\d{6}|\d{8})/;
  const RX_JUNCTION = /^(?:\d{6}|\d{8})\s*[-+]/;
  const RX_DATE_BDW = /\b(?:\d{6}|\d{8})\b\s*(?:bdw|bw)\b/i;
  const RX_BDW_DATE = /\b(?:bdw|bw)\s+(?:\d{6}|\d{8})\b/i;
  return (name) => {
    const n = String(name || "");
    if (!n) return false;
    if (RX_PREFIX.test(n)) return true;
    if (RX_JUNCTION.test(n)) return true;
    if (RX_DATE_BDW.test(n)) return true;
    if (RX_BDW_DATE.test(n)) return true;
    return false;
  };
}
const isDateJournalName = dateJournalMatcher();

// STEP 1: Re-copy source fresh
fs.copyFileSync(SRC, DEST);
console.log("Copied", SRC, "->", DEST);

const db = new Database(DEST);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// --- Counts BEFORE ---
const totalBefore = db.prepare(`SELECT COUNT(*) as c FROM cards`).get().c;
const liveBefore = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE trash=0`).get().c;
const trashedBefore = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE trash=1`).get().c;
const refsBefore = db.prepare(`SELECT COUNT(*) as c FROM card_references`).get().c;
const refsByTypeBefore = db.prepare(`SELECT ref_type, COUNT(*) as c FROM card_references GROUP BY ref_type ORDER BY ref_type`).all();
const virtualsBefore = db.prepare(`SELECT COUNT(*) as c FROM card_virtuals`).get().c;

console.log("\nBEFORE:");
console.log("  cards total:", totalBefore);
console.log("    live:", liveBefore);
console.log("    trashed:", trashedBefore);
console.log("  card_references total:", refsBefore);
console.log("    by ref_type:", refsByTypeBefore);
console.log("  card_virtuals total:", virtualsBefore);

// --- Phase 1: date-journal classification ---
const allRows = db.prepare(`SELECT id, name, trash FROM cards`).all();
const dj = [];
for (const r of allRows) if (isDateJournalName(r.name)) dj.push(r);
const djLive = dj.filter(r => r.trash === 0).length;
const djTrashed = dj.filter(r => r.trash === 1).length;
console.log("\nPhase 1: date-journal family");
console.log("  live matches:", djLive);
console.log("  trashed matches:", djTrashed);
console.log("  total:", dj.length);

// --- Phase 2: junction-card transitive closure ---
db.exec(`CREATE TEMP TABLE IF NOT EXISTS _del (id INTEGER PRIMARY KEY)`);
db.exec(`DELETE FROM _del`);
const ins = db.prepare(`INSERT OR IGNORE INTO _del (id) VALUES (?)`);
db.transaction(() => {
  for (const r of dj) ins.run(r.id);
})();
console.log("  seeded", dj.length, "ids in _del");

let round = 1;
const roundCounts = [];
while (true) {
  const rows = db.prepare(`
    SELECT DISTINCT c.id FROM cards c
    JOIN _del d ON (c.left_id = d.id OR c.right_id = d.id)
    WHERE c.id NOT IN (SELECT id FROM _del)
  `).all();
  if (rows.length === 0) break;
  db.transaction(() => {
    for (const r of rows) ins.run(r.id);
  })();
  roundCounts.push({ round, added: rows.length });
  console.log("  round", round, ": +", rows.length);
  round++;
  if (round > 50) { console.log("  safety break"); break; }
}
const totalInDel = db.prepare(`SELECT COUNT(*) as c FROM _del`).get().c;
console.log("Phase 2 done:", totalInDel, "cards in deletion set after", round-1, "rounds");

// --- Phase 3: dangling card_references where referee_id is in deletion set ---
// Per ask: "rule/pointer CONTENT references ... pruned only where a dangling reference would 500 a render".
// Card_references ref_type categorization:
//   I = Include  -> {{+name}} content inclusion. If target missing, render likely 500s.
//   Q = Query    -> { ... | name } structured query. Target missing likely 500s in most renderers.
//   P = Pointer  -> [[name]] in content. Renders as a link; missing target shows as broken link (no 500).
//   L = Link     -> structural link. Renders as text/link; missing target does not 500.
// Policy: PRUNE refs where the referee_id points to a deleted card AND ref_type is in (I, Q)
// (the structural references that would 500 a render). KEEP P and L (display references that
// render as broken links but do not 500). Document the breakdown for every ref_type.
const danglingAll = db.prepare(`SELECT id, ref_type, referer_id, referee_id FROM card_references WHERE referee_id IN (SELECT id FROM _del)`).all();
const danglingByTypeAll = {};
for (const r of danglingAll) danglingByTypeAll[r.ref_type] = (danglingByTypeAll[r.ref_type]||0)+1;
const PRUNE_TYPES = new Set(['I', 'Q']); // structural refs that would 500 a render
const danglingRefs = danglingAll.filter(r => PRUNE_TYPES.has(r.ref_type));
const danglingByType = {};
for (const r of danglingRefs) danglingByType[r.ref_type] = (danglingByType[r.ref_type]||0)+1;
const keptDanglingByType = {};
for (const r of danglingAll) if (!PRUNE_TYPES.has(r.ref_type)) keptDanglingByType[r.ref_type] = (keptDanglingByType[r.ref_type]||0)+1;
console.log("\nPhase 3: dangling card_references (referee_id in deletion set)");
console.log("  total dangling (any ref_type):", danglingAll.length);
console.log("  by ref_type (all dangling):", danglingByTypeAll);
console.log("  pruned (I+Q structural):", danglingRefs.length, danglingByType);
console.log("  kept (P+L display):", danglingAll.length - danglingRefs.length, keptDanglingByType);

// --- Counts by category for the report ---
const liveDel = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE id IN (SELECT id FROM _del) AND trash=0`).get().c;
const trashDel = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE id IN (SELECT id FROM _del) AND trash=1`).get().c;
const namedDel = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE id IN (SELECT id FROM _del) AND name IS NOT NULL`).get().c;
const anonDel = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE id IN (SELECT id FROM _del) AND name IS NULL`).get().c;
console.log("\nDeletion breakdown:");
console.log("  live:", liveDel);
console.log("  trashed:", trashDel);
console.log("  named (date-journal):", namedDel);
console.log("  anonymous (junction-cascade):", anonDel);

// --- DELETE in dependency order ---
console.log("\nDeleting...");
db.transaction(() => {
  const orphanRefs = db.prepare(`DELETE FROM card_references WHERE referer_id IN (SELECT id FROM _del)`);
  const r1 = orphanRefs.run();
  console.log("  card_references deleted (orphan from deleted referrers):", r1.changes);

  const danglingRefsDel = db.prepare(`DELETE FROM card_references WHERE referee_id IN (SELECT id FROM _del)`);
  const r2 = danglingRefsDel.run();
  console.log("  card_references deleted (dangling to deleted cards):", r2.changes);

  const delCards = db.prepare(`DELETE FROM cards WHERE id IN (SELECT id FROM _del)`);
  const r3 = delCards.run();
  console.log("  cards deleted:", r3.changes);
})();

// Verify no card_references rows with PRUNED types point to a deleted card
const stillDanglingPruned = db.prepare(`SELECT COUNT(*) as c FROM card_references WHERE referee_id IS NOT NULL AND ref_type IN ('I','Q') AND referee_id NOT IN (SELECT id FROM cards)`).get().c;
console.log("\n  post-delete dangling I/Q refs:", stillDanglingPruned, "(must be 0)");
// P/L refs may still dangle (display refs that don't 500) — document
const stillDanglingDisplay = db.prepare(`SELECT ref_type, COUNT(*) as c FROM card_references WHERE referee_id IS NOT NULL AND ref_type IN ('P','L') AND referee_id NOT IN (SELECT id FROM cards) GROUP BY ref_type`).all();
console.log("  post-delete dangling P/L refs (kept, display refs):", stillDanglingDisplay);

// --- Counts AFTER ---
const totalAfter = db.prepare(`SELECT COUNT(*) as c FROM cards`).get().c;
const liveAfter = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE trash=0`).get().c;
const trashedAfter = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE trash=1`).get().c;
const refsAfter = db.prepare(`SELECT COUNT(*) as c FROM card_references`).get().c;
const refsByTypeAfter = db.prepare(`SELECT ref_type, COUNT(*) as c FROM card_references GROUP BY ref_type ORDER BY ref_type`).all();
const virtualsAfter = db.prepare(`SELECT COUNT(*) as c FROM card_virtuals`).get().c;

console.log("\nAFTER:");
console.log("  cards total:", totalAfter);
console.log("    live:", liveAfter);
console.log("    trashed:", trashedAfter);
console.log("  card_references total:", refsAfter);
console.log("    by ref_type:", refsByTypeAfter);
console.log("  card_virtuals total:", virtualsAfter);

// Run portal classifier against scrubbed deck
const allScrubbed = db.prepare(`SELECT name FROM cards`).all();
let scrubbedMatches = 0;
for (const r of allScrubbed) if (isDateJournalName(r.name)) scrubbedMatches++;
console.log("\nPortal classifier against scrubbed deck:", scrubbedMatches, "matches (must be 0)");

// Save stats for the report
const stats = {
  before: {
    total: totalBefore,
    live: liveBefore,
    trashed: trashedBefore,
    refs: refsBefore,
    refsByType: refsByTypeBefore,
    virtuals: virtualsBefore
  },
  phase1: { live: djLive, trashed: djTrashed, total: dj.length },
  phase2: { rounds: roundCounts, totalInDel },
  phase3: {
    danglingAllTotal: danglingAll.length,
    danglingAllByType: danglingByTypeAll,
    prunedTotal: danglingRefs.length,
    prunedByType: danglingByType,
    keptTotal: danglingAll.length - danglingRefs.length,
    keptByType: keptDanglingByType,
    policy: "PRUNE ref_type IN ('I','Q') — structural refs that would 500 a render; KEEP 'P','L' — display refs (broken links, no 500)"
  },
  breakdown: { liveDel, trashDel, namedDel, anonDel },
  after: {
    total: totalAfter,
    live: liveAfter,
    trashed: trashedAfter,
    refs: refsAfter,
    refsByType: refsByTypeAfter,
    virtuals: virtualsAfter,
    scrubbedMatches
  }
};
fs.writeFileSync('./scrubber-stats.json', JSON.stringify(stats, null, 2));
console.log("\nStats saved to ./scrubber-stats.json");

// VACUUM to compact
console.log("\nRunning VACUUM...");
db.exec(`VACUUM`);
const sizeAfter = fs.statSync(DEST).size;
console.log("VACUUM done. File size:", sizeAfter, "bytes");

db.close();
console.log("\nDONE.");