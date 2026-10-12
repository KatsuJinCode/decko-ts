// The page-lane replay's configured origin, as the TEST CONFIGURATION the
// replay suites install.
//
// WHAT THIS VALUE IS. Page-lane renders are graded bytes that carry the deck's
// configured `Cardio.config.deck_origin`: every page byte, including the
// origin-absolute `card_url` output the :url / :id_url views and the email
// templates pin. View-lane renders happen outside that configuration, so their
// bytes carry the requestless relative form (`decko.rootUrl='/'`).
//
// The engine used to answer those page bytes from a hard-coded module
// constant (src/card/render/deck-origin.ts `DECK_ORIGIN`) — one deck's
// identity baked into every deployment's engine. That constant is GONE from
// src/: the origin is the deck's configured `Cardio.config.deck_origin`
// now, read through setDeckEnvironment — the same channel the reference
// implementation reads.
//
// So a suite that replays page-lane bytes installs this configuration, and a
// suite that replays view-lane bytes installs nothing (the requestless ""
// answer comes with no deck_origin and no controller). The value lives in
// test configuration, never in src/ — the shipped engine answers ""
// (relative URLs) until ITS operator configures an origin.

import { setDeckEnvironment } from "../../../src/card/render/deck-origin.js";

/** The page-lane `Cardio.config.deck_origin`, without a
 *  trailing slash — the shape `Env.origin` has and `card_url` prefixes. */
export const CAPTURE_PAGE_LANE_DECK_ORIGIN = "https://culturesmith.com";

/** The head's `decko.rootUrl` byte for a page-lane render: origin + slash
 *  (page.ts appends it; the head render is `card_url("")`). */
export const CAPTURE_PAGE_LANE_ROOT_URL = "decko.rootUrl='https://culturesmith.com/';";

/** Install the page-lane configuration. Pair with
 *  `resetDeckEnvironmentForViewLane()` in afterAll — the setting
 *  is process-wide module state, and the view-lane bytes must never render
 *  under a configured origin. */
export function installCapturePageLaneOrigin(): void {
  setDeckEnvironment({ origin: CAPTURE_PAGE_LANE_DECK_ORIGIN });
}

/** Restore the unconfigured (requestless) state. */
export function resetDeckEnvironmentForViewLane(): void {
  setDeckEnvironment(undefined);
}

/** Run `fn` under the page-lane configuration, restored after.
 *  A suite that mixes lanes wraps only its page-lane
 *  renders in this; its view-lane renders must run unconfigured. */
export async function withCapturePageLaneOrigin<T>(fn: () => Promise<T>): Promise<T> {
  installCapturePageLaneOrigin();
  try {
    return await fn();
  } finally {
    resetDeckEnvironmentForViewLane();
  }
}
