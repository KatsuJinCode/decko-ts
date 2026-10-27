# Browser journeys comparison at the candidate tip, run record

The rerun of the journey comparison the completeness roster row
smell-compare-journeys asks for: the same instrument, the same harness
lineage, the declared settled-editor mode, local engines only, at the newest
pushed tip of deploy/full-candidate-20261104.

- Date: 2026-10-27 (run window 05:43:08Z to 05:48:38Z)
- Commit: a1b8a215f74468ae4e90ca0adf5a95a7acb7dd95, branch
  port/journeys-rerun-candidate-20261027
- Base: the newest pushed tip of deploy/full-candidate-20261104.
  `git ls-remote origin deploy/full-candidate-20261104` reported
  a1b8a215f74468ae4e90ca0adf5a95a7acb7dd95 before the run, and that is the
  commit the run measured.
- Checkout: C:/localProjects/decko-ts-journeys-candidate-20261027, a
  diskSteward worktree of C:/localProjects/decko-ts (exclusive directory,
  exact tip, named branch, lease ff5de07d6701). The tree was clean for both
  captures: provenance `source.dirty` false on both sides and
  `source.diffSha256` e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855,
  the empty diff.
- Command: `PATH="/c/Ruby33-x64/bin:$PATH" node reference-harness/browser/run-all.mjs --out tmp/journeys-rerun-candidate-20261027 --shards 6 --ts-shards 3 --summary tmp/journeys-rerun-candidate-20261027/summary.md`
  (Ruby 6 shards, port 3 shards, the same shape as the 2026-10-26 rerun.
  run-all defaults HARNESS_EDITOR_SETTLE=1, the declared settled-editor mode;
  provenance records `runner.editorSettle` 1 on both sides. Decko's cucumber
  scenarios were skipped, no --decko checkout given, the same shape as the
  prior run.)
- Run identity: runId b543094a-a23f-4ad0-a17d-b07c16802b00 on both sides.
  Port dist sha256 c73da5aacceeace6a9eb62b5056b8e686254d6bc991bb23e8709f420af282e23;
  build receipt `sourceCommit` a1b8a215f74468ae4e90ca0adf5a95a7acb7dd95, built
  2026-10-27T05:43:07.717Z.
- Reference runtime: Ruby 3.3.12, stock Ruby Decko (decko 0.20.0, card 1.110.0)
- Port runtime: node host v24.22.1, serving this tree's dist build
- Browser: Chromium 155.0.8059.85 on both sides
- Journeys: 51. Completed on the reference: 51 / 51. Completed on the port:
  51 / 51.
- Verdict line: `journeys: 34 / 51 pass (0 not graded)`
- Evidence validity: false, 2 integrity problems. Both are the port side's
  recording of one external FontAwesome kit script, see "Evidence validity"
  below.
- Deck fingerprint: fixture sha256
  e5798f2cc72905e5a5e4d581ba107e6177a8d36eba02923ac4a207056b0da93c. The
  journeys hash 2f4dc0bc216e77e8dde229bc4e2cfc1462f789af21c3f31c2c66feb27934bc20
  and the contracts hash 05671700a7ef75ec5cefca1814bce9db6e2ab016f33ca6aa801be7d5ee46141f
  are byte-identical to the 2026-10-26 rerun's, so this is the same 51
  journeys over the same synthetic deck with the same contracts.
- Raw results: tmp/journeys-rerun-candidate-20261027/ (not committed). The
  comparison report is committed beside this record as
  browser-journeys-rerun-candidate-20261027.json.

## Grade against the row's recorded blocker

The row's blocker named one root cause, the follow notification's unfollow
link, and said the row unblocks when the port makes that link byte-identical
to the reference's and takes the reference's refusal path. The fix
(7c7ac7ef, "the mail unfollow carries the stock dashboard link") is an
ancestor of this tip (git merge-base --is-ancestor verified in the lane), and
the link now carries the reference's exact path and query. The row still does
not unblock: the measurement is 34 of 51 pass, two journeys worse than the
36 of 51 the 2026-10-26 rerun read at 3e4791cb, and the residual now has
three parts instead of one.

## Residual 1: the follow-notification unfollow link, one parameter apart

