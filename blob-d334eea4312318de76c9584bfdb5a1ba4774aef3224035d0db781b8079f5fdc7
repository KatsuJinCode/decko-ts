// date-dashed-two-component-raise-pins.test.ts — the dashed ALL-NUMERIC
// Date content that is not the Y-M-D triple RAISES, exactly as Ruby's
// Date.parse raises.
//
// GEM VERIFICATION: Ruby 3.3's Date.parse was run over every Date-typed
// card's content in the deck. The dashed shapes the deck carries are
// 3-component Y-M-D (all parse; the engine agrees on every shape) and
// ONE 2-component row:
//
//   "1981-10"  (a Date-typed junction card)  ->  RAISE Date::Error
//
// whose rendered page carries the (core view) render-error span — Ruby
// raises, and the engine now raises with it.
//
// THE DEFECT. parseRubyDateContent's three explicit branches (compact
// YYYYMMDD, dashed Y-M-D, slashed) matched nothing for "1981-10", and the
// JS fallback `new Date("1981-10")` ACCEPTED it (October 1, 1981) where
// Ruby raises. The fix blocks every dashed all-numeric shape whose
// component count is not exactly the Y-M-D triple.
//
// THE REMAINDER, recorded as known-divergent (this pin does NOT claim
// these):
//   "20-0405" (a Date card whose recorded render disagrees with any
//         runnable Ruby's reading of the same bytes): the engine keeps the
//         raise — the recorded reading is not derivable from any Ruby this
//         port can run against.
//   "03/01/2021", "09/10/2021 8:01 AM", "05/18/2023 12:00 AM": slash-form
//         D/M semantics Ruby 3.3 applies and the engine does not port.

import { describe, it, expect } from "vitest";
import { parseRubyDateContent } from "../../../src/card/render/errors.js";
import { formatDateCore } from "../../../src/card/render/views.js";

describe("dashed all-numeric Date content that is not Y-M-D raises (gem-verified)", () => {
  it("1981-10 raises (a two-component dashed shape)", () => {
    expect(parseRubyDateContent("1981-10")).toBeNull();
  });

  it("the 3-component dashed shapes the corpus parses keep parsing", () => {
    // The agreeing dashed shapes are pinned by their shape exemplars:
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
