# The owner's save: the junction reads the walk repeats, and why the tip's lever cannot pay (2026-10-23)

Family round two, row ROW-4. The tip's section 6.2 population: "the store
phase's type walk: about 40 POSTs".

## 1. Headline

| | |
|---|---|
| The graded save, pipeline POSTs | 284 (this row changes none: the lever is named, not landed) |
| The population | the save's junction reads: **57 POSTs** for 111 statements, over **78 distinct pairs** |
| The repeats | **106 of the 184 junction statements ask for a pair the save had already asked for** |
| The tip's lever | "a declaration that knows the walk" |
| Why it cannot pay | the save's OWN card write drops the memoized answer of every junction read, so a prefetched answer would be dropped by the same write (section 4) |
| The lever that could pay | a narrowing that treats "the write assigns the value the row already carries" as "not assigned" (section 5) |

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/ladder-ROUND2-SP3-ATTR.json
node tmp/census-standard-card-pairs.mjs tmp/ladder-ROUND2-SP3-ATTR.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-ROUND2-SP4-INSTRUMENTED.json
   (with this lane's own drop instrument in the driver's memo invalidation; a diagnostic, NOT landed)
```

The measurement is the local Hrana endpoint against the local copy of the
serving deck. The hosted Bunny service was NOT contacted.

## 3. The population, measured

**THE SHAPES.** The save's junction reads, at this branch's tip:

| POSTs | statements | shape |
|---:|---:|---|
| 36 | 55 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` |
| 14 | 42 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND +trash = 0` |
| 7 | 14 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` |
| 4 | 4 | `SELECT * FROM cards WHERE left_id = ? AND right_id = ? AND trash = 1 LIMIT 1` |

**THE REPEATS.** Over all the junction shapes the save issues **184
statements for 78 distinct pairs**, so **106 of them ask for a pair the save
had already asked for**. The pairs that repeat are the deck's STANDARD card
pairs, which is the tip's type walk: `393:264` x10, `4:266` x10,
`274:22726` x7, `393:13229` x4, `3:266` x3, and 38 more pairs read twice.
71 of the 184 statements name a standard card on one side.

## 4. Why the tip's lever cannot pay

**THE TIP'S LEVER.** "THE LEVER IS A DECLARATION THAT KNOWS THE WALK. The
declaration already walks the type chain by id; it does not walk it by
JUNCTION, which is how the engine reads it. Teaching the declaration the
walk's pairs is engine semantics (which standard card pairs with which
type), not a mechanical change, and a wrong guess would declare junk
(harmless, but wasteful) and still miss the real pairs (costly)."
(the family's tip report of 2026-10-22, "The card-block declaration,
reaching the other blocks", section 6.2)

**THE MEASUREMENT SAYS THE LEVER CANNOT PAY, FOR A REASON THE TIP DID NOT
NAME.** This lane's own drop instrument (in the driver's memo invalidation,
a diagnostic and NOT landed) recorded which read each drop dropped. At this
branch's tip, 393 drops in all, and the save's own card write is the
largest dropper:

| drops | the read the card write dropped |
|---:|---|
| 36 | `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` |
| 33 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` |
| 25 | `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND +trash = 0` |
| 24 | `SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1` |

**THE WRITE ASSIGNS THE COLUMNS THE READ NAMES.** The card write is
`UPDATE cards SET type_id = ?, db_content = ?, trash = ?, left_id = ?,
right_id = ?, read_rule_class = ?, read_rule_id = ? WHERE id = ?`, and a
junction read's predicate is `left_id = ? AND right_id = ? AND trash = 0`:
the write assigns all three columns the read's WHERE names, so the driver's
rule ("a write that assigns a column the read's WHERE names may move a row
into or out of the read's predicate") drops the read. That is CORRECT: the
written card could enter or leave the junction the read asks about.

**SO A PREFETCH WOULD NOT PAY.** A declaration that named the walk's pairs
would prefetch those junction reads early; the save's own card write would
then drop every one of them, and the reads would go on the wire anyway, one
round trip each, exactly as they do today. The declaration would add its own
statements to the wire and remove nothing. **The lever the tip named is
blocked by the save's own write, and the block is not about engine
semantics: it is about the write's ASSIGNED columns.**

**THE ENGINE-SEMANTICS PART IS STILL TRUE** and still unnamed: a
declaration that knows the walk would have to know which standard card pairs
with which type. But that is the SECOND obstacle, not the first.

## 5. The lever that could pay

**A WRITE THAT ASSIGNS THE VALUE THE ROW ALREADY CARRIES CHANGES NOTHING
FOR THAT ROW.** The card write assigns the card's sides, its trash flag, its
type and its content. When the save did not change a card's name, its sides
are written back unchanged, and a row whose sides did not move cannot have
entered or left a junction predicate. So the junction read's ANSWER (the
id) is unchanged, and the memo could serve it.

**WHAT THE DRIVER WOULD NEED.** The rule compares the write's assigned value
with the row's CURRENT value. The driver knows the assigned value (it is a
bound argument) and it can know the current value when a memoized read's
answer carried that row: the save reads each card's row by id
(`SELECT * FROM cards WHERE id = ? LIMIT 1`), so the row's columns are in
the memo at the moment the write happens. The row-identity rule already
compares a write's pin with a read's result rows; this rule adds the
assigned values to that comparison.

**WHY THIS LANE DID NOT LAND IT.** The rule changes when a memoized answer
is stale, and a stale answer is a wrong answer: a follower is not notified,
or a card is read as it was. The driver's memo is the correctness-critical
part of the save, and the family has been explicit that a lane whose job is
not the memo carries that risk only with its own gates behind it (the tip's
section 5.2: "a memo whose staleness rules changed is a different lane's
risk to carry"). ROW-2 in this round carried a memo change because the rule
was a READER change (the unary plus names the same column, so no write
could change the answer differently) and the equivalence gate sits on the
read's own answers. This rule is different: it decides that a write which
assigns a column DID NOT change the answer, and the gate for that is the
serving deck's own behaviour, not a rule-candidate walk's equivalence.

**THE NAMED LEVER, IN ONE SENTENCE.** Teach the driver's narrowing that a
write whose assigned value equals the row's current value does not move the
row, so the junction reads the walk repeats survive the save's own card
write. The population is 57 POSTs, of which the 58 drops the card write
causes are the part that lever would address.

## 6. The disk cost and the residue

```
added to the repo:
  docs/reports/owner-save-junction-read-walk-2026-10-23.md   (new) this report
  docs/reports/receipts/owner-save-junction-read-walk-20261023.json  (new) the receipt
changed: nothing (the code is untouched: this row changes no source file)
removed from the repo: 0
residue: this lane's clone (C:/localProjects/decko-ts-savepath-round2-20261023,
  on its own branch port/savepath-round2-20261023), node_modules/ (a junction
  to the release-lead tree's, gitignored), and the lane's gitignored tmp/
  scratch. The drop instrument is NOT landed: the driver was restored before
  this commit, and the diff names only the two files above.
```

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.**
- **The tip's lever was not built**, and the measurement says it would not
  have paid: the save's own card write drops the prefetched answers.
- **The narrowing rule that could pay was not landed**: it decides when a
  memoized answer is stale, and that risk is the family's to name.
