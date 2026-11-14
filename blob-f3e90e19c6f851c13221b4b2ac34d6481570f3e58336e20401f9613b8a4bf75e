# mx-B-055: the card board renders with its tabs (guide, engage, history, rules)

The roster row `mx-B-055-7b-further-signed-in-capabilit` (surface "7b.
further signed-in capabilities") reads "the card board renders with its
tabs (guide, engage, history, rules)", verdict PASS, bucket DONE, with the
evidence basis "verified - every instrument entry for B-055 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the named checks the family's exercise runs
against the board's tabs, the Ruby oracle that pins the tab surfaces, and a
fresh measurement at this tip.

## What the row is

A signed-in person opens a card's board. The board renders its tab strip,
and the tabs hold their own surfaces: Guide (the card's guide text), Engage
(the follow controls and the discussion), History (the card's acts) and
Rules (the rule set selector and rule rows).

## The instrument

Three named checks in the family's whole exercise drive the board's tabs:

- **The History tab.** "E21 the board History tab lists the run's change"
  (tools/edge-signed-in-exercise/checks-cover-b.mjs:648-664): the leg
  creates a fixture, writes content through the run, visits
  `/<card>/board`, locates the History tab by its own data-url
  (`.board a.nav-link[data-url$="/history_tab"]`, :655), clicks it, and
  records PASS only when the tab's response is 200 and the
  `history_tab-view` panel (:660) lists a board_act link carrying the run's
  own act id (:663-664).
- **The Rules tab.** "E14 a rule card's type can be changed in the board's
  Rules tab" (tools/edge-signed-in-exercise/checks-cover-b.mjs:497-541):
  the leg visits the board, clicks the strip's Rules button
  (`.board .nav-link` with text "Rules", :504-505), requires the
  `rules_tab-view` set selector (`.board .rules_tab-view
  select[name="mark"]`, :506) and drives it the way the stock widget
  submits (:512-518), then opens a rule row, saves a type change and
  records PASS on a write under 400 with the stored type (:539-541).
- **The Engage tab.** "W1 a card can be followed from the board's Engage
  tab" (tools/edge-signed-in-exercise/checks-cover-b.mjs:940-980): the leg
  visits the board, clicks the strip's Engage button (:944-945), reads the
  follow control out of the tab (:948-949), clicks it, reloads the board's
  Engage tab and requires the control to read "following" (:963-966), with
  the `*follow` rule the link names stored (:979-980).

Every board visit these legs make also grades the strip itself: the same
`.board .nav-link` locator the legs click is the strip's buttons, and the
port renders one button per visible tab
(src/card/mod-loader/mods/card-mod-edit.ts:3374-3385).

The registry's own ledger for this row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action "the card board renders with its tabs (guide, engage, history,
rules)", id ACT-055, check_ids ["B-055"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

The capability ledger's row carrying this exact label is E21
(tools/edge-signed-in-exercise/capabilities.json, "Edit board: history tab
lists changes in pills", status partial, checks: ["the card board renders
with its tabs (guide, engage, history, rules)"]); its committed finding
("History tab present; changes pills not asserted") describes the ledger
row's own scope, and this run's coverage binding records E21 partial, the
same standing scope the round-five through round-eleven runs read.

## The oracle

RUBY'S OWN TABS ARE CAPTURED IN THIS REPOSITORY. The committed render
capture (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
carries one arm per tab view of set/all/board/tab_views.rb, all driven
against the same card:

    probe-view:152:guide_tab    the guide-view slot, its .guide-text body
                                and the edit-link to /*all+*guide/rule_edit
    probe-view:150:engage_tab   <div class="m-3 mt-4 _engage-tab"> wrapping
                                the follow_section slot
    probe-view:153:history_tab  the history_tab-view slot, its creator
                                credit and its board-pills pill list
    probe-view:168:rules_tab    the rules_tab-view slot, its filter form
                                and its <select name="mark">
    probe-view:167:related_tab  the related_tab-view slot (the strip's
                                fifth tab)

RUBY'S OWN SOURCE OWNS THE STRIP AND THE TABS. The board mod's tab views
(card-mod-edit-0.20.0/set/all/board/tab_views.rb) define view :engage_tab
at :2-5 (wrap div "m-3 mt-4 _engage-tab", [render_follow_section,
discussion_section]), view :history_tab at :7-12 (wrap :slot, the acts
board layout), view :related_tab at :14-19, view :rules_tab at :20-31 (the
set selector), view :follow_section at :33-35 and view :guide_tab at :35-37
(render_guide). The strip's tab list is board.rb's BOARD_TABS constant,
which the port pins by name (card-mod-edit.ts:3090-3092).

THE PORT RENDERS THE SAME STRIP AND THE SAME TABS.
src/card/mod-loader/mods/card-mod-edit.ts carries the constant
(:3093-3100: Account, Guide, Engage, History, Related, Rules, each mapped
to its view), the visibility predicates (:3290-3310, following
tab_visibility.rb's show_* rules: guide by the guide helper's presence,
engage for a real card when signed in or discussion is allowed, history
and related for a real card, rules always), the per-tab buttons
(`<a data-url="/<mark>/<view>" class="active|load nav-link" ...>`, :3374-3385)
and the nav-tabs panel (`<ul class='nav nav-tabs' role='tablist'>` with one
pane per tab, :3394-3397). The tab surfaces the instrument drives are the
port's own views: the engage tab's `_engage-tab` wrap (:3774-3801), the
history tab's slot wrap (:3537), and the rules tab's set selector (the
`.rules_tab-view` markup the E14 leg reads).

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the tab titles and the view each button loads; the
data-url shape (`/<mark>/<view>`); the engage tab's `m-3 mt-4 _engage-tab`
wrap; the history tab's `history_tab-view` slot; the rules tab's
`rules_tab-view` slot with its `select[name="mark"]`; the guide tab's
`guide-view` slot; and the visibility answers the strip gives a signed-in
viewer of a real card. The instrument drives three of the four tabs'
contents through those same shapes and grades their answers.

NOT oracle-matched, and stated rather than glossed over: no exercise leg
CLICKS the Guide tab (the strip renders it and the leg selectors read it;
Ruby's captured guide_tab arm and the port's guide_tab delegate at
card-mod-edit.ts:3041-3044 pin its bytes). The board's whole-surface byte
equality is not claimed, only the elements the instrument drives. The
Account tab is the account holder's own tab (its visibility is
card-mod-account's abstract/account_holder.rb override) and is graded by
the E19 check, not by this row.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12-20261025/rows-r1/report.md

    source 26f4d6a4eccdebcc9994b01ff2924c9b6f6808e2, started
    2026-10-26T00:15:17.870Z, completed 2026-10-26T00:38:01.781Z,
    the source files clean
    verdict: PASS

The three named checks in this run:

    E21 the board History tab lists the run's change
        {"card":"Harness_CB_History_mvoiqu0y","cardId":53150,"expectedActId":121,"actIds":[121],"tabStatus":200}
    E14 a rule card's type can be changed in the board's Rules tab (the write answers 200)
        {"writeStatus":200,"ruleName":"Harness_ruleType_mvoiq0z8+*self+*default","storedTypeId":22,"expectedTypeId":22}
    W1 a card can be followed from the board's Engage tab (link becomes following; *follow rule added)
        {"board":200,"tab":true,
         "followLink":{"text":"follow","cls":"follow-link  slotter btn btn-sm btn-primar",
                       "href":"/update/Harness_watchme_mvoit10t+*self+Harness_Member+*follow?card%5Bcontent%5D=%5B%5B%2Aalways%5D%5D&success%5Bmark%5D=Harness_watchme_mvoit10t&success%5Bview%5D=follow_section"},
         "followRule":"Harness_watchme_mvoit10t+*self+Harness_Member+*follow","ruleExists":true}

The run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live
  request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The Guide tab click is not claimed as exercised; its oracle is the
  captured arm and the port's delegate, as stated above.
