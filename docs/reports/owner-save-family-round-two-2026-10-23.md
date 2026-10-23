# The owner's save: family round two, four rows (2026-10-23)

Lane: `port/savepath-round2-20261023`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round2-20261023`, created from the
family's newest tip `a5557a63` ("perf(save path): the card-block declaration
reaches the other blocks, 374 -> 310 POSTs"). Pushed forward-only to
KatsuJinCode/decko-ts (private).

## 1. The rows, in row-id order, and what happened to them

| Row | Population | Commit | Disposition |
|---|---|---|---|
| ROW-1 | the follower's per-resolution reads: the set card ids of a card's set patterns and the set cards' rule contents, read one at a time | 513a56e7 | **CLOSED ON PARITY** - the lever the tip named as the next lane's work landed; 310 -> 289 POSTs, and the statement count is UNCHANGED at 836, so no read was added and no read was dropped |
| ROW-2 | the rule walk's junction read, which the driver could not read as a conjunction, so every write to cards dropped its memoized answer | 3d095ece | **CLOSED ON PARITY** - 289 -> 284 POSTs, 836 -> 812 statements; and the tip's two stated causes for this row measured FALSE for the deck the ladder measures on |
| ROW-3 | the notification phase's card-independent reads: the deck's preference rows and the deck's users of the user type, read once per saved card | d91d8ce6 | **MEASURED AND NAMED** - 14 POSTs, one argument set each, seven cards; the lever is a visibility decision the family named as the operator's, and Ruby's own behaviour (a deck-wide preference cache) is the evidence the ruling needs |
| ROW-4 | the store phase's type walk: the junction reads the walk asks for over and over | 0b82d4ed | **MEASURED AND NAMED** - 57 POSTs over 78 distinct pairs, 106 repeated statements; the tip's lever CANNOT pay, because the save's own card write drops every prefetched junction answer, and the lever that could pay is named |

**TWO ROWS CLOSED WITH A LEVER AND TWO ROWS CLOSED WITH A NAMED GAP.** The
two that closed are the two whose lever was mechanical: a batch, and a
reader that reads the same column the SQL names. The two that stay open are
the two whose lever needs a ruling (the operator's) or a change to the
driver's staleness rules (the family's).

## 2. The rig, and what it measured

- **The ladder** (`tools/run-save-statement-ladder-to-completion.mjs`, and its
  attribution copy): the local Hrana endpoint against the local copy of the
  serving deck. **The hosted Bunny service was NOT contacted**: its database
  is Brandon's live deck, and the metered-host law puts one batched
  confirmation fetch at the end of a lane, not a measurement loop. This lane
  needed no confirmation fetch, so none was made.
- **The base tree reproduced the family's baseline exactly**: 310 POSTs, 836
  statements, at `a5557a63` with no change of any kind.
- **This lane's own drop instrument**: in the driver's memo invalidation, it
  recorded which read each drop dropped and which write dropped it. It is a
  diagnostic and it is **NOT landed**: the driver was restored before each
  commit, and each commit's diff names only its own files.
- **The equivalence gate**
  (`tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`):
  the serving deck at
  `C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`,
  19,469 composed keys, 0 wrong, 0 missing, 0 invented; 1,489 rule-shaped,
  0 wrong. It is the oracle evidence for ROW-2 and not a formality: the read
  ROW-2 makes pinnable is the rule-candidate walk's own junction read.
- **The battery** over the family's seven suites, and the typecheck.

## 3. The battery

| tree | files | tests |
|---|---|---|
| the base (`a5557a63`) | 131 passed, 1 failed, 5 skipped (137) | 1501 passed, 5 failed, 37 skipped (1543) |
| after ROW-1 | 131 passed, 1 failed, 5 skipped (137) | 1502 passed, 5 failed, 37 skipped (1544) |
| after ROW-2 | 131 passed, 1 failed, 5 skipped (137) | 1503 passed, 5 failed, 37 skipped (1545) |

The 5 failures are the same in all three: `tests/card/actions/atomic-saves.test.ts`,
"MySQL 8.4 (native)", and there is no MySQL server on this machine. **No
green suite turned red.** The test count rises by one per row that adds a
pinned test.

The typecheck reports the same **3 pre-existing errors** in
`tests/card/actions/write-path-races.test.ts` in every tree, and no new one.

## 4. The family count after this round

| | |
|---|---|
| The family's ladder rungs landed | **10** (8 before this round, 2 in it) |
| Rows closed in this round | **4** (2 with a lever, 2 measured and named) |
| The graded save, pipeline POSTs | **691 -> 284** (a 59.0% reduction over the family's first measurement) |
| This round's share | **310 -> 284** (a 26-POST, 8.4% reduction) |
| The target (about 175, accept 200 or below) | **NOT MET.** The measured number is 284, which is 84 POSTs above 200 |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED** (the POST
counts are the ones the family's own reports and receipts carry):

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
| ROW-1: the follower's walk rides one round trip per shape | 513a56e7 | 289 |
| ROW-2: the rule walk's junction read is pinnable | 3d095ece | 284 |

(The rungs are not monotonic because some lanes measured a different tree
from the one the rung before it measured; the ladder's own reports say so
where they do.)

## 5. Two corrections to the family's tip

**ROW-2's POPULATION WAS NOT THE TIP'S.** The tip's section 6.3 said the
remaining 42 POSTs are "the reads a card creation still drops", for two
reasons: the measurement deck's `cards` table has no primary key, and the
insert's id column's value is a SQL expression. Both were checked against
the rig this lane ran:

- the measurement deck's `cards` table DOES carry `id INTEGER PRIMARY KEY
  AUTOINCREMENT` (pk=1, 0 rows where rowid <> id), because the ladder builds
  its own copy with the engine's own migrations. The tip's claim is true of
  the SOURCE deck, which the equivalence test reads, and false of the deck
  the ladder measures on;
- the insert's id column's value IS a subquery, and the rowid pin covers the
  id-pinned reads anyway, precisely because the id column is the rowid alias
  on that deck.

The population this lane found and closed is different: 66 memo drops of the
rule walk's junction read, worth 5 POSTs and 24 statements.

**ROW-4'S LEVER CANNOT PAY.** The tip's lever for the type walk is "a
declaration that knows the walk". The measurement says the save's own card
write drops every junction read's memoized answer, because that write
assigns the three columns a junction read's WHERE names (trash, left_id,
right_id), so a prefetched answer would be dropped by the same write and the
reads would go on the wire anyway.

## 6. The disk cost, and the residue

```
added to the repo (8 new files):
  docs/reports/owner-save-walk-batch-2026-10-23.md                    9,347 bytes
  docs/reports/receipts/owner-save-walk-batch-20261023.json           3,790 bytes
  docs/reports/owner-save-unary-plus-narrowing-2026-10-23.md         12,858 bytes
  docs/reports/receipts/owner-save-unary-plus-narrowing-20261023.json 5,213 bytes
  docs/reports/owner-save-card-independent-reads-2026-10-23.md        5,957 bytes
  docs/reports/receipts/owner-save-card-independent-reads-20261023.json 3,430 bytes
  docs/reports/owner-save-junction-read-walk-2026-10-23.md            8,202 bytes
  docs/reports/receipts/owner-save-junction-read-walk-20261023.json    5,010 bytes
  total added: 53,807 bytes
