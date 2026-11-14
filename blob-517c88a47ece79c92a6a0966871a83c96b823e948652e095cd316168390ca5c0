// smell-row-r5-rig-applicability.test.ts - the two-leg rig against this
// round's six row instruments.
//
// WHAT THIS IS. The two-leg rig (tools/smell-act082-legs/run-leg.mjs) drives
// a probe by rewriting two lines in it: the engine manifest it names and the
// output directory it writes. A probe it cannot drive is refused, with the
// reason.
//
// This round's six rows were each run with the rig against that row's own
// instrument, and the rig refused every one of them, because none of the six
// names an engine manifest: they read a live hosted edge, a live account API,
// a deck on disk, or a tree of build outputs.
//
// WHAT IT ASSERTS:
//
//   - the rig was offered all six instruments and refused all six.
//
//   - the refusal names the reason the rig gives, so a reader can see that
//     the rows were not skipped but offered.
//
//   - the rig's own contract is recorded: what a probe has to look like for
//     the rig to drive it.
//
// This file is not a row pin. It holds the round's method, so that a reader
// can see that the two-leg rig was applied to every row it could be applied
// to.

import { describe, expect, it } from "vitest";

import { rigApplicability } from "./smell-row-r5-captures.js";

const value = rigApplicability();

const INSTRUMENTS = [
  "verify-hosted-widget-content",
  "verify-hosted-widget-views",
  "verify-staging-probe-restoration",
  "widget-single-statement-cas.test",
  "write-final-a253-manifest",
  "write-found-by-integration-manifest",
];

describe("the two-leg rig against this round's six row instruments", () => {
  it("the rig was offered every instrument and refused every one", () => {
    expect(value.instrumentsOffered).toBe(6);
    expect(value.instrumentsTheRigCanDrive).toBe(0);
    expect(value.answers).toHaveLength(6);
  });

  it("each refusal names the rig's own reason", () => {
    for (const answer of value.answers) {
      expect(answer.rigRefused).toBe(true);
      expect(answer.drivableByTheRig).toBe(false);
      expect(answer.rigSaid).toContain("probe does not name an engine manifest");
    }
  });

  it("the six instruments offered are the six rows this round took", () => {
    const offered = value.answers.map((answer) => answer.instrument).sort();
    expect(offered).toEqual([...INSTRUMENTS].sort());
  });

  it("the rig's contract is recorded", () => {
    expect(value.rig).toBe("tools/smell-act082-legs/run-leg.mjs");
    expect(value.rigContract).toContain("engine manifest");
    expect(value.rigContract).toContain("output directory");
  });
});
