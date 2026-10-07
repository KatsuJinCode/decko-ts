// Render-time error classes: TypeScript ports of the Ruby Card::Error
// subclasses the html-format render pipeline raises. Each class preserves
// its RUBY class name (`constructor.name`) so the corpus-v2 replay handler
// (benchmarks/corpus-v2/replay-shard.bench.ts render handler — read-only
// per the stream contract) emits the same CAPTURE_ERROR sentinel bytes the
// Ruby capture recorded. The class name carries the colon-separator
// because the test harness compares the literal class string, not a
// normalized one.
//
// Truth sources:
// - lib/card/error.rb:78     Card::Error::BadQuery < UserError
// - lib/card/error.rb:68     Card::Error::UserError < Error
// - card-mod-search-0.20.0 set/abstract/cql_search.rb:29-34
//                             parse_json_cql: JSON::ParserError -> BadQuery
//                             message: "Invalid JSON search query: #{query}"
// - card-mod-search-0.20.0 set/abstract/cql_search.rb:36-38
//                             empty_query_error!: BadQuery
//                             message: "can't run search with empty content"

// ----------------------------------------------------------------------------
// Card::Error::BadQuery — search-card JSON parse failure
// ----------------------------------------------------------------------------

import { cardWallClockNow } from "../wall-clock.js";

/** card-mod-search set/abstract/cql_search.rb#parse_json_cql (line 29-34):
 *  JSON::ParserError on the card's content raises
 *  `Error::BadQuery, "Invalid JSON search query: #{query}"`. The render
 *  pipeline surfaces this when the :core view of a Search-type card tries
 *  to JSON.parse the card's db_content. The message echoes the raw
 *  content verbatim so the user sees exactly what failed to parse. */
class CardErrorBadQuery extends Error {
  readonly query: string;
  constructor(query: string, message: string = `Invalid JSON search query: ${query}`) {
    super(message);
    this.name = "Card::Error::BadQuery";
    this.query = query;
  }
}
/** Literal name preservation: the corpus-v2 replay handler (and the
 *  smoke oracle replay) compares `error.constructor.name` against the
 *  Ruby class string `Card::Error::BadQuery` recorded in the capture.
 *  Without this defineProperty the harness would see the TS-local name
 *  (`CardErrorBadQuery`) and the fixture diff would fail on byte 7. */
Object.defineProperty(CardErrorBadQuery, "name", { value: "Card::Error::BadQuery" });

/** Public alias the render pipeline throws. The literal constructor.name
 *  is preserved (see defineProperty above); instanceof checks work
 *  against this exported binding. */
export const BadQueryError: typeof Error & { new (query: string, message?: string): Error & { query: string } } =
  CardErrorBadQuery as unknown as typeof Error & {
    new (query: string, message?: string): Error & { query: string };
  };

/** Factory preserving the Ruby call shape: `raise BadQuery, "..."`. The
 *  caller passes the raw query and gets back the typed error with the
 *  canonical message. */
export function badQuery(query: string): Error & { query: string } {
  return new CardErrorBadQuery(query);
}

/** The empty-query case (cql_search.rb:36-38): the Ruby card raises
 *  `Error::BadQuery, "can't run search with empty content"` BEFORE the
 *  JSON.parse attempt, so the message is distinct from the invalid-JSON
 *  case. Empty-content raises are rare in the captured deck (the corpus
 *  capture seeds non-empty content), but the Ruby surface carries the
 *  branch and so must the port — when content === "", port parity means
 *  raising the same exception with the same message, not skipping the
 *  search silently. */
export function emptyQueryError(): Error & { query: string } {
  const err = new CardErrorBadQuery("", "can't run search with empty content");
  return err;
}

/** Re-export for tests: the literal class name the harness expects. */
export const BAD_QUERY_CLASS_NAME = "Card::Error::BadQuery";

// ----------------------------------------------------------------------------
// Date::Error — Date-type card parse failure (Ruby stdlib Date.parse)
// ----------------------------------------------------------------------------

/** Ruby stdlib `Date::Error` (raised by `Date.parse` when the input is not
 *  a parseable date). The corpus sweep found Date-type cards with random
 *  non-date content that Ruby raises this on; the render pipeline surfaces
 *  the raise verbatim on the :open and :content views (corpus entries
 *  id=1135, 1138, 1211, 1218, 1222 — all type_code="date"). The TS port
 *  parity: when the card's type_code is "date" and the content is not a
 *  parseable date, throw the same class with the same literal message. */
