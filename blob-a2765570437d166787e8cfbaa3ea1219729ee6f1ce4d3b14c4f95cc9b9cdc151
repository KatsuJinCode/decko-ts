// smell-audit-candidate-production-flags-parity.test.ts - the row
// smell-audit-candidate-production-flags.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/audit-candidate-production-flags.mjs)
// reads the live Bunny script metadata for the two candidate scripts and
// compares four harness-effective flags against the expected candidate
// configuration. The row closes when that instrument runs and its own verdict
// holds.
//
// The capture under fixtures/captured/smell-row-r4-2026-10-24/ is the
// instrument's own receipt, copied verbatim from the run this lane made.
//
// WHAT IT ASSERTS:
//
//   - both candidate scripts are in the receipt, with their own ids and their
//     own current release ids.
//
//   - every one of the four required flags is present on both scripts and
//     equals the expected value, and the instrument's own verdict
//     (allRequiredPresentAndEqual) is true for both.
//
//   - the receipt carries no credential: it is a read of non-secret script
//     metadata and it must not carry the account key it read.
//
//   - the receipt's scope line says what it is: configuration-delta evidence,
//     not deployment or hosted acceptance, so the closure cannot be over-read.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { singleCapture } from "./smell-row-r4-captures.js";

type Flag = {
  name: string;
  expected: string;
  present: boolean;
  matches: boolean;
  currentValue: string | null;
  currentValueSha256: string | null;
};

type Script = {
  id: number;
  hostname: string;
  currentReleaseId: number;
  flags: Flag[];
  allRequiredPresentAndEqual: boolean;
  noncredentialPolicyKeys: string[];
};

type Capture = {
  row: string;
  instrument: string;
  startedAt: string;
  completedAt: string;
  source: string;
  bundleSha256: string;
  scope: string;
  scripts: Script[];
};

const capture = singleCapture<Capture>("audit-candidate-production-flags");

const REQUIRED: Record<string, string> = {
  DECKO_CONFLICT_RETRY: "1",
  DECKO_MATERIAL_ICONS: "local",
  DECKO_FONT_AWESOME: "local",
  DECKO_WRITE_PATH: "1",
};

describe("smell-audit-candidate-production-flags: both live scripts carry the four required flags", () => {
  it("the receipt covers both candidate scripts", () => {
    expect(capture.row).toBe("audit-candidate-production-flags");
    expect(capture.scripts.map((script) => script.id).sort()).toEqual([96867, 96895]);
    for (const script of capture.scripts) {
      expect(script.hostname).toMatch(/^https:\/\/.*\.bunny\.run$/);
      expect(script.currentReleaseId).toBeGreaterThan(0);
    }
  });

  it("every required flag is present and equals the expected value on both scripts", () => {
    for (const script of capture.scripts) {
      for (const [name, expected] of Object.entries(REQUIRED)) {
        const flag = script.flags.find((candidate) => candidate.name === name);
        expect(flag, `${name} missing from script ${script.id}`).toBeDefined();
        expect(flag!.present).toBe(true);
        expect(flag!.matches).toBe(true);
        expect(flag!.expected).toBe(expected);
        expect(flag!.currentValue).toBe(expected);
        expect(flag!.currentValueSha256).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(script.allRequiredPresentAndEqual).toBe(true);
    }
  });

  it("the receipt carries no credential", () => {
    const raw = JSON.stringify(capture);
    expect(raw).not.toContain("BUNNY_ACCOUNT_API_KEY");
    expect(raw).not.toContain("AccessKey");
    expect(raw).not.toContain("authorization");
    // The instrument lists the non-credential policy keys it saw. None of them
    // may be a credential-bearing name, and the credential-bearing names the
    // instrument itself excludes must be absent.
    const excluded = [
      "DECKO_DB_URL",
      "DECKO_DB_TOKEN",
      "DECKO_TRUSTED_ORIGINS",
      "DECKO_ORIGIN",
      "DECKO_DECK_ORIGIN",
      "DECKO_SERVED_ROOT_URL",
    ];
    for (const script of capture.scripts) {
      for (const key of script.noncredentialPolicyKeys) {
        expect(excluded).not.toContain(key);
        expect(key).not.toMatch(/SECRET|PASSWORD|API_KEY|_AUTH$/);
      }
    }
  });

  it("the receipt says what it is: configuration delta, not deployment acceptance", () => {
    expect(capture.scope).toContain("Read-only current script metadata");
    expect(capture.scope).toContain("not deployment or hosted acceptance");
    expect(capture.source).toMatch(/^[0-9a-f]{40}$/);
    expect(capture.bundleSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
