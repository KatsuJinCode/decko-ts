// Batch G (attempt 3): format.ts scrub sites (tranche-2 jargon), 12 sites.
// @172 VERIFY-AT-EDIT resolved with full hunk context: the two pins are the
// board-stage3 engage_tab oracle arm and the bar-family oracle arm -> the
// fact is "two consumers, each with its own oracle arm". @703 VERIFY-AT-EDIT:
// "re-verified by the nest-mechanism-remainders lane the same day" -> the
// date fact 2026-10-01 (the same day as the 2026-10-01 port named in this
// docblock's own @417 sibling). Byte-safe anchors, write only on
// all-exact-once match.
import fs from 'node:fs';

const F = 'src/card/render/format.ts';
const sites = [
  {
    old: '// card" - options.rb:50). Two consumers pinned it on different lanes:',
    new: '// card" - options.rb:50). Two consumers pinned it, each with its own oracle arm:',
  },
  {
    old: 'process_visibility_options force). The forms lane depends on the',
    new: 'process_visibility_options force). The edit forms depend on the',
  },
  {
    old: 'Rails runtime; card-mod-edit\'s own views are out of scope\n *               for this engine lane).',
    new: 'Rails runtime; card-mod-edit\'s own views are out of scope\n *               for the engine port).',
  },
  {
    old: 'elision; nest-mechanism-remainders lane\n *               2026-10-01',
    new: 'elision;\n *               2026-10-01',
  },
  {
    old: 'COMPACT CENSUS (re-verified by the\n   * nest-mechanism-remainders lane the same day on the sha-verified',
    new: 'COMPACT CENSUS (re-verified 2026-10-01\n   * on the sha-verified',
  },
  {
    old: "// D10 (this lane's fix): the port had a SECOND, forked walk here -",
    new: '// D10 (fixed here): the port had a SECOND, forked walk here -',
  },
  {
    old: 'bar-slots lane 2026-09-29 (view-fail class Z10): settings with an',
    new: '2026-09-29 (view-fail class Z10): settings with an',
  },
  {
    old: 'Merge note (pass-18): both lanes landed the SAME three codenames ',
    new: 'Merge note (pass-18): both merge parents landed the SAME three codenames ',
  },
  {
    old: '/** bar-slots lane 2026-09-29 (view-fail class Z10): the setting display',
    new: '/** 2026-09-29 (view-fail class Z10): the setting display',
  },
  {
    old: '/** p21 CQL item-typing lane: the phantom-item VIRTUAL resolution',
    new: '/** The phantom-item VIRTUAL resolution',
  },
  {
    old: "classes; the p20-autolink lane's\n// ms.paula fix, page 11251):",
    new: 'classes; the\n// ms.paula fix, page 11251):',
  },
  {
    old: "the same no-card-title-span property, which was that lane's fix.)",
    new: 'the same no-card-title-span property.)',
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
  console.error(`batch G: ${failures} site(s) failed; file NOT written`);
  process.exit(1);
}
fs.writeFileSync(F, t, 'latin1');
console.log(`batch G applied: ${sites.length} sites, ${F} bytes ${before}->${t.length}`);
