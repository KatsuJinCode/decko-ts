# [Family] tranche 6, 2026-10-22: the open defect fixes

The base is the [Family] family's newest landed tip,
`origin/port/capability-inventory-afix-20261021` at `cd283f47` (the afix legs
record: the A4 and M1 legs ran green on their own contracts, 8/8 and 5/5). The
branch is `port/capability-tranche6-20261022`.

## What the wave plan's shorthand said, and what the record said

The wave plan named A4 and M1. The record names them REPAIRED: the afix legs
record (`docs/runs/edge-signed-in-exercise-afix-legs-2026-10-21.md`) carries
the two fixes and their run receipts, and the afix registry moves both rows to
covered. The work here is what the record still names as open.

## The base run: 26 failures

`node tools/edge-signed-in-exercise.mjs` at `cd283f47`, the local stack, the
21,676-card local deck copy, the loopback database and storage, the owned
in-process mail capture, headless Chromium.

**263 / 289 passed, 26 failed, 0 skipped.** The run record is
`.runtime/edge-signed-in/tranche6-base/report.md` with its raw page captures
beside it.

| leg | row | what the evidence said |
|---|---|---|
| the search page echoes the term it searched | N6 | failures ["noKeywordEcho"], echo null, on a page that carried the echo |
| creating a card whose name already exists shows a visible validation error | C8 | failures ["alertClass","heading","message"], heading null, message null, alertClasses null |
| the board History tab lists the run's change as a pill | E21 | failures ["historyTabSlot","expectedAct"], pills [] |
| the four JSON CQL operator legs | N2 | failures ["wrongResultSet"] on pages whose result rows were right |
| the result-specific create link's destination | C6 | failures ["destinationNameField"], the name field carried the folded name |
| the layout's main nest, the files legs, the rule-set legs, the rename legs, the follow-stop legs, the P6 update rule | N9, F1, F3, P5, P6, R1, W2 | named below |
| the E11b instrument, the two timing legs, the 5xx leg, the asset audit | other families | not this family's rows |

## The four fixes

Each one is a commit of its own, each with a test pinned to the committed
Ruby source or capture, and each is graded by the signed-in run.

### cap-N6 (accf859e): the keyword echo, graded by its class names

The check reads the page through the browser, so what it reads is the DOM
serialization, and a DOM serializer writes attribute values in double quotes.
The predicate bound the single-quoted shape, which is the shape the PORT's own
bytes carry (Haml's attribute quoting) and which a page-content read never
returns. The echo was in the captured page the whole time. The wrapper and
the span are now found by the class names they carry, with either quote
character, and the class names are read out of the pinned vendored haml.

### cap-C8 (8cb03f05): the visible validation error, off the error's own alert

Three things were read from the wrong place, and all three are the check's,
not the port's. The region was the FIRST div[role="alert"] on the page, and
a signed-in Decko page carries the deck's own guide block above the error. The
visibility reading was taken after the visit to /Home, so the browser read the
alert off a page that never carried the error. And the message was compared
against Ruby's escaped bytes while the browser's DOM carries the decoded
text. The region is now the alert that carries the error's own markers, both
readings happen before the navigation, and the message is accepted in either
form. The port's bytes are Ruby's: the captured page of the failing run
carries the whole answer.

### cap-N2 (4e697de8): the result names, read from the result ROWS

The names were read from every card slot on the PAGE, so the answer carried
the page's furniture: the navbar's account menu, the search card itself, the
footer and the "New Card" link. The captured and-leg page carries exactly ONE
result row, the member. The names come from the result rows now, the wrapper
Ruby renders per result.

### cap-E21 (2336d587): the history tab's pills, off the SLOT

The predicate scopes to the slot (the div whose class carries
"history_tab-view") and then reads the ul.board-pills inside it, so the
Related tab's identical pill classes cannot answer for it. The caller handed
it the slot's INNER html, which does not carry the slot, so the scope found
nothing on a board whose history tab rendered the pill exactly as Ruby does.

## The measured result

The run at the tip of the fixes: **270 / 292 passed, 22 failed**.

The tip run carries three MORE checks than the base run, and all three are
green: the W6 leg timed out at the base (a 20 s waitForFunction) and that
abort took the rest of the content-flows module with it, so the follower's own
mail legs ("the follower mail carries the Unfollow link the template writes",
"the unfollow link names the follower's live follow rule and carries the never
option", "following the unfollow link stops the follow rule, the way Ruby's
stop-follow does") never ran there.

Green now, red at the base: the N6 keyword echo, the C8 visible validation
error, the N2 and-leg, the W6 unfollow-in-mail leg, and the final asset
audit. One leg went the other way: the owner audit's 1 s suggestion budget
(the third keystroke answered in 1089 ms against 1000 ms, the first two in
714 ms and 967 ms) - a timing leg under load, not a capability defect; it
passed at the base.

## What is still open, named

| leg | row | the evidence | where the cause sits |
|---|---|---|---|
| the result-specific create link's destination | C6 | the name field carried "zz no such card harness mvj8s7ka" where the address spells "zz_no_such_card_harness_mvj8s7ka" | the PORT folds the URL's underscores into spaces at the path decode (`src/server/worker-shared-surface.ts` decodeName, `src/card/render/page.ts` the absent-card seat), so the create form for an unknown address carries the folded name; the KEY resolution already treats both spellings as one key, so the fold is not needed for the lookup |
| the layout's main nest | N9 | the card's own body is not between the layout's chunks | the port's layout render |
| the image-change leg | F3 | altNotCardName, sizeNotInSource, wrongExtension | the port's image core view |
| the /files download link leg | F1 | noAttachmentCardName, noChosenFileChip | the port's file type view |
| the three rule-set legs and the self-structure leg | P5 | noRIGHTToken, noSELFToken, and the typed fixture refused | the port's rule-set rendering |
| the rename form and the referer id remap | R1 | noRenameForm, refereeIdNotRemapped | the port's rename form and the reference remap |
| the follow stop link and the stored preference | W2 | the stop link's four bytes and the stored rule | the port's follow-family views |
| the administrator's update rule | P6 | the seed update rule was refused 422 | the port's rule write path |
| the three remaining CQL operator legs | N2 | wrongResultSet | the CHECK's expectation model: the right leg expects the cards NAMED the member where the operator returns the cards whose right side IS the member; the not leg expects the whole type where the page carries the first 20 of it; the created_by leg expects the creator's cards with the junction rows' NULL names where the page carries their composed names |
| /*search lists the cards this run just created/edited first | N5 | runCardsFirst false: the first row was the date card, not the card edited last | the leg asserts a claim about the /*search surface that the row's OWN finding assigns to the *recent card: "the Changes link is the main menu's [[:recent|Recent Changes]] ..., so the surface is the *recent card - not /*search, which is what the two checks above read". The two legs that do measure the recent surface pass ("the Changes page orders its acts newest first by act id" and "the Changes page carries at least two acts"), and the tranche-4 finding states that the two /*search checks stay as they grade a different card with a different contract. The leg is named here, not re-scoped: the registry's declared names are the family's contract, and re-scoping them is a decision for the family, not for this tranche |
| the owner audit's 1 s suggestion budget | other families | the third keystroke answered in 1089 ms against the 1000 ms budget, while the first two answered in 714 ms and 967 ms | a timing leg under load, not a capability defect: it passed at the base run |
| the E11b instrument, the timing legs, the 5xx leg | other families | named by the other family's own reports | not this family's rows |
