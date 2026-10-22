# Full candidate v12: the five-lane roll, 2026-10-22

The wave's assignment: roll five frozen lane tips into the full integration
candidate (worktree `C:/localProjects/decko-ts-full-candidate-20261020`),
verify containment, merge, rebuild conflicts by regions, gate (typecheck plus
`node tools/test-gates.mjs run correctness`, failure set must equal the empty
baseline), rebuild the engine bundle, record SHA-256 and bytes, push. Nothing
deploys.

Three of the assignment's stated premises did not survive measurement, and all
three are recorded below with the evidence rather than smoothed over: the named
base commit was no longer the worktree HEAD, one named tip was unreachable
until a fetch, and three named tips were behind their branches' real tips. Two
of the assignment's predictions held: the engine bundle did move, and the
typecheck baseline is zero output lines.

## The base: the assignment's commit was behind the checkout

The assignment named `deploy/full-candidate-20261020` at `ade71b9d` as the
base, and called that commit v11. `ade71b9d` is real and is real v11: it is
`origin/deploy/full-candidate-20261020`'s tip, and its own message is "Merge
port/matrix-journey-tranche7-20261021 (b80dfd18) into the v11 full integration
candidate".

But the checkout was not on that branch. It was on a newer branch,
`deploy/full-candidate-20261021-v11`, at `bf86e09a`, which is `ade71b9d` plus
two landed commits:

| commit | subject |
| --- | --- |
| 0580d982 | Serialize battery engine emission and asset copying with endpoint builds |
| bf86e09a | Write JUnit results from the default test configuration |

`git merge-base --is-ancestor ade71b9d bf86e09a` returns true. Merging onto
`ade71b9d` as the assignment was literally written would have dropped both
commits from the candidate line.

The lane was asked which base to use and the question was declined, so the
roll proceeded on `bf86e09a`: the forward direction that preserves the two
landed commits. `ade71b9d` and both commits remain reachable on
`origin/deploy/full-candidate-20261020` and
`origin/deploy/full-candidate-20261021-v11`, so nothing was deleted.

A consequence worth stating: the assignment's recorded baseline of "683 files,
6634 passed, 227 skipped" was measured at `ade71b9d`, one commit before the
two above. The gate this lane held is the invariant the assignment named as
the gate, the EMPTY failure set, not the file count. The counts are reported
below as measured.

## The frozen set and the containment verdicts

All tips were verified AFTER `git fetch --all --prune`. That fetch mattered:
before it, `origin/port/routes-tranche8-20261022` did not exist in the local
clone and its frozen tip `eb02e31fd` resolved to "Needed a single revision".
A conclusion drawn from the unfetched clone would have been wrong.

| branch | frozen tip | tip verified | merge commit |
| --- | --- | --- | --- |
| port/routes-tranche8-20261022 | eb02e31fd | eb02e31fd (exact) | 1fa8cbd6 |
| port/matrix-journey-tranche8-20261022 | 149d0721 | d07a4b1a (one commit ahead) | a2889d3a |
| port/capability-tranche6-20261022 | 3cd58cdd | 828d145e (one commit ahead) | 06a5634b |
| port/oracle-followers-address-settle-20261022 | fe2a70b1 | a3073a96 (one commit ahead) | d6b4219f |
| port/savepath-transport-packing-20261022 | (tip given by name only) | 08d59814 | 68779edc |

Three frozen SHAs were behind their branches' real tips. In every case the
commit the frozen SHA was behind is the same one commit, titled "Write JUnit
results from the default test configuration", touching the same two files
(`.test-results/.gitignore`, `vitest.config.ts`) that `bf86e09a` already
carries. So the extra commit is the base's own change, not new lane work:
merging the real tips instead of the frozen ones added no port content and
lost none. The lane merged the real tips.

At wave start none of the five was contained in the candidate
(`git merge-base --is-ancestor <tip> bf86e09a` false for all five). After the
roll all five verify as ancestors of the roll HEAD.

## The conflicts, resolved by region

