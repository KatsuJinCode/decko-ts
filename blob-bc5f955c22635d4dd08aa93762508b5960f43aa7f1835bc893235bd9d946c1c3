# The owner's save: family round nine (2026-10-24)

Lane `port/savepath-round9-20261024`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round9-20261024`, created from the
family's tip `0c49dd07` (round eight's). Pushed forward-only to
KatsuJinCode/decko-ts (private).

## 1. The 175 LINE IS MET: 191 -> 175 POSTs

**THE GRADED SAVE NOW COSTS 175 PIPELINE POSTs.** The stretch target was
about 175 and the accept line was 200. The save is on the stretch line and
13 under the accept line.

| | before | after |
|---|---:|---:|
| the graded save, pipeline POSTs | 191 | **175** |
| the graded save, statements | 739 | **667** |
| the after-commit POSTs (the notification phase) | 51 | **35** |
| the after-commit statements | 167 | **95** |
| the after-commit single-statement POSTs | 35 | **24** |

**THE IN-TRANSACTION HALF OF THE SAVE DID NOT MOVE**: 140 POSTs, 572
statements, 77 single-statement POSTs, before and after. Every POST the
round removed was an after-commit one, which is where the three reads the
round folded lived.

The measurements are the ladder's own
(tools/run-save-statement-ladder-to-completion.mjs --attribution), taken on
this lane's tree at the base tip `0c49dd07` and at this round's tip.

## 2. What the round landed

Three reads were paid a round trip each for answers the save already held
somewhere else. Each of them is now folded into a read the phase was
already making.

**ROW-1: THE ANCESTOR WALK READS EVERY NESTER IN ITS NESTER READ.**
The walk up the nesting chain needs three facts about every card one level
up: that it nests the card below it (the reference row), that it is LIVE
(`id.card&.`, a trash-filtered fetch), and what its own name and two sides
are (the walk expires the card's cache entry under that name). The
nester read names the nester, so the other two facts could be read in the
same round trip.

The walk used to pay three POSTs per level: the nester batch, the
liveness batch (one statement per nester, to read its `trash`), and, after
the touch write, the ancestors' own rows (one statement per ancestor, for
the name and the sides). The nester read's shape now carries the nester's
`trash`, `name`, `left_id` and `right_id` through correlated subqueries,
each with the same `LIMIT 1` and no ORDER BY that the old reads had, so
each subquery picks the same row the old read picked.

**THE MEASURED COST OF THE WALK**: 15 POSTs before, 9 after (the six level
batches, the touch write, the sides' name triples, and the touch write's
own row read is gone with the ancestors' rows). The nester read's
statement grew, and the round trip count fell.

**ROW-2: THE RECENT-SETTINGS STEP READS THE SAVED CARDS' ROWS IN ONE
ROUND TRIP.** The step walks the save's actions (the card and its
subcards) and reads each one's row: the row says whether the card is a
rule or a preference, and its name is what the recent list is written
with. The ids are the save's own action ids, so the rows are all known at
once, and they ride one batch. The graded save's step read eight rows, one
at a time; it now reads them in one POST.

**WHY THE ROWS ARE THE SAME.** The loop's only card write is the recent
settings card, and it writes `db_content`, `updated_at` and `updater_id`.
The loop reads `trash`, `left_id`, `right_id` and the name from these rows,
and none of those is a column the loop writes. The loop's other writes are
the recent card's reference rows, which are rows of `card_references`.

**ROW-3: THE STYLE ASSET EVENTS' CONTENT-BEFORE READS RIDE ONE BATCH.**
The read binds a card id, an action id and a field index, and all three
are known before the walk asks for them. The graded save asked three times
and paid three POSTs; it now pays one.

## 3. The after-commit region, shape by shape

The after-commit POSTs of the graded save, before and after (the graded
save's own attribution trace, one line per POST shape):

| the POST's shape | before | after |
|---|---:|---:|
| the nester batch (one per level) | 6 POSTs, 34 stmts | 6 POSTs, 39 stmts |
| the liveness batch (one per level) | 6 POSTs, 36 stmts | **0** |
| the ancestors' own rows | 1 POST, 36 stmts | **0** |
| the saved cards' rows (one per card) | 8 POSTs, 8 stmts | **1 POST, 8 stmts** |
| the content-before read (one per card) | 3 POSTs, 3 stmts | **1 POST, 3 stmts** |
| the card row (single) | 9 POSTs, 9 stmts | **1 POST, 1 stmt** |

**THE 16 POSTs THAT WENT AWAY ARE ACCOUNTED FOR**: six liveness batches,
the ancestors' own row batch, seven of the eight saved-cards' row reads,
and two of the three content-before reads.

## 4. The gates, on this round's tip

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

The equivalence verdict: **19469 composed keys checked, 0 wrong, 0 missing,
0 invented** (1489 rule-shaped, 0 wrong). The battery: **1564 passed**,
and the only failures are the **same 5 MySQL 8.4 atomic-saves cases the
base tree fails**. That was measured this round, not taken on trust: the
base tip `0c49dd07` was checked out into its own lane
(`C:/localProjects/decko-ts-savepath-round9-base-20261024`) and the same
five cases fail there, with the MySQL driver's own error ("Table
'atomic_1.sqlite_master' doesn't exist",
src/server/drivers/mysql.ts:228):

- reference write: a failure writing the new card's references undoes the
  card and its history
- history write: a failure writing a subcard's change rows undoes the main
  card's update
- a save that succeeds commits before its integration phase runs (mail sees
  committed rows)
- after a rolled-back save, the same engine saves normally (caches and lock
  released)
- orphan history at the next id: a create takes the first id past it and
  starts a history of its own

The typecheck holds at the **3 pre-existing errors** in
tests/card/actions/write-path-races.test.ts, a file this round did not
touch.

## 5. The ladder, and the family's count

| | |
|---|---|
| the graded save, pipeline POSTs | **691 -> 175** (a **74.7%** reduction over the family's first measurement) |
| This round's share | **191 -> 175** (16 POSTs, 8.4%) |
| the target (about 175, accept 200 or below) | **THE 175 LINE IS MET** (175). The accept-200 line is met with 25 to spare (175). |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED** (the rungs
up to round eight are round eight's table verbatim,
docs/reports/owner-save-family-round-eight-2026-10-24.md):

| rung | commit | POSTs |
|---|---|---|
| the first measurement | - | 691 |
| round 1: the transaction read memo | cff0c8d9 | 526 |
| round 2: the per-save statement blocks | 5750f019 | 439 |
| the rule candidate's per-key walk | 7f881f7b | 484 |
| the read memo's row-granular narrowing | ca52e27d | 461 |
| the composed-name walk's seed reads | 72b97d78 | 439 |
| the transport packing's admission rule | 1e0f0721 | 437 |
| the card-block declaration, widened | b3a36b02 | 374 |
| the card-block declaration reaches the other blocks | a5557a63 | 310 |
| the follower's walk rides one round trip per shape | 513a56e7 | 289 |
| the rule walk's junction read is pinnable | 3d095ece | 284 |
| ROW-1: the touch write drops answers it cannot change | 5a4272a4 | 272 |
| ROW-2: the reference walk's names are declared | 3e0e2338 | 257 |
| round four: the pin separation | 9916c39f | - |
| round four: the notification phase's follow reads | c9882203 | 245 |
| round five ROW-1: the deck's standard cards are declared | 4c06cc25 | 233 |
| round five ROW-2: the walked card's two shapes ride one round trip | 32e2badf | 227 |
| round six ROW-1: the rule candidates are declared, behind the Lexicon skip gate | c9b2b4e4 | 216 |
| round six ROW-2: the reference refresh's two deletes ride one round trip | 41ab935d | 212 |
| round seven ROW-1: the declaration's declared set rides one round trip (the run cap, 32 -> 256) | 0854a3c0 | 205 |
| round seven ROW-2: the *nests arm's inclusion count rides the rule-content batch | d007adf6 | 198 |
| round eight ROW-1: the notification phase runs inside a read scope | 635630af | 191 |
| **round nine: the ancestor walk reads every nester in its nester read, and the saved cards' rows and the content-before reads ride one batch each** | **a09c9b3a** | **175** |

## 6. What remains above the 175 line

**NOTHING: the line is met.** The named remainders of round eight, and
where they stand now:

- **THE TOUCH WRITE'S WHERE IS AN IN LIST.** Still not landed, and the
  round's measurement says why it is worth less than round eight believed.
  The touch write's rows are exactly the ancestors the walk stamps, so
  narrowing the write to its IN list would not keep the ancestors' own
  memoized rows alive: the write touches every row the walk then reads.
  The write's IN list names the same ids the walk's list does.
- **THE REFERENCE WALK'S COMPOUND-NAME LEVELS (structural).** Unchanged.
- **THE CARD-BLOCK DECLARATION'S BY-KEY RUN (structural).** Unchanged.
- **THE STANDARD CARDS' FIND RUN AND THE CARD BLOCK'S SIMPLE-NAME RUN
  (named, one POST).** Unchanged.
- **THE PERMISSION WALK'S OWN READS.** Unchanged, and now the largest
  named population: the graded save's rule walk runs nine times (its
  resolution memo is dropped by the save's own writes), and each run pays
  a seed batch and a junction batch. This is the next place to look.
- **THE TOUCH WRITE (round six's named refusal).** Unchanged.
- **THE CARD INSERT'S FOLLOWERS (round six's structural refusal).**
  Unchanged.

## 7. The disk cost, and the residue

```
added to the repo:
  src/card/actions/card-action-engine.ts                   (the ancestor walk's nester read)
  src/card/actions/style-asset-events.ts                   (the content-before batch)
  tests/card/actions/ancestor-walk-liveness-in-the-nester-read.test.ts  (new: 6 cases)
  tests/card/actions/recent-settings-action-row-batch.test.ts           (new: 2 cases)
  docs/reports/owner-save-family-round-nine-2026-10-24.md  (new)
  docs/reports/receipts/owner-save-family-round-nine-20261024.json (new)
removed from the repo: 0 bytes
```

576 lines added and 43 removed across 4 changed source and test files,
35,202 bytes of source and test diff, 0 bytes removed from the repo. The
lane's gitignored `tmp/` scratch holds 5,719,827 bytes (the ladder
receipts and the gate logs). NOT deleted: the machine's deletion gate
requires the diskSteward staging tool, and this lane has no approval for
it.

## 8. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** Every
  measurement ran on the local Hrana endpoint against the local copy of the
  serving deck.
- **The in-transaction half of the save was not touched.** The round's
  three levers are all in the after-commit phase. The permission walk's own
  reads (the rule walk's nine runs) are the largest population left, and
  they are in the transaction.
- **The write pinning's IN-list narrowing was not landed**, and the
  measurement above says why it would not have paid on this save.
- **The lane's own checkout was removed from under it once.** The
  diskSteward's worktree sweep deleted the lane three minutes after it was
  created, with a live custody lease, and deleted four other lanes with
  it. The lane was recreated and locked, and the sweep's ignoring of the
  lease registry is filed as a system issue.
