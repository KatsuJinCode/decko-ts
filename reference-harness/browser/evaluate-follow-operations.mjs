#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadJourneyResults } from "./lib/journey-evidence-validation.mjs";
import { sha256, treeDigest } from "./lib/journey-provenance.mjs";
import { evaluateFollowOperations } from "./lib/follow-operation-contracts.mjs";
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
for (const key of ["actual", "fixture", "journeys", "policy", "engine", "candidate", "report"]) if (!args[key]) throw new Error(`--${key} required`);
const bytes = name => readFileSync(name), json = name => JSON.parse(bytes(name));
const defaultPath = args.contracts ?? new URL("./journeys/product-contracts.json", import.meta.url);
const hashes = { fixtureSha256: treeDigest(path.resolve(args.fixture)), journeysSha256: sha256(bytes(args.journeys)), contractsSha256: sha256(bytes(defaultPath)), engineSha256: sha256(bytes(args.engine)) };
const loaded = loadJourneyResults(args.actual);
let meta;
try { meta = json(path.join(args.actual, "run-meta.json")); } catch { /* fail closed in evaluator */ }
const report = evaluateFollowOperations({ results: loaded.results, loadProblems: loaded.problems, definitions: json(args.journeys).journeys, policy: json(args.policy), defaultPolicy: json(defaultPath), candidate: args.candidate, hashes, meta });
report.integrity = { ...hashes, operationPolicySha256: sha256(bytes(args.policy)), evaluatorSha256: sha256(bytes(new URL(import.meta.url))), operationEvaluatorSha256: sha256(bytes(new URL("./lib/follow-operation-contracts.mjs", import.meta.url))) };
report.rawEvidence = Object.fromEntries([...Object.keys(loaded.results).map(id => `${id}.json`), "run-meta.json"].map(file => [file, sha256(bytes(path.join(args.actual, file)))]));
writeFileSync(args.report, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(`${report.verdict}: ${report.perJourney.filter(j => j.pass).length}/${report.perJourney.length} positive follow operations`);
for (const problem of report.problems) console.error(problem);
if (report.verdict !== "pass") process.exitCode = 1;
