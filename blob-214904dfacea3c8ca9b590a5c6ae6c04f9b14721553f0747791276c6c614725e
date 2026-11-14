# Tranche 9, second opinion: an independent whole-family re-run confirms 253 of 253

Branch `port/matrix-journey-tranche9-20261022`, at tip `42d065d31`. This is a
corroboration record, not new work: no file outside `docs/reports/` changed, and
nothing was deployed.

The tranche receipt at `42d065d31` reports 253 of 253 on its second full run.
This record is a SEPARATE run at the SAME tree, done to check that claim rather
than repeat it. It was run with the same command, at the same scale, with no
`--only` and no `--case`:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche9-20261022/verify-r1/report.md

## The run

- **253 of 253 checks passed.** 253 results, 0 failures.
- source `42d065d31`, `dirty: false`, `sourceFilesClean: true`,
  `productionRuntime: false`
- started 2026-10-22T19:14:28.454Z, completed 2026-10-22T19:38:54.865Z, about
  24 minutes of wall clock
- capability coverage: 70 covered, 20 partial, 1 not covered, 3 out of scope,
  1 disabled upstream, of 95. This matches the receipt's numbers exactly.
- the one capability still not covered is W4, the row this family was told not
  to touch
- the process exit code is 1. That is the tool's own rule, not a failure:
  `tools/edge-signed-in-exercise.mjs` exits 0 only when no check failed AND the
  capability coverage is complete. W4 is uncovered, so the run is 1 by design.
- the run's own host record says `loopback, booted by this run`, so no request
  reached the live host. The metered-host allowance was not touched at all.

## The two rows the ask named, measured here

The ask named `mx-159` / A4 as the open port gap. Measured at this tree, A4 is
covered with five verified checks and five PASS:

| leg | verdict |
|---|---|
| the sign-up form carries Ruby's name, email and password fields, its create action and its success mark | PASS |
| the sign-up lands on the deck's own Signup Success card | PASS |
| the new account is sent the verification mail Ruby's template writes | PASS |
| the verification link is an update of the account card carrying the verify trigger and a token | PASS |
| the new account can sign in with its own email and password | PASS |

The row that was actually open is F1, and it is now closed. Both of its legs
PASS, and the leg's own evidence carries the three surfaces separately, which is
the fix:

    F1 a file can be uploaded through the File create form                PASS
    F1 the uploaded card offers the /files route as a Download link       PASS

    failures: []
    download:  { attrs: { href: "/files/~53155/154.txt" },
                 text: "Download Harness_download_mvjxpoff" }
    writeStatus: 200, afterStatus: 200, roundTrip: true
    previewChip: { filename: "harness.txt", size: "17 Bytes" }

`roundTrip: true` is the part the receipt's account predicts: the chip is read
out of the create form after the upload round trip, and the download anchor out
of the saved card's page.

## What the timing leg saw

The timings leg PASSED on this run, with no request over the 3000 ms budget.
The five slowest server totals it recorded were 2489, 1930, 1927, 1883 and
1835 ms. The slowest is the same `/new/RichText` shape the earlier tranches
measured between 2660 ms and 9675 ms. The engine's own work did not move: the
tranche touched no engine source, so the bundle is the same one the tranche-8
run hashed.

## The battery, run here

| check | command | result |
|---|---|---|
| the F1 pins | `node --test tools/edge-signed-in-exercise/test/file-download-view.test.mjs` | 16 tests, 16 pass, 0 fail |
| the family battery | `node --test "tools/edge-signed-in-exercise/test/*.test.mjs"` | 182 tests, 180 pass, 0 fail, 2 skipped (the opt-in live legs) |
| types | `npx tsc --noEmit -p tsconfig.json` | 3 errors, all in `tests/card/actions/write-path-races.test.ts` (lines 132 and 526), a file this work does not touch |

The 3 type errors are the same ones the tranche-8 receipt recorded. They are
pre-existing and out of this lane's scope; they are named here rather than
quietly dropped.

## Where the oracle for the F1 fix was checked

The fix rests on the committed real-Ruby capture, and the two arms it names
were read in this session rather than taken on trust:

- `reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl`,
  `probe-view:98:input@set/type/file.rb`, carries
  `<input class="attachment_card_name form-control" value="" ...>`. The class
  TOKEN is what the HAML names and the rendered value carries decko's bootstrap
  form class as well, so grading the whole attribute value made a correct field
  read as absent.
- the same file, `probe-view:100:preview_editor@set/type/file.rb`, carries
  `undefined method 'gsub' for nil` at
  `card-mod-carrierwave-0.20.0/set/type/file.rb:145` in
  `cached_upload_card_name`. The chip is therefore the round trip's response,
  and outside that round trip the view raises in Ruby too.
- `src/card/mod-loader/mods/card-mod-carrierwave.ts:547` renders
  `<input class="attachment_card_name form-control" value="" ...>`, byte for
  byte what the capture carries. The port matches Ruby here, so the parity law
  says the match is done and no port change was owed.

## What this record does not claim

- It does not re-open A4. A4 was already closed at the tranche-8 tip, measured
  here again at 5 of 5.
- It does not re-decide the port. The port was not changed, because it already
  matched Ruby.
- It does not touch W4, and it does not close the four rows the earlier
  tranches set aside (`mx-155`, `mx-190`, `mx-B-081`, `mx-B-086`). Their own
  operator-side blockers stand as named in the tranche receipt.
- Nothing here deploys and nothing touched the live host.