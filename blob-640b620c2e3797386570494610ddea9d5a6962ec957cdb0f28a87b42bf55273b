# The anchor-regression round: the junction set-anchor create refusal, named to its introducing commit, fixed, and the grade line re-measured

Branch `port/anchor-regression-20261026` (lane checkout
`C:/localProjects/decko-ts-anchor-regression-20261026`, an owned worktree of
the shared git directory created by the worktree tool), from the newest
pushed tip that carries the regression, `57bce298d6` (branch
`port/held-mx-closeout-20261026`, the previous round's receipt commit).

The base was chosen from the pushed refs, not from the previous round's word.
`git ls-remote` lists 667 refs; `git for-each-ref --contains=c29e4c3f4` over
the fetched refs gives the refs that carry the v23 candidate, and the newest
of them by committer date is `57bce298d6` (2026-10-25 21:41:34 -0700). The
two pushed refs that are newer than it (`acd0cd4cb2` on
`origin/port/matrix-round12b-20261026` and `095b3b30f5` on
`origin/port/demo-scratch-20261025`) are off that line: neither contains
`c29e4c3f4`, and neither contains the first bad commit below.

## 1. What the previous round handed over, and what it got wrong

The handover named the failing family (the junction set-anchor creates
through the serving route, the timings legs' junction create forms, plus the
M1 toolbar table offer and the N9 layout body marker) and named the
introducing commit as `db68cdfc1`, "the regfix-row22 lane's boot cascade",
saying its parent is `723f0b42` (round twelve's final commit).

**The parent is not `723f0b42`.** `git rev-parse db68cdfc1^` answers
`94d05e147` ("register row 22 (card-mod-list): the errors.add seam, both
validate bodies, and the membership arm"). The route-level bisect behind
the handover compared two commits 1257 commits apart (`git rev-list
--count 723f0b42c..57bce298d6` answers 1257) and never tested the commits
between them, so the commit it named is the first one it happened to test
after the last good tree, not the first bad one.

## 2. The refusal body, which the handover could not read

The previous round recorded the STATUS of a set-anchor create and recorded
that the engine's own `createCard` was clean, so the refusal was route
layer. It could not read the body, because its out-of-process attempts
could not get a session the serving route honours.

This lane booted the same local stack the signed-in exercise boots (the same
deck copy, the same bundle, the same render configuration), signed the
seeded administrator in, and posted the same shapes through the same route
(`POST /card/create`, form-encoded): `tools/probe-set-anchor-create.mjs`,
new. The refusal body is

    Error (validation-failed)
    Problems with <name>
    TYPE: <name> can't be changed because <name> is structured as a Set

which is the `validate_type` STRUCTURE lock
(card-1.110.0 `mod/core/set/all/type.rb:26-28`), not a card-storage
refusal and not a permission refusal.

## 3. The attribution: the first bad commit is 57e900ccc

Measured with the probe above, on the same deck, the same bundle and the
same route, one probe worktree per commit:

| commit | what it is | the set-anchor create |
|---|---|---|
| `723f0b42` | round twelve's final commit, the last graded-good tree | **303**, the row stores |
| `57e900ccc` | "Merge remote-tracking branch 'origin/port/matrix-round12-20261024' into deploy/full-candidate-20261028" (2026-10-24 19:01:35 -0700) | **422**, "structured as a Set" |
| `57bce298d6` | this lane's base | **422**, "structured as a Set" |

`57e900ccc` is the first commit on the main line that carries the
`validate_type` structure lock: the body was written by `4e9ce6e80` ("Port
:validate_api_key and :validate_type bodies", 2026-10-19) and reached the
main line with that merge. `git rev-list --ancestry-path --merges
723f0b42c..57bce298d6`, walked in order, answers `57e900ccc` as the first
merge that has `4e9ce6e80` among its ancestors.

**The boot cascade is not the cause.** `db68cdfc1` (the regfix-row22 lane's
boot cascade, the card-mod `ensure_installed` port) is three commits later
than the commit that broke the create, and its own subject (the mod asset
input cards Ruby's boot creates) has no bearing on a set-anchor create's
type.

## 4. The mechanism

The lock's Ruby body is

    if structure&.assigns_type? && type_id != structure.type_id

Ruby compares the card's OWN type with the type its `*structure` rule
assigns. On a create, Ruby's type IS the type the name assigns:
`ensure_type_id` (`type.rb:58-66`) derives it from the name
(`type_id_from_code || type_id_from_template`), and the new-card template of
a junction set anchor is the very `*structure` rule that assigns it, so
Ruby's comparison is type against type and passes. A create that names a
type the name does not assign is refused by Ruby, which is a different
answer, and the recorded create does not ask for one: the recorded create
carries the name's own type.

The port compared the type the REQUEST asked for with the structure rule's
type, so every junction set-anchor create that carried an explicit type was
refused at 422. The shapes the exercise sends are exactly those: the C20 set
seed (`<card>+*right`, type List) and the P5 three-segment set
(`<Type>+<name>+*type_plus_right`, type Phrase). Neither row stored, so the
C20 junction row could not exist, so the family fell.

The fix (src/card/mod-loader/mods/core-mod.ts, `validateTypeEvent`): the
structure lock guards a CHANGE of a type, so it does not run on a create. The
update arm is unchanged: a structured card whose type is changed to another
type is still refused with the same message (the port's own test, and the
recorded oracle capture `fixtures/captured/validate-type-ruby-oracle.json`).

## 5. Measured after the fix

The probe, same deck and route (`tools/probe-set-anchor-create.mjs`):

| shape | before | after |
|---|---|---|
| `<name>+*right`, type List | 422 | **303**, row stored |
| `<name>+*right`, type RichText | 422 | **303**, row stored |
| `<name>+*right`, no type | 303 | 303, row stored as Set (the type the name assigns) |
| `<name>+*right`, type Set | 303 | 303, row stored as Set |
| `<name>+*self`, type List | 422 | **303**, row stored |
| `<name>+*self`, no type | 303 | 303, row stored as Set |
| `<Type>+<name>+*type_plus_right`, type List | 422 | **303** |
| `<Type>+<name>+*type_plus_right`, type Phrase | 422 | **303** |
| `<name>+plain`, type List (the control) | 303 | 303 |
| a simple name, type List | 303 | 303 |

The module runs:

- `node tools/edge-signed-in-exercise.mjs --only role-plus-right` at this
  lane's tip: **15 / 15 checks passed**, including "C20 the stored row is
  the junction joining the card's +*right set to the member" and "C20
  submitting it stores a row under the requested +*right name".
- `node tools/edge-signed-in-exercise.mjs --only caps-legs` at this lane's
  tip: **24 / 26**, with the M1 toolbar leg, the P5 `*right Set` leg and the
  P5 `*self Set` leg green. At the base tip the same module reads **23 / 26**
  with M1 red as well: the same checks fail before and after this lane's
  work, so nothing here regressed.

The harness's fixture lookup was repaired in the same round
(tools/edge-signed-in-exercise/lib/typed-fixture.mjs): it is raw SQL over the
cards table's name column, and the deck's own card names carry spaces where
the engine's name space carries underscores (the deck's "*type plus right"
pattern card against the check's "*type_plus_right"), so the lookup missed
rows that the engine had stored. The lookup now also tries the deck's name
with its spaces underscored, and the P5 `*type_plus_right` leg reads the
rule card it created instead of reporting that the rule could not be
created.

## 6. The whole-run grade at this lane's tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/anchor-regression/whole-family-final/report.md

**321 / 324 checks passed**, 3 failed, 0 skipped by write mode. The run
recorded its own source commit as `33b4ec3ea` ("The anchor-regression
receipt"), which is this branch's code tip: the only commit after it is this
receipt's own text, so the measured tree's code is the branch tip's code.
The capability coverage reads 93 covered, 1 partial, 0 not covered, 1 out
of scope (of 96).

The baseline does not hold in full: the previous round read 319 / 324 at
`57bce298d6`, and this branch reads 321 / 324. The two checks the create
refusal took with it are green (C20, the P5 `*right Set` leg), the M1 toolbar
leg is green (section 7), and the three that remain are the residual below.

## 7. The exact residual

Three checks fail at this lane's tip, and each of them fails the SAME WAY at
the base tip (measured: the caps-legs module reads 23 / 26 at `57bce298d6`
with M1 red as well, and the whole run reads 319 / 324 there against 321 /
324 here). None of them is a regression from the create refusal this lane
fixed; each is named here with its measured mechanism.

1. **N9 the applied layout renders header, body, and footer around the User
   card.** The body write answers 303 and the card's stored row carries the
   body (`bodyStored: true`), the layout's header and footer render around
   the card's main slot, and the main slot itself renders the card's
   content view as an EMPTY paragraph (`<p></p>` in the captured page), so
   the body marker never appears in the page. The port does not render a
   cardtype card's stored body in its content view. The mechanism behind
   that is not established in this round.

2. **P5 the `*type_plus_right` set leg.** The set card and the rule card
   are created and stored (the harness's own lookup now finds them, after
   the lookup repair in section 5), but the member's page renders without
   the rule's header, and the negative control renders without it too: the
   port does not apply a `*type_plus_right` structure rule to the member's
   render. The two sibling legs (`*right` and `*self`) are green.

3. **The server-time budget leg** ("no signed-in page exceeded 3 s of
   server time"). The slow pages are the create forms for compound names
   and the compound edit pages. The previous round's own request ledger
   (the whole-run record it left at
   `decko-ts-held-mx-20261026/.runtime/held-mx-closeout-20261026/final/report.md.json`)
   shows the shape: `/new/Pointer?card[name]=...` 13.9 s with 4.4 s of db
   work over 594 statements, `/new/Pointer?card[name]=<card>+<role>` 11.9 s
   with 3.3 s over 866 statements, `/<card>+<role>/edit` 9.5 s with 3.4 s
   over 511 statements, `/new/Search?card[name]=...+*right+*content+options`
   6.6 s with 4.2 s over 297 statements. The same shape measures 2.1 s of
   wall clock on this lane's probe over the same deck copy. The cause of
   the statement count on those pages is not established in this round.

The M1 toolbar leg is GREEN at this lane's tip, and its red was an
instrument defect rather than a product gap: the leg scanned the editor for
elements with a title or an aria-label, and TinyMCE's menu entries carry
their names as TEXT (the captured page for the failing leg carries the
menubar with its Table entry in the markup). The leg now reads the menu
entries' text and records the entries it saw.

## 8. What this round does NOT claim

- **The boot cascade is exonerated, not repaired.** The lane's work is the
  `validate_type` structure lock's create arm; the boot cascade (the mod
  asset input cards) was never the cause of the set-anchor refusal.
- **No live deployment.** No live request was made by this lane, and nothing
  deploys. Every measurement is the local stack over a copy of the source
  deck.
- **The M1, N9 and P5 rendering gaps are not closed.** They fail identically
  at the base tip, they are not regressions from this lane's cause, and
  their mechanisms are named in section 7 rather than fixed here.
