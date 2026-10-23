# The owner's save: family round three, three rows (2026-10-23)

Lane `port/savepath-round3-20261023`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round3-20261023`, created from the
family's tip `d37b181b` through the machine's sanctioned lane copy. Pushed
forward-only to KatsuJinCode/decko-ts (private).

## 1. The rows, in row-id order, and what happened to them

| Row | Population | Commit | Disposition |
|---|---|---|---|
| ROW-1 | the reads whose memoized answer the save's touch write dropped although the write changes no column the read answers | 5a4272a4 | **CLOSED ON PARITY** - the memo's answer-scope rule; **284 -> 272 POSTs** |
| ROW-2 | the reference walk's name resolutions: the deck's 17 referee names, each resolved through the Lexicon one at a time | 3e0e2338 | **CLOSED ON PARITY** - the names are declared at the seam; **272 -> 257 POSTs** |
| ROW-3 | the notification phase's 81 repeated reads: the phase runs after the commit, with no transaction and therefore with no memo | (this commit) | **MEASURED AND NAMED** - the lever is a memo that outlives the commit, and that visibility decision is the operator's |

**TWO ROWS CLOSED WITH A LEVER AND ONE ROW CLOSED WITH A NAMED GAP.** The two
that closed are the two whose lever was mechanical: a rule about when a
memoized answer is stale, and a declaration of names a seam already held.
The one that stays open is the one whose lever needs a ruling (the
operator's).

## 2. The round's starting point, measured

The family measured 284 POSTs at its tip `d37b181b`. This lane reproduced
that number on its own tree, with no change of any kind: **284 POSTs, 812
statements**.

**THE PROFILE THAT NAMED THE ROWS.** This lane's own instrument (a
driver-side trace of every round trip, every memo store, every memo drop and
every memo clear; a stack capture at the driver, mapped back to the engine
seams through an unminified build; not landed) said three things:

1. **THE SAVE HAS THREE PHASES, AND ONLY ONE OF THEM HAS A READ MEMO.** At
   the tip: 7 round trips before the transaction, 199 inside it, 77 after
   the commit. The notification phase runs after the commit, so the
   transaction's read memo is gone, and its 81 repeated reads are 81 round
   trips it pays for nothing.
2. **206 OF THE 284 ROUND TRIPS CARRY EXACTLY ONE STATEMENT.** The engine
   awaits every answer before it issues the next read, so every read the
   engine issues on its own is a round trip.
3. **THE LEXICON'S OWN NAME RESOLUTION IS THE BIGGEST CONSUMER: 46 of the
   save's single-statement reads.** 17 of them are the reference walk's
   referee names, and the card-block declaration had prefetched exactly ONE
   of the 17.

**THE 103 READS THE MEMO HAD DROPPED, AND THE WRITE THAT DROPPED THEM:**

| the write that dropped the answer | wire reads it cost |
|---|---|
| `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` (the touch write) | **66** |
| `UPDATE cards SET type_id = ?, db_content = ?, trash = ?, left_id = ?, right_id = ?, ...` (the card write) | 22 |
| `UPDATE cards SET db_content = ?, updated_at = ?, updater_id = ? WHERE id = ?` | 9 |
| `INSERT INTO cards (...)` | 6 |

## 3. The ladder, and the family's count

| | |
|---|---|
| The family's ladder rungs landed | **12** (10 before this round, 2 in it) |
| Rows closed in this round | **3** (2 with a lever, 1 measured and named) |
| The graded save, pipeline POSTs | **691 -> 257** (a **62.8%** reduction over the family's first measurement) |
| This round's share | **284 -> 257** (a 27-POST, 9.5% reduction) |
| The target (about 175, accept 200 or below) | **NOT MET.** The measured number is 257, which is 57 POSTs above 200 |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED:**

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
| **ROW-1: the touch write drops answers it cannot change** | **5a4272a4** | **272** |
| **ROW-2: the reference walk's names are declared** | **3e0e2338** | **257** |

(The rungs are not monotonic because some lanes measured a different tree
from the one the rung before it measured; the ladder's own reports say so
where they do.)

## 4. The gates, on the pushed tip

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-R3-ROW2b.json
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx tsc --noEmit
```

- **The equivalence gate**: 19,469 composed keys checked, **0 wrong, 0
  missing, 0 invented**; 1,489 rule-shaped keys, 0 wrong.
- **The battery**: the family's seven suites. The result is in section 5.
- **The typecheck**: the same **3 pre-existing errors** in
  `tests/card/actions/write-path-races.test.ts`, and no new one.

## 5. The battery

See the receipt's `gates.battery` field for the exact counts. The failures
are the same MySQL 8.4 set the base tree fails: this lane checked that by
running `tests/card/actions/atomic-saves.test.ts` with this round's change
parked, and the same five cases fail on the base tree.

**No green suite turned red.** The test count rises by one per row that adds
a pinned test and by two for ROW-2's file.

## 6. The disk cost, and the residue

```
added to the repo (5 new files):
  docs/reports/owner-save-answer-scope-2026-10-23.md
  docs/reports/receipts/owner-save-answer-scope-20261023.json
  docs/reports/owner-save-reference-names-declared-2026-10-23.md
  docs/reports/receipts/owner-save-reference-names-declared-20261023.json
  docs/reports/owner-save-notification-phase-memo-2026-10-23.md
  docs/reports/owner-save-family-round-three-2026-10-23.md
  docs/reports/receipts/owner-save-family-round-three-20261023.json
  tests/card/actions/refresh-references-out-declaration.test.ts
changed (3 files):
  src/card/drivers/bunny-db.ts                 (the answer-scope rule)
  tests/card/drivers/bunny-db-transaction-read-memo.test.ts  (the pinned cases)
  src/card/actions/refresh-references-out.ts    (the reference names, declared)
removed from the repo: 0 bytes
residue:
  the lane's clone C:/localProjects/decko-ts-savepath-round3-20261023 (a linked
    worktree of C:/localProjects/decko-ts-restored, with node_modules shared
    through a junction; the git objects are shared)
  the lane's gitignored tmp/ scratch: the ladder receipts (the baseline, the
    attribution copies, the per-row measurements), the gate logs, and this
    lane's instrument and analysis scripts
```

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The hosted
  service was not contacted; every measurement ran on the local Hrana
  endpoint against the local copy of the serving deck.
- **The target was not met** (257, not 175 or 200).
- **The memo that outlives the commit was not landed** (ROW-3): that is a
  visibility decision, and the family named it as the operator's.
- **The value-based narrowing the family named in round two was not
  landed.** ROW-1 is a column-scope rule, not that rule.
- **The retrieve path's name resolutions were not declared**: the fetch layer
  resolves one name per call, and the seam that holds the whole set of names
  it will resolve is not in the save's input tree.
