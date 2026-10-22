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
