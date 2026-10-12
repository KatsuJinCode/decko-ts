# Known test failures
| `tests/card/actions/atomic-saves.test.ts` | passes alone (44 of 44); failed once inside a concurrent full-suite run on the candidate gate (its first-use engine build races the shared tmp state) | 2026-10-11 |

These suites fail on a clean clone with `npx vitest run`. Each fails identically
on the revision this release was cut from, so none comes from the release
edits. They are listed so a red run is read correctly, not to excuse them.

Failing assertions below are the names as the suites print them, **re-derived
2026-10-11 against this tree**: every row was run once against this tree, and
a row that passed was removed rather than left to rot. One row per suite; a
suite that fails at import lists no assertions because none of its tests run. A
suite that passes is not listed, whatever an older copy of this file said.

| Suite | Failing assertions | Prerequisite to green |
|---|---|---|
| `tests/card/content/mod-object-address-shape-parity.test.ts` | 2 of 9: "the corpus holds the one card whose record content is a Cardio::Mod address list" and "(f) every OTHER byte matches the raw corpus — address-normalized on both sides", both failing with `corpus shard-000039 must carry the Mod record content: expected undefined to be defined` | a corpus whose shard-000039 carries the Mod record card; the committed miniature corpus does not |
| `tests/card/mod-loader/card-mod-edit-views.test.ts` | **Two different failures on two different trees, and only one of them is a defect.** *In the private repository* (fixture present): 4 of 12, all four against `fixtures/captured/edit-views.json` — "WITHOUT the mod: the 16 views are unsupported views" — the render resolves where the suite expects `UnsupportedViewError`; and three byte comparisons against the captured oracle — "WITH the mod: tova stand-in (plain member) - member verdicts split the arms like the oracle", "WITH the mod: anonymous - the perms views deny quietly, the rest renders the full bytes", "WITH the mod: tova stand-in - the board family matches the oracle bytes". *In the public package*: **the suite does not run at all** — `fixtures/captured/` is on the exclusion list, and the fixture is read at module scope (`tests/card/mod-loader/card-mod-edit-views.test.ts:100-104`), so it fails at import with `ENOENT: no such file or directory, open 'fixtures/captured/edit-views.json'` and reports `no tests`. Reproduced 2026-10-11 by moving the fixture aside and running the suite: `Test Files 1 failed (1)`, `Tests no tests`. | **For the public package: nothing — the suite is not evidence there and its failure is a missing fixture, not an engine defect.** For the private repository: **an engine fix, not a re-record.** All three byte failures are one root cause: the engine emits a guide edit-link the capture does not have — `<span class='d-none'><a … class="edit-link" … href="/*all+*guide/rule_edit">` inside `<div class="guide-text">` — on the `:overlay_guide` view of "Oracle Basics" (tova and anonymous arms) and on the board's guide view (tova). The administrator arm passes. The gate is `prependGuideEditLink` (`src/card/mod-loader/mods/card-mod-edit.ts:1568-1569`), and it can only deny: `taskAllowed?.(guideCard, "update")` returning `false` is what suppresses the link. `RenderEngine.taskAllowed` (`src/card/render.ts:6853-6856`) returns `alwaysOk` when the actor passes everything, and otherwise a lookup in `taskVerdicts` — `undefined` for any card no prepare step has computed. The guide rule card is nested, not a render root, so the lookup misses, the deny-only gate does not fire, and the link renders for every actor; that is exactly the split the output shows. The suite seeds the stand-in on purpose (a `*guide+*right` Set card plus an `*update` rule naming Administrator, `tests/card/mod-loader/card-mod-edit-views.test.ts:436-449`) so the member and anonymous arms deny, and today they do not. **This is a signed-in-editing parity regression: the captured oracle bytes are the reference, and re-recording them would overwrite the only signed-in-editing evidence with the engine's current output.** Open. |
| `tests/card/mod-loader/card-mod-follow-views.test.ts` | 1 of 8: ":edit_buttons on *follow defaults is UNREACHABLE in Ruby too (self/follow_defaults.rb:49-55 — the module constant vs the singularized self-anchor token)" — expects the render to reject, as Ruby's does; the engine renders the anonymous-denial span instead | the Ruby self-anchor token behavior ported, so the view is unreachable here too; open |
| `tools/cf-cost/measure-render-reads.test.ts` | 1 of 1: "before vs after: read accounting, byte parity, write accounting" — the 32-level chain fixture renders without its deepest content (`expected '<div id="depth_root-content-view" cla…' to contain 'The deepest content of the 32-level c…'`) | the depth-32 render fix; open |
| `tools/oracle/verify-dual-lane.test.ts` | none — the file fails at import: `Cannot find module '../../../src/testing/replay.js' imported from tools/oracle/verify-dual-lane.test.ts`, so no test of its own runs | the test imports a module that no longer exists; rewrite it against the current replay surface or retire it; open |

## Rows removed on 2026-10-11, re-derived against this tree

A row that passes is not a known failure. These were listed before this
re-derivation and no longer are:

- **`tests/tools/shadow/migration-parity-shadow.test.mjs`** — ran THREE times
  alone on 2026-10-11 and passed every time: `Test Files 1 passed (1)`,
  `Tests 68 passed (68)`, no failing assertions. The entry described a
  *varying* subset — "3, then 6, of 68 across three re-runs, different names
  each time" — which was itself the tell that the failures came from this
  environment rather than from the code.

## | `tests/deploy/bunny-edge-session-viewer-roundtrip.test.ts` | the anonymous home-site-shell golden pin is 19 bytes stale since the demo account read rules shipped (migration 0009 adds cards the shell capture predates): fixture 4528 bytes vs the pinned 4547; proven pre-existing at the round-9 base commit in a clean worktree; re-anchor queued | 2026-10-11 |
Environment-flaky suites: red in a full run, green alone

These are not in the table above, because a table row means a suite that fails
on a clean clone and here does not. They fail under load and pass alone, and
the distinction matters because the release gate runs stages that compete for
the machine.

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
