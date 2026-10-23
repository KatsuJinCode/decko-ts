# The card-block declaration, reaching the other blocks: 374 -> 310 pipeline POSTs (2026-10-22)

Extends the transport packing's card-block declaration so that the
speculation reaches the card blocks the save issues, and repairs the
memo's invalidation so the speculation's answers survive the save's own
writes.

Branch `port/savepath-blocks-20261022`, base `b3a36b02` (the widened
declaration's landed tip), worktree
`C:/localProjects/decko-ts-savepath-blocks-20261022`.

## 1. Headline

| | |
|---|---|
| The graded save, pipeline POSTs | **374 -> 310** (a 64-POST, 17.1% reduction) |
| The graded save, statements | 807 -> 836 (the declaration's own statements are on the wire) |
| **The target (about 175, accept 200 or below)** | **NOT MET.** The measured number is 310. The difference is 110 POSTs, and section 6 names and mechanizes every population in it |
| Equivalence | re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented**; 1,489 rule-shaped, 0 wrong |
| Green suites | **none turned red**; the two memo guards this commit moved are re-pinned with the new contract, and two new guards were added (section 7) |

**The target is not met, and the number that IS met is 310.** Nothing here
claims otherwise. Section 6 names the 110 round trips that are still missing
and why the levers this lane reached cannot name them.

**THE HEADLINE FINDING IS A LATENT BUG, NOT A NEW LEVER.** The transport
packing's headline mechanism, the insert's row pin, had never run: two
regex literals in the landed driver carry a literal backspace byte (0x08)
where the word boundary was meant, so the pattern that recognises an
insert's VALUES clause never matched. The insert was therefore pinned to
nothing, every card creation dropped every memoized card row in the
transaction, and the lane that landed it measured the consequence (83 of
the save's reads) and named the wrong owner (the "conservative
invalidation"). Repairing the two bytes is most of this lane's win.

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-BASELINE-lane2-20261022.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-FINAL-20261022.json
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/ladder-B2attr-20261022.json
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/
npx tsc --noEmit
```

**The BEFORE tree is this same worktree at `b3a36b02` with no change of any
kind** (the ladder's own before-run, same machine, same session, same
serving deck): **374 POSTs, 807 statements**. The AFTER run is the same
tree with this commit's changes: **310 POSTs, 836 statements**.

The measurement is the local Hrana endpoint against the local copy of the
serving deck. The hosted Bunny service was NOT contacted: its database is
Brandon's live deck, and the metered-host law puts one batched confirmation
fetch at the end of a lane, not a measurement loop. This lane needed no
confirmation fetch, so none was made.

## 3. The mechanism: four changes, in the order they were made

### 3.1 THE INSERT'S ROW PIN, REPAIRED (the biggest win)

`src/card/drivers/bunny-db.ts` carries two regex literals whose word
boundary was written as a LITERAL BACKSPACE BYTE (0x08) instead of the two
characters `\` and `b`:

```
$ git show HEAD:src/card/drivers/bunny-db.ts | grep -n $'\x08' | cat -A
1596:  const values = /^HVALUES^H/i.exec(stripped);
1651:  const isInsert = /^INSERT^H/i.test(stripped);
```

(`cat -A` prints a backspace as `^H`.) The consequences are mechanical:

- `insertHasOneTuple` never matched, so `singleRowInsert` was ALWAYS false,
  so the insert's rowid pin (the packing lane's "THE INSERT PIN") was never
  built;
- `isInsert` was ALWAYS false, so `pinWrite` never took the insert branch
  at all.

**Every card creation therefore dropped every memoized read of the cards
table, on every table-scoped rule, for the whole transaction.** The
attribution (this lane's own instrument, section 4) measured 83 of the
save's reads dropped by four inserts.

The repair is the two bytes. With the pin alive, the save's card creations
stop dropping the reads they cannot affect.

### 3.2 THE INSERT'S OWN ROW: what the statement already says

An insert adds exactly ONE row, and that row's values are in the
statement's own VALUES clause: the key, the two sides, the codename and
the trash flag are all bound arguments there. The driver now reads that
clause (the column list and the tuple, `insertShapeOf`), and a memoized
read whose predicate the new row provably does NOT satisfy survives the
insert.

**THE PROOF, AND WHERE IT STOPS.** The read's predicate is a conjunction
of equalities (`predicateOf` declines anything it cannot read as one), and
the new row's value for each of those columns is either a bound argument
(the driver's own encoding) or a literal (a number or NULL; a quoted
string is blanked by `stripSqlNoise` and the whole predicate is declined).
If the new row's value for a conjunct DIFFERS from the conjunct's value,
the new row is not in the read's answer, and the insert changes no other
row, so the read's answer is unchanged. The rule stops where the new row's
value for a conjunct is NOT known (the column is not in the insert's
column list, so the column's DEFAULT applies, or the value is a SQL
expression): there the read is dropped, which is the safe direction.

**NO UNIQUENESS IS CLAIMED.** The rule compares values, not rows: the
read's answer changes only if the new row satisfies the read's predicate,
and that is a comparison of the row's own values.

**WHAT IT DID NOT FIX, AND WHY.** A read pinned to `id = ?` is still
dropped by an insert whose id column's value is a SQL EXPRESSION (the
save's new card id is computed by a subquery over the history tables), so
the new row's id is not known and the read cannot be proven unaffected.
That is 42 of the graded save's reads, and it is the same population the
rowid pin covers when the table's `id` column is the rowid alias (the
serving deck's canonical schema: `id INTEGER PRIMARY KEY AUTOINCREMENT`).
The local copy of the deck that this lane measured has a rebuilt `cards`
table with no declared types and no primary key, so on THAT copy the
rowid is not the id column and the rowid pin cannot name the new card's
id. The mechanism, and the copy's divergence from the canonical schema,
are named in section 6.3.

### 3.3 THE ROW-IDENTITY RULE: a write touches the row it names

A write that names the row it touches (its WHERE pins a column to a value)
touches only the rows matching that pin. A memoized read's ANSWER is a set
of rows the driver already holds, so the driver can check whether any of
them is one of the written rows.

**THE PROOF.** When the write assigns none of the columns the read's WHERE
names, no row can move into or out of the read's predicate (an assignment
is what moves a row), so the read's answer changes only if one of the
read's own rows is written. The written rows are the rows matching the
write's pin, and the read's result rows are known, so membership is a
comparison the driver can make. A read whose result does not contain the
written row keeps its memoized answer; a read whose result DOES contain it
is dropped; a read whose result cannot be compared (the result does not
carry the pinned column) is dropped.

**NO UNIQUENESS IS CLAIMED.** The pin characterizes the written rows (they
all carry the pinned value); the read's result rows are compared against
it. A row that matches the pin MIGHT have been written, so a match is
"affects" (the safe answer), and only a proven absence of matches is
"disjoint".

**WHY IT MATTERS HERE.** The save's store phase writes a subcard's content
and then reads other cards back (the subcard's type card, the deck's
standard cards). Those cards are not the written card, so the write cannot
have changed their answers, but the conservative rule dropped their
memoized answers anyway and the save paid a round trip per read.

### 3.4 THE DECLARATION, WIDENED: the shapes the readers actually use

`src/card/fetch/card-block-declaration.ts` names every shape the deck reads
a card by, and the declaration now declares all of them:

- **THE BY-KEY SHAPES** (the live row by key, the codename by key). The
  scope flags `byKey` and `byPair` were FALSE at both call sites, so the
  by-key and by-pair runs were DEAD CODE: the declaration only ever
  covered the by-id shapes. The fetch layer's key arm and the write
  routes' codename-by-key read are the by-key shapes, and the save reads
  them 30 and 55 times.
- **BOTH JUNCTION SHAPES.** The deck reads a junction by its two sides in
  two statements: the Lexicon's compound lookup asks for the id with
  `LIMIT 1` and no ORDER BY, the follower's junction read asks for it with
  `ORDER BY id LIMIT 1`. The declaration named the ordered one alone, so
  the Lexicon's own compound lookups (30 of them in the graded save) each
  cost a round trip.

A prefetch only answers a reader whose statement is IDENTICAL to the one
it prefetched, so a shape the declaration does not name is a read the save
pays a round trip for.

## 4. How the reads were attributed (the instrument)

This lane's own instrument: a temporary diagnostic in the driver recorded,
for every read that reached the wire inside a transaction, whether the
memo held an answer for it and WHY it did not (dropped by a write, with
the write named, or never declared at all). It is a diagnostic and it is
NOT landed: every instrumented file was restored before the commit, and
`git diff --stat` names only the files in section 8.

At the tip (374 POSTs) the instrument answered:

```
wire reads 314   dropped by a write 110   never declared 204
```

and named the droppers: an INSERT INTO cards 83, an
`UPDATE cards SET type_id, db_content, trash, left_id, right_id` 15, an
`UPDATE cards SET db_content, updated_at, updater_id` 8, an
`UPDATE cards SET updated_at, updater_id` 4.

## 5. The measurement

| | BEFORE (`b3a36b02`) | AFTER (this commit) |
|---|---:|---:|
| graded save, pipeline POSTs | **374** | **310** |
| graded save, statements | 807 | 836 |
| graded save, db wall (local Hrana) | 414 ms | 318 ms |
| distinct event-loop ticks | 374 | 310 |
| single-statement POSTs | 309 | 242 |

**THE STATEMENT COUNT ROSE BY 29 AND THE POST COUNT FELL BY 64.** The
declaration's own statements are on the wire (the prefetch is not free),
and they buy the reads they answer. On the hosted shape the design
measures the hop at 13 ms, so 64 fewer hops is 832 ms of wall, against
the local db wall's 96 ms of extra statement execution. **The local db
wall is the wrong number for this trade; the hop count is the one the
target names.**

## 6. The difference, named and mechanized

The target was "about 175 round trips, accept 200 or below". The measured
number is 310, so the difference is **110 round trips**. They are not one
population; they are four, and each has a mechanism.

### 6.1 The post-commit fan-out: 58 POSTs

The save's notification phase runs AFTER the commit, and the driver's read
memo is transaction-scoped: a prefetch outside a transaction has no memo
to hold its answers. The notification phase resolves the followers of each
saved card, and the resolution issues the SAME SEVEN READS per saved card
(the preferences read, the type read, the junctions, the junction contents,
the reference count): the parameters are identical across the eight saved
cards, and the trace shows them repeated verbatim.

**⇒ THE LEVER IS A BATCH AT THE FOLLOWER'S OWN LOOP**, or a memo that
outlives the commit. This lane did not build either, and the reason is
named rather than hidden: a memo that outlives the commit would serve the
notification phase a view of the deck that a concurrent writer had already
changed (Brandon's deck has real readers), and a follower could then not
be notified. **That is a visibility decision, not a transport one, and it
is the operator's to make.** The batch is sound and mechanical (the seven
reads of one resolution have known parameters), and it is the next lane's
work.

### 6.2 The store phase's type walk: about 40 POSTs

Per saved subcard, the store phase walks the deck's standard cards: the
subcard's own row, then the junction (card, standard card) for each link
of the walk, then the live row of the junction it names. The pairs are
(card, standard card) where the standard card is the one the walk's own
semantics names (`*self`, `*type`, `*structure`, `*right`), and the ids
are the deck's standard cards (3, 4, 5, 259, 264, 266, 273, 274, 317, 6543,
22281, 13229 on the serving deck).

**⇒ THE LEVER IS A DECLARATION THAT KNOWS THE WALK.** The declaration
already walks the type chain by id; it does not walk it by JUNCTION, which
is how the engine reads it. Teaching the declaration the walk's pairs is
engine semantics (which standard card pairs with which type), not a
mechanical change, and a wrong guess would declare junk (harmless, but
wasteful) and still miss the real pairs (costly). This lane measured the
walk and named it instead of guessing at it.

### 6.3 The reads a card creation still drops: 42 POSTs

A read pinned to `id = ?` is dropped by an insert whose id column's value
is a SQL expression (section 3.2). The serving deck's canonical schema
makes that column the rowid alias, so the insert's rowid pin names the new
card and the read survives; **the local copy of the deck this lane
measured has a rebuilt `cards` table with no declared types and no
primary key**, so the rowid and the id column are different sequences
there and the pin cannot name the new card.

**⇒ THIS IS A MEASUREMENT-COPY DIVERGENCE, AND IT IS THE ONE NUMBER THE
LANE'S LOCAL MEASUREMENT PAYS FOR.** On the canonical schema the 42 reads
are covered by the rowid pin and the local measurement understates the
lane's win by roughly that much. The fix is not in the save path: it is a
faithful copy of the serving deck (or a measurement that names the
divergence).

### 6.4 The rest: the name lookups and the per-card reads

The save's read-rule walk resolves the deck's standard card names ONE AT A
TIME (11 single-statement POSTs), and the notification phase reads each
saved card's row one at a time (9). Both are sets the engine holds at the
moment it asks, so both are declaration-shaped; neither is a lever this
lane reached.

## 7. The gates

**EQUIVALENCE, re-proven on this commit**
(`tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`,
the serving deck at
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`):

```
deck ...: 19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous (0 rule-shaped)
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys: 1489 checked, 0 wrong
```

**THE BATTERY ON THE TOUCHED SUITES**
(`npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/`):
see section 7.1.

**`npx tsc --noEmit`**: the same **3 pre-existing errors** in
`tests/card/actions/write-path-races.test.ts` (the family's own baseline)
and no new one.

### 7.1 The battery's result, and the two guards this commit moved

The battery's failures are the family's known failure set plus two guards
this commit MOVED, and both moves are stated here with their mechanism.

**THE KNOWN SET**: `tests/card/actions/atomic-saves.test.ts` "atomic saves:
MySQL 8.4 (native)" (there is no MySQL server on this machine). The
packing lane's receipt records the same five at the family tip.

**THE TWO GUARDS THIS COMMIT MOVED** (both are the memo's own contract
tests, and both moved because the behaviour they pinned was the behaviour
of the bug in section 3.1):

1. `bunny-db-transaction-read-memo.test.ts` "still drops the entry when
   the write ASSIGNS another column the read's WHERE names": the INSERT in
   the middle of that test no longer forces a re-read, because the driver
   can now prove the row the insert added (id 4, flag 1) does not satisfy
   the read's predicate (`id = 2 AND flag = 0`). The test's own comment
   said "a new row COULD satisfy this read's predicate"; the new rule
   proves it does not. **The test's assertions about the ANSWERS are
   unchanged**; only the wire count moved (3 -> 2).
2. `bunny-db-transport-packing-prefetch.test.ts` "keeps a prefetched row
   when the block CREATES another card (the insert's own row)": this
   test's NAME says the prefetched row is kept, and its count said 2
   executes of the prefetched statement, i.e. that the answer was dropped
   and re-read. With the insert's pin alive, the answer is kept AND served
   from the memo: 1 execute. **The test's assertion about the ANSWER is
   unchanged**; only the wire count moved (2 -> 1).

**TWO NEW GUARDS** were added for the new rules:

- "drops the entry when the row an INSERT adds DOES satisfy the read's
  predicate" (the insert's own row, the other direction);
- "keeps a read of another row when the write touches only the row it
  names" (the row-identity rule).

### 7.2 What the battery says, in numbers

```
Test Files  1 failed | 131 passed | 5 skipped (137)
     Tests  5 failed | 1501 passed | 37 skipped (1543)
```

**NO GREEN SUITE TURNED RED.** The 5 failures are the known MySQL set.

## 8. The disk cost and the residue

```
added to the repo:
  docs/reports/save-path-card-block-reach-2026-10-22.md   (new) this report
  docs/reports/receipts/save-ladder-block-reach-20261022.json (new) the receipt
changed:
  src/card/drivers/bunny-db.ts                    the insert's row facts, the
    row-identity rule, the two repaired regex literals
  src/card/fetch/card-block-declaration.ts        the by-key, by-pair and
    second-junction-shape declarations
  src/card/actions/card-action-engine.ts          the two declaration call
    sites now declare EVERY shape
  tests/card/drivers/bunny-db-transaction-read-memo.test.ts   two guards moved,
    two added
  tests/card/drivers/bunny-db-transport-packing-prefetch.test.ts  one guard moved
removed from the repo: 0
residue: this lane's clone (C:/localProjects/decko-ts-savepath-blocks-20261022,
  on its own branch port/savepath-blocks-20261022), node_modules/ (npm ci,
  gitignored), and the lane's gitignored tmp/ scratch (the ladder receipts and
  the lane's diagnostic scripts). The temporary diagnostic instrument in the
  driver is NOT landed: every instrumented file was restored before the first
  line of the commit, and `git diff --stat` names only the files above.
```

## 9. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The
  hosted Bunny service was not contacted; every measurement ran on the
  local Hrana endpoint against the local copy of the serving deck.
- **The target was not met** (310, not 175 or 200). Section 6 names the
  110 round trips that remain and the mechanism of each.
- **The post-commit fan-out was not reached** (section 6.1): the lever
  there is a visibility decision about the memo's lifetime, and this lane
  did not make it.
- **The store phase's type walk was not declared** (section 6.2): the
  declaration would have to know the walk's own semantics, and this lane
  measured the walk instead of guessing at it.
