// Batch edit applier for lane-jargon-tranche3 (tests/ jargon scrub).
// Reads tmp-batch-edits.json: [{ file, old, new }, ...] where `old` must
// occur EXACTLY ONCE in the file (checked) — any mismatch aborts the whole
// batch with a loud error before a byte is written. Comments-only is
// enforced per batch by lane-proof-comments-only-snapshot-base.cjs.
const fs = require("fs");
const path = require("path");
const REPO = "C:/localProjects/decko-ts-lane-jargon4";
const edits = JSON.parse(fs.readFileSync(path.join(REPO, "tmp-batch-edits.json"), "utf8"));

const byFile = new Map();
for (const e of edits) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}
for (const [file, list] of byFile) {
  const p = path.join(REPO, file);
  let text = fs.readFileSync(p, "utf8");
  for (const e of list) {
    const want = e.count ?? 1;
    const n = text.split(e.old).length - 1;
    if (n !== want) {
      console.error(`ABORT: ${file}: expected exactly ${want} occurrence(s), found ${n}:\n  old: ${JSON.stringify(e.old)}`);
      process.exit(1);
    }
  }
  for (const e of list) text = text.split(e.old).join(e.new);
  fs.writeFileSync(p, text);
  console.log(`OK ${file} (${list.length} edit${list.length === 1 ? "" : "s"})`);
}
console.log(`BATCH APPLIED: ${edits.length} edits across ${byFile.size} files`);
