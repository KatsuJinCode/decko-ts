// smell-row-r5-captures.ts - the shared reader for this round's row captures.
//
// Every row this lane took ran its own instrument once, against the thing the
// row is about: a live hosted edge, a live account API, a deck on disk, or a
// tree of build outputs. None of the six instruments names an engine
// manifest, so the two-leg rig cannot drive them (the capture
// rig-applicability.json in this directory records what the rig said about
// each of them).
//
// So each row's capture here is that row's own instrument's own output, and a
// row's question is answered by READING that capture, not by comparing two
// legs of it.
//
// This module reads those captures. It does not re-measure anything: a
// capture is a record of what the row's instrument saw, and the pins use it
// to hold a row's measured state.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CAPTURE_DIR = path.join(REPO, "fixtures/captured/smell-row-r5-2026-10-24");

/** One row's capture: the row's own instrument's own output. */
export function capture<T = unknown>(row: string): T {
  const value = JSON.parse(readFileSync(path.join(CAPTURE_DIR, `${row}.json`), "utf8")) as T;
  return value;
}

/** The round's capture of what the two-leg rig said about each instrument. */
export function rigApplicability(): {
  rig: string;
  rigContract: string;
  answers: { instrument: string; rigRefused: boolean; rigSaid: string; drivableByTheRig: boolean }[];
  instrumentsOffered: number;
  instrumentsTheRigCanDrive: number;
} {
  return capture("rig-applicability");
}

/** The port's own source, re-read from the tree. The receipts name lines in
 *  these files; a port that moved them fails the pin. */
export function portSource(relativePath: string): string {
  return readFileSync(path.join(REPO, relativePath), "utf8");
}
