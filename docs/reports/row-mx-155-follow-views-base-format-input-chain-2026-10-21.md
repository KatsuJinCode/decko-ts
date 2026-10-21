# Row mx-155 - the W4 follow views: the base-format input view chained, the two content views still open

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Instrument-coverage-matrix action 154 (ACT-155), capability id W4: "Followers
list and 'all followed cards' view".

This is tranche 2 of the family. Tranche 1 (branch
`port/matrix-journey-tranche-20261020`, tip `eaf5149b`) fixed the set
membership predicate the pin named and left two causes named:
`docs/reports/matrix-journey-row-mx-155-follower-set-membership-2026-10-20.md`.

## What this tranche measured, before it changed anything

A fresh boot of the local engine over the committed fixture
(`reference-harness/fixtures/synthetic-v1`, the ACT-155 probe's own fixture),
signed in as the fixture's two actors, five surfaces read
(`tmp/diagnose-follow-views.mjs`, the run's own output under
`.runtime/mx-155-follow-views-diagnose/`):

| surface | before | bytes |
|---|---|---|
| `/<card>+followers` (admin) | 200 | 24267 |
| `/<Admin>+*follow/content` (admin) | 200 | 25722 |
| `/<Member>+*follow/content` (member) | 403 | 18854 |
| `/<Member>+follow` (member) | **500** | 5989 |
| `/<Admin>+follow` (admin) | **500** | 5987 |

The engine log names the 500's cause and its frames
(`.runtime/mx-155-follow-views-diagnose/server.log:21-48`):

    [vm-staging] render 500 on Mira Member+follow: input: Mira Member+follow is
    not a pointer/list-family card; the base-format view (card-mod-format/
    card-mod-edit) is not ported
    Error: input: Mira Member+follow is not a pointer/list-family card; ...
        at baseViewNotPorted (.../card-mod-list.js:109:12)
        at inputView (.../card-mod-list.js:941:15)
        at RenderFormat.renderView (.../format.js:1163:24)
        at contentField (.../card-mod-edit.js:847:34)
        at contentFormgroupView / editSlot / contentFormgroupsView /
           newFieldsView / createFormWithAlertGuide

## The defect, and what Ruby does

Two Ruby files, and the chain between them.

1. `card-mod-list-0.20.0/set/abstract/01_list/html_views.rb:32-34`

       view :input do
         _render_hidden_content_field + super()
       end

2. `card-mod-edit-0.20.0/set/all/editor.rb:32-44`

       view :input, unknown: true, cache: :never do
         try(input_method(input_type)) ||
           input_defined_by_card ||
           send(input_method(default_input_type))
       end
       def default_input_type; :rich_text; end
       def rich_text_input
         send "#{Cardio.config.rich_text_editor || :text_area}_editor_input"
       end

`super()` (view_definition.rb:18-21, set/format.rb:146-150) re-dispatches the
SAME view on the next set module in the MRO: the editor module. The editor
picks the editor by the card's input type and falls back to the rich text
editor (the tinymce textarea).

Why a card that is not a list card reaches the list family's view at all: the
type-plus-right user follow set
(`card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb`) includes
`Abstract::List`, so a User card's "+follow" part is in the list family. The
card's own type is not List or Pointer, which is exactly what the port's
`listFamilyCard()` check reads.

WHY THE CARD IS NOT LIST-TYPED (measured, not assumed). The card's type comes
from the assignment walk (`card-1.110.0 mod/core/set/all/type.rb:58-76`), and
the walk's anchor read is the anchor part's CODENAME
(`lib/card/set/pattern/base.rb:39-43`), and `Card::Name#codename` is
`Codename[card_id]` with `card_id` = `Lexicon.id self`
(`lib/card/name/name_variants.rb:33-39`). Ruby's `Lexicon.name_to_lex` for a
SIMPLE name looks the name itself up (`lib/card/lexicon.rb:112-118`) - the
card NAMED "follow" - and the deck's card is named "*follow" (its codename is
"follow"). So Ruby's codename read for the name "follow" is NIL, the Right
pattern's `anchor_codenames` breaks, the walk builds no module key, and
"X+follow" is NOT List-typed. The port answers the same way, and the pin
states it: `tests/card/follow/act155-w4-type-assignment-codename-read.test.ts`
- the walk answers `["list"]` for "X+\*follow" and `[]` for "X+follow".

So Ruby renders that card's editor through the chain (the hidden content
field plus the rich text editor), and the port raised "the base-format view
is not ported" and answered 500.

## The change

`src/card/mod-loader/mods/card-mod-list.ts`, the list family's `:input` view
(`inputView`): the not-a-list-card arm now walks Ruby's chain instead of
raising.

    } else {
      // super(): the editor module's :input view (the next set module's same
      // view). An EMPTY answer means the chain carries no editor module -
      // the card-mod-list deck alone, with no card-mod-edit in the load - and
      // then the base editor really is absent, so the port still fails loudly
      const superd = superView(ctx, LIST_INPUT_MODULE, "input");
      if (superd === undefined || superd === null || superd === "") {
        throw baseViewNotPorted("input", ctx.fmt);
      }
      editor = String(superd);
    }

The walk rides `superView` (src/card/mod-loader/mod-view-helpers.ts:136) -
the same MRO walker card-mod-account's signup `:new` view uses for its own
`super()`. `LIST_INPUT_MODULE` is
`setModuleShortname("abstract/01_list/html_views")` = "Abstract::List::HtmlViews"
(the registrar strips the NN_ prefixes and camelizes each segment).

