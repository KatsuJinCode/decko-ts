# reg-routes-B6: the row's verification holds at the canonical tip; the edge seam stays the named unblock

Row: "the `setup` before_action (rest.rb:31-35): cache renew + asset refresh
+ Env.reset". The family's own ledger closed the row at the round-eight tip
(commit ad0bd8f1: the refresh policy measured, the marker lifetime named,
the edge seam named with its price), and the roster carries it PARTIAL with
one unblock sentence: "the edge serving host still wires no asset-input
refresh seam ... Unblocks when: the edge host wires the asset-input refresh
seam."

## What this lane verified, and what it named

- The row's instrument passes at the canonical tip:
  `npx vitest run tests/server/setup-before-action-parity.test.ts` reads 1
  file, 13 tests, 0 failed in this lane, including the three legs that pin
  the gap rather than hide it ("no serving-host source reaches the
  asset-read refresh seam" over every file under deploy/, "the staging host
  does wire it", and "what the edge host needs to wire the seam is named
  here").
- The gap is therefore still REAL at this lane's tip, not stale: the test's
  first leg would fail the moment the seam is wired, so its pass here is the
  evidence that the unblock has not been satisfied.
- The evidence commits are in the shipped tree: `git merge-base
  --is-ancestor` exits 0 for e8d240bd (the tranche tip the roster cites)
  and for 38d498d6 and cdf09aa6 (the earlier dispositions it references).

## The exact mechanism that blocks the row, and who can lift it

Closing the row means building the action-engine collaborator set on the
edge's READ path. The refresh runs through
CardActionEngine#refreshReadAssetInputs (src/card/actions/card-action-engine.ts),
whose context needs a writer, the attachment store, the SCSS and Coffee
compilers and the compressors (src/card/actions/style-asset-events.ts,
StyleAssetEventContext); the edge read core
(deploy/bunny-worker-src/bunny-edge-engine-request.ts) builds none of these
today, only the fetch, driver and render engines. Staging gates the same
call behind writePathEnabled() for the same reason (vm-staging-server.mjs:4459).
The edge wiring also lands in the engine bundle, which sits at 7,449,150 of
its 7,600,000 boot-safe bytes at the v22 roll (150,850 bytes of headroom,
the guard's over-eighty-percent WARN line standing), so the wiring's bundle
weight must go through tools/vendor/edge-bundle-budget.mjs when it lands.
Any lane that takes the edge-host work with the bundle guard in the loop
lifts the unblock; the row's own test flips with it (its three gap legs are
written to fail once the seam is wired, which is the signal to rewrite them
as the wired state's pins).

This lane does not take that host work; it names it. Nothing about the row's
other halves moved: the policy pin (eager/cautious/never), the staging
wiring and the marker-lifetime naming all pass here exactly as the round
eight receipt records them.

## CLOSED 2026-10-27: the unblock is met, the edge serving host wired the seam

The edge serving host now wires the asset-input refresh seam: the Bunny
edge handler builds the same `createReadAssetRefresh` object the staging
host builds and runs `beforeRead` on every GET card request before the
render and before the content cache, driving
`CardActionEngine#refreshReadAssetInputs` (the mechanism this receipt
named) with the edge write surface's own collaborator set. The landing and
its full proof live in docs/runs/edge-refresh-seam-20261027/RECEIPT.md;
the short form:

- the wiring: deploy/bunny-worker-src/bunny-edge-engine-handler.ts (the
  seam, its gate, the mode posture, the degrade-and-log failure posture
  named as the deliberate opposite of staging's 500),
  src/server/cloudflare-write-routes.ts (the two compiler seams exported so
  one lazy instance serves the write surface and the refresh);
- the flip this receipt predicted: the three gap legs of
  tests/server/setup-before-action-parity.test.ts are rewritten as the
  wired state's pins (the deploy-wide scan now expects exactly the edge
  handler to reach the seam), and
  tests/server/workbatch-a-register-rows-inventory.test.ts reads the row
  `closed`, both updated on purpose in the same landing;
- the proof: the parity suite reads 13 tests 0 failed, the inventory 10
  tests 0 failed, the new behavior pin
  (tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts) shows the
  refresh writing through a real handler request and the failure
  degrading to the served page, `npx tsc --noEmit` is clean, and the
  boot-safe budget guard passes with the engine bundle at 7,483,155 of its
  7,600,000 bytes (1,107 bytes over the pre-wiring build of the same tip).

The row's grade: CLOSED (roster registry vocabulary: verdict PORTED,
bucket DONE). The round-eight named remainders stay named: the port's
refresh marker lives in the host process (one refresh per isolate on the
edge), not the shared cache, and the cache-renew half is the per-request
scope. Neither is a gap in the wiring; both are recorded in the row's
instrument.
