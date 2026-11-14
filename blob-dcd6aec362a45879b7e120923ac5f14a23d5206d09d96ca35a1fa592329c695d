# mx-B-061: a member's delete attempt is refused with a clear message, not a form

The roster row `mx-B-061-8-ordinary-non-admin-account-p` (surface "8.
ordinary (non-admin) account permissions") reads "a member's delete
attempt is refused with a clear message, not a form", verdict PASS,
bucket DONE. The registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-061, check_ids ["B-061"]) records the live-acceptance-lane
entry pass (the live run of 2026-10-16T14:01:03Z, 87 checks on the live
build) and the whole-harness entry pass. This receipt is the family's
own adjudication of the row at this tip, where the whole exercise's
named check for it exists and is graded.

## What the row is

An ordinary signed-in member issues the delete request (DELETE
/delete/<target>) for a card she may not delete. The engine refuses
with 403, the refusal carries a real message on an error surface (not
a form asking her to retry), and nothing is stored.

## The instrument

"a member's delete attempt is refused with a clear message, not a
form" (tools/edge-signed-in-exercise/lib/member-delete.mjs:19, wired
into the whole exercise at tools/edge-signed-in-exercise.mjs:915 and
:1353): inside the verified member session (member-delete.mjs:9-12,
the sign-in and the session-to-account binding of
lib/session-actor.mjs:6-17), the journey's browser issues
`fetch(origin + '/delete/' + target, {method: 'DELETE', credentials:
'include', redirect: 'manual'})` (member-delete.mjs:14-17), strips the
response body's tags (:18), and records PASS only when the status is
403 AND the shown text matches
/sorry|permission|not allowed|denied|may not|sign in/i (:19). The raw
response bytes ride the run's evidence capture (:19, check
"member-delete-denial"), so a reader can read the refusal the engine
actually showed.

## The oracle

RUBY'S OWN DELETE PERMISSION MACHINERY. Ruby's delete verb is
decko-0.20.0/lib/card_controller/rest.rb:18-20 (`def delete; handle {
card.delete! } end`). `card.delete!` is
card-1.110.0/mod/core/set/all/trash.rb:17-21: `add_to_trash {
update! }`, a delete is an update-class save, so the validate-stage
permission event judges it:
card-mod-permissions-0.20.0/set/all/permissions.rb:22-25 (`event
:check_permissions, :validate` calling `ok?
action_for_permission_check`, with :197-199 naming the card's own
action), :37-41 (`ok?` dispatching to `ok_to_delete?`), :155-157
(`ok_to_delete?` is `permit :delete`), :100-103 (`permitted?`:
`Auth.always_ok?` for an administrator, else `Auth.as_card.among?
who_can(action)`, with `who_can` at :47-49 reading the `*delete`
rule's item cards). The refusal is `deny_because you_cant("delete
<name>")` (:117), and `track_permission_errors` (:201-207) adds it as
`errors.add :permission_denied`, whose key `Card::Error::KEY_MAP`
(card-1.110.0/lib/card/error.rb:128) routes to
`Card::Error::PermissionDenied` (:103), the error class the controller
answers 403.

RUBY'S OWN REFUSAL PAGE IS CAPTURED IN THIS REPOSITORY. The committed
write-battery capture
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
step "after-signout-write" at :9550) records status 403 (:9551) with
the full HTML denial page: the `card-slot denial-view` slot,
`<h1>Sorry!</h1>`, and the not-signed-in branch's "Please sign in or
sign up to do that." links; the step's delta is zero on every recorded
table (cards, card_acts, card_actions, card_changes, card_references,
card_revisions, card_virtuals, sessions, users, delayed_jobs, all 0):
the refused write stored nothing. The signed-in branch of the same
page (card-mod-format-0.20.0/set/all/html/error.rb:191-216:
`loud_denial` renders the `h1` `t(:format_sorry)` plus
`loud_denial_message`; :210-211 answers `Auth.signed_in?` with
`t(:format_need_permission_task)`, config/locales/en.yml:10 "You need
permission %{task}." with :20 `format_to_do_that` "to do that" where
no denied task is set) is the wording the port renders for the
member's refusal.

