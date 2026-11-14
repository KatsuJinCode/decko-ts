// smell-row-r5b-captures.ts - the shared reader for this lane's row captures.
//
// Every row this lane took ran ITS OWN instrument once, on this lane's tree,
// and the capture under fixtures/captured/smell-row-r5b-2026-10-24/ is that
// run's own record: the exact command, the exact observed output, and the
// mechanism the refusal came from. A row whose instrument could not be run
// at all carries the facts that made it unrunnable instead.
//
// This module reads those captures. It does not re-measure anything: a
// capture is a record of what the row's instrument saw, and the pins use it
// to hold that record rather than to restate it.
//
// This lane's reader is its own module, named for its own round directory,
// so that a lane working a different slice of the same family never edits
// this file and the two branches merge without a conflict.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CAPTURE_DIR = path.join(REPO, "fixtures/captured/smell-row-r5b-2026-10-24");

export type Outcome = "ran" | "not-run";

export type Capture = {
  row: string;
  instrument: string;
  instrumentSha256: string;
  at: string;
  command: string;
  outcome: Outcome;
  exit: number | null;
  /** The instrument's own words when it refused, verbatim. */
  refusal: string | null;
  /** The one-sentence mechanism the refusal came from. */
  mechanism: string;
  /** The row's own verdict on this lane's evidence. */
  verdict: "closed" | "open";
  scope: string;
  detail: Record<string, unknown>;
};

export function capture(row: string): Capture {
  const value = JSON.parse(readFileSync(path.join(CAPTURE_DIR, `${row}.json`), "utf8")) as Capture;
  if (value.row !== row) throw new Error(`capture is for ${value.row}, not ${row}`);
  return value;
}

/** The port's own source, re-read from the tree. The receipts name lines in
 *  these files; a port that moved them fails the pin. */
export function portSource(relativePath: string): string {
  return readFileSync(path.join(REPO, relativePath), "utf8");
}

/** The line a source file's own text puts at a one-based line number. */
export function sourceLine(relativePath: string, line: number): string {
  const lines = portSource(relativePath).split(/\r?\n/);
  const text = lines[line - 1];
  if (text === undefined) throw new Error(`${relativePath} has no line ${line}`);
  return text;
}
