# The answer-scope rule: the save's touch write drops answers it cannot change (2026-10-23)

Row ROW-1 of the save path's round three. Lane
`port/savepath-round3-20261023`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round3-20261023`, created from the
family's tip `d37b181b` through the machine's sanctioned lane copy.

## 1. The headline

| | |
|---|---|
| The population | the reads whose memoized answer the save's touch write dropped although the write changes no column the read answers |
| The lever | the memo's answer-scope rule: a write that assigns neither a column the read's WHERE names nor a column the read's SELECT list names cannot change the read's answer |
| The graded save, pipeline POSTs | **284 -> 272** (a 12-POST, 4.2% reduction) |
| The graded save, statements | **812 -> 769** (43 statements left the wire) |
| The equivalence gate | **19,469 composed keys, 0 wrong, 0 missing, 0 invented**; 1,489 rule-shaped, 0 wrong |
| The battery | the family's seven suites: no green suite turned red |
| The typecheck | the same **3 pre-existing errors**, and no new one |

**The target (about 175, accept 200 or below) is NOT MET.** 272 is 72 POSTs
above 200.

## 2. The profile this round started from

The round-two tip `d37b181b` measured **284 POSTs, 812 statements** for the
graded save, reproduced exactly by this lane's own ladder run
(`tools/run-save-statement-ladder-to-completion.mjs`, the local Hrana
endpoint against the local copy of the serving deck; the hosted service was
NOT contacted).

**THE SAVE HAS THREE PHASES, AND ONLY ONE OF THEM HAS A READ MEMO.** This
lane's own instrument (a driver-side trace of every round trip and every
memo event, not landed) named the path each round trip took:

| phase | round trips | notes |
|---|---|---|
| before the transaction | 7 | 6 reads and the BEGIN |
| inside the transaction | 199 | 124 query reads, 23 query writes, 38 batches, 13 prefetches, the COMMIT |
| after the commit | 77 | 49 queries and 28 batches, and **no transaction, so no memo** |

**OF THE 284 ROUND TRIPS, 206 CARRY EXACTLY ONE STATEMENT.** The other 78
carry 606 statements between them. Every round trip the engine issues on its
own is one statement and one round trip, because the engine awaits each
answer before it issues the next read.

**THE 812 STATEMENTS, BY THE PATH THAT SENT THEM (inside the transaction):**

| shape | reads |
|---|---|
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | 123 |
| `SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1` | 61 |
| `SELECT codename FROM cards WHERE key = ? AND trash = 0` | 55 |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` | 49 |
| `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 49 |
| `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` | 48 |
| `SELECT codename FROM cards WHERE id = ?` | 42 |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND +trash = 0` | 42 |

## 3. The population, and why the reads reached the wire

**THE MEMO ALREADY SERVES A REPEATED READ.** Inside the transaction, the same
statement with the same arguments is answered from the memo and reaches no
wire at all. The reads that reach the wire are the ones the memo did not
hold, and the instrument says which of those two things happened.

**103 WIRE READS FOUND NO ANSWER IN THE MEMO BECAUSE A WRITE HAD DROPPED
IT.** In event order, with the memo's live entries tracked as the trace
played them back, the write that dropped each answer is:

| the write that dropped the answer | wire reads it cost |
|---|---|
| `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` | **66** |
| `UPDATE cards SET type_id = ?, db_content = ?, trash = ?, left_id = ?, right_id = ?, read_rule_class = ?, read_rule_id = ?, ...` | 22 |
| `UPDATE cards SET db_content = ?, updated_at = ?, updater_id = ? WHERE id = ?` | 9 |
| `INSERT INTO cards (...)` | 6 |

**THE TOUCH WRITE IS THE BIG ONE.** The save bumps a saved card's
`updated_at` and `updater_id`, six times in the graded save, and each bump
dropped the memo's answers for the reads that follow it. The (write, read)
pairs it caused, with the counts:

| the write | the read | reads |
|---|---|---|
| `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` | `SELECT codename FROM cards WHERE key = ? AND trash = 0` | 31 |
| `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` | `SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1` | 22 |
| `UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?` | `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 8 |
| `UPDATE cards SET type_id = ?, db_content = ?, trash = ?, left_id = ?, right_id = ?, ...` | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND +trash = 0` | 12 |

