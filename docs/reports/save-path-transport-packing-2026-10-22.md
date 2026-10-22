# The transport packing: the driver's admission rule and the card block's speculative prefetch (2026-10-22)

Implements the transport packing that
`docs/reports/live-save-transport-design-2026-10-18.md` (sections 3 and 5)
names: the driver-side admission rule, and a speculative prefetch of each card
block's constant-id reads that falls back to the blocking path on a miss.

Branch `port/savepath-transport-packing-20261022`, base 6cdf1704 (the
save-path family's landed tip), worktree
`C:/localProjects/decko-ts-savepath-packing-20261022`.

## 1. Headline

| | |
|---|---|
| The design's named precondition (the one-line probe) | **PROVEN, not assumed** — the 17 SQL-internal write-backs ARE free on the hrana/bunny shape, and the admission rule's binding clause is load-bearing |
| The mechanism | **landed**: the driver's admission rule, the speculative prefetch, the blocking-path fallback, and the insert pin that keeps a prefetched row alive across a card creation |
| The graded save | **439 -> 437 pipeline POSTs** (666 -> 771 statements) |
| **The target (about 175, accept 200 or below)** | **NOT MET.** The measured number is 437. The difference is named and mechanized in section 6: the speculation reached ONE card block of the save's ~129, and the save does not hold the other blocks' card ids in one place |
| Equivalence | unchanged and re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented**; 1,489 rule-shaped, 0 wrong |
| Green suites | **none turned red** (section 5) |

**The target is not met, and the number that IS met is 437.** Nothing here
claims otherwise. Section 6 names exactly which 237 round trips are missing
and why a declaration at the card-block seam cannot reach them.

## 2. What ran

```
node tools/probe-hrana-writeback-batch-20261022.mjs --out tmp/probe-hrana-writeback-20261022.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-BEFORE-packing-20261022.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-AFTER-packing-20261022-final.json
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/permissions/
npx vitest run tests/card/actions/
npx vitest run tests/card/drivers/
npx tsc --noEmit
```

**The BEFORE tree is this same worktree at 6cdf1704 with no change of any
kind** (the ladder's own before-run, same machine, same session, same serving
deck): **439 POSTs, 666 statements**. The AFTER run is the same tree with
this commit's changes: **437 POSTs, 771 statements**.

## 3. The precondition the design refused to ship without

The design's last section: "`last_insert_rowid()` inside a packed
hrana/bunny batch is ASSUMED, not verified: the 17 SQL-internal write-backs
are counted as free on that shape because a batch runs in order on one
connection. A one-line probe ... would settle it, and the design should not
ship without it."

`tools/probe-hrana-writeback-batch-20261022.mjs` is that probe, and it also
probes the two neighbouring claims the design rests on, because a probe that
answers one question and leaves the adjacent ones untested is not evidence.

| arm | question | measured |
|---|---|---|
| 1 | `SELECT last_insert_rowid()` after an INSERT, in ONE pipeline POST against THREE | the SAME rowid in both (1), and it is the INSERT's rowid |
| 2 | a write whose value comes from an earlier statement in the SAME batch (`INSERT ... VALUES ((SELECT MAX(id) FROM t))`) | the child's value IS the parent's rowid (1) |
| 3 | a statement that BINDS a value produced inside the batch | it CANNOT see it: 0 rows, although the row exists on the same connection |

**Verdict: the 17 SQL-internal write-backs ARE free on the hrana/bunny shape,
and the admission rule's binding clause is load-bearing.** Arm 3 is the
mechanism the whole rule rests on: the bound value is fixed when the request
is sent, so a value produced inside the batch can never reach the statement
that binds it.

**WHERE THE PROBE RAN, AND WHERE IT DID NOT.** The probe runs on the local
Hrana endpoint (`tools/edge-signed-in-exercise/lib/local-hrana.mjs`), which
speaks the same Hrana v2 wire protocol the Bunny and libSQL endpoints speak
(POST /v2/pipeline, tagged args, a baton that keeps a stream open) and
answers it from one better-sqlite3 connection. That is the shape the design
calls "hrana/bunny". **The hosted Bunny service was NOT contacted**: its
database is the live deck and the probe WRITES. The receipt says so in its own
fields (`hosted_bunny_contacted: false`).

The design's assumption therefore STANDS, and the admission rule and the
speculation are both landed.

## 4. What landed

### 4.1 The driver: the admission rule and the speculative prefetch

`src/card/drivers/bunny-db.ts` gains `prefetchReads(statements)`, and
`src/server/driver.ts` gains the same method as an OPTIONAL member of
`SQLDatabaseDriver` (an adapter that does not implement it leaves the
caller's reads on the ordinary path).

THE ADMISSION RULE, as the design states it: **a statement joins the open
run iff it binds no value produced inside that run, and the run is within the
cap.** The driver implements it in three parts:

1. **THE CAP** (32 statements, 512 KiB) splits the declared set into runs
   before they are sent.
2. **THE VERIFICATION** decides what the run may KEEP. The run's own value
   flow is known only after the run has run, so the rule is applied to the
   flow the run produced: a statement that bound a value an EARLIER statement
   IN THAT RUN produced cannot have been answered correctly, so it is not
   remembered, and the caller's own read of it takes the blocking path, at
   the caller's own sequence point.
3. **"PRODUCED INSIDE THAT RUN" IS NARROWER THAN "THE VALUE APPEARS IN A
   ROW THIS RUN RETURNED"**, and this is the part that makes the rule usable.
   A value the transaction produced BEFORE the run was already in the
   caller's hands when the run was built, so binding it is not a dependency.
   The driver keeps the transaction's produced values for exactly this
   reason. Without it the rule reads every coincidence as a dependency: the
   save's block prefetch reads a card row and then binds that card's TYPE
   id, which the same row also carried as a cell -- and the type id was
   known long before the block started.

**ONLY READS ARE SPECULATED.** A write's effect cannot be taken back, so a
prefetched set that carries one is refused for that statement alone. The
prefetched answers go into the transaction's read memo under the key the
caller's own read of the same statement uses, so the caller's read is a memo
hit and reaches no wire at all; the memo's invalidation rules still apply,
so a write that lands after the speculation drops the prefetched answer and
the caller's read goes to the wire (the blocking path) rather than serving a
stale row.

**A prefetch outside a transaction does nothing**: there is no memo to hold
the answers, so a speculative round trip would be wasted.

### 4.2 The insert pin: an INSERT is pinned by the row it took

The transaction read memo dropped EVERY memoized card row when the save
created a card: the create's `INSERT INTO cards` has no WHERE clause, so the
row-scoped narrowing could not apply to it, and one such INSERT dropped 271
memo entries (measured, section 6.2). The family named this as a dead end
("the inserted row's id is the NEW_CARD_ID_SQL expression, which SQLite
computes, so the driver cannot know which id the insert takes").

**THE DRIVER DOES KNOW WHICH ROW AN INSERT TOOK**: the execute result
carries the rowid the insert took. So an INSERT is now pinned by that rowid,
and the disjointness rule works on it as it works on an UPDATE: a read
pinned to a different id survives, the read of the inserted row itself does
not, and a read pinned to some OTHER column (a key, a left/right pair) still
falls to the conservative rule, because an insert CAN create a row that
matches such a predicate. The pin applies only to a SINGLE-row insert (the
rowid a result reports is the LAST row an insert took), and only on the
single-statement path, where the result is back before the next statement
runs.

### 4.3 The engine: the card block's prefetch, and the seams it found

`src/card/actions/card-action-engine.ts` gains `prefetchSubcardBlock`, called
from `saveSubcardsInWriter` before the block's loop: the block's names are
resolved by the Lexicon in two phases (the simple names' key lookups, then
the compound names' junction lookups -- the compound lookup binds its sides'
ids, which the first phase produced, so the two cannot share a batch), and
the rows those ids name are prefetched in the deck's three read-by-id shapes.

`src/card/fetch/lexicon.ts` gains `prefetchIds`, which owns the Lexicon's own
lookup shapes, so the prefetched statement is byte-for-byte the statement
`lexToId` would have issued (a different string would not share the memo's
key, and the prefetch would buy nothing).

`src/card/fetch/card-read-shapes.ts` (new) names the deck's three read-by-id
shapes once, so the prefetch and the readers use the same strings.

`src/card/one-trip/replay-plan-router.ts` forwards the prefetch to the driver
it wraps -- the engine never talks to the driver directly, and a wrapper that
does not forward the new method silently disables the whole lever.

**WHERE THE SAVE'S READS COME FROM** (measured by attributing every
single-statement read of the graded save to its engine seam, with the stack
captured at the driver and mapped back to source through the bundle's
sourcemap; the receipt's instrument is not landed, but the numbers are):

| engine seam | reads |
|---|---|
| `card-action-engine.ts` `fetchRowById` (`SELECT * FROM cards WHERE id = ? LIMIT 1`) | 129 |
| `mod-event-state-sources.ts` `codenameOfId` (`SELECT codename FROM cards WHERE id = ?`) | 92 |
| `lexicon.ts` `cacheFetch` (the name lookups: the junction, the key, the name triple) | 97 |
| `set-read-rule.ts` `fetchCardsRow` and `cardName` | 56 + 22 |
| `fetch/retrieve.ts` (the key arm and the live row) | 30 + 22 |
| `notify/follower-resolver.ts` | 21 + 14 + 7 + 7 + 7 |

## 5. The gates

**EQUIVALENCE, re-proven on this commit** (`tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`, the serving deck at
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`):

```
deck ...: 19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous (0 rule-shaped)
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys: 1489 checked, 0 wrong
```

**THE BATTERY ON THE TOUCHED FILES** (`npx vitest run`):

| suite | result |
|---|---|
| `tests/card/drivers/` | **6 files passed, 34 passed \| 15 skipped (49)** -- the 6 are this lane's new prefetch test file plus the family's 5; NO GREEN SUITE TURNED RED |
| `tests/card/actions/` | **1 file failed \| 40 passed (41 files); 5 failed \| 567 passed (572 tests)** -- the 5 are `atomic-saves.test.ts` "MySQL 8.4 (native)", the family's known failure set (no MySQL server on this machine), unchanged |
| `tests/card/permissions/` | 24 files, 20 passed \| 4 skipped -- the 4 are the corpus-replay files that need `DECKO_TS_CORPUS_REPLAY=1` |
| `npx tsc --noEmit` | the same **3 pre-existing errors** in `tests/card/actions/write-path-races.test.ts` (the family's own baseline) and no new one |

**THE PREFETCH'S OWN CONTRACT** (`tests/card/drivers/bunny-db-transport-packing-prefetch.test.ts`, new):
a block's reads ride ONE pipeline POST and the caller's own reads of them
cost no execute; a statement that binds a value the run itself produced is
NOT answered from the run and the caller's read of it takes the blocking
path; a value the transaction produced BEFORE the run is not a dependency; a
write after the prefetch drops the prefetched answer for the row it wrote; a
prefetch outside a transaction does nothing; and a write is never speculated.

## 6. The gap, named and mechanized

### 6.1 The measurement

| | BEFORE (6cdf1704) | AFTER (this commit) |
|---|---:|---:|
| graded save, pipeline POSTs | **439** | **437** |
| graded save, statements | 666 | 771 |
| the prefetch's own statements | 0 | 112 (in 4 POSTs) |

**The target was "about 175 round trips, accept 200 or below". The measured
number is 437, so the target is NOT met.** The difference is 237 round trips,
and it is not a mystery: it is the card blocks the speculation never reached.

### 6.2 What the speculation reached, and what it did not

Instrumented counters on the same ladder run (the instrument is not landed;
the numbers are):

* the prefetch was declared **once** for the whole save: one block, 21
  subcards, 43 names, 29 ids, 112 statements sent in 4 POSTs, 112 answers
  remembered;
* the transaction's memo served **196** reads from the wire and **260** read
  statements still went to the wire;
* **487** memo entries were dropped by writes, of which **271 by one**
  `INSERT INTO cards` (the insert case, now pinned -- section 4.2) and 191
  by the id-pinned `UPDATE cards ... WHERE id = ?` writes, which drop the
  KEY-pinned name-lookup entries (an update that pins `id` is not provably
  disjoint from a read that pins `key`, so the conservative rule applies).

**THE MECHANISM OF THE GAP, in one sentence: the save's ~129 card blocks are
issued by ~20 engine sites, each of which learns the card's id at its own
moment (the validation walk's `typeNameOf`, the read-rule write path's
`cardName`, the fetch layer's retrieve path), so a declaration at the
card-block seam covers the block it is given and no other.**

The design's own words put the reach in the right place: "the ids are a
property of the deck, not of the previous result". For a card that EXISTS,
that holds, and the prefetch is exactly right: the block's 21 subcards' rows
and name resolutions are fetched before the engine asks, in 4 round trips
instead of ~60. For the save's OTHER cards, the id is the result of a
lookup the save does not hold in one place at one time, and a speculation
cannot name a row whose id it does not have.

**So the lever is right and the seam is too narrow.** The next lane's work is
named by the numbers above: the 58 first-occurrence card-row reads and the
137 name-lookup reads that still go to the wire are the addressable
population, and they are addressable only from a seam that holds the whole
save's card-id set -- the save's INPUT tree, whose names are all known at the
top of the save, and whose ids are the ids of the deck's type cards and
subcards. The measurement in section 4.3 says where those reads are issued.

## 7. The disk cost and the residue

```
added to the repo: 6 files changed, 629 insertions(+), 15 deletions(-)
  plus 3 new files: src/card/fetch/card-read-shapes.ts,
    tests/card/drivers/bunny-db-transport-packing-prefetch.test.ts,
    tools/probe-hrana-writeback-batch-20261022.mjs
removed from the repo: 0
residue: this lane's worktree (a worktree the diskSteward sweeper reclaims
  on its lease), node_modules/ (npm ci, 451 MB, gitignored), and the lane's
  gitignored tmp/ scratch (the ladder receipts, the probe receipt, and the
  lane-scratch-20261022/ directory holding the three throwaway diagnostic
  files this round used for the stack attribution)
```

The instrument this round used to attribute the save's reads to their engine
seams (a driver-side stack capture, a sourcemapped bundle, and a ladder
copy) was diagnostic only and is NOT landed: the shared ladder and the shared
bundle tool are byte-identical to their committed state, verified with
`git cat-file blob HEAD:<path>`.

## 8. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The
  hosted Bunny service was not contacted; the probe ran on the local Hrana
  endpoint.
- **The target was not met** (437, not 175 or 200). Section 6 names the
  difference and the mechanism.
- The engine's seam was widened ONCE (the card block). The measurement says
  where the remaining reads are issued; the widening that would reach them is
  the next lane's work, and this lane does not claim it.
- The prefetch's reach was measured with a temporary instrument that is not
  landed (section 7).
