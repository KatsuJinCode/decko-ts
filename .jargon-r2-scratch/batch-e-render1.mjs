// Batch E (attempt 3): render.ts scrub sites 1-8 of 15 (tranche-2 jargon).
// Sites: @119 board lane, @357 session-replay2, @591 p20-nest-selection,
// @992 bar-slots V6, @1193 this lane, @1389 form-substrate-2, @1722 sass lane,
// @1724 Lane p22-rules-table. Byte-safe: \r?\n tolerant anchors, ending
// reused, files written only when EVERY site matched exactly once.
import fs from 'node:fs';

const F = 'src/card/render.ts';
const sites = [
  {
    old: '// "history_tab" joins for the board lane (card-mod-edit tab_views.rb:8-12:',
    new: '// "history_tab" joins for the board views (card-mod-edit tab_views.rb:8-12:',
  },
  {
    old: 'forever (observed\n   *  live: session-replay2 lane step-05). The next render re-fetches and',
    new: 'forever (observed\n   *  live). The next render re-fetches and',
  },
  {
    old: "(the\n   *  p20-nest-selection lane: content/all.rb:17-19 standard_content's",
    new: "(the\n   *  content/all.rb:17-19 standard_content's",
  },
  {
    old: '// bar-slots lane (view-fail class V6): the bootswatch_skin bar_left',
    new: '// view-fail class V6: the bootswatch_skin bar_left',
  },
  {
    old: '// shape and are unchanged by this lane.',
    new: '// shape and are unchanged by this change.',
  },
  {
    old: "// form-substrate-2 lane's modal hidden-header arm reaches the wrap",
    new: '// form-substrate-2 modal hidden-header arm reaches the wrap',
  },
  {
    old: "real help text; the pass-15 sass lane's\n      // three +*variables pages pin the resolved bytes).",
    new: 'real help text; the\n      // three +*variables pages pin the resolved bytes).',
  },
  {
    old: "// Lane p22-rules-table (head-rule popover counts): the help resolver's",
    new: "// Head-rule popover counts: the help resolver's",
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
  console.error(`batch E: ${failures} site(s) failed; file NOT written`);
  process.exit(1);
}
fs.writeFileSync(F, t, 'latin1');
console.log(`batch E applied: ${sites.length} sites, ${F} bytes ${before}->${t.length}`);
