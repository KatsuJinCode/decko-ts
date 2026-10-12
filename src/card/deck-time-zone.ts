// The deck's configured time zone, and the %Z abbreviation derived from it.
//
// WHY THIS EXISTS. Ruby's date rendering reads
// `Time.zone` — the deck's own Rails `config.time_zone` — and `%Z` renders
// the zone's abbreviation AT THAT INSTANT: "PST" in standard time, "PDT" in
// daylight time. The port instead hard-coded the CAPTURE HOST's operating-
// system zone and its operating system's DISPLAY NAME:
//
//   - src/card/render/now-content-bytes.ts:54,67
//   - src/card/render/errors.ts:199
//   - src/card/set-module-content-overrides.ts:55-124 (ORACLE_DECK_TIME_ZONE)
//
// all named `America/Los_Angeles` and the literal string "Pacific Standard
// Time". Two defects in one:
//
//   1. THE ZONE IS NOT THE DECK'S. It is whatever zone the machine that
//      happened to photograph the corpus was set to. A deck configured for
//      Europe/Berlin rendered Pacific wall-clock times.
//   2. THE LABEL IS A WINDOWS DISPLAY NAME, not an abbreviation, and it is
//      wrong in daylight time. A September (PDT) instant labelled "Pacific
//      STANDARD Time" is a category error: the captured corpus carries it
//      only because the capture host was Windows, whose zone display names
//      use standard spelling year-round. `fixtures/captured/
//      date-overrides.json` records the host's own readings side by side:
//      `time_zone_name: "UTC"` (Ruby's `Time.zone.name` — the DECK's setting)
//      against `time_now_zone: "Pacific Standard Time"` (`Time.now.zone` —
//      the OS-local zone of the capture machine). The port conflated them.
//
// The zone is now the DECK's, read through this module, and the abbreviation
// is COMPUTED from the zone and the instant's offset, so a PDT instant says
// "PDT" and a PST instant says "PST" — which is what Ruby's `%Z` does.
//
// THE DEFAULT IS "UTC" — the zone the captured deck was actually CONFIGURED
// for. `fixtures/captured/date-overrides.json` records the capture host's own
// two readings side by side: `time_zone_name: "UTC"` (Ruby's `Time.zone.name`
// — the DECK's setting) against `time_now_zone: "Pacific Standard Time"`
// (`Time.now.zone` — the OS-local zone of the machine that took the
// photographs). So a Pacific default was never the deck's zone; it was the
// capture host's, hard-coded into the engine's default. Naming a US West
// Coast zone as the out-of-the-box default is also a location hint about the
// capture, which a published package should not carry.
//
// WHAT THE DEFAULT DOES NOT CHANGE. The corpus's captured bytes still read
// "03:12 PM PDT" because that is what the host rendered, and GRADED tests
// reproduce the host's reading by SETTING this zone explicitly — through
// `setDeckTimeZone(CORPUS_CAPTURE_TIME_ZONE)` or the fixtures that already
// do. Reproducing a capture is an explicit act; it is not what an
// unconfigured engine should do. A deployment or a fixture that configures a
// different zone gets that zone.

/** The zone the captured deck was configured for — the default. UTC is
 *  location-neutral and is what the capture recorded as `Time.zone.name`
 *  (fixtures/captured/date-overrides.json). */
export const DEFAULT_DECK_TIME_ZONE = "UTC";

/** The zone the CORPUS CAPTURE HOST rendered in — `Time.now.zone`, which
 *  `fixtures/captured/date-overrides.json` records as "Pacific Standard
 *  Time". This is NOT a deck setting and NOT a default: it is named here so
 *  the tests that reproduce captured bytes can say so explicitly instead of
 *  inheriting a host's geography from the engine's default. */
export const CORPUS_CAPTURE_TIME_ZONE = "America/Los_Angeles";

let deckTimeZone: string = DEFAULT_DECK_TIME_ZONE;

/** The deck's configured time zone (an IANA zone name). Every timestamp the
 *  render path formats reads it through here rather than naming a zone. */
export function deckTimeZoneName(): string {
  return deckTimeZone;
}

/** Configure the deck's time zone. Passing undefined restores
 *  DEFAULT_DECK_TIME_ZONE. An unrecognised zone name is REJECTED loudly
 *  rather than silently falling back: a typo'd zone would otherwise render
 *  every timestamp in UTC (what Intl does with a zone it cannot resolve)
 *  while reporting a zone name nobody configured — the same class of quiet
 *  wrong answer this module exists to remove. */
export function setDeckTimeZone(zone: string | undefined): void {
  if (zone === undefined) {
    deckTimeZone = DEFAULT_DECK_TIME_ZONE;
    return;
  }
  const trimmed = zone.trim();
  if (trimmed.length === 0) {
    throw new Error(`setDeckTimeZone: the zone name is empty`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
  } catch {
    throw new Error(
      `setDeckTimeZone: "${trimmed}" is not a time zone this runtime knows. ` +
        `Pass an IANA zone name (e.g. "Europe/Berlin", "UTC").`,
    );
  }
  deckTimeZone = trimmed;
}

/** Restore the graded deck's zone (test isolation). */
export function resetDeckTimeZone(): void {
  deckTimeZone = DEFAULT_DECK_TIME_ZONE;
}

/** The `%Z` abbreviation for `instant` in `zone` — Ruby's `Time#zone` as a
 *  strftime field renders it.
 *
 *  DERIVED FROM THE ZONE AND THE INSTANT'S OFFSET, which is the whole point:
 *  a September instant in America/Los_Angeles is "PDT" and a January one is
 *  "PST". Intl's short form resolves the zone's own DST rules for that
 *  instant, so this is a computation over the zone data rather than a
 *  literal — the Windows display-name string this replaces was wrong for
 *  half the year on any host. */
export function zoneAbbreviation(instant: Date, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(instant);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** `%A, %B %d, %Y %I:%M %p %Z` — card-1.110.0 config/locales/en.yml:29's
 *  `card_dayofwk_min_tz`, which is the format
 *  `I18n.localize(time, format: :card_dayofwk_min_tz)` applies.
 *
 *  Rendered in the deck's configured zone, with the abbreviation computed
 *  from that zone. `zone` defaults to the deck's configured zone; passing it
 *  explicitly is what lets one call site format the same instant in two
 *  zones without disturbing the deck-wide setting. */
export function formatCardDayofwkMinTz(
  instant: Date,
  zone: string = deckTimeZone,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(instant);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  // en-US 2-digit hour12 gives "01".."12" — Ruby's %I padding matches.
  return (
    `${get("weekday")}, ${get("month")} ${get("day")}, ${get("year")} ` +
    `${get("hour")}:${get("minute")} ${get("dayPeriod")} ${zoneAbbreviation(instant, zone)}`
  );
}