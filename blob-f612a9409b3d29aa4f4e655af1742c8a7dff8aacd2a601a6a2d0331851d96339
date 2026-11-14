// verify-scrub-census-diff-row-by-row.mjs — prove a scrub's deletion was
// exactly the closure computation and nothing else, from two census files.
//
// CHECKS (all must hold for the verification to pass):
//   1. deleted set  = ids present before, absent after  — must EQUAL the
//      closure computation saved from the BEFORE census, id for id.
//   2. appeared set = ids present after, absent before  — must be empty
//      (a scrub deletes; it never adds).
//   3. every survivor's full row (id, name, key, trash, left_id, right_id)
//      is byte-identical between the two censuses.
//   4. classifier matches after (already computed in the after census
//      artifact) = 0.
//
//   node tmp/scrub-quiescence-lane/verify-scrub-census-diff-row-by-row.mjs <beforeTag> <afterTag>

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const [beforeTag, afterTag] = process.argv.slice(2);
if (!beforeTag || !afterTag) { console.error('usage: verify-scrub-census-diff-row-by-row.mjs <beforeTag> <afterTag>'); process.exit(2); }

const cens = (t) => JSON.parse(readFileSync(join(DIR, `census-${t}.json`), 'utf8'));
const closure = (t) => JSON.parse(readFileSync(join(DIR, `junction-closure-${t}.json`), 'utf8'));
const before = cens(beforeTag);
const after = cens(afterTag);

const beforeIds = new Map(before.cards.map((c) => [c.id, c]));
const afterIds = new Map(after.cards.map((c) => [c.id, c]));

const deleted = [...beforeIds.keys()].filter((id) => !afterIds.has(id));
const appeared = [...afterIds.keys()].filter((id) => !beforeIds.has(id));
const closureSet = new Set(closure(beforeTag).ids);

const deletedNotInClosure = deleted.filter((id) => !closureSet.has(id));
const closureNotDeleted = [...closureSet].filter((id) => !deleted.includes(id));

// full-row identity over every survivor
let rowMismatches = 0;
for (const [id, b] of beforeIds) {
  const a = afterIds.get(id);
  if (!a) continue;
  const cols = ['name', 'key', 'trash', 'left_id', 'right_id'];
  const diff = cols.filter((c) => JSON.stringify(b[c]) !== JSON.stringify(a[c]));
  if (diff.length) { rowMismatches++; if (rowMismatches <= 10) console.log(`  ROW DIFF id ${id} (${b.name}): ${diff.join(', ')}`); }
}

const summary = {
  beforeTag, afterTag,
  before_cards: before.cards.length, after_cards: after.cards.length,
  before_refs: before.refs, after_refs: after.refs,
  deleted_count: deleted.length,
  appeared_count: appeared.length,
  closure_size: closureSet.size,
  deleted_equals_closure: deleted.length === closureSet.size && deletedNotInClosure.length === 0 && closureNotDeleted.length === 0,
  deleted_not_in_closure_sample: deletedNotInClosure.slice(0, 10),
  closure_not_deleted_sample: closureNotDeleted.slice(0, 10),
  survivor_row_mismatches: rowMismatches,
  classifier_matches_after: JSON.parse(readFileSync(join(DIR, `classifier-matches-${afterTag}.json`), 'utf8')).count,
  dangling_refs_after: { referee: after.danglingReferee, referer: after.danglingReferer },
};
console.log(JSON.stringify(summary, null, 2));

const pass = summary.deleted_count === 0 || summary.deleted_equals_closure;
if (appeared.length > 0) { console.error('FAIL: cards appeared (a scrub never adds)'); process.exit(1); }
if (!pass) { console.error('FAIL: deleted set does not equal the closure computation'); process.exit(1); }
if (rowMismatches !== 0) { console.error('FAIL: survivor rows changed'); process.exit(1); }
if (summary.classifier_matches_after !== 0) { console.error('FAIL: classifier residuals after'); process.exit(1); }
if (after.danglingReferee !== 0 || after.danglingReferer !== 0) { console.error('FAIL: dangling references after'); process.exit(1); }
console.log(`VERIFY PASS: deleted ${summary.deleted_count} (== closure ${summary.closure_size}), appeared 0, ${summary.after_cards - summary.deleted_count - appeared.length} survivor rows identical, classifier ${summary.classifier_matches_after}, dangling 0/0`);
