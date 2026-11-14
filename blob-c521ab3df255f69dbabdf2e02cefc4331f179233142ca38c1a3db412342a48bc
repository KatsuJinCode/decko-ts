#!/usr/bin/env node
// Distils the two-leg rig's own answers about this round's six instruments
// into one capture, so a reader can see which rows the rig can drive.
//
//   node tools/smell-row-r5/distill-rig-applicability.mjs <rig-output.txt> <out-file>
//
// The rig is tools/smell-act082-legs/run-leg.mjs. It drives a probe by
// rewriting two lines in it: the engine manifest it names and the output
// directory it writes. A probe it cannot drive is refused, with the reason.
//
// This capture records what the rig said about each of the six instruments
// this lane took. Nothing is re-measured here.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [rigPath, outFile] = process.argv.slice(2);
if (!rigPath || !outFile) {
  console.error("usage: distill-rig-applicability.mjs <rig-output.txt> <out-file>");
  process.exit(2);
}

const text = readFileSync(rigPath, "utf8");
const answers = [];
for (const block of text.split(/^=== /m).slice(1)) {
  const lines = block.trim().split("\n");
  const instrument = lines[0].trim().replace(/ =+$/, "");
  const said = lines.slice(1).join(" ").trim();
  answers.push({
    instrument,
    rigRefused: said.startsWith("probe does not name an engine manifest"),
    rigSaid: said,
    drivableByTheRig: !said.startsWith("probe does not name an engine manifest"),
  });
}

const capture = {
  rig: "tools/smell-act082-legs/run-leg.mjs",
  rigOutput: path.basename(rigPath),
  rigContract:
    "the rig rewrites two lines in a probe, the engine manifest it names and the output directory it writes, so a probe it can drive is a reference-harness browser probe",
  answers,
  instrumentsOffered: answers.length,
  instrumentsTheRigCanDrive: answers.filter((entry) => entry.drivableByTheRig).length,
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `instruments offered ${capture.instrumentsOffered}, drivable ${capture.instrumentsTheRigCanDrive}`,
);
