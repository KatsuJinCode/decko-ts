// Repair the bash-mangled bisect remnants: drop the leftover BISECT2 const
// from format.ts and give the test's dump lines proper string concatenation.
import { readFileSync, writeFileSync } from "node:fs";

const fp = "C:/localProjects/decko-ts-lane-p22-rulestable/src/card/render/format.ts";
let ft = readFileSync(fp, "utf8");
const bisectStart = ft.indexOf("\n// BISECT2: the base-equivalent static membership");
if (bisectStart !== -1) {
  const close = ft.indexOf("]);", bisectStart);
  if (close === -1) throw new Error("bisect const close not found");
  ft = ft.slice(0, bisectStart) + ft.slice(close + 4);
  writeFileSync(fp, ft);
  console.log("format.ts bisect const removed");
} else {
  console.log("format.ts already clean");
}

const tp = "C:/localProjects/decko-ts-lane-p22-rulestable/tests/card/render/set-card-views-corpus-parity.test.ts";
let tt = readFileSync(tp, "utf8");
const brokenA = "          writeFileSync(, actualNorm);";
const brokenB = "          writeFileSync(, expectedNorm);";
if (tt.includes(brokenA) && tt.includes(brokenB)) {
  tt = tt.replace(
    brokenA,
    '          writeFileSync("tmp-p22-setcard-" + entry.id + "-" + view + ".actual.html", actualNorm);',
  );
  tt = tt.replace(
    brokenB,
    '          writeFileSync("tmp-p22-setcard-" + entry.id + "-" + view + ".expected.html", expectedNorm);',
  );
  writeFileSync(tp, tt);
  console.log("test dump lines repaired");
} else {
  console.log("test dump lines:", tt.includes(brokenA) ? "A present" : "A absent", tt.includes(brokenB) ? "B present" : "B absent");
}
