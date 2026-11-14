// smell-read-private-index-progress-parity.test.ts - the row
// smell-read-private-index-progress.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/read-private-index-progress.mjs)
// opens, read-only, the built clone that carried the decko_nest_edges index
// cache and reports whether that cache table exists and how many edges it
// holds. The row closes when that instrument runs and its own verdict holds.
//
// This lane ran it and it refused at its first read, and the capture under
// fixtures/captured/smell-row-r5b-2026-10-24/ is that run's record.
//
// WHAT IT ASSERTS:
//
//   - the instrument ran, and its refusal is the missing directory, not a
//     missing dependency: the pinned checkout it imports from was restored
//     first, so the instrument got as far as opening the database.
//
//   - the database it opens is the built clone with the nest-index cache, and
//     that directory is not on disk.
//
//   - the table the row is about is the one named in the capture, so a
//     capture that moved to another subject fails the pin.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5b-captures.js";

type Detail = {
  databasePath: string;
  databaseDirectoryPresent: boolean;
  thrownAt: string;
  tableTheRowReads: string;
  restoredInputs: string[];
  notRebuilt: string;
};

const row = capture("smell-read-private-index-progress");
const detail = row.detail as Detail;

describe("smell-read-private-index-progress: the built clone with the index cache is gone", () => {
  it("the instrument ran and refused at its first read", () => {
    expect(row.row).toBe("smell-read-private-index-progress");
    expect(row.outcome).toBe("ran");
    expect(row.exit).toBe(1);
    expect(row.verdict).toBe("open");
    expect(row.refusal).toMatch(/Cannot open database because the directory does not exist/);
    expect(row.mechanism).toMatch(/swept|runtime tree/i);
  });

  it("the refusal came from the database open, not from a missing dependency", () => {
    expect(detail.thrownAt).toMatch(/better-sqlite3/);
    expect(detail.thrownAt).toMatch(/read-private-index-progress\.mjs/);
    expect(detail.restoredInputs.join(" ")).toMatch(/b00a4503/);
  });

  it("the database it opens is the built clone with the nest-index cache, and it is not on disk", () => {
    expect(detail.databasePath).toMatch(/private-nest-index-a253-20261019[/\\]deck\.sqlite3$/);
    expect(detail.databaseDirectoryPresent).toBe(false);
    expect(detail.tableTheRowReads).toBe("decko_nest_edges");
  });
});
