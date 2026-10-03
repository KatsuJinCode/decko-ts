// date-dashed-two-component-raise-pins.test.ts — the dashed ALL-NUMERIC
// Date content that is not the Y-M-D triple RAISES, exactly as Ruby's
// Date.parse raises.
//
// GEM VERIFICATION (this lane, 2026-10-03): Ruby 3.3
// (C:/Ruby33-x64, `ruby tmp/the-69-wave1-refill2/date-parse-conformance.rb`)
// ran Date.parse over EVERY Date-typed corpus card (4,021 rows,
// tmp/the-69-wave1-refill2/date-contents.json -> date-parse-ruby33.tsv).
// The dashed shapes the corpus carries are 3-component Y-M-D (4,013 rows,
// all parse, engine agrees on every one) and ONE 2-component row:
//
//   13903  "1981-10"  (Stanley Pranin - Introduction to the Omoto Religion
//                      +Date)  ->  RAISE Date::Error
//
// whose captured page (recapture-raw-shard-000009, solo probe) renders the
// (core view) render-error span — Ruby raises, the capture agrees, and the
// engine now raises with it (solo probe FAIL -123 with the pre-fix accept,
// PASS byte-identical with the raise; same-tree revert = file overwrite,
// no git).
//
// THE DEFECT. parseRubyDateContent's three explicit branches (compact
// YYYYMMDD, dashed Y-M-D, slashed) matched nothing for "1981-10", and the
// JS fallback `new Date("1981-10")` ACCEPTED it (October 1, 1981) where
// Ruby raises. The fix blocks every dashed all-numeric shape whose
// component count is not exactly the Y-M-D triple.
//
// THE REMAINDER, recorded (this pin does NOT claim these):
//   35469 "20-0405" (White Fragility …+Date): the CAPTURE renders
//         "September 20, 2026" while Ruby 3.3 parses "October 20, 2026" —
//         the capture-era Ruby's reading is not derivable from any Ruby
//         this machine can run; engine keeps the raise (+101 residual).
//         CORPUS-UNCERTAIN.
//   37752 "03/01/2021", 38903 "09/10/2021 8:01 AM", 44574 "05/18/2023
//         12:00 AM": slash-form D/M semantics Ruby 3.3 applies and the
//         engine does not port — none of the three cards sits on a graded
//         page of the 31-entry set this lane probes.
// Conformance tally post-fix: 4,016 of 4,021 agree outright; the 5
// buckets above are the entire remainder.

import { describe, it, expect } from "vitest";
import { parseRubyDateContent } from "../../../src/card/render/errors.js";
import { formatDateCore } from "../../../src/card/render/views.js";

describe("dashed all-numeric Date content that is not Y-M-D raises (gem-verified, rule/all run 2026-10-03)", () => {
  it("1981-10 raises (the Stanley Pranin corpus shape)", () => {
    expect(parseRubyDateContent("1981-10")).toBeNull();
  });

  it("the 3-component dashed shapes the corpus parses keep parsing", () => {
    // 4,013 agreeing rows are represented by their shape exemplars:
    // padded, unpadded-month, and the two-digit-year window (the
    // errors.ts doc's own exemplar "19-03-19" -> March 19, 2019).
    expect(parseRubyDateContent("2010-07-31")?.getUTCDate()).toBe(31);
    expect(parseRubyDateContent("2010-7-19")?.getUTCMonth()).toBe(6);
    expect(parseRubyDateContent("19-03-19")?.getUTCFullYear()).toBe(2019);
    expect(formatDateCore("2010-7-19")).toBe("July 19, 2010");
  });

  it("the compact and all-digit-raise classes are unchanged", () => {
    expect(parseRubyDateContent("20190319")?.getUTCMonth()).toBe(2);
    expect(parseRubyDateContent("2016")).toBeNull();
    expect(parseRubyDateContent("1980")).toBeNull();
  });
});
