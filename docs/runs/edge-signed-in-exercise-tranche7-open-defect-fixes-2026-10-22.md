# [Family] tranche 7, 2026-10-22: the open defect fixes

The base is the tranche-6 branch tip,
`origin/port/capability-tranche6-20261022` at `828d145e` (the branch's tip
when this tranche started; `3cd58cdd` is the tip the tranche-6 record
names, and `828d145e` is that commit plus the JUnit reporter). The branch is
`port/capability-tranche7-20261022`.

The work is what the tranche-6 run record
(`docs/runs/edge-signed-in-exercise-tranche6-open-defect-fixes-2026-10-22.md`)
names as open, in its order.

## The base run

`node tools/edge-signed-in-exercise.mjs` at `828d145e`, the local stack, the
21,676-card local deck copy, the loopback database and storage, the owned
in-process mail capture, headless Chromium.

**273 / 292 passed, 19 failed.** The run record is
`.runtime/edge-signed-in/tranche7-base-1/report.md` with its raw page
captures beside it.

The tranche-6 record's own measured tip was 270 / 292; this tranche's base
measures 273 / 292 on the same 292 checks, so the three-check difference is
in the legs the tranche-6 record listed as another family's (the owner
audit's timing leg and the two timing legs pass at this tip, and the E11b
instrument throws instead of measuring).

The 19 failures, in the tranche-6 record's order:

| leg | row | the evidence at the base | where the cause sat |
|---|---|---|---|
| the result-specific create link's destination | C6 | failures ["destinationNameField"]: the name field carried "zz no such card harness mvjq163s" where the address spells "zz_no_such_card_harness_mvjq163s" | the CHECK's expectation (the fold is Ruby's own) |
| the layout's main nest | N9 | failures ["cardBodyNotRendered"]: the card's own body was never written | the FIXTURE |
| the image-change leg | F3 | failures ["altNotCardName","sizeNotInSource","wrongExtension"], sourceMoved false | the CHECK's read (it read the navbar's logo) |
| the /files download link leg | F1 | failures ["noAttachmentCardName","noChosenFileChip"]; the download anchor was right | the CHECK's read (the class list, the document) |
| the three rule-set legs and the self-structure leg | P5 | noRIGHTToken, noSELFToken, and two fixtures refused | the FIXTURES |
| the rename form and the referer id remap | R1 | noRenameForm, refereeIdNotRemapped | the CHECK's read (the form's inner html, the KEY) |
| the follow stop link and the stored preference | W2 | the "after" state was identical to the "before" state | the CALLER's click (an escaped href) |
| the administrator's update rule | P6 | "P6 seed update rule was not stored (HTTP 422)" | the FIXTURE's seed |
| the three remaining CQL operator legs | N2 | wrongResultSet on three legs whose pages were right | the CHECK's expectation model |
| /*search lists the cards this run just created/edited first | N5 | runCardsFirst false | the row's own surface (the record's own words) |
| the E11b instrument | other families | threw "database is not defined" | the HARNESS |
| no request returned a 5xx | other families | GET /Harness_date_mvjq10tr 500 | the PORT (named below) |

## The fixes

Each one is a commit of its own, each with a test pinned to the committed
Ruby source or the committed Ruby capture, and each is graded by the
signed-in run.

### cap-C6 (32ff24f6): the create form carries the NAME Ruby decodes the mark into

The port was right and the check was wrong. The create offer's destination
is the card's own PATH, and the path spells the card's url_key; the NAME
the absent-card render displays is what Ruby's own fetch decodes the mark
into - card-1.110.0 lib/card/fetch/card_class.rb:128-133 uri_fetch_opts:
`opts[:name] ||= Name[params[:mark]]&.tr "_", " "`. So the name field
carries the SPACED spelling. The fold is in the NAME, not in the lookup:
the two spellings share one cardname key. The predicate now derives the
expected name from the mark, and the test reads the committed Ruby source
of the decode.

### cap-N9 (d48b0cb8, 62104b13): the fixture writes a body, and the marker is the card's own body card

Two defects, one row. The User type's content field is a RichText field,
so the create form carries a TinyMCE editor and the form's `card[content]`
field is the editor's HIDDEN textarea: filling it stores nothing, the card
was created with an empty body, and the main-nest leg measured a body that
was never written. The fixture now sets the editor and reads the stored
content back. And a User card is a CARDTYPE INSTANCE - its body is the
type's structure, whose own cards carry the card's NAME in their titles
("<card name>+image") - so the body marker is that title, not a text the
type cannot carry. The card's BARE name cannot be the marker: it also
appears in the page's header, outside the layout, and the predicate takes
the first occurrence.

### cap-F3 (5e301025): the image leg reads the card's own region

The predicate grades "the core view is what the CARD SLOT renders" and
takes the first `<img>` of the html it is handed; the caller handed it the
WHOLE PAGE, and the first `<img>` on a card page is the deck's own logo in
the navbar (alt="*logo"). The card's own content is the #main region - the
scope the harness's own F9 leg already uses.

### cap-F1 (4754b5ec): the chooser's field is read by its class list, and the chip out of the document that renders it

file_chooser.haml says
`= hidden_field card.attachment_name, class: "attachment_card_name", value: ""`
and the committed Ruby capture of the gem's own bytes renders that field as
`<input class="attachment_card_name form-control" value="" ...>` - the class
attribute carries BOTH classes, so a reader that required the class
attribute to be exactly "attachment_card_name" found nothing in Ruby's own
bytes. And the chip is preview_editor.haml's `.chosen-file` block, which
Ruby's own flow puts in the FORM (the gem's upload.js.coffee swaps the
upload round trip's response into the chooser's `.chosen-file`); the card's
core view is core.haml - ONE anchor - so a leg that looked for the chip
there looked for it in a document that never carries it.

### cap-R1 (0c87ad25, 42ceac6d, 48046e44): the rename form is read whole, the referer control is read with either quote, and the table is compared by the deck's own key

Three defects in the row's two legs, all in the CHECK's reads.

(1) THE FORM'S OWN HTML. The predicate scopes to the form (the one whose
class carries "_rename-form") and the caller handed it the form's INNER
html, which does not carry the form.

(2) THE SKIP-REFERERS BLOCK, read with either quote character. The
committed Ruby capture of the gem's own bytes writes
`<div class='skip-referers pb-2'>` with the apostrophe - this deck's Haml
attr_wrapper - and the predicate required exactly that; the page the
harness reads carries the same block with DOUBLE quotes, so the scope
found nothing and the leg named a rename form with no referer control,
with the control itself found and the form's own action right.

(3) THE DECK'S OWN KEY. The reference table stores the card's KEY
(card-1.110.0 lib/card/reference.rb:26-27 map_referees), and the grade
compared the row's key with a key the PREDICATE re-implemented from the
name. The caller now hands the predicate the two cards' own key columns,
read out of the deck.

The predicate scopes to the form (the one whose class carries
"_rename-form") and the caller handed it the form's INNER html, which does
not carry the form. And Ruby's map_referees re-points the rows whose
referee_key is the renamed card's KEY, while the grade compared the row's
key with the NAME.

### cap-W2 (fb61f1db): the follow control is clicked by the DOM's own href

The link's shape is parsed out of the page's HTML, where the href is
HTML-ESCAPED, and the locator was built from that escaped string; the DOM's
attribute value is the unescaped one, so the locator matched nothing, the
click never happened, and the "after" state was the "before" state.

### cap-P6 (16a9bc7d): the update rule is seeded the way the read rule is seeded

A rule card is a PHRASE whose content is a list of card references; the
update rule's seed used card[type] "Set" and the bare word "Anyone", and
the create was refused with 422.

### cap-P5 (65546289): the self-structure leg creates its OWN card

A fixture that creates a name the run already created is refused with a
name conflict: the *right Set leg above it had already created
"Harness_CB_Cereal", so the self-structure leg's create was a 422 and the
leg never ran.

### cap-N2 (33333989): the operator legs' expected sets are the deck's own rows, named as the page names them

Three parts, all in the expectation model: a JUNCTION ROW HAS NO NAME in
this deck (the expected sets carried nulls while the page renders the
COMPOSED name); `right: X` returns the cards whose RIGHT side is X, not X
itself; and a result set larger than one page shows the first SEARCH_PAGE_CAP
of it (src/card/render/search-paging.ts:16, the CQL limit ?? 20).

### E11b (2cd25d03): the leg destructures the handles it uses

The leg read `database()`, `page`, `visit` and `record` as free identifiers
and threw "database is not defined" - it never measured anything. The row's
own status is untouched: the tranche-6 record names the E11b instrument as
another family's row, and this commit changes no registry status.

## What is still open, named

| leg | row | the evidence | where the cause sits |
|---|---|---|---|
| the administrator's update rule | P6 | the leg gets PAST the seed now (the rule is stored, the create is not refused) and reaches the Rules tab, where it waits 15 s for the tab's set selector (select[name="mark"]) and times out: "waiting for locator('.board .rules_tab-view select[name='mark']').first()". The read leg's own path finds that selector on the same tab, so what the update leg's board renders differently is not yet settled | the LEG's board path |
| the three rule-set legs | P5 | the *right leg visits the cereal card itself, which carries no RIGHT token: the RIGHT token belongs to a card whose RIGHT side is the cereal card (the port's own set-keys doc: a new `<x>+legacy` card reads "ALL ALL_PLUS TYPE-rich_text RIGHT-legacy ..."), and Ruby's own spec visits "/Test+cereal". The Self leg visits a card whose set keys are ["ALL","TYPE-basic_c"] - no SELF token - while the rule it created is the card's own *self rule. The *type plus right leg's rule was not stored at all: the create answered 200 and the card was not in the deck. Each of the three needs a fixture rebuilt against the shapes Ruby's own spec writes, and the leg's read of the rule's content (the *help renders in the slot's popover, not in the page's visible text) has to be settled with it | the FIXTURES |
| /*search lists the cards this run just created/edited first | N5 | runCardsFirst false: the first row was the run's date card, and the leg compares against one named card | the row's own surface: the Changes link is the main menu's [[:recent|Recent Changes]], so the surface is the *recent card, and the tranche-6 record says the two /*search checks stay as they grade a different card with a different contract, and that re-scoping the leg is the FAMILY's decision, not this tranche's |
| no request returned a 5xx | other families | GET /Harness_date_mvjq10tr 500, with the run's own log line "[bunny-edge-error-page] render failed for Harness date mvjq10tr: invalid date" | the PORT: a Date card with empty content raises Date::Error (src/card/render/errors.ts:139 - Ruby's own raise, cited), and the page render's own contract says a view-dispatch raise must NOT fail the page (src/card/render/page.ts:453-458: "the assembly's main! render converts nested raises via nestQuietErrors"), but the raise escapes the prepare phase and the edge surface answers with Decko's server_error page (500). Ruby renders the quiet render-error span in production. This is a port fix, and it did not land in this tranche |
| the owner audit's 1 s suggestion budget | other families | the third keystroke answered in 1089 ms against 1000 ms | a timing leg under load, not a capability defect: it passed at this tranche's base |
| the E11b instrument, the timing legs | other families | named by the other family's own reports | not this family's rows |

## The measured result

The run at the tip of the fixes (`node tools/edge-signed-in-exercise.mjs`,
the same local stack, the same deck copy, at `d7dcb63b`):
**285 / 292 passed, 7 failed.** The base was 273 / 292 with 19 failed, so
twelve legs moved to green.

The run record is `.runtime/edge-signed-in/tranche7-final2/report.md` with
its raw page captures beside it.

The seven that are still red, in the order the report lists them: the N5
leg, the three P5 rule-set legs, the P6 update rule leg, the 3 s timing leg
and the 5xx leg.

## The battery

`node --test "tools/edge-signed-in-exercise/test/*.test.mjs"` at the tip:
**372 tests, 370 pass, 0 fail, 2 skipped**. `node --check` on every
touched file: syntax OK.

## The remaining open defects, worked

The four legs the section above still named, in its order. One commit per
fix, each with a test pinned to the committed source, the committed capture or
the oracle, and each graded by the signed-in run.

### cap-P6 (71a770fe): the update leg reaches the Rules tab on the read leg's board path

A view is a PATH SEGMENT, not a query param. The port states the mechanism
itself at src/card/render/views.ts:2141-2147, pinning path.rb:31-38
Card::Path#base. The update leg navigated "/NAME?view=board" and opened the tab
by clicking the first anchor inside a rules tab view: neither was reachable,
because that URL renders the card's own core view, which carries no `.board`
ancestor and no rules_tab-view slot. The leg timed out after 15 s waiting for
a selector on a page that never carried one. The leg now uses the read leg's
URL and the Rules nav link.

### cap-P5 (9e990637, a9aae1e8): the visited card's own slot, by the anchor it carries

Two defects: the read and the fixtures.

THE READ. A card page renders several card slots and the FIRST is the
breadcrumb's nav-link dropdown. The graded read took it, so every leg's
setKeys read ["ALL","TYPE-basic_c"] - that slot's exact row - and the legs
graded "noRIGHTToken"/"noSELFToken" for cards whose own bytes carried those
tokens.

Neither position nor a view name is the right selector, and the second fact
only showed up in a focused run. Once a rule ANSWERS, the rule replaces the
card's structure and the card renders the RULE's slots, with no titled slot at
all: a measured page carried new-view, help-view and new_fields-view, all
carrying RIGHT-harness_cb_cereal. So the read selects the slot that NAMES the
visited card - an anchor for it, or for one of its parts - which survives that
switch and which no chrome slot ever matches.

THE FIXTURES. A *right rule is keyed on the card's RIGHT SIDE, so the card
that renders it is a compound one whose right side is the set card; the leg
visited the set card itself, a one-part card carrying no RIGHT token at all.
Ruby visits "/Test+cereal" for exactly this reason. And a *type plus right
rule's left part is a CARD of the left type, not a bare type word: the fixture
wrote the literal "Basic", a create normalizes the left part to the DECK's
spelling of that card, and the post-create lookup for the fixture's spelling
found nothing - the run captured the created page titled
"basic+Harness_CB_Cereal_TPR+..." where the fixture had written "Basic+...".

Measured: the *right and Self legs are green. The Self fixture was already
right; only its read was wrong.

### The 5xx (9da41c45, f6804f80): the serving posture, and the last rescue scope

The 5xx was a serving-posture defect, not a raise defect, and it took two
commits because the first was necessary and NOT sufficient - which the run
measured rather than assumed.

THE POSTURE. src/card/render/format.ts:689 declares the posture
`let raiseAllRenderingErrors = true`, and every rescue reads it. The
reference-harness adapters and vm-staging-server.mjs set it false at boot; the
EDGE never did - nothing in deploy/bunny-worker-src/ nor in the two bundlers
called it - so the deployed process ran loud. Ruby production sets it false at
boot (cardio/railtie.rb:38), so the serving entry now sets it false at module
scope, before the handler is registered. The library default stays loud, so
direct render calls keep raising exactly as now.

THE LAST SCOPE. With the posture set, the run at that tip still answered
"GET /Harness_date_... 500". Every rescue keyed on the flag goes quiet, but the
page's ROOT view dispatch is not one of them: the root view-lane catch at
format.ts:1430 is guarded by `!viewLaneRoot || allRenderingErrorsRaise()`, and
viewLaneRoot is false for every format in the tree, so that catch re-raised
whatever the posture said. The page's own main-view dispatch is now a rescue
scope, which is the contract page.ts already states for its prepare phase: a
view-dispatch raise must not fail the page. The loud posture is still checked
first, so a development build and every direct render call keep raising.

## The measured result, at the tip of this work

`node tools/edge-signed-in-exercise.mjs`, the same local stack, the same deck
copy, at `f6804f80`: **289 / 292 passed, 3 failed.** The tranche-7 record's
own measured tip was 285 / 292.

The run record is `.runtime/edge-signed-in/tranche7-final5/report.md` with its
raw page captures beside it.

The three still red:

| leg | the evidence at this tip |
|---|---|
| the 5xx leg | GREEN. "no request returned a 5xx" passes with fiveHundreds []. The boot posture and the page dispatch scope together closed it. |
| the P6 update rule | no longer throws. The seed is stored, the Rules tab is reached, the pill is clicked and the write lands (ruleWriteStatus 200, ruleContentAfter "Administrator\r\n"), but the member's WRITE verdict does not move: memberWriteBefore 200, memberWriteAfter 200, so failures ["ruleTypeNotList","memberVerdictUnchanged","memberStillAllowed"]. The read leg, same seed shape, does move (memberRead 200 -> 403). The leg's remaining gap is in the engine's update-rule resolution, not in the leg's path. |
| the P5 *type plus right leg | the rule is stored ("<p>your favorite</p>") and the visited cards now carry TYPE_PLUS_RIGHT-rich_text-harness_cb_cereal_tpr, and the *all default is gone, but "your favorite" is not on the page: failures ["ruleContentNotRendered"]. The page text now rides in the evidence and says what renders instead - the *all default's help slot ("This default guide will appear in the full editor view of any card..."), the same text the *right leg showed before its own rule answered. So this rule does not answer for these cards. |

Out of scope by the record's own words, untouched here: the N5 /*search leg
(the record names re-scoping it the FAMILY's decision), and the 3 s timing
leg and the 1 s owner-audit budget (other families' rows).

## The battery

`node --test` over the touched harness tests (p6-board-path, p6-seed-rule,
p5-fixture, p5-visited-card-and-own-slot, rule-set-legs): **30 tests, 30
pass, 0 fail.**

`npx vitest run` over the posture and rescue-scope pins (the new
page-main-view-dispatch and bunny-edge-serving pins, plus the three
pre-existing date and delegation pins): **23 tests, 23 pass, 0 fail.**

`node --check` on every touched file: syntax OK. `npx tsc --noEmit`: no new
type errors; the 3 reported are pre-existing and all in
tests/card/actions/write-path-races.test.ts, which this work does not touch.

## A note on the run itself

One run in this stretch aborted after group 8 and recorded 80 of 292 checks.
The cause was a Playwright navigation race at
tools/edge-signed-in-exercise/checks-permissions.mjs:20 - "Navigation to
/\*signin is interrupted by another navigation" - thrown outside that module's
own attempt wrapper, which the harness's single outer catch turns into
'unexpected journey exception' and which ends the whole journey. The module is
not one this tranche names and is not touched here; it passed on every other
run in this stretch. It is named, not fixed.
