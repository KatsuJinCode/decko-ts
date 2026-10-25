// smell-write-found-by-integration-manifest-parity.test.ts - the row
// smell-write-found-by-integration-manifest.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs)
// writes the found-by integration manifest, and it refuses before it writes
// anything when the qualified semantic, scoped and correctness evidence is not
// in place, or when the pinned bundle is not the one the scoped run measured.
//
// The capture under fixtures/captured/smell-row-r5-2026-10-24/ is this lane's
// input-by-input check of what the instrument reads, against what is on this
// machine now.
//
// WHAT IT ASSERTS:
//
//   - all four of the instrument's inputs are present now: the real-deck
//     equivalence receipt, the scoped-layout completion, the scoped-layout
//     report and the correctness gate log.
//
//   - nine of the ten gates the instrument checks hold, so the instrument gets
//     past its own evidence gates.
//
//   - the one gate that does not hold is the pinned bundle, which is a build
//     output of the pinned source and is not on this machine.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5-captures.js";

type Check = { name: string; holds: boolean; detail: Record<string, unknown> };

type Capture = {
  row: string;
  instrument: string;
  inputs: Check[];
  gates: Check[];
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

describe("smell-write-found-by-integration-manifest: every input is here and one gate is not", () => {
  it("all four of the instrument's inputs are present", () => {
    expect(captureValue.row).toBe("write-found-by-integration-manifest");
    expect(captureValue.inputsTotal).toBe(4);
    expect(captureValue.inputsPresent).toBe(4);
    for (const input of captureValue.inputs) {
      expect(input.holds).toBe(true);
    }
  });

  it("the instrument's own evidence gates hold", () => {
    expect(captureValue.gatesTotal).toBe(10);
    expect(captureValue.gatesHolding).toBe(9);
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
    ]) {
      expect(gateNamed(name).holds, name).toBe(true);
    }
  });

  it("the one gate that does not hold is the pinned bundle, and it is a build output", () => {
    const gate = gateNamed("the pinned bundle is the one the scoped run measured");
    expect(gate.holds).toBe(false);
    expect(gate.detail.present).toBe(false);
    expect(gate.detail.path).toMatch(/bunny-edge-engine\.bundle\.js$/);
    expect(gate.detail.expected).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.gatesFailing).toEqual(["the pinned bundle is the one the scoped run measured"]);
  });
});
