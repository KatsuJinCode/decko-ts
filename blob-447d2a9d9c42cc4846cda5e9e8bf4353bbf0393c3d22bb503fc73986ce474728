// Batch I (attempt 3): views.ts scrub sites 12-21 (tranche-2 jargon).
// Sites: @3354 p21 CQL denied-arm header, @3593 link-registration-drift,
// @3799 bar-slots V6, @3892 bar-slots Z3, @4559 replays-adjudication,
// @4752 mod-a creator_credit level, @5020 mm-cardtype-tpl header,
// @5063 mm-roleviews UNCHANGED, @5154 email-text-remainders, @5231
// lane-reset-flows token_url port. Byte-safe anchors, write only on
// all-exact-once match.
import fs from 'node:fs';

const F = 'src/card/render/views.ts';
const sites = [
  {
    old: "// p21 CQL item-typing lane: the denied-arm SHAPE follows Ruby's",
    new: "// The denied-arm SHAPE follows Ruby's",
  },
  {
    old: 'SINGLE SOURCE for BOTH registrations (link-registration-drift lane\n *  2026-10-01): the html-format',
    new: 'SINGLE SOURCE for BOTH registrations (2026-10-01): the html-format',
  },
  {
    old: 'bar-slots lane 2026-09-29 (view-fail class V6: 45 oracle entries ',
    new: '2026-09-29 (view-fail class V6: 45 oracle entries ',
  },
  {
    old: "// bar-slots lane (2026-09-29, view-fail class Z3): Mod-typed cards'",
    new: "// view-fail class Z3 (2026-09-29): Mod-typed cards'",
  },
  {
    old: "// (replays-adjudication lane, 2026-10-01: the page's whole residual diff",
    new: "// (2026-10-01: the page's whole residual diff",
  },
  {
    old: '// level the mod-a lane used for creator_credit; :board_act stays the mod',
    new: '// level creator_credit is ported at; :board_act stays the mod',
  },
  {
    old: 'Lane mm-cardtype-tpl (2026-09-30): this flat fallback carried the SAME',
    new: '2026-09-30: this flat fallback carried the SAME',
  },
  {
    old: "(home_path's gate, same set). UNCHANGED by the mm-roleviews lane\n *  and deliberately so: the capture MASKS",
    new: "(home_path's gate, same set). Deliberately UNCHANGED:\n *  the capture MASKS",
  },
  {
    old: 'email-text-remainders lane (2026-10-01): this fn is ALSO the follow',
    new: '2026-10-01: this fn is ALSO the follow',
  },
  {
    old: "(lane-reset-flows' port of `token_url`); it substitutes the URL into",
    new: '(the `token_url` port); it substitutes the URL into',
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
  console.error(`batch I: ${failures} site(s) failed; file NOT written`);
  process.exit(1);
}
fs.writeFileSync(F, t, 'latin1');
console.log(`batch I applied: ${sites.length} sites, ${F} bytes ${before}->${t.length}`);
