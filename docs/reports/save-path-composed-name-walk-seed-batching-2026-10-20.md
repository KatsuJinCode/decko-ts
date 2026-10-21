# The composed-name walk's seed reads ride one batch: 461 -> 439 POSTs on the graded save (2026-10-20)

Follows `read-memo-row-granular-narrowing-2026-10-20.md` (ca52e27d), which
narrowed the transaction read memo to rows and took the graded save from 484
to 461 POSTs. This round prices the save's round trips in the ladder's own
currency for the first time, names the top cost that pricing found, takes the
one lever that pricing says is worth taking, and measures a second lever dead.

Branch `perf/savepath-walk-seed-batching-20261020`, base ca52e27d, worktree
`C:/localProjects/decko-ts-savepath-rung4-20261020`.

## 1. Headline

| | |
|---|---|
| The top cost, priced in POSTs | **the save's 461 POSTs, 415 of them single-statement (90%)**. The largest cluster of POSTs carrying MUTUALLY INDEPENDENT statements is the composed-name walk's **31 seed-read POSTs** |
| The lever taken | **the walk's seed reads ride ONE ordered batch per walk.** They are independent: each level's run list is known before the walk starts, and the walk issues no writes |
| The graded save | **461 -> 439 POSTs**, 666 statements UNCHANGED, reproduced on three runs a side |
| The walk | **7 -> 4 round trips per cold walk** (the number a8ee2c7d predicted), and the save's nine walks go from 31 seed-read POSTs to 9 |
| Statements | **666 -> 666.** The change moves no statement; it packs the same statements into fewer POSTs, which is the live host's currency (one POST is one network hop) |
| Equivalence | unchanged and re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented** |
| Green suites | **none turned red.** Permission and write columns identical to ca52e27d's own table |
| Second lever | **the read memo's INSERT case: measured, and worth 0 POSTs on this save** (§9) |

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/save-ladder-RUNG4-BEFORE-<n>.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/save-ladder-RUNG4-AFTER-<n>.json
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/save-ladder-RUNG4-ATTRIB-1.json
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/save-ladder-RUNG4-ATTRIB-AFTER.json
node docs/reports/receipts/attribute-save-posts-to-shapes.mjs <receipt>.json
node docs/reports/receipts/attribute-composed-name-walk-round-trips.mjs <receipt>.json
node docs/reports/receipts/size-insert-pinning-narrowing.mjs <receipt>.json
npx vitest run tests/card/permissions/
npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ \
    tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts
