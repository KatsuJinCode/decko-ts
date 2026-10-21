# Row mx-155, the followers list and all-followed-cards view: the tranche-3 named leg closed, and one port behaviour pinned that the probe now grades

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT). Instrument-coverage-matrix action 154
(ACT-155), capability id W4: "Followers list and 'all followed cards'
view".

This is tranche 5 of the family (branch
`port/matrix-journey-tranche5-20261021`, verified at commit `e22c388e`,
the tip the ask named, which carries tranche 4's `+*following` junction fix
`4937ff2f`). The ask for this row: verify the port side with a named
runnable check, fix genuine defects, report under `docs/reports/`, one
commit per row.

## The named runnable checks, run at this base

The row's committed oracle-matched battery, the check the row's earlier
tranches landed with their fixes:

    npx vitest run tests/card/follow/

At this base, before this tranche's change: **8 files, 38 tests, all
passed**. After: **8 files, 41 tests, all passed** (the three new legs in
`tests/card/follow/follow-rule-runtime.test.ts`; nothing green went red).

And the new instrument-level check this tranche lands with the fix:

    node --test reference-harness/browser/test/follow-preference-read.test.mjs

-> **tests 10, pass 10, fail 0**.

## The gap this tranche closes: the probe's `storedMember` clause

Item 2 of this row's "what is still open" list, unchanged since tranche 2
named it (`docs/reports/row-mx-155-follow-views-base-format-input-chain-2026-10-21.md:196-208`)
and carried by tranches 3 and 4: the ACT-155 probe leg grades the MEMBER's
follow option with a stored read that expects it to be MATERIALIZED on the
card's own `+*self` set.

**The mechanism, verified against the Ruby on this machine rather than
inferred.** Ruby resolves a follow preference by the set-pattern walk, not
by materialization:

- `card-1.110.0 lib/card/rule/all.rb:25-31` `preference_card_id` resolves
  through `rule_id_lookup`, which walks the card's `rule_lookup_keys` and,
  per set, tries the user's own preference and then that same set's
  `*all`-user default (`:66-73`, the `fallback_suffix` at `:69`);
- `card-1.110.0 lib/card/set/pattern/all.rb:57-68` `set_names` and
  `rule_lookup_keys` come from the card's patterns;
- `card-1.110.0 lib/card/rule/all.rb:51-54` `valid_preferer?` accepts the
  `*all` card as a preferer, which is why a deck-wide rule exists at all.

So a viewer whose follow is configured on the `*all` set follows EVERY card
through that walk, with NO `<card>+*self+<viewer>+*follow` row on any of
them. The probe's leg graded `storedMember?.option === "*always"` on
exactly such a viewer (`reference-harness/browser/probe-never-measured-batch1.mjs:1004`,
the read at `:161-170`), against a probe comment at `:997-1001` that
already said the right thing: the member's follow "needs no staged write
and the views must enumerate her through it". The leg's assertion
contradicted its own stated intent, and it reported a red that described
the instrument's storage assumption rather than the engine's behaviour.

**The change.**

- `reference-harness/browser/lib/follow-preference-read.mjs` (new): the
  resolved read, with its Ruby sources on the module. The lookup keys are
  derived from the deck rows, independently of
  `src/card/notify/follower-resolver.ts`, so the leg never grades the
  port's own resolver against itself. It takes its `db` and `rowByKey` from
  the caller and never opens a database itself, which is what makes it
  testable.
- `reference-harness/browser/probe-never-measured-batch1.mjs`: the ACT-155
  leg now grades the RESOLVED read for the member and keeps the STORED read
  in the evidence beside it (`resolvedMember` joins `storedMember` in the
  receipt), so the difference between the two stays visible rather than
  being silently swapped. The admin keeps the stored read, because the
  admin's follow IS staged on the card's own `+*self` set by the drive
  above it, so the stored read is the faithful witness for that actor.
