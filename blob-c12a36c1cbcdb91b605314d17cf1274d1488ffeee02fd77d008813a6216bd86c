// Batch H (attempt 3): views.ts scrub sites 1-11 (tranche-2 jargon).
// Sites: @815 D3 lane, @912 P22 rule-bar header, @1137 Kramdown-lane,
// @1272 layout-whitespace census, @1447 corpus census this lane, @1510
// stood before this lane, @1652 decko runner this lane, @1702 stood here
// before this lane, @2441 layout-whitespace, @3289 slotjson-type threading,
// @3291 permission lane's census. Byte-safe anchors (\r?\n tolerant, ending
// reused), write only when every site matched exactly once.
import fs from 'node:fs';

const F = 'src/card/render/views.ts';
const sites = [
  {
    old: '// BARE VIEW LANE FIXED 2026-10-02 (the D3 lane). This branch answered',
    new: '// BARE VIEW LANE FIXED 2026-10-02 (D3). This branch answered',
  },
  {
    old: "// P22 rule-bar one-line lane: the gate below is Ruby's standard_rule?",
    new: "// The gate below is Ruby's standard_rule?",
  },
  {
    old: 'Kramdown-lane 2026-09-29: the',
    new: 'Kramdown 2026-09-29: the',
  },
  {
    old: 'layout-whitespace lane (2026-09-29), page-mechanism census: 27 sampled',
    new: '(2026-09-29), page-mechanism census: 27 sampled',
  },
  {
    old: 'Corpus census (this lane,\n *  bench-corpus-raw.sqlite3): signup',
    new: 'Corpus census\n *  (bench-corpus-raw.sqlite3): signup',
  },
  {
    old: "stood before this lane (the all-set/base-class :core in the port's",
    new: 'stood here before (the all-set/base-class :core in the port\'s',
  },
  {
    old: '(bundle exec decko runner, this lane): edit_fields ==',
    new: '(bundle exec decko runner): edit_fields ==',
  },
  {
    old: 'stood here before this\n *  lane, byte-identically. */',
    new: 'stood here before,\n *  byte-identically. */',
  },
  {
    old: '// layout-whitespace lane (2026-09-29): the group items are JOINED, not',
    new: '// (2026-09-29): the group items are JOINED, not',
  },
  {
    old: "slotjson-type lane's threading retained on both slot-emitting",
    new: 'type-opt threading retained on both slot-emitting',
  },
  {
    old: "retired by the\n  // permission lane's census).",
    new: 'retired by the\n  // census).',
  },
];

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let t = fs.readFileSync(F, 'latin1');
const before = t.length;
let failures = 0;
for (const site of sites) {
  const re = new RegExp(esc(site.old).replace(/\n/g, '\\r?\\n'));
  const count = t.split(re).length - 1;
  if (count !== 1) {
    console.error(`FAIL (count=${count}): ${JSON.stringify(site.old.slice(0, 70))}`);
    failures++;
    continue;
  }
  const m = re.exec(t);
  const rep = site.new.replace(/\n/g, m[0].includes('\r\n') ? '\r\n' : '\n');
  t = t.replace(re, () => rep);
}
if (failures > 0) {
  console.error(`batch H: ${failures} site(s) failed; file NOT written`);
  process.exit(1);
}
fs.writeFileSync(F, t, 'latin1');
console.log(`batch H applied: ${sites.length} sites, ${F} bytes ${before}->${t.length}`);
