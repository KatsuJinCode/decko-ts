// smell-act082-captures.ts - the shared reader for the ACT-082 rows'
// two-leg captures.
//
// The five ACT-082 rows in this family each ran their own browser probe
// against TWO engines: the port (reference-harness/browser/engines/ts.json)
// and the pinned Ruby oracle (reference-harness/browser/engines/ruby33.json).
// tools/smell-act082-legs/run-leg.mjs produced those captures by copying
// the probe with its one engine-manifest line rewritten, so the probe's own
// body ran UNCHANGED and the only difference between the two captures is
// the engine.
//
// This module reads those captures. It does not re-measure anything: a
// capture is a record of what the probe saw, and the row's own question is
// answered by comparing the two.
//
// The captures live under fixtures/captured/smell-act082-r3-2026-10-24/.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CAPTURE_DIR = path.join(REPO, "fixtures/captured/smell-act082-r3-2026-10-24");

export type Leg = "ts" | "ruby33";

export type Capture = {
  row: string;
  leg: Leg;
  captures: Record<string, unknown>;
};

export function capture(row: string, leg: Leg): Capture {
  const value = JSON.parse(readFileSync(path.join(CAPTURE_DIR, `${row}-${leg}.json`), "utf8")) as Capture;
  if (value.row !== row) throw new Error(`capture is for ${value.row}, not ${row}`);
  if (value.leg !== leg) throw new Error(`capture is for the ${value.leg} leg, not ${leg}`);
  return value;
}

/** The posted form body, decoded into its fields. The probes record the raw
 *  urlencoded body; this reads it the way a server does. */
export function postedFields(captureValue: Capture): Record<string, string> {
  const steps = captureValue.captures["steps.json"] as { posts?: { postData?: string }[] } | undefined;
  const posts = steps?.posts ?? [];
  if (posts.length === 0) throw new Error("the capture carries no posted body");
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(posts[0]!.postData ?? "")) fields[key] = value;
  return fields;
}

/** The form's own field set, as the probe recorded it in the DOM. */
export function formFieldNames(captureValue: Capture): string[] {
  const outcome = captureValue.captures["outcome.json"] as { ownership?: { formFields?: string[] } } | undefined;
  const names = outcome?.ownership?.formFields;
  if (names !== undefined) return names;
  return Object.keys(postedFields(captureValue));
}

/** The port's own source, re-read from the tree. The rows' receipts name
 *  lines in these files; a port that moved them fails the pin. */
export function portSource(relativePath: string): string {
  return readFileSync(path.join(REPO, relativePath), "utf8");
}