- `vitest.config.ts`: the new Node-runner suite is added to the exclude
  list beside its siblings, so vitest does not collect a `node:test` file as
  a suite with no tests. The gate discovers Node suites by AST import
  (`tools/node-test-runners.mjs`), so no gate registration is needed;
  confirmed by re-running that discovery, which lists the new file.

## The oracle-matched tests

- `reference-harness/browser/test/follow-preference-read.test.mjs` (10
  legs), every assertion naming the Ruby it is the counterpart of: the
  deck-wide `*all` rule answers with nothing materialized on the card's own
  set; the walk stops at the `*all` key; a set's `*all`-user default answers
  when the viewer holds no preference on that set; a preference on the
  card's own `+*self` set wins over the deck-wide rule; the viewer's own rule
  beats that same set's `*all` default; a type-set preference answers before
  the `*all` key; one viewer's preference does not answer for another; a
  trashed preference row answers nothing; the first option line is the option
  returned and every line is reported; an unknown card or viewer answers
  nothing rather than throwing; and the simple-card lookup keys are pinned in
  order.
- `tests/card/follow/follow-rule-runtime.test.ts` (3 new legs), the
  port-side counterpart of the same resolution, so the behaviour the
  repaired clause grades is pinned in the port too: a deck-wide `*all`
  preference answers for a card with nothing materialized on its own set
  (and the viewer follows the card); and the resolution stops at the first
  set holding a preference row even when that set's option does not apply.

**A correction this tranche made to its own first draft, worth recording.**
The new leg above was first written asserting that a `+*self` preference of
`*never` (whose registered test is false, `set/self/never.rb:5`) would fall
through to the `*all` key and answer `*always`. It does not, and the port
was right: `preference_card_id` resolves the SET first, and only then does
`follow_rule_option` (`followed_by.rb:39-43`) run the applicability test on
that set's content. Ruby does not continue outward. The leg now pins the
Ruby behaviour, with the ordering named.

## The battery

- `npx vitest run tests/card/follow/` -> 8 files, 41 tests, all passed
  (38 at this base before the change; the three new legs included).
- `node --test reference-harness/browser/test/follow-preference-read.test.mjs`
  -> 10 tests, 10 passed, 0 failed.
- `npx tsc --noEmit -p tsconfig.json` -> only the three pre-existing
  diagnostics in `tests/card/actions/write-path-races.test.ts:132` and `:526`
  (recorded at this base since tranche 1, untouched by this tranche). No new
  diagnostic.
- NOT RUN, stated rather than implied: the probe leg itself
  (`reference-harness/browser/probe-never-measured-batch1.mjs`) drives the
  whole batch1 probe, which boots an engine over the synthetic-v1 fixture
  and walks every action in that file. That run was not performed in this
  tranche, so the ACT-155 leg's own PASS/FAIL on a live engine is not
  claimed here. What is claimed is what ran: the resolution the leg now
  grades is green under the port-side battery (3 new legs) and under the
  instrument-level suite (10 legs).

## What is still open, with the cause named

1. **THE DEPLOY HALF OF THE ROW'S DONE CONDITION.** Unchanged: the guarded
   live deploy (the files-area pair armed by the operator, the deploy
   reaching live, a re-run of the followers probe serving the resolved set).
   Nothing here deploys and nothing touches live. **Operator-blocked.**
2. **THE FOLLOWERS WALK'S CACHE.** Unchanged: Ruby caches follower ids
   (`mod/follow/set/all/follow/follower_ids.rb:1,25-45,63-69`,
   `FOLLOWER_IDS_CACHE_KEY`); the port resolves fresh per call. Byte
   invisible on these surfaces. Named, not closed.
3. **THE PROBE LEG'S OWN LIVE RUN.** The clause is repaired and pinned, but
   the probe that carries it has not been run against an engine in this
   tranche (see NOT RUN above). The next step is one probe run over the
   synthetic-v1 fixture, which will also settle the leg's other clauses.
   This is not operator-blocked; it is the next tranche's work or this
   lane's, given machine time.