changed (4 files, 253 insertions, 33 deletions):
  src/card/notify/follower-resolver.ts                        (the walk's two batches)
  tests/card/notify/follower-resolver.test.ts                  (the pinned round-trip guard)
  src/card/drivers/bunny-db.ts                                 (the conjunct reader's unary plus)
  tests/card/drivers/bunny-db-transaction-read-memo.test.ts    (the pinned unary-plus guard)
removed from the repo: 0 bytes
residue:
  the lane's clone C:/localProjects/decko-ts-savepath-round2-20261023 (its own tree and
    the node_modules junction to the release-lead tree's; the git objects are shared)
  the lane's gitignored tmp/ scratch: 5.5 MB (the ladder receipts, the drop census logs,
    and this lane's 9 census and instrument scripts)
  archived outside the repo: C:/localProjects/archive/decko-ts-savepath-round2-20261023-scratch
    (41 MB: the deck copy this lane's own schema check built; the measurement it carried is
    recorded in the ROW-2 report, and the copy is regenerated by one command)
```

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The hosted
  Bunny service was not contacted; every measurement ran on the local Hrana
  endpoint against the local copy of the serving deck.
- **The target was not met** (284, not 175 or 200).
- **The memo was not made to outlive the commit** (ROW-3): that is a
  visibility decision about the deck, and the family named it as the
  operator's.
- **The driver's staleness rules were not changed** (ROW-4): that rule
  decides when a memoized answer is stale, and the family has been explicit
  that a lane whose job is not the memo carries that risk only with its own
  gates behind it.
- **The rows the tip named that this lane did not take**: the tip's section
  6.4 (the read-rule walk's one-at-a-time name lookups, and the notification
  phase's per-card row reads) was not reached. They are in the census that
  the ROW-4 receipt carries, and they are the next rows of this family.
