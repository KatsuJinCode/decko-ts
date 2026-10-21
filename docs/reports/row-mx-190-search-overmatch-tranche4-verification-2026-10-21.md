# Row mx-190 - the search whole count: the port-side instrument re-verified green at the tranche-4 base

Row: `mx-190-search-whole-count-correctness` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT). Instrument-coverage-matrix action 189
(ACT-190), kind findings-red. Finding F-2026-10-16-search-over-match.

This is tranche 4 of the family (branch
`port/matrix-journey-tranche4-20261021`, verified at commit `4937ff2f`,
the branch tip that carries the tranche-3 base `c18e3f44` and this
tranche's mx-155 following-junction work). The ask for this row: verify
the port side with a named runnable check and fix genuine defects.

## The named runnable check, run fresh at this base

The row's own port-side instrument, the search-overmatch module of the
signed-in exercise (the check tranche 1 ran as "grind tranche-1: --only
search-overmatch at d8050251, PASS 7/7", re-run at tranche 3):

    node tools/edge-signed-in-exercise.mjs --only search-overmatch \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche4-20261021/overmatch-run/report.md

Result: **7 / 7 checks passed** (run record:
`.runtime/matrix-journey-tranche4-20261021/overmatch-run/report.md`; the
run's process exit code is 1 by the tool's own coverage rule -
edge-signed-in-exercise.mjs:1505 exits non-zero unless the FULL
capability coverage is complete, which a `--only` run never is; every
CHECK passed, 0 failed, 0 skipped by write mode).

The run record: source `4937ff2f38436ccc57bbf7050c2e635a53de8f71`,
source files clean, bundle SHA256
`b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
(rebuilt from this tree's source), a throwaway copy of the pinned
21676-card deck, two throwaway local accounts, headless Chromium.

The four legs the row's blocker names all pass at this base:

- the fixtures store two public term cards, a control, and an
  administrator-only card behind a self read rule;
- the term's search hands the administrator-only row to the
  administrator and withholds it from an ordinary member (the
  viewer-scope leg);
- every returned row carries the term in its own name or its own stored
  content (the accounting leg);
- the module records a deck-wide broad-term composition measurement
  (`broadTerm "card"`, 809 deck name-or-content matches, 20 rendered
  rows on the first page, the module's own caveat: "port-vs-deck on
  this checkout; NOT the oracle's count").

The cleanup legs pass (the owned local stack closed; all 6
journey-created cards removed from the local copy), and the final
browser asset audit passes (3 contexts, 0 failures).

## The deck fingerprint is unchanged

The tranche-2 measurement binds the port's whole count (317 rows over 16
pages for `query[keyword]=news`) to the deck sha256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`
(`docs/reports/row-mx-190-search-whole-count-port-side-measured-2026-10-21.md`).
Re-measured this tranche before the run:

    sha256sum C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    -> 6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78

The same hash. The tranche-2 receipt's port count and its re-scope carry
over unchanged; this tranche re-runs the instrument, not the page walk.

## The row's state after this verification

- No genuine defect surfaced: the instrument's four legs are green at
  the new base (now carrying the mx-155 following-junction work in the
  same bundle), and the port-side work this row carries (the overmatch
  instrument) needs no change.
- The finding F-2026-10-16-search-over-match STAYS OPEN and the row
  stays WORKING ON IT, for the measured cause tranche 2 recorded: the
  oracle's whole count cannot be taken on this machine's rungs (Decko's
  `match` raises on the sqlite adapter, card-1.110.0
  config/initializers/02_patches/active_record.rb:80-83; the MySQL
  rung's three machine-local assets are absent). The named next step is
  unchanged and is not this lane's: provision the MySQL-rung assets on
  the machine that runs the oracle, boot the same deck fingerprint
  there, record the oracle's whole count beside the port's in one
  receipt.
- Nothing here deploys and nothing touches live.
