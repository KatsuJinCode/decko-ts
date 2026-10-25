# The W4 remaining leg: the all-followed-cards editor renders the stored preference rules

The one failing leg the gap batch 1 acceptance record left
(docs/runs/gapbatch-1-2026-10-25/family-and-baseline.md): the
"all followed cards" dashboard answered 200 with the follow editor where the
pre-seat bundle answered 403, but the editor's items rendered empty ("no
entries") where the recorded original names the followed cards. The
acceptance record named two mechanisms; this lane measured both, fixed the
one that was a port defect, corrected the instrument's read of the door, and
closed the row on the port's own behavior.

## The two named mechanisms, measured

1. THE DECK-SHAPE LIMIT was real but did not apply to the harness accounts.
   The dashboard junction's set module (card-mod-follow-0.20.0
   set/type_plus_right/user/follow.rb) anchors on the LEFT card's type
   through its CODENAME (card-1.110.0
   mod/core/set_pattern/08_type_plus_right.rb:30-32 anchor_name over
   left_type; lib/card/set/pattern/base.rb:21-29 module_key over
   anchor_codenames). The exercise's own throwaway accounts are seeded with
   the repo's account seed pattern (tools/edge-signed-in-exercise/lib/
   seed-local-accounts.mjs: the holder's type is the card whose codename is
   "user"), so their junctions resolve the module. The demo deck's own
   account census, measured read-only this session on the source snapshot
   (SHA-256 6aebb654...): 185 Person-typed holders (the cardtype NAMED
   "Person", id 4, codename "user"), 55 "Sign up"-typed (codename "signup"),
   2 Cardtype, 2 RichText, and NO BasicCs-typed holder. The 55 Sign-up-typed
   holders' dashboards take the unknown-card branch in the port and, by the
   same codename arithmetic, in the pinned Ruby - that part of the W4
   finding's deck-shape statement stands; the "BasicCs-typed account" figure
   of the finding does not describe this snapshot's account rows.

2. THE ITEMS WALK was a port defect one layer below the view, at the set
   membership gate. The rendered bytes on the serving path were the tab
   editor with "no entries" (the run's captured page), which means the :core
   view override FIRED (the tab machinery of user/follow.rb:39-43) while the
   seam's editor-row walk never ran. The walk is gated on
   isUserFollowDashboard (src/card/follow/follow-render-seam.ts:54), which
   consults cardBelongsToSet's LOOSE type_plus_right arm
   (src/card/render/content-overrides.ts). That arm compared the left type's
   NAME spelling from the safe_set_keys token against the module anchor:
   the seated junction's token reads TYPE_PLUS_RIGHT-person-Xfollow (the
   cardtype is NAMED "Person"), the anchor is "user" (the codename), the
   spelling comparison answered false, and the page render (view titled)
   prepared no rows. Ruby's own walk keys the module on the anchor
   CODENAMES, not the type's name spelling, so the original answers the
   junction the way the strict arm already did. Measured in isolation at
   this lane's first commit: with the name environment installed (as the
   serving path has it), loose false, strict true.

3. THE INSTRUMENT read a surface the original never renders. The dashboard
   leg's page read asked for .card-list.pointer-list with .pointer-item rows
   (readPointerList) - the List abstract's core
   (card-mod-list set/abstract/01_list/html_views.rb:6-13). The dashboard's
   own :core override (the tab machinery) shadows that core, and
   board.rb's board_link_opts opens the door at view=content, which html's
   content view delegates to render_core: both doors render the TAB EDITOR,
   whose rows are follow_editor.haml's
   .pointer-list-editor > ul.delete-list.list-group > li.list-group-item.
   The recorded oracle bytes say the same: the synthetic-v1 oracle answers
   /Mira_Member+*follow firstView=titled with "Follow Ignore check
   everything" (tests/card/set-modules/virtual-set-modules.test.ts header,
   the check-everything row being the editor's follow_item). A grader that
   reads the list-family core on this view cannot pass against the
   original's own bytes at any port fidelity.

## What closed it

Two commits on port/w4-editor-20261025 (from the newest pushed roll tip
ebd0ed03, the gap batch 1 acceptance record):

