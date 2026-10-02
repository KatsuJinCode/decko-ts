// Batch J (attempt 3): small files set A — view-perms 318; bootstrap-code-
// files 38/48/83/96; java-script 4; errors 167; format-families 45;
// head-views 99/124. Per-file grouping: a file is written only when ALL of
// its sites matched exactly once; any failure exits 1 with nothing committed
// conceptually (unwritten files untouched on disk).
import fs from 'node:fs';

const sites = [
  {
    file: 'src/card/permissions/view-perms.ts',
    old: "the html shape (every pre-email lane's\n   *  callers). */",
    new: 'the html shape (every caller\n   *  outside the email-text format). */',
  },
  {
    file: 'src/card/render/bootstrap-code-files.ts',
    old: '// 2026-10-01 (deploy-miniflare lane): the Node reads reach fs through a',
    new: '// 2026-10-01: the Node reads reach fs through a',
  },
  {
    file: 'src/card/render/bootstrap-code-files.ts',
    old: '// assertion. The lazy directory move below (2026-10-02, cf-worker lane)',
    new: '// assertion. The lazy directory move below (2026-10-02)',
  },
  {
    file: 'src/card/render/bootstrap-code-files.ts',
    old: '// 2026-10-02 (cf-worker-write-path lane): this used to be a module-scope',
    new: '// 2026-10-02: this used to be a module-scope',
  },
  {
    file: 'src/card/render/bootstrap-code-files.ts',
    old: '// at the base commit this lane branched from, and the deploy/worker.ts graph',
    new: '// at the base commit, and the deploy/worker.ts graph',
  },
  {
    file: 'src/card/render/code-highlighting/scanners/java-script.ts',
    old: '// full, 2026-10-01, lane-autolink). The scanner is the delegate',
    new: '// full, 2026-10-01). The scanner is the delegate',
  },
  {
    file: 'src/card/render/errors.ts',
    old: 'Dashed-numeric expansion (raise-leadview lane, 2026-09-29; every claim',
    new: 'Dashed-numeric expansion (2026-09-29; every claim',
  },
  {
    file: 'src/card/render/format-families.ts',
    old: 'search card in these formats on this lane); executeSearch\'s',
    new: "search card in these formats); executeSearch's",
  },
  {
    file: 'src/card/render/head-views.ts',
    old: '// The *recent settings card (lane catrecent-reversal, 2026-10-01):',
    new: '// The *recent settings card (2026-10-01):',
  },
  {
    file: 'src/card/render/head-views.ts',
    old: '// (stable-key-audit lane, 2026-10-01, gem-run + SQL-probe verified.)',
    new: '// (2026-10-01, gem-run + SQL-probe verified.)',
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
  if (fileFailures > 0) continue; // leave this file untouched
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
console.log(`batch J applied: ${sites.length} sites across ${byFile.size} files`);
