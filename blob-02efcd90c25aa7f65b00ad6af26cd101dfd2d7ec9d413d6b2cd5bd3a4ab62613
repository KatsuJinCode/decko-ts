# Row mx-190, the search over-match: the port-side instrument re-verified green at the tranche-6 tip

Row: `mx-190-search-whole-count-correctness` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT, verdict FAIL). Instrument-coverage-matrix
action 189 (ACT-190), kind findings-red, finding
`F-2026-10-16-search-over-match`.

This is tranche 6 of the family (branch
`port/matrix-journey-tranche6-20261021`, base `f583811d`, the tip the ask
named). The ask for this row: verify the port side with a named runnable
check, fix genuine defects, report under `docs/reports/`, one commit per
row.

## The named runnable check, run fresh at this base

The row's own port-side instrument, the search-overmatch module of the
signed-in exercise (the check tranches 1, 3, 4 and 5 ran):

    node tools/edge-signed-in-exercise.mjs --only search-overmatch \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche6-20261021/overmatch-run-r2/report.md

**Result: 7 / 7 checks passed, 0 failed.** The run record is
`.runtime/matrix-journey-tranche6-20261021/overmatch-run-r2/report.md` and
its machine-readable twin `report.md.json`. The process exit code is **1**,
by the tool's own rule and not by any failure:
`tools/edge-signed-in-exercise.mjs:1503` exits 0 only when no check failed
AND the capability coverage is complete, and a `--only` run never completes
it (the run printed "capability coverage: 0 covered, 0 partial, 91 not
covered, 3 out of scope (of 95)"). The exit code was captured in this
lane's own command line, not inferred.

Run provenance, read from `report.md.json`:

- source `761f73157b6f2df721896c3ded46850d1f8c390b` (this tranche's tip
  at the time of the run), source files clean
- bundle SHA256
  `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
  (rebuilt from this tree's own source). It is byte-identical to the hash
  tranches 4 and 5 recorded, and that is the expected result: this tranche
  changed no engine source.
- selection `{only: "search-overmatch", diagnosticOnly: true}`
- the loopback stack this run booted, write mode `full` (the local stack
  stages a throwaway deck copy; nothing reaches the live site)
- a throwaway copy of the pinned 21676-card deck, two throwaway local
  accounts, headless Chromium
- completed `2026-10-21T22:06:45.441Z`

## Two things this lane saw, stated rather than smoothed over

1. **The first attempt at this run did not boot.** The command was first
   run without `--keep`, and it stopped right after seeding the two local
   accounts with `TypeError: fetch failed`, before any check ran; the tool
   then removed its run directory ("run did not complete; removed run
   directory ..."). The second attempt, the one whose record is cited
   above, booted and passed 7/7. The cause of the first attempt's boot
   failure is NOT established by this lane: the run directory that would
   have carried the stack's own log was removed by the tool's cleanup
   before it could be read. It is recorded here as an unexplained
   one-off, not as a row defect, and the cited run is the one that
   completed.
2. **A tool defect in the `--keep` branch, observed here, not a row
   defect.** The second attempt carried `--keep` so the run directory
   would survive, and after the report was written the tool threw
   `ReferenceError: credentialsPath is not defined` at
   `tools/edge-signed-in-exercise.mjs:1503` (the `credentialsPath` binding
   is not in scope in that branch). The checks had already run and their
   record was complete; only the tool's final "run directory kept" line
   failed. Named here so the next lane does not read it as a row failure.

## The deck fingerprint is unchanged

    sha256sum C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    -> 6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78

The same hash the tranche-2 whole-count receipt binds the port's 317 rows
over 16 pages to, re-measured to the same hash at this base, so that
receipt and its re-scope carry over unchanged.

## The four legs, green

Evidence from `report.md.json`, summarised:

1. **The fixture leg.** PASS. Two public term cards, one control, and one
   administrator-only card behind a self read rule
   (`zzovertmvinwczo_adminonly+*self+*read`), the rule granting the
   administrator. All four cards stored.
2. **The viewer-scope leg.** PASS. The administrator's search returns
   `zzovertmvinwczo_adminonly`; the member's does not
   (`adminSeesAdminOnly: true`, `memberSeesAdminOnly: false`).
3. **The accounting leg.** PASS. Every returned row carries the term in
   its own name or its own stored content; the control card, which carries
   it in neither, is absent.
4. **The composition measurement.** PASS. Broad term `card`, 809 deck
   name-or-content matches, 20 rendered rows on the first page, with the
   module's own caveat recorded verbatim: "port-vs-deck on this checkout;
   NOT the oracle's count".

The cleanup legs pass (the owned local stack closed; all 6 journey-created
cards removed, 0 remaining against a baseline of 53052), and the final
browser asset audit passes (3 browser contexts, 0 failures).

## The row's state after this verification

- **No genuine defect surfaced on this row's surface.** The row's own
  instrument is green at this base, and this tranche changed no code on
  this row's path, so there was nothing to fix and no oracle-matched test
  to add. The commit for this row is this report alone.
- **The finding `F-2026-10-16-search-over-match` STAYS OPEN, on the
  measured cause, and the cause is not this lane's to close.** The oracle's
  whole count cannot be taken on this machine's rungs: Decko's `match`
  raises on the sqlite adapter (`card-1.110.0`
  `config/initializers/02_patches/active_record.rb:80-83`), and the MySQL
  rung's three machine-local assets are absent. The named next step is
  unchanged: provision the MySQL-rung assets on the machine that runs the
  oracle, boot the same deck fingerprint there, and record the oracle's
  whole count beside the port's in ONE receipt. That is a machine-side and
  operator-side dependency, not port work.
- **The DONE condition also waits on the guarded live deploy**, blocked on
  the operator arming the files-area pair. Nothing in this tranche
  deploys and nothing touches live.
- **DONE-eligibility is unchanged.** The verdict stays FAIL: the row
  cannot be paired as PASS with bucket DONE while a named remainder
  stands.
