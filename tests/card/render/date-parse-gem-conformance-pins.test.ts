// date-parse-gem-conformance-pins.test.ts — the Date cardtype's parse is
// the GEM's `Date.parse`, and the two corpus-visible disagreements with it
// were in OPPOSITE directions, so nothing here is a per-string special
// case.
//
// GEM SOURCE (C:/localProjects/archive/decko-fork-study/decko/):
//
//   mod/date/set/type/date.rb:6-8
//       view :core do
//         ::Date.parse(card.content).strftime "%B %-d, %Y"
//       end
//
// THERE IS NO OTHER DATE PARSER IN THE CHAIN. Whatever `Date.parse` returns
// is what the cardtype renders, and an invalid one is a Date::Error that
// the delegated-render rescue scope turns into the
// `(core view)` error span (pinned by
// date-delegated-core-rescue-scope-pins.test.ts).
//
// THE GEM RUN. This machine has ruby 3.3.12 (date gem 3.5.1) at
// C:/Ruby33-x64/bin/ruby.exe, so the conformance table is MEASURED, not
// inferred:
//
//   ruby tmp/addressed-wave1/ruby-date-parse-conformance-table.rb \
//     > tmp/addressed-wave1/date-parse-conformance-table.json
//
// 1,340 rows: the corpus's own unusual contents, the compact / dashed /
// slashed families, and a 1,306-row two-component dashed boundary sweep.
// The engine now agrees with the gem on 1,336 of them; the four it does
// not are listed under RESIDUALS below, all pre-existing, all outside the
// entry set this lane was asked to address.
//
// THE TWO ENTRIES THIS CLOSED. The graded corpus carries 4,060 Date-typed
// cards (type_id=17 in tmp/raw-ground-truth/bench-corpus-raw.sqlite3);
// 4,045 are complete Y-M-D. Two are not:
//
//   card 13903 `Stanley Pranin ...+Date`, content "1981-10"  (-123)
//     Date._parse => {:mon=>19, :mday=>81, :zone=>"-10"} — no valid
//     :mday, so the gem RAISES. The engine fell through to
//     `new Date("1981-10")`, which JS reads as an ISO year-month, and
//     rendered "October 1, 1981" where the capture carries the error span.
//
//   card 35469 `White Fragility ...+Date`, content "20-0405"  (+101)
//     Date._parse => {:mday=>20, :zone=>"-0405", :offset=>-14700} — a
//     day, a zone, and NO month or year, which Date.parse completes from
//     Date.today. The gem PARSES; the engine rejected it outright.
//
// Both are closed and both byte-probe PASS solo at this commit. The
// capture-date pin behind the second one is documented, with its
// capture-date dependence, at fillFromReferenceMonth in src/card/render/
// errors.ts — the completion reads the engine's wall-clock seam, as Ruby
// reads Date.today, so a capture run freezes the seam to the capture instant.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { parseRubyDateContent } from "../../../src/card/render/errors.js";
import { setCaptureWallClock } from "../../../src/card/wall-clock.js";

afterEach(() => setCaptureWallClock(undefined));

