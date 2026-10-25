# smell-run-all

- The row's own label: `smell/probe script run-all.mjs`
- The instrument: `reference-harness/browser/run-all.mjs`
- What this lane did: fixed the machine's bundler dispatch for the run, ran the row's own
  instrument end to end, and read the report it wrote.
- Commands:
  - `PATH="/c/Ruby33-x64/bin:$PATH" bash reference-harness/browser/engines/ruby-server.sh --link-mods`
    (exit 0; the step that was blocked now runs, and it creates the four mod links through
    `bundle exec ruby -e "print Gem.loaded_specs.fetch('card-mod-<mod>').full_gem_path"`)
  - `PATH="/c/Ruby33-x64/bin:$PATH" node reference-harness/browser/run-all.mjs --out .runtime/r4-run-all --summary .runtime/r4-run-all-summary.md`
    (exit 1; the whole suite ran: build, link mods, the journeys on both legs, the comparison,
    the summary. Step 4, Decko's own cucumber scenarios, was skipped by the instrument's own
    design, because no `--decko` checkout was named.)
  - `PATH="/c/Ruby33-x64/bin:$PATH" node reference-harness/browser/run-all.mjs --out .runtime/r4-run-all --summary .runtime/r4-run-all-summary.md --report-only 1 --candidate 9658a462ad1dca1ba7b413aba5d917068bd73131`
    (the comparison re-run on the captures that run produced, with the candidate commit the
    captures themselves record; see "The first pass refused its own evidence")
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-row-r4-2026-10-24/run-all-report.json` (the comparator's own report)
  and `.../run-all-summary.md` (the instrument's own summary).

## Verdict: BLOCKED is cleared, the row stays WORKING ON IT with the suite's own grade

The row's blocker was an environment defect in the instrument's first step: the machine's
`bundle` resolved into `C:\Ruby34-x64`, whose bundler refuses the oracle app's
`Gemfile.lock` (the lock pins bundler 2.5.22, the Ruby 3.4 gem home carries 2.6.9). The fix
is not to change the instrument but to give the run the runtime the repository pins
(`docs/parity-method.md`: Ruby 3.3): with the machine's pinned `C:/Ruby33-x64/bin` first on
PATH, `bundle` is bundler 2.5.22 under Ruby 3.3.12, and the blocked step exits 0.

The prior state recorded that "prepending the 3.3 bin to PATH did not change the dispatch
(two as-is attempts)". That does not reproduce here: the same command with the same PATH
prefix now dispatches to Ruby 3.3.12 and the step passes. The recorded attempts are not on
this machine any more, so this lane cannot say what they did differently.

The suite then ran end to end and produced a report:

| | |
|---|---|
| reference runtime | Ruby 3.3.12 |
| journeys | 51 |
| completed on Ruby | 51 / 51 |
| completed on the port | 51 / 51 |
| graded journeys | 51 of 51 (0 ungraded) |
| journeys passing | 36 / 51 |
| `evidenceValid` | true |
| `productionAcceptance` | false |
| verdict | fail |

Per graded item: completion 51/51, fields 89/89, editor 13/13, address 88/89, text 88/89,
structure 88/89, rows 50/51, mail 36/51.

## The first pass refused its own evidence, and why

The first comparison reported `evidenceValid: false` with 51 refusals, all of them
`wrong candidate commit`. The cause was in this lane's own workflow: the runner takes the
candidate commit from `git rev-parse HEAD` when it compares, and this lane committed two row
receipts while the suite was running, so the HEAD at comparison time was not the commit the
captures were taken at. The captures themselves record one commit and one fixture digest, and
both legs agree on them, so re-running the comparison with the candidate the captures record
(the instrument's own `--report-only 1` mode) produced a valid report. The first report is
kept beside it as `report-first-pass-candidate-mismatch.json` in the run directory.

## All 15 failing journeys have one mechanism

Every failing journey fails on the mail, and the cause lines the comparator prints name the
same difference in all of them: the notification mail's unfollow link.

- The port's mail carries `/update/*all+Mira_Member+*follow?card[content]=*never`, the
  follow record's own route with its content set to `*never`. This is the accepted usability
  repair in the port's own source (`src/card/notify/follow-mail-views.ts:262-268`).
- The source's mail carries `/update/Mira_Member+*follow?card[subcards][*all+Mira Member+*follow]=*never`,
  the follower's own card route with the follow record addressed as a subcard field.

Fourteen journeys differ on the mail alone (the recipients, the subjects and the bodies are
otherwise identical, and the comparator normalises the origin). The fifteenth,
`unfollow-from-mail`, differs on the page after the unfollow link as well, because the port's
link completes the unfollow (the follow is gone, "0 followers") where the source's link is
refused with 403 and the follow is kept.

This is the same mechanism the sibling row `smell-evaluate-follow-operations` measured on its
own instrument, and it is the only mechanism in this suite's 15 failures.

## Gap, in one mechanism sentence

The suite runs end to end on this machine and grades 36 of 51 journeys with valid, tree-bound
evidence, and every one of the 15 failures is the notification mail's unfollow link, where the
port emits the follow record's own route and the source emits the follower's own card route,
so the suite's own verdict is a fail and the row stays open.

## What would close it

A decision, taken by whoever owns the product contract, on which unfollow link the
notification mail should carry, and a port change or a contract change that follows that
decision. The same decision closes the sibling row `smell-evaluate-follow-operations`, whose
own instrument measured the same difference on its own three journeys, and it is what the
blocked row `smell-compare-journeys` names among its mail diffs.

## What this lane did NOT do

This lane did not change the instrument, did not change the port's mail behaviour, did not
deploy anything, and did not touch any live host. The report is the instrument's own output
at this tree, and the grade is reported as it stands.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
