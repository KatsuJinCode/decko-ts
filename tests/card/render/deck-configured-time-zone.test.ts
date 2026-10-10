// Rendering reads the DECK's configured time zone (review round 4,
// finding 22).
//
// The defect: now-content-bytes.ts, errors.ts and set-module-content-overrides.ts
// hard-coded America/Los_Angeles — the CAPTURE HOST's operating-system zone —
// and appended the literal Windows zone DISPLAY NAME "Pacific Standard Time",
// which is wrong for half the year (a September instant is PDT). Ruby reads
// `Time.zone` (the deck's own Rails config) and `%Z` renders the zone's
// abbreviation AT THAT INSTANT.
//
// What this suite pins:
//
//   - A DECK CONFIGURED WITH A DIFFERENT ZONE (UTC) renders timestamps in
//     that zone with the correct label — the case the defect made impossible.
//     Under the old code a UTC deck rendered Pacific wall-clock time stamped
//     "Pacific Standard Time".
//   - The abbreviation is COMPUTED from the zone and offset, so the same zone
//     reads PDT in September and PST in January. A zone whose offset does not
//     change across the year reads the same label in both, which is what a
//     computed label does and a hard-coded one cannot.
//   - The DEFAULT is the graded deck's zone, so the graded arithmetic is
//     untouched — only the label is now the abbreviation Ruby prints.
//   - A partial date completes its missing month/year from "today" in the
//     DECK's zone (errors.ts#fillFromReferenceMonth), not the host's.

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DECK_TIME_ZONE,
  deckTimeZoneName,
  formatCardDayofwkMinTz,
  resetDeckTimeZone,
  setDeckTimeZone,
  zoneAbbreviation,
} from "../../../src/card/deck-time-zone.js";
import { nowCardContent } from "../../../src/card/render/now-content-bytes.js";
import {
  CAPTURE_WALL_CLOCK_CAPTURE_INSTANT,
  ORACLE_CAPTURE_NOW_BYTES,
  resolveSetModuleContent,
  setCaptureWallClock,
  type SetModuleContentCard,
} from "../../../src/card/set-module-content-overrides.js";
import { parseRubyDateContent } from "../../../src/card/render/errors.js";

afterEach(() => {
  resetDeckTimeZone();
  setCaptureWallClock(undefined);
});

function nowCard(): SetModuleContentCard {
  return {
    key: "*now",
    name: "*now",
    codename: "now",
    typeCode: "basic",
    dbContent: "",
    partCodenames: ["now"],
  };
}

describe("deck time zone — the DECK's zone, not the capture host's", () => {
  it("a deck configured for UTC renders in UTC with the UTC label", () => {
    setDeckTimeZone("UTC");
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    // 2026-09-28T22:12Z is 15:12 Pacific but 22:12 UTC — the two hours the
    // old hard-coded zone got wrong for any non-Pacific deck.
    expect(formatCardDayofwkMinTz(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT)).toBe(
      "Monday, September 28, 2026 10:12 PM UTC",
    );
    // …and the Self::Now content path reads the SAME setting, not its own.
    expect(nowCardContent()).toBe("Monday, September 28, 2026 10:12 PM UTC");
    expect(resolveSetModuleContent(nowCard())).toBe("Monday, September 28, 2026 10:12 PM UTC");
  });

  it("a deck configured for Europe/Berlin renders in Berlin, with a computed label", () => {
    setDeckTimeZone("Europe/Berlin");
    // Berlin has no IANA short abbreviation in en-US, so the label is the
    // GMT offset — which is still COMPUTED from the zone, not hard-coded.
    expect(formatCardDayofwkMinTz(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT)).toBe(
      "Tuesday, September 29, 2026 12:12 AM GMT+2",
    );
  });

  it("the Self::Now card and the record path agree in a non-default zone", () => {
    setDeckTimeZone("Asia/Tokyo");
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    expect(resolveSetModuleContent(nowCard())).toBe(nowCardContent());
    expect(nowCardContent()).toContain("GMT+9");
  });

  it("WhenCreated reads the same configured zone as Now", () => {
    setDeckTimeZone("UTC");
    const answer = resolveSetModuleContent({
      key: "home+when_created",
      name: "Home+*when created",
      dbContent: "",
      partCodenames: [null, "when_created"],
      leftIsReal: true,
      // The LocalSqliteDriver write shape: a UTC SQL timestamp, which the
      // deck zone then renders.
      leftCreatedAt: "2026-09-28 22:12:00.000",
    });
    expect(answer).toBe("Monday, September 28, 2026 10:12 PM UTC");
  });
});

