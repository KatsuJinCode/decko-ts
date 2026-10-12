// The grade runs the engine's card wall clock at the instant the graded
// corpus was photographed under (CAPTURE_FROZEN_CLOCK), so `*now` and every
// other clock-bearing byte are compared at the same instant on both sides.
//
// Run: npx vitest run tools/oracle/capture-frozen-clock-env.test.ts
import { describe, expect, it } from "vitest";
import { captureClockFromEnv } from "./dual-lane-direct-runner-core.js";
import { CAPTURE_WALL_CLOCK_CAPTURE_INSTANT, formatCardDayofwkMinTz } from "../../src/card/set-module-content-overrides.js";
import { CORPUS_CAPTURE_TIME_ZONE, setDeckTimeZone } from "../../src/card/deck-time-zone.js";

describe("CAPTURE_FROZEN_CLOCK", () => {
  it("keeps the older corpus's capture minute when unset", () => {
    expect(captureClockFromEnv(undefined)).toBe(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    expect(captureClockFromEnv("")).toBe(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
  });

  it("renders *now at the corpus of record's rig epoch as the capture did", () => {
    // expectation: the `*now` card's dayofwk_min_tz rendering at the corpus's
    // frozen rig epoch
    const instant = captureClockFromEnv("2026-09-19T12:00:00Z");
    // The capture host ran Pacific time; reproducing its bytes is an explicit
    // act now that the engine's default zone is UTC (see deck-time-zone.ts).
    setDeckTimeZone(CORPUS_CAPTURE_TIME_ZONE);
    try {
      expect(formatCardDayofwkMinTz(instant)).toBe(
        "Saturday, September 19, 2026 05:00 AM PDT",
      );
    } finally {
      setDeckTimeZone(undefined);
    }
  });

  it("refuses an instant without a zone or that does not parse", () => {
    expect(() => captureClockFromEnv("2026-09-19 12:00:00")).toThrow(/ISO-8601 instant with a zone/);
    expect(() => captureClockFromEnv("2026-09-19T12:00:00")).toThrow(/ISO-8601 instant with a zone/);
    expect(() => captureClockFromEnv("2026-13-45T12:00:00Z")).toThrow(/not a valid instant/);
  });
});
