# Known test failures

These suites fail on a clean clone with `npx vitest run`. Each fails identically
on the revision this release was cut from, so none comes from the release
edits. They are listed so a red run is read correctly, not to excuse them.

Failing assertions below are the names as the suites print them, **re-derived
2026-10-11 against this tree, with a gate-closure tip re-derive on 2026-10-12
removing the four rows the candidate build's listedButPassing report
confirmed were green on the worktree**: every row was run once against this
tree, and a row that passed was removed rather than left to rot. One row per
suite; a suite that fails at import lists no assertions because none of its
tests run. A suite that passes is not listed, whatever an older copy of this
file said.

The first cell of every table row is a **backticked path**, and it has to stay
one: `scripts/release-check.mjs` reads this file with
`/^\s*\|\s*`([^`]+)`\s*\|/`, so a row whose first cell is not backticked is not a
row to the release gate — it is a line of prose that looks like one. Such a
row is invisible to the classifier, which then reports the suite as a NEW
failure instead of the accepted baseline. A row here means the suite fails on a
clean clone *and here*; a suite that is merely flaky belongs under
"Environment-flaky suites" below, not in this table.

| Suite | Failing assertions | Prerequisite to green |
|---|---|---|
| `tests/card/mod-loader/card-mod-edit-views.test.ts` | **Two different failures in two different trees, and only one of them is a defect.** *With the capture present*: 4 of 12, all four against `fixtures/captured/edit-views.json` — "WITHOUT the mod: the 16 views are unsupported views" — the render resolves where the suite expects `UnsupportedViewError`; and three byte comparisons against the captured oracle — "WITH the mod: the seeded member stand-in (plain member) - member verdicts split the arms like the oracle", "WITH the mod: anonymous - the perms views deny quietly, the rest renders the full bytes", "WITH the mod: the seeded member stand-in - the board family matches the oracle bytes". *Without it* (a clean clone, where `fixtures/captured/` is on the exclusion list): **the suite SKIPS, and announces the skip.** Both fixtures were read at module scope, before any describe existed, so the missing file threw ENOENT during import and the run reported a failed suite with `no tests` — a missing prerequisite read as an engine defect. The reads are now gated on the fixtures' presence (`CAPTURES_PRESENT`) and the describe is gated with `describeOrSkipLoud`. Measured by moving both fixtures aside and running the suite: `[corpus-gated] NOT RUN: suite in tests/card/mod-loader/card-mod-edit-views.test.ts — needs data or setup that a clean clone does not have. Gate not satisfied: fixtures/captured/{board-views,edit-views}.json`, then `Test Files 1 skipped (1)`, `Tests 12 skipped (12)`. | **Without the capture: nothing — the suite is not evidence there and its failure is a missing fixture, not an engine defect.** With the capture: **an engine fix, not a re-record.** All three byte failures are one root cause: the engine emits a guide edit-link the capture does not have — `<span class='d-none'><a … class="edit-link" … href="/*all+*guide/rule_edit">` inside `<div class="guide-text">` — on the `:overlay_guide` view of "Oracle Basics" (the seeded member and anonymous arms) and on the board's guide view (the seeded member arm). The administrator arm passes. The gate is `prependGuideEditLink` (`src/card/mod-loader/mods/card-mod-edit.ts:1568-1569`), and it can only deny: `taskAllowed?.(guideCard, "update")` returning `false` is what suppresses the link. `RenderEngine.taskAllowed` (`src/card/render.ts:6853-6856`) returns `alwaysOk` when the actor passes everything, and otherwise a lookup in `taskVerdicts` — `undefined` for any card no prepare step has computed. The guide rule card is nested, not a render root, so the lookup misses, the deny-only gate does not fire, and the link renders for every actor; that is exactly the split the output shows. The suite seeds the stand-in on purpose (a `*guide+*right` Set card plus an `*update` rule naming Administrator, `tests/card/mod-loader/card-mod-edit-views.test.ts:436-449`) so the member and anonymous arms deny, and today they do not. **This is a signed-in-editing parity regression: the captured oracle bytes are the reference, and re-recording them would overwrite the only signed-in-editing evidence with the engine's current output.** Open. |
| `tests/card/mod-loader/card-mod-follow-views.test.ts` | 1 of 8: ":edit_buttons on *follow defaults is UNREACHABLE in Ruby too (self/follow_defaults.rb:49-55 — the module constant vs the singularized self-anchor token)" — expects the render to reject, as Ruby's does; the engine renders the anonymous-denial span instead | the Ruby self-anchor token behavior ported, so the view is unreachable here too; open |
| `tests/card/mod-loader/card-mod-edit-forms.test.ts` | 2 oracle byte pins on the signed-in edit path: ":edit_form matches the oracle bytes (both cards)" and ":edit matches the oracle modal bytes (both cards)" — the merged engine's edit-link region renders the board_type_formgroup link where the pinned bytes differ | known on the completion line (int-100) at its own tip — its merge ledger carries the full-suite debt; carried unchanged at the converge; owner: the completion line's edit-form re-pin |
| `tests/card/mod-loader/card-mod-account-harness-probe.test.ts` | 1 of its oracle replays: "replays account_tab's pill sections" — the wave-1 harness-probe replay's account-tab arm | known on the completion line (int-100) at its own tip — its merge ledger carries the full-suite debt; carried unchanged at the converge; owner: the completion line's probe re-pin |
| `tests/card/mod-loader/card-mod-follow-harness-probe.test.ts` | 4: "replays the errors arms (user/follow.rb:65-78)" and three subedit_notice renders (explicit action_id, the renamed-update action, no action_id) | known on the completion line at its own tip; carried unchanged at the converge; owner: the completion line's probe re-pin |
| `tests/card/mod-loader/core-mod-admin-views.test.ts` | 1: view :warning — "resets to the Rails default (perform_deliveries true)" | known on the completion line at its own tip; carried unchanged at the converge; owner: the completion line's admin-views re-pin |
| `tests/tools/persist-write-probe.test.ts` | 1: "runs the Ruby op list through the real CardActionEngine and dumps..." (the probe's TS half) | known on the completion line at its own tip; carried unchanged at the converge; owner: the completion line's probe runner |

## Rows removed on 2026-10-11, re-derived against this tree

A row that passes is not a known failure. These were listed before this
re-derivation and no longer are:

- **`tests/tools/shadow/migration-parity-shadow.test.mjs`** — ran THREE times
  alone on 2026-10-11 and passed every time: `Test Files 1 passed (1)`,
  `Tests 68 passed (68)`, no failing assertions. The entry described a
  *varying* subset — "3, then 6, of 68 across three re-runs, different names
  each time" — which was itself the tell that the failures came from this
  environment rather than from the code.

## Rows removed on 2026-10-12, gate-closure re-derive

The gate-closure tip re-derives this file against itself; rows the candidate
build (#33) listed as passing but which the per-file protocol confirms are
still failing stay. The 4 that passed against the gate-closure tip:

- **`tests/deploy/bunny-edge-session-viewer-roundtrip.test.ts`** — re-run
  2026-10-12 against the gate-closure tip: `Tests 1 passed (1)`,
  `Test Files 1 passed (1)`. The stale-pin was re-anchored.
- **`tests/card/mod-loader/card-mod-carrierwave.test.ts`** — re-run
  2026-10-12 against the gate-closure tip: 1 test passed. The
  `image :content_changes` pin moved to the recorded bytes.
- **`tests/card/mod-loader/card-mod-list-checkbox-editor.test.ts`** —
  re-run 2026-10-12 against the gate-closure tip: all 5 tests passed. The
  `*input_type` checkbox dispatch and the four sibling arms the row named
  now match.
- **`tests/card/render/signed-in-parity.test.ts`** — re-run 2026-10-12
  against the gate-closure tip: 1 test passed (the signed-in comment box
  carries neither the reCAPTCHA nor the author field, the original row's
  claim).

The other four named by the rebuild's `listedButPassing` remain in the
table because they still fail on the gate-closure tip:
`tests/card/mod-loader/card-mod-edit-views.test.ts`,
`tests/card/mod-loader/card-mod-edit-forms.test.ts`,
`tests/card/mod-loader/card-mod-account-harness-probe.test.ts`,
`tests/card/mod-loader/card-mod-follow-harness-probe.test.ts`.

Environment-flaky suites: red in a full run, green alone

These are not in the table above, because a table row means a suite that fails
on a clean clone and here does not. They fail under load and pass alone, and
the distinction matters because the release gate runs stages that compete for
the machine.

- **`tests/card/actions/atomic-saves.test.ts`** — **environment-flaky.** It
  passes alone (44 of 44) and failed once inside a concurrent full-suite run;
  its first-use engine build races the shared `tmp` state, so it goes red when
  the machine is busy and green when it is not. The failing subset has not been
  characterised, so this entry is a report rather than a characterised pin: if
  a red result names this suite, re-run it alone before believing it. If it
  goes red alone, that is a real failure and belongs in the table above with a
  re-run record attached.

- **`tests/exercise/accounts-3.test.ts`** — **environment-flaky.** Passes
  alone; failed once inside a concurrent candidate-gate run (shared tmp state
  during the auth setup race), 2026-10-12. If a red result names this suite,
  re-run it alone before believing it. If it goes red alone, that is a real
  failure and belongs in the table above with a re-run record attached.

- **`tests/card/auth/first-run-setup-endpoint.test.ts`** —
  **environment-flaky.** Passes alone; failed once inside a concurrent
  candidate-gate run, same class as accounts-3, 2026-10-12. If a red result
  names this suite, re-run it alone before believing it. If it goes red alone,
  that is a real failure and belongs in the table above with a re-run record
  attached.

- **`tests/tools/shadow/migration-parity-shadow.test.mjs`** —
  **environment-flaky.** It failed in a full-tree run (the round-7 review's
  run) and passes alone: re-run 2026-10-11 here three times,
  `Tests 68 passed (68)` each time, no failing assertions. The failing subset
  varied between runs and named different tests each time, which is the
  signature of contention rather than a regression — the suite drives a stub
  instrument that spawns processes and shares the machine with whatever else
  is running. If a red result names this suite, re-run it alone before
  believing it. If it goes red alone, that is a real failure and belongs in the
  table above with a re-run record attached.

## Suites that are easy to mistake for a failure, and what they really do

- **`tests/tools/mod-porting-harness/format-census-view-set.test.ts`** — this
  suite is gated on an absolute path to the gem tree that recorded it, so it
  behaves in two different ways and **the wrong one is the failure**. On a
  machine that has that tree it runs and, re-run 2026-10-11 here, it passes 5
  of 5. On a machine that does not, it does **not** skip: Vitest evaluates a
  `describe.skip` body to collect the test names, the suite's `rubyCensus()`
  call sits at the top of that body rather than inside a test, and the Ruby
  oracle aborts on a directory that is not there. The file is then reported as
  a **failed suite with no tests run**, carrying the oracle's own message —
  `ruby oracle failed (1): set dir not found: <the absolute gem path the suite
  was written against>`. An earlier version of this file called that a skip;
  it is not, and the failure names a missing prerequisite rather than a defect.
  Reproduced 2026-10-11 with a probe carrying the suite's exact structure and
  a gem path that is not installed: `Test Files 1 failed (1)`, `Tests no
  tests`. It fails the same way with no Ruby on `PATH` at all — `spawnSync`
  returns a null status and the same guard throws.

- **`tests/server/blob-bunny-mock.test.ts`** — **known flaky, not a real
  failure.** It failed with `fetch failed` in at least one full-tree run, which
  is what a loopback mock server losing its port under load looks like; the
  suite starts its own mock on a loopback port in `beforeAll` and stops it in
  `afterAll`. It passes alone: re-run 2026-10-11, `Tests 31 passed (31)` in
  4.37 s. It also passed inside its whole directory on the same day
  (`npx vitest run tests/server/`: 27 files passed, 1 skipped, 334 tests
  passed, 35.39 s), so **the full-run failure was not reproduced here** and is
  recorded as a report to investigate, not as an observed failure. Re-run it
  alone before believing a red result from this file.
| `tests/tools/side-effects-scenario-battery.test.ts` | 1: the 90-step trace run — the engine's declared-divergence set reads 2 of the recorded 4 on this machine | the 90-step Ruby trace and its declared-divergence table predate the oracle-arbitrated write-path convergence (d1e9658c lineage, certified by the v1 grade's six ledgers); the battery's own hybrid state (converged engine, pre-convergence trace) is unsound by construction and needs a re-record against the converged engine, not an engine change — the round-9 candidate passes it because its engine predates the convergence fixes | owner: the battery re-record lane; the v1 write-battery grade remains the write-path instrument of record |
