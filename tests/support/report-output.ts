// Where a test writes the measurement report it produces.
//
// A test run must leave the checkout as it found it, so by default a report
// goes to a run directory outside the repository, under the same relative
// path as its committed copy:
//
//   <DECKO_TEST_REPORT_DIR or <os tmpdir>/decko-test-reports>/<committed path>
//
// The committed copies (benchmarks/...) are refreshed only on purpose, by
// running the suite with DECKO_TEST_REPORT_DIR set to the repository root.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The directory reports are written under: DECKO_TEST_REPORT_DIR (relative
 *  paths resolve against the repository root), else a directory in the
 *  operating system's temporary directory. */
export function testReportRoot(): string {
  const configured = process.env.DECKO_TEST_REPORT_DIR;
  if (configured !== undefined && configured !== "") return resolve(REPO_ROOT, configured);
  return join(tmpdir(), "decko-test-reports");
}

/** The path a report whose committed copy lives at `committedPath`
 *  (relative to the repository root) is written to in this run. Its
 *  directory exists on return. */
export function testReportPath(committedPath: string): string {
  const path = join(testReportRoot(), committedPath);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
