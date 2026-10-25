# smell-widget-single-statement-cas-test

- The row's own label: `smell/probe script widget-single-statement-cas.test.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs`
- What this lane did: ran the row's own suite as it stands, measured the deck
  it reads, measured the hash-verified pre-apply backup of that deck, and then
  ran the suite again over the pre-apply deck.
- Command:
  `node tools/smell-row-r6/run-widget-cas-against-the-pre-apply-deck.mjs C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018 <scratch-dir> fixtures/captured/smell-row-r6-2026-10-25/widget-single-statement-cas-test.json`
  (`in place: tests 4, pass 1, fail 3 (3 failures); over the pre-apply deck:
  tests 4, pass 4, fail 0 (0 failures); changed lines: 4`)
- Evidence: `fixtures/captured/smell-row-r6-2026-10-25/widget-single-statement-cas-test.json`
  (both runs' own TAP output, the changed line, and the card-by-card
  measurement of both decks).
- Pin: `tests/server/smell-widget-single-statement-cas-test-parity.test.ts`.

## Verdict: DONE

The row's own suite, run over the deck its admission is written against,
passes all four of its cases. The row closes on the suite's own verdict.

## What the row was waiting for

The 2026-10-24 round left this row open with the gap "the deck at the path the
suite copies is the applied deck, so the suite's pre-apply admission of
`id = ? AND db_content = ?` matches none of the twelve ids and the single
statement changes no card". It named what would close it: a pre-apply
snapshot deck, byte-identical to the one the receipt of record names.

That deck is on this machine. The hash-verified pre-apply backup of the live
deck still carries the receipt's baseline hash.

## The two decks, measured card by card

| fact | the deck the suite reads | the pre-apply backup |
|---|---|---|
| sha256 | `6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78` | `15545aa78c6d8cc99427a400f31c36ca137d407be6c6f951d8df11e84b2ddf01` |
| the receipt of record's baseline hash | does not match | matches |
| the twelve cards present | 12 of 12 | 12 of 12 |
| the twelve cards not trashed | 12 of 12 | 12 of 12 |
| the twelve cards carrying the BEFORE content | 0 of 12 | 12 of 12 |
| the twelve cards carrying the AFTER content | 12 of 12 | 0 of 12 |
| admission matches | 0 of 12 | 12 of 12 |

The deck the suite reads is the applied deck, and it is not damaged. The
pre-apply backup is the deck the suite's admission is written against.

## The two runs

**As the suite stands**, over the deck it reads, the suite's own verdict is
three failures of four:

| case | result |
|---|---|
| one statement changes exactly 12 content cells and guarded rollback restores every card while versions stay monotonic | fail, `0 !== 12` |
| one mismatching content cell refuses every update even with a fresh version | pass |
| an unrelated intervening card edit refuses stale admission and rollback refuses a later edit | fail, `0 !== 12` |
| a trigger failure partway through the statement rolls back every content and version change | fail, no exception raised |

**Over the pre-apply deck**, the suite passes all four:

    node --test --test-reporter=tap widget-single-statement-cas.test.mjs
    tests 4, pass 4, fail 0, cancelled 0, skipped 0, todo 0

## The one line that changed

The suite reads the deck at a fixed path, and this lane did not put the
pre-apply deck at that path: the deck there is the working deck of a live
demo lane. So the suite was copied into this lane's own scratch tree and one
line of the copy was repointed:

    line 4, before:
    const snapshot=fs.readFileSync('C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3');
    line 4, after:
    const snapshot=fs.readFileSync('C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3.pre-widget-fallback-20261019');

Everything else is the originals, listed with their hashes in the capture: the
module under test `widget-single-statement-cas.mjs`, the four test bodies, the
application receipt and the proposal.

The port's own code is what the suite exercises, and it was not changed. The
statement the suite drives is still the port's one-statement compare-and-swap,
with its twelve-card scope check, its materialized admission read, its
version check and its single-statement update.

## What this lane did not do

It did not overwrite the live deck at the path the suite reads, did not edit
the suite where it lives, did not change the port, did not touch a hosted
edge, and did not send live database traffic. The suite's own cleanup removed
its scratch databases inside the pinned checkout's runtime tree, which is
where the suite puts them by design.

Branch: `port/smell-test-round4-20261025` in KatsuJinCode/decko-ts.
