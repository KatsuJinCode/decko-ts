#!/usr/bin/env node
// Distils the follow-operations row's two evidence sets into one capture per
// leg, so the row's question can be answered by COMPARING two captures
// instead of by reading two directories of journey evidence.
//
//   node tools/smell-row-r4/distill-follow-operations.mjs <ts-evidence-dir> \
//     <ruby-evidence-dir> <ts-grader-report.json> <ruby-grader-report.json> \
//     <out-dir>
//
// The evidence sets are the journey runner's own output (run-journeys.mjs,
// one set per engine) and the grader's own report (evaluate-follow-operations.mjs).
// Nothing is re-measured here: the capture is a record of what those two
// instruments saw, and every field here is copied from them.
//
// What the capture carries per journey:
//   - completed: the journey runner's own outcome
//   - updateRequests: every /update/ request the browser made, path and status
//   - finalObservation: the journey's last observation, label and text
//   - mailUnfollowUrl: the unfollow URL the notification mail carried, with the
//     origin removed, because the two legs run on different ports
//   - mailFollowedLabel: what the mail said the follower was following
// and per leg:
//   - grader: the grader's verdict, the per-journey pass flags and its problems

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const JOURNEYS = [
  "follow-admin-operation-persistence",
  "unfollow-member-operation-persistence",
  "unfollow-mail-operation-persistence",
];

const [tsDir, rubyDir, tsReport, rubyReport, outDir] = process.argv.slice(2);
if (!tsDir || !rubyDir || !tsReport || !rubyReport || !outDir) {
  console.error(
    "usage: distill-follow-operations.mjs <ts-evidence-dir> <ruby-evidence-dir> <ts-grader.json> <ruby-grader.json> <out-dir>",
  );
  process.exit(2);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** The mail body's unfollow URL, with the origin removed so that two legs
 *  booted on different ports can be compared. */
function mailUnfollowUrl(mail) {
  const body = mail?.text ?? "";
  const match = /\b(https?:\/\/[^\s"'<>)]*\/update\/[^\s"'<>)]+)/.exec(body);
  if (!match) return null;
  return match[1].replace(/^https?:\/\/[^/]+/, "");
}

/** What the mail said the recipient was following. */
function mailFollowedLabel(mail) {
  const body = mail?.text ?? "";
  const match = /because you're following "([^"]*)"/.exec(body);
  return match ? match[1] : null;
}

function journeyFacts(dir, id) {
  const evidence = readJson(path.join(dir, `${id}.json`));
  const updateRequests = (evidence.networkRequests ?? [])
    .filter((request) => request.origin === "local")
    .filter((request) => String(request.method ?? "GET").toUpperCase() === "GET")
    .filter((request) => String(request.path ?? "").includes("/update/"))
    .map((request) => ({
      method: "GET",
      path: String(request.path),
      status: request.status,
    }));
  const observations = evidence.observations ?? [];
  const last = observations[observations.length - 1];
  const mail = (evidence.mail ?? [])[0] ?? null;
  return {
    id,
    completed: evidence.completed === true,
    updateRequests,
    finalObservation: last ? { label: last.label, text: last.mainText ?? "" } : null,
    mailUnfollowUrl: mailUnfollowUrl(mail),
    mailFollowedLabel: mailFollowedLabel(mail),
  };
}

function graderFacts(report) {
  return {
    verdict: report.verdict,
    passed: report.perJourney.filter((journey) => journey.pass).length,
    total: report.perJourney.length,
    perJourney: report.perJourney.map((journey) => ({ id: journey.id, pass: journey.pass === true })),
    problems: [...new Set(report.problems ?? [])],
  };
}

function capture(leg, evidenceDir, graderReport) {
  return {
    row: "evaluate-follow-operations",
    leg,
    journeys: JOURNEYS.map((id) => journeyFacts(evidenceDir, id)),
    grader: graderFacts(readJson(graderReport)),
  };
}

mkdirSync(path.resolve(outDir), { recursive: true });
const ts = capture("ts", tsDir, tsReport);
const ruby = capture("ruby33", rubyDir, rubyReport);
writeFileSync(path.join(path.resolve(outDir), "evaluate-follow-operations-ts.json"), `${JSON.stringify(ts, null, 2)}\n`);
writeFileSync(path.join(path.resolve(outDir), "evaluate-follow-operations-ruby33.json"), `${JSON.stringify(ruby, null, 2)}\n`);
console.log(
  `ts: grader ${ts.grader.verdict} ${ts.grader.passed}/${ts.grader.total}; ruby33: grader ${ruby.grader.verdict} ${ruby.grader.passed}/${ruby.grader.total}`,
);
