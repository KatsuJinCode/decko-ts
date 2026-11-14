# The owner's save: family round eight (2026-10-24)

Lane `port/savepath-round8-20261024`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round8-20261024`, created from the
family's tip `9873480f` (round seven's). Pushed forward-only to
KatsuJinCode/decko-ts (private).

## 1. The lever is LANDED: 198 -> 191 POSTs

**THE OPERATOR-BLOCKED LEVER IS NO LONGER BLOCKED.** Rounds three through
seven named the after-commit read memo as the operator's to rule on, and
the operator ruled on 2026-10-24: parity with Ruby is the law, Ruby caches
deck-wide, so the port may too. The notification phase now runs inside a
read scope whose memo is born at the commit and dies at the phase's end.

| | before | after |
|---|---:|---:|
| the graded save, pipeline POSTs | 198 | **191** |
| the graded save, statements | 772 | **739** |
| the after-commit POSTs (the notification phase) | 58 | **51** |
| the after-commit statements | 200 | **167** |

**THE IN-TRANSACTION HALF OF THE SAVE DID NOT MOVE**: 140 POSTs, 572
statements, 77 single-statement POSTs, before and after. Every POST the
scope removed was an after-commit one, which is what the lever was scoped
to do.

**THE ACCEPT-200 LINE IS STILL MET, AND MORE COMFORTABLY**: 191 is 9 under
the line, where round seven ended 2 under it. The family's "about 175"
target is still not met (191 is 16 over it).

## 2. The mechanism

**THE SAVE HAS THREE PHASES AND ONLY ONE OF THEM HAD A MEMO.** Before the
commit the save reads the deck with no memo at all; inside the transaction
the transaction's read memo answers the repeated reads; after the commit
the notification phase (the ancestor timestamps, the integrate events, the
follower mail) had no memo, so every read the phase made went to the wire
on its own. Ruby's `after_commit :integration_phase` runs the phase after
the commit too, and Ruby's `Card.cache.read` caches the deck-wide reads
deck-wide (card-1.110.0 lib/card/rule/preference_cache.rb).

**THE SCOPE.** The driver's read memo now has a second scope: a READ
PHASE, opened and closed around a unit of work.

- The scope's memo is created when the scope opens and dropped when it
  closes, whatever the work does. A phase that throws leaves no answer
  behind for a later reader.
- The scope starts EMPTY. A pre-commit answer and a post-commit answer are
  answers to different questions (the deck as it was before the save, and
  the deck as it is), so the scope must not be served one. That is why the
  scope is a separate map and not the transaction's memo continued.
- A write inside the scope drops the memoized reads that depend on the
  table it writes, plus the tables its triggers write, exactly as the
  transaction's memo does. The STANDALONE write path did not do this
  before, because the only memo that existed was the transaction's and a
  write that went out on its own pipeline never met one; it does now, and
  the difference is 1 POST and 36 statements on the graded save.
- The trigger graph is the deck's SCHEMA, so the scope that follows a
  commit adopts the graph the transaction read instead of paying a round
  trip to read the schema again. The measured save reads the schema once,
  before and after.
- A transaction that opens inside a scope clears the scope's memo: a
  transaction's writes may change what the scope's answers say.

**THE CALL SITE.** The save's integration phase runs after the transaction
returns (src/card/actions/card-action-engine.ts, the after-commit steps of
`atomicSave`), and those steps now run inside the scope. A driver without
the scope runs the steps unchanged: the scope is an optimization and its
absence is not an error.

**THE ROUTER.** The fetch engine hands out a router, not the driver
(src/card/fetch.ts:160), so the router forwards the scope to the driver
that owns the memo. Without that forwarding the scope would never open,
and the first measurement of this round said exactly that: 198 POSTs, no
change at all.

## 3. What the scope served, measured

The after-commit region's POST shapes, before and after (the graded save's
own attribution trace, one line per POST):

| the POST's statements | before | after |
|---|---:|---:|
| the junction-id batch (2 statements) | 7 | **1** |
| the rule-content batch (3 contents + the *nests count) | 7 | **1** |
| the rule-content batch shrunk to its *nests count alone | 0 | **6** |
| the three-card-row batch | 3 | 1 |
| the two-card-row batch | 0 | **2** |
| the one-card-row batch | 10 | **9** |

**THE 7 POSTS THAT WENT AWAY ARE NAMED.** Six of them are the follower
walk's junction-id batch: the walk reads the same two junction ids once
per saved card, seven times, and the scope answers six of them. The
seventh is one single-statement card-row read that the phase had already
made. The 33 statements the scope served, by shape:

| the read | served |
|---|---:|
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 12 |
| `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 18 |
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | 3 |

## 4. The gates, on this round's tip

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

