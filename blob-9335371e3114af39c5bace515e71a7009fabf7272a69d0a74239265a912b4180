# mx-B-066: every card the run created is removed from the local copy

The roster row `mx-B-066-cleanup` (surface "cleanup") reads "every card
the run created is removed from the local copy", verdict PASS, bucket
DONE. The registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-066, check_ids ["B-066"]) records the live-acceptance-lane
entry pass (the live run of 2026-10-16T14:01:03Z) and the whole-harness
entry pass. This receipt is the family's own adjudication of the row
at this tip.

## What the row is

The exercise creates cards as it works (the Harness_* fixtures its
journeys make and rename). When the run ends, none of them may survive
in the run's own local copy: the deck the next run starts from must be
the deck this run started from, as far as the run's own writes reach.

## The instrument

"every journey-created card is removed from the local copy"
(tools/edge-signed-in-exercise.mjs:1493-1499, the cleanup group's
final record, wired in the finally block at :1452-1502): after the
browser is closed and the owned local stack is closed cleanly
(:1489-1491), the tool opens the run's local deck and runs
`cleanupCreatedCards(db, baselineMaxCardId)`
(lib/cleanup-created-cards.mjs:3-9), which sets `trash = 1` on every
card whose id is above the baseline taken after account seeding and
then counts what remains; the check passes when `remaining === 0`
(:1497). If the owned stack did NOT close cleanly, the check is
recorded FALSE with the reason stated (:1499, "preserving the fixture
instead of racing its writes"): the tool would rather fail the row
than clean a deck another writer may be touching.

THE REMOVAL IS RUBY'S OWN DELETE SEMANTICS. `cleanupCreatedCards`
trashes (an UPDATE of the `trash` flag, lib/cleanup-created-cards.mjs:6)
rather than deleting rows: card-1.110.0/mod/core/set/all/trash.rb:11-21
makes Ruby's own delete (`delete`, `delete!`) an `add_to_trash {
update! }` write whose row survives with trash set, and the committed
write-battery capture shows Ruby's successful delete changing the
cards table delta by 0
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
step "signed-in-delete-card" at :8615: status 303, the event ladder
ending `observer_delete`, `update_ancestor_timestamps`,
`notify_followers_after_delete`, cards delta 0 because the row stays).
The tool removes the run's cards the way the engine itself removes
cards.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the removal is a trash write, not a row deletion
(Ruby's own delete semantics at trash.rb:11-21 and the captured
delete's zero cards delta; the tool's `UPDATE cards SET trash = 1`),
and the verification is a direct read of the store (the remaining
count, as the engine's own queries would count). NOT oracle-matched,
and stated: the baseline rule (`id > baselineMaxCardId`, the cleanup
module's own comment at lib/cleanup-created-cards.mjs:1-2: the
baseline is taken after account seeding, and all later ids include
implicit junction and field cards) is the HARNESS's bookkeeping, not a
Ruby mechanism; and the check names the run's own local copy, while
the roster row's wording says "the local copy" of the live lane's own
run. The registry's live entry is its own record; no live store was
touched by this lane.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12b-20261026/rows-r4/report.md

    source 3e4791cb61d9260e9f69b0df69e5e30222747630, started
    2026-10-26T03:43:16.527Z, completed 2026-10-26T04:08:30.378Z,
    the source files clean
    verdict: PASS

The named checks in this run:

    owned local stack closed
        {}
    every journey-created card is removed from the local copy
        {"removed":212,"remaining":0,"baseline":53052}

212 journey-created cards trashed, 0 remaining above the seeding
baseline, after a clean stack close. The check is green in each of
this lane's four runs at this tip (rows-r1 through rows-r4, with the
same removed/remaining shape each time). The run this receipt cites
graded 251 of 253 checks passed; the two failures are the owner-audit
search-suggestion latency rows, neither of them this row.

## What this receipt does NOT claim

- The graded fact is rows-r4's cleanup of the run's own local deck
  copy. No claim is made about the source deck (the run copies it and
  never writes it), about the live deployment, or about the registry's
  live entry.
- Nothing deploys and nothing touches live.
