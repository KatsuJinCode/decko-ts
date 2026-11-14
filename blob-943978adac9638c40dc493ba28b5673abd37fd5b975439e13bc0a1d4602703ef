# The owner's save: family round six (2026-10-23)

Lane `port/savepath-round6-20261024`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round6-20261024`, created from the
family's tip `b20242a8` (round five's). Pushed forward-only to
KatsuJinCode/decko-ts (private).

## 1. The rows, in row-id order, and what happened to them

| Row | Population | Disposition |
|---|---|---|
| ROW-1 | the rule lookup's candidate names, resolved one junction at a time, and the waste the first form of the lever carried (the declaration re-asking names the Lexicon cache already held) | **LANDED** - the candidates are declared level by level, behind a skip gate; **227 -> 216 POSTs** |
| ROW-2 | the reference refresh's two deletes (card_references, then the nest-edge cache), issued back to back as two round trips for every card whose content changed | **LANDED** - one statement sequence carries both; **216 -> 212 POSTs** |
| ROW-3 | the permission walk's own reads (the parts' ids, their rows, the by-key fallback row), one round trip per await inside `patternCardInput` | **MEASURED REFUSAL** - **212 -> 213 (+1)**, reverted; the cascade interleaves a write per member, and each write invalidates the driver's read memo before the next member's walk reads it, so the declaration pays one batch per walk and buys nothing |
| ROW-4 | the four card INSERTs that each ride a lone POST, with their act/action statements in the NEXT POST | **NAMED REFUSAL (structural)** - the INSERT computes the new card's id server-side (`NEW_CARD_ID_SQL` in src/card/history/write-path.ts), and the statements that follow bind that id: a batch cannot bind a value its own round trip produces |

**THE OPERATOR-BLOCKED LEVER STAYS BLOCKED.** The after-commit read memo
(notification phase) is the operator's visibility ruling and was not landed
in this round, in any form. Named below because the measurement now bounds
it: 37 of the remaining single-statement POSTs are AFTER COMMIT, and a
declaration cannot reach them (the transport packing needs the transaction's
read memo, which does not exist outside a transaction).

## 2. The round's starting point, measured

This lane re-profiled the graded save on the family's tip `b20242a8` with
the ladder (tools/run-save-statement-ladder-to-completion.mjs), no change of
any kind: **227 pipeline POSTs, 798 statements** (the ladder receipt
tmp/ladder-R6-baseline.json, source b20242a8). Round five's number
reproduced exactly.

The profile that named the rows: 140 single-statement POSTs, of which 33
were the Lexicon's junction id lookup. The two deletes of the reference
refresh appeared as 4 adjacent pairs (8 POSTs).

## 3. The round's intermediate measurement, and what it taught

An interim form of ROW-1 (the level walk WITHOUT the skip gate) measured
**225 POSTs but 868 statements**: it removed 17 junction round trips and
added 14 declaration batches, because the second and later rule lookups
re-declared names whose entries the Lexicon's own cache already held. The
mechanism, verified in the driver (src/card/drivers/bunny-db.ts,
invalidateReadMemo): every card write drops every cards-dependent entry
from the driver's read memo (an id-pinned UPDATE and a key-pinned read name
different columns, so disjointness cannot be proven), while the Lexicon's
cache survives, and the walk reads the held entries for free. The skip gate
(gate names whose Lexicon entry exists, positive or stored negative) turned
the lever from 225 into 216 and took the statement count BELOW the
baseline: 772 against 798.

## 4. The ladder, and the family's count

| | |
|---|---|
| The graded save, pipeline POSTs | **691 -> 212** (a **69.3%** reduction over the family's first measurement) |
| This round's share | **227 -> 212** (15 POSTs, 6.6%) |
| The target (about 175, accept 200 or below) | **NOT MET.** The measured number is 212, which is 12 POSTs above 200 |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED** (the rungs up
to round five are round five's table verbatim,
docs/reports/owner-save-family-round-five-2026-10-23.md):

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
| ROW-1: the touch write drops answers it cannot change | 5a4272a4 | 272 |
| ROW-2: the reference walk's names are declared | 3e0e2338 | 257 |
| round four: the pin separation | 9916c39f | - |
| round four: the notification phase's follow reads | c9882203 | 245 |
| round five ROW-1: the deck's standard cards are declared | 4c06cc25 | 233 |
| round five ROW-2: the walked card's two shapes ride one round trip | 32e2badf | 227 |
| **round six ROW-1: the rule candidates are declared, behind the Lexicon skip gate** | **c9b2b4e4** | **216** |
| **round six ROW-2: the reference refresh's two deletes ride one round trip** | **41ab935d** | **212** |

## 5. What remains above the 200 line

12 POSTs. The final measurement's single-statement POSTs split at COMMIT
(COMMIT rode POST 146 of 212): **147 in-transaction POSTs (77 single), 65
after-commit POSTs (37 single)**.

The in-transaction single-statement reads, by shape (77 single statements,
writes included):

| reads | shape | why no lever answered it |
|---|---|---|
| 11 + 10 | the card row by id (live, and any) | each read sits between that card's writes, and the writes before it drop the memo entries a declaration would leave (measured, ROW-3) |
| 10 | the junction id lookup | the pairs bind the ids of cards the save just created or just wrote; the entries a declaration leaves are dropped by those same writes |
| 7 | the card row by key | the retrieve path's key arm, read mid-save after the invalidating writes (same mechanism as ROW-3's refusal) |
| 6 | UPDATE cards (the touch write) | per card, after that card's content write; cross-card batching would reorder the stamping |
| 4 | INSERT INTO cards | the id is computed server-side and the followers bind it (ROW-4's refusal) |
| 4 | the unary-plus junction | round five's measured refusal, unchanged |
| 3 | the codename by codename | round five's refusal, unchanged (the save's card write assigns trash, which the read's WHERE names) |
| 9 | writes and one-offs (2 INSERT card_references, codenames, the trashed shapes, auth, the trigger graph) | each binds a value the immediately preceding round trip produced, or is a write |

The after-commit 37 (the notification phase): 10 card rows by id, 7
reference counts, 6 junction lookups, 4 live rows by id, 3 card_changes
joins, and 7 more. **The only mechanism that could batch reads there is the
after-commit read memo, and that lever is the operator's visibility ruling.**

## 6. The gates, on this round's tip

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

The equivalence verdict: **19469 composed keys checked, 0 wrong, 0 missing,
0 invented** (1489 rule-shaped, 0 wrong). The battery and typecheck counts
are in the receipt (docs/reports/receipts/owner-save-family-round-six-20261023.json).

## 7. The disk cost, and the residue

```
added to the repo:
  src/card/fetch/lexicon.ts            (the level walk and the skip gate)
  src/card/rules/lookup.ts             (the candidates declared at the seam)
  src/card/actions/refresh-references-out.ts (the joined deletes)
  tests/card/fetch/lexicon-prefetch-levels-and-skip-gate.test.ts   (new, 5 cases)
  tests/card/actions/refresh-references-delete-pair.test.ts        (new, 3 cases)
  tests/card/actions/refresh-references-out-declaration.test.ts    (updated: the declared-names arm now measures a cold Lexicon at one round trip and a warm Lexicon at zero)
  docs/reports/owner-save-family-round-six-2026-10-23.md           (new)
  docs/reports/receipts/owner-save-family-round-six-20261023.json  (new)
removed from the repo: 0 bytes
residue:
  the lane's clone C:/localProjects/decko-ts-savepath-round6-20261024 (a
    linked worktree of C:/localProjects/decko-ts-release-lead, node_modules
    shared through a junction, git objects shared). The lane's retirement is
    the custody lease's business.
  the lane's gitignored tmp/ scratch: 7,377,382 bytes (the ladder receipts
    and analysis scripts of this round and the interrupted attempt before
    it). NOT deleted: the machine's deletion gate requires the diskSteward
    staging tool, and this lane has no approval for it.
```

(The byte totals, both directions, are in the receipt JSON: 116,159 bytes
added across 8 changed files, 0 bytes removed.)

## 8. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** Every
  measurement ran on the local Hrana endpoint against the local copy of the
  serving deck.
- **The target was not met** (212, not 175 or 200).
- **The memo that outlives the commit was not landed.** That is the
  operator's visibility ruling, and the family named it as the operator's.
- **Two of the four candidate levers were refused, with the measurements
  named**: the permission walk's declaration (212 -> 213) and the INSERT's
  followers (structural, the server-computed id).
