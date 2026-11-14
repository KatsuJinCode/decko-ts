// smell-write-final-a253-manifest-parity.test.ts - the row
// smell-write-final-a253-manifest.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs)
// writes the final a253 manifest, and it refuses with "Exact final
// source/artifact/data custody mismatch" when any of its six custody clauses
// fails.
//
// The capture under fixtures/captured/smell-row-r6-2026-10-25/ is this lane's
// own measurement of those six clauses, followed by the row's own instrument
// run twice: once in the instrument's own directory, and once over a copy of
// the evidence tree whose baseline clause is satisfied by the hash-verified
// pre-apply backup of the deck.
//
// WHAT IT ASSERTS:
//
//   - the pinned checkout is at the exact source commit and is clean.
//
//   - the pinned bundle, rebuilt byte-exact at that source, hashes to the
//     capture's bundle hash.
//
//   - the restored deck hashes to the receipt's target hash.
//
//   - the one clause that does not hold on the machine as it stands is the
//     baseline clause, because the deck at the receipt's recorded baseline
//     path has moved on since the a253 era; the hash-verified pre-apply backup
//     of that deck still carries the hash the receipt records.
//
//   - the instrument, run in place, refuses with its own message and writes
//     nothing: the manifest of record is byte-identical before and after.
//
//   - the instrument, run over the copy, exits zero and writes the manifest,
//     and that manifest is identical to the manifest of record apart from the
//     moments the manifest and the three re-issued receipts inside it carry.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r6-captures.js";

type Clause = {
  name: string;
  holds: boolean;
  detail: Record<string, unknown> & {
    present?: boolean;
    sha256?: string | null;
    expected?: string | null;
    head?: string | null;
    statusPorcelain?: string | null;
    preApplyBackupSha256?: string | null;
    preApplyBackupCarriesTheRecordedHash?: boolean;
  };
};

type Capture = {
  row: string;
  instrument: string;
  instrumentSha256: string;
  measuredAt: string;
  source: string;
  pinnedBundle: {
    path: string;
    sha256: string | null;
    expected: string;
    rebuiltAt: string;
    buildCommand: string;
    pinnedBuildLog: { file: string; sha256: string; text: string } | null;
    qualificationBuildLog: { file: string; sha256: string; text: string } | null;
    qualificationPath: string;
    qualificationSha256: string | null;
  };
  clauses: Clause[];
  clausesHolding: number;
  clausesTotal: number;
  clausesFailing: string[];
  runInPlace: {
    command: string;
    cwd: string;
    exitCode: number;
    refusal: string | null;
    stdout: string;
    wroteManifest: boolean;
    manifestOfRecordSha256Before: string;
    manifestOfRecordSha256After: string;
  };
  runOverACopy: {
    command: string;
    cwd: string;
    exitCode: number;
    refusal: string | null;
    stdout: string;
    wroteManifest: boolean;
    copiedFiles: { file: string; sha256: string }[];
    receipt: { path: string; baselineFieldChangedTo: string; everyOtherFieldIsTheRecordsOwn: boolean };
    manifestOfRecord: { path: string; at: string; sha256: string };
    manifestWritten: { path: string; at: string; sha256: string };
    fieldsDifferingFromTheManifestOfRecord: string[];
    fieldsDifferingApartFromTheMomentsTheyCarry: string[];
    identicalApartFromTheMomentsTheyCarry: boolean;
  };
};

const captureValue = capture<Capture>("write-final-a253-manifest");

const clauseNamed = (name: string): Clause => {
  const found = captureValue.clauses.find((clause) => clause.name === name);
  expect(found, `clause ${name} missing from the capture`).toBeDefined();
  return found!;
};

