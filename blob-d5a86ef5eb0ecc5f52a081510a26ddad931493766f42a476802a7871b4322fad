# Row mx-155, the followers list and all-followed-cards view: the ACT-155 probe leg runs and is green, on a corrected and now tested pair of expectations

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT, verdict FAIL). Instrument-coverage-matrix
action 154 (ACT-155), capability id W4: "Followers list and 'all followed
cards' view".

This is tranche 6 of the family (branch
`port/matrix-journey-tranche6-20261021`, base `f583811d`, the tip the ask
named). The ask for this row: verify the port side with a named runnable
check, fix genuine defects with oracle-matched tests, report under
`docs/reports/`, one commit per row.

## What the previous tranche named as this row's next step

Tranche 5's report (`docs/reports/row-mx-155-follow-preference-leg-2026-10-21-tranche5.md`,
item 3 of "What is still open, with the cause named") left exactly one
open step that was NOT operator-blocked:

> **THE PROBE LEG'S OWN LIVE RUN.** The clause is repaired and pinned, but
> the probe that carries it has not been run against an engine in this
> tranche. The next step is one probe run over the synthetic-v1 fixture,
> which will also settle the leg's other clauses. This is not
> operator-blocked; it is the next tranche's work or this lane's, given
> machine time.

This tranche ran it. The run found two instrument defects, both fixed
here, and the leg is green on the fixed instrument.

## The named runnable checks, run at this base

**1. The row's committed oracle-matched battery.**

    npx vitest run tests/card/follow/

-> **8 files, 41 tests, all passed** (the same 8 files / 41 tests tranche 5
recorded after its change; nothing green went red).

**2. The instrument-level suite tranche 5 landed with its fix.**

    node --test reference-harness/browser/test/follow-preference-read.test.mjs

-> **tests 10, pass 10, fail 0**.

**3. The ACT-155 probe leg over the synthetic-v1 fixture.** This is the
step tranche 5 named.

    node reference-harness/browser/probe-never-measured-batch1.mjs \
      --out .runtime/matrix-journey-tranche6-20261021/probe-batch1-r3

-> **15 legs, 15 GREEN, 0 failures** ("ALL LEGS GREEN"). The run record is
`.runtime/matrix-journey-tranche6-20261021/probe-batch1-r3/probe-batch1-result.json`
and its durable copy is committed here:
`docs/reports/receipts/row-mx-155-act155-probe-leg-2026-10-21-tranche6.json`.

Run provenance, read from the result file: the engine booted on
`127.0.0.1:53545` from the local TypeScript host over the committed
fixture `reference-harness/fixtures/synthetic-v1`; `source.commit`
`f583811d04056d6dcd1c7bf23775f146067f8871`, `source.dirty` true, because the
run was taken on this tranche's working tree, which differs from that
commit only in the browser harness, one new harness library, one new test
file and one vitest config line. **No engine source is touched by this
tranche**, so the engine the probe drove is the engine at `f583811d`. The
probe stages a private copy of the fixture deck, so every write dies with
the staging directory, and nothing reaches a live host.