1. `1e1435da` - the loose type_plus_right arm of cardBelongsToSet falls
   back, after a spelling miss, to the same codename resolution the strict
   arm runs (type key -> lexicon id -> codename, over the environment's
   prewarmed sync adapters; no new storage reads on the hot path). The
   seam's isUserFollowDashboard answers true for a Person-named user
   cardtype, the page render prepares the editor rows, and the Follow pane
   renders one row per following option - the follow_item bytes the oracle
   records ("check <set label>", the row's href naming the followed card).
   Pins: tests/card/render/act155-set-membership-on-real-starred-cards.test.ts
   gains the Person-shape leg and the discrimination control (11 tests, 11
   pass).
2. `e1d6a081` - the W4 instrument grades the door the original renders:
   readFollowEditorRows walks the follow editor's rows (same {text, hrefs}
   shape the pointer-list reader returns, the literal "no entries" row
   dropped as the walk's empty arm), both doors are read (the plain page
   and /content), the unknown-card create form is graded from the live
   pages instead of the hardcoded false, and the count the verdict
   reconciles is the deck's FOLLOWING rules - follow_editor_helper.rb's own
   split (rules whose option lines include *never are the Ignore tab's
   rows). Pins: tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs
   (6 tests, 6 pass).

## The proof shape

The row closes on the port behavior, proven on the module-carrying deck
shape the exercise itself seeds: the W4 module alone at `e1d6a081`
(node tools/edge-signed-in-exercise.mjs --only w4-follow-views --out
.runtime/w4-editor/run2/report.md; the executed bundle SHA-256
19f780c39b8b427c129f019c5afb5336945c5a89dd36bbd70d0518681ab5e7b5, the same
deck snapshot SHA-256 6aebb654... the W4 probe recorded, productionRuntime
false, nothing reached a live site and nothing deployed) graded 9 / 9, all
four W4 legs PASS. The dashboard page now renders, in the run's own capture:
"Follow Ignore check Harness_W4_followed_a_mvnxj2vn check
Harness_W4_followed_b_mvnxj2vn" - the editor rows carry each followed card's
name and its href, ruleCount 2 equals the stored rule count, and the
unfollowed control names nothing. That deck shape is not a different deck:
the harness accounts are seeded per the repo's own seed pattern with the
same cardtype the demo deck's 185 Person-typed accounts carry, so the
editor's behavior closes for those accounts too. The demo deck's
Sign-up-typed accounts (55 holders) stay on the unknown-card branch, in the
port as in the pinned Ruby's codename arithmetic; that residual is the deck
shape, not a port defect.

## The whole-family exercise at the lane's measured commit

node tools/edge-signed-in-exercise.mjs --out
.runtime/w4-editor/family/report.md at `e1d6a081` (the same bundle and deck
snapshot as the module run): **315 / 320**, capability coverage 92 covered /
1 partial / 0 not covered / 1 out of scope, and the W4 row reads covered in
the run's own record. The five failures are the baseline's own named
failures (the gap batch 1 acceptance record's six) minus the W4 dashboard
leg this lane closed: the RichText editor toolbar leg, N9 applied layout,
P5 *type_plus_right, the C20 junction, and the timings leg. Nothing new
failed. The baseline holds with +1 check. The only commit after the
measured commit is this receipt (docs only, no source bytes).

## Code-level acceptance at the measured commit

- npx vitest run tests/card/follow/ tests/card/set-modules/
  tests/card/render/fresh-deck/absent-cards.test.ts
  tests/card/render/act155-set-membership-on-real-starred-cards.test.ts:
  85 tests, 12 files, 0 failures.
- npx vitest run tests/card/render/content-overrides.test.ts
  tests/card/render/date-content-override-behavior-freeze-pins.test.ts
  tests/card/render/content-options-catalog-render-path-pins.test.ts
  tests/card/set-modules/virtual-set-modules.test.ts: 56 passed, 3 skipped;
  the content-options catalog suite did not run in this checkout (needs
  local data a clean clone does not carry, per docs/TESTING.md).
- node --test tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs:
  6 tests, 6 pass.