The mail item still fails on 14 journeys, and the mail body's unfollow link
is the whole reason. The exact bytes, URL-encoded as the two engines mail
them:

    reference: /update/Mira_Member+*follow?card%5Bsubcards%5D%5B%2Aall%2BMira+Member%2B%2Afollow%5D=%2Anever
    port:      /update/Mira_Member+*follow?card%5Bsubcards%5D%5B%2Aall%2BMira+Member%2B%2Afollow%5D=%2Anever&success%5Bredirect%5D=soft

Decoded, the port's link is the reference's link with one appended
parameter, `success[redirect]=soft`, which is what 7c7ac7ef added so the
update would answer the soft flavor at 200 instead of the hard 303. Every
other byte of the path and query matches. The parameter is the whole mail
difference, so the 14 journeys that only fail their mail item fail on that
one string.

The divergence is not only the string. Following the link, the reference
answers 403 and renders its denial view, applying nothing; the port answers
200, renders the card view and applies a row delta:

| after the link | reference | port |
|---|---|---|
| status | 403 | 200 |
| view | denial-view | titled-view |
| cards | +0 ~1 -0 | +1 ~3 -0 |
| card_acts | +1 ~0 -0 | +2 ~0 -0 |
| card_actions | +1 ~0 -0 | +3 ~0 -0 |
| card_changes | +7 ~0 -0 | +14 ~0 -0 |
| card_references | +0 ~0 -3 | +1 ~0 -4 |

## Residual 2: the board unfollow applies where the reference refuses (new)

unfollow-from-board-member passed at 3e4791cb and fails here, on text, fields
and rows. The journey signs a member in, opens the board's Engage tab, clicks
the follow link and reads the section again.

- reference: "Engage History Related Rules unfollow more_horiz 1 follower all
  followed cards Problems", and the journey leaves no row delta at all
  (rows {}).
- port: "Engage History Related Rules follow more_horiz 0 followers all
  followed cards Discussion", and the port's row delta is cards +3 ~1 -0,
  card_acts +1, card_actions +3, card_references +1. The inserted cards are
  the follow cards (Topic 009+*self, Topic 009+*self+Mira Member,
  Topic 009+*self+Mira Member+*follow with db_content *never).

So the port applies the follow-rule update where the reference refuses it and
applies nothing. This is the same refusal difference the mail journey shows,
reached through the board's follow link instead of the mailed one, and it is
new at this tip.

## Residual 3: the wrong-password sign-in error is not rendered (new)