npx vitest run tests/card/drivers/
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts
npx vitest run tests/card/permissions/composed-name-walk-round-trip-census.test.ts
npx tsc --noEmit
```

**The BEFORE tree is a separate worktree at ca52e27d**, not a reverted copy of
this one: `C:/localProjects/decko-ts-savepath-rung4-baseline-20261020`, branch
`perf/savepath-rung4-baseline-20261020`, at ca52e27d with no change of any
kind. Both worktrees ran the same ladder, on the same machine, in the same
session, against the same serving deck.

**The attribution ladder is a separate copy of the ladder, not an edit of it**
(`tools/diagnose-owner-save-statement-ladder-post-attribution.mjs`): the plain
ladder is shared with other lanes, and this round added no behaviour to it.
The copy records, per POST, how many statements the POST carried and which.
Its counts are identical to the plain tool's on the same tree (461 POSTs /
666 statements in both), which is the check that the extra bookkeeping changed
nothing.

**Receipts** (all under `docs/reports/receipts/`):

| file | what it is |
|---|---|
| `save-ladder-walk-seed-batching-BEFORE-run1..3-2026-10-20.json` | the three BEFORE runs, from the baseline worktree at ca52e27d |
| `save-ladder-walk-seed-batching-AFTER-run1..3-2026-10-20.json` | the three AFTER runs, from this branch |
| `save-ladder-walk-seed-batching-POST-ATTRIBUTION-BEFORE-2026-10-20.json` | the per-POST attribution of the BEFORE tree (461 POSTs) |
| `save-ladder-walk-seed-batching-POST-ATTRIBUTION-AFTER-2026-10-20.json` | the per-POST attribution of the AFTER tree (439 POSTs) |
| `attribute-save-posts-to-shapes.mjs` | prices a segment's POSTs by shape |
| `attribute-composed-name-walk-round-trips.mjs` | prices the walk's seed and arm reads |
| `size-insert-pinning-narrowing.mjs` | sizes the memo's INSERT case (§9) |

### 2.1 A defect in the instrument, found and worked around

**The ladder never exits.** It stamps an event-loop tick counter by
rescheduling itself forever:

```js
let currentTick = 0;
const bumpTick = () => { currentTick += 1; setImmediate(bumpTick); };
setImmediate(bumpTick);
```

(`tools/diagnose-owner-save-statement-ladder.mjs:126-128`.) An endless
`setImmediate` chain keeps the event loop alive, so the process writes its
report, prints its summary, closes its local stack, removes its run
directory, and then spins until something interrupts it.

The cost of that is not the spin. A lane that runs the ladder in a loop runs
ONE run and then hangs, and each spinning process burns a core for the rest
of the session, which pollutes every later measurement on the machine. Three
such processes were alive when this round found it, and they are why the first
attempts at these measurements took 6 to 13 minutes per run instead of 18
seconds.

`tools/run-save-statement-ladder-to-completion.mjs` is the workaround: it
imports the ladder and exits when the ladder's own top-level code has
finished (its `try`/`finally` has closed the host, the local Hrana server and
the mock storage, and removed its run directory). Exiting there is the
ladder's normal end, not an interruption of a running measurement. **The
shared ladder was not edited**: other lanes run it, and their behaviour is
unchanged. The defect is named here for the next lane that owns the tool.

## 3. The top cost, priced in the ladder's currency

The ladder counts POSTs and statements. It does not say which statements rode
which POST, so a region of the save could not be priced in hops. The
attribution copy answers that. On the current best tree (ca52e27d), the graded
save segment:

| | BEFORE (ca52e27d) | AFTER (this round) |
|---|---:|---:|
| pipeline POSTs | 461 | **439** |
| statements | 666 | 666 |
| POSTs carrying exactly ONE statement | **415 (90.0%)** | 384 (87.5%) |
| POSTs carrying more than one | 46, carrying 251 statements | 55, carrying 282 statements |
| POSTs whose statements are all inside the transaction | 363 (454 statements) | 363 (454 statements) |
| POSTs after COMMIT | 98 (212 statements) | 98 (212 statements) |

**90% of the save's round trips spend exactly one statement each.** That is
the shape of the remaining problem, and it is why the save's wall cannot be
moved by a faster query: no statement is over 25 ms, and the db wall (353 to
478 ms across the runs) is mostly not SQL execution at all.

The single-statement POSTs, by shape (the BEFORE tree):

| POSTs | statement |
|---:|---|
| 70 | `SELECT * FROM cards WHERE id = ? LIMIT 1` |
| 55 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` |
| 35 | `SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1` |
| 30 | `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` |
| 26 | `SELECT codename FROM cards WHERE id = ?` |
| 22 | `SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1` |
| 21 | `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` |
| **31** | **`SELECT id, "key", trash FROM cards WHERE "key" IN (?, ...)`, the composed-name walk's SEED reads** |
| 19 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` |
| 12 | `SELECT codename FROM cards WHERE key = ? AND trash = 0` |
| 7 | `SELECT preferences.id AS rule_id, sets.id AS set_id, ...` (the preference index) |
| 7 | `SELECT id FROM cards WHERE type_id = ?` |

The card and junction lookups above are the engine resolving rule candidates
and their junctions, one hop at a time, and they are DEPENDENT chains: the
next lookup's arguments are the previous lookup's answer. They cannot be
batched without restructuring the callers, which is a different rung.

**The walk's 31 seed-read POSTs are the exception: they are independent.**
They are also the largest cluster of independent single-statement POSTs in the
save, which is why they are the cost this round takes.

### 3.1 The walk's round trips, measured

`docs/reports/receipts/attribute-composed-name-walk-round-trips.mjs` on the
attribution receipt:

```
BEFORE: seed reads ("key" IN (...)): 31 statements on 31 POSTs
        arm reads (left_id/right_id): 66 statements on 19 POSTs (5 of them solo)
