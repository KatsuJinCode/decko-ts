# mx-187: feed dedup, the same act must not repeat in a feed

The roster row `mx-187-cross-cutting-feed-dedup` (family [Family]) reads
"feed dedup: the same act must not repeat in a feed", verdict PASS,
bucket DONE. The row's own evidence basis is the registry's re-grade: the
instrument that produced the recorded fail was defective (a title-keyed
feed reader counted one card's several edits as repeats of one act), the
corrected instrument exists and its run passes verbatim, and the triage
docs/reports/matrix-fails-triage-1-2026-10-19.md and
docs/reports/matrix-fails-triage-3-2026-10-19.md name that
classification. This receipt is the family's own adjudication of the
row: the instruments, the Ruby oracle that pins the feed's own surfaces,
and fresh measurements at this tip.

## What the row is

A feed lists acts. One card edited five times owns five distinct acts,
and the feed must show five entries with distinct act identities; it must
never show the same act twice. The row is the check that act identity,
not card identity or title identity, is the feed's unit.

## The instruments

Three named instruments grade this row, and this lane ran two of them
fresh.

The exercise's own check module,
tools/edge-signed-in-exercise/checks-recent-changes-feed-dedup.mjs (meta
topic "recent-changes-feed-dedup", the N14 capability), runs under the
whole-family harness and alone under `--only recent-changes-feed-dedup`.
It reads the /*recent feed's act rows and grades: each act exactly once;
the acts this run just made present, with the three acts of one card
three distinct acts; and the fixture shape (one card's create plus five
edits stored as six acts, the crawl's reading named) so a title-keyed
reader cannot pass.

The ranks91-100 window probe
(reference-harness/browser/probe-pageonly-ranks91-100.mjs) drives three
legs on the fixture deck (its ACT-187 section, lines 763-806): every
action_id in the feed appears exactly once (read from each row's own
data-slot act identity, with a positive control that every row carries
one); the acts just driven appear and one card's three acts are three
distinct ids; and a second read of the feed repeats no act (:763, :766,
:776).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "feed dedup: the
same act must not repeat in a feed", id ACT-187, check_ids []) records
these instrument entries:

    - whole-harness, headless-dom, native-local-bundle: pass (the triage-3
      tip run at 4456ba94, module checks-recent-changes-feed-dedup.mjs,
      7/7)
    - whole-harness, headless-dom, ts-engine-local-bundle: pass (the
      cross-surface ACT-187 probe at 2482e442: zero repeats on /*recent
      and on the card's own history, six of six legs in both runs)

## The oracle

THE FEED'S OWN SURFACES ARE RUBY'S OWN, AND THE REPOSITORY CARRIES THEIR
CAPTURED BYTES. The committed capture of a real Ruby deck's rendered
views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arms `probe-view:497:title@set/self/recent.rb`,
`probe-view:505:core@set/self/recent.rb` and
`probe-view:521:feed_item_description@set/self/recent.rb`: Ruby's own
*recent card renders its core as the deck-wide recent-acts feed, an
accordion of one entry per act. The port renders the same view from the
same set chain: src/card/render/views.ts:1084-1099 seats the
set/self/recent.rb:28-33 core (the deck-wide recent-acts reader, a
Self-set override of the search core, with the set chain's own comment
that self outranks the search type so the plain search list can never
answer), and the bytes builder is card-mod-history.ts
recentChangesCoreBytes over the render-time history seam
(src/card/mod-loader/mods/card-mod-history.ts:1567-1585, the
action-list class chain Ruby's own history_board.rb names).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The *recent
core's set chain, its feed shape (one accordion entry per act) and the
action-list classes are Ruby's own, captured byte-wise in the repository
and rendered by the port file the citation names. The dedup predicates
(one row per act id, the act identity read from each row's own data
attributes, the cross-read stability) are the modules' own named
instruments. No Ruby-captured byte comparison of the feed's full HTML is
claimed for this row; the ledger entries are behavioral and this receipt
matches them with behavioral measurements.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --only recent-changes-feed-dedup \
      --out .runtime/signed-in-exercise-round12-20261024/feed-dedup-only/report.md

    source 71d4f686007e9f26e75cbfe66db964bd2ccc08cd, the source files
    clean; bundle SHA256 3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748;
    started 2026-10-24T22:26:30.117Z
    verdict: 8 / 8 checks passed, 0 failed, 0 skipped by write mode
    N14 the recent-changes feed lists each act exactly once: PASS
      {"renderedActEntries":4,"distinctActIds":4,"duplicates":[]}
    N14 the recent-changes feed carries an act this run just made: PASS
    feed title-repeat fixture stores create plus edits as distinct acts:
      PASS {"deckActCount":6,"createPlusEdits":6}
    N14 the crawl's 2-6x shape: one card's several edits share one feed
      title while every act id stays distinct: PASS
      {"renderedActEntries":10,"entriesTitlingTheFixtureCard":6}
    cleanup and the final browser asset audit: PASS

    node reference-harness/browser/probe-pageonly-ranks91-100.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-ranks91-100-final

    source 9a2ed6e3 (the lane's own tip at run time), the source files
    clean, the engine pure-tip (distSha256 07ff7a50...)
    ACT-187 no act repeats in the Changes feed (every action_id appears
      exactly once): GREEN {"totalActRows":26,"distinctActionIds":26,
      "repeatedActionIds":[]}
    ACT-187 the acts just driven each appear, and the three acts on one
      card are three distinct acts: GREEN {"actsOnA":[1006,1005,1004],
      "actsOnB":[1007],"driveOk":true}
    ACT-187 re-reading the feed repeats no act (the dedup holds across
      reads): GREEN {"repeatedActionIds":[]}
    legs 22, failures 0

Twenty-six feed rows carried twenty-six distinct act ids, twice, and the
deck-backed fixture held create plus five edits as six distinct acts, on
both instruments.

## What this receipt does NOT claim

- The row's port side is what the instruments grade, and it is green. This
  receipt does not claim anything about a live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
