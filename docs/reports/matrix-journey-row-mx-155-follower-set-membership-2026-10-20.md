# Row mx-155 - the follower-set membership predicate: the pin's defect fixed, the W4 leg's other causes named

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`docs/registry/completeness-roster.json`, family matrix-journey, bucket
WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check: the W4 action "Followers list and 'all followed cards' view"
(instrument-coverage-matrix action 154, capability id W4).

## What the row asked for

The row's blocker text: "port landed, deploy pending ... the followers-route
lane's residual engine gaps (three surfaces measured head-to-head, pin
8948c305) remain the port-side work."

The pin (commit 8948c305, branch fix/unmeasured-tranche-3-20261019) names the
defect exactly:

> cardBelongsToSet (src/card/render/content-overrides.ts) decides the right/\*
> and type_plus_right/\* arms from card.name alone. The committed pins at
> tests/card/render/content-overrides.test.ts:125-144 use A+when_created,
> whose right key IS the anchor; a real Decko starred field is A+\*when
> created, whose right key is \*when_created. Measured at d8050251:
>
>   Home+\*followers    rightName.key=\*follower    belongs right/followers=false
>   Mira Member+\*follow                            belongs type_plus_right/user/follow=false
>   Home+\*when created rightName.key=\*when_created belongs right/when_created=false
>   Home+\*when last edited \*when_last_edited       belongs right/when_last_edited=false

The pin's four legs were `it.fails` (green while the defect stands, red the
moment the matcher is fixed).

## The defect, in Ruby's terms

Ruby's set membership is `Card#in_set?` (card-1.110.0
lib/card/set/pattern/all.rb:62-64): the card's PATTERNS' module keys against
the set module's shortname. A module key is built from the anchor card's
**codename** (lib/card/set/pattern/base.rb:21-29 `module_key` over
`anchor_codenames` :39-43), and the right pattern's anchor is the right
part's card (mod/core/set_pattern/07_right.rb:22-24 `card.name.tag`).

The port compared the right part's name **KEY** instead. No card a Decko
deck produces carries that shape: a real field card is "A+\*when created",
whose right part is the card "\*when created" - key "\*when_created"
(singularized), codename "when_created". The key comparison therefore
missed every real field card, and with it the follower-set override
(card-mod-follow.ts:1661) never fired on a real card.

Deck facts, measured on the pinned deck
(`decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`, 21676
cards, this session):

    id 22725  name "*followers"       codename "followers"       key "*follower"
    id 22720  name "*follow"           codename "follow"          key "*follow"
    id 11739  name "*when created"     codename "when_created"    key "*when_created"
    id 11742  name "*when last edited" codename "when_last_edited" key "*when_last_edited"

The star marker is why the key could never answer: the key is
singularized ("\*followers" -> "\*follower") while the codename is the name
underscored, and the set module's path is the codename ("right/followers").
Decko looks cards up by key, so "\*followers" and "\*follower" are the same
card.

## The change

`src/card/render/content-overrides.ts`:

- the `right` arm now compares the anchor card's **codename** with the set
  path's anchor: the installed name environment's answer when it can give
  one (the engine installs it at boot - fetch.ts#installNameEnvironment),
  the name-derived spelling otherwise (the codename rule: the star dropped,
  non-alphanumerics underscored, lowercased - the same fallback shape the
  set-module chain walker uses in render/set-keys-to-modules.ts);
- a `type_plus_right` arm exists now - the pattern had **no arm at all**, so
  every type_plus_right set path fell through to `default: return false`.
  Its anchor is the left card's type plus the right part's card
  (08_type_plus_right.rb:30-32), and the left type reaches the predicate
  through the card's safe_set_keys (the "TYPE_PLUS_RIGHT-<left type>-<tag>"
  token the render enrichment builds - src/card/render.ts:1642-1643,
  :2147-2173), because the left card's type is not in the card's own name.
  A card that carries no set keys cannot answer it, exactly as Ruby builds
  no module key without the anchor's codename;
- the arms keep their old answers for the unstarred names the committed
  pins use ("A+when_created" -> right/when_created stays true).

## The oracle-matched tests

`tests/card/render/act155-set-membership-on-real-starred-cards.test.ts` -
the pin's four legs with the answers the port now gives, plus the
registry-path legs (the codename registry is authoritative when it can
answer: the same card read through its other name, "Home+\*follower",
belongs to right/followers with the registry installed and to
right/follower without it), the anchor-distinctness legs, the left-type
discrimination leg and the unstarred control.

    npx vitest run tests/card/render/act155-set-membership-on-real-starred-cards.test.ts
    -> 1 file, 9 tests, 9 passed

## The battery

