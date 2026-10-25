// smell-write-found-by-integration-manifest-parity.test.ts - the row
// smell-write-found-by-integration-manifest.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs)
// writes the found-by integration manifest, and it refuses before it writes
// anything when the qualified semantic, scoped and correctness evidence is not
// in place, or when the pinned bundle is not the one the scoped run measured.
//
// The capture under fixtures/captured/smell-row-r6-2026-10-25/ is the
// instrument's own receipt: the tool under tools/smell-row-r6/ ran the
// instrument in the instrument's own directory, kept the exit code and the
// line the instrument printed, read the manifest of record the run wrote, and
// compared it field for field with the manifest that stood there before.
//
// WHAT IT ASSERTS:
//
//   - the instrument ran and exited zero, and it wrote the manifest of record.
//
//   - the manifest of record the run wrote is identical, field for field, to
//     the manifest that stood there before, apart from the moment it was
//     written, so the row reproduces the record it is about.
//
//   - all four of the instrument's inputs are present.
//
//   - all ten of the instrument's evidence gates hold, including the one that
//     failed on 2026-10-24: the pinned bundle is the one the scoped run
//     measured.
//
//   - the manifest names the pinned source commit and the pinned bundle, and
//     the bundle's hash is the hash the scoped run measured.
//
//   - the capture carries no credential: the manifest is a custody record of
//     build outputs and hashes.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r6-captures.js";

type Check = { name: string; holds: boolean; detail: Record<string, unknown> };

type Capture = {
  row: string;
  instrument: string;
  instrumentSha256: string;
  measuredAt: string;
  run: {
    command: string;
    cwd: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    wroteManifest: boolean;
  };
  manifestOfRecord: {
    path: string;
    sha256Before: string;
    sha256After: string;
    atBefore: string;
    atAfter: string;
    contentIdenticalApartFromAt: boolean;
    source: string;
    bundle: { path: string; sha256: string; bytes: number };
    dataSha256: string;
  };
  inputs: Check[];
  gates: Check[];
  pinnedBundle: {
    path: string;
    sha256: string | null;
    expected: string | null;
    rebuiltAt: string;
    buildCommand: string;
    buildLogSha256: string | null;
    buildLog: string | null;
  };
  inputsPresent: number;
  inputsTotal: number;
  gatesHolding: number;
  gatesTotal: number;
  gatesFailing: string[];
};

const captureValue = capture<Capture>("write-found-by-integration-manifest");

const gateNamed = (name: string): Check => {
  const found = captureValue.gates.find((gate) => gate.name === name);
  expect(found, `gate ${name} missing from the capture`).toBeDefined();
  return found!;
};

describe("smell-write-found-by-integration-manifest: the instrument wrote the manifest of record", () => {
  it("the instrument ran in its own directory and exited zero", () => {
    expect(captureValue.row).toBe("write-found-by-integration-manifest");
    expect(captureValue.instrumentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.run.exitCode).toBe(0);
    expect(captureValue.run.stderr).toBe("");
    expect(captureValue.run.wroteManifest).toBe(true);
    expect(captureValue.run.stdout).toContain('"qualified":true');
  });

  it("the manifest of record the run wrote reproduces the manifest that stood there before", () => {
    expect(captureValue.manifestOfRecord.contentIdenticalApartFromAt).toBe(true);
    expect(captureValue.manifestOfRecord.sha256Before).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.manifestOfRecord.sha256After).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.manifestOfRecord.atBefore).not.toBe(captureValue.manifestOfRecord.atAfter);
  });

  it("the manifest names the pinned source and the pinned bundle the scoped run measured", () => {
    expect(captureValue.manifestOfRecord.source).toBe("6f960810e3c9a1c5ab31fc0f4239c5d9f9a7ebf3");
    expect(captureValue.manifestOfRecord.bundle.sha256).toBe(
      "ea2e31d4f216657702c5cdee2d735afe1407a6a9f47d09dbe9d952c8e0ae4b93",
    );
    expect(captureValue.manifestOfRecord.bundle.path).toMatch(/bunny-edge-engine\.bundle\.js$/);
    expect(captureValue.manifestOfRecord.dataSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("all four of the instrument's inputs are present", () => {
    expect(captureValue.inputsTotal).toBe(4);
    expect(captureValue.inputsPresent).toBe(4);
    for (const input of captureValue.inputs) {
      expect(input.holds, input.name).toBe(true);
    }
  });

  it("all ten of the instrument's evidence gates hold", () => {
    expect(captureValue.gatesTotal).toBe(10);
    expect(captureValue.gatesHolding).toBe(10);
    expect(captureValue.gatesFailing).toEqual([]);
    for (const name of [
      "the equivalence run passed",
      "the equivalence run left the source clean",
      "the equivalence run left the input unchanged",
      "the old and new CQL module differ",
      "the scoped run passed every check",
      "the scoped run left the source clean",
      "the scoped run left the deck unchanged",
      "the correctness gate reports 5954 passed",
      "the correctness gate reports no failures",
      "the pinned bundle is the one the scoped run measured",
    ]) {
      expect(gateNamed(name).holds, name).toBe(true);
    }
  });

  it("the gate that failed on 2026-10-24 now holds on a bundle rebuilt byte-exact at the pinned source", () => {
    const gate = gateNamed("the pinned bundle is the one the scoped run measured");
    expect(gate.detail.present).toBe(true);
    expect(gate.detail.sha256).toBe(gate.detail.expected);
    expect(gate.detail.sha256).toBe(
      "ea2e31d4f216657702c5cdee2d735afe1407a6a9f47d09dbe9d952c8e0ae4b93",
    );
  });

  it("the capture carries no credential", () => {
    const text = JSON.stringify(captureValue);
    for (const forbidden of ["apiKey", "api_key", "secret", "password", "authorization", "Bearer "]) {
      expect(text.includes(forbidden), `the capture names ${forbidden}`).toBe(false);
    }
  });

  it("the pinned bundle was rebuilt by the project's own tool, and its build log is kept with the capture", () => {
    const bundle = captureValue.pinnedBundle;
    expect(bundle.rebuiltAt).toBe("6f960810e3c9a1c5ab31fc0f4239c5d9f9a7ebf3");
    expect(bundle.buildCommand).toContain("tools/bundle-bunny-edge-engine.mjs");
    expect(bundle.buildLogSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.buildLog).toContain("bunny-edge-engine.bundle.js (7305968 bytes");
    expect(bundle.buildLog).toContain("bundle validated");
    expect(bundle.buildLog).toContain("payload written");
    expect(bundle.sha256).toBe(bundle.expected);
  });
});
