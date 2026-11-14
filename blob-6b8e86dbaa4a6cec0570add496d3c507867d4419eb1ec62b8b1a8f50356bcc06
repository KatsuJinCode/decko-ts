// smell-read-staging-isolate-probe-parity.test.ts - the row
// smell-read-staging-isolate-probe.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/read-staging-isolate-probe.mjs)
// reads the staging script's own variable table and, when the diagnostic is
// armed and the cache is disabled, drives the staging probe: two CPU
// measurements, three SELECT 1 round trips and two anonymous home renders
// with the cache off. The row closes when that instrument runs and its own
// verdict holds.
//
// This lane ran it and it refused at its own admission gate, before any probe
// traffic, and the capture under fixtures/captured/smell-row-r5b-2026-10-24/
// is that run's record.
//
// WHAT IT ASSERTS:
//
//   - the instrument ran, refused with its own message, and sent no probe
//     traffic.
//
//   - the two variables the gate reads are in the opposite of the state the
//     gate requires, measured live from the same script metadata read the
//     instrument itself makes.
//
//   - the target is the staging script the instrument names, and the receipt
//     carries no credential: the account key the instrument reads is never
//     printed.
//
//   - the routes the probe would drive are the four the capture names, so the
//     record says exactly what was not sent.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5b-captures.js";

type Detail = {
  scriptId: number;
  hostname: string;
  gateSourceLine: number;
  requiredState: Record<string, string>;
  measuredState: Record<string, string>;
  noReceiptWritten: string;
  probeRoutesThatWouldRun: string[];
  unblocksWhen: string;
};

const row = capture("smell-read-staging-isolate-probe");
const detail = row.detail as Detail;

describe("smell-read-staging-isolate-probe: the staging diagnostic is not armed, so the probe refused", () => {
  it("the instrument ran and refused at its own admission gate", () => {
    expect(row.row).toBe("smell-read-staging-isolate-probe");
    expect(row.outcome).toBe("ran");
    expect(row.exit).toBe(1);
    expect(row.verdict).toBe("open");
    expect(row.refusal).toBe("Staging diagnostic is not armed/cache-disabled; no probe traffic sent");
    expect(row.mechanism).toMatch(/refuses before any probe traffic/i);
  });

  it("both variables the gate reads are in the opposite of the required state", () => {
    expect(detail.gateSourceLine).toBe(6);
    expect(detail.requiredState.DECKO_EDGE_ISOLATE_PROBE).toBe("1");
    expect(detail.requiredState.DECKO_EDGE_CACHE).toBe("0");
    expect(detail.measuredState.DECKO_EDGE_ISOLATE_PROBE).toBe("0");
    expect(detail.measuredState.DECKO_EDGE_CACHE).toBe("1");
    expect(detail.noReceiptWritten).toMatch(/refused before that/);
  });

  it("the target is the staging script the instrument names, and no credential is in the receipt", () => {
    expect(detail.scriptId).toBe(96895);
    expect(detail.hostname).toBe("https://culturesmith-b-edge.bunny.run");
    const raw = JSON.stringify(row);
    expect(raw).not.toMatch(/BUNNY_ACCOUNT_API_KEY/);
    expect(raw).not.toMatch(/AccessKey/);
  });

  it("the record says which four routes the probe would have driven", () => {
    expect(detail.probeRoutesThatWouldRun).toHaveLength(4);
    expect(detail.probeRoutesThatWouldRun[0]).toMatch(/^\/_probe\/cpu/);
    expect(detail.probeRoutesThatWouldRun[1]).toMatch(/^\/_probe\/db/);
    expect(detail.unblocksWhen).toMatch(/arms the two staging variables/);
  });
});
