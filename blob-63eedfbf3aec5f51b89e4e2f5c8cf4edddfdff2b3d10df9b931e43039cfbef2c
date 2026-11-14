// compare-renders.mjs -- compare the rendered result of each revert step.
//
//   node tools/persistence/compare-renders.mjs <rubyStepsDir> <tsStateJson>
//
// Both probe halves record, for every revert step, the reverted card's name,
// trash flag, type name and its core view rendered fresh from the database
// after the revert. Compared byte for byte, nothing normalised. Prints one
// line per step and a JSON summary; exit 0 when every rendered result
// matches, 1 otherwise, 2 on a missing input.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const [rubyDir, tsFile] = process.argv.slice(2);
if (!rubyDir || !tsFile || !existsSync(rubyDir) || !existsSync(tsFile)) {
  console.error("usage: compare-renders.mjs <rubyStepsDir> <tsStateJson> (both must exist)");
  process.exit(2);
}
const ruby = new Map(
  readdirSync(rubyDir)
    .filter((f) => /^step-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(rubyDir, f), "utf8")))
    .map((s) => [Number(s.step), s]),
);
const ts = JSON.parse(readFileSync(tsFile, "utf8"));
const rows = [];
for (const step of ts) {
  const r = ruby.get(Number(step.step));
  if (step.render === undefined && r?.render === undefined) continue;
  const a = r?.render ?? null;
  const b = step.render ?? null;
  const fields = ["name", "trash", "type", "core", "error"];
  const differing = fields.filter((f) => JSON.stringify(a?.[f] ?? null) !== JSON.stringify(b?.[f] ?? null));
  rows.push({ step: step.step, label: step.label, same: differing.length === 0, differing, ruby: a, ts: b });
  console.error(`${String(step.step).padStart(2)} ${step.label.padEnd(48)} ${differing.length === 0 ? "same" : `DIFFERS: ${differing.join(",")}`}`);
}
const summary = { compared: rows.length, same: rows.filter((r) => r.same).length, rows };
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
process.exit(rows.length > 0 && summary.same === rows.length ? 0 : 1);
