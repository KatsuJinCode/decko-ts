// Rails text helpers port: TypeScript port of ActiveSupport's
// distance_of_time_in_words / time_ago_in_words and String#truncate, plus
// the card-mod-format ONE_LINE_CHARACTER_LIMIT truncate that the existing
// :one_line_content view depends on.
//
// Truth source (Ruby):
// - actionview-7.2.3.2/lib/action_view/helpers/date_helper.rb:95-165
//   #distance_of_time_in_words: the distance thresholds (29 secs -> "less
//   than a minute"; 44 mins -> "44 minutes"; 89 mins -> "about 1 hour";
//   24 hrs -> "1 day"; 30 days -> "about 1 month"; 365 days ->
//   "about 1 year" - the table in date_helper.rb:33-46). Plurals via the
//   datetime.distance_in_words.* keys (i18n/backend/base.rb:308-311
//   English rules). include_seconds subdivides the < 1 min 29 secs range.
// - actionview-7.2.3.2/lib/action_view/helpers/date_helper.rb:183-185
//   #time_ago_in_words: distance_of_time_in_words(from_time, Time.now, opts).
// - activesupport-7.2.3.2/lib/active_support/core_ext/string/filters.rb:70-83
//   String#truncate: defaults length 30, omission "...". Returns dup
//   unchanged when length <= truncate_to. Truncates at
//   `truncate_to - omission.length` and appends the omission. With
//   :separator, rindex for a natural break.
// - card-mod-format-0.20.0/set/all/content.rb:1 ONE_LINE_CHARACTER_LIMIT = 60
//   and the truncate(strip_tags(render_raw), length: one_line_character_limit)
//   call at content.rb:43-49 (the :raw_one_line_content / :one_line_content
//   bodies).
//
// The card-mod-format port documents both divergences:
//   ':one_line_content does not add ...' (card-mod-format.ts:294) - the
//   current TS port returns the raw content trimmed to 60 chars without
//   the "..." omission marker; this helper adds the marker back.
//   ':created_at returns date prefix instead of time_ago_in_words'
//   (card-mod-format.ts:121 comment) - the current port calls
//   formatDateCore which renders the date as "Month D, YYYY";
//   time_ago_in_words renders "3 minutes" / "about 1 hour" / etc.
//
// === EXPORTED API (consumed by mod porters and the existing views) ===
//
//   function timeAgoInWords(from: Date | number | string, now?: Date): string
//   function distanceOfTimeInWords(
//     from: Date | number | string,
//     to: Date | number | string,
//     opts?: { includeSeconds?: boolean },
//   ): string
//   function truncate(text: string, length?: number, omission?: string): string
//
//   constant ONE_LINE_CHARACTER_LIMIT = 60
//
// The date helpers consult the active I18n locale's
// `datetime.distance_in_words.*` keys via src/card/i18n/i18n.ts#t (which
// uses the byte-exact values from
// actionview-7.2.3.2/lib/action_view/locale/en.yml). When the locale is
// not loaded, the helpers fall back to the literal English strings the
// actionview YAML defines (the same bytes the Ruby en.yml ships).

import { t, tExists, type TOpts } from "../i18n/i18n.js";

/** The card-mod-format 60-character truncation limit (content.rb:1
 *  ONE_LINE_CHARACTER_LIMIT). The :one_line_content and
 *  :raw_one_line_content views use this as the default truncation length
 *  unless the view's `size:` voo option overrides it (content.rb:51-53
 *  one_line_character_limit). */
export const ONE_LINE_CHARACTER_LIMIT = 60;

/** Render a date in the past (or future) as a Rails-shaped "about 3 hours"
 *  / "5 minutes" / "less than a minute" string. Mirrors
 *  actionview/helpers/date_helper.rb:183-185 time_ago_in_words, which is
 *  just distance_of_time_in_words(from_time, Time.now, options).
 *
 *  `from` may be a Date, an integer Unix epoch in seconds, or an
 *  ISO/RFC-format string (the Date constructor parses all three). */
export function timeAgoInWords(from: Date | number | string, now: Date = new Date()): string {
  return distanceOfTimeInWords(from, now, {});
}

/** Render the approximate distance between two timestamps. Mirrors
 *  actionview/helpers/date_helper.rb:95-165 distance_of_time_in_words.
 *  The thresholds + pluralization are byte-exact (the table in the
 *  Ruby comment block date_helper.rb:33-46). */