AFTER:  seed reads ("key" IN (...)): 31 statements on  9 POSTs
        arm reads (left_id/right_id): 66 statements on 19 POSTs (5 of them solo)
```

**31 POSTs, one statement each, become 9 POSTs.** The nine are the save's nine
walks, and their seed statements per walk are 4, 3, 4, 3, 4, 3, 3, 4, 3 (31 in
all). The arm reads do not move: they already ride one batch per level, and
they cannot merge.

### 3.2 A NOTE ON THE SIZE, because a8ee2c7d priced this lever at about 3 POSTs

a8ee2c7d's §5 measured the walk correctly: 7 round trips per cold call, 4
of them seed reads, and then applied the saving to ONE call: "even a perfect
cut removes roughly 3 POSTs of 484", which is below the ladder's own
run-to-run spread, so the round landed the measurement and stopped.

**The save does not do one walk.** The ladder's attribution says it does
nine, carrying 31 seed reads between them, and the saving is 31 - 9 = **22
POSTs**. That is above the noise floor a8ee2c7d was refusing to argue under,
and in the same range as ca52e27d's landed 23-POST cut.

## 4. The mechanism

`walkComposedNames` (`src/card/permissions/read-rules.ts:884`) settles a
composed name level by level. A run of n segments is settled only after every
run of fewer than n segments, so the walk has one "level" per segment count.
For each level it issues a SEED read (every run at that level, in one
`WHERE "key" IN (...)`), and then, for levels above 1, the ARM reads for the
pairs that level's answers produce.

Before this commit the seed read was its own `driver.query` per level (at
ca52e27d, `read-rules.ts:915-931`), so a walk with four levels spent four
round trips on its seed reads alone, and the save's nine walks spent 31.

**The seed reads do not depend on each other.** Each level's run list is
computed from the REQUESTED keys, before the walk starts
(`read-rules.ts:888-898`), and the levels are disjoint in their runs: a run's
segment count IS its level, so no run string appears at two levels. The walk
issues no writes. So all the seed reads can be issued together, and the
answer to each is the same answer it gets today.

**The arm reads cannot merge**, and that is why only the seed reads were
batched: level n+1's pairs are computed from level n's answers
(`read-rules.ts:981-1006`), so a level's arm read cannot be issued before the
level below it has answered. They already ride one batch per level
(`read-rules.ts:1007-1016`), and that is unchanged.

### 4.1 What changed, in the code

`src/card/permissions/read-rules.ts:906-947`: the seed reads are collected
into `seedSlices` (one slice per level chunk, in level order) and issued as
ONE `driver.batch` before the level loop; the loop then consumes the results
in the same order. The per-level `driver.query` loop is gone.

`src/card/drivers/bunny-db.ts:650-663`: the batch path now performs NO
database operation when every statement in the batch was answered from the
memo. A memo hit already performs no database operation (that is the rule
`query()` follows, and the query counter only counts what reaches the wire);
without this, a batch of nothing but memo hits would send an EMPTY pipeline,
which is a round trip carrying no statement. The composed-name walk's seed
batch can be entirely memo hits (when the same level's run list was read
earlier in the same transaction and no write has invalidated it), so the guard
is load-bearing, not defensive.

## 5. Why the answers are the same

Hoisting a read earlier is only safe if nothing it depends on moved. Three
things had to be checked, and each is a property of the predicates and the
walk's own shape, not of the data:

1. **The rows.** No write runs between a seed read's old position and its new
   position: the walk issues no writes, and the caller awaits the walk, so
   nothing else can run in between. The rows are the same rows.
2. **The order the rows are folded in.** The slices are built in level order
   and consumed in level order, so each run's id list is built in the same
   order as before.
3. **The order the maps are written.** The level's `resolved.set(run, [])`
   (`read-rules.ts:955`) now runs AFTER its own seed read instead of before.
   A run with a seed row ends up with the same list either way: the seed read
   creates `[id]` where the old path pushed `id` into an empty `[]`. A run
   with no seed row still ends up with `[]`. And no other writer touches a
   level's entries: an arm fold writes the ckey it settles, which is the
   CURRENT level's run, so a lower level's arm fold never writes a higher
   level's run.

Nothing else in the walk moved: the arm reads, the pair construction, the
ambiguity fallback to the whole-deck walk, and the returned map are untouched.

**The batch is one round trip, not many.** `driver.batch` is one pipeline
POST on every adapter that serves the save path
(`src/server/drivers/libsql-http.ts:128` is the named contract: "ONE POST
carries every statement"), and inside a transaction it is one `sendOnStream`
call on the open stream (`src/card/drivers/bunny-db.ts:660`). The ladder's
own receipt shows the save already rides multi-statement POSTs inside its
transaction (36, 15, 13, 9 statements in one POST), so the transport carries
them.

## 6. Measurement

| | BEFORE run 1 | BEFORE run 2 | BEFORE run 3 | AFTER run 1 | AFTER run 2 | AFTER run 3 |
|---|---:|---:|---:|---:|---:|---:|
| pipeline POSTs | 461 | 461 | 461 | **439** | **439** | **439** |
| statements | 666 | 666 | 666 | **666** | **666** | **666** |
| db wall | 394 ms | 414 ms | 471 ms | 478 ms | 353 ms | 359 ms |
| statement-exec | 94 ms | 111 ms | 134 ms | 131 ms | 85 ms | 103 ms |
| statements >= 25 ms | 0 | 0 | 0 | 0 | 0 | 0 |

**22 POSTs, reproduced three times a side. 22 statements did not move: the
same 666 statements ride 439 POSTs instead of 461.** The hop count is the live
host's currency (the block-batching report puts it at ~13 ms/hop), so this is
~286 ms off the live save's hop time.

**The wall does not carry the claim, and this round says so plainly.** The
BEFORE runs span 394 to 471 ms and the AFTER runs span 353 to 478 ms: the
AFTER's spread is wider than the entire distance between the two sets, and
one AFTER run is the slowest of the six. This machine's round-trip noise is
real; a8ee2c7d's refusal to claim a 3-POST cut on wall time was the right
call, and the same rule applies here. **The claim that can be defended is the
count: 22 POSTs, three times a side, with the statement count unchanged.**

The other three journey segments are identical in all six runs (19/19, 12/102,
11/86), so the change is confined to the write path and did not leak into
sign-in or either render.

## 7. Tests

| suite | at ca52e27d | this round |
|---|---|---|
| `npx vitest run tests/card/permissions/` | 20 passed \| 4 skipped (24 files), 192 passed \| 8 skipped (200 tests) | **identical** |
| `npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts` | 1 failed \| 61 passed (62 files), 5 failed \| 762 passed (767 tests) | **identical** |
| `npx vitest run tests/card/drivers/` | 5 passed (5), 27 passed \| 15 skipped (42) | 5 passed (5), **28 passed** \| 15 skipped (43) |
| `npx tsc --noEmit` | 3 errors | **3 errors, identical** |

**No green suite turned red.** The 5 write-suite failures are
`tests/card/actions/atomic-saves.test.ts`, MySQL 8.4 (native), with no MySQL
server on this machine: `expected Error: Table 'atomic_1.sqlite_master' does
not exist to be an instance of InjectedFailure`: the adapter fell back to
SQLite. Pre-existing at this commit, in a file this round does not touch. The
3 typecheck errors are `tests/card/actions/write-path-races.test.ts` lines
132, 526, 526.

The driver suite's +1 test is this round's new case.

### 7.1 The census test, rewritten to pin the new structure

`tests/card/permissions/composed-name-walk-round-trip-census.test.ts` is where
this round's change is pinned. It counts round trips through a counting driver
proxy, over the serving deck, in the graded save's own candidate shape, with a
separate cold driver per call. Before this commit it asserted the OLD shape
(`seedStatements + loneArmStatements === queries`: the seed reads were lone
queries). It now asserts the NEW shape, and the assertion IS the win:

```
cold save-shape walk, 5 calls of 5 candidates:
  round trips:   20 total, 4, 4, 4, 4, 4 per call      (was 35 total, 7, 7, 7, 7, 7)
  statements:    80 total
  seed reads:    20 statements in 5 round trips          (was 20 round trips)
  arm reads:     60 statements in 10 round trips        (unchanged)
