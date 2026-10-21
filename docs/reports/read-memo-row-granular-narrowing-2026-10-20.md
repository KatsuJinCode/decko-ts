# The read memo's row-granular narrowing: 484 -> 461 POSTs on the graded save (2026-10-20)

Takes the lever the last census left open and named as out of its own scope.
`composed-name-path-round-trip-budget-and-the-real-save-cost-2026-10-20.md` §7.1
(a8ee2c7d) measured the save's largest remaining structural cost and declined it
because it "changes read consistency inside the shared driver." This round took
it, and the correctness argument turned out not to need anything the driver did
not already have.

Branch `perf/savepath-read-memo-row-scope-20261020`, base and tip a8ee2c7d plus
this commit, worktree
`C:/localProjects/decko-ts-savepath-read-memo-row-scope-20261020`.

## 1. Headline

| | |
|---|---|
| The lever §7.1 named | **landed.** The transaction read memo invalidates per TABLE, so a write to `cards` discarded the memoized reads of rows that write had no bearing on |
| The graded save | **484 -> 461 POSTs, 689 -> 666 statements**, deterministic: three independent runs, identical POST count, statement count and statement sequence |
| Where it came from | two shapes only — `SELECT * FROM cards WHERE id = ? LIMIT 1` 161 -> 144, `SELECT codename FROM cards WHERE id = ?` 32 -> 26 |
| Writes | **0 changed.** The narrowing removes reads only, which is the only thing a memo rule is allowed to do |
| db wall | 474 ms -> 411 / 430 / 436 ms on three AFTER runs. The AFTER runs span 25 ms among themselves, so the wall cannot carry the claim; **the claim rests on the counts, not the milliseconds** |
| Equivalence | unchanged and re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented** |
| Green suites | **none turned red.** Permission and write columns identical to a8ee2c7d's own table |

For scale: §6 of the census declined a correct 3-POST cut as smaller than the
instrument's noise. This one is 23 POSTs, and POST and statement counts do not
drift run to run — they are the currency this path can actually prove in.

## 2. What ran

```
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-ROWSCOPE-BEFORE.json
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-ROWSCOPE-AFTER.json
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-ROWSCOPE-AFTER2.json
node tmp/measure-row-scope-lever-on-recorded-save.mjs tmp/save-ladder-ROWSCOPE-BEFORE.json
npx vitest run tests/card/drivers/
npx vitest run tests/card/permissions/
npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ \
    tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts
npx tsc --noEmit
```

Receipts under `docs/reports/receipts/`.

**The BEFORE run measures the census's own tree.** `source` is `a8ee2c7da580…`
and `bundleSha256` is `b274a6b6ab11…` — the same bundle the census lists as its
BEFORE column — and its save segment reads 484 POSTs / 689 statements, matching
that report statement for statement. Only the milliseconds differ.

## 3. The mechanism, and the part the census got right to worry about

`invalidateReadMemo` (`src/card/drivers/bunny-db.ts:747`) computes the written
statement's target table, unions it with the tables that table's triggers write,
and deletes every memo entry depending on any of them. The invalidation is
table-granular. The deck carries `cards_bump_deck_data_version_{ins,upd,del}`,
so a write to `cards` really does change `deck_data_version`, and every read of
`cards` dies with it — including the reads of rows the write never touched.

The save interleaves reads with its writes, so those repeats kept arriving.
Measured on the serving deck, `SELECT * FROM cards WHERE id = ? LIMIT 1` is
issued 161 times over **66 distinct ids**, and the id written first (393) is
also the second-most-read id. The most-read id, **4**, is not among the rows
this save writes — and after the change it is read 15 times but executed 5.

Per-id, from the two ladder receipts. This is the whole shape of the win:

| read id | BEFORE | AFTER | among the writes? |
|---|---:|---:|---|
| 4 | 15 | **5** | no |
| 393 | 8 | 7 | yes — loses exactly one, the write to that row |
| 431 | 2 | 1 | yes |
| 3 | 5 | 4 | no |
| 2259 / 26026 / 6547 | 3 each | 2 each | no |
| 439 | 3 | 2 | yes |
| 47 (`SELECT codename …`) | 4 | 1 | no |

This save writes seven `cards` rows by a single-row `UPDATE` whose id the
receipt lets us read — 393, 431, 439, 791, 792, 1743, 3057. Four further
`cards` writes cannot be resolved from the receipt at all, because the ladder
truncates statement args at 4000 characters and those four bind a card body or
a long `id IN (…)` list. So "id 4 is never written" is bounded by that: it is
absent from every write the receipt can name, and the ten reads of row 4 that
this change turned into cache hits are themselves proof that no write to row 4
occurred at those points.