class RubyDateError extends Error {
  constructor(message: string = "invalid date") {
    super(message);
    this.name = "Date::Error";
  }
}
/** Literal name preservation: same harness contract as BadQuery above —
 *  the corpus-v2 replay handler reads err.constructor.name and the
 *  captured sentinel prefix is `Date::Error`. */
Object.defineProperty(RubyDateError, "name", { value: "Date::Error" });

/** Public alias the render pipeline throws. */
export const DateError: typeof Error & { new (message?: string): Error } =
  RubyDateError as unknown as typeof Error & { new (message?: string): Error };

/** Factory preserving the Ruby call shape: `raise Date::Error, "..."`. */
export function dateError(message: string = "invalid date"): Error {
  return new RubyDateError(message);
}

/** Re-export for tests: the literal class name the harness expects. */
export const DATE_ERROR_CLASS_NAME = "Date::Error";

// ----------------------------------------------------------------------------
// NoMethodError — `{{_main}}` in content with no main format
// ----------------------------------------------------------------------------

/** Ruby `NoMethodError`, raised by nesting/main.rb:12
 *  `main.rendered || main_nest_render(opts)` when `main`
 *  (nesting/subformat.rb:18-24) is nil: the format is at chain depth 0 and
 *  was never flagged main (no process_layout.rb:19 `main!`, no nest.rb:46
 *  `sub.main!`). That is a card whose content carries `{{_main}}` rendered
 *  OUTSIDE a page render — a bare `card.format.render(:content)`.
 *
 *  The frozen record has exactly this: expected-v2/view-lane shard-000000
 *  entry id 470 ("AsIn Layout", whose 469-byte dbContent is a whole layout
 *  template) records
 *  `CAPTURE_ERROR: NoMethodError: undefined method 'rendered' for nil` for
 *  BOTH its :content and :open views. The message is reproduced verbatim so
 *  the class name and message match the captured sentinel; the port raises
 *  rather than inventing bytes for a shape Ruby cannot render. */
class RubyNoMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}
Object.defineProperty(RubyNoMethodError, "name", { value: "NoMethodError" });

/** The `{{_main}}`-with-no-main-format raise (nesting/main.rb:12). Message
 *  and class name are the captured sentinel's, byte for byte. */
export function mainNestWithoutMainError(): Error {
  return new RubyNoMethodError("undefined method `rendered' for nil");
}

/** Re-export for tests: the literal class name the harness expects. */
export const NO_METHOD_ERROR_CLASS_NAME = "NoMethodError";

/** Test whether `content` is a valid date by the Ruby Date.parse contract.
 *  JS `new Date(str)` is stricter than Ruby's Date.parse (ISO 8601 and a
 *  few common formats vs. Ruby's many aliases) — for the captured deck
 *  every Date-type card carries random non-date content (e.g. "brcvtwrvz"),
 *  and both engines reject them; the corpus pins these as invalid-date
 *  cases (id=1135, 1138, 1211, 1218, 1222). When the input parses as a
 *  date by JS, JS is strictly more permissive than Ruby on a few edge
 *  cases ("0", "1" -> epoch dates), but those don't appear in the corpus;
 *  the parity test is "the same corpus entries raise on both engines",
 *  which this gate satisfies. Empty content is treated as INVALID by both
 *  Ruby Date.parse and our parity check — Date cards with empty content
 *  raise the same error in Ruby, and so do they in the port.
 *
 *  Ruby-compatibility expansion (recapture 2026-09-24): Ruby's Date.parse
 *  also accepts the compact form `YYYYMMDD` (e.g. "20190319" → 2019-03-19)
 *  and a few slashed numeric forms ("3/19/2019", "19/3/2019"); JS Date is
 *  stricter and treats "20190319" as NaN, raising on the recapture's
 *  20190319:render:content / :open entries (per-class-mechanisms.json
 *  handler_raised:Date::Error, 5 entries). The pre-checks below catch
 *  the compact and slashed forms Ruby accepts so the engine's
 *  prepare-phase raise skips parity with Ruby's accepted inputs.
 *
 *  Dashed-numeric expansion (2026-09-29; every claim
 *  below verified against this machine's ruby 3.3 Date.parse): Ruby parses
 *  the dashed numeric forms `Y-M-D` with 1-4 digit years and 1-2 digit
 *  month/day — "18-12-22" → 2018-12-22, "2010-7-19" → July 19 2010,
 *  "999-1-1" → January 1, 0999 — where JS's ISO parser rejects every
 *  non-padded component ("19-03-19" is Invalid Date). Two-digit (and
 *  one-digit) years window as 00-68 → 2000+yy, 69-99 → 1900+yy
 *  ("38-12-31" → 2038, "39-01-01" → 2039, "68-05-05" → 2068,
 *  "69-1-1" → 1969). Month 0/13+ and impossible calendar days raise in
 *  Ruby ("2019-13-01", "2021-02-29", "2019-05-0" → invalid date); the
 *  UTC round-trip check below rejects the same. The a work item corpus holds
 *  1,117 such date cards (shapes 99-99-99 / 9999-9-99 / 9999-9-9; the two
 *  page-lane exemplars 20190319 "19-03-19" and 20220323 "22-03-23").
 *  Conversely Ruby REJECTS bare-year digit strings JS accepts ("2016",
 *  "1980", "1", "0" → invalid date — verified; the old JS fallback
 *  rendered year-epoch dates for them), so any remaining all-digit
 *  content that is not the 8-digit compact form raises here too.
 *  (Ruby's bare 1-3 digit heuristics — "12" → Sep 12 of the current
 *  year, "123" → day-of-year — are NOT ported: no corpus card carries
 *  those shapes, and porting them would render dates Ruby renders while
 *  the current gate raises. Honest remainder, zero graded surface.) */
