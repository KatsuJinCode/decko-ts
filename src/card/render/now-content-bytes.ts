// Self::Now's `def content` bytes — card-mod-date-0.20.0 set/self/now.rb:1-3,
// `I18n.localize(Time.now, format: :card_dayofwk_min_tz)`.
//
// The en.yml:29 format string is '%A, %B %d, %Y %I:%M %p %Z'. Both the
// WALL-CLOCK ZONE and the %Z LABEL now come from the deck's configured time
// zone (src/card/deck-time-zone.ts), not from the capture host's operating
// system: the zone the instant is rendered in is the deck's, and the
// abbreviation is computed from that zone and offset, so a daylight-time
// instant reads "PDT" where it used to read the Windows display name
// "Pacific Standard Time" (see that module's header for why the display
// name was wrong half the year). The instant
// comes from the injectable capture wall clock (the graded corpus freezes
// it; CAPTURE_FROZEN_CLOCK=2026-09-19T12:00:00Z renders "Saturday,
// September 19, 2026 05:00 AM PDT" in the graded deck's zone).
//
// This is a leaf module on purpose: the loader-less render boot carries no
// content-override registry (the mod-loader composition is not loaded
// there), and set-module-content-overrides.ts — whose SELF_MODULE_CHAINS
// table derives the same bytes — imports the mod-loader barrel, so the
// render path (format.ts renderRaw) consulting that table directly would
// close an import cycle. The renderRaw consult names this module instead;
// the rest of the SELF_MODULE_CHAINS rows (version/alerts/foot/mod/
// bootstrap_*) stay unwired — the graded corpus renders those cards'
// stored dbContent bytes and only *now is pinned virtual.

import { cardWallClockNow } from "../wall-clock.js";
import { deckTimeZoneName, formatCardDayofwkMinTz } from "../deck-time-zone.js";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The Self::Now content bytes at the current capture wall-clock instant, in
 *  the DECK's configured zone. */
export function nowCardContent(): string {
  return formatCardDayofwkMinTz(cardWallClockNow(), deckTimeZoneName());
}
