# mx-188: affordance visibility per role, which controls render for which actor

The roster row `mx-188-cross-cutting-affordance-visib` (family [Family])
reads "affordance visibility per role: which controls render for which
actor", verdict PASS, bucket DONE. The row's own evidence basis is the
registry's re-grade: the recorded fail came from an instrument gap (the
2026-10-16 crawl's P7 denial-as-create-form leg, driven with no
instrument; the action's two-actor leg and type-control leg were already
green), the corrected instrument exists at the tip and its run passes
verbatim, and the triage docs/reports/matrix-fails-triage-1-2026-10-19.md
and docs/reports/matrix-fails-triage-3-2026-10-19.md name that
classification. This receipt is the family's own adjudication of the
row: the instruments, the Ruby oracle that pins the type control's own
bytes, and fresh measurements at this tip.

## What the row is

What an actor can do must decide what an actor sees. The row is the check
that role-gated controls render per role: on the create form, the type
control offers the types this actor may create, and the structure types
(admin-only) never leak into a member's options.

## The instruments

The ranks91-100 window probe
(reference-harness/browser/probe-pageonly-ranks91-100.mjs) drives one leg
(its ACT-188 section, lines 806-860): the create form's type control is
read for an administrator and for a member, and the leg grades that the
structure types (Cardtype, Layout, Skin, CSS, SCSS, JavaScript,
CoffeeScript) appear for the administrator, never for the member, that
the shared types both must see are present for both, and that both
visits answered 200 with the member actually signed in.

The batch5 cross-cutting probe drives the same leg independently (its
ACT-188 section, lines 398-452).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "affordance
visibility per role: which controls render for which actor", id ACT-188,
check_ids []) records these instrument entries:

    - whole-harness, two-actor, native-local-bundle: pass
    - none (the 2026-10-16 instrument-gap marker over the P7 leg,
      retracted by the triage and replaced in place by the named
      instruments that now exist and pass)
    - whole-harness, headless-dom, ts-engine-local-bundle: pass (two
      entries, the pageonly-batch5 and the ranks91-100 re-grades)

## The oracle

THE TYPE CONTROL IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The committed capture of a real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:162:new_type_formgroup@set/all/new.rb`: a
`form-group type-formgroup` with the label "Type" and a select named
`card[type]` whose class is `type-field _live-type-field slotter
form-control`, whose href is the card's own new_fields view with
data-remote, and whose options are grouped optgroups (Text, Data, Upload,
Custom, Organize, Template). The port renders the same control:
src/card/mod-loader/mods/card-mod-edit.ts:2015-2041 (typeFormgroup: the
same class, label, editor wrap and assign hidden) and :2615-2618
(newTypeFormgroupView: the href /<mark>/new_fields, the class
"type-field _live-type-field slotter", with the bootstrap form-control
appended, named in its own header comment as the caller's class string
plus the field helper).

THE ROLE GATE IS RUBY'S OWN RULE TOO. Ruby's new.rb:150-152
new_type_permitted? asks the create verdict on a virtual new card of the
candidate type; the port carries the same rule at
src/card/mod-loader/mods/card-mod-edit.ts:2336-2350 (newTypePermitted,
over the engine's precomputed per-cardtype create verdicts, the same
verdict Auth.createable_types names), and the measured lists are the
rule's output per role.

WHAT IS ORACLE-MATCHED AND WHICH PART IS NOT, stated plainly. The
control's structure (the formgroup class, the label, the select name, the
class string, the live-type-field href and the optgroup grouping) is
Ruby's own, captured byte-wise and matched. The exact option LISTS per
role are not claimed as capture-matched: the capture holds the control as
one actor saw it, and the per-role split is Ruby's own create-permission
rule applied by the port, measured here per role by the instruments. The
leg's own predicate (structure types admin-only, shared types for both,
both visits 200) is the probes' own named instrument.

## The measurement at this tip

    node reference-harness/browser/probe-pageonly-ranks91-100.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-ranks91-100-final

    source 9a2ed6e3 (the lane's own tip at run time), the source files
    clean, the engine pure-tip (distSha256 07ff7a50...)
    ACT-188 the create-form type control renders per role (structure types
      admin-only): GREEN {"adminTypeCount":33,"memberTypeCount":25,
      "structureTypesRequiredForAdmin":["Cardtype","Layout","Skin","CSS",
      "SCSS","JavaScript","CoffeeScript"],"leakedIntoMember":[],
      "adminSharedRichText":true,"memberSharedRichText":true,
      "adminVisitStatus":200,"memberVisitStatus":200,
      "memberSignedIn":true}
    legs 22, failures 0

    node reference-harness/browser/probe-pageonly-batch5-ordering-case-\
      paging-roles-empty-error.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-batch5

    source 71d4f686 (the family tip this lane starts from), the source
    files clean, distSha256 708a5f3d...
    ACT-188 the create-form type control renders per role (structure types
      admin-only): GREEN (same shape: 33 types for the administrator, 25
      for the member, all seven structure types admin-only, none leaked,
      the shared rich text present for both)
    legs 11, failures 0

The administrator saw the seven structure types, the member saw none of
them, and the shared types reached both actors, on both instruments, at
both sources.

## What this receipt does NOT claim

- The row's port side is what the instruments grade, and it is green. This
  receipt does not claim anything about a live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The per-role option lists are measured, not capture-matched; the capture
  the receipt cites pins the control's structure, not the two lists.
