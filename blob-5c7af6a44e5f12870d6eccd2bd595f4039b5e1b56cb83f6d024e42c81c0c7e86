# The composed-name path is not the save's cost any more (2026-10-20)

Follows `save-path-rule-candidate-per-key-walk-2026-10-20.md` (7f881f7b), which
routed `firstApplicableReadRule`'s five rule candidates to the per-key
composed-name walk and took the graded save's whole-deck universe walks from 5
to 0.

That report left one lever named, in its §9: *"The ladder's save ladder still
rebuilds per-key walks per write. The per-key walk is ~1 ms, so the remaining
91 ms of statement-exec is not rule resolution any more."* This round took that
lever, measured it, and found it does not exist. It also measured the unit every
report on this path has been missing — **round trips** — and found the composed-
name path is 3–4% of the save's round trips. The analysis lands; no production
change does.

Branch `perf/savepath-rule-resolution-20261020`, base and tip `7f881f7b`, worktree
`C:/localProjects/decko-ts-save-ladder-next-rung-7f881f7b`.

## 1. Headline

| | |
|---|---|
| The lever the last report named | **measured dead.** Keeping the composed-name memo alive across every invalidation moves the graded save **484 → 484 POSTs** |
| Round trips per cold save-shape walk | **7** — 4 seed reads, 1 lone-arm query, 2 arm batches (new measurement) |
| Best cut left in this path | batch the 4 independent seed reads into 1: **7 → 4**, about 3 POSTs off a 484-POST save |
| Why not landed | that is below the ladder's own run-to-run noise (430 ms vs 415 ms on two runs of equivalent work) |
| The save today | 484 POSTs, 689 statements, 430 ms db wall, 111 ms statement-exec, **0 statements ≥ 25 ms** |
| Equivalence | unchanged and re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented** |

## 2. What ran

```
node tools/bundle-bunny-edge-engine.mjs
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-NEXT-BEFORE.json
npx vitest run tests/card/permissions/
npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ \
    tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts
npx tsc --noEmit
```

Receipts committed under `docs/reports/receipts/`.

**The BEFORE run measures the same tree the last round measured as its AFTER.**
`source` is `7f881f7b29c5…`, and `bundleSha256` is
`b274a6b6ab111f72096e2924bf2c0da4851da05df6a2a250d3dd2b12e878b54b` — the exact
bundle that report lists as its AFTER column. Its save segment reads **484 POSTs
/ 689 statements**, matching that report test for test. Only the milliseconds
differ (this machine ran ~13% faster). Every count below is therefore directly
comparable to the last round's table.

## 3. The save's shape now

| | |
|---|---:|
| pipeline POSTs | 484 |
| statements | 689 |
| db wall | 430 ms |
| statement-exec | 111 ms |
| **statement-exec as a share of db wall** | **26%** |
| statements ≥ 25 ms | **0** |
| statements that repeat an earlier `(sql, args)` in the same transaction | **230 of 689** |

**The save has no hot query left.** Every shape is under 25 ms; the largest is
`SELECT preferences.id AS rule_id, sets.id AS set_id, …` at 14 ms across 7
occurrences. The other 74% of the save's db wall — 319 of 430 ms — is not SQL
execution at all. It is the 484 round trips.

That is the whole shape of the remaining problem: **wall = hops × hop latency,
and the hops are what is left.** The block-batching report
(`save-path-block-batching-2026-10-18.md`) already states the live host's cost
at ~13 ms/hop, so 484 POSTs is where the save's time is.

## 4. The named lever, measured dead

§9 named two open items, and they are the same seam:

- §9.2 — the `expireRuleResolutionCache` blast radius is untouched; the memo is
  dropped wholesale at every write.
- §9.3 — the save rebuilds per-key walks per write, because of that.

**Upper-bound experiment.** `expireRuleResolutionCache`
(`src/card/permissions/read-rules.ts:1105`) deletes the whole per-driver entry.
I changed it to carry `composedNames` across the delete, so the memo survives
every invalidation forever. That is not a safe change and it was never intended
to land — it is the ceiling. **Any correct narrowing of that seam can only beat
zero.**

Same worktree, same deck, same journey, minutes apart:

| | BEFORE (7f881f7b, bundle `b274a6b6`) | UPPER BOUND (bundle `378edacb`) |
|---|---:|---:|
| pipeline POSTs | 484 | **484** |
| statements | 689 | 682 |
| db wall | 430 ms | 415 ms |
| statement-exec | 111 ms | 118 ms |

**Zero POSTs.** The lever is worth nothing, so §9.2 and §9.3 are both closed as
dead ends.

