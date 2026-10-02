// census-trial-edge-cards-for-scrub-proof.mjs — pull a full id+name census of
// the TRIAL decko-edge DB, compute the five-regex date-journal classifier
// matches and the junction deletion closure FROM THAT CENSUS, and write all
// three artifacts to disk so a scrub's actual deletion set can be diffed
// against the independently computed closure afterwards.
//
// WHY THIS EXISTS: the scrub-quiescence lane must prove (a) the classifier is
// 0 after the scrub, (b) the deleted set EQUALS the closure computation, and
// (c) every non-deleted card is unchanged. That requires a before/after pair
// of full censuses plus an independent closure computation — the scrub tools
// print their own numbers but do not persist the row-level sets.
//
// CLASSIFIER PROVENANCE: the eight regexes below are copied verbatim from
// tmp/content-sync-rehearsal/scrub-trial-decko-edge-in-place.mjs (the portal
// four + the four 2026-10-02 extensions: dashed widened to \d{1,2} components,
// slashed, dotted, day-first — the on-disk state when the quiescence scrub
// ran, which is another session's same-day scrub-shapes-lane edit), and the
// closure rule from its Phase 2: a card whose left_id or right_id is already
// in the deletion set joins the set, to a fixed point. If this copy and the
// scrub ever diverge, the diff verification is invalid — keep them identical.
//
// TRIAL ONLY: reads BUNNY_TRIAL_DB_URL / BUNNY_TRIAL_DB_TOKEN from the creds
// file, refuses any host that is not decko-edge. Secrets never printed; the
// written artifacts hold only ids, names, keys, trash flags, junction ids.
//
//   node tmp/scrub-quiescence-lane/census-trial-edge-cards-for-scrub-proof.mjs <creds-file> <tag>
// writes tmp/scrub-quiescence-lane/census-<tag>.json   (full card rows)
//        tmp/scrub-quiescence-lane/classifier-matches-<tag>.json
//        tmp/scrub-quiescence-lane/junction-closure-<tag>.json

import { createClient } from '@libsql/client';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)));

// ---- classifier: verbatim copy of the current scrub-trial-decko-edge-in-place.mjs
const RX_PREFIX = /^(?:\d{6}|\d{8})/;
const RX_JUNCTION = /^(?:\d{6}|\d{8})\s*[-+]/;
const RX_DATE_BDW = /\b(?:\d{6}|\d{8})\b\s*(?:bdw|bw)\b/i;
const RX_BDW_DATE = /\b(?:bdw|bw)\s+(?:\d{6}|\d{8})\b/i;
const RX_ISO_DASHED = /\b\d{4}-\d{1,2}-\d{1,2}/;
const RX_ISO_SLASHED = /\b\d{4}\/\d{1,2}\/\d{1,2}/;
const RX_ISO_DOTTED = /\b\d{4}\.\d{1,2}\.\d{1,2}/;
const RX_DAY_FIRST = /\b\d{1,2}-\d{1,2}-\d{4}/;
function isDateJournalName(name) {
  const n = String(name || '');
  if (!n) return false;
  return RX_PREFIX.test(n) || RX_JUNCTION.test(n) || RX_DATE_BDW.test(n) || RX_BDW_DATE.test(n)
    || RX_ISO_DASHED.test(n) || RX_ISO_SLASHED.test(n) || RX_ISO_DOTTED.test(n) || RX_DAY_FIRST.test(n);
}
// self-test, same positives/negatives/gaps as the current scrub tool
const SELFTEST_POSITIVE = [
  '20260826', '20260826 Planning', '20260826+Review', '20260826-Retro', '20260826 bdw', 'bdw 20260826', '202608 BDW',
  '2026-08-26', '2026-08-26 Rehearsal Journal', '2026-08-26 notes', '2026-08-26+Review', '2026-08-26T14:30', 'bdw 2026-08-26',
  '2026-8-26', '2026-08-6', '2026-8-6',
  '2026/08/26', '2026/08/26 Journal', '2026/8/26',
  '2026.08.26', '2026.08.26 notes', '2026.8.26',
  '26-08-2026', '26-08-2026 Planning', '6-8-2026',
];
const SELFTEST_NEGATIVE = ['Home', 'About', 'Hello World', 'About+Home', 'Cardtype',
  '12026-08-26', '12026-8-26', '12026/08/26', '12026.08.26', '12026-08-2026', '20261-08-26'];
