// working-rows-g-2026-10-25-captures.ts - the shared reader for this batch's
// row captures, named for this batch's capture directory, so a lane working
// another slice never edits it.
//
// This module reads those captures. It does not re-measure anything: a
// capture is a record of what the row's instrument saw, and the pins use it
// to compare rather than to restate.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CAPTURE_DIR = path.join(REPO, "fixtures/captured/working-rows-g-2026-10-25");

/** One measurement the chain-join differential recorded. */
export type ChainJoinMeasurement = {
  stats: boolean;
  kind: string;
  ms: number;
  rows: number;
  selectedCards: number;
  byteLength: number;
  rowsSha256: string;
  identicalBytes: boolean;
  rowsSetSha256: string;
  identicalSet: boolean;
};

/** The capture of the completed chain-join differential run. */
export type ChainJoinCapture = {
  row: string;
  instrument: string;
  passCondition: string;
  tool: {
    complete: boolean;
    cards: number;
    parameterCount: number;
    sqlite: string;
    schemaIndexesApplied: number;
    schemaIndexesSha256: string;
    sourceSha256: string;
    copiedSha256: string;
    measurements: ChainJoinMeasurement[];
  };
  deck: {
    source: string;
    sourceSha256: string;
    copySha256: string;
    rowsBefore: number;
    distinctIdsBefore: number;
    nullIdRowsDropped: number;
    rowsAfter: number;
    distinctIdsAfter: number;
  };
  capture: { file: string; sha256: string; boundKeys: number; note: string };
  priorRefusal: { round: string; capture: string; note: string };
};

/** A capture that has no second leg to compare against: the row's own
 *  instrument ran once and its own output is the whole answer. */
export function singleCapture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(CAPTURE_DIR, `${name}.json`), "utf8")) as T;
}

/** The port's own source, re-read from the tree. The receipts name lines in
 *  these files; a port that moved them fails the pin. */
export function portSource(relativePath: string): string {
  return readFileSync(path.join(REPO, relativePath), "utf8");
}