**Why the memo cannot help here, which the previous round left open.** The
per-key walk is not rebuilt because its answers are thrown away — it is rebuilt
because **the save asks about different keys each time**. The five candidates are
`ruleNamesForCard`'s output for the card being resolved, so each card in the save
brings its own key set. With an immortal memo the walk's statement counts did not
fall (seed reads 9 → 14, arm reads 66 → 59), which is the signature of a cache
that is being asked new questions, not re-asked old ones. Memoization is the
wrong instrument here for a reason that has nothing to do with invalidation.

The last report's §2 blamed `expireAfterWrite`'s wholesale drop. The drop is real
but it is not the cost.

## 5. The round trips, which nobody on this path had counted

Every report on this path has measured the walk in **milliseconds** (1.0–1.4 ms
per cold save-shape call) and the save in **statement counts**. Neither is the
currency the live host charges. A walk can be 1 ms of SQL and still cost seven
POSTs.

`tests/card/permissions/composed-name-walk-round-trip-census.test.ts` (new) drives
the shipped `resolveRuleIdsByComposedKeys` through a counting driver proxy on the
serving deck, in the graded save's own candidate shape, one cold driver per call —
because a save drops the memo at every write, so each walk is paid cold.

```
cold save-shape walk, 5 calls of 5 candidates (…/brandon-local-edit/deck.sqlite3):
  round trips:        35 total, 7, 7, 7, 7, 7 per call
  statements:         80 total
  seed reads:         20 statements, one round trip each
  arm reads:          60 statements in 10 round trips
  lone arm queries:   5
  other statements:   (none)
```

**One cold save-shape walk costs 7 round trips**, decomposed:

| | per call | why |
|---|---:|---|
| seed reads | 4 | one `driver.query` per segment level, and the levels are independent |
| lone-arm query | 1 | a level holding exactly one pair takes the `statements.length === 1` branch |
| arm batches | 2 | one `driver.batch` per level; levels cannot merge |

The `other statements: (none)` line is a result, not an omission: the whole-deck
universe's ambiguity fallback does **not** fire on this deck, so the narrow path
is genuinely narrow here and 7 is the real number.

**The one cut left in this path.** The 4 seed reads are mutually independent —
each is a pure `WHERE "key" IN (…)` over its own level's run list, and the walk
issues no writes, so hoisting them into a single `driver.batch` at the top of the
walk answers exactly the same rows at the same sequence point. That is the same
rule the block-batching report already applies. It takes the walk from **7 → 4
round trips**.

## 6. Why that cut is not landed

It is a correct ~43% cut **to a path that is 3–4% of the save's round trips**. The
ladder's own save segment shows the walk issuing 9 seed and 66 arm statements;
even a perfect cut removes roughly 3 POSTs of 484.

The ladder cannot resolve that. Two runs of equivalent work on this machine came
in at **430 ms and 415 ms** db wall — a 3.5% spread, which is ~15 ms, or about
seven POSTs. **The available win is smaller than the instrument's noise.** A
change whose entire effect cannot be distinguished from run-to-run variation is
not a measured improvement, and reporting it as one would be the exact failure
the last report avoided by stating its headline as a count.

So this round lands the measurement and the analysis, and stops. The cut is
named, sized, and specified above; it is a real improvement to the walk and worth
taking when it is bundled with a change big enough for the ladder to see.

## 7. Where the save's time actually is

Three things, largest first, all measured on this run.

### 7.1 The transaction read memo invalidates per TABLE, and the save writes to `cards`

**230 of the save's 689 statements repeat an `(sql, args)` pair already answered
earlier in the SAME transaction**, and 95 of those are `SELECT * FROM cards WHERE
id = ? LIMIT 1` — the single largest shape by count (161 total).

