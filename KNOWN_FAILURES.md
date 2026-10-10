# Known test failures

These suites fail on a clean clone with `npx vitest run`. Each fails identically on
the integration branch this release was cut from, so none comes from the release
edits. They are listed so a red run is read correctly, not to excuse them.

Failing assertions below are the names as the suites print them, re-run
2026-10-08 on `integration-2026-10-08`. One row per suite; a suite that fails
at import lists no assertions because none of its tests run. A suite that
passes is not listed, whatever an older copy of this file said.

| Suite | Failing assertions | Prerequisite to green |
|---|---|---|
| `tests/card/content/mod-object-address-shape-parity.test.ts` | 2 of 9: "the corpus holds the one card whose record content is a Cardio::Mod address list" and "(f) every OTHER byte matches the raw corpus — address-normalized on both sides", both failing with `corpus shard-000039 must carry the Mod record content: expected undefined to be defined` | a corpus whose shard-000039 carries the Mod record card; the committed miniature corpus does not |
| `tests/card/mod-loader/card-mod-edit-views.test.ts` | 4 of 12: "WITHOUT the mod: the 16 views are unsupported views" (expects the render to reject, it resolves); "WITH the mod: sara stand-in (plain member) - member verdicts split the arms like the oracle"; "WITH the mod: anonymous - the perms views deny quietly, the rest renders the full bytes"; "WITH the mod: sara stand-in - the board family matches the oracle bytes" (the last three: rendered bytes differ from the oracle pins) | re-recorded oracle pins (or restored bytes) for the mod-loaded edit views, whose output changed when the board and edit views were compiled into the view registry; open |
| `tests/card/mod-loader/card-mod-follow-views.test.ts` | 1 of 8: ":edit_buttons on *follow defaults is UNREACHABLE in Ruby too (self/follow_defaults.rb:49-55 — the module constant vs the singularized self-anchor token)" — expects the render to reject, as Ruby's does; the engine renders the anonymous-denial span instead | the Ruby self-anchor token behavior ported, so the view is unreachable here too; open |
| `tools/cf-cost/measure-render-reads.test.ts` | 1 of 1: "before vs after: read accounting, byte parity, write accounting" — the 32-level chain fixture renders without its deepest content (`expected ... to contain 'The deepest content of the 32-level c…'`) | the depth-32 render fix; open |
| `tests/tools/shadow/migration-parity-shadow.test.mjs` | a varying subset of the "CLI end-to-end with the stub instrument (execute runs)" and "view-lane end-to-end" tests fails per run — 3, then 6, of 68 across three re-runs, different names each time (recurring ones: "divergent bodies without a reference: every route UNATTRIBUTED, verdict not-clean, exit 2", "divergent routes leave triage artifacts (base.html + candidate.html + meta.json)", "the gate needs N consecutive clean runs in the SAME out dir (N=2 across two runs)"), with count assertions coming back 0 (`expected +0 to be 5`) and artifact checks false (`expected false to be true`) | the stub-instrument execute run produces no triage artifacts in this environment, so every assertion over its output is read from an empty state; diagnose the execute path locally; open |
| `tools/oracle/verify-dual-lane.test.ts` | none — the file fails at import: `Cannot find module '../../../src/testing/replay.js'` (`verify-dual-lane.test.ts:85`), so no test of its own runs | the test imports a module that no longer exists; rewrite it against the current replay surface or retire it; open |
