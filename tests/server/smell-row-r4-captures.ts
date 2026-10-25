// smell-row-r4-captures.ts - the shared reader for this round's row captures.
//
// Every row this lane took ran its own instrument against TWO engines: the
// port (reference-harness/browser/engines/ts.json) and the pinned Ruby oracle
// (reference-harness/browser/engines/ruby33.json). The two captures under
// fixtures/captured/smell-row-r4-2026-10-24/ are those legs' own output, and
// a row's question is answered by COMPARING them.
//
// This module reads those captures. It does not re-measure anything: a
// capture is a record of what the row's instrument saw, and the pins use it
// to compare rather than to restate.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CAPTURE_DIR = path.join(REPO, "fixtures/captured/smell-row-r4-2026-10-24");

export type Leg = "ts" | "ruby33";

export type JourneyFacts = {
  id: string;
  completed: boolean;
  updateRequests: { method: string; path: string; status: number }[];
  finalObservation: { label: string; text: string } | null;
  mailUnfollowUrl: string | null;
  mailFollowedLabel: string | null;
};

export type GraderFacts = {
  verdict: string;
  passed: number;
  total: number;
  perJourney: { id: string; pass: boolean }[];
  problems: string[];
};

export type Capture = {
  row: string;
  leg: Leg;
  journeys: JourneyFacts[];
  grader: GraderFacts;
};

export function capture(row: string, leg: Leg): Capture {
  const value = JSON.parse(readFileSync(path.join(CAPTURE_DIR, `${row}-${leg}.json`), "utf8")) as Capture;
  if (value.row !== row) throw new Error(`capture is for ${value.row}, not ${row}`);
  if (value.leg !== leg) throw new Error(`capture is for the ${value.leg} leg, not ${leg}`);
  return value;
}

/** One journey's facts inside a capture. */
export function journey(captureValue: Capture, id: string): JourneyFacts {
  const found = captureValue.journeys.find((journeyValue) => journeyValue.id === id);
  if (!found) throw new Error(`the capture carries no journey ${id}`);
  return found;
}

/** The port's own source, re-read from the tree. The receipts name lines in
 *  these files; a port that moved them fails the pin. */
export function portSource(relativePath: string): string {
  return readFileSync(path.join(REPO, relativePath), "utf8");
}
