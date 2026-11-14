// build-pageera-targets.mjs -- derive the PAGE-lane era target set from the
// R1 constants-arm measurement's own rows, cross-checked against head49's
// classification file. Nothing here is transcribed from a receipt.
//
// CLASSIFICATION AXIS (from R1's measured three-state boot, one boot,
// 146 targets; combined146-measurement.json rows):
//   lane === "page" AND CONSTANTS.verdict === "FAIL" AND FULL.verdict === "PASS"
//     -> the SERIALIZER-ERA class (the 11). The constants alone do not close
//        it; adding the era does. R1 freezes the era, so these are this
//        lane's targets.
//   CONSTANTS.verdict === "PASS"
//     -> the constants class (16), owned by the landed
//        GRADED_ARM_DEPLOYMENT_CONSTANTS arm. NOT this lane's targets.
//   both FAIL
//     -> the re-capture / Z class. NOT this lane's targets.
import { readFileSync, writeFileSync } from "node:fs";

const R1_MEASUREMENT =
  "C:/localProjects/decko-ts-lane-r1constants-2026-10-04/tmp/r1-constants/measure/combined146/measurement.json";
const HEAD49_CLASSIFICATION =
  "C:/localProjects/decko-ts-lane-head49-2026-10-04/tmp/lane-head49/head49-classification.json";

const m = JSON.parse(readFileSync(R1_MEASUREMENT, "utf8"));
const h = JSON.parse(readFileSync(HEAD49_CLASSIFICATION, "utf8"));
const head49ByName = new Map(Object.values(h).map((e) => [e.name, e]));

const page = m.rows.filter((r) => r.lane === "page");
const era = page.filter((r) => r.states.CONSTANTS.verdict === "FAIL" && r.states.FULL.verdict === "PASS");
const constants = page.filter((r) => r.states.CONSTANTS.verdict === "PASS");
const recapture = page.filter((r) => r.states.CONSTANTS.verdict === "FAIL" && r.states.FULL.verdict === "FAIL");

// R1's rows carry `tag` ("<name>:page"), head49 carries the bare `name`.
const bare = (r) => {
  if (typeof r.name === "string" && r.name !== "") return r.name;
  if (typeof r.tag === "string" && r.tag.endsWith(":page")) return r.tag.slice(0, -":page".length);
  throw new Error("row carries neither name nor a :page tag: " + JSON.stringify(r).slice(0, 200));
};

// Every derived page entry must be a head49 member, and the three classes must
// partition the 49 exactly. Assert both rather than assert them in prose.
for (const [label, set] of [["era", era], ["constants", constants], ["recapture", recapture]]) {
  const missing = set.filter((r) => !head49ByName.has(bare(r))).map(bare);
  if (missing.length > 0) {
    console.error(`REFUSE: ${label} entries absent from head49-classification: ${missing.join(" | ")}`);
    process.exit(2);
  }
}
if (era.length + constants.length + recapture.length !== page.length) {
  console.error(`REFUSE: classes do not partition the page set (${era.length}+${constants.length}+${recapture.length} != ${page.length})`);
  process.exit(2);
}

const fmt = (r) => `page\t${r.shard}\t${bare(r)}\tpage`;
writeFileSync("tmp/pageera/targets-era-11.txt", era.map(fmt).join("\n") + "\n");
writeFileSync("tmp/pageera/targets-constants-16.txt", constants.map(fmt).join("\n") + "\n");
writeFileSync("tmp/pageera/targets-recapture-22.txt", recapture.map(fmt).join("\n") + "\n");
writeFileSync("tmp/pageera/targets-page-49.txt", page.map(fmt).join("\n") + "\n");

const shards = new Set(era.map((r) => r.shard));
console.log(`CLASSES era=${era.length} constants=${constants.length} recapture=${recapture.length} total=${page.length}`);
console.log(`ERA-11 distinct page shards=${shards.size}: ${[...shards].sort().join(" ")}`);
for (const r of era) {
  const c = head49ByName.get(bare(r));
  console.log(
    `  era  ${bare(r)}:page  shard=${r.shard}  UNARMED delta=${r.states.UNARMED.delta} firstDiff=${r.states.UNARMED.firstDiffOffset}  ` +
      `CONSTANTS delta=${r.states.CONSTANTS.delta} firstDiff=${r.states.CONSTANTS.firstDiffOffset}  FULL=${r.states.FULL.verdict}  ` +
      `head49.probeB=${c.probeB} delta=${c.probeBDelta}`,
  );
}
