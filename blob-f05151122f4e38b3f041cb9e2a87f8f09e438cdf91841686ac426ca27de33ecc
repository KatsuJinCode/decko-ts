// The engine's one wall-clock seam. Ruby reads Time.now / Date.today at
// render time; the engine reads this instead, so a deterministic host (the
// reference harness, which pins `spec.clock`) can freeze "now" to a chosen
// instant and get byte-identical renders across runs. Production
// code never sets it: unset, the real clock is used, as in Ruby.

let captureWallClock: Date | undefined;

/** Freeze the card wall clock. Pass undefined to restore the real clock. */
export function setCaptureWallClock(instant: Date | undefined): void {
  captureWallClock = instant;
}

/** The current instant: the pinned instant if one is set, else the real clock. */
export function cardWallClockNow(): Date {
  return captureWallClock ?? new Date();
}
