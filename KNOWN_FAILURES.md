# Known test failures

These suites fail on a clean clone with `npx vitest run`. Each fails identically on
the integration branch this release was cut from, so none comes from the release
edits. They are listed so a red run is read correctly, not to excuse them.

Failing assertions below are the names as the suites print them, **re-derived
2026-10-11 on `integration-2026-10-08`**: every row was run once against this
tree, and a row that passed was removed rather than left to rot. One row per
suite; a suite that fails at import lists no assertions because none of its
tests run. A suite that passes is not listed, whatever an older copy of this
file said.

| Suite | Failing assertions | Prerequisite to green |
|---|---|---|
| `tests/card/content/mod-object-address-shape-parity.test.ts` | 2 of 9: "the corpus holds the one card whose record content is a Cardio::Mod address list" and "(f) every OTHER byte matches the raw corpus — address-normalized on both sides", both failing with `corpus shard-000039 must carry the Mod record content: expected undefined to be defined` | a corpus whose shard-000039 carries the Mod record card; the committed miniature corpus does not |
| `tests/card/mod-loader/card-mod-edit-views.test.ts` | 4 of 12: "WITHOUT the mod: the 16 views are unsupported views" (expects the render to reject, it resolves); "WITH the mod: tova stand-in (plain member) - member verdicts split the arms like the oracle"; "WITH the mod: anonymous - the perms views deny quietly, the rest renders the full bytes"; "WITH the mod: tova stand-in - the board family matches the oracle bytes" (the last three: rendered bytes differ from the oracle pins) | re-recorded oracle pins (or restored bytes) for the mod-loaded edit views, whose output changed when the board and edit views were compiled into the view registry; open |
| `tests/card/mod-loader/card-mod-follow-views.test.ts` | 1 of 8: ":edit_buttons on *follow defaults is UNREACHABLE in Ruby too (self/follow_defaults.rb:49-55 — the module constant vs the singularized self-anchor token)" — expects the render to reject, as Ruby's does; the engine renders the anonymous-denial span instead | the Ruby self-anchor token behavior ported, so the view is unreachable here too; open |
| `tools/cf-cost/measure-render-reads.test.ts` | 1 of 1: "before vs after: read accounting, byte parity, write accounting" — the 32-level chain fixture renders without its deepest content (`expected '<div id="depth_root-content-view" cla…' to contain 'The deepest content of the 32-level c…'`) | the depth-32 render fix; open |
| `tools/oracle/verify-dual-lane.test.ts` | none — the file fails at import: `Cannot find module '../../../src/testing/replay.js' imported from C:/localProjects/decko-ts-integration/tools/oracle/verify-dual-lane.test.ts`, so no test of its own runs | the test imports a module that no longer exists; rewrite it against the current replay surface or retire it; open |

## Rows removed on 2026-10-11, re-derived against this tree

A row that passes is not a known failure. These were listed before this
re-derivation and no longer are:

- **`tests/tools/shadow/migration-parity-shadow.test.mjs`** — ran THREE times
  on 2026-10-11 (9.25 s each) and passed every time: `Test Files 1 passed (1)`,
  no failing assertions. The entry described a *varying* subset — "3, then 6, of
  68 across three re-runs, different names each time" — which was itself the
  tell that the failures came from this environment rather than from the code.
  In this environment the stub-instrument execute run produces its triage
  artifacts and the suite is green. If it goes red again it is environment,
  not a regression, and it belongs back in this table only with a re-run
  record attached.

## Suites that are NOT failures, and why they are easy to mistake for one

- **`tests/tools/mod-porting-harness/format-census-view-set.test.ts`** — this
  suite is gated on an absolute path to the oracle machine's gem tree
  (`C:/Ruby33-x64/.../card-mod-format-0.20.0`), so on a machine without it the
  suite skips. It is a skip, not a failure: a skipped suite is reported in the
  run's skipped count, never in the failed count. Re-run 2026-10-11 on this
  machine the gem tree is present and it **passes 5 of 5**, so it is not listed
  here at all.