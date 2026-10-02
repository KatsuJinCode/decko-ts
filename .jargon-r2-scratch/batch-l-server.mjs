// Batch L (attempt 3): server + types — file-routes 31; first-run-routes
// 23/42; write-routes 32/70; coffeescript d.ts 2. Per-file all-or-nothing
// writes, byte-safe anchors.
import fs from 'node:fs';

const sites = [
  {
    file: 'src/server/file-routes.ts',
    old: 'belongs to the write-routes\n// lane and is deliberately not claimed here.',
    new: 'belongs to\n// src/server/write-routes.ts and is deliberately not claimed here.',
  },
  {
    file: 'src/server/first-run-routes.ts',
    old: '//   card name or config is touched by this lane.',
    new: '//   card name or config is touched.',
  },
  {
    file: 'src/server/first-run-routes.ts',
    old: '//   that the write-path lane already corrected.',
    new: '//   that src/server/write-routes.ts already corrected.',
  },
  {
    file: 'src/server/write-routes.ts',
    old: "// Multipart uploads (the uploads2 lane): the edit form's file_chooser",
    new: "// Multipart uploads: the edit form's file_chooser",
  },
  {
    file: 'src/server/write-routes.ts',
    old: 'instead of the live app; the save-lane pins',
    new: 'instead of the live app; the save-path pins',
  },
  {
    file: 'src/types/coffeescript-npm-1-12-2.d.ts',
    old: "pinned at 1.12.2 (the\n// compile-engines lane's disclosed dependency add). The 1.12.2 package",
    new: 'pinned at 1.12.2.\n// The 1.12.2 package',
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
console.log(`batch L applied: ${sites.length} sites across ${byFile.size} files`);