Twenty-three regions across eleven files. Every region was decided by reading
both sides, not by pattern. The decisions:

| file | blocks | decision | why |
| --- | --- | --- | --- |
| vm-staging-server.mjs | 5 | ours x4, theirs x1 | see below |
| tests/deploy/staging-rss-format-d3.test.ts | 6 | ours | identical to ours apart from dash style |
| tools/edge-signed-in-exercise.mjs | 1 | union | each side added different imports |
| tools/edge-signed-in-exercise/capabilities.json | 2 | theirs | lane's finding supersedes, row moves partial to covered |
| tools/edge-signed-in-exercise/checks-account-signup.mjs | 3 | theirs | lane's codename-resolved anchor replaces our hardcoded literal |
| tools/edge-signed-in-exercise/checks-cover-b.mjs | 2 | ours | both blocks are ours-only content |
| tools/edge-signed-in-exercise/lib/harness-browser.mjs | 1 | union | ours' asset-observation functions are absent from theirs |
| tools/edge-signed-in-exercise/lib/unfollow-from-board.mjs | 3 | theirs | lane adds hrefRaw, ours' line is the pre-fix version |
| tools/edge-signed-in-exercise/test/unfollow-from-board.test.mjs | 1 | theirs | ours has no content in the block |
| docs/runs/edge-signed-in-exercise-afix-legs-2026-10-21.md | 9 | ours | identical apart from dash style |

The `vm-staging-server.mjs` case is the one worth reading. v11 and the routes
lane had INDEPENDENTLY added the same rss support: both sides carry
`isRssRequest` and `rssFormatResponse` at their own line numbers. The two
blocks are byte-identical once the dash character is normalized
(`diff` over the extracted block exits 0), so v11 already held this lane's
work and taking ours loses nothing. Four of the five regions were pure dash
differences. The fifth was not: ours carried a malformed
`` `?<format=rss` `` where the lane has the correct `` `?format=rss` ``, so
that region takes theirs. That single character pair is the only substantive
edit this lane made to that file.

Two resolutions are records, not code, and are called out because a reader
diffing the row would see text disappear:
`capabilities.json` takes the lane's finding for the TinyMCE toolbar row,
which appends the capability-inventory afix result and moves the row's status
from `partial` to `covered`. In taking it, our side's two annotations on that
row (the `[2026-10-21 v8 roll] THE PRIOR ROW STATE, KEPT` note and the
`[2026-10-20 capability-legs battery]` note) are superseded rather than
carried alongside. The lane's finding keeps the earlier text up to its own
`STATUS: still partial` and then reports the newer run.

## The bundle: it moved

The assignment predicted the engine bundle would move, and it did, because the
save-path packing lane changed `src/card/drivers/bunny-db.ts` and siblings.
Rebuilt with `node tools/bundle-bunny-edge-engine.mjs`, exit 0.

| artifact | bytes before | bytes after | delta |
| --- | --- | --- | --- |
| bunny-edge-engine.bundle.js | 7359901 | 7365497 | +5596 |
| bunny-edge-engine.code.json | 7498985 | 7504685 | +5700 |

| artifact | SHA-256 before | SHA-256 after |
| --- | --- | --- |
| bunny-edge-engine.bundle.js | 158670dba8101df49ae2432ec4bbe40a5dbb9149f3ddbb5fe46e42f0c579e85f | 536ba2ef1793c41b8d607ffb57d588772bc7ee001b4d6857bbf5a330c17d81e9 |
| bunny-edge-engine.code.json | 32ae805f6c47d5def72b117a5104038d7a4e3128ce0ec0684f71a19f70010dc3 | 1deecae0f1b3c2077a668d00a4dd444aad4b4fc75a5358bd3c8a697d6bd79fd3 |
| bunny-edge-read.bundle.js | b8c884c29cfc366c3dc5ac9b67498b0854eaba4e95010ff102127925d9200154 | 36210d6b060a935d30a4fc54c73aa7868c4f574f84e83cf33c5edb91b4ce30db |
| bunny-edge-read.code.json | 8845d86b0360ca4ced95aa44449ce6cfab7a9c2a643cc7c21982d63e089469da | f5ddc99d434b2efff75411edeb310c02d72320987bc09773d502bad1d6b3110a |