describe("smell-write-final-a253-manifest: the custody holds, and the manifest is reproducible", () => {
  it("the capture names the source commit the manifest is about", () => {
    expect(captureValue.row).toBe("write-final-a253-manifest");
    expect(captureValue.instrumentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.source).toBe("a25329a805202bf4ee5879f084fd028c90058215");
    expect(captureValue.clauses).toHaveLength(6);
  });

  it("the pinned checkout is at the exact source commit and is clean", () => {
    const head = clauseNamed("the checkout's HEAD is the exact source commit");
    expect(head.holds).toBe(true);
    expect(head.detail.head).toBe(captureValue.source);

    const clean = clauseNamed("the checkout is clean");
    expect(clean.holds).toBe(true);
    expect(clean.detail.statusPorcelain).toBe("");
  });

  it("the pinned bundle, rebuilt byte-exact at that source, hashes to the capture's bundle hash", () => {
    const bundle = clauseNamed("the pinned bundle hashes to the capture's bundle hash");
    expect(bundle.holds).toBe(true);
    expect(bundle.detail.sha256).toBe(bundle.detail.expected);
    expect(bundle.detail.sha256).toBe(
      "a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e",
    );
  });

  it("the restored deck hashes to the receipt's target hash", () => {
    const deck = clauseNamed("the restored deck hashes to the receipt's target hash");
    expect(deck.holds).toBe(true);
    expect(deck.detail.sha256).toBe(deck.detail.expected);
    expect(deck.detail.sha256).toBe(
      "c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc",
    );
  });

  it("the capture's terminal source is the same commit", () => {
    const terminal = clauseNamed("the capture's terminal source is the same commit");
    expect(terminal.holds).toBe(true);
    expect(terminal.detail.terminalSource).toBe(captureValue.source);
  });

  it("the one clause that does not hold is the baseline clause, and the hash-verified backup carries the recorded hash", () => {
    expect(captureValue.clausesHolding).toBe(5);
    expect(captureValue.clausesTotal).toBe(6);
    expect(captureValue.clausesFailing).toEqual([
      "the baseline deck hashes to the receipt's baseline hash",
    ]);

    const baseline = clauseNamed("the baseline deck hashes to the receipt's baseline hash");
    expect(baseline.holds).toBe(false);
    expect(baseline.detail.present).toBe(true);
    expect(baseline.detail.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(baseline.detail.sha256).not.toBe(baseline.detail.expected);
    expect(baseline.detail.preApplyBackupSha256).toBe(baseline.detail.expected);
    expect(baseline.detail.preApplyBackupCarriesTheRecordedHash).toBe(true);
  });

  it("the instrument, run in place, refuses with its own message and writes nothing", () => {
    expect(captureValue.runInPlace.exitCode).toBe(1);
    expect(captureValue.runInPlace.refusal).toBe("Error: Exact final source/artifact/data custody mismatch");
    expect(captureValue.runInPlace.wroteManifest).toBe(false);
    expect(captureValue.runInPlace.manifestOfRecordSha256After).toBe(
      captureValue.runInPlace.manifestOfRecordSha256Before,
    );
  });

  it("the instrument, run over the copy, writes the manifest and it reproduces the manifest of record", () => {
    expect(captureValue.runOverACopy.exitCode).toBe(0);
    expect(captureValue.runOverACopy.refusal).toBeNull();
    expect(captureValue.runOverACopy.wroteManifest).toBe(true);
    expect(captureValue.runOverACopy.stdout).toContain('"source":"a25329a805202bf4ee5879f084fd028c90058215"');
    expect(captureValue.runOverACopy.stdout).toContain('"pass":242');
  });

  it("the copy changed one field of the receipt, the baseline path, and nothing else", () => {
    expect(captureValue.runOverACopy.receipt.everyOtherFieldIsTheRecordsOwn).toBe(true);
    expect(captureValue.runOverACopy.receipt.baselineFieldChangedTo).toMatch(
      /deck\.sqlite3\.pre-widget-fallback-20261019$/,
    );
    for (const copied of captureValue.runOverACopy.copiedFiles) {
      expect(copied.sha256, copied.file).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("the manifest the copy's run wrote differs from the manifest of record only in the moments it carries", () => {
    expect(captureValue.runOverACopy.identicalApartFromTheMomentsTheyCarry).toBe(true);
    expect(captureValue.runOverACopy.fieldsDifferingApartFromTheMomentsTheyCarry).toEqual([]);
    expect(captureValue.runOverACopy.fieldsDifferingFromTheManifestOfRecord.sort()).toEqual(
      ["at", "bundle", "declaredAcceptance", "originalFailureWitnesses"].sort(),
    );
    expect(captureValue.runOverACopy.manifestOfRecord.at).not.toBe(
      captureValue.runOverACopy.manifestWritten.at,
    );
  });

  it("the pinned bundle was rebuilt twice at the pinned source, and both copies are byte-identical", () => {
    const bundle = captureValue.pinnedBundle;
    expect(bundle.rebuiltAt).toBe(captureValue.source);
    expect(bundle.buildCommand).toContain("tools/bundle-bunny-edge-engine.mjs");
    expect(bundle.sha256).toBe(bundle.expected);
    expect(bundle.qualificationSha256).toBe(bundle.sha256);
    expect(bundle.pinnedBuildLog?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.pinnedBuildLog?.text).toContain("bundle validated");
    expect(bundle.qualificationBuildLog?.text).toContain("bundle validated");
  });
});