**THE MECHANISM, IN ONE SENTENCE: the touch write changes no column these
reads answer, and the memo dropped their answers anyway, because the memo's
row-identity rule decides by comparing the write's pinned values against the
READ'S RESULT ROWS, and a read that answers one column (`SELECT codename
FROM cards WHERE key = ?`) does not carry the row's id, so the comparison has
nothing to compare and the rule gives up.**

## 4. The lever, and why it is sound

**A READ'S ANSWER IS A PROJECTION OF THE ROWS ITS WHERE ADMITS.** A write
that changes neither the columns the WHERE names nor the columns the SELECT
list names cannot change that projection: the row it touches keeps its
predicate values, and the values it projects are the values it had. That is
the answer-scope rule, and it is what `writeEffectOnRead` now decides before
it falls back to the row-identity rule.

**IT IS A COLUMN-SCOPE RULE, NOT A VALUE RULE.** It claims nothing about the
row's current values and needs no uniqueness claim. The family named a value
rule in round two ("a narrowing that treats 'the write assigns the value the
row already carries' as 'not assigned'") and did not land it; this is a
different rule, and it is the one the reads above need.

**THE PARSER IS DELIBERATELY NARROW, AND A NULL IS THE SAFE DIRECTION.**
`projectedColumnsOf` (src/card/drivers/bunny-db.ts) returns null for every
SELECT list that is not a plain comma-separated list of bare column names:

- `*` (the answer is every column, so any write to the row changes it);
- an aggregate or a function call (`COUNT(*)`), whose answer is computed from
  rows rather than projected from them;
- an expression or an alias (`AS n`), whose value cannot be traced back to a
  column;
- a subquery in the list;
- a DISTINCT list.

**A READ THAT JOINS IS NEVER NARROWED.** A read that joins another table
also depends on that table's rows and on the join's columns: `FROM cards c
JOIN cards t ON t.id = c.type_id` answers the type card's codename, and a
write that changes `type_id` changes which row the join picks. The rule
counts table OCCURRENCES, not names (`cards c JOIN cards t` names the table
"cards" twice, and the set of names has one member), and a JOIN of a
subquery counts too.

**THE TRIGGERS ARE COUNTED.** The trigger graph is at the TABLE level: it
names the tables a trigger body writes, not the columns. A trigger of the
write's own target that reaches that same table could change a column the
read answers, and this driver cannot tell which columns it writes, so the
rule is switched off for that write (`triggerTouchesTarget`). The serving
deck's own triggers write only `deck_data_version`, so the rule applies to
it.

**WHAT THE RULE DOES NOT DO.** It does not keep an answer whose columns the
write touches: `SELECT * FROM cards WHERE id = ?` answers every column, and
the touch changes one of them, so that answer is still dropped. It does not
keep an answer whose WHERE columns the write touches: a write that assigns
`key` can move a row into or out of the read's predicate, so that answer is
still dropped.

## 5. The measurement

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-R3-ROW1c.json
```

| | the tip `d37b181b` | after this row |
|---|---:|---:|
| the graded save, pipeline POSTs | 284 | **272** |
| the graded save, statements | 812 | **769** |

43 statements left the wire and 12 round trips with them: 31 of those
statements rode inside packed batches, which is why the statement count
falls further than the round-trip count.

**THE ANSWERS DID NOT CHANGE.** The rule changes the NUMBER of round trips,
never the ANSWERS: the answer the memo keeps is the answer the write could
not have changed.

## 6. The gates

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/drivers/ --reporter=dot
npx tsc --noEmit
```

- **The equivalence gate**: 19,469 composed keys checked, **0 wrong, 0
  missing, 0 invented**; 1,489 rule-shaped keys, 0 wrong. This is the
  oracle evidence for a memo change: the rule walk's own reads are memo
  answers, and a rule that kept a wrong answer would show up here.
- **The driver's own suite**: 6 files passed, 43 passed, 15 skipped. The six
  new cases are in the answer-scope block.
- **The typecheck**: the same 3 pre-existing errors in
  tests/card/actions/write-path-races.test.ts, and no new one.

## 7. The pinned test

`tests/card/drivers/bunny-db-transaction-read-memo.test.ts`, the block "the
answer-scope rule", six cases measured both ways against the mock Hrana
server (which runs real better-sqlite3, so a stale answer shows up as a
wrong answer and not as a shape mismatch):

1. an answer the write touches no column of SURVIVES (one execute, not two);
2. an answer whose column the write assigns is DROPPED, and the new value is
   served;
3. an answer whose WHERE column the write assigns is DROPPED;
4. a read that projects every column is NOT narrowed;
5. a read that joins the same table twice is NOT narrowed;
6. a write whose target table has a trigger that reaches that table does NOT
   narrow.

## 8. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The hosted
  service was not contacted; every measurement ran on the local Hrana
  endpoint against the local copy of the serving deck.
- **The target was not met** (272, not 175 or 200).
- **The notification phase's memo was not touched.** The 77 round trips the
  save pays after its commit run with no transaction and therefore with no
  memo; that is a separate row of this round.
- **The value-based narrowing the family named in round two was not
  landed.** This row is a column-scope rule, not that rule.
