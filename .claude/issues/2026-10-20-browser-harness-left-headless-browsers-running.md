# The browser harness left headless browsers running (fixed 2026-10-20)

## What happened
`reference-harness/browser/lib/launch.mjs` removed a run's browser and profile only
when `close()` ran. Runs that were killed first (timeouts, aborted agents) left their
headless Chrome running: seven `decko-browser-profile-*` browsers were found alive,
part of a machine-wide memory exhaustion (commit 99%) that stopped programs launching.

## What changed (decko-ts 4ceb3656)
Each profile records its owning process. Every launch ends the whole browser process
tree of any profile whose owner is gone and removes that profile; live runs are never
touched. Test: `reference-harness/browser/test/orphan-browser-reaping.test.mjs`.

## What this project must keep doing
Every browser or server a test starts is ended in a `finally`, and a run must not rely
on `close()` alone: anything it leaves behind when killed has to be found by the next
run. Check `tasklist` for leftover `chrome.exe` after changing the harness.
