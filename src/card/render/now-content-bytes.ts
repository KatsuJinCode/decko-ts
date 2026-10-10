// Self::Now's `def content` bytes — card-mod-date-0.20.0 set/self/now.rb:1-3,
// `I18n.localize(Time.now, format: :card_dayofwk_min_tz)`.
//
// The en.yml:29 format string is '%A, %B %d, %Y %I:%M %p %Z', rendered in
// the capture deck's environment: America/Los_Angeles wall time with the
// Windows %Z display name "Pacific Standard Time" (standard spelling even
// in DST — the capture-host zone census in
// set-module-content-overrides.ts#ORACLE_DECK_TIME_ZONE). The instant comes
// from the injectable capture wall clock (the graded corpus freezes it;
// CAPTURE_FROZEN_CLOCK=2026-09-19T12:00:00Z renders "Saturday, September
// 19, 2026 05:00 AM Pacific Standard Time" — the *now page pin).
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

/** The Self::Now content bytes at the current capture wall-clock instant. */
export function nowCardContent(): string {
  const date = cardWallClockNow();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return (
    `${get("weekday")}, ${get("month")} ${get("day")}, ${get("year")} ` +
    `${get("hour")}:${get("minute")} ${get("dayPeriod")} Pacific Standard Time`
  );
}
