# Row conversion, round five, lower tail, 2026-10-24

Lane: lane-smell-test-round3-backslice-1-1. Question asked: take six
unadjudicated rows of the family, run each row's own instrument on THIS lane's
tree, close a row only where its own verification ran and its own verdict
holds, and leave every other row open with the gap this lane measured, in one
mechanism sentence.

## Why these six rows

The brief named the six HIGHEST-numbered unadjudicated rows. A parallel lane
(`lane-smell-test-round3-backslice-2-1`) held the brief's own path and branch
and took the top of the tail when this lane started, so this lane took the six
rows immediately below that tail, which are disjoint from it and from the two
earlier rounds:

| row | roster position |
|---|---|
| `smell-prepare-remote-widget-cas` | 81 |
| `smell-prove-host-override-read-admission` | 83 |
| `smell-read-private-index-progress` | 90 |
| `smell-read-staging-isolate-probe` | 92 |
| `smell-retire-owned-migration-credential` | 95 |
| `smell-run-private-index-render-comparison` | 97 |

Roster order is the order of the family rows in the canonical completeness
roster, `docs/registry/completeness-roster.json` in the operator's tree. The
six rows the parallel lane took are `smell-verify-hosted-widget-content`,
`smell-verify-hosted-widget-views`, `smell-verify-staging-probe-restoration`,
`smell-widget-single-statement-cas-test`, `smell-write-final-a253-manifest`
and `smell-write-found-by-integration-manifest`, and the five rows below this
lane's six are `smell-preflight-owned-widget-rows`,
`smell-prepare-owned-database-access`,
`smell-prepare-private-nest-index-comparison`,
`smell-discover-hosted-navigation` and `smell-export-hosted-read-only`.

## The rows

| row | what its own verification produced | disposition |
|---|---|---|
| `smell-prepare-remote-widget-cas` | the instrument was not run: its first act is live traffic to the cs-edge database, which a lane must not make, and its one-shot outputs already exist, so a run would spend that traffic and then fail on an existing file | WORKING ON IT |
| `smell-prove-host-override-read-admission` | the instrument ran twice: the first refused at the navigation with the harness's own `ERR_BLOCKED_BY_CLIENT`, and after the admit route's registration order was fixed it admitted the target document and the same-origin fetch and refused at the write backstop, where three of the six probes reached the server | WORKING ON IT, one step further than the recorded red |
| `smell-read-private-index-progress` | the instrument ran and refused at its first read, because the built clone that carried the `decko_nest_edges` cache was swept with the pinned checkout's runtime tree | WORKING ON IT |
| `smell-read-staging-isolate-probe` | the instrument ran and refused at its own admission gate, before any probe traffic, because the staging script carries `DECKO_EDGE_ISOLATE_PROBE=0` and `DECKO_EDGE_CACHE=1` where it needs `1` and `0` | WORKING ON IT |
| `smell-retire-owned-migration-credential` | the instrument ran and refused at its custody comparison, one line before the removal it performs, because the prepared-access record names a credential path the instrument's constant does not; nothing was removed | WORKING ON IT |
| `smell-run-private-index-render-comparison` | the instrument ran after the deck it stages from was byte-restored, and refused at its own exclusive create, one line before the four runs and before the write that would overwrite the completed output of record | WORKING ON IT |

No row closed, and every row carries the mechanism this lane measured.

## The one mechanism five of them share

Five of the six rows were stopped by the machine's own state, not by the port:

- the pinned checkouts the instruments import their harness modules from had
  been swept down to a bare `node_modules`, so the instruments could not start;
- the artifacts the instruments read or stage from lived under those
  checkouts' `runtime` trees, which the sweep took with them.

This lane restored the pinned `b00a4503` checkout with the steward's own entry
point (releasing the lease of the finished lane that had restored it before,
whose checkout had been swept), restored the authorized-widget-content deck
byte for byte from the 2026-10-20 restoration receipt, and regenerated the
throwaway TLS fixture with the same command the harness itself uses. What was
left after that is the port's own answer, and only one row still had one.

