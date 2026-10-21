# [Family] tranche 3, 2026-10-21: rows B6, B8, B9, B13, C4, C5, C6, C7

Lane: `port/routes-tranche-20261020` in the local worktree directory
`C:/localProjects/decko-ts-routes-tranche-20261020` (a git worktree of the
canonical clone `C:/localProjects/decko-ts-release-lead`, registered in its
worktree list; `git worktree add` is gate-blocked, so this directory is the
lane's named layout). Retire the directory when the tranche merges. The
branch tip moved d6b45030 to 0a71e54c; every commit is pushed
forward-only to origin (KatsuJinCode/decko-ts).

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| B6 `setup` before_action | e8d240bd | PARTIAL held, now measured. The pinned method's three actions and its `explicit_file` gate are executed; the port's gate seam and request scope are pinned; the serving host's missing asset refresh is now a test-asserted gap, not a doc claim. |
| B8 `*previous` mark | e4e0dc4d | Read path PORTED on this branch. The pinned `interpret_mark` + `previous_location` + `hard_redirect` executed over three cases; both serving hosts answer 302 absolute / `{redirect: url}` at mark-resolution time, pre-load_card. |
| B9 `implicit_mark` ladder | e216493a | PARTIAL held with its named remainder CLOSED: the staging host now reads the `?mark=` query first (the edge's rule). New named divergence: an empty `?mark=` answers Home on both hosts while the pinned `interpret_mark("")` answers the empty mark. |
| B13 `record_as_main` | 5f8db61b | PORTED on this branch (focal override + carry-forward + both hosts), with the pinned method executed over four cases including the empty-param one, and a negative check (edge call disabled: 3 of 4 legs fail). |
| C4 `reload` arm | 5f292601 | Route-level honor PORTED to every save arm. Held PARTIAL only on the mods-family remainder (the ported mod views do not emit `success[reload]`). |
| C5 `slotter_magic?` | 5f292601 | PORTED on the same cud lattice; the pre-change zero-hit grep over src/ and deploy/ (only the views.ts `data-slotter-mode` attribute) is the measured pre-state. |
| C6 `*home` rule mark | 06a56925 | PORTED held. The capture adds the pinned seed's own `*home` row (content "Home") and the as_bot read shape, executed over set/blank/missing. |
| C7 markless `PUT /` | 0a71e54c | PORTED held. The capture executes the pinned route table, the uri_fetch mark rule and the update dispatch: body name IS the mark; body-less fetches nil and stops at NotFound; a missing card's update takes the CREATE branch (save!, not update!). |

One deviation from one-commit-per-row, stated plainly: C4 and C5 share
commit 5f292601 because a single atomic change implements both (one
if/elsif lattice cannot be half-landed without an artificial intermediate
state Ruby never had). The commit message names both rows.

## Captures (all byte-stable on re-run, verified this session)

New: setup-before-action, previous-mark, implicit-mark, record-as-main,
cud-reload-slotter, home-mark, markless-update. All 21 captures
(`for s in ...; do ruby tests/server/oracle-capture-$s-ruby.rb | diff - fixtures/...; done`)
re-generated IDENTICAL against their committed fixtures, including the
fourteen that predate this tranche.

## Battery (final state, run this session)

- `npx vitest run tests/server/`: 70 files, 658 passed, 1 failed, 14
  skipped. The failure is tests/server/drivers/mysql-lifetime.test.ts
  (force-killed mysqld teardown timing under full-suite load); it passes
  alone (`npx vitest run tests/server/drivers/mysql-lifetime.test.ts`: 2
  passed) and builds none of this lane's files.
- `npx vitest run tests/deploy/`: 83 files, 657 passed, 1 failed, 10
  skipped. The failure is tests/deploy/worker-edge-cache-runtime.test.ts
  ("armed; cache=miss; not-stored"), the pre-existing environmental
  failure this branch already carried at d6b45030; its import closure
  (205 files, computed over deploy/worker.ts) contains none of the files
  this tranche touched.
- `npx tsc --noEmit`: clean.
- Skipped/not-run suites are the checkout's missing-data gates, listed by
  the runner itself.

## Rig growth (additive; no other row's evidence moved)

The shared rig (tests/server/oracle-capture-pinned-deck-harness-ruby.rb)
grew: recording Card::Env.reset/session/origin/previous_location
(delegating to the pinned history module when loaded), the success
envelope's reload?/redirect/target answers, Card::Auth.as_bot, Card[] as a
recorded codename/name lookup, and the pinned location modules loader.
One intermediate draft of the Success#in_context change moved two other
rows' recorded redirect targets (get-action-routes, markless-delete-route
fixtures diffed); it was reverted and the context name is recorded
separately from the envelope name. The forgery-posture fixture does not
regenerate byte-identically on this machine and did not before this
tranche: content is identical after line-ending normalization (committed
LF, this Ruby writes CRLF).

## Not done / not verified

- No roster fold: the completeness roster lives in the brandonDojoTech
  repo and is folded by that repo's own guarded scripts; this lane's
  dispositions above are the fold inputs.
- The pre-port behavior of B8's read arm on THIS branch was not measured
  (no disabled-arm negative check was run for it); B13's negative check
  WAS run (3 of 4 legs fail with the edge call disabled).
- Nothing deployed; no processes started beyond the test runner's own.
