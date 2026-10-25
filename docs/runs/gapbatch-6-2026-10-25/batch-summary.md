# Enumeration gaps batch six: the lane's record

The enumeration audit's gap list
(docs/runs/enumeration-audit-2026-10-25.gaps.json in the audit branch
`port/enumeration-audit-20261025`) named 27 gaps. Batches one through four
closed twenty of them (the follow family's four, the rule views' three, the
restart persistence's two, the five navbar entries, the email, history and
modal-create views' four, and the anonymous denials' two). This lane takes
the next four by the audit's own ordering.

## The four gaps this lane closed

| gap | the audit's element | the pin | the receipt |
|---|---|---|---|
| A | the :overlay_guide view | tests/card/mod-loader/card-mod-edit-overlay-guide-address.test.ts | overlay-guide-address.md |
| B | the :modal_nest_rules view | tests/card/mod-loader/card-mod-rules-modal-nest-rules-address.test.ts | modal-nest-rules-address.md |
| C | the :edit_inline view | tests/card/mod-loader/card-mod-edit-inline-address.test.ts | edit-inline-address.md |
| D | the *changed_card setting address | tests/card/mod-loader/card-mod-email-changed-card-address.test.ts | changed-card-address.md |

Each is one commit with an explicit pathspec, on the branch
`port/gapbatch-6-20261025`, based on `7cde06a8` (origin/deploy/full-candidate-20261031,
the newest pushed roll tip at the time of the walk).

| commit | gap |
|---|---|
| d334bd43 | A, the :overlay_guide view at / *all+*read/overlay_guide |
| 9e722e3f | B, the :modal_nest_rules view at / *all/modal_nest_rules |
| 666cd18d | C, the :edit_inline view at /Home/edit_inline and /Oracle_Basics/edit_inline |
| 57d901dd | D, the *changed_card setting address at / *changed_card and / *changed_card?view=history |

## Why these four, and what was left out

The audit's own ordering puts the ten views of its part A1 first, the two
setting addresses of A2 next and the six check-suite behaviours of A5 last.
After batches one through four, the open gaps were seven:

    the :overlay_guide view                (A1)   <- this lane
    the :modal_nest_rules view             (A1)   <- this lane
    the :edit_inline view                  (A1)   <- this lane
    the *css setting address               (A2)   <- batch five (in flight)
    the *changed_card setting address      (A2)   <- this lane
    the permission-filtered anonymous search (A5)
    the administrator's approval step      (A5)

The fourth of the next four by that ordering is the *css setting address,
which batch five is working (its lane clone carries the scratch capture
tmp-css-bar-bytes.txt of the port's own *css bar bytes). This lane takes the
next one after it, the *changed_card setting address, and says so here so
the next lane does not duplicate it.

The two check-suite behaviours are left for the next lane on purpose: their
closure is a behavioural check with a capability row, not a view pin, and
they are the last two gaps in the audit's ordering.

## The measurements

The four pins, one run each:

    npx vitest run tests/card/mod-loader/card-mod-edit-overlay-guide-address.test.ts
    Test Files  1 passed (1)      Tests  4 passed (4)

    npx vitest run tests/card/mod-loader/card-mod-rules-modal-nest-rules-address.test.ts
    Test Files  1 passed (1)      Tests  3 passed (3)

    npx vitest run tests/card/mod-loader/card-mod-edit-inline-address.test.ts
    Test Files  1 passed (1)      Tests  5 passed (5)

    npx vitest run tests/card/mod-loader/card-mod-email-changed-card-address.test.ts
    Test Files  1 passed (1)      Tests  3 passed (3)

    (all four in one run)
    Test Files  4 passed (4)      Tests  15 passed (15)

## The correctness battery

    npm test        (node tools/test-gates.mjs run correctness)
    gate exit        1
    test files       1 failed, 711 passed, 54 skipped (766)
    tests            1 failed, 7347 passed, 227 skipped (7575)
    node:test        3 files, 15 passed, 0 failed
    duration         568.40 s

measured at commit 57d901dd, the fourth gap commit, on a clean committed
tree.

The one failing suite is the machine's own hygiene gate,
`tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts`, with the same
assertion and the same named path it has carried since the v13 roll
(`docs/runs/full-candidate-v13-ten-lane-roll-2026-10-23.md` and every roll
receipt after it): the path `decko-ts-lane-archives` is on the machine's
disk and is in neither IN-FLIGHT.json nor tests/hygiene/keep-worktrees.json.
That is machine state, not a property of this tree, and the path is not
this lane's. The v21 roll's own battery recorded the same single failure on
the tree this lane is based on (1 failed, 707 passed, 54 skipped of 762
files, docs/runs/full-candidate-v21-lanes-roll-2026-10-25.md), and this
lane's tree is that tree plus the four pins (762 + 4 = 766 files, which is
what the run reports).

## What this lane does not claim

- It does not claim the views' bytes at every address: each gap's capture
  names the address or addresses, and those are the ones pinned. The
  receipt for each gap says what is not claimed.
- It does not claim the roster rows: the roster lives in another
  repository (brandonDojoTech's docs/registry/completeness-roster.json) and
  is folded there by the fold lane, the way the follow family's rows were.
- It does not claim the two check-suite gaps it did not take, and it does
  not claim the *css setting address batch five is working.
