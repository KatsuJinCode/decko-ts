// Batch F (attempt 3): render.ts scrub sites 9-15 (tranche-2 jargon).
// Sites: @1805 p21 CQL header, @2174 p20 lane's pinned class, @2179 verbatim
// this lane, @2328 FORM-SUBSTRATE LANE CORRECTION, @2455 perm-leak lane,
// @2791 bar-slots own doc, @5018 bar-slots V1. Byte-safe anchors, write only
// when every site matched exactly once.
import fs from 'node:fs';

const F = 'src/card/render.ts';
const sites = [
  {
    old: '/** p21 CQL item-typing lane: the phantom-item VIRTUAL resolution ',
    new: '/** The phantom-item VIRTUAL resolution ',
  },
  {
    old: "highlighted layout source (the p20 lane's\n   *     pinned class).",
    new: 'highlighted layout source (the oracle-pinned\n   *     class).',
  },
  {
    old: 'verbatim this lane: `permission_rule_id`',
    new: 'verbatim: `permission_rule_id`',
  },
  {
    old: 'FORM-SUBSTRATE LANE CORRECTION (oracle-pinned by',
    new: 'CORRECTION (oracle-pinned by',
  },
  {
    old: 'Page-render recovery seam (the perm-leak lane, 2026-09-29): resolve the',
    new: 'Page-render recovery seam (2026-09-29): resolve the',
  },
  {
    old: "un-skipped arm below (bar-slots lane's own doc).",
    new: "un-skipped arm below (the un-skipped arm's own doc).",
  },
  {
    old: '// bar-slots lane (2026-09-29, view-fail class V1): the *star set card',
    new: '// 2026-09-29 (view-fail class V1): the *star set card',
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
  console.error(`batch F: ${failures} site(s) failed; file NOT written`);
  process.exit(1);
}
fs.writeFileSync(F, t, 'latin1');
console.log(`batch F applied: ${sites.length} sites, ${F} bytes ${before}->${t.length}`);
