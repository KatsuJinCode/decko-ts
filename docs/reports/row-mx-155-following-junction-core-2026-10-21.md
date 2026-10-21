# Row mx-155 - the +*following junction: the tranche-3 named gap closed (virtual flag + :core, both arms)

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT). Instrument-coverage-matrix action 154
(ACT-155), capability id W4: "Followers list and 'all followed cards' view".

This is tranche 4 of the family (branch
`port/matrix-journey-tranche4-20261021`, based at
`port/matrix-journey-tranche-20261020` tip `c18e3f44` - the ask's named
base `48d1e0dc` plus the family's own four tranche-3 commits, this row's
included, so the verification measures the ported state). Tranche 3 closed
the two named follow-view gaps and left a "What is still open" list; its
item 3 was THE `+*following` JUNCTION'S VIRTUAL FLAG, named but
deliberately not half-ported: "Registering the virtual flag without the
:core view would swap the honest create-form arm for a wrong-core render."
This tranche closes that item by registering BOTH together.

## The named runnable check, run at this base

The row's committed oracle-matched battery (the durable check tranche 3
landed with its fix):

    npx vitest run tests/card/follow/

Before the change, at the base: **7 files, 33 tests, all passed**. After
the change: **8 files, 38 tests, all passed** (the new
`act155-w4-following-junction-core.test.ts` carries 5 legs; nothing green
went red).

## The gap, and the Ruby source it closed

card-mod-follow-0.20.0 set/right/following.rb is a set module that
overrides `virtual?` AND declares its own :core:

- :2 `assign_type :list` (Type.assignment["Right::Following"], the
  advanced_api.rb:5-8 registration the type walk reads,
  mod/core/set/all/type.rb:68-76);
- :4-6 `def virtual?; new?; end` - every `<card>+*following` junction is
  KNOWN with no database row (states.rb:60-62 `known? = real? ||
  virtual?`), so the page renders its own views instead of
  page_view_for_unknown's create form (card-mod-format
  set/all/html/error.rb:81-86);
- :13-19 `view :core` - the two arms: `card.left && Auth.signed_in?` ->
  `render_rule_editor` (the same card's :rule_editor view, whose
  preference_name/current_follow_rule_card reads tranche 3 already
  ports); otherwise `nest Card.fetch(card.name.left, :followers),
  view: :titled, items: { view: :link }` - the LEFT's follower list
  (empty when the left is missing, right/followers.rb:16-18 `left ?
  item_names.to_pointer_content : ""`).

The port had the following junction's :status, :one_line_content and
:rule_editor registered but neither the virtual flag nor any :core - the
exact shape the tranche-3 note named.

## The change

- `src/card/mod-loader/mods/card-mod-follow.ts` - the right/following
  registration carries `virtual: true` (the registry entry the render
  layer's seat and page gates consult) and `assignsType: "list"` (the
  file's :2 line), and a new `followingCoreView` implements the two arms:
  the signed-in arm over an EXISTING left dispatches the registered
  :rule_editor view (render_rule_editor); the signed-out arm - and the
  missing-left arm, because Ruby's guard tests `card.left` FIRST - nests
  the left's `+*followers` junction titled with items view :link, built
  as the virtual-known card Ruby's fetch answers (the *default-template
  RichText typing, type.rb:58-66). `newCardRenderCard`'s type opts went
  optional for that build (the ids ride only when the cardtype card is
  warm).
- `src/card/follow/follow-render-seam.ts` - `isFollowingJunction` joins
  the seam's root predicates (`followSeamRootNeeded` now covers all
  three virtual follow cards); the follower-names walk runs for the
  following junction too (the signed-out :core arm's nest items are the
  same names - followerNamesForLeft over the junction's left); the
  bundle's rule_editor branch prepares for a following-junction root
  whose REQUESTED view is :core (the signed-in arm IS render_rule_editor,
  so the preference name and applied-preference walk must exist for the
  core dispatch, not only for a direct rule_editor request).
- `src/card/render.ts` - the seam-prepare tail warms the following root's
  LEFT card and the LEFT's `+*followers` junction (the :core arms' sync
  reads; the root's own `<root>+*followers` warm composes the wrong name
  for this root), and takes the rule_editor names warm for the
  following-junction root.