```

`expect(sum((t) => t.seedBatches)).toBe(perCall.length)`: exactly one batch
per walk carries the seed reads, and no seed statement is left as a lone
query.

### 7.2 Mutation-tested, because a green test proves nothing on its own

| mutation | what went red |
|---|---|
| the driver's empty-batch guard removed (`requests.length === 0` branch) | `performs NO database operation for a batch whose every statement is a memo hit`, and only that one (the mock Hrana server received 3 requests instead of 2) |
| the seed reads left as one query per level (the pre-commit shape) | the census test's `seedBatches === perCall.length` assertion, and the census's own round-trip count (7 per call instead of 4) |

## 8. Equivalence

Re-proven on this commit through the shipped functions against the serving
deck (read-only), by
`npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`:

```
deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3:
  19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys:   1489 checked, 0 wrong
```

**19,469 checked, 0 wrong, 0 missing, 0 invented.** The whole composed-name
population, not the rule-shaped subset. 0 ambiguous keys means the whole-deck
fallback never fires, so the number is undiscounted.

This change cannot move composed-name resolution: it does not touch which rows
are read, it does not touch the read memo, and it does not touch the walk's
pair construction. The equivalence run is a re-verification, not a new proof,
and that is the accurate description of it.

## 9. The named dead end: the read memo's INSERT case

The ladder also priced a second lever, and this round measured it dead.

`ca52e27d` narrowed the memo's invalidation with a disjointness rule: a read
pinned to column c = v survives a write that pins the same column of the same
table to a different value. An INSERT is outside that rule: it has no WHERE,
so it cannot be pinned, so it drops every memoized read of its table. That
looks like a gap worth closing: the save's four `INSERT INTO cards`
statements each drop the memoized reads of every card.

**It is not closable for this save, and the reason is in the statement.**
`src/card/history/write-path.ts:295`:

```sql
INSERT INTO cards
  (id, name, key, codename, left_id, right_id, current_revision_id,
   created_at, updated_at, creator_id, updater_id,
   read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
VALUES (${NEW_CARD_ID_SQL}, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
```

**The inserted row's id is not a bound argument.** It is the
`NEW_CARD_ID_SQL` expression, which SQLite computes ("the id is the
AUTOINCREMENT one unless history rows already name that id or a later one").
So the driver cannot know which id the inserted row will take, cannot
contradict an id pin, and cannot prove that a read pinned to `id = X` is
unaffected: the inserted row could take id X.

`docs/reports/receipts/size-insert-pinning-narrowing.mjs` sizes it from the
receipt: the reads the four inserts invalidate that an INSERT-pinning rule
would have to keep number **21, and every one of them is pinned to `id`**:

```
insert at 227: 9 candidates   insert at 277: 2 candidates
insert at 392: 10 candidates  insert at 441: 0 candidates
TOTAL memo hits an INSERT-pinning rule would have to keep: 21
by pinned column: id=21
```

The inserts do assign `name`, `key` and `codename`, so a read pinned to one of
THOSE would be provably disjoint, but the save has no such read after an
insert. **The INSERT case is worth 0 POSTs for this save.**

**Named dead end, with the measurement.** Closing it would need the driver to
know the id the insert will take, which is a property of the history's id
allocation, not of the statement.

## 10. Where this leaves the save path

| rung | verdict |
|---|---|
| whole-deck universe walk -> per-key walk (7f881f7b) | landed: 5 -> 0 walks |
| keep the composed-name memo across writes (a8ee2c7d §9.2/9.3) | **dead**: 484 -> 484 POSTs |
| narrow the transaction read memo to rows (a8ee2c7d §7.1) | **landed: 484 -> 461 POSTs** (ca52e27d) |
| **batch the walk's independent seed reads (a8ee2c7d §5)** | **landed this round: 461 -> 439 POSTs, 7 -> 4 round trips per walk** |
| cache the preference index (a8ee2c7d §7.2) | untouched: 7 occurrences at 14-15 ms, the largest single statement wall, and a follow-semantics change (it claims two documented expiry events) |
| the read memo's INSERT case (§9 above) | **dead, measured**: the inserted id is computed, not bound |
| the ladder instrument never exits (§2.1 above) | **named, worked around** (`tools/run-save-statement-ladder-to-completion.mjs`); the shared tool is untouched and still needs its owner to fix it |

The save is now **439 POSTs**, 87.5% of them single-statement. The remaining
single-statement POSTs are the dependent chains (the rule candidates' card
rows, their junctions, their lex lookups), where the next statement's
arguments are the previous statement's answer. Batching those means
restructuring the callers into a batched resolution, which is a bigger rung
than this one and needs its own parity argument.

Two things the measurements still name, not taken here: the preference index
(7 POSTs, 15 ms, the largest single statement wall) and the candidate
resolution's dependent chain (the 70 + 55 + 35 + 30 + 26 + 22 single-statement
POSTs above, which no memo can absorb because each is a first read of a
distinct row).

## 11. What this cost the disk, and what it left behind

| | bytes |
|---|---:|
| added to the repo (18 files, of which 8 are ladder receipts) | 2,894,869 |
| removed from the repo | 0 |

The 2.9 MB is 2.6 MB of ladder receipts (six plain runs, two per-POST
attributions) plus ~20 KB of the two ladder tools, the three pricing
instruments and this report. The receipts are the evidence for every number
above, and the house convention already carries 8.6 MB of them.

**Residue this round left, named with its size:**

| what | size | who reclaims it |
|---|---:|---|
| `C:/localProjects/decko-ts-savepath-rung4-20261020` (this lane's worktree, branch pushed) | 739 MB | the diskSteward worktree sweeper, on the lease `create_worktree.py` wrote |
| `C:/localProjects/decko-ts-savepath-rung4-baseline-20261020` (the BEFORE tree, branch unpushed) | 697 MB | the same sweeper |
| seven one-off analysis scripts in the lane worktree's gitignored `tmp/` (`attribute-posts.mjs`, `attribute-solo-posts.mjs`, `attribute-walk.mjs`, `dump-save-segment-tail.mjs`, `profile-save-segment.mjs`, `save-ladder-with-post-attribution.mjs`, `size-insert-narrowing.mjs`) | 41 KB | the same sweeper, with the worktree |

Nothing was deleted by hand: the machine's delete gate requires the operator's
per-turn approval, which this round did not have, and the scratch scripts
live in gitignored `tmp/` inside a worktree the sweeper reclaims. Three of the
seven have a permanent home now (the three pricing instruments under
`docs/reports/receipts/`), and the rest produced findings that are in this
report.

