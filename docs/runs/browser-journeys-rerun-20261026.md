# Browser journeys rerun run record

The clean-provenance rerun of the journey comparison, requested by the
completeness roster row smell-compare-journeys: the instrument run end to end
at the newest pushed tip, in a lane-exclusive checkout.

- Date: 2026-10-26 (run window 01:49:38Z to 01:56:16Z)
- Commit: 3e4791cb61d9260e9f69b0df69e5e30222747630, branch port/journeys-rerun-20261026
- Base: the newest pushed tip by committer date across origin's heads, which
  ls-remote reported as port/matrix-round12-20261025 (3e4791cb). Note that the
  remote's symbolic HEAD still names main (314b9e5c), a 2026-10-06 branch that
  diverged from the port line; the rerun grades the newest tip, not main.
- Checkout: C:/localProjects/decko-ts-journeys-rerun-20261026, a diskSteward
  worktree created for this lane (the machine's duplicate-clone guard refuses a
  second full clone of this repository; the worktree carries the same content
  properties: exclusive directory, exact tip, named branch). The tree was clean
  for both captures: provenance source.dirty false on both sides.
- Command: `PATH="/c/Ruby33-x64/bin:$PATH" node reference-harness/browser/run-all.mjs --out tmp/journeys-rerun-20261026 --shards 6 --ts-shards 3`
  (Ruby 6 shards, port 3 shards. The PATH prefix pins the declared Ruby 3.3
  oracle runtime; without it `bundle` resolves Ruby 3.4 and the oracle fails
  to boot. run-all defaults HARNESS_EDITOR_SETTLE=1, the declared
  settled-editor mode, and provenance records runner.editorSettle 1.)
- Run identity: runId 3e3e1a76-175f-4be1-a018-d9d78b937ba8 shared by both
  sides; port dist sha256 708a5f3da7a220aa52c77e2be3bd3151afacb3434f039b6c4c6ecb1e396b4090.
- Reference runtime: Ruby 3.3.12, stock Ruby Decko (decko 0.20.0, card 1.110.0)
- Browser: Chromium 155.0.8059.85 on both sides
- Journeys: 51. Completed on Ruby: 51 / 51. Completed on the port: 51 / 51.
- Verdict line: `journeys: 36 / 51 pass (0 not graded)`
- Evidence validity: true, 0 integrity problems (complete step and observation
  evidence, provenance bound to the candidate commit, single run/source/artifact
  identity per side, no user-visible HTTP 500, no failed required asset).
- Comparator replay: the comparison step alone was replayed against the same
  recordings and produced identical counts (tmp/journeys-rerun-20261026/report-replay.json).
- Raw results: tmp/journeys-rerun-20261026/ (not committed). The comparison
  report is committed beside this record as browser-journeys-rerun-20261026.json.

## Outcome against the row's recorded blocker

The row's blocker had two parts, and each is resolved or narrowed by this run:

1. Oracle-side rich-editor journeys that could not complete: resolved. All 51
   journeys complete on the reference at this tree with the settled-editor
   mode; the editor item grades 13 / 13. Nothing is capped at 46 gradeable
   journeys any more; all 51 are graded.
2. The named text/fields/structure diffs on the delete-admin and
   new-topic-structured-form surfaces: closed. The port now grades text 88/89,
   structure 88/89 and fields 89/89; the single text and structure failure is
   unfollow-from-mail and belongs to the residual below.

## Residual (one root cause)

15 journeys fail, 14 of them on the mail item only, plus unfollow-from-mail on
address, text, structure, mail and rows. After SPEC N2 port masking the
failures share exactly one cause: the follow notification's unfollow link.

- Ruby mails: `/update/Mira_Member+*follow?card[subcards][*all+Mira Member+*follow]=*never`
- The port mails: `/update/*all+Mira_Member+*follow?card[content]=*never`

The port addresses the rule card directly with a content param; Ruby addresses
the user's *follow card with a subcard param. The journey that follows the
link then diverges on every later item: Ruby refuses its own link with 403
(permission denial on the subcard update, denial view) and applies nothing,
while the port accepts its variant with 200, renders the rule view and applies
a row delta the reference does not (rows 50/51). Owner: the port lane's
follow/notification surface. The unblock is a port change that makes the
notification link byte-identical to Ruby's and takes Ruby's refusal path, or a
declared-divergence adjudication record if the port's link is judged safer.

## Per graded item

| item | pass | total |
|---|---|---|
| completion | 51 | 51 |
| address | 88 | 89 |
| text | 88 | 89 |
| structure | 88 | 89 |
| fields | 89 | 89 |
| mail | 36 | 51 |
| rows | 50 | 51 |
| editor | 13 | 13 |

## Failing journeys

| journey | items that differ |
|---|---|
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
| unfollow-from-mail | address, text, structure, mail, rows |
| edit-conflict | mail |