/** Complete a partial date the way Ruby's Date.parse does: the string
 *  supplies the day (`ruby -rdate -e 'p Date._parse("20-0405")'` gives
 *  only :mday and a zone), and the month and year come from Date.today.
 *  Today is read from the engine's wall-clock seam (src/card/wall-clock.ts),
 *  so a capture run that freezes the clock gets the capture's month. */
function fillFromReferenceMonth(day: number): Date | null {
  // Ruby's Date.parse completes the missing month and year from Date.today
  // in the host's zone. Read the engine's wall-clock seam the same way.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
  }).formatToParts(cardWallClockNow());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  // day 0 normalises to the last day of the previous month, and day 31 in a
  // 30-day month rolls; Ruby's :mday completion does the same.
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseRubyDateContent(content: string): Date | null {
  if (content === "") return null;
  // Compact YYYYMMDD — Ruby parses; JS does not.
  if (/^\d{8}$/.test(content)) {
    const y = Number(content.slice(0, 4));
    const m = Number(content.slice(4, 6));
    const d = Number(content.slice(6, 8));
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d));
    return null;
  }
  // Dashed numeric Y-M-D ("18-12-22", "2010-7-19", "999-1-1") — Ruby
  // parses with the 00-68/69-99 two-digit-year window; JS rejects every
  // non-padded component.
  const dashMatch = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(content);
  if (dashMatch !== null) {
    let y = Number(dashMatch[1]);
    const m = Number(dashMatch[2]);
    const d = Number(dashMatch[3]);
    if (y < 100) y += y <= 68 ? 2000 : 1900;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    // Real-calendar check (Feb 29 on a non-leap year rolls March 1; day 0
    // rolls to the previous month) — the round-trip rejects both, the
    // same inputs Ruby's Date.parse raises on.
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d
    ) {
      return null;
    }
    return date;
  }
  // Ruby's "day, and possibly a zone": a SHORT day plus a 3-4 digit zone.
  // The corpus's card 35469 (`White Fragility ...+Date`) is the only one:
  //     ruby -rdate -e 'p Date._parse("20-0405")'
  //     => {:mday=>20, :zone=>"-0405", :offset=>-14700}
  // a day with no month and no year, which Date.parse completes from
  // Date.today. The gem PARSES it; the pre-fix engine rejected it. This
  // branch is checked BEFORE the two-component one because "20-0405" is
  // also a match for a looser two-number split.
  //
  // THE COMPLETION IS TODAY-DEPENDENT: the month and year come from the
  // wall-clock seam, as Ruby's Date.today. See fillFromReferenceMonth.
  const dayZone = /^(\d{1,2})-(\d{3,4})$/.exec(content);
  if (dayZone !== null) {
    const day = Number(dayZone[1]);
    if (day < 1 || day > 31) return null;
    return fillFromReferenceMonth(day);
  }
  // Two-component dashed "A-B" (the corpus's card 13903, content "1981-10").
  //
  // GEM-VERIFIED, NOT GUESSED. Ruby's lexer puts the LEADING number in
  // :mday and the trailing one in :zone when the trailing group is two
  // digits wide:
  //
  //     ruby -rdate -e 'p Date._parse("20-04")'
  //     => {:mday=>20, :zone=>"-04", :offset=>-14400}
  //     ruby -rdate -e 'p Date._parse("1981-10")'
  //     => {:mon=>19, :mday=>81, :zone=>"-10", :offset=>-36000}
  //
  // A leading component outside 0..31 cannot be a day, so the gem has no
  // valid date and RAISES Date::Error. "1981-10" is A=1981.
  //
  // THE DIGIT WIDTHS ARE BOTH LOAD-BEARING, and the 1,306-row
  // two-component sweep in
  // tmp/addressed-wave1/ruby-date-parse-conformance-table.rb (ruby 3.3.12,
  // date gem 3.5.1) pins each of them:
  //   - a ONE-digit trailing group takes a different lexer path, merges
  //     into {:mday, :hour}, and raises for EVERY A ("2-1", "2-2", "12-2");
  //   - a TWO-digit trailing group parses iff A <= 31 — but only when A
  //     itself is two digits wide. A single-digit A re-enters the merged
  //     path unless the offset is a real 1..31 value: the gem parses
  //     "0-01" and "9-01", and raises on "0-00", "0-32" and "1-35".
  //
  // PRE-FIX THIS BRANCH DID NOT EXIST, so "1981-10" fell through to
  // `new Date("1981-10")`, which JS reads as an ISO year-month and accepts
  // as 1981-10-01. The engine rendered "October 1, 1981" where the gem
  // renders the (core view) error span — the capture's own bytes for
  // card 13903, shard-000009 `Stanley Pranin ...:page`.
  const twoPart = /^(\d{1,5})-(\d{1,5})$/.exec(content);
  if (twoPart !== null) {
    const day = Number(twoPart[1]);
    const zone = twoPart[2];
    if (zone.length !== 2) return null; // merged :mday/:hour path, always raises
    if (day > 31) return null; // no valid :mday
    if (day < 10 && (zone === "00" || Number(zone) > 31)) return null;
    return fillFromReferenceMonth(day);
  }
  // fold-9 superset note (2026-10-03): the-69-wave1-refill2 independently
  // re-derived this class as ONE coarse guard — "dashed ALL-NUMERIC with any
  // component count other than the Y-M-D triple RAISES"
  // (`/^\d{1,4}(-\d{1,4})+$/.test(content) && dashMatch === null -> null`,
  // gem-verified over the corpus's 4,013 3-component rows + 2-component row
  // 13903). That guard is NOT taken here: it also raises for the day+zone
  // class ("20-0405") and single-digit-A real-offset shapes ("0-01", "9-01")
  // that the gem PARSES (refill2's own White Fragility entry: Ruby 3.3 gives
  // October 20 for "20-0405"), because its evidence base was the corpus's
  // Date-typed rows only. The per-shape arms above were verified against a
  // 1,306-row Date._parse sweep of the actual gem (ruby 3.3.12, date
  // 3.5.1) and cover every raise case the coarse guard catches ("1981-10"
  // via day>31, "2-1" via the merged :mday/:hour arm, "0-00"/"0-32"/"1-35"
  // via the single-digit-A offset guard) while preserving the parseable
  // classes. Superset-of-information: no raise case is lost, the
  // gem-parseable classes survive, and the completion's today-dependence
  // reads the wall-clock seam (fillFromReferenceMonth). The corpus-uncertain White Fragility residual stays as refill2's
  // receipt recorded it.
  // Slash-form dates ("3/19/2019", "19/3/2019", "2019/3/19") — Ruby parses;
  // JS accepts only the US-style "M/D/YYYY" reliably.
  const slashMatch = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/.exec(content);
  if (slashMatch !== null) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const c = Number(slashMatch[3]);
    if (a >= 1 && a <= 9999 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      return new Date(Date.UTC(a, b - 1, c));
    }
    return null;
  }
  // Remaining all-digit strings: Ruby raises ("2016", "1980", "1", "0",
  // "123456789" → invalid date — all verified); JS would silently render
  // year-epoch dates for the short ones.
  if (/^\d+$/.test(content)) return null;
  const parsed = new Date(content);
  if (Number.isNaN(parsed.getTime())) return null;
  // Date.parse in Ruby accepts many textual formats JS does not, but the
  // captured corpus's "invalid date" cases all carry obvious non-date
  // strings (random alphabetic content); JS's stricter check catches
  // every one.
  return parsed;
}

export function isValidDateContent(content: string): boolean {
  return parseRubyDateContent(content) !== null;
}