The equivalence verdict: **19469 composed keys checked, 0 wrong, 0 missing,
0 invented** (1489 rule-shaped, 0 wrong). The battery: **1556 passed**, and
the only failures are the **same 5 MySQL 8.4 atomic-saves cases the base
tree fails**: this lane measured them on the base tip `9873480f` with this
round's change reversed, and the same five fail there
(`Table 'atomic_1.sqlite_master' doesn't exist`, the MySQL driver's own
error at src/server/drivers/mysql.ts:228). The typecheck holds at the **3
pre-existing errors** in tests/card/actions/write-path-races.test.ts, a file
this round did not touch.

## 5. The ladder, and the family's count

| | |
|---|---|
| the graded save, pipeline POSTs | **691 -> 191** (a **72.4%** reduction over the family's first measurement) |
| This round's share | **198 -> 191** (7 POSTs, 3.5%) |
| the target (about 175, accept 200 or below) | **THE ACCEPT-200 LINE IS MET** (191). The about-175 target is not (191 is 16 over it) |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED** (the rungs up
to round seven are round seven's table verbatim,
docs/reports/owner-save-family-round-seven-2026-10-24.md):

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
| round six ROW-1: the rule candidates are declared, behind the Lexicon skip gate | c9b2b4e4 | 216 |
| round six ROW-2: the reference refresh's two deletes ride one round trip | 41ab935d | 212 |
| round seven ROW-1: the declaration's declared set rides one round trip (the run cap, 32 -> 256) | 0854a3c0 | 205 |
| round seven ROW-2: the *nests arm's inclusion count rides the rule-content batch | d007adf6 | 198 |
| **round eight ROW-1: the notification phase runs inside a read scope** | **635630af** | **191** |

## 6. What remains above the 175 line

16 POSTs. The final measurement's single-statement POSTs split at COMMIT
(COMMIT rode POST 140 of 191): **140 in-transaction POSTs (77 single), 51
after-commit POSTs (35 single)**.

The after-commit 35: 9 card rows by id, 6 junction lookups, 4 live rows by
id, 3 change rows, 2 codenames, the 6 *nests counts (each now a POST of its
own, because the rule-content batch beside it was answered from the scope),
the touch write, the preference rows, the user type's ids, the auth session
and the ancestor timestamp read.

## 7. What was measured and named, and NOT landed

- **THE TOUCH WRITE'S WHERE IS AN IN LIST, AND THE WRITE PINNING DOES NOT
  READ IT.** The phase's one write is the ancestor timestamp bump,
  `UPDATE cards SET updater_id = ?, updated_at = ? WHERE id IN (?, ?, ...)`.
  The write pinning declines any WHERE carrying parentheses
  (src/card/drivers/bunny-db.ts:1748), so the write is unpinned and the
  table-scoped rule applies: every memoized `cards` answer the phase held
  dies, including the followers' card rows the write could not have
  touched. The population the narrowing would unlock is the phase's
  37-statement card-row batch and one single-statement card-row read. NOT
  LANDED: the narrowing is a change to the memo's row-disjointness proof,
  and a proof that is wrong there is a stale row.
- **THE REFERENCE WALK'S COMPOUND-NAME LEVELS (structural).** Unchanged from
  round seven.
- **THE CARD-BLOCK DECLARATION'S BY-KEY RUN (structural).** Unchanged.
- **THE STANDARD CARDS' FIND AND THE CARD BLOCK'S SIMPLE-NAME RUN (named,
  one POST).** Unchanged.
- **THE ANCESTOR WALK'S LEVELS (structural).** Unchanged.
- **THE TOUCH WRITE (round six's named refusal).** Unchanged.
- **THE PERMISSION WALK'S OWN READS (round six's measured refusal).**
  Unchanged.
- **THE CARD INSERT'S FOLLOWERS (round six's structural refusal).**
  Unchanged.

## 8. The disk cost, and the residue

```
added to the repo:
  src/card/drivers/bunny-db.ts                     (the read scope's memo)
  src/server/driver.ts                             (the scope on the driver seam)
  src/card/one-trip/replay-plan-router.ts          (the scope, forwarded)
  src/card/actions/card-action-engine.ts           (the call site)
  tests/card/drivers/bunny-db-read-phase.test.ts   (new: 15 cases)
  tests/card/actions/notification-phase-read-scope.test.ts (new: 4 cases)
  docs/reports/owner-save-family-round-eight-2026-10-24.md (new)
  docs/reports/receipts/owner-save-family-round-eight-20261024.json (new)
removed from the repo: 0 bytes
```

53,412 bytes added across 8 changed files, 1019 lines added and 18
removed, 0 bytes removed from the repo. The residue is the lane's
gitignored `tmp/` scratch: 2,779,073 bytes (the ladder receipts, the gate
logs and the analysis scripts). NOT deleted: the machine's deletion gate
requires the diskSteward staging tool, and this lane has no approval for
it.

## 9. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** Every
  measurement ran on the local Hrana endpoint against the local copy of the
  serving deck.
- **The about-175 target was not met** (191, not 175). The accept-200 line
  was met (191).
- **The scope does not outlive the phase**, and no other scope was given
  one: the operator's ruling was about the notification phase, and the
  scope is opened there and nowhere else.
