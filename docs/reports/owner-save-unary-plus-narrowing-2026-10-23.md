# The owner's save: the rule walk's junction read is pinnable, 289 -> 284 POSTs (2026-10-23)

Family round two, row ROW-2. The row the family's tip named as "the reads a
card creation still drops: 42 POSTs"
(docs/reports/save-path-card-block-reach-2026-10-22.md, section 6.3).

## 1. Headline

| | |
|---|---|
| The graded save, pipeline POSTs | **289 -> 284** (a 5-POST reduction) |
| The graded save, statements | 836 -> 812 (24 statements fewer: 24 reads are now served from the memo instead of the wire) |
| The target (about 175, accept 200 or below) | **NOT MET.** The measured number is 284 |
| Equivalence | re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented**; 1,489 rule-shaped, 0 wrong |
| Green suites | **none turned red** (section 5) |
| The tip's two stated causes for this row | **BOTH FALSE for the ladder's own measurement deck** (section 2). The real cause was measured: 66 drops of one shape, from one unary plus |

**THE MEASUREMENT DECIDES THE OWNER, AND IT IS NOT THE ONE THE TIP NAMED.**
The tip's section 6.3 said the 42 reads are dropped by a card creation, and
gave two reasons. Both were checked against the rig this lane ran, and
neither holds for the deck the ladder measures on. What the rig shows is
that the population was dropped by EVERY write to the cards table, because
the read's WHERE carried SQLite's unary plus and the driver's conjunct reader
could not read it as a conjunction at all.

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-ROUND2-BASELINE-20261023.json
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/ladder-ROUND2-ATTR-20261023.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-ROUND2-SP2-FINAL.json
node tmp/check-local-deck-schema.mjs        (this lane's own check of the measurement deck's schema)
npx vitest run tests/card/drivers/bunny-db-transaction-read-memo.test.ts --reporter=dot
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

The measurement is the local Hrana endpoint against the local copy of the
serving deck. The hosted Bunny service was NOT contacted.

## 3. The tip's two stated causes, checked

**CAUSE (b): "the local copy of the deck that this lane measured has a
rebuilt `cards` table with no declared types and no primary key, so on THAT
copy the rowid is not the id column and the rowid pin cannot name the new
card."**

**FALSE for the deck the ladder measures on.** The ladder does not measure on
the source deck; it builds its own copy first
(`tools/diagnose-owner-save-statement-ladder.mjs`: `buildLocalDeck({ source:
SOURCE_DECK, out: localDeck })`), and `buildLocalDeck` applies the ENGINE's
own migrations before the rows (deploy/provisioning/provision-bunny-deck.mjs
through `engineSchemaPlan`). This lane's own check of that built copy:

```
cards table SQL: CREATE TABLE "cards" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, ...)
id column: {"name":"id","type":"INTEGER","pk":1}
rows where rowid <> id: 0
max rowid: 53040   max id: 53040   cards rows: 21676
```

So the measurement deck's `id` IS the rowid alias, exactly as the serving
deck's canonical schema is, and the rowid pin names the new card. The
divergence the tip describes is real for the SOURCE deck
(`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`
carries `CREATE TABLE cards ("id","name",...)` with no types and no primary
key), and that source deck is what the EQUIVALENCE test reads, not what the
ladder measures on.

**CAUSE (a): "an insert whose id column's value is a SQL EXPRESSION (the
save's new card id is computed by a subquery over the history tables), so the
new row's id is not known and the read cannot be proven unaffected."**

**TRUE about the statement, FALSE about the consequence on the measurement
deck.** The insert really does bind its id to a subquery
(`src/card/history/write-path.ts`: `VALUES (${NEW_CARD_ID_SQL}, ?, ...)`),
so the new row's id is not in the statement's own VALUES clause. But the
rowid pin does not need it: the execute result reports the rowid the insert
took, and on a deck whose `id` is the rowid alias that rowid IS the new
row's id. The tip says so itself ("the same population the rowid pin covers
when the table's `id` column is the rowid alias"), and the measurement deck
is that deck.

So neither cause explains the population the tip measured, and this row had
to find its own owner.

## 4. The owner, measured

**THE INSTRUMENT.** This lane's own instrument, in the driver's memo
invalidation: for every memo entry the invalidation drops, the read and the
write that dropped it are recorded. It is a diagnostic and it is NOT landed:
the instrumented file was restored before this commit, and `git diff --stat`
names only the files in section 7.

**THE CENSUS AT THE BASE** (the graded save, 434 drops in all):

| drops | the write that dropped them |
|---:|---|
| 147 | `UPDATE cards SET type_id = ?, db_content = ?, trash = ?, left_id = ?, right_id = ?, ...` |
| 145 | `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` |
| 90 | `INSERT INTO cards (...)` |
| 36 | `UPDATE cards SET db_content = ?, updated_at = ?, updater_id = ? WHERE id = ?` |
| 15 | `DELETE FROM card_actions ...` |
| 1 | `UPDATE card_actions SET super_action_id = ? WHERE id IN (?)` |

and the biggest single pair was **49 drops of the read-rule walk's junction
read by the four inserts**, plus **17 more of the same shape by the card
write**: 66 drops of one shape, which is exactly the 66 statements of that
shape on the wire.

**THE MECHANISM.** The rule walk's junction read is

```sql
SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND +trash = 0
```

(`src/card/permissions/read-rules.ts:1009`). The driver's conjunct reader
(`CONJUNCT` in `src/card/drivers/bunny-db.ts`) accepts a plain column name
before the comparison, so the leading `+` made the conjunct unreadable, so
`predicateOf` returned null, so the read was NOT PINNED to a row, so every
write to the cards table dropped its memoized answer. A read that is not
pinned to a row can only be invalidated table-wide.