**4. The new expectations test** (this tranche's added test, see below):

    node --test reference-harness/browser/test/follow-dashboard-expectations.test.mjs

-> **tests 10, pass 10, fail 0**.

**5. The typecheck battery over the touched files.**

    npx tsc --noEmit -p tsconfig.json

-> only the three pre-existing diagnostics in
`tests/card/actions/write-path-races.test.ts:132` and `:526` (recorded at
this base since tranche 1 of the family). No new diagnostic.

## The ACT-155 leg, green, and what it witnessed

The leg's own evidence, verbatim from the result file:

    storedAdmin   { "found": true, "option": "*always" }
    storedMember  { "found": false, "why": "the card has no +*self set" }
    resolvedMember{ "found": true, "option": "*always", "options": ["*always"],
                    "viaKey": "*all", "viaUser": "Mira Member",
                    "viaUserId": 617, "viaDefault": false }
    adminDriveStates [ "arrive", "after-follow-click" ]
    followersRead { "status": 200 }
    followersText "HarnessW4MemberFollows mvin9svw6s1+followers Mira Member"
    adminOverviewText  "Follow Ignore check HarnessW4AdminFollows_mvin9svw1e4"
    memberOverviewText "Mira Member+follow Follow Ignore check everything"

Every clause the row's contract names is witnessed by the run:

- the admin's follow is staged by the drive (the Engage-tab click), and the
  STORED read finds it (`*always`);
- the member's follow is NOT materialized on the card, and the RESOLVED
  read finds it through the deck-wide key (`viaKey: "*all"`, `viaDefault:
  false`, i.e. the member's own rule on the `*all` set, not a default);
- the followers list answers 200 and names the follower (Mira Member);
- the admin's all-followed-cards dashboard names the set the admin's rule
  sits on (the scratch card's own `+*self` set, whose short label is the
  card's own name);
- the member's all-followed-cards dashboard names the set the member's rule
  sits on (the deck-wide set, whose short label is "everything").

## The two instrument defects this run found, and the fix

**Defect 1, the affordance lookup threw instead of reporting a miss.**
The leg read the "all followed cards" affordance with

    const a = [...document.querySelectorAll("#main a, .board a")].find(...);
    return a === null ? null : a.getAttribute("href");

`Array#find` answers `undefined` on a miss, never `null`, so the miss arm
never ran and the leg's first lookup ended in
`page.evaluate: TypeError: Cannot read properties of undefined (reading
'getAttribute')`. The first lookup was also reading the wrong page: it ran
on the page showing the member card's `+followers` junction, where no
follow section is rendered at all, so the affordance could not be there. The
fix reads each actor's affordance from that actor's own Engage tab (the
page that carries the follow section) and tests the found anchor itself.
Both lookups are in the fix; the second one only ever worked because that
page happened to carry the link.

**Defect 2, the member's dashboard was graded for a card name Ruby never
puts there.** The leg asked the member's dashboard to contain the scratch
CARD's name. Ruby cannot put it there: the member's follow is the
deck-wide rule, Ruby resolves it through the set-pattern walk and
materializes nothing per card (the same fact tranche 5 repaired the
`storedMember` clause for), and the dashboard lists the user's follow
PREFERENCE CARDS (`Card::Rule.preference_names`,
`card-1.110.0/lib/card/rule.rb:39-45`). A dashboard that named a per-card
materialization for the member would be wrong. So the clause could not go
green against a correct engine, whatever the port did.

**The corrected expectations, and the Ruby each one is the counterpart of.**
A dashboard row is named after the SET the rule sits on, by that set's
`follow_label`, and for a set-type card that label is the SET PATTERN's
short label (`card-mod-follow-0.20.0/set/type/set.rb:9-13`):

- the admin's rule sits on the card's own `+*self` set, whose short label
  is the anchor's own name (`card-1.110.0 mod/core/set_pattern/09_self.rb:5-6`),
  so the dashboard must name the card;
- the member's rule sits on the deck-wide set, whose short label is
  "everything" (`card-1.110.0 mod/core/set_pattern/01_all.rb:5-7`), so the
  dashboard must name the deck-wide set and not a card. The set's codename
  ("*all") is NOT the label, which is why a dashboard naming "*all" alone
  does not satisfy the clause.

The expectations live in
`reference-harness/browser/lib/follow-dashboard-expectations.mjs` with their
Ruby citations, and
`reference-harness/browser/test/follow-dashboard-expectations.test.mjs`
(10 legs) pins them, including the two negative cases that matter: a
dashboard naming some other card does not satisfy the admin clause, and a
dashboard naming a per-card materialization for the member does not satisfy
the member clause. The port is never consulted to build an expectation, so
a port that renders the wrong label fails the check instead of defining it.
`vitest.config.ts` lists the new suite among the Node-runner files so
vitest does not collect a `node:test` file as a suite with no tests (the
gate discovers Node suites by AST import, `tools/node-test-runners.mjs`).

**What the fix did NOT touch.** No engine source changed. The port's
rendering of both dashboards was already faithful: the port's set-label
helper (`src/card/mod-loader/mods/card-mod-follow.ts:470-473`,
`setFollowLabel`) reads the same set pattern's short label the port's
registry carries (`src/card/set-patterns/labels.ts:20-22`, "everything",
against Ruby's `01_all.rb:5-7`), and the port's follow editor rows already
come from the seam's rule walk, which is Ruby's `preference_names` query
(`src/card/follow/follow-render-seam.ts:265-330`, the same join shape as
`card-1.110.0/lib/card/rule.rb:39-45`). The red the run measured was the
instrument's, not the port's.

## The row's state after this verification

- **The port side of row `mx-155` matches the source on this row's own
  surface.** The row's committed battery is green (41/41), the
  instrument-level suite is green (10/10), and the ACT-155 probe leg, which
  tranche 5 named as the next step, is green on a fixed instrument
  (15/15 legs, the row's own leg among them).
- **The row stays WORKING ON IT, and its blockers are named, not claimed:**
  1. **THE DEPLOY HALF OF THE ROW'S DONE CONDITION.** The guarded live
     deploy: the files-area pair armed by the operator, the deploy reaching
     live, and a re-run of the followers probe against the live host
     serving the resolved set. That is an operator account-side call.
     Nothing in this tranche deploys and nothing touches live.
  2. **THE ACT-155 LIVE LEG.** The live probe leg of the ACT-155 action,
     which needs that same guarded live deploy to have landed before it
     can be run against the live host. The port side of the same leg is
     what this tranche measured, over the local fixture.
  3. **THE FOLLOWERS WALK'S CACHE.** Unchanged and byte-invisible on these
     surfaces: Ruby caches follower ids
     (`mod/follow/set/all/follow/follower_ids.rb:1,25-45,63-69`), the port
     resolves fresh per call. Named, not closed.
- **DONE-eligibility is unchanged.** The verdict stays FAIL: the row cannot
  be paired as PASS with bucket DONE while its DONE condition stands on a
  live deploy no tranche may perform.
