# pd-3: the coverage inventory's side-effects row, reconciled with the battery that measures it

- The row's own label: "coverage-inventory row 22 reconciled with row 61 and
  the read-ledger's battery, compat and security rows filled"
- The instrument: `tests/tools/side-effects-scenario-battery.test.ts`, which
  drives the 87 public steps of the scenario battery and grades them against
  the committed Ruby recording
  `reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`
- Commands:
  - `npm test` (the full correctness gate) at commit `c17906db`: the battery
    file is green, `tests/tools/side-effects-scenario-battery.test.ts` 1 test,
    19,704 ms, and the run reports `Test Files 5 failed | 706 passed | 54
    skipped (765)`, `Tests 9 failed | 7324 passed | 243 skipped (7576)`. The
    nine failures are the MySQL server binary missing from the machine at that
    moment and the machine's lane worktree hygiene gate; they are not this
    row's, and the MySQL ones pass once the binary is in place.
  - `npx vitest run tests/server/drivers/ tests/card/nest-index/nest-index-dialects.test.ts`
    after the MySQL 8.4.11 server binary landed in the machine's cache: 14
    files, 160 tests, all passed.

## Verdict: the row's contradiction was a stale reading, and the file is reconciled now

## What the row asked for, and what the tree actually says

The row asked for `docs/coverage-inventory.md:22` to carry the split the
battery test pins, in place of a figure that contradicted the file's own
line 61. At this tree that contradiction is gone, and the figure the row
named is the stale one:

| where | what it says |
|---|---|
| `docs/coverage-inventory.md:22` | 87 public, **80 match**, **7 declared**, **none open**, 3 withheld |
| `docs/coverage-inventory.md:61` | 87 public: **80 match + 7 declared + 0 open**, 3 withheld |
| `tests/tools/side-effects-scenario-battery.test.ts:275-279` | pins `{ pass: 80, deliberate: 7, total: 87 }` and, at :283-284, pins the mismatched list as empty |
| the battery's own run at this tree | green, so the pinned split is the measured one |

The public-tree commit the row named (`e89886e`, which would have put
`83 pass / 3 declared / 1 mismatched` on line 22) is not in this repository's
history, and the tree moved the other way afterwards: commit 12bbbc2b
("Declare the sign-in divergence in the battery") replaced the `83 match`
figure with `80 match`, and the suite was re-pinned to the same split. The
sign-in divergence became a declared difference and `get-home` became one
too, so the open step the old figure counted is closed and the split moved
from 83/3/1 to 80/7/0. Applying the old correction now would make the file
contradict its own line 61 and the suite that measures it.

## What changed in the file

The numbers were already right, so the reconciliation is completeness rather
than arithmetic:

- Line 22 now names all seven declared steps with the reason for each, not
  four of the seven: `get-home` on the script bundles' wall-clock names;
  `signin-unknown`, `signin-wrong-password` and `reset-unknown-email` under
  approved divergence 4 in `docs/SECURITY.md`; `admin-create-skin-bad-parent`
  where Ruby's skin validation answers 500 and the port answers 422;
  `restore-file-revision` where Ruby's carrierwave override answers 500 and
  the port restores the version and answers 303; and `admin-deny-signup` as
  the knock-on of that failed restore's location history. Each reason is
  quoted from the battery's own scenario file, `tools/parity-side-effects/scenarios.json`
  (`deliberate.why`), which is where the suite reads it from.
- Line 61 now says where the seven reasons live and where the suite pins the
  tally.

## Where the figure travels

The private read-ledger's battery row (row 8) and the post's paragraph are
updated in the other repository (`C:/localProjects/brandonDojoTech`,
`recovery/release/public/`) in the same turn. The post's `83 match / 3 / 1`
sentence describes the tree the post names, the published snapshot `9f72ac5`,
and stays as it is. This lane did not verify that snapshot's own pin: `9f72ac5`
is not an object in this repository (it lives in the public package's own
repository), and the attribution of the `83 / 3 / 1` figure to that tree comes
from the read-ledger's own record of it, written by the lane that read that
tree. The read-ledger row now carries the measured result for this tree and
says which figure belongs to which tree, so the two are not read as one claim.

## What this lane did not do

It did not re-record the Ruby recording, did not change the battery, did not
change the engine, and did not touch the published snapshot.