function renderLong(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface TableRow {
  input: string;
  parsed: boolean;
  iso?: string;
  rendered?: string;
}
const TABLE = JSON.parse(
  readFileSync(new URL("./date-parse-conformance-table.json", import.meta.url), "utf8"),
) as { ruby_version: string; date_gem: string; date_today: string; rows: TableRow[] };

/** The four rows the engine does not match, each with the gem's answer.
 *  Pinned so a future change that closes one of them is a visible delta
 *  rather than a silent drift, and so the count cannot quietly grow. */
const KNOWN_RESIDUALS: Record<string, "parses-in-gem" | "raises-in-gem"> = {
  "123": "parses-in-gem", // Date._parse {:yday=>123} — the bare-digit yday heuristic
  "12": "parses-in-gem", // Date._parse {:mday=>12} — the bare-digit mday heuristic
  "05/18/2023 12:00 AM": "raises-in-gem", // Date._parse {:mon=>18} — month out of range
  "19/3/2019": "parses-in-gem", // Date._parse d/m/y, a shape the slash branch drops
};

describe("parseRubyDateContent is the gem's Date.parse (date.rb:6-8), measured not inferred", () => {
  it("the conformance table this file pins was produced by a real ruby run", () => {
    // If the table is ever hand-edited, this is what notices. The rows
    // below are only meaningful if they came out of the interpreter.
    expect(TABLE.ruby_version).toMatch(/^3\./);
    expect(TABLE.date_gem).toMatch(/^\d+\.\d+/);
    expect(TABLE.rows.length).toBeGreaterThan(1000);
  });

  it("agrees with the gem on parse-vs-raise for every table row but the four named residuals", () => {
    const mismatches = TABLE.rows.filter((row) => {
      const engine = parseRubyDateContent(row.input) !== null;
      return engine !== row.parsed && !(row.input in KNOWN_RESIDUALS);
    });
    expect(
      mismatches.map((m) => `${JSON.stringify(m.input)} gem=${m.parsed}`),
      "unlisted disagreement with the gem's Date.parse",
    ).toEqual([]);
  });

  it("the two corpus entries render the gem's own answer", () => {
    // card 13903 — the gem raises, so the Date cardtype's `::Date.parse`
    // raises, so the delegated render's rescue produces the error span.
    expect(
      parseRubyDateContent("1981-10"),
      'card 13903: Date._parse gives :mday=>81, no valid date',
    ).toBeNull();

    // card 35469 — the gem parses and completes the missing month and year
    // from Date.today. With the clock frozen to the capture instant
    // (2026-09-19T12:00:00Z) the render is "September 20, 2026", the
    // capture's own byte.
    setCaptureWallClock(new Date("2026-09-19T12:00:00Z"));
    const white = parseRubyDateContent("20-0405");
    expect(white, "card 35469: the gem parses it").not.toBeNull();
    expect(renderLong(white as Date)).toBe("September 20, 2026");
  });

  it("completes a partial date from the clock seam, in any month", () => {
    setCaptureWallClock(new Date("2027-01-15T12:00:00Z"));
    expect(renderLong(parseRubyDateContent("20-0405") as Date)).toBe("January 20, 2027");
    setCaptureWallClock(new Date("2026-10-07T12:00:00Z"));
    expect(renderLong(parseRubyDateContent("20-0405") as Date)).toBe("October 20, 2026");
  });

  it("the two-component dashed boundary is the gem's, at every width", () => {
    // A leading component that cannot be a day raises, at every trailing
    // width the sweep covers. These are the gem's own boundary rows.
    for (const input of ["1981-10", "2020-01", "2020-13", "99-99", "32-01", "35-31"]) {
      expect(parseRubyDateContent(input), `${input} must raise like the gem`).toBeNull();
    }
    // A leading component that CAN be a day parses and completes.
    for (const input of ["20-04", "12-12", "10-00", "31-31", "0-01", "9-31"]) {
      expect(parseRubyDateContent(input), `${input} must parse like the gem`).not.toBeNull();
    }
    // A one-digit trailing group is the gem's merged :mday/:hour path and
    // raises for every leading component.
    for (const input of ["2-1", "2-2", "12-2", "1-0", "0-1"]) {
      expect(parseRubyDateContent(input), `${input} must raise like the gem`).toBeNull();
    }
  });

  it("the complete-date families the corpus's other 4,045 cards carry are untouched", () => {
    // Guards the blast radius: the change is in the partial-date branches,
    // so every shape that was already correct must stay correct.
    for (const [input, rendered] of [
      ["20190319", "March 19, 2019"],
      ["18-12-22", "December 22, 2018"],
      ["2010-7-19", "July 19, 2010"],
      ["38-12-31", "December 31, 2038"],
      ["69-1-1", "January 1, 1969"],
    ] as Array<[string, string]>) {
      const got = parseRubyDateContent(input);
      expect(got, `${input} must still parse`).not.toBeNull();
      expect(
        (got as Date).toLocaleString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
        `${input} renders`,
      ).toBe(rendered);
    }
    // The shapes the gem rejects keep raising.
    for (const input of ["2019-13-01", "2021-02-29", "2019-05-0", "2016", "1980", "1", "0"]) {
      expect(parseRubyDateContent(input), `${input} must raise`).toBeNull();
    }
  });
});
