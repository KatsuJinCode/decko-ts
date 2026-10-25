# smell-widget-single-statement-cas-test

- The row's own label: `smell/probe script widget-single-statement-cas.test.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs`
- What this lane did: ran the row's own suite, measured the deck the suite copies, and
  read the reason out of both.
- Commands:
  - `NODE_PATH=C:/localProjects/decko-ts-smell-test-round3-20261024/node_modules node --test --test-reporter=tap widget-single-statement-cas.test.mjs`,
    run from `tmp/smell-r5/cas-tree/private-tool-repairs-20261018/` in this lane's tree.
    Exit code 1: `tests 4, pass 1, fail 3`.
  - `node tools/smell-row-r5/measure-widget-cas-deck.mjs C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 C:/localProjects/brandonDojoTech/recovery/release/private-probes/authorized-widget-content-20261018-r2/application-receipt.json C:/localProjects/brandonDojoTech/recovery/release/private-probes/widget-fallback-proposal-20261017/proposal.json tmp/smell-r5/widget-cas-deck.json`
    (`cards 12/12 present, 12 not trashed, before 0, after 12, admission 0`)
  - `node tools/smell-row-r5/distill-widget-cas-suite.mjs tmp/smell-r5/cas-suite.tap tmp/smell-r5/widget-cas-deck.json fixtures/captured/smell-row-r5-2026-10-24/widget-single-statement-cas-test.json`
    (`tests 4, pass 1, fail 3; deck admission 0 of 12, after-content 12 of 12`)
- Evidence: `fixtures/captured/smell-row-r5-2026-10-24/widget-single-statement-cas-test.json`
  (the suite's own TAP output next to the measurement of the deck).
- Pin: `tests/server/smell-widget-single-statement-cas-test-parity.test.ts`.

## Verdict: WORKING ON IT

The row's own verification ran, and its own verdict is three failures of four.

| case | result |
|---|---|
| one statement changes exactly 12 content cells and guarded rollback restores every card while versions stay monotonic | fail, `0 !== 12` |
| one mismatching content cell refuses every update even with a fresh version | pass |
| an unrelated intervening card edit refuses stale admission and rollback refuses a later edit | fail, `0 !== 12` |
| a trigger failure partway through the statement rolls back every content and version change | fail, no exception raised |

The failing number is the same in both cases that reach the statement: the single
statement changed no card, because its admission matched nothing.

## Why the admission matched nothing, measured

The suite's admission predicate is `id = ? AND db_content = ?`, and the content it
admits against is the application receipt's BEFORE content. This lane measured the deck
the suite copies, card by card:

| fact | value |
|---|---|
| the twelve cards present in the deck | 12 of 12 |
| the twelve cards not trashed | 12 of 12 |
| the twelve cards whose content equals the receipt's BEFORE content | 0 of 12 |
| the twelve cards whose content equals the proposal's AFTER content | 12 of 12 |
| admission matches | 0 of 12 |

So the deck on disk is the applied deck: every one of the twelve cards already carries
the migrated content the proposal describes, and none of them carries the pre-apply
content the suite admits against. The deck is not damaged, the cards are not missing
and the statement is not wrong; the suite is pointing at a deck that has already had
the migration applied to it.

## What this lane changed to run the suite, and what it did not change

The 2026-10-23 round could not run the suite because the session's file-deletion gate
refused it, and it named what would close the row: the suite's cleanup rewritten, or a
lane authorised to let the suite delete its own scratch. This lane ran the suite from
a copy in this lane's own scratch tree, with exactly one line changed: the scratch
root the suite copies its deck into was repointed at that tree, because the pinned
checkout's `.runtime` directory is not on this machine. The four test bodies, the
module under test, the snapshot deck, the application receipt and the proposal are the
originals, and the suite's own cleanup still removed its temporary directories, inside
this lane's own scratch tree. The first run of the suite in this lane, against the
unmodified copy, is recorded in this lane's scratch as well.

## The gap, in one mechanism sentence

The deck at the path the suite copies is the applied deck, so the suite's pre-apply
admission of `id = ? AND db_content = ?` matches none of the twelve ids and the single
statement changes no card.

## What would close it

A pre-apply snapshot deck at that path, byte-identical to the one the receipt of record
names, so the suite's admission can match. The hash-verified pre-apply backup of that
deck, `deck.sqlite3.pre-widget-fallback-20261019`, still carries the receipt's baseline
hash; restoring it over the live deck at that path is a change to a live file and is
not this lane's move.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