## The oracle-matched tests

- `tests/card/follow/act155-w4-following-junction-core.test.ts` (5 legs):
  the signed-in :core over an existing left renders the rule editor (the
  edit-rule wrap, the rules mod's rule_form slot, the actor's name riding
  the composed preference card `Report Index+*self+Ada Admin+*follow`);
  the signed-out :core renders the left's followers nest titled with link
  items (the LIST core wrapper carrying the item view
  `card-list card-list-link pointer-list`, the follower as a link,
  `href="/Mira_Member"`); the junction seats KNOWN without a row; a
  junction whose left does not exist takes the NEST arm even SIGNED IN
  (the card.left guard) and renders the empty follower list; the type
  assignment rides the registration (`getSetTypeAssignment("Right::
  Following")` is "list" after load).
- `tests/card/mod-loader/view-dispatch-css-js-format-ancestry-census.test.ts`
  - the composed-deck view census caught the new registration (html 342
  -> 343) and was re-pinned with the cause named, the same re-pin
  discipline its comment chain records for every prior view landing.

## The battery

- `npx vitest run tests/card/follow/` -> 8 files, 38 tests, all passed
  (the new file included; 7 files / 33 tests passed at the base before
  the change).
- `npx vitest run tests/card/mod-loader/` -> 121 files: 1895 passed, 1
  skipped, 0 failed (one run at 1894/1 failed the view census BEFORE the
  re-pin; the re-run after the re-pin is the number above). The suite
  the clean clone cannot run (parityfix-row7-mod-edit-gemspec-summary,
  data/setup absent) records as "Not run", unchanged from tranche 3.
- `npx vitest run tests/card/render/` -> 260 files: 228 passed, 31
  skipped, 1 failed file with 3 legs - the pre-existing data-absence
  failure (content-options-one-line-count-capture-state-pins.test.ts
  reads Ruby sources from `C:\localProjects\archive\decko-fork-study\...`,
  paths this machine does not carry; recorded at this base in the
  tranche-1 report and unchanged in tranche 3's battery). No new
  failure.
- `npx tsc --noEmit -p tsconfig.json` -> the three pre-existing
  diagnostics in `tests/card/actions/write-path-races.test.ts:132` and
  `:526` (recorded at this base since tranche 1). No new diagnostic.
- The row's surfaces also ride the family's fresh full signed-in
  exercise at this base (the mx-B-081/mx-B-086 run,
  `docs/reports/row-mx-B-081-nest-image-editor-verification-2026-10-21-tranche4.md`
  once that row's report lands) - the bundle this tranche builds carries
  the following-junction :core, so any deck surface in the journeys
  family exercises it.

## What is still open, with the cause named

1. **THE DEPLOY HALF OF THE ROW'S DONE CONDITION.** Unchanged: the
   guarded live deploy (the files-area pair armed by the operator, the
   deploy reaching live, a re-run of the followers-probe serving the
   resolved set). Nothing here deploys and nothing touches live.
2. **THE MEMBER'S FOLLOW PREFERENCE LEG (the probe's `storedMember`
   clause).** Unchanged from tranche 2's naming
   (`docs/reports/row-mx-155-follow-views-base-format-input-chain-2026-10-21.md`
   :196-208): the probe leg expects the member's follow option
   MATERIALIZED on the card's own +*self set, while the fixture's
   deck-wide rule sits on the *all set and Ruby's resolution is the
   set-pattern walk, not materialization. The probe leg stays RED on
   that clause; this tranche did not change the probe.
3. **THE FOLLOWERS WALK'S CACHE.** Unchanged: Ruby caches follower ids
   (follower_ids.rb:25-45 FOLLOWER_IDS_CACHE_KEY); the port resolves
   fresh per call. Byte-invisible on these surfaces; named.
