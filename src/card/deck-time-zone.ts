// The deck's configured time zone, and the %Z abbreviation derived from it.
//
// WHY THIS EXISTS. Ruby's date rendering reads
// `Time.zone` — the deck's own Rails `config.time_zone` — and `%Z` renders
// the zone's abbreviation AT THAT INSTANT: "PST" in standard time, "PDT" in
// daylight time. Earlier revisions of the port instead hard-coded the
// operating-system zone of whatever machine produced the reference
// material, and its operating system's DISPLAY NAME:
//
//   - src/card/render/now-content-bytes.ts:54,67
//   - src/card/render/errors.ts:199
//   - src/card/set-module-content-overrides.ts:55-124
//
// all named `America/Los_Angeles` and the literal string "Pacific Standard
// Time". Two defects in one:
//
//   1. THE ZONE IS NOT THE DECK'S. It was whatever zone the machine that
//      produced the reference material was set to. A deck configured for
//      Europe/Berlin rendered Pacific wall-clock times.
//   2. THE LABEL IS A WINDOWS DISPLAY NAME, not an abbreviation, and it is
//      wrong in daylight time. A September (PDT) instant labelled "Pacific
//      STANDARD Time" is a category error: such a label appears only because
//      Windows zone display names use standard spelling year-round. The two
//      readings sit side by side — `time_zone_name` is Ruby's
//      `Time.zone.name` (the DECK's setting) and `time_now_zone` is
//      `Time.now.zone` (the OS-local zone of the machine). The port
//      conflated them.
//
// The zone is now the DECK's, read through this module, and the abbreviation
// is COMPUTED from the zone and the instant's offset, so a PDT instant says
// "PDT" and a PST instant says "PST" — which is what Ruby's `%Z` does.
//
// THE DEFAULT IS "UTC" — location-neutral, and the neutral choice for a
// published package. Naming a US West Coast zone as the out-of-the-box
// default is a location hint that carries no engineering meaning.
//
// WHAT THE DEFAULT DOES NOT CHANGE. A deployment or a fixture that
// configures a different zone gets that zone. Reproducing one host's
// recorded rendering is an explicit act — set that zone on purpose — and it
// is not what an unconfigured engine should do.

/** The deck's default zone: UTC, location-neutral. */
export const DEFAULT_DECK_TIME_ZONE = "UTC";

/** A named, non-default zone for callers that deliberately reproduce a
 *  particular host's local readings (`Time.now.zone` is an OS-local value,
 *  not a deck setting, so anything asserting against it must set this
 *  explicitly instead of inheriting a geography from the engine's default).
 *  The host in question is wherever the recorded reference bytes were
 *  produced; reproducing those bytes means setting this zone on purpose. */
export const RECORDED_HOST_TIME_ZONE = "America/Los_Angeles";

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