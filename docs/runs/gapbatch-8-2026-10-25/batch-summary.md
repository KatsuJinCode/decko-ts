# Enumeration gaps batch eight: the lane's record

The enumeration audit's gap list
(docs/runs/enumeration-audit-2026-10-25.gaps.json, at the audit branch
`port/enumeration-audit-20261025` and folded at the roll tip) named 27
gaps. Batches one through seven closed twenty-five of them. The two the
audit left unowned are the two check-suite behaviours of its part A5's
tail: gaps.json entries 24 and 27. This lane closes both, and they are
the last two.

## The branch

`port/gapbatch-8-20261025`, based on `c29e4c3f`
(`origin/deploy/full-candidate-20261102`, the v23 candidate, the newest
pushed roll tip at the time of the walk), created through the sanctioned
lane-copy path into the lane's own checkout
`C:/localProjects/decko-ts-gapbatch-8-20261025`. Nothing deploys.

| commit | gap |
|---|---|
| c38948e7 | 24, the N12 capability row and the permission-filtered anonymous search's four checks |
| ac61efde | 24, the module verifies its fixtures through the junction rows the engine stores |
| b14b40c8 | 24, the N12 row's measured run: 9/9 checks, the row grades covered |
| bd6327ac | 27, the A6 capability row and the signup approval's four checks |
| 694869c8 | 27, the module awaits the sign-up response directly |
| a2a093c8 | 27, the module grades the pending state on the response object itself |
| f6c8fcd6 | 27, the A6 row's measured run: 9/9 checks, the row grades covered |
| ea3a5cd8 | the wait-site pin re-measures with the thirteenth file the gap 24 module adds |

## The two gaps this lane closed

| gap | the audit's element | the closure | the receipt |
|---|---|---|---|
| 24 | the permission-filtered anonymous search (journey search-filtered-anonymous, synthetic-v1.json) | the N12 row (group search) + checks-search-anonymous-filter.mjs; one measured run | search-anonymous-filter.md + search-anonymous-filter-run.json |
| 27 | the administrator approval step of the signup activation journey (account-signup-activation-complete, acceptance-account-date.json) | the A6 row (group account) + checks-account-signup-approval.mjs; one measured run | signup-approval-step.md + signup-approval-step-run.json |

Both closures follow batch two's shape, which is the family's own method
for check-suite gaps: the cited journey is the spec, the port's behaviour
is verified against it by a capability row whose checks the edge
signed-in exercise grades on the locally booted stack, and the row grades
covered from the run record. Nothing was ported: both behaviours were
already in the tree (the search's read-rule filter rides the
cqlPermissionOptions seam; the approval step is write-routes.ts's
approveSignup behind the verification_links view the signed-in parity
test pins), and what no proof carried was the behaviour as one chain,
which is what the two runs now carry.

The two measured runs, one each:

    node tools/edge-signed-in-exercise.mjs --only search-anonymous-filter --out .runtime/edge-signed-in/gapbatch8-anon-search-attempt2/report.md
    9 / 9 checks passed; capability coverage 2 covered of 97 rows (N12 covered, 4 of 4 checks)

    node tools/edge-signed-in-exercise.mjs --only account-signup-approval --out .runtime/edge-signed-in/gapbatch8-signup-approval-attempt3/report.md
    9 / 9 checks passed; capability coverage 2 covered of 98 rows (A6 covered, 4 of 4 checks)

Both runs ran on the LOCAL stack the harness boots, at this lane's tip,
on a clean committed tree (the source-custody preflight), provenance
`productionRuntime: false`, nothing at the live edge. Three superseded
attempts preceded the two passing runs (one fixture-guard shape in the
search module, two response-wrapper reads in the approval module); each
is named in its own receipt with the commit that fixed it.

## The correctness battery

    npm test        (node tools/test-gates.mjs run correctness)
    gate exit        1
    test files       1 failed, 725 passed, 54 skipped (780)
    tests            1 failed, 7471 passed, 227 skipped (7699)
    node:test        3 files, 15 passed, 0 failed
    duration         measured in two runs: 414 s at f6c8fcd6, then the
                     same line re-measured at ea3a5cd8, the final commit
                     (the log is the lane's .runtime/correctness-final.log)

The one failing suite is the machine's own hygiene gate,
`tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts`, with the same
assertion and the same named path it has carried since the v13 roll: the
path `decko-ts-lane-archives` is on the machine's disk and is in neither
IN-FLIGHT.json nor tests/hygiene/keep-worktrees.json. That is machine
state, not a property of this tree, and the path is not this lane's. The
v23 roll receipt records the identical line for the base tree this lane
is based on (1 failed, 725 passed, 54 skipped of 780 files; 1 failed,
7471 passed, 227 skipped of 7699 tests), so the failure set is equal to
the base tree's, file for file.

One tree-owned test moved while the lane worked and is re-measured, not
suppressed: the wait-site pin
(`tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts`)
records the literal-wait file list of the check modules, and the gap 24
module's two settle waits joined it. The pin's own comment documents the
procedure (the twelfth file's precedent), and commit `ea3a5cd8` follows
it: the list gains its thirteenth file, the floor moves 211800 ->
214800, and the test passes.

## What this lane does not claim

- It does not claim the roster rows: the roster lives in another
  repository (brandonDojoTech's docs/registry/completeness-roster.json)
  and is folded there by the fold lane, the way the follow family's and
  the other batches' rows were.
- It does not claim the audit's ten suspect rows (Part B), which are a
  separate list from the 27 gaps.
- It does not claim the anonymous EDIT denial (S5's contract), the whole
  -count over-match question the search-suggest instrument scopes, the
  journey's restart legs (gap 26's subject, closed by batch three), or
  the captcha-off configuration steps (the journey's own deck prep, no
  capability names them).
- The committed run records carry the owned mail capture's deliveries for
  throwaway loopback accounts on deck copies the runs themselves delete
  at cleanup; they certify nothing beyond their own runs.

## The machine cost

Added to the machine: one lane checkout, 317,447,633 bytes by the
lane-copy admission (before builds). The lane leaves behind its .runtime
(two run directories plus the retained superseded attempts, the final
correctness log) and the built dist and node_modules of an owned
checkout; the branch is pushed, so the checkout holds nothing unique.
Removed by the lane: nothing (the two measured runs' cleanup legs deleted
their own journey-created cards; the harness's own teardown closed the
stacks and browsers, both graded PASS in the runs).