The pre-merge engine hash matches the value the v11 lane recorded in
`tmp/bundle-sha-before.txt`, so the "before" is the real v11 artifact and not a
rebuild that drifted. The build warns that the bundle is over 80% of the
conservative 7600000-byte script limit (7365497 bytes = 96.9%). Nothing
deploys, so this is a fact for the record, not an action.

`deploy/dist/` is gitignored (`.gitignore:2`), so the bundles are build
artifacts and do not appear in the commit. The hashes above are the record.

## The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**
(`tmp/tsc-v12.txt`, 0 lines). The v11 baseline is zero lines, so this matches.

Correctness, `node tools/test-gates.mjs run correctness`: **run 2 decided.**

Run 1 (`tmp/correctness-v12-run1.log`, 674.54s) exited 1 with exactly one
failure:

    tests/server/drivers/mysql-lifetime.test.ts > mysqld lifetime >
    ends the server when the process that started it is force-killed
    Error: EPERM, Permission denied: \\?\C:\Users\jpswi\AppData\Local\Temp\decko-mysql-CA3KEd

The failure is in the test's OWN teardown, at
`tests/server/drivers/mysql-lifetime.test.ts:94`, a `rmSync` of the temporary
datadir in `afterAll`. The mechanism is a Windows file-handle race: the
mysqld the test force-killed had not finished releasing its handles on the
datadir when the cleanup ran, and Windows refuses to delete a file with an
open handle.

That this is environmental rather than a regression is measured, not assumed:

- The five merges touched 69 files. The only driver paths among them are
  `src/card/drivers/bunny-db.ts` (the Bunny driver) and its new test. No MySQL
  driver source and nothing under `tests/server/drivers/` was touched:
  `git diff --name-only bf86e09a..HEAD | grep -iE 'mysql|drivers/'` returns
  exactly those two Bunny lines.
- After run 1 finished, no mysqld process was left holding a datadir
  (`Get-CimInstance Win32_Process -Filter "Name like '%mysqld%'"` returned
  nothing), which is what a handle that has since been released looks like.

The assignment authorizes exactly this: re-run on an environment flake, and
say which run decided.

Run 2 (`tmp/correctness-v12-run2.log`, 731.04s) **exited 0 with an empty
failure set. Run 2 decided.** The mysql-lifetime file passed on the re-run,
which is the behavior a transient file-handle race produces and the behavior a
regression does not.

| | run 1 | run 2 (deciding) | v11 baseline at `ade71b9d` |
| --- | --- | --- | --- |
| gate exit | 1 | **0** | 0 |
| test files | 630 passed, 1 failed, 54 skipped (685) | **631 passed, 54 skipped (685)** | 683 files, 6634 passed, 227 skipped |
| tests | 1 failed, 6641 passed, 227 skipped (6869) | **6642 passed, 227 skipped (6869)** | 227 skipped |
| node:test | 15 passed, 0 failed | **15 passed, 0 failed** | 15 / 0 |
| failure set | 1 (the EPERM teardown) | **empty** | empty |

The file and test totals sit above the recorded v11 numbers because the base
moved two commits past the commit those numbers were measured at, and because
the five lanes add test files. The skipped count is unchanged at 227, and the
invariant the assignment named, the failure set being empty, holds.

## What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working; the
  verification rule requires this lane's own signed-out fetch of the exact URL
  in this session, and this session made none. The metered-host law was not
  engaged because nothing was verified against the live host.
- The known hazard of a foreign agent writing unstaged `.claude/issues` files
  into this worktree did NOT materialize: `git status --porcelain` was empty at
  wave start, and the only paths ever staged by this lane are its own merge
  results. No foreign file was touched, excluded, or named, because none
  appeared. Had one appeared it would have been left unstaged and named here.