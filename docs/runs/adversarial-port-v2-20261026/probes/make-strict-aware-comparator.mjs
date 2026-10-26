// make-strict-aware-comparator.mjs - the constructed input for receipt 05.
//
// It copies the battery's comparator (tools/parity-side-effects/compare.mjs)
// and the two files it reads beside itself into a scratch folder, and applies
// ONE line change: the raw-body verdict stops exempting a step whose
// deliberate pin is marked strictErases when the strict-parity flags are on.
//
// The comparator's FIELD verdict already honours that rule
// (deliberateVerdict: "if (PARITY_STRICT && pin.strictErases === true)
// return null"), so in strict mode the erased difference is graded as a
// MISMATCH when it persists. The raw-body verdict did not, so a body that
// still differs by kilobytes is graded "declared" - the default mode's
// label - and the raw table reads clean.
//
//   node docs/runs/adversarial-port-v2-20261026/probes/make-strict-aware-comparator.mjs <out-dir>
//
// Then: PARITY_STRICT=1 node <out-dir>/compare.mjs <ruby.json> <ts.json> <report.json>

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const OUT = resolve(process.argv[2] ?? join(REPO, "tmp", "attack2-20261026", "strict-aware"));
const BATTERY = join(REPO, "tools", "parity-side-effects");

mkdirSync(OUT, { recursive: true });
for (const name of ["scenarios.json", "event-order-evidence.json"]) {
  copyFileSync(join(BATTERY, name), join(OUT, name));
}

const comparatorPath = join(BATTERY, "compare.mjs");
const source = readFileSync(comparatorPath, "utf8");
const from = "  if (deliberateOf[name] !== undefined) {";
const to =
  "  if (deliberateOf[name] !== undefined && !(PARITY_STRICT && deliberateOf[name].strictErases === true)) {";
if (!source.includes(from)) {
  throw new Error("the comparator's raw-body verdict no longer has the expected shape; the probe needs a new anchor line");
}
const patched = source.replace(from, to);
writeFileSync(join(OUT, "compare.mjs"), patched);
console.log(`strict-aware comparator written to ${OUT}`);
console.log("the only change: the raw-body verdict no longer exempts a strictErases pin in strict mode");
