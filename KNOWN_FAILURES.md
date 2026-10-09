# Known test failures

These suites fail on a clean clone with `npx vitest run`. Each fails identically on
the integration branch this release was cut from, so none comes from the release
edits. They are listed so a red run is read correctly, not to excuse them.

| Suite | What fails | Cause |
|---|---|---|
| `tests/card/content/mod-object-address-shape-parity.test.ts` | the corpus row the test reads is absent | the committed miniature corpus does not carry that row |
| `tests/card/mod-loader/card-mod-edit-views.test.ts` | four oracle byte pins (the guide text gains an edit-link span; the history tab loses its creator credit) | output differences in the mod-loaded path since the board and edit views were compiled into the view registry; open |
| `tests/card/mod-loader/card-mod-follow-views.test.ts` | `:edit_buttons` on `*follow defaults` renders the buttons | Ruby renders the anonymous-denial span there; same cause as above; open |
| `tests/deploy/bunny-edge-signin-session-roundtrip.test.ts` | the file errors before its tests run | open |
| `tools/cf-cost/measure-render-reads.test.ts` | the 32-level chain fixture renders without its deepest content | open |
| `tools/oracle/verify-dual-lane.test.ts` | imports a module that no longer exists | stale test; open |
