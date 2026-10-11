// The page-lane capture's configured origin, as the TEST CONFIGURATION the
// replay suites install.
//
// WHAT THIS VALUE IS. The dual-lane capture script assigns
// `Cardio.config.deck_origin` around the page lane and restores it after
// (tools/oracle/capture-dual-lane-page-and-view.rb:391-400 — assignment at
// :395, restore in the ensure), so every graded PAGE-lane byte carries that
// origin: `decko.rootUrl='https://culturesmith.com/'` on 6588/6588 page
// rows, the origin-absolute `card_url` output the :url / :id_url views and
// the email templates pin. The VIEW lane renders OUTSIDE that block, so its
// bytes carry the requestless relative form (`decko.rootUrl='/'`, cards
// 34754 / 34758).
//
// The engine used to answer those page bytes from a hard-coded module
// constant (src/card/render/deck-origin.ts `DECK_ORIGIN`) — one deck's
// identity baked into every deployment's engine. The constant is GONE from
// src/: the origin is the deck's configured `Cardio.config.deck_origin`
// now, read through setDeckEnvironment — the same channel Ruby reads and
// the same channel the capture script itself used.
//
// So a suite that replays PAGE-lane bytes installs the capture's
// configuration — this file — exactly as the capture script did, and a
// suite that replays VIEW-lane bytes installs nothing (the requestless ""
// Ruby answers with no deck_origin and no controller). The value lives in
// test configuration and the excluded runbook
// (deploy/bunny-edge-trial-runbook.md section 3b), never in src/ — the
// shipped engine answers "" (relative URLs) until ITS operator configures
// an origin.
//
// The same value also rides the deployment fixture
// (tests/deploy/fixtures/production-deck-served-deltas.ts `deckOrigin`),
// which is what the edge suites configure when they assert that deck's
// served bytes.

import { setDeckEnvironment } from "../../../src/card/render/deck-origin.js";

/** The capture script's page-lane `Cardio.config.deck_origin`, without a
 *  trailing slash — the shape `Env.origin` has and `card_url` prefixes. */
export const CAPTURE_PAGE_LANE_DECK_ORIGIN = "https://culturesmith.com";

/** The head's `decko.rootUrl` byte for a page-lane render: origin + slash
 *  (page.ts appends it; head_javascript.rb:35 is `card_url("")`). */
export const CAPTURE_PAGE_LANE_ROOT_URL = "decko.rootUrl='https://culturesmith.com/';";

/** Install the capture's page-lane configuration (the :391-400 assignment).
 *  Pair with `resetDeckEnvironmentForViewLane()` in afterAll — the setting
 *  is process-wide module state, and the view-lane bytes must never render
 *  under a configured origin. */
export function installCapturePageLaneOrigin(): void {
  setDeckEnvironment({ origin: CAPTURE_PAGE_LANE_DECK_ORIGIN });
}

/** Restore the unconfigured (requestless) state — the :400 restore. */
export function resetDeckEnvironmentForViewLane(): void {
  setDeckEnvironment(undefined);
}

/** Run `fn` under the capture's page-lane configuration, restored after —
 *  the same shape as the capture script's block (assign :391-400, ensure
 *  restores :400). A suite that mixes lanes wraps only its PAGE-lane
 *  renders in this; its view-lane renders must run unconfigured. */
export async function withCapturePageLaneOrigin<T>(fn: () => Promise<T>): Promise<T> {
  installCapturePageLaneOrigin();
  try {
    return await fn();
  } finally {
    resetDeckEnvironmentForViewLane();
  }
}