The memo already exists for exactly this (`src/card/drivers/bunny-db.ts:308`),
and it is dropping these anyway. Mechanism: `invalidateReadMemo`
(`bunny-db.ts:731`) computes the written statement's target table, unions it with
the tables that table's triggers write, and **deletes every memo entry depending
on any of them**. The invalidation is table-granular. The deck carries
`cards_bump_deck_data_version_{ins,upd,del}` triggers (verified against the
serving deck's `sqlite_master` this round), so a write to `cards` invalidates all
`cards` reads — and the save interleaves reads with its writes, so the repeats
keep arriving after every write.

A row-granular narrowing is the lever: a PK-seek read depends on exactly
`(table, id)`, and a write restricted to one row by primary key changes exactly
that row. It is the biggest remaining win by wall, and it is **not in this rung's
scope** — it changes read consistency inside the shared driver, the file's own doc
warns that "unknown is treated as unsafe; a rule that guessed would be a cache
that silently answers with a stale row," and the composed-name equivalence
argument does not cover a change that does not touch composed-name resolution.

### 7.2 The preference index is rebuilt per resolution, and Ruby caches it

`SELECT preferences.id AS rule_id, sets.id AS set_id, …`
(`src/card/notify/follower-resolver.ts:288`) is **7 occurrences at 14 ms — the
save's largest single statement wall, 12.6% of statement-exec.** It is a
seven-way self-join on `cards`, issued by `preferenceRows` from
`stashDirectFollowers`, which calls it with no memo on every walk.

**This is a documented, deliberate remainder, not an oversight.**
`src/card/mod-loader/mods/card-mod-follow.ts:1371-1383` states it: *"Ruby caches
follower ids and the preference index and expires them on these saves. The port
keeps NO follower cache … preferenceRows (:279) issues the preference SQL on every
resolveFollowers (:480) walk, and the module holds no state across calls."* Its
two expiry events are declared `event()` — **named remainders** — precisely
because no engine code implements a cache-expiry step there.

Landing a cache there is therefore not a perf edit: it means claiming ownership
of those two events, converting them to `engineOwnedEvent()`, and accepting the
follow-semantics consequence that the port would then own an invalidation step
it does not have today. That is a real rung, with its own parity argument and its
own battery. It is not this one.

### 7.3 Nothing else is close

The next six shapes in the save are 13 ms, 9 ms, 8 ms, 6 ms, 5 ms and 5 ms. No
statement is individually worth attacking any more.

## 8. Equivalence

Re-proven on this commit, unchanged production source, through the shipped
functions against the serving deck (read-only):

```
deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3:
  19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys:   1489 checked, 0 wrong
save-shape cost, 5 cold calls of 5 candidates each:
  whole-deck walk: 110.6, 101.1, 102.2, 109.7, 106.8 ms  (total 530.4 ms)
  per-key walk:    1.5, 1.2, 1.1, 1.1, 1.4 ms            (total   6.3 ms)
  ratio: 84.2x
```

**19,469 checked, 0 wrong, 0 missing, 0 invented.** The whole composed-name
population, not just the rule-shaped subset. 0 ambiguous keys means the
whole-deck fallback never fires, so the 84.2× is undiscounted.

No production code changed this round, so this is a re-verification of the landed
equivalence rather than a new proof — which is the honest description of it.

## 9. Tests run

| suite | at 7f881f7b (last report's column) | this round |
|---|---|---|
| `npx vitest run tests/card/permissions/` | 19 passed \| 4 skipped (23 files), 191 passed \| 8 skipped (199 tests) | **20 passed \| 4 skipped (24 files), 192 passed \| 8 skipped (200 tests)** |
| `npx vitest run tests/card/actions/ tests/card/conformance/ tests/card/history/ tests/server/write-routes*.test.ts tests/hosted/hosted-write-path.test.ts` | 1 failed \| 61 passed (62 files), 5 failed \| 762 passed (767 tests) | **1 failed \| 61 passed (62 files), 5 failed \| 762 passed (767 tests)** |
| `npx tsc --noEmit` | 3 errors | **3 errors, identical** |

**No green suite turned red.** The permission suite's +1 file / +1 test is this
round's census. The write suite is identical test for test.

The 5 write-suite failures are `tests/card/actions/atomic-saves.test.ts`, all
`AssertionError: expected Error: Table 'atomic_1.sqlite_master' does not exist to
be an instance of InjectedFailure` — no MySQL server on this machine, so the
adapter fell back to SQLite. Pre-existing at this commit and in a file this round
does not touch.

The 3 typecheck errors are `tests/card/actions/write-path-races.test.ts` lines
132, 526, 526 — the same file and lines as the last report.

## 10. Where this leaves the save path

| rung | verdict |
|---|---|
| whole-deck universe walk → per-key walk (7f881f7b) | landed: 5 → 0 walks, 460 ms of statement-exec removed |
| keep the composed-name memo across writes (§9.2) | **dead** — 484 → 484 POSTs |
| stop rebuilding per-key walks per write (§9.3) | **dead** — same experiment; the keys differ per call, so no memo helps |
| batch the walk's independent seed reads (§5) | correct, 7 → 4 round trips, **not landed**: ~3 POSTs, below ladder noise |
| narrow the transaction read memo to rows (§7.1) | the biggest remaining win; different subsystem, different correctness argument |
| cache the preference index (§7.2) | the save's largest statement wall; a named remainder whose fix claims two events' ownership |

The composed-name path is now **closed as a perf lever**. It is 1 ms of SQL and
7 round trips per cold call, and the ladder says the save's remaining time is 484
round trips of which it owns a few percent. Further work here should be justified
by render-path round trips, where the same walk runs far more often, not by the
graded save.