## The one row with a port-side answer

`smell-prove-host-override-read-admission` is the only row whose own
verification produced a port-side finding, and this lane landed the fix for the
first half of it:

- the harness's admit route for the override target's own requests was
  registered below the two policy routes, and Playwright evaluates route
  handlers in the reverse order they were registered, so the
  canonical-loopback allow-list aborted the `127.0.0.2` navigation before the
  admit route could see it. The admit route is now registered after both
  policy routes and before the write gate, and the pin holds that order.

What remains is the write backstop: it decides a write from the URL's mark and
the card name in the path, never from the body of an admitted request, so a
card write posted to a session-mark route and a GET that names a card on a
mutation route both reach the target in read-only mode. Narrowing the
session-mark carve-out would change the port's own account flows, so that is a
contract decision and is named, not taken.

## What this lane added that the prior rounds did not have

- The two-leg rig was not needed here: every row in this slice has its own
  instrument, and each one ran once, on this lane's tree, with the exact
  refusal recorded.
- The captures are under `fixtures/captured/smell-row-r5b-2026-10-24/`, one
  per row, and the reader is `tests/server/smell-row-r5b-captures.ts`. The
  reader is this lane's own module, named for its own round directory, so a
  lane working another slice never edits this file and the two branches merge
  without a conflict.
- The pins are one per row, under `tests/server/`:
  `smell-prepare-remote-widget-cas-parity.test.ts`,
  `smell-prove-host-override-read-admission-parity.test.ts`,
  `smell-read-private-index-progress-parity.test.ts`,
  `smell-read-staging-isolate-probe-parity.test.ts`,
  `smell-retire-owned-migration-credential-parity.test.ts` and
  `smell-run-private-index-render-comparison-parity.test.ts`.

## The receipts

One per row, under this directory's row-id directory, each with the command
that produced it and the observed output.

## The battery

    npx vitest run tests/server/smell-act082-new-cardtype-form-fields-parity.test.ts \
      tests/server/smell-act082-save-post-body-parity.test.ts \
      tests/server/smell-act082-select-owner-form-parity.test.ts \
      tests/server/smell-act082-type-select-all-options-parity.test.ts \
      tests/server/smell-act082-type-select-refresh-after-create-parity.test.ts \
      tests/server/smell-compare-journeys-provenance.test.ts \
      tests/server/smell-evaluate-follow-operations-parity.test.ts \
      tests/server/smell-run-all-parity.test.ts \
      tests/server/smell-check-chain-join-plan-parity.test.ts \
      tests/server/smell-apply-remote-widget-cas-parity.test.ts \
      tests/server/smell-audit-candidate-production-flags-parity.test.ts \
      tests/server/smell-discover-hosted-account-entry-parity.test.ts \
      tests/server/smell-prepare-remote-widget-cas-parity.test.ts \
      tests/server/smell-prove-host-override-read-admission-parity.test.ts \
      tests/server/smell-read-private-index-progress-parity.test.ts \
      tests/server/smell-read-staging-isolate-probe-parity.test.ts \
      tests/server/smell-retire-owned-migration-credential-parity.test.ts \
      tests/server/smell-run-private-index-render-comparison-parity.test.ts

    -> 18 files, 81 tests, 81 passed, 0 failed.

The harness's own suite (`node --test "tools/edge-signed-in-exercise/test/*.test.mjs"`)
is green with the route-order change in it: 86 tests, 84 pass, 0 fail, 2
skipped.

The typecheck (`npx tsc --noEmit`) reports three errors, all in
`tests/card/actions/write-path-races.test.ts`, a file this lane did not touch
(`git diff 463e39c2..HEAD -- tests/card/actions/write-path-races.test.ts` is
empty). The errors are filed as issue 20.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