- the touched area: `npx vitest run tests/card/render/ tests/card/mod-loader/`
  -> 380 files: 348 passed, 31 skipped, 1 failed file with 3 legs. The 3
  legs fail with `Error: ENOENT ... C:\localProjects\archive\decko-fork-study\decko\mod\edit\set\type\pointer.rb`
  - a file that does not exist on this machine; the suite reads the Ruby
  sources, so it is a data-absence failure, not a regression from this
  change.
- the full correctness gate: `node tools/test-gates.mjs run correctness`
  -> 594 files: 535 passed, 54 skipped, 5 failed; 6262 tests: 6014 passed,
  247 skipped, 1 failed. The 5 failed files all report
  "staging-server dist bootstrap: tsc -p tsconfig.json failed (status 2)",
  and the tsc diagnostics are the three pre-existing ones in
  tests/card/actions/write-path-races.test.ts:132 and :526 (a file this
  change does not touch; the same three are recorded as pre-existing at
  this base in brandonDojoTech/docs/reports/matrix-fails-triage-1-2026-10-19.md
  and in the branch tips' own commit messages). The 1 failed test is
  tests/server/drivers/mysql-lifetime.test.ts, "ends the server when the
  process that started it is force-killed": `EPERM, Permission denied` on
  the Windows temp dir cleanup - environmental.

## The W4 surface, measured before and after

The W4 leg's own instrument is the exhaustive probe
(`reference-harness/browser/probe-never-measured-batch1.mjs`, leg ACT-155).
It was run twice, on two worktrees, the second one at this base without
this change:

    with the change    (this branch):
      storedAdmin      {"found":true,"option":"*always"}
      storedMember     {"found":false,"why":"the card has no +*self set"}
      followersRead    {"status":200,"url":".../HarnessW4MemberFollows_mvhu11si22t+followers"}
      followersText    "HarnessW4MemberFollows mvhu11si22t+followers P4_DEFAULT_mvhtyy9a59m Type RichText PlainText Markdown ..."
      adminOverviewHasCard false, memberOverviewHasCard false, memberOverview status 500
      failures 1 of 15 legs

    without the change (baseline worktree at 8268a145):
      storedAdmin      {"found":true,"option":"*always"}
      storedMember     {"found":false,"why":"the card has no +*self set"}
      followersRead    {"status":200,"url":".../HarnessW4MemberFollows_mvhua9lf5rn+followers"}
      followersText    "HarnessW4MemberFollows mvhua9lf5rn+followers P4_DEFAULT_mvhu86r66bg Type RichText PlainText Markdown ..."
      adminOverviewHasCard false, memberOverviewHasCard false, memberOverview status 500
      failures 1 of 15 legs

The two runs agree leg for leg (the only differences are the fixture
stamps). The W4 leg is RED before and after this change, with the same
evidence - this change does not regress the surface and does not close it
either.

## The two remaining causes, named

1. The member's follow option is not materialized on the card's "+*self" set
   ("the card has no +\*self set"). The probe expects the fixture's
   deck-wide Mira rule (the "\*all viewer rule", option "\*always") to make
   her a follower of every card; the port does not materialize that
   preference onto the card's own set. The admin's own follow (a staged
   write through the Engage tab) stores correctly - "storedAdmin" is
   "\*always" in both runs.
2. The all-followed-cards views do not list the followed cards, and the
   member's own view answers **500** - the base-format input view is not
   ported (the matrix note for this action names the stack: card-mod-list
   js:109 in the run logs).

Neither is the membership predicate the pin named, and neither is closed by
this change.

## Disposition

- The pin's defect is **fixed**: the right/\* and type_plus_right/\* arms
  now answer the way Ruby's `in_set?` answers - by the anchor card's
  codename, with the registry authoritative and the name-derived spelling
  as the fallback - and the pin's four legs are green as tests.
- The row's W4 surface stays RED for the two named causes above, and the
  row's DONE condition still also waits on the guarded live deploy (the
  row's own text: "DONE when the files-area pair is armed (operator), the
  guarded deploy reaches live, and a re-run of the followers-probe serves
  the resolved set"). Named remainder by path:
  `brandonDojoTech/tmp/live-reprobe-20261020/receipt-4-followers-route-render.json`
  and
  `decko-ts-release-lead/tmp/deploy-night-20261020/verdict-2026-10-20-live-refused-staging-files-area-pair-not-armed.json`.
- The row's bucket is unchanged in the roster; this lane does not edit the
  roster.
- One named remainder of this change: the date family now activates
  deck-wide through the same predicate (the pin warned about exactly this:
  "deciding membership from card.setKeys also activates the date family
  deck-wide"). The correctness gate above is the measurement of that
  activation: no test in the 6262-test suite changes verdict because of it.
