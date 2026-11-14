#!/usr/bin/env node
// Writes the restart-persistence verdict for one journey run (see
// lib/restart-persistence-verdict.mjs for the contract this grades).
//
//   node reference-harness/browser/verify-restart-persistence.mjs \
//     --run <run-journeys output dir> \
//     --journeys reference-harness/browser/journeys/acceptance-account-date.json \
//     --candidate <40-hex commit> \
//     --report <new .json path>
//
// --report is written exclusively (an existing file is never overwritten).
// Exit 0 when every restart journey passes the contract; exit 1 otherwise.

import { readFileSync, writeFileSync } from "node:fs";
import { gradeRestartPersistence } from "./lib/restart-persistence-verdict.mjs";
import { sha256 } from "./lib/journey-provenance.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
for (const key of ["run", "journeys", "candidate", "report"]) if (!args[key]) throw new Error(`--${key} required`);
if (!/^[a-f0-9]{40}$/.test(args.candidate)) throw new Error("--candidate must name the exact full source commit");

const report = gradeRestartPersistence({ run: args.run, journeysFile: args.journeys, candidate: args.candidate });
report.integrity.verifierSha256 = sha256(readFileSync(new URL("./lib/restart-persistence-verdict.mjs", import.meta.url)));
writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(`${report.verdict}: ${report.perJourney.filter((j) => j.pass).length}/${report.perJourney.length} restart-persistence journeys`);
for (const problem of report.problems) console.error(problem);
for (const journey of report.perJourney) for (const problem of journey.problems) console.error(`${journey.id}: ${problem}`);
if (report.verdict !== "pass") process.exitCode = 1;