### 3.1 The schema check that decided the design

The obvious implementation — "a PK seek names one row, so scope the memo to
rows" — **is not available on this deck.** The serving deck's `cards`:

```
CREATE TABLE cards ("id","name","key",…,"db_content")
PRAGMA table_info(cards):  pk=0 on every column
indexes on cards: cards_key_index, index_cards_on_left_id_and_right_id,
                  cards_codename_index, cards_name_index, cards_type_id_index, …
```

There is no PRIMARY KEY and no unique index on `id`. A row-granular rule built
on "this read found one row" has nothing to stand on here, and the census's
caution about touching read consistency inside the shared driver was aimed at
exactly this.

### 3.2 The rule that does not need it

What survives is weaker than uniqueness and sufficient anyway: **disjointness of
two predicates**. If a read's WHERE pins column `c` to `v` and a write's WHERE
pins the same column `c` of the same table to a different value `v'`, then no row
satisfies both, the write changes no row the read's predicate admits, and the
read's answer cannot change. Scan order, `LIMIT`, and how many rows happen to
share a value are all irrelevant: disjointness is a property of the two
predicates, not of the data. That is why it needs no schema at all.

`disjointFrom` (`src/card/drivers/bunny-db.ts:1502`) takes the entry when, and
only when, all three hold:

1. **Same table.** Otherwise nothing follows about the other relation.
2. **The write's SET list assigns none of the columns the read's WHERE names.**
   This is the clause that carries the weight. `v = 'free'` and `v = 'three'`
   are disjoint on their face, but `UPDATE t SET v = ? WHERE v = ?` moves a row
   *into* the read's predicate. Comparing WHERE clauses alone would serve a
   stale row forever. It is also what stops a write of `trash`, `left_id` or
   `codename` from being called disjoint — and the save's own
   `UPDATE cards SET type_id = ?, db_content = ?, trash = ?, … WHERE id = ?`
   assigns `trash`, so that one correctly keeps the table-scoped behaviour.
3. **They pin the same column to different values.**

Anything the rule cannot prove keeps today's behaviour: a read naming two
tables is never pinned (an ambiguous column name), an `INSERT` has no WHERE so
it is pinned to nothing, a `WHERE` with a parenthesis, an `OR`, an `IN`, a
`LIKE` or an `IS NULL` is not a conjunction of comparisons and is not pinned,
and any statement the classifier does not recognize still drops the whole memo.

## 4. What it cost to be wrong about this

The instrument that sized the lever produced two wrong numbers before it was
sound, and both wrong numbers looked like wins:

| | claim | what was actually wrong |
|---|---|---|
| first attempt | replaying the memo over the ladder receipt | the receipt records only memo **misses**, so replaying applies the cache a second time. Emitted 644 against a recorded 689 |
| second attempt | 227 of 689 statements absorbed (33%) | the write loop pushed `table` and the check read `w.target`; every write read as `undefined`, i.e. "unrelated table", so nothing was ever treated as an invalidation |
| after two corrections | 12 statements absorbed | **not an error — this is the instrument's sound output**, and it is a lower bound |

The two corrections were: the save segment is not one transaction, so 212 of its
689 statements sit **after** `COMMIT`, where nothing is memoized at all and no
change to the memo's rules can ever absorb them; and a read whose tables could
not be named is stored with `dependsOn === null` and dropped by *every* write,
not treated as unrelated to every table.

The number finally worth quoting was never from the instrument. It came from
running the ladder before and after. The instrument said 12 and the shipped rule
delivered **23**, because the rule is more general than the primary-key scope
the instrument modelled — and the instrument cannot see quoted identifiers,
`id IN (…)` writes, or a literal conjunct that the rule reads as a pinned
column. The instrument is kept as
`docs/reports/receipts/measure-row-scope-lever-on-recorded-save.mjs` because its
transaction-bounded arithmetic is still what shows all 23 removed statements are
**inside** the transaction (`COMMIT` moves from statement 476 to 453) rather than
after it.

## 5. Measurement

| | BEFORE (a8ee2c7d, bundle `b274a6b6`) | AFTER run 1 (bundle `be0dc22c`) | AFTER run 2 | AFTER run 3 |
|---|---:|---:|---:|---:|
| pipeline POSTs | 484 | **461** | **461** | **461** |
| statements | 689 | **666** | **666** | **666** |
| db wall | 474 ms | 411 ms | 430 ms | 436 ms |
| statement-exec | 126 ms | 122 ms | 134 ms | 132 ms |
| statements ≥ 25 ms | 0 | 0 | 0 | 0 |

