#!/usr/bin/env node
// Distils the remote-widget compare-and-swap row's evidence tree into one
// capture, so the row's question can be answered by COMPARING the plan's
// admission against the receipt of the executed write, instead of by reading
// four files in another repository.
//
//   node tools/smell-row-r4/distill-remote-widget-cas.mjs <evidence-tree-dir> <out-file>
//
// The evidence tree is the instrument's own directory:
//   plan.json          the authorized plan, its admission tuple and its statement
//   before.json        the custody image the statement admits against
//   apply-intent.json  the intent the instrument wrote with the exclusive-create flag
//   apply-receipt.json  the receipt of the write that already executed
//
// Nothing is re-measured here. Every field is copied from those files.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [treeDir, outFile, refusalFile] = process.argv.slice(2);
if (!treeDir || !outFile) {
  console.error("usage: distill-remote-widget-cas.mjs <evidence-tree-dir> <out-file> [refusal-output]");
  process.exit(2);
}

const readJson = (name) => JSON.parse(readFileSync(path.join(treeDir, name), "utf8"));
const plan = readJson("plan.json");
const receipt = readJson("apply-receipt.json");
const intent = readJson("apply-intent.json");
const before = readJson("before.json");

// The statement admits on the version it was authorized against and on the
// twelve rows still carrying their before content. The version argument is
// the last argument of the statement.
const args = plan.apply?.args ?? [];
const versionArg = args[args.length - 1];

const capture = {
  row: "apply-remote-widget-cas",
  instrument: "recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs",
  plan: {
    at: plan.at,
    scope: plan.scope,
    versionBefore: plan.versionBefore,
    expectedVersionAfter: plan.expectedVersionAfter,
    admission: plan.remoteReadOnlyAdmission ?? null,
    statementVersionArgument: versionArg,
    statementGuardsOnVersion: /version = \?/.test(plan.apply?.sql ?? ""),
    statementGuardsOnContent: /matches = 12/.test(plan.apply?.sql ?? ""),
  },
  custodyImage: {
    cards: before.cards?.length ?? null,
    beforeSha256: plan.beforeSha256,
  },
  executedWrite: {
    at: receipt.at,
    pass: receipt.pass,
    returnedWriteRows: receipt.returnedWriteRows,
    reportedAffectedRows: receipt.reportedAffectedRows,
    allTwelveAfterMatch: receipt.allTwelveAfterMatch,
    otherFieldsUnchanged: receipt.otherFieldsUnchanged,
    monotonicVersionMatches: receipt.monotonicVersionMatches,
    casRefused: receipt.casRefused,
    contentWritten: receipt.contentWritten,
    versionBefore: receipt.versionBefore,
    versionsAfter: receipt.versionsAfter ?? [],
  },
  oneShot: {
    intentFile: "apply-intent.json",
    intentFileExists: existsSync(path.join(treeDir, "apply-intent.json")),
    intentWrittenAt: intent.at ?? null,
    intentDatabaseUrlSha256: intent.databaseUrlSha256 ?? null,
  },
  credential: {
    path: "C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env",
    presentOnThisMachine: existsSync(
      "C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env",
    ),
    refusal: refusalFile && existsSync(refusalFile) ? readFileSync(refusalFile, "utf8").trim() : null,
  },
};

writeFileSync(path.resolve(outFile), `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `plan version ${capture.plan.versionBefore} -> expected ${capture.plan.expectedVersionAfter}; ` +
    `executed pass=${capture.executedWrite.pass} version after ${JSON.stringify(capture.executedWrite.versionsAfter)}; ` +
    `credential present: ${capture.credential.presentOnThisMachine}`,
);
