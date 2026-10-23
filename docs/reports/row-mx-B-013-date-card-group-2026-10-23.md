# mx-B-013: content field is a date picker showing the stored date

The roster row `mx-B-013-3-edit-a-date-card` (family [Family]) reads "content
field is a date picker showing the stored date", verdict PASS, bucket DONE,
and the registry's ledger records every instrument entry for B-013 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

Opening the deck's own date card's edit modal, the content field is an
`input[type=date]` (a date picker, not a plain text field), and the value it
holds is the card's stored date: the database's own content for the card,
not merely some non-empty string.

## The instrument

The harness's "3. edit a Date card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:21-35), the
record "content field is a date picker showing the stored date". It reads
the content field's `type` attribute, reads the field's value, reads the
card's stored content out of the run's own database (`SELECT db_content
FROM cards WHERE key = ? AND trash = 0`, the deck's own row for
`2011_12_14`), and grades both halves: the type is "date" AND the trimmed
value equals the trimmed stored content. The check's own comment records
why: an older predicate accepted type==="text" as well, and Boolean(original)
never compared the value with the card's stored content (adversarial
blindness-review F6 item 5).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "content field is a
date picker showing the stored date", check_ids ["B-013"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own calendar input. The card-mod-date gem's
set/all/calendar.rb:9-14 `calendar_input` renders `text_field :content,
class: "date-editor", type: "date"`, and the port renders those bytes (plus
the bootstrap form-control append) at
src/card/mod-loader/mods/card-mod-edit.ts:838-843:

    <input class="date-editor form-control" type="date" value="${content}" name="${namePrefix}[content]" id="${idPrefix}_content" />

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The `type="date"`
bytes and the `date-editor form-control` classes are the port's rendering
of the gem's calendar_input, cited file-and-line from the gem tree the
port's own mod module documents
(src/card/mod-loader/mods/card-mod-date.ts:1-33, the five set files
including all/calendar). No committed capture arm in
reference-harness/fixtures/ carries a date card's edit form (the capture
deck's probe card is a RichText card, and no fixture's html carries
type="date"), so this surface is cited-from-gem-source, not
capture-matched. The value-equality half of the check is a named-instrument
fact: the stored date comes from the run's own database row (this deck
stores `2011-12-14` for the `2011_12_14` card), and the comparison is the
harness's own.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/rows-r1/report.md

    source 95bc1700, started 2026-10-23T19:14:55.935Z
    verdict: PASS
    evidence: {"type":"date","value":"2011-12-14","stored":"2011-12-14","showsStoredDate":true}

The field's type is "date" and the value it holds equals the deck's own
stored row for the card (both halves of the grade, in one record).

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The type="date" byte match rests on the gem source the port cites
  (card-mod-edit.ts:839-842), not on a committed capture arm: the fixture
  set holds no date card's edit form. Named plainly above.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
