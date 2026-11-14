// smell-apply-remote-widget-cas-parity.test.ts - the row
// smell-apply-remote-widget-cas.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs)
// writes twelve authorized card contents to the production database with one
// atomic compare-and-swap statement, and its admission is the version and
// the twelve before contents. The row closes when the row's own verification
// can be produced.
//
// The capture under fixtures/captured/smell-row-r4-2026-10-24/ is the
// instrument's own evidence tree, distilled by
// tools/smell-row-r4/distill-remote-widget-cas.mjs: the plan's admission, the
// receipt of the write that already executed, the one-shot intent file, and
// the refusal this lane measured.
//
// WHAT IT ASSERTS:
//
//   - the write ALREADY EXECUTED and passed: twelve rows written, every
//     content hash matching, no other field changed, the version monotonic.
//
//   - the admission CAN NO LONGER HOLD: the statement admits on version 52
//     and on the twelve rows still carrying their before content, and the
//     executed run moved the version to 64 and replaced those contents, so
//     the same statement would be refused by its own guard.
//
//   - the instrument CANNOT RUN A SECOND TIME: it writes its intent file
//     with the exclusive-create flag, and that file is in the tree.
//
//   - the credential the instrument needs is not on this machine, and the
//     refusal it produces is at the credential read, before any live request.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open, because a fresh production credential is the operator's call
// and the roster owns that state.

import { describe, expect, it } from "vitest";

import { singleCapture } from "./smell-row-r4-captures.js";

type Capture = {
  row: string;
  plan: {
    scope: string;
    versionBefore: number;
    expectedVersionAfter: number;
    admission: { matches: number; version: number; version_rows: number; allowed: number } | null;
    statementVersionArgument: number;
    statementGuardsOnVersion: boolean;
    statementGuardsOnContent: boolean;
  };
  custodyImage: { cards: number; beforeSha256: string };
  executedWrite: {
    at: string;
    pass: boolean;
    returnedWriteRows: number;
    reportedAffectedRows: number;
    allTwelveAfterMatch: boolean;
    otherFieldsUnchanged: boolean;
    monotonicVersionMatches: boolean;
    casRefused: boolean;
    contentWritten: boolean;
    versionBefore: number;
    versionsAfter: { id: number; version: number }[];
  };
  oneShot: { intentFile: string; intentFileExists: boolean; intentWrittenAt: string | null };
  credential: { path: string; presentOnThisMachine: boolean; refusal: string | null };
};

const capture = singleCapture<Capture>("apply-remote-widget-cas");

describe("smell-apply-remote-widget-cas: the write already executed and its admission cannot hold twice", () => {
  it("the record of record says the write passed", () => {
    expect(capture.row).toBe("apply-remote-widget-cas");
    expect(capture.executedWrite.pass).toBe(true);
    expect(capture.executedWrite.returnedWriteRows).toBe(12);
    expect(capture.executedWrite.reportedAffectedRows).toBe(12);
    expect(capture.executedWrite.allTwelveAfterMatch).toBe(true);
    expect(capture.executedWrite.otherFieldsUnchanged).toBe(true);
    expect(capture.executedWrite.monotonicVersionMatches).toBe(true);
    expect(capture.executedWrite.casRefused).toBe(false);
    expect(capture.executedWrite.contentWritten).toBe(true);
  });

  it("the statement admits on the version and on the twelve before contents", () => {
    expect(capture.plan.statementGuardsOnVersion).toBe(true);
    expect(capture.plan.statementGuardsOnContent).toBe(true);
    expect(capture.plan.statementVersionArgument).toBe(capture.plan.versionBefore);
    expect(capture.plan.admission).toEqual({ matches: 12, version: 52, version_rows: 1, allowed: 1 });
    expect(capture.custodyImage.cards).toBe(12);
  });

  it("the executed run moved the version past the admission, so the same statement cannot be admitted twice", () => {
    expect(capture.executedWrite.versionBefore).toBe(capture.plan.versionBefore);
    expect(capture.executedWrite.versionsAfter).toEqual([{ id: 1, version: capture.plan.expectedVersionAfter }]);
    expect(capture.executedWrite.versionsAfter[0]!.version).not.toBe(capture.plan.versionBefore);
    expect(capture.plan.expectedVersionAfter).toBe(64);
    expect(capture.plan.versionBefore).toBe(52);
  });

  it("the instrument is one-shot: its intent file is already in the tree", () => {
    expect(capture.oneShot.intentFileExists).toBe(true);
    expect(capture.oneShot.intentFile).toBe("apply-intent.json");
    expect(capture.oneShot.intentWrittenAt).toBeTruthy();
  });

  it("the credential is not on this machine and the refusal is at the credential read", () => {
    expect(capture.credential.presentOnThisMachine).toBe(false);
    expect(capture.credential.path).toContain("owned-cs-edge-cleanup-20261018.env");
    expect(capture.credential.refusal).toContain("ENOENT");
    expect(capture.credential.refusal).toContain("owned-cs-edge-cleanup-20261018.env");
    // The refusal is a read of the credential file, before any request.
    expect(capture.credential.refusal).toContain("parse");
  });
});