All three AFTER runs emit the **identical statement sequence** from the
identical bundle, so the counts are a property of the change and not of the run.
Run 3 was taken on the exact tree this commit carries, after the mutation
experiments were reverted, so the measurement is of what is being landed.

On the wall: 474 -> 411 / 430 / 436. The AFTER runs span 25 ms among themselves,
which is larger than the smallest of the three improvements — this machine's
round-trip noise is real and the census's refusal to claim a 3-POST cut on wall
time was the right call. The wall moved the right way on all three runs, and the
claim that can actually be defended is the count: **23 POSTs and 23 statements,
reproduced three times.**

Shapes that changed, and nothing else:

| shape | BEFORE | AFTER |
|---|---:|---:|
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | 161 | 144 |
| `SELECT codename FROM cards WHERE id = ?` | 32 | 26 |

**Net change among non-read statements: 0.** The other three journey segments
are byte-identical (`19/19`, `12/102`, `11/86`), so the change is confined to
the write path and did not leak into sign-in or either render.

On the wall numbers: 474 -> 411 and 474 -> 430 is a real move in the right
direction on both runs, and it is also the same order as this machine's own
run-to-run spread. Stating the win as a count is the honest form of the claim,
and the count is exact.

## 6. Tests

| suite | at a8ee2c7d | this round |
|---|---|---|
| `npx vitest run tests/card/permissions/` | 20 passed \| 4 skipped (24 files), 192 passed \| 8 skipped (200 tests) | **identical** |
| `npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts` | 1 failed \| 61 passed (62 files), 5 failed \| 762 passed (767 tests) | **identical** |
| `npx vitest run tests/card/drivers/` | 5 passed (5), 26 passed \| 15 skipped (41) | 5 passed (5), **27 passed** \| 15 skipped (42) |
| `npx tsc --noEmit` | 3 errors | **3 errors, identical** |

**No green suite turned red.** The 5 write-suite failures are
`tests/card/actions/atomic-saves.test.ts`, MySQL 8.4 (native), with no MySQL
server on this machine. The 3 typecheck errors are
`tests/card/actions/write-path-races.test.ts` lines 132, 526, 526.

### 6.1 Mutation-tested, because a green test proves nothing on its own

A test that passes with and without the change is not evidence. Each guard was
disabled in turn and the suite re-run:

| mutation | what went red |
|---|---|
| `disjointFrom` returns false always | the 2 tests that assert the narrowing fires |
| drop the SET-assignment clause | `still drops the entry when the write ASSIGNS the column the read pins` — and only that one |
| drop `normalizeIdentifierQuotes` | `sees a double-quoted key column, which the classifier normalizes first` — and only that one |
| drop the trigger-widened guard | **nothing.** The guard was unreachable, and it was removed rather than left in place looking load-bearing |

The mock Hrana server runs real better-sqlite3, so a stale memo surfaces as a
wrong answer rather than a shape mismatch. The suite's own claim — that a
write to a different row is now table-scoped-away — replaced a test that
previously asserted nothing at all while documenting the opposite rule.

## 7. Equivalence

Re-proven on this commit through the shipped functions against the serving deck
(read-only):

```
deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3:
  19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys:   1489 checked, 0 wrong
```

**19,469 checked, 0 wrong, 0 missing, 0 invented.** The whole composed-name
population, not the rule-shaped subset. 0 ambiguous keys means the whole-deck
fallback never fires, so the number is undiscounted.

This change cannot move composed-name resolution: it does not touch read rules,
does not change which statements are issued for any query that is not a repeat,
and cannot serve a memoized answer for a row a write changed. The equivalence
run is a re-verification, not a new proof, and that is the accurate description
of it.

## 8. Where this leaves the save path

| rung | verdict |
|---|---|
| whole-deck universe walk -> per-key walk (7f881f7b) | landed: 5 -> 0 walks |
| keep the composed-name memo across writes (§9.2/9.3 of 7f881f7b) | **dead** — 484 -> 484 POSTs |
| batch the walk's independent seed reads (§5 of a8ee2c7d) | correct, 7 -> 4 round trips, still not landed (~3 POSTs) |
| **narrow the transaction read memo to rows (§7.1 of a8ee2c7d)** | **landed: 484 -> 461 POSTs, 666 statements, deterministic** |
| cache the preference index (§7.2 of a8ee2c7d) | still the save's largest single statement wall; untouched here |

The save is now 461 POSTs. Its shape is unchanged in kind: no statement is over
25 ms, and the remaining wall is still hops. Two things the measurements name
and this round did not take: the walk's independent seed reads (3 POSTs,
correct, too small alone), and the preference index (7 occurrences at 14 ms,
the largest single statement wall) — which is a follow-semantics change, not a
perf edit, because landing it means claiming ownership of two documented expiry
events.
