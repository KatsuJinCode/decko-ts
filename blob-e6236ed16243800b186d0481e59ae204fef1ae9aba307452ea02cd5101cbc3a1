// smell-retire-owned-migration-credential-parity.test.ts - the row
// smell-retire-owned-migration-credential.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/retire-owned-migration-credential.mjs)
// removes the throwaway account credential that the authorized content
// migration used, once the migration and the hosted content readback have
// both passed, and writes a receipt that names the removal.
//
// This lane ran it and it refused at its own custody comparison, one line
// before the removal, and removed nothing. The capture under
// fixtures/captured/smell-row-r5b-2026-10-24/ is that run's record.
//
// WHAT IT ASSERTS:
//
//   - the instrument ran, refused with its own message, and the run removed
//     nothing.
//
//   - the custody comparison fails because the prepared-access record names a
//     credential path the instrument's constant does not, and the path the
//     constant does name is not on disk.
//
//   - the migration and the hosted content readback both passed, and the
//     retirement of record already exists, so the row's subject is not the
//     one the instrument's constant still points at.
//
//   - the receipt carries no credential value: the capture names paths and
//     flags only.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5b-captures.js";

type Detail = {
  guardSourceLine: number;
  custodyConstantPath: string;
  preparedRecordCredentialPath: string;
  custodyConstantPathExists: boolean;
  preparedRecordCredentialPathExists: boolean;
  applyReceiptPass: boolean;
  hostedReadbackPass: boolean;
  credentialGitIgnored: boolean;
  retirementOfRecord: { file: string; at: string; fileRemoved: boolean; credentialPath: string };
  nothingWasRemoved: string;
  secondRefusal: string;
  operatorDecision: string;
};

const row = capture("smell-retire-owned-migration-credential");
const detail = row.detail as Detail;

describe("smell-retire-owned-migration-credential: the custody constant names a path that no longer holds the credential", () => {
  it("the instrument ran, refused at its custody comparison, and removed nothing", () => {
    expect(row.row).toBe("smell-retire-owned-migration-credential");
    expect(row.outcome).toBe("ran");
    expect(row.exit).toBe(1);
    expect(row.verdict).toBe("open");
    expect(row.refusal).toBe("Successful owned migration and exact credential custody required");
    expect(detail.nothingWasRemoved).toMatch(/one line before the unlink/);
  });

  it("the prepared-access record names a credential path the constant does not", () => {
    expect(detail.guardSourceLine).toBe(4);
    expect(detail.preparedRecordCredentialPath).not.toBe(detail.custodyConstantPath);
    expect(detail.custodyConstantPath).toMatch(/decko-edge-verification-53c86269/);
    expect(detail.preparedRecordCredentialPath).toMatch(/decko-ts-release-lead/);
    expect(detail.custodyConstantPathExists).toBe(false);
    expect(detail.preparedRecordCredentialPathExists).toBe(true);
  });

  it("the migration and the hosted readback passed, and the retirement of record already exists", () => {
    expect(detail.applyReceiptPass).toBe(true);
    expect(detail.hostedReadbackPass).toBe(true);
    expect(detail.credentialGitIgnored).toBe(true);
    expect(detail.retirementOfRecord.fileRemoved).toBe(true);
    expect(detail.retirementOfRecord.credentialPath).toBe(detail.custodyConstantPath);
    expect(detail.retirementOfRecord.at).toMatch(/^2026-10-18T/);
    expect(detail.operatorDecision).toMatch(/operator decision/);
  });

  it("the receipt carries no credential value", () => {
    const raw = JSON.stringify(row);
    expect(raw).not.toMatch(/BUNNY_ACCOUNT_API_KEY/);
    expect(raw).not.toMatch(/eyJ/);
    expect(raw).not.toMatch(/token/i);
  });
});