signin-wrong-password passed at 3e4791cb and fails here, on text, structure
and fields. Both engines answer the wrong-password POST /update/*signin with
422 and both re-render the sign-in page, but the reference's page carries the
error and the port's does not:

- reference text: "in ...or sign up! Problems with *signin SIGNIN: Wrong
  password Decko v0.20.0"
- port text: "in ...or sign up! My Deck Getting started Recent Changes Sign up"
- reference structure: div.alert.alert-dismissible.alert-warning.card-error-msg
- port structure: header (no error element)
- fields: the port renders a second input[text] query[keyword]; the button
  set is the same on both sides

The port answers the POST with 422 like the reference and then drops the
error from the re-rendered page. This is outside the follow surface: it is
the port's sign-in error surface.

## Evidence validity

`evidenceValid` is false with two integrity problems, both on the port side's
recording of one request:

    actual/signin-wrong-password: required script failed 403 at /1366963381.js
    actual/signin-wrong-password: required script failed net::ERR_ABORTED at /1366963381.js

That request is external, https://kit.fontawesome.com/1366963381.js, the
FontAwesome kit script a stock Decko layout links. The reference side's
recording of the same journey carries the same request with the same 403
(ruby/signin-wrong-password.json, network log), and the port's own local
assets all answered 200 (/files/~307/1789819200.js). The validator only
inspects the "actual" side (reference-harness/browser/lib/journey-evidence-validation.mjs,
the `if (side === "actual")` block over the recorded requests), so the flag
names the port for a failure both engines hit on the same external host. It
is an external-CDN condition plus that one-sided check, not a port asset
defect. The prior rerun's report recorded evidenceValid true with 0 problems,
so the kit endpoint answered for that run and answers 403 for this one.

## Per graded item

| item | pass | total | 2026-10-26 rerun |
|---|---|---|---|
| completion | 51 | 51 | 51 / 51 |
| address | 88 | 89 | 88 / 89 |
| text | 86 | 89 | 88 / 89 |
| structure | 87 | 89 | 88 / 89 |
| fields | 86 | 89 | 89 / 89 |
| mail | 36 | 51 | 36 / 51 |
| rows | 49 | 51 | 50 / 51 |
| editor | 13 | 13 | 13 / 13 |
| journeys | 34 | 51 | 36 / 51 |

## Failing journeys

| journey | items that differ |
|---|---|
| signin-wrong-password | text, structure, fields |
| create-phrase-admin | mail |
| edit-note-admin | mail |
| rename-admin | mail |
| rename-topic-with-referers-admin | mail |
| delete-admin | mail |
| create-structured-topic-member | mail |
| pointer-checkbox-input | mail |
| pointer-radio-input | mail |
| pointer-multiselect-input | mail |
| upload-file-admin | mail |
| upload-image-admin | mail |
| upload-replace-file-admin | mail |
| follow-from-board-admin | mail |
| unfollow-from-board-member | text, fields, rows |
| unfollow-from-mail | address, text, structure, fields, mail, rows |
| edit-conflict | mail |

## Confirmation re-run of the three non-mail failures

The three journeys that fail on more than their mail item were run again on
both engines, at the same tip, with the same filter, in
tmp/journeys-rerun-confirm/:

- signin-wrong-password: reproduced, same three items (text, structure,
  fields), and the same external kit 403 in the port's recording.
- unfollow-from-board-member: reproduced, same three items (text, fields,
  rows), and the same row cause, reference {} against a port delta that
  inserts the follow cards.
- unfollow-from-mail: the reference side broke on this run ("step 2: rich
  editor card[content] is not initialized"), so the journey was not graded.
  That journey is flaky on the reference side; it completed on both sides in
  the full run above, and its mail link bytes are taken from that run.

## Environment note: the reference runtime was restored before the run

The machine had no Ruby 3.3 at the start of this lane. C:\Ruby33-x64 was
gone (the user PATH still names C:\Ruby33-x64\bin, the harness pins
C:/Ruby33-x64/bin/ruby.exe, and diskSteward's where-is reports no cleanup
record for that path), so the reference side of this comparison could not
have booted. The lane restored the declared oracle runtime before measuring:

- Ruby 3.3.12 from the official RubyInstaller release
  RubyInstaller-3.3.12-1. The RubyInstaller executable installer aborts on
  this machine (Inno Setup's "Setup is not complete" prompt and exit code 5,
  with and without the command sandbox, twice each), so the runtime was laid
  down from the same release's portable archive
  rubyinstaller-3.3.12-1-x64.7z, sha256
  f8d534a44e47e5b72abe557497763128b93e9356bd91397a3d7b9e0a11572943, which
  matches the publisher's published asset digest. The companion executable
  was verified the same way (rubyinstaller-3.3.12-1-x64.exe, sha256
  c6b505436853c36e3257e21b59752e032c17b6ae4d4f0240e1d47872d3cde756).
- The oracle's native-extension toolchain: MSYS2 at C:\Ruby33-x64\msys64
  with the ucrt64 gcc and the msys make, which build the pinned bundle.
- The oracle bundle itself, from the oracle app's own Gemfile.lock
  (decko 0.20.0, card 1.110.0, thin 2.0.1, eventmachine 1.2.7, rails 7.2.4).

The runtime identity inside the run is Ruby 3.3.12 with stock Decko 0.20.0
and card 1.110.0, the same identity the 2026-10-26 rerun recorded, so the
two measurements are comparable on the reference side.

## What the next lane owns

1. The follow surface: the port's mailed link must be the reference's link
   byte for byte, with no `success[redirect]=soft`, and the port must take
   the reference's refusal path on it (403, denial view, nothing applied).
   The same refusal difference shows on the board's follow link
   (unfollow-from-board-member), so the fix belongs to the port's update
   route and its follow/notification surface, not to the mail body alone.
2. The sign-in error surface: the port must render the wrong-password error
   on the re-rendered sign-in page the way the reference does (the
   alert-warning card-error-msg with "Problems with *signin" and "SIGNIN:
   Wrong password"), and its page must not carry the extra search input.
3. The instrument's one-sided evidence check names the port for external
   asset failures the reference hit identically. A third-party kit script
   that answers 403 for both engines must not make the port's evidence
   invalid. That is an instrument change, not a port change.