describe("deck time zone — the %Z label is computed, not a literal", () => {
  it("the same zone reads PDT in September and PST in January", () => {
    // THE POINT OF THE FIX: one hard-coded string cannot be both. A Windows
    // display name is "Pacific Standard Time" in both months, which is why
    // the captured September bytes were labelled wrong.
    const september = new Date("2026-09-28T22:12:00Z");
    const january = new Date("2026-01-15T22:12:00Z");
    expect(zoneAbbreviation(september, DEFAULT_DECK_TIME_ZONE)).toBe("PDT");
    expect(zoneAbbreviation(january, DEFAULT_DECK_TIME_ZONE)).toBe("PST");
    expect(formatCardDayofwkMinTz(september)).toContain(" PDT");
    expect(formatCardDayofwkMinTz(january)).toContain(" PST");
  });

  it("no rendering path emits the Windows display name any more", () => {
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    expect(nowCardContent()).not.toContain("Pacific");
    expect(formatCardDayofwkMinTz(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT)).not.toContain("Pacific ");
    // …and in January too, where "PST" is the correct abbreviation.
    setCaptureWallClock(new Date("2026-01-15T22:12:00Z"));
    expect(nowCardContent()).not.toContain("Pacific Standard Time");
  });

  it("the graded bytes keep their arithmetic and change only the label", () => {
    // The corpus photographed "...03:12 PM Pacific Standard Time". Same
    // instant, same wall clock; %Z is now what Ruby prints for it.
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    expect(nowCardContent()).toBe(ORACLE_CAPTURE_NOW_BYTES);
    expect(ORACLE_CAPTURE_NOW_BYTES).toBe("Monday, September 28, 2026 03:12 PM PDT");
  });
});

describe("deck time zone — configuration is explicit and fails loudly", () => {
  it("the default is the graded deck's zone, and the default keeps the graded clock", () => {
    expect(deckTimeZoneName()).toBe(DEFAULT_DECK_TIME_ZONE);
    setCaptureWallClock(CAPTURE_WALL_CLOCK_CAPTURE_INSTANT);
    expect(nowCardContent()).toBe("Monday, September 28, 2026 03:12 PM PDT");
  });

  it("reset restores the default", () => {
    setDeckTimeZone("UTC");
    expect(deckTimeZoneName()).toBe("UTC");
    resetDeckTimeZone();
    expect(deckTimeZoneName()).toBe(DEFAULT_DECK_TIME_ZONE);
  });

  it("setDeckTimeZone(undefined) restores the default", () => {
    setDeckTimeZone("UTC");
    setDeckTimeZone(undefined);
    expect(deckTimeZoneName()).toBe(DEFAULT_DECK_TIME_ZONE);
  });

  it("an unknown zone name is rejected rather than silently rendering in UTC", () => {
    // Intl resolves a zone it cannot parse by behaving as UTC, which would
    // make every timestamp quietly wrong while the code reported the name
    // nobody configured — the same class of quiet wrong answer this module
    // exists to remove.
    expect(() => setDeckTimeZone("Not/AZone")).toThrow(/not a time zone/);
    expect(() => setDeckTimeZone("   ")).toThrow(/empty/);
    // The rejected value did not land.
    expect(deckTimeZoneName()).toBe(DEFAULT_DECK_TIME_ZONE);
  });
});

describe("deck time zone — a partial date completes from today in the DECK's zone", () => {
  it("a day-only date takes its month and year from the deck zone's today", () => {
    // errors.ts#fillFromReferenceMonth reads "today" to complete a partial
    // date ("20-0405" supplies only :mday). Under the old hard-coded zone a
    // UTC deck completed it from PACIFIC's today — a different day near a
    // month boundary, and so a different month for a boundary instant.
    //
    // This instant is 2026-09-28T22:12Z: still September 28 in Los Angeles,
    // but already September 29 in Tokyo. So a Tokyo deck completing "15"
    // must land in SEPTEMBER while a Los Angeles deck lands in SEPTEMBER too
    // — pick an instant where the zones disagree on the MONTH: 2026-10-01
    // is still September 30 in Los Angeles and already October 1 in Tokyo.
    setCaptureWallClock(new Date("2026-09-30T23:30:00Z"));

    setDeckTimeZone(DEFAULT_DECK_TIME_ZONE);
    const pacific = parseRubyDateContent("20-0405");
    expect(pacific).not.toBeNull();
    expect(pacific!.toISOString().slice(0, 10)).toBe("2026-09-20");

    setDeckTimeZone("Asia/Tokyo");
    const tokyo = parseRubyDateContent("20-0405");
    expect(tokyo).not.toBeNull();
    // Tokyo's "today" is already October 1, so the day-only date completes
    // into OCTOBER. Under the hard-coded capture-host zone this deck would
    // have rendered September 20 — the defect this pins.
    expect(tokyo!.toISOString().slice(0, 10)).toBe("2026-10-20");
  });
});