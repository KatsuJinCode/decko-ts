// Batch K (attempt 3): small files set B — page 250; pointer-list 495;
// prefetch 28/189/1108/1418; rule-bar-right 224; set-keys-to-modules 92/113;
// setting-help-text 117; virtual-rule-card 63/217. Per-file all-or-nothing
// writes, byte-safe anchors (\r?\n tolerant, ending reused).
import fs from 'node:fs';

const sites = [
  {
    file: 'src/card/render/page.ts',
    old: '// Permission recovery (the perm-leak lane, 2026-09-29): a prepare render',
    new: '// Permission recovery (2026-09-29): a prepare render',
  },
  {
    file: 'src/card/render/pointer-list.ts',
    old: "'; compile-engines lane adds the pass-15 Skin",
    new: "'; the pass-15 Skin",
  },
  {
    file: 'src/card/render/prefetch.ts',
    old: '// 2. The PRELUDE BATCH (2026-09-27 cold-query lane; before this, the folds',
    new: '// 2. The PRELUDE BATCH (2026-09-27; before this, the folds',
  },
  {
    file: 'src/card/render/prefetch.ts',
    old: 'TWO round trips (2026-09-27 cold-query\n * lane): the root fetch',
    new: 'TWO round trips (2026-09-27):\n * the root fetch',
  },
  {
    file: 'src/card/render/prefetch.ts',
    old: 'churn per negative name is exactly the burst this lane removes).',
    new: 'churn per negative name is exactly the burst this path avoids).',
  },
  {
    file: 'src/card/render/prefetch.ts',
    old: 'page-mechanism census,\n        // render-state-fix lane): a bare view',
    new: 'page-mechanism census):\n        // a bare view',
  },
  {
    file: 'src/card/render/rule-bar-right.ts',
    old: '// bar-slots lane (2026-09-29, view-fail class V9): count != 1 renders',
    new: '// view-fail class V9 (2026-09-29): count != 1 renders',
  },
  {
    file: 'src/card/render/set-keys-to-modules.ts',
    old: 'measured live in the cwwrite-seam\n * lane: ',
    new: 'measured live:\n * ',
  },
  {
    file: 'src/card/render/set-keys-to-modules.ts',
    old: '// "TypePlusRight::User::Email". Measured live in the seed-sweep lane:',
    new: '// "TypePlusRight::User::Email". Measured live:',
  },
  {
    file: 'src/card/render/setting-help-text.ts',
    old: '// --- rule-tooltips lane (2026-09-29) extensions, sourced verbatim from the',
    new: '// --- 2026-09-29 extensions, sourced verbatim from the',
  },
  {
    file: 'src/card/render/virtual-rule-card.ts',
    old: '// R16 residual lane (2026-09-27), corpus-wide re-measure: the oracle\'s',
    new: "// Corpus-wide re-measure (2026-09-27): the oracle's",
  },
  {
    file: 'src/card/render/virtual-rule-card.ts',
    old: 'The codename\n  // join the 2026-09-26 rules-editor lane left in place is key-identical',
    new: 'The codename\n  // join left in place 2026-09-26 is key-identical',
  },
];

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const byFile = new Map();
for (const site of sites) {
  if (!byFile.has(site.file)) byFile.set(site.file, []);
  byFile.get(site.file).push(site);
}
let failures = 0;
for (const [file, fileSites] of byFile) {
  let t = fs.readFileSync(file, 'latin1');
  const before = t.length;
  let fileFailures = 0;
  for (const site of fileSites) {
    const re = new RegExp(esc(site.old).replace(/\n/g, '\\r?\\n'));
    const count = t.split(re).length - 1;
    if (count !== 1) {
      console.error(`FAIL (count=${count}): ${file} :: ${JSON.stringify(site.old.slice(0, 60))}`);
      failures++;
      fileFailures++;
    }
  }
  if (fileFailures > 0) continue;
  for (const site of fileSites) {
    const re = new RegExp(esc(site.old).replace(/\n/g, '\\r?\\n'));
    const m = re.exec(t);
    const rep = site.new.replace(/\n/g, m[0].includes('\r\n') ? '\r\n' : '\n');
    t = t.replace(re, () => rep);
  }
  fs.writeFileSync(file, t, 'latin1');
  console.log(`${file}: ${fileSites.length} sites, bytes ${before}->${t.length}`);
}
if (failures > 0) process.exit(1);
console.log(`batch K applied: ${sites.length} sites across ${byFile.size} files`);
