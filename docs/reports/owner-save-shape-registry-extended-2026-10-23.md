# The owner's save: the shape registry, extended, one shape at a time (2026-10-23)

Lane `port/savepath-round5-20261023`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round5-20261023`. Pushed forward-only to
KatsuJinCode/decko-ts (private).

## 1. The row, and what it was

| Row | Population | Disposition |
|---|---|---|
| ROW-2 | the read shapes no declaration can answer: the type-codename read, the two codename-triple JOINs, the trashed-junction, the unary-plus junction, the trashed-key | **TWO LANDED, THREE REFUSED, ALL FIVE NAMED** - **233 -> 227 POSTs** |

Round four's ROW-3 named these five shapes as the ones whose reads no
declaration can answer. A prefetch only answers a reader whose statement is
IDENTICAL to the one it prefetched, so a shape that is not NAMED cannot be
answered at all, and a shape that is named but whose ARGUMENTS no
declaration knows is named and still not answered.

This round names all five in the registry
(src/card/fetch/card-read-shapes.ts), makes every reader use the registry's
statement, and then measures each shape, one at a time. Every measurement
below is a run of the save's statement ladder on this lane's own tree.

## 2. The assessment, shape by shape

| shape | registry name | the lever | the measurement |
|---|---|---|---|
| the codename-triple JOIN | `CARD_CODENAME_TRIPLE_BY_ID_SQL` | the reference walk reads it and the type-codename read BACK TO BACK, for the same card. One batch carries both, and the walk's own reads of them are answered from the driver's read memo. | **REDUCTION: -4 POSTs** (233 -> 229). The walk visits four cards, and each visit's two reads were two pipeline POSTs; now each visit is one. |
| the type-codename read | `CARD_TYPE_CODENAME_BY_ID_SQL` | the same batch | **REDUCTION: the same -4 POSTs** |
| the trashed-junction | `TRASHED_CARD_BY_JUNCTION_SQL` | the card-block declaration's by-pair scope: the compound name the save touches resolves to its two sides, and the rename validation asks for the TRASHED row under that same pair. | **REDUCTION: -2 POSTs** (229 -> 227). Three of the shape's four reads are answered from the memo; the fourth binds the pair that involves the card the save CREATES, whose id no declaration can know in advance, and it still rides the wire. |
| the unary-plus junction | `CARD_ID_BY_JUNCTION_PLUS_SQL` | the card-block declaration's by-pair scope | **REFUSAL, MEASURED.** With the shape declared on that seam, the graded save's reads of the shape were UNCHANGED (all four still rode the wire) and the shape's statements went from 42 to 62: the rule walk's pairs are its own levels' findings, not the input tree's pairs. Not landed; the shape stays named. |
| the trashed-key | `TRASHED_CARD_BY_KEY_SQL` | the card-block declaration's by-key scope (the input tree's simple names' keys) | **REFUSAL, MEASURED.** With the shape in the by-key run the graded save went **229 -> 230**: the run grew past the driver's 32-statement cap and split into two round trips, and the trashed-key read still rode the wire, because the save WRITES to that card and the write dropped the memoized answer. Not landed; the shape stays named. |

**TWO OF THE FIVE REDUCTIONS AND THREE OF THE FIVE REFUSALS**, and every one
of the five is NAMED in the registry, so that a reader and any future
declaration cannot drift apart on the whitespace of a statement string.

## 3. The two that landed, and how

**THE WALKED CARD'S TWO SHAPES, DECLARED.**
(src/card/actions/list-content.ts, `declareListCardShapes`) The reference
walk asks two questions about every card it visits: is this a list card (the
card's own codename, its type's codename, its right part's codename and its
left part's type's codename), and is its type the cardtype or the search
type (the type's codename). The two reads are adjacent, and each read is its
own pipeline POST, because the engine awaits every answer before it issues
the next statement.

One batch carries both statements, and the driver's read memo hands the
answers to the readers that ask for them afterwards. The walk's own reads of
the two shapes are then memo hits: no round trip.

**THE SEAM.** The walked card's id is known at the walk and nowhere earlier:
the walk learns the card from the card it is walking out of. That is the
first point at which the two shapes' arguments are known, and it is why this
lever is a DECLARATION at the walk's seam rather than an extension of the
card-block declaration (which only receives the save's input tree, and never
names the owner's rule cards).

**THE TRASHED JUNCTION, DECLARED.** The rename validation asks whether a
TRASHED card already carries the name the save is about to take. For a
compound name that is the trashed row under the pair the compound name names,
and the pair IS the input tree's pair: the card-block declaration resolves
the compound name's two sides before the save asks. Naming the shape in the
by-pair scope therefore answers the read.

**WHAT THEY COST AND WHAT THEY BUY.** Both declarations are SPECULATIONS: the
answers go into the transaction's read memo under the keys the readers use,
and the memo's invalidation rules still apply. A write that lands in between
drops the answer and the reader goes to the wire, exactly as it would have
without the declaration. So the declarations change the NUMBER of round
trips, never the ANSWERS.

**MEASURED on the graded save: 233 -> 227 pipeline POSTs** (798 statements,
against 781 before this row: the statements grew because a declaration
prefetches the shapes it names, and the round trips fell because the readers
of those shapes are answered from the memo).

## 4. The pinned cases

`tests/card/actions/list-card-shapes-declaration.test.ts`, three cases
against the mock Hrana server (real better-sqlite3):

1. the two shapes ride ONE round trip, measured both ways: two POSTs without
   the declaration, one with it, and the POST that carries both is the SAME
   POST;
2. the declaration changes the NUMBER of round trips, never the ANSWERS: the
   row the reader gets is the row it got without the declaration;
3. the readers use the REGISTRY's statements, so a reader and a declaration
   cannot drift apart on the whitespace of a statement string.

And `tests/card/fetch/card-block-declaration.test.ts` gained a fourth case
for the trashed junction: the shape is declared once, and the reader of it
costs NO execute.

## 5. What the shapes cost when they are not answered

The final measurement's in-transaction single-statement reads, by shape
(72 in all, against 97 at the round's start):

| reads | shape | why no declaration answers it |
|---|---|---|
| 27 | the junction id lookup | the pairs are the permission walk's own findings |
| 11 | the live row by id | the ids are the save's own cards |
| 10 | the row by id | the ids are the save's own cards |
| 7 | the live row by key | the keys are the walk's own findings |
| 4 | the unary-plus junction | the rule walk's own levels' pairs (MEASURED REFUSAL) |
| 3 | the codename by id | the ids are the save's own cards |
| 3 | the codename id | the save's card write assigns `trash`, which the read's WHERE names, so the driver's invalidation rule drops the memoized answer |
| 2 | the codename by key | the walk's own findings |
| 1 | the trashed key | the save writes to that card (MEASURED REFUSAL) |
| 1 | the trashed junction | the pair involves the card the save creates, whose id no declaration can know |
| 1 | the name triple | the walk's own findings |
| 1 | the rules join, 1 the trigger graph | the permission walk's own reads |

## 6. What was not done

- **Nothing was deployed and nothing was pushed to a live host.**
- **The trashed-key and the unary-plus junction shapes were not declared.**
  They are named in the registry, so a reader and any future declaration
  cannot drift apart, but no declaration answers them, and both were MEASURED
  and refused.
- **The after-commit read memo was not landed.** That is the operator's
  visibility ruling and it stays blocked.
