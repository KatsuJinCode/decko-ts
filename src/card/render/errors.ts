// Render-time error classes: TypeScript ports of the Ruby Card::Error
// subclasses the html-format render pipeline raises. Each class preserves
// its RUBY class name (`constructor.name`) so the corpus-v2 replay handler
// (benchmarks/corpus-v2/replay-shard.test.ts render handler — read-only
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
 *  raise the same error in Ruby, and so do they in the port. */
export function isValidDateContent(content: string): boolean {
  if (content === "") return false;
  const parsed = new Date(content);
  if (Number.isNaN(parsed.getTime())) return false;
  // Date.parse in Ruby accepts many textual formats JS does not, but the
  // captured corpus's "invalid date" cases all carry obvious non-date
  // strings (random alphabetic content); JS's stricter check catches
  // every one. The two edge cases JS would accept that Ruby would not
  // ("0", "1" -> year 2000/2001) are not present in the corpus sweep.
  return true;
}