const SELFTEST_KNOWN_GAPS = ['v2026-08-26', '26/08/26'];
let selftestFailed = 0;
for (const n of SELFTEST_POSITIVE) if (!isDateJournalName(n)) { console.error(`  census classifier MISSED: ${JSON.stringify(n)}`); selftestFailed++; }
for (const n of SELFTEST_NEGATIVE) if (isDateJournalName(n)) { console.error(`  census classifier FALSELY matched: ${JSON.stringify(n)}`); selftestFailed++; }
for (const n of SELFTEST_KNOWN_GAPS) if (isDateJournalName(n)) { console.error(`  census classifier gap closed unexpectedly: ${JSON.stringify(n)}`); selftestFailed++; }
if (selftestFailed > 0) { console.error('census classifier self-test FAILED; aborting (census would not match the scrub)'); process.exit(1); }
console.log('  census classifier self-test passed (same vectors as the scrub tools)');

const credsPath = process.argv[2];
const tag = process.argv[3];
if (!credsPath || !tag) { console.error('usage: census-trial-edge-cards-for-scrub-proof.mjs <creds-file> <tag>'); process.exit(2); }
const creds = Object.fromEntries(
  readFileSync(credsPath, 'utf8').split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; }),
);
const url = creds.BUNNY_TRIAL_DB_URL;
const token = creds.BUNNY_TRIAL_DB_TOKEN;
if (!url || !token) { console.error('creds file has no BUNNY_TRIAL_DB_URL / BUNNY_TRIAL_DB_TOKEN'); process.exit(2); }
const host = url.replace(/^[a-z]+:\/\//, '').split('/')[0].split('@').pop();
if (!host.includes('decko-edge')) { console.error(`REFUSING: target host ${host} is not the trial database (decko-edge).`); process.exit(1); }
console.log('  target host:', host);

const client = createClient({ url, authToken: token });
const scalar = async (sql) => Number((await client.execute(sql)).rows[0][0]);

const cards = (await client.execute('SELECT id, name, key, trash, left_id, right_id FROM cards')).rows.map((r) => ({
  id: Number(r[0]), name: r[1], key: r[2], trash: r[3],
  left_id: r[4] === null ? null : Number(r[4]), right_id: r[5] === null ? null : Number(r[5]),
}));
const refsCount = await scalar('SELECT COUNT(*) FROM card_references');
const danglingReferee = await scalar('SELECT COUNT(*) FROM card_references WHERE referee_id IS NOT NULL AND referee_id NOT IN (SELECT id FROM cards)');
const danglingReferer = await scalar('SELECT COUNT(*) FROM card_references WHERE referer_id IS NOT NULL AND referer_id NOT IN (SELECT id FROM cards)');

const live = cards.filter((c) => c.trash === 0).length;
const trashed = cards.filter((c) => c.trash === 1).length;
console.log(`\nCENSUS ${tag}: cards ${cards.length} (live ${live}, trashed ${trashed}), card_references ${refsCount}`);
console.log(`  dangling refs (referee missing): ${danglingReferee}; (referer missing): ${danglingReferer}`);

// classifier matches from THIS census
const matches = cards.filter((c) => isDateJournalName(c.name));
console.log(`  classifier matches: ${matches.length} (live ${matches.filter((c) => c.trash === 0).length}, trashed ${matches.filter((c) => c.trash === 1).length})`);

// junction closure from THIS census (same fixed-point rule as the scrub)
const toDelete = new Set(matches.map((c) => c.id));
const rounds = [];
for (let round = 1; ; round++) {
  const added = [];
  for (const c of cards) {
    if (toDelete.has(c.id)) continue;
    if ((c.left_id !== null && toDelete.has(c.left_id)) || (c.right_id !== null && toDelete.has(c.right_id))) added.push(c.id);
  }
  if (added.length === 0) break;
  for (const id of added) toDelete.add(id);
  rounds.push({ round, added: added.length });
  if (round > 50) { console.log('  safety break at round 50'); break; }
}
console.log(`  junction closure: ${toDelete.size} cards in ${rounds.length} round(s)`);

writeFileSync(join(OUT_DIR, `census-${tag}.json`), JSON.stringify({ tag, takenAt: new Date().toISOString(), host, cards_total: cards.length, live, trashed, refs: refsCount, danglingReferee, danglingReferer, cards }, null, 1) + '\n');
writeFileSync(join(OUT_DIR, `classifier-matches-${tag}.json`), JSON.stringify({ tag, count: matches.length, ids: matches.map((c) => c.id), names_sample: matches.slice(0, 20).map((c) => c.name) }, null, 1) + '\n');
writeFileSync(join(OUT_DIR, `junction-closure-${tag}.json`), JSON.stringify({ tag, seeds: matches.length, closure_size: toDelete.size, rounds, ids: [...toDelete].sort((a, b) => a - b) }, null, 1) + '\n');
console.log(`  wrote census-${tag}.json, classifier-matches-${tag}.json, junction-closure-${tag}.json`);

client.close();
