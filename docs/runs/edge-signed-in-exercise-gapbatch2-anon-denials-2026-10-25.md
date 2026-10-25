# Edge signed-in exercise, gap batch two: the P7 anonymous-denial row

The branch is `port/gapbatch-2-20261025`, created from `deploy/full-candidate-20261030`
at `95654138` (`956541382ec80c32020977756af4cea1a7431511`), the newest pushed roll
tip. The run below ran at this lane's tip, source commit `5e8063b2`
(`5e8063b231863ab9c47ab49fd72972778791b56c`), on the lane's own worktree with a
clean, committed tree (the harness's source-custody preflight).

One run, on the LOCAL stack that the harness boots itself: the loopback database
and object storage, a local copy of the deck on the engine schema (21,676 cards
copied), two throwaway local accounts, headless Chromium with a throwaway
profile. Nothing reached the live edge and nothing was written to the live D1:
the run's provenance carries `productionRuntime: false`. The source deck is the
same local snapshot the earlier rounds used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`; the executed
bundle is this checkout's own deploy artifact, SHA-256
`57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4`.

## The grade line

**9 / 9 checks passed**, 0 failed, 0 skipped by write mode.

The runner's process exit was 1 despite the 9/9 grade line, and that is the
runner's own strictness, not a failed check: a `--only` selection cannot grade
the whole matrix, so `coverageIncomplete` stays true while 92 rows are
unrun (`tools/edge-signed-in-exercise.mjs:1915-1931`, "Unrun capabilities are
never credited").

## The command

```
node tools/edge-signed-in-exercise.mjs --only anonymous-denials --out .runtime/edge-signed-in/gapbatch2-anon-denials-attempt2/report.md
```

## The P7 row (the enumeration audit's gap 7: the anonymous denials)

The audit named the gap: the capability contracts carry the four MEMBER denials
(P1 read, P2 create, P3 edit, R5 delete) and no row named any anonymous denial,
though the check suite's own journeys record them
(`reference-harness/browser/journeys/synthetic-v1.json`, journeys
`denied-anonymous-read` and `denied-anonymous-create`). The row's contract, its
check module (`tools/edge-signed-in-exercise/checks-anonymous-denials.mjs`) and
the refusal shapes it grades come from the oracle-pinned denial bytes
(`fixtures/captured/permission-denied-403-view-ruby-oracle.json`: the 403 status
and the :denial view; `fixtures/captured/anonymous-edit-denial-signin.json`: the
loud "Sorry!" heading and the signed-out sign-in-or-up sentence).

| check | result | the evidence |
|---|---|---|
| P7 anonymous read of a read-restricted card is refused with the loud denial and no content | PASS | signed-out browser, status 403, the `<h1>Sorry!</h1>` loud denial rendered, the sign-in link offered, the card's secret content absent from the page |
| P7 anonymous read of a second read-restricted card is refused the same way | PASS | the same four reads on the second restricted card (the journey's two-card shape) |
| P7 anonymous /new/\<Type\> denial is not rendered as a create form | PASS | the /new surface answered 403 with no create form offered (`createFormOffered: null`) |
| P7 anonymous create POST is refused and stores nothing | PASS | the create POST answered 403 and no card row was stored (`storedRow: null`) |

The run's own grader (`tools/edge-signed-in-exercise/lib/local-policy.mjs`
verifiedCapabilities) computed **covered** for the new P7 row from this record:
4 of 4 declared checks verified. Capability coverage moved from 1 covered row to
2.

WHAT THIS ROW DOES NOT CLAIM: the anonymous EDIT denial is row S5's contract
(the edit modal, its sign-in link and the credential form) and is not claimed
here; the member denials stay P1/P2/P3/R5's contracts; and the reads grade the
refusal, the loud denial shape and the absent content, not one wording of the
denial's task phrase.

## Attempt 1 (recorded, superseded)

The first run of this module
(`.runtime/edge-signed-in/gapbatch2-anon-denials/report.md`) failed in the
module's own sign-in block before any graded leg: the code awaited
`page.waitForResponse` through a wrapper shape it did not use, so the attempt
threw `Cannot read properties of undefined (reading 'finished')`. The fix is
commit `5e8063b2`; the attempt is kept in the lane's `.runtime` and named here
because a superseded attempt that is not named looks like a clean first pass.

## The battery

The row's machine record is committed beside this write-up as
`edge-signed-in-exercise-gapbatch2-anon-denials-2026-10-25.json` (the run's own
`report.md.json`, unaltered). The module's loading shape passes the check-suite
battery: `node --test tools/edge-signed-in-exercise/test/check-modules.test.mjs`
- 10 tests, 0 fail - and the grader pins hold in both directions (all four
checks passing grades the row covered; three passing grades it partial).
