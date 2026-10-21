# Row mx-190, the search over-match: the port-side instrument re-verified green at the tranche-5 tip

Row: `mx-190-search-whole-count-correctness` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT). Instrument-coverage-matrix action 189
(ACT-190), kind findings-red, finding
`F-2026-10-16-search-over-match`.

This is tranche 5 of the family (branch
`port/matrix-journey-tranche5-20261021`). The ask named
`port/matrix-journey-tranche4-20261021` tip `e22c388e` as the base; this
row's run was taken at the branch tip `1d2d9df3`, which is `e22c388e` plus
this tranche's mx-B-081, mx-B-086 and mx-155 commits. Stated so the
measured commit is not misread: the run's own provenance records
`1d2d9df380f32ff6fe602353fbd9b4bfd4ad7b05`.

## The named runnable check, run fresh

The row's own port-side instrument, the search-overmatch module of the
signed-in exercise (the check tranches 1, 3 and 4 ran):

    node tools/edge-signed-in-exercise.mjs --only search-overmatch \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche5-20261021/overmatch-run/report.md

Result: **7 / 7 checks passed**, 0 failed, 0 skipped by write mode. Run
record `.runtime/matrix-journey-tranche5-20261021/overmatch-run/report.md`
and its machine-readable twin `report.md.json`. The process exit code is 1
by the tool's own coverage rule (`tools/edge-signed-in-exercise.mjs:1505`
exits non-zero unless the FULL capability coverage completed, which a
`--only` run never does); every CHECK passed.

Run provenance, from `report.md.json`: source `1d2d9df3`, source files
clean, bundle SHA256
`b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`, selection
`{only: "search-overmatch"}`, the loopback stack this run booted with write
mode `full`, a throwaway copy of the pinned 21676-card deck, two throwaway
local accounts, headless Chromium.

The bundle hash is byte-identical to the one the tranche-4 reports record at
`e22c388e`, and to the one this tranche's mx-B-081/mx-B-086 run recorded.
That is the expected result: this tranche's commits touch the browser
harness, one test file and one vitest config entry, none of which is
engine source, so the deployed bundle is unchanged. It is stated here
because a changed bundle hash would have meant the row was measured against
something other than what it claims.

## The four legs, green

Evidence from `report.md.json`, summarised:

1. **The fixture leg.** PASS. Two public term cards, one control, and one
   administrator-only card behind a self read rule
   (`zzovertmvii3ldo_adminonly+*self+*read`), the rule granting the
   administrator. All four cards stored.
2. **The viewer-scope leg.** PASS. The administrator's search returns
   `zzovertmvii3ldo_adminonly`; the member's does not
   (`adminSeesAdminOnly: true`, `memberSeesAdminOnly: false`).
3. **The accounting leg.** PASS. Every returned row carries the term in its
   own name or its own stored content; the control card, which carries it in
   neither, is absent.
4. **The composition measurement.** PASS. Broad term `card`, 809 deck
   name-or-content matches, 20 rendered rows on the first page, with the
   module's own caveat recorded verbatim: "port-vs-deck on this checkout;
   NOT the oracle's count".

The cleanup legs pass (the owned local stack closed; all 6 journey-created
cards removed, 0 remaining against a baseline of 53052), and the final
browser asset audit passes (3 browser contexts, 0 failures).

## The deck fingerprint is unchanged

    sha256sum C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    -> 6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78

The same hash the tranche-2 whole-count receipt binds the port's 317 rows
over 16 pages to, and the same hash this tranche's other two instrument
runs measured. The tranche-2 receipt's port count and its re-scope carry
over unchanged; this tranche re-ran the instrument, not the page walk.

## The row's state after this verification

- **No genuine defect surfaced.** The instrument's four legs are green at
  this tip, and this tranche changed no code on this row's path, so there
  was nothing to fix and no oracle-matched test to add. The commit for this
  row is this report alone.
- **The finding `F-2026-10-16-search-over-match` STAYS OPEN, and the cause
  is unchanged and named.** The oracle's whole count cannot be taken on this
  machine's rungs: Decko's `match` raises on the sqlite adapter (card-1.110.0
  `config/initializers/02_patches/active_record.rb:80-83`, as the earlier
  tranches recorded), and the MySQL rung's three machine-local assets are
  absent here. The named next step is unchanged and is not this lane's:
  provision the MySQL-rung assets on the machine that runs the oracle, boot
  the same deck fingerprint there, and record the oracle's whole count
  beside the port's in ONE receipt. **That is operator- and
  machine-blocked, not lane work.**
- **DONE-eligibility is unchanged.** The verdict stays FAIL: the row cannot
  be paired as PASS with bucket DONE while this finding stands.
- Nothing here deploys and nothing touches live.