**THE LEVER.** The conjunct reader now reads the unary plus as the column it
names (`/^\s*\+?([A-Za-z_][A-Za-z0-9_]*)\s*(=|<>|!=|<=|>=|<|>)\s*(\?|[0-9]+(?:\.[0-9]+)?|NULL)\s*$/i`).
The wire is untouched: the same SQL string goes out, and the driver's rules
only decide whether a write could have changed a memoized answer.

**WHY IT IS SAFE.** The narrowing rules use a conjunct in two ways, and both
are about the COLUMN the conjunct names:

- the column set: a write that ASSIGNS a column the read's WHERE names may
  move a row into or out of the read's predicate, so the read's memoized
  answer is dropped. The unary plus names `trash`, so a write that assigns
  `trash` still drops the read. The census shows exactly that: the card
  write, which assigns `trash`, still drops 25 of that shape.
- the equalities: only a `?` value contributes an equality, and the unary
  plus never carries one.

And where the two forms could differ at all (SQLite coerces a TEXT value to
a number under `+`), the difference is in the READ's own answer, which this
driver never computes. The driver only decides whether a write could have
changed that answer, and a write that touches `trash` drops the read either
way.

**THE CENSUS AFTER** (393 drops): the inserts' 90 drops fall to 41, and the
49 drops of the junction read by the inserts are GONE. The read is now
pinned, so the insert's own row proves the new row is not in the read's
answer, and the memo serves the read.

## 5. The gates

**THE PINNED TEST** (`tests/card/drivers/bunny-db-transaction-read-memo.test.ts`,
"keeps a read whose WHERE carries SQLite's unary plus, when the INSERT adds a
row the read does not admit"): the read `WHERE id = ? AND +flag = 0` is
served from the memo after an insert that adds a row the read does not
admit.

The BEFORE number is measured, not derived: with the base regex in place on
the same tree, the same test reports **2 executes** where the fixed tree
reports 1 (`expected 2 to be 1`), so the guard bites on the unpinned read.
The 21 other cases in that file pass unchanged.

**EQUIVALENCE, re-proven on this commit**
(`tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`,
the serving deck at
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`):

```
deck ...: 19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous (0 rule-shaped)
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys: 1489 checked, 0 wrong
```

That gate is the oracle evidence for THIS row and not a formality: the read
this row makes pinnable is the rule-candidate walk's own junction read, and
that test compares the walk's answers against the serving deck's own data,
over every composed key the deck holds.

**THE BATTERY ON THE TOUCHED SUITES**
(`npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/`):
see section 5.1.

**`npx tsc --noEmit`**: the same **3 pre-existing errors** in
`tests/card/actions/write-path-races.test.ts` (the family's own baseline) and
no new one.

### 5.1 The battery's result

```
Test Files  1 failed | 131 passed | 5 skipped (137)
     Tests  5 failed | 1503 passed | 37 skipped (1545)
```

**NO GREEN SUITE TURNED RED.** The 5 failures are the known MySQL set
(`atomic-saves.test.ts`, "MySQL 8.4 (native)": there is no MySQL server on
this machine), and the base tree produces the same five.

## 6. The rest of the population, named

The census names what is left, and the honest reading is that most of it is
correct behaviour rather than a lever:

| drops | the write | why the read cannot be kept |
|---:|---|---|
| 48 | `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` | the codename-by-key read | the written card IS in the read's answer, so the read's answer changed |
| 44 | the same write | the NOCASE key read | the same |
| 36 | `UPDATE cards SET type_id = ?, db_content = ?, trash = ?, ...` | the live row by id | the write assigns `trash`, a column the read's WHERE names |
| 33 | the same write | the junction id read | the write assigns `trash` and `left_id`/`right_id` |
| 25 | the same write | the junction read with the unary plus | the write assigns `trash` |
| 15 | `DELETE FROM card_actions ...` | the card_actions count | the write removes rows the count answers |

**A WRITE THAT TOUCHES A ROW THE READ ANSWERED MUST DROP THAT READ.** The
memo serves raw result rows, so a row that moved is a stale row, and the
driver is right to drop the read. These drops are the cost of correctness,
not a lever.

**WHAT IS LEFT AS A LEVER**, and is not this row's: the timestamp bump
(`UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?`) is the
largest single dropper (145), and it touches one row per card. A bump that
wrote nothing would change no read, but the bump IS the save's timestamp, so
that is a semantic question about what the save records, not a transport
one. It is named here and left alone.

## 7. The disk cost and the residue

```
added to the repo:
  docs/reports/owner-save-unary-plus-narrowing-2026-10-23.md   (new) this report
  docs/reports/receipts/owner-save-unary-plus-narrowing-20261023.json  (new) the receipt
changed:
  src/card/drivers/bunny-db.ts                        the conjunct reader's unary plus
  tests/card/drivers/bunny-db-transaction-read-memo.test.ts  the pinned guard
removed from the repo: 0
residue: this lane's clone (C:/localProjects/decko-ts-savepath-round2-20261023,
  on its own branch port/savepath-round2-20261023), node_modules/ (a junction
  to the release-lead tree's, gitignored), and the lane's gitignored tmp/
  scratch (the ladder receipts, the drop census, and the lane's own scripts).
  The INSTRUMENT that produced the drop census is NOT landed: the driver was
  restored before this commit, and the diff names only the two files above.
```

## 8. What was not done

- **Nothing was deployed and nothing was pushed to a live host.**
- **The target was not met** (284, not 175 or 200).
- **The tip's 42 POSTs were not reproduced.** The population the tip measured
  was not found at the base; the population this row found and closed is 66
  drops of one shape, worth 5 POSTs and 24 statements.
- **The timestamp bump's drops were not reached**: that write touches the
  rows the reads answer, so the memo is right to drop them.
