import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Row: smell-check-chain-join-plan.
//
// tools/perf/check-chain-join-plan.mjs runs a bounded local differential: it
// takes the previously captured junction-chain SQL plus its parameter array,
// rewrites every non-CROSS `JOIN cards pN ON` into `CROSS JOIN cards pN ON`, and
// measures both forms with and without ANALYZE, requiring the result rows to be
// byte-identical.
//
// The row is NOT-RUNNABLE and cannot be made runnable by an agent. The capture
// on disk carries SQL with no trailing JSON parameter array, so the tool stops
// at its own guard, and the approved 21670-card deck it demands is gone. The
// parameters are not reconstructible and fabricating them would be evidence
// fraud, so the measured run is not repeated here.
//
// What survives is the tool's own report, committed at
// docs/junction-chain-join-evidence.json. A differential nobody can re-run is
// exactly where a record has to carry its own proof, so this file asserts that
// report against itself: the custody chain it claims, the equivalence it claims,
// the shape it claims, and the two artifacts whose absence is why the row is
// blocked. It does not re-measure anything, and the timings below are asserted
// as properties of the committed record, not as a fresh benchmark.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const evidence = JSON.parse(
  readFileSync(path.join(repo, "docs", "junction-chain-join-evidence.json"), "utf8"),
) as {
  local_query: {
    complete: boolean;
    cards: number;
    parameter_count: number;
    source_sha256: string;
    copied_sha256: string;
    source_sha256_after: string;
    measurements: {
      stats: boolean;
      kind: string;
      ms: number;
      rows: number;
      identical_bytes: boolean;
      byte_length: number;
      rows_sha256: string;
    }[];
  };
};

const report = evidence.local_query;

describe("the committed chain-join CROSS JOIN differential holds together", () => {
  it("records a complete run whose deck copy is the deck it measured", () => {
    expect(report.complete).toBe(true);
    // The tool copies the deck before opening it and re-hashes after measuring;
    // all three agreeing is the custody claim the tool makes about the source.
    expect(report.copied_sha256).toBe(report.source_sha256);
    expect(report.source_sha256_after).toBe(report.source_sha256);
  });

  it("records the two artifacts that can no longer be produced", () => {
    // 21670 is the approved deck the tool refuses to substitute for, and 60 is
    // the parameter array the surviving capture does not carry. These two
    // numbers are the whole of what is missing, so they are pinned here where
    // losing them would otherwise be invisible.
    expect(report.cards).toBe(21670);
    expect(report.parameter_count).toBe(60);
    expect(report.parameter_count).toBeGreaterThan(0);
  });

  it("measured both forms with and without ANALYZE, and every row set was identical", () => {
    expect(report.measurements).toHaveLength(4);
    const shape = report.measurements.map((m) => `${m.stats}:${m.kind}`).sort();
    expect(shape).toEqual(["false:fixed", "false:original", "true:fixed", "true:original"]);
    // identical_bytes is the equivalence claim: the rewrite must not change a
    // single returned byte. One differing hash would be the finding.
    for (const measurement of report.measurements) {
      expect(measurement.identical_bytes).toBe(true);
      expect(measurement.rows).toBe(1);
      expect(measurement.byte_length).toBeGreaterThan(0);
    }
    const hashes = new Set(report.measurements.map((m) => m.rows_sha256));
    expect(hashes.size).toBe(1);
  });

  it("credits the speedup to the rewrite and not to ANALYZE", () => {
    // This is the finding the row exists to hold: without statistics the join
    // form costs about a thousand times the crossed form, and ANALYZE removes
    // almost all of the difference on its own. Asserted as a floor against the
    // committed numbers - a weaker claim than equality, so a re-recorded report
    // on faster or slower hardware does not turn this red for the wrong reason.
    const at = (stats: boolean, kind: string) =>
      report.measurements.find((m) => m.stats === stats && m.kind === kind)!.ms;
    expect(at(false, "original") / at(false, "fixed")).toBeGreaterThan(10);
    // With statistics the two forms are close, which is what makes ANALYZE the
    // real explanation and not the rewrite.
    expect(at(true, "original") / at(true, "fixed")).toBeLessThan(10);
  });
});

describe("check-chain-join-plan refuses a capture its rewrite cannot change", () => {
  const script = path.join(repo, "tools", "perf", "check-chain-join-plan.mjs");
  const body =
    "SELECT DISTINCT c1.id FROM __src s JOIN cards c1 ON c1.id = s.id JOIN cards p0 ON p0.id = c1.id;";

  function captureFor(sql: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chain-join-capture-"));
    try {
      const file = path.join(dir, "capture.sql");
      writeFileSync(file, sql);
      return file;
    } finally {
      // The file is read by the child, so it has to outlive this function.
      // Directories under the OS temp root are removed by the test's own
      // teardown instead; this keeps the path alive for the child process.
      setTimeout(() => rmSync(dir, { recursive: true, force: true }), 30000).unref();
    }
  }

  it("rejects a capture that already uses CROSS JOIN on the alias the rewrite targets", () => {
    // The old guard tested `/JOIN cards p0 ON/`, which matches inside
    // `CROSS JOIN cards p0 ON`. Such a capture passed validation, left the
    // rewrite a no-op, and produced a report comparing one query with itself -
    // with identical_bytes true, indistinguishable from a real equivalence.
    const crossed = captureFor(
      `${body.replace("JOIN cards c1 ON", "CROSS JOIN cards c1 ON").replace("JOIN cards p0 ON", "CROSS JOIN cards p0 ON")}\n[1]\n`,
    );
    let stderr = "";
    let status: number | null = null;
    try {
      execFileSync(process.execPath, [script, "unused-deck", crossed, "unused-report.json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      });
      status = 0;
    } catch (error) {
      const failure = error as { status?: number | null; stderr?: string };
      status = failure.status ?? null;
      stderr = failure.stderr ?? "";
    }
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/no join for the CROSS JOIN rewrite to change/);
  });

  it("rejects a capture with no parameter array, which is the surviving capture's shape", () => {
    const sqlOnly = captureFor(`${body}\n`);
    let stderr = "";
    let status: number | null = null;
    try {
      execFileSync(process.execPath, [script, "unused-deck", sqlOnly, "unused-report.json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      });
      status = 0;
    } catch (error) {
      const failure = error as { status?: number | null; stderr?: string };
      status = failure.status ?? null;
      stderr = failure.stderr ?? "";
    }
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/capture needs SQL followed by a JSON parameter array/);
  });
});