The empty-answer guard keeps the port's existing loud failure for the deck
that carries the list mod ALONE: the committed pin
`tests/card/mod-loader/card-mod-list.test.ts` ("non-family cards fail loudly
for the unported base-format views") asserts that a single-mod load raises
for a non-family card's `:input`, and it still does - with no editor module
in the chain there is no base editor to render, and rendering an empty
hidden field would be wrong bytes.

## The oracle-matched tests

- `tests/card/mod-loader/card-mod-list-base-format-input-super-chain.test.ts`
  (new): the chain. A User card's "+follow" part renders the list family's
  hidden content field AND the editor module's rich text input (the tinymce
  textarea) - the two halves of `_render_hidden_content_field + super()` -
  and the port's not-ported message is gone. The control: a LIST card's
  `:input` view is unchanged (the pointer list editor, no tinymce textarea).
- `tests/card/follow/act155-w4-type-assignment-codename-read.test.ts` (new):
  the codename read the walk depends on - `DeckoName.parse("*follow").codename`
  is "follow", `DeckoName.parse("follow").codename` is undefined, the lexicon
  has no id for "follow", and the walk answers ["list"] for "X+\*follow" and
  [] for "X+follow". This is the read that makes the card's editor the rich
  text editor rather than a list editor.

## The surface, after

The same five surfaces, same fixture, same actors, after the change
(`.runtime/mx-155-follow-views-diagnose-after2/`):

| surface | before | after |
|---|---|---|
| `/<Member>+follow` | 500 | **200** (23658 bytes) |
| `/<Admin>+follow` | 500 | **200** (24278 bytes) |

and the rendered form carries both halves of the chain:

    <input class="d0-card-content form-control" autocomplete="off" type="hidden" ...>
    <textarea rows="3" class="tinymce-textarea d0-card-content form-control"
              id="mira_member-follow-2" name="card[content]">

(the hidden field is the list family's `_render_hidden_content_field`; the
textarea is the editor module's `rich_text_input`).

## What is still open, with the cause named

The matrix's own triage note for ACT-155 (brandonDojoTech
docs/registry/instrument-coverage-matrix.json, ACT-155, the 2026-10-19 entry)
named three gaps: "the list-family base-format view, the followers view and
the follow-overview assembly are unported". This tranche closes the first
one. The other two are unchanged, and the measurements say what each one is:

1. **THE FOLLOWERS VIEW.** `/<card>+followers` answers 200 and renders the
   card's title and nothing else: no follower names. The port registers the
   followers `:core` view as a passthrough to the BASE core
   (`src/card/mod-loader/mods/card-mod-follow.ts`, the `right/followers`
   registration: "the literal super() passthrough"). Ruby does not render the
   base core there: `card-mod-follow-0.20.0/set/right/followers.rb` includes
   `Abstract::List`, so its `:core` is the LIST core
   (`html_views.rb:5-13 standard_pointer_core`), and its content is
   `left ? item_names.to_pointer_content : ""` with
   `item_names` = `left.follow_set_card.prototype.follower_names`
   (`set/all/follow/follower_ids.rb:74-78 follower_names`). The port's
   followers view therefore has to render the follower NAMES, which means
   porting the follower resolution for the read surface (the port's
   follower resolver computes the other direction, for notifications).
   NAMED, NOT CLOSED.

2. **THE FOLLOW-OVERVIEW ASSEMBLY.** `/<Admin>+*follow/content` answers 200
   and renders the follow editor, but not the list of followed cards, and
   `/<Member>+*follow/content` answers 403 for the member reading her OWN
   set. The Ruby shape is `Card::Rule.preference_names user.name, "follow"`
   (`card-1.110.0 lib/card/rule.rb:39-45`), which the port already ports for
   the write path (`src/card/follow/follow-rule-walk.ts`
   `preferenceNamesForUser`); the read surface does not use it yet, and the
   member's own set answering 403 is a permission-arm question of its own.
   NAMED, NOT CLOSED.

3. **THE MEMBER'S FOLLOW PREFERENCE.** The ACT-155 probe leg's
   `storedMember` read expects the member's follow option to be MATERIALIZED
   on the card's own "+*self" set. The fixture's deck-wide rule is not
   there: the fixture's rule for the member sits on the "*all" set
   (`reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3`, rows 909 and
   910: the rule card "*all+Mira Member" and its "+*follow" option "*always"),
   and Ruby's resolution of that rule to a card is by the set-pattern walk
   (`set/all/follow/follower_ids.rb:104-112 direct_follower_ids` over the
   card's set names), not by materialization on the card's own set. The
   probe's narrow read therefore cannot see Ruby's answer, and the leg's
   `storedMember` expectation does not describe the oracle's storage shape.
   The probe leg is RED on that clause; this tranche did not change the
   probe, and the leg stays RED. NAMED, NOT CLOSED.

The row's DONE condition also waits on the guarded live deploy (the row's own
text: "DONE when the files-area pair is armed (operator), the guarded deploy
reaches live, and a re-run of the followers-probe serves the resolved set").
Nothing in this tranche deploys and nothing in it touches live.

## The battery

- `npx vitest run tests/card/mod-loader/ tests/card/follow/ tests/card/render/`
  (the touched areas): see the receipt
  `docs/reports/receipts/row-mx-155-touched-battery-2026-10-21.json`.
- `npx tsc --noEmit -p tsconfig.json`: the three pre-existing diagnostics in
  `tests/card/actions/write-path-races.test.ts:132` and `:526` (a file this
  change does not touch; the same three are recorded as pre-existing at this
  base in the tranche-1 report). No new diagnostic.
- The local signed-in exercise at this base (before the change, for the
  record): 240 / 242 passed, the two failures named in
  `docs/reports/receipts/row-mx-155-base-run-2026-10-21.json`.