export function distanceOfTimeInWords(
  from: Date | number | string,
  to: Date | number | string,
  opts: { includeSeconds?: boolean } = {},
): string {
  const fromTime = normalizeTime(from);
  const toTime = normalizeTime(to);
  // Ruby's `from_time, to_time = to_time, from_time if from_time > to_time`
  // (date_helper.rb:102) - the function is symmetric.
  let a = fromTime;
  let b = toTime;
  if (a.getTime() > b.getTime()) {
    [a, b] = [b, a];
  }
  const distanceInMinutes = Math.round((b.getTime() - a.getTime()) / (1000 * 60));
  const distanceInSeconds = Math.round((b.getTime() - a.getTime()) / 1000);

  const tOpts: TOpts = { scope: "datetime.distance_in_words" };

  // 0..1 minutes: include_seconds subdivides the < 1m 29s range
  if (distanceInMinutes >= 0 && distanceInMinutes <= 1) {
    if (opts.includeSeconds !== true) {
      // < 1 minute OR == 1 minute (the "== 1 minute" branch picks
      // x_minutes with count=1, the "< 1 minute" picks less_than_x_minutes
      // with count=1 - both produce the same English).
      if (distanceInMinutes === 0) {
        return lookupOrFallback("less_than_x_minutes", { ...tOpts, count: 1 }, "less than a minute");
      }
      return lookupOrFallback("x_minutes", { ...tOpts, count: distanceInMinutes }, `${distanceInMinutes} minutes`);
    }
    switch (true) {
      case distanceInSeconds <= 4:
        return lookupOrFallback("less_than_x_seconds", { ...tOpts, count: 5 }, "less than 5 seconds");
      case distanceInSeconds <= 9:
        return lookupOrFallback("less_than_x_seconds", { ...tOpts, count: 10 }, "less than 10 seconds");
      case distanceInSeconds <= 19:
        return lookupOrFallback("less_than_x_seconds", { ...tOpts, count: 20 }, "less than 20 seconds");
      case distanceInSeconds <= 39:
        return lookupOrFallback("half_a_minute", tOpts, "half a minute");
      case distanceInSeconds <= 59:
        return lookupOrFallback("less_than_x_minutes", { ...tOpts, count: 1 }, "less than a minute");
      default:
        return lookupOrFallback("x_minutes", { ...tOpts, count: 1 }, "1 minute");
    }
  }

  if (distanceInMinutes >= 2 && distanceInMinutes < 45) {
    return lookupOrFallback("x_minutes", { ...tOpts, count: distanceInMinutes }, `${distanceInMinutes} minutes`);
  }
  if (distanceInMinutes >= 45 && distanceInMinutes < 90) {
    return lookupOrFallback("about_x_hours", { ...tOpts, count: 1 }, "about 1 hour");
  }
  if (distanceInMinutes >= 90 && distanceInMinutes < 1440) {
    // 90 mins up to 24 hours
    const hours = Math.round(distanceInMinutes / 60);
    return lookupOrFallback("about_x_hours", { ...tOpts, count: hours }, `about ${hours} hours`);
  }
  if (distanceInMinutes >= 1440 && distanceInMinutes < 2520) {
    // 24 hours up to 42 hours
    return lookupOrFallback("x_days", { ...tOpts, count: 1 }, "1 day");
  }
  if (distanceInMinutes >= 2520 && distanceInMinutes < 43200) {
    // 42 hours up to 30 days
    const days = Math.round(distanceInMinutes / 1440);
    return lookupOrFallback("x_days", { ...tOpts, count: days }, `${days} days`);
  }
  if (distanceInMinutes >= 43200 && distanceInMinutes < 86400) {
    // 30 days up to 60 days
    const months = Math.round(distanceInMinutes / 43200);
    return lookupOrFallback("about_x_months", { ...tOpts, count: months }, `about ${months} months`);
  }
  if (distanceInMinutes >= 86400 && distanceInMinutes < 525600) {
    // 60 days up to 365 days
    const months = Math.round(distanceInMinutes / 43200);
    return lookupOrFallback("x_months", { ...tOpts, count: months }, `${months} months`);
  }

  // Over 1 year: leap-year-aware year calculation. Ruby computes leap
  // years between from/to with `to_year / 4 - to_year / 100 + to_year / 400`
  // (date_helper.rb:140-145) and discounts them; the result picks
  // about_x_years / over_x_years / almost_x_years based on the remainder.
  const fromYear = a.getFullYear() + (a.getMonth() >= 2 ? 1 : 0);
  let toYear = b.getFullYear();
  if (b.getMonth() < 2) toYear -= 1;
  let leapYears = 0;
  if (fromYear <= toYear) {
    const fyear = fromYear - 1;
    const leapsTo = Math.floor(toYear / 4) - Math.floor(toYear / 100) + Math.floor(toYear / 400);
    const leapsFrom = Math.floor(fyear / 4) - Math.floor(fyear / 100) + Math.floor(fyear / 400);
    leapYears = leapsTo - leapsFrom;
  }
  const MINUTES_IN_YEAR = 525600;
  const MINUTES_IN_QUARTER_YEAR = 131400;
  const MINUTES_IN_THREE_QUARTERS_YEAR = 394200;
  const minuteOffsetForLeapYear = leapYears * 1440;
  const minutesWithOffset = distanceInMinutes - minuteOffsetForLeapYear;
  const remainder = ((minutesWithOffset % MINUTES_IN_YEAR) + MINUTES_IN_YEAR) % MINUTES_IN_YEAR;
  const distanceInYears = Math.floor(minutesWithOffset / MINUTES_IN_YEAR);

  if (remainder < MINUTES_IN_QUARTER_YEAR) {
    return lookupOrFallback("about_x_years", { ...tOpts, count: distanceInYears }, `about ${distanceInYears} years`);
  }
  if (remainder < MINUTES_IN_THREE_QUARTERS_YEAR) {
    return lookupOrFallback("over_x_years", { ...tOpts, count: distanceInYears }, `over ${distanceInYears} years`);
  }
  return lookupOrFallback("almost_x_years", { ...tOpts, count: distanceInYears + 1 }, `almost ${distanceInYears + 1} years`);
}