THE PORT REFUSES THROUGH THE SAME CHAIN. The DELETE wire dispatches to
`engine.deleteCard` (src/server/write-routes.ts:2090-2097);
`deleteCardInner` runs the permission gate before any write
(src/card/actions/card-action-engine.ts:4096-4118:
`assertCanWrite(card, "delete")` at :4118, commented as
ok_to_delete?, permissions.rb:155-157); `assertCanWrite` (:5070-5103)
runs `saveTaskVerdictForCard`
(src/card/permissions/view-task-rules.ts:462), the ported ok_to_*?
algebra reading the deck's own `*delete` rule cards and the actor's
parties, deny-by-default (:4908-4915 documents the mapping and the
throw), and throws the permission-denied CardActionError, whose code
`errorStatus` maps to 403 (src/server/write-routes.ts:1063-1069,
:1067); the HTML answer's text for a signed-in denial is
`denialText`'s "Sorry! You need permission to do that."
(:1076-1080), whose own comment names card-mod-format
set/all/html/error.rb:191-216 and the en.yml strings.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the verb is refused with 403 (Ruby's captured 403
denial; the port's `errorStatus` mapping of the same error class); the
refusal is a message on an error surface, not a form (Ruby's captured
`denial-view` page with its `h1` "Sorry!"; the port's denial text on
the same page shape); and the refused write stores nothing (Ruby's
captured zero delta; the port's gate runs in front of any write).

NOT oracle-matched, and stated rather than glossed over: the committed
capture's denial is the ANONYMOUS variant of the page (its body asks
the reader to sign in or sign up), because the capture set records no
signed-in member's delete refusal; the signed-in branch's wording
("You need permission to do that.", html/error.rb:210-211 with
en.yml:10 and :20) and the port's matching text are read from the
sources, not from a captured byte arm, and the check itself grades the
class of answer (403 and the sorry/permission/denied message family),
not exact bytes. The member's identity in this run is the run deck's
own member account (the id is fixture state, not a port constant). And
no live request was made by this lane: the live-acceptance-lane
entry's pass is the registry's own record, not this lane's
measurement.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12b-20261026/rows-r4/report.md

    source 3e4791cb61d9260e9f69b0df69e5e30222747630, started
    2026-10-26T03:43:16.527Z, completed 2026-10-26T04:08:30.378Z,
    the source files clean
    verdict: PASS

The named check in this run:

    a member's delete attempt is refused with a clear message, not a form
        {"status":403,"actorId":53047,"target":"Harness_richtext_mvopplma_renamed",
         "raw":{"capture":"053-member-delete-denial",
                "htmlSha256":"0b24cfbe4079587a78d34ec15991e9e77ee9bd5d4cb1634a4e9b2471be480de5"}}

the journey's corroborating record (this receipt's sibling row):

    the card the member tried to delete is still there
        {"actorId":53047,"target":"Harness_richtext_mvopplma_renamed","unchanged":true,"status":200}

and the session witness both ride on:

    the member is signed in
        {"expectedActorId":53047,"actualActorId":53047,"signedIn":true}

The run's capability coverage binds both member-delete checks to
ledger row R5, "Member delete refused with a clear message"
(tools/edge-signed-in-exercise/capabilities.json :762-774, committed
status covered), with both named in the binding's verifiedChecks. The
run as a whole graded 251 of 253 checks passed; the two failures are
the owner-audit search-suggestion latency rows, neither of them this
row, and the round report carries the lane's four-run record behind
that number.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green.
  This receipt does not claim anything about the live deployment: no
  live request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this
  receipt; this receipt adds the family's own evidence for the row.
