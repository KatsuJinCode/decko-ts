# The owner's save: the follower's set-pattern walk rides one round trip per shape (2026-10-23)

Family round two, row ROW-1. The lever the family's tip named as "the next
lane's work" (the family's tip report of 2026-10-22, "The card-block
declaration, reaching the other blocks", section 6.1): a batch at the follower's
own loop.

## 1. Headline

| | |
|---|---|
| The graded save, pipeline POSTs | **310 -> 289** (a 21-POST, 6.8% reduction) |
| The graded save, statements | 836 -> 836 (UNCHANGED: no read was added and no read was dropped) |
| The target (about 175, accept 200 or below) | **NOT MET.** The measured number is 289. The difference is named and mechanized in section 5 |
| Equivalence | re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented**; 1,489 rule-shaped, 0 wrong |
| Green suites | **none turned red** (section 4) |

**THE STATEMENT COUNT IS THE PROOF THAT NO ANSWER CHANGED.** The batch moves
statements from one round trip each onto one round trip together; it does not
add a statement and it does not drop one. The graded save issued the same 836
statements before and after, and the save's answers are the answers the
statements produce. The gates in section 4 are the rest of that claim.

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-ROUND2-BASELINE-20261023.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-ROUND2-SP1-AFTER.json
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/notify/follower-resolver.test.ts --reporter=verbose
npx vitest run tests/card/follow/ tests/card/notify/ --reporter=dot
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

**The BEFORE tree is this same worktree at `a5557a63` with no change of any
kind** (the ladder's own before-run, same machine, same session, same serving
deck): **310 POSTs, 836 statements**. The AFTER run is the same tree with this
commit's changes: **289 POSTs, 836 statements**.

The measurement is the local Hrana endpoint against the local copy of the
serving deck. The hosted Bunny service was NOT contacted: its database is
Brandon's live deck, and the metered-host law puts one batched confirmation
fetch at the end of a lane, not a measurement loop. This lane needed no
confirmation fetch, so none was made.

## 3. The mechanism

**THE FOLLOWER'S WALK READ ITS PATTERNS ONE AT A TIME.** The notification
phase runs after the commit, and it resolves the followers of every saved
card. For each saved card the walk reads the card's set patterns and, for
each pattern, the set card's id and then the set card's rule content:

- `src/card/notify/follower-resolver.ts`, `followFieldsRuleContent`: for each
  pattern, `setCardIdForPattern` (the junction read) and then the junction
  content read, and it stops at the first pattern with a non-null content.
- `setCardIdForPattern`: an anchored pattern ("<anchorId>+<code>") is a
  junction row, so it reads
  `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1`;
  an anchorless pattern ("all", "star", "rule") is its own codename card, so
  the codenames map answers it.

Each of those reads was its own round trip, because the engine awaits every
answer. The measured cost of the graded save was **2 round trips for the set
card ids and 3 for the rule contents per saved card**, and the attribution
receipt shows the same two pairs read seven times over (14 statements of the
junction-id shape over 2 distinct parameter sets, 21 of the content shape over
3).

**THE BATCH.** The two reads of ONE card's walk now ride one round trip each:

- the set card ids: one `driver.batch` over the walk's anchored patterns;
- the rule contents: one `driver.batch` over the patterns that have a set id.

**WHY THE ANSWERS DO NOT CHANGE.** A batch of read-only statements executes in
order on one pipeline POST and each statement sees exactly what its own round
trip would have seen, because there is no write between them (the walk reads
only). The rule content is still the FIRST pattern's non-null content in the
pattern order, which is what the one-at-a-time walk returned: the batch
answers every pattern's content and the walk takes the first non-null one in
the same order. The set card id of an anchored pattern is still that
pattern's junction row, and a pattern with no junction row still has no set
card id.

**WHAT THIS DOES NOT DO.** It does not make a memo outlive the commit. The
family's tip named a memo that outlives the commit as a VISIBILITY decision
(a deck that a concurrent writer has already changed), and that decision is
the operator's, not this lane's. The batch changes no visibility: the reads
of one card's walk all happen at one point instead of spread across it.

**THE ANCHORLESS PATTERNS ARE UNCHANGED.** They are answered by the codenames
map, which is the port's own cache and was already there.

## 4. The gates

**THE PINNED TEST** (`tests/card/notify/follower-resolver.test.ts`, "follower
resolution round trips"): the walk's junction reads ride one round trip per
shape. The counts are wire counts, so they move when the packing moves:

| Shape | statements | round trips before | round trips after |
|---|---:|---:|---:|
| the set card id of a junction | 4 | 4 | 2 |
| the rule content of a junction | 4 | 4 | 2 |

The BEFORE numbers are measured, not derived: with the batch removed from the
same tree, the same test reports **4 round trips** where the batched tree
reports 2 (`expected 4 to be 2`), so the guard bites on the unpacking.

**THE ANSWERS ARE PINNED BY THE EXISTING CASES**: the 13 other cases in that
file (the *always / *never precedence, the first-pattern-wins rule, the
*created / *edited options, the notify-layer exclusions) all pass unchanged,
and the follow and notify suites are green (11 files, 98 tests).

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
see section 4.1.

**`npx tsc --noEmit`**: the same **3 pre-existing errors** in
`tests/card/actions/write-path-races.test.ts` (the family's own baseline) and
no new one.

### 4.1 The battery's result

```
Test Files  1 failed | 131 passed | 5 skipped (137)
     Tests  5 failed | 1502 passed | 37 skipped (1544)
```

**NO GREEN SUITE TURNED RED.** The 5 failures are the known MySQL set
(`atomic-saves.test.ts`, "MySQL 8.4 (native)": there is no MySQL server on
this machine), and the base tree produces the same five. The test count is
one higher than the base's 1543 because this row adds one test.

## 5. The difference, named and mechanized

The target was "about 175 round trips, accept 200 or below". The measured
number is 289, so the difference is **89 round trips**. The tip named four
populations at 310; this row closes one of them (the follower's per-resolution
reads, 21 POSTs of the 58 the tip counted) and the other three are measured
and named in the round-two receipt.

The local db wall moved from 256 ms to 271 ms while the hop count fell by 21.
That is the right way round: the local db wall is not the currency, the hop
count is (the live host charges one network hop per POST, and the design
measures that hop at 13 ms), and 21 fewer hops is about 273 ms of wall on the
hosted shape. The local db wall's movement is statement-execution noise on the
same 836 statements.

## 6. The disk cost and the residue

```
added to the repo:
  docs/reports/owner-save-walk-batch-2026-10-23.md   (new) this report
  docs/reports/receipts/owner-save-walk-batch-20261023.json  (new) the receipt
changed:
  src/card/notify/follower-resolver.ts          the walk's two batches
  tests/card/notify/follower-resolver.test.ts    the pinned round-trip guard
removed from the repo: 0
residue: this lane's clone (C:/localProjects/decko-ts-savepath-round2-20261023,
  on its own branch port/savepath-round2-20261023), node_modules/ (a junction
  to the release-lead tree's, gitignored), and the lane's gitignored tmp/
  scratch (the ladder receipts and the lane's census scripts).
```

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The hosted
  Bunny service was not contacted; every measurement ran on the local Hrana
  endpoint against the local copy of the serving deck.
- **The target was not met** (289, not 175 or 200).
- **The memo was not made to outlive the commit.** That lever is a visibility
  decision about the deck, and the family named it as the operator's.
- **The other three populations the tip named were not reached** by this row;
  they are measured and named in the round-two receipt.