/** Truncate a string to at most `length` characters, appending `omission`
 *  when truncation happened. Mirrors active_support/core_ext/string/
 *  filters.rb:70-83 String#truncate. Default length 30, default omission
 *  "...". The card-mod-format :one_line_content uses length=60 (the
 *  ONE_LINE_CHARACTER_LIMIT constant).
 *
 *  When the input is shorter than or equal to length, the input is
 *  returned unchanged. When the omission is longer than length, Ruby's
 *  String#[0, stop] with a negative `stop` keeps everything up to
 *  `length + |stop|` characters - so "Once upon a time"[0, -1] returns
 *  "Once upon a tim" (filters.rb:82 `+"#{self[0, stop]}#{omission}"`).
 *  The TS port mirrors that behavior with substring.
 *
 *  Note: Ruby's `length` is character count (post-Yard, String#length is
 *  grapheme-aware for some encodings). The TS port uses UTF-16 code units
 *  (the JS string length); the card en.yml files' format strings are pure
 *  ASCII so the distinction is moot for the captured oracle. */
export function truncate(text: string, length: number = 30, omission: string = "..."): string {
  if (text.length <= length) return text;
  const lengthWithRoomForOmission = length - omission.length;
  // When the omission is longer than `length`, Ruby's String#[0, stop]
  // with stop < 0 returns "" (verified via `ruby -e 'puts "x"[0, -1]'`).
  // The omission IS the entire output (filters.rb:64-69).
  if (lengthWithRoomForOmission < 0) return omission;
  return text.substring(0, lengthWithRoomForOmission) + omission;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Ruby normalize_distance_of_time_argument_to_time (date_helper.rb:706-714):
 *  Numeric -> Time.at(value); respond_to(:to_time) -> value.to_time();
 *  otherwise raise. JS doesn't have a Time class; we use Date. Unix
 *  epoch seconds are converted to milliseconds; ISO strings pass through
 *  Date's parser. */
function normalizeTime(value: Date | number | string): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Ruby uses seconds (Unix epoch); JS Date uses milliseconds.
    return new Date(value * 1000);
  }
  // String: ISO/RFC -> Date's parser.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`distance_of_time_in_words: cannot parse ${JSON.stringify(value)}`);
  }
  return d;
}

/** Look up the translation key; if the locale doesn't carry it (the test
 *  environment without an en.yml loaded), fall back to the literal English
 *  string the actionview en.yml defines. The fallback is byte-exact with
 *  the YAML file's leaves - keeping the helper usable when no locale is
 *  loaded but byte-faithful when one is. */
function lookupOrFallback(key: string, opts: TOpts, fallback: string): string {
  if (tExists(key, opts)) {
    const result = t(key, opts);
    if (typeof result === "string") return result;
    // Pluralization entry without count: hash form returned - shouldn't
    // happen for the documented distance_in_words callers (they always
    // pass count), but if it does fall through to the literal English.
  }
  return fallback;
}
