# The owner's save: the deck's standard cards, declared (2026-10-23)

Lane `port/savepath-round5-20261023`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round5-20261023`, created from the
family's tip `c9882203` through the machine's sanctioned lane copy. Pushed
forward-only to KatsuJinCode/decko-ts (private).

## 1. The row, and what happened to it

| Row | Population | Disposition |
|---|---|---|
| ROW-1 | the reads of the deck's STANDARD CARDS: the cards the deck carries by codename, which the card-block declaration never names because it only receives the save's input tree | **CLOSED ON PARITY** - **245 -> 233 POSTs** |

## 2. The row's starting point, measured

This lane reproduced the family's number on its own tree, with no change of
any kind: **245 pipeline POSTs, 760 statements** on the graded save.

**THE PROFILE THAT NAMED THE ROW.** The graded save's in-transaction phase
holds 120 pipeline POSTs, of which 97 carry exactly ONE statement (a read the
memo did not hold). Those 97 single-statement reads, by shape:

| reads | shape |
|---|---|
| 27 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` |
| 18 | `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` |
| 14 | `SELECT * FROM cards WHERE id = ? LIMIT 1` |
| 7 | `SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1` |
| 6 | `SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1` |
| 4 | the codename-triple join |
| 4 | the type-codename join |
| 4 | the trashed junction |
| 4 | the unary-plus junction |
| 3 | `SELECT codename FROM cards WHERE id = ?` |
| 3 | the rest (two by key, one name triple, one rules join, one trigger graph) |

**THE NAMED GAP.** The card-block declaration
(src/card/fetch/card-block-declaration.ts) answers the reads of the save's
INPUT TREE: every card the save TOUCHES is named in that tree. The deck's
STANDARD CARDS are not in the tree. They are a property of the deck: the deck
carries them under a CODENAME (the rule types `read`, `set` and `setting`, the
card types `basic`, `user`, `cardtype`, `list`, `search_type`, `all`,
`all_plus` and `default`), and the save reads them by that codename and by
their id without ever naming them. Every one of those reads was a round trip
of its own.

## 3. The lever, and what it does

**A NEW DECLARATION, AT A NEW SEAM.**
(src/card/fetch/standard-card-declaration.ts) The deck's standard cards are
declared once per save, in TWO batches:

- **FIND**: one batch that finds them, in the shape the readers use (the id a
  codename names). Eleven statements, one round trip.
- **SHAPES**: one batch that reads the shapes of the cards FIND found (the
  card row, the live row, the codename column). One round trip.

Two batches and not one, because a statement that binds a value an earlier
statement of its own batch produced cannot be answered by that batch (the
probe's arm 3: the bound value is fixed when the request is sent), and the
shapes batch binds the ids the FIND batch produced.

**THE SEAM.** The save's two card seams (the create path and the update path),
right before the save's input tree declares itself, which is before the
permission walk asks for anything.

**WHAT IT COSTS AND WHAT IT BUYS.** The declaration is a SPECULATION: the
driver remembers the answers under the same keys the readers use, and a read
the driver cannot vouch for is a MISS (the reader's own read then takes the
blocking path, at its own sequence point, and answers the same). So the
declaration changes the NUMBER of round trips, never the ANSWERS.

## 4. The measurement, before and after

| | before | after |
|---|---|---|
| the graded save's pipeline POSTs | **245** | **233** |
| the graded save's statements | 760 | 781 |
| the in-transaction single-statement reads | 97 | 83 |
| the save's rule-type codename reads (the shape the declaration names) | 6 | 3 |
| the save's by-id reads of a standard card | 13 | 0 |

**THE 12 POSTS.** Twenty-three reads are now answered from the memo (the six
rule-type codename reads, thirteen by-id reads of a standard card, and four
more), and the declaration costs two round trips.

**THE THREE THAT REMAIN.** The rule-type codename reads are six: `set` twice,
`setting` twice, `read` twice. The card write
(`UPDATE cards SET type_id = ?, db_content = ?, trash = ?, ...`) ASSIGNS
`trash`, and the codename read's WHERE names `trash`, so the driver's
invalidation rule correctly drops the memoized answer and the reads after that
write go to the wire. That is the memo's rule, not a gap in the declaration.

## 5. The gates, on this tree

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

- **The equivalence gate**: 19,469 composed keys checked, **0 wrong, 0
  missing, 0 invented**; 1,489 rule-shaped keys, 0 wrong.
- **The battery**: 140 files (134 passed, 5 skipped, 1 failed); 1,564 tests
  (1,477 passed, 5 failed, 37 skipped). The 5 failures are the same MySQL 8.4
  set the base tree fails: this lane ran `tests/card/actions/atomic-saves.test.ts`
  on this tree (5 failed, 61 passed) and on the base tree `c9882203` (5 failed,
  61 passed), and the two runs are the same file and the same five cases.
  One battery run also lost a worker to a native crash inside that same
  MySQL-only file (`Worker exited unexpectedly with exit code 2147483651`);
  the file run on its own does not crash, so that run's lower passed count is
  the crash, not the change.
- **The typecheck**: the same **3 pre-existing errors** in
  `tests/card/actions/write-path-races.test.ts`, and no new one.

## 6. The pinned cases

`tests/card/fetch/standard-card-declaration.test.ts`, four cases against the
mock Hrana server (real better-sqlite3, so a wrong answer would show up as a
wrong answer):

1. the declaration costs TWO round trips: one batch that FINDS the standard
   cards, one that reads their SHAPES;
2. every reader of a declared shape then costs NO execute;
3. the declaration never serves a wrong answer: a codename the deck does not
   hold resolves to nothing, and a trashed card is not a standard card;
4. outside a transaction there is no memo to hold the answers, so the
   declaration does nothing at all.

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** Every
  measurement ran on the local Hrana endpoint against the local copy of the
  serving deck.
- **The after-commit read memo was not landed.** That is the operator's
  visibility ruling and it stays blocked.
- **The shape registry was not extended** for the shapes no declaration can
  name. That is round five's second row.
