# The owner's save: family round seven (2026-10-24)

Lane `port/savepath-round7-20261024`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round7-20261024`, created from the
family's tip `76c1e531` (round six's). Pushed forward-only to
KatsuJinCode/decko-ts (private).

## 1. The rows, in row-id order, and what happened to them

| Row | Population | Disposition |
|---|---|---|
| ROW-1 | the card-block declaration's own run: the by-id and by-pair shapes of every card the save touches, cut into runs of 32 statements by the transport packing's run cap | **LANDED** - the cap is 256, so the declaration rides one round trip; **212 -> 205 POSTs** |
| ROW-2 | the *nests arm's inclusion count (the follower's indirect walk asks whether the left card includes the field), paid as a round trip of its own after the rule-content batch | **LANDED** - it rides the rule-content batch; **205 -> 198 POSTs** |

**THE 200 LINE IS REACHED: 198 POSTs, 2 under the accept-200 line.** The
family's "about 175" target is NOT met (198 is 23 over it).

**THE OPERATOR-BLOCKED LEVER STAYS BLOCKED.** The after-commit read memo
(notification phase) was not landed in any form. What ROW-2 landed is not
that memo: every read still happens exactly once, and no read is served
from a cache. Two reads of the same walk now share one round trip instead
of paying one each.

## 2. The round's starting point, measured

This lane re-profiled the graded save on the family's tip `76c1e531` with
the ladder (tools/run-save-statement-ladder-to-completion.mjs --attribution),
no change of any kind: **212 pipeline POSTs, 772 statements**. Round six's
number reproduced exactly.

The profile that named the rows was taken with a per-POST trace of the
driver itself: every pipeline POST the driver sent, with the statements it
carried and whether it was a query, a batch or a declaration's prefetch.
That trace is what separates "a read that could be declared" from "a read
that pays a round trip because nothing declares it".

## 3. ROW-1: the declaration's declared set rides ONE round trip

**THE MECHANISM.** The transport packing's run cap was 32 statements, and
in this implementation the cap IS the packing: a prefetched run is a set
of statements the engine already declared independent, and the run is cut
where the cap falls. The card-block declaration hands the driver one such
set (the by-id and by-pair shapes of every card the save touches, 178
statements in the graded save), so a cap of 32 cut the save's own
declaration into nine runs and nine round trips.

The 32 came from the design's cap sweep
(docs/reports/live-save-transport-design-2026-10-18.md section 2.3), which
swept 8,16,32,64,100,128,256,100000 against the GREEDY PACK and found
that "the cap stops mattering above 32" (175 round trips at every cap from
32 up). That sweep measured a different algorithm. Its conclusion does not
carry over to a cap that is the packing itself.

**MEASURED** on the graded save, the statement count 772 at every cap, so
the cap moves round trips and nothing else:

| cap | 32 | 64 | 128 | 256 | 1024 |
|---|---|---|---|---|---|
| POSTs | 212 | 207 | 206 | **205** | 205 |

The curve is flat from 256 up: at 256 the whole declaration rides one
round trip and a larger cap buys nothing. The cap is now 256.

**WHAT THE RAISED CAP DOES NOT CHANGE.** The byte cap (512 KiB) still
bounds the run. The run's own value flow is still verified AFTER it runs,
so a statement that binds a value the run produced keeps only what the
rule can vouch for, and the caller's own read of it takes the blocking
path, at its own sequence point, and answers the same. A run that cannot
be sent is still not an error: every statement in it falls back to the
blocking path, which is what the engine would have done without the
prefetch.

**THE HOSTED ENDPOINT'S LIMITS.** Bunny's SQL API documents no maximum
statement count per `/v2/pipeline` request, and no request-body maximum
was found in the published docs; that is an absence of a documented
ceiling, not a proof that none exists. The run's body stays far below the
byte cap the driver enforces (256 statements of the deck's read shapes are
about 25 KB against a 512 KiB cap), and the local Hrana endpoint and the
mock server both carried the measured run.

## 4. ROW-2: the *nests arm's inclusion count rides the rule-content batch

**THE MECHANISM.** The follower's indirect walk reads each left
ancestor's *follow_fields rule, and the rule's *nests arm asks whether
the left card INCLUDES the field: the inclusion count over the
card_references rows of type "I". That read was a round trip of its own,
paid after the rule-content batch, for every left ancestor the walk
visited. In the graded save it was paid seven times, with the same two
arguments each time.

It is an independent read of the same walk: it binds the left card's id
and the field card's id, both of which the walk already held, and the
walk writes nothing between the batch and where the read used to stand.
So its answer is the answer the read of its own gave, and it now rides
the rule-content batch, which was being paid anyway. It goes LAST, so the
batch's answers keep the order the walk issued them in and the rule
content is still the first non-null one in the pattern order.

**WHAT THE CHANGE COSTS WHEN THE ARM DOES NOT FIRE.** Before, the count
was read only when the rule content named *nests; now it is read on every
visited ancestor, as one more statement of a batch that was being paid
anyway. A round trip is never added: the statement rides a batch that
exists, so the worst case is one extra statement on a round trip that was
already going out. On the graded save the arm fires every time, and the
seven round trips it used to pay are gone.

**MEASURED** on the graded save: **205 -> 198 POSTs**, the statement count
unchanged at 772. The notification phase's 65 POSTs become 58, and its
single-statement POSTs 37 become 30.

## 5. The ladder, and the family's count

| | |
|---|---|
| The graded save, pipeline POSTs | **691 -> 198** (a **71.3%** reduction over the family's first measurement) |
| This round's share | **212 -> 198** (14 POSTs, 6.6%) |
| The target (about 175, accept 200 or below) | **THE ACCEPT-200 LINE IS MET** (198). The about-175 target is not (198 is 23 over it) |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED** (the rungs up
to round six are round six's table verbatim,
docs/reports/owner-save-family-round-six-2026-10-23.md):

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
| **round seven ROW-1: the declaration's declared set rides one round trip (the run cap, 32 -> 256)** | **0854a3c0** | **205** |
| **round seven ROW-2: the *nests arm's inclusion count rides the rule-content batch** | **d007adf6** | **198** |

## 6. What remains above the 175 line

23 POSTs. The final measurement's single-statement POSTs split at COMMIT
(COMMIT rode POST 139 of 198): **140 in-transaction POSTs (77 single), 58
after-commit POSTs (30 single)**.

The in-transaction single-statement reads, by shape (77 single statements,
writes included):

| reads | shape | why no lever answered it |
|---|---|---|
| 11 + 10 | the card row by id (live, and any) | each read sits between that card's writes, and the writes before it drop the memo entries a declaration would leave (round six's measured refusal, unchanged) |
| 10 | the junction id lookup | the pairs bind the ids of cards the save just created or just wrote; the entries a declaration leaves are dropped by those same writes |
| 7 | the card row by key | the retrieve path's key arm, read mid-save after the invalidating writes (same mechanism) |
| 6 | UPDATE cards (the touch write) | per card, after that card's content write; cross-card batching would reorder the stamping |
| 4 | INSERT INTO cards | the id is computed server-side and the followers bind it (round six's structural refusal) |
| 4 | the unary-plus junction | round five's measured refusal, unchanged |
| 3 | the codename by codename | round five's refusal, unchanged |
| 9 | writes and one-offs (2 INSERT card_references, codenames, the trashed shapes, auth, the trigger graph) | each binds a value the immediately preceding round trip produced, or is a write |

The after-commit 30 (the notification phase): 10 card rows by id, 6 junction
lookups, 4 live rows by id, 3 card_changes joins, and 7 more. **The only
mechanism that could batch reads there is the after-commit read memo, and
that lever is the operator's visibility ruling.**

## 7. The gates, on this round's tip

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

The equivalence verdict: **19469 composed keys checked, 0 wrong, 0 missing,
0 invented** (1489 rule-shaped, 0 wrong). The battery and typecheck counts
are in the receipt (docs/reports/receipts/owner-save-family-round-seven-20261024.json).

## 8. The disk cost, and the residue

```
added to the repo:
  src/card/drivers/bunny-db.ts                     (the run cap, and its measurement)
  src/card/notify/follower-resolver.ts             (the inclusion count rides the batch)
  src/card/notify/index.ts                         (the count's shape, exported)
  tests/card/drivers/bunny-db-transport-packing-prefetch.test.ts   (updated: 2 cases)
  tests/card/notify/follower-resolver.test.ts      (updated: 1 case)
  docs/reports/save-path-transport-packing-2026-10-22.md           (amended: the cap)
  docs/reports/owner-save-family-round-seven-2026-10-24.md        (new)
  docs/reports/receipts/owner-save-family-round-seven-20261024.json (new)
removed from the repo: 0 bytes
residue:
  the lane's clone C:/localProjects/decko-ts-savepath-round7-20261024 (a
    linked worktree of C:/localProjects/decko-ts-release-lead, git objects
    shared). The lane's retirement is the custody lease's business: the
    lane was admitted with the diskSteward's own worktree tool, which
    writes the lease.
  the lane's gitignored tmp/ scratch: 10,404,808 bytes (the ladder
    receipts, the gate logs and this round's analysis scripts). NOT
    deleted: the machine's deletion gate requires the diskSteward staging
    tool, and this lane has no approval for it.
```

(The byte totals, both directions, are in the receipt JSON: 37,553 bytes
added across 8 changed files, 688 lines added and 32 removed, 0 bytes
removed from the repo.)

## 9. What was measured and named, and NOT landed

- **THE REFERENCE WALK'S COMPOUND-NAME LEVELS (structural).** The Lexicon
  resolves a compound name level by level, and level n+1's pairs bind the
  ids level n produced, so the levels cannot share a round trip: the
  bound value is fixed when the request is sent. Measured on the graded
  save: the four reference walks pay 4+2, 2+1, 2+2 and 1+1 junction
  statements in two runs each, 8 POSTs where 4 would do if the levels
  were independent. They are not.
- **THE CARD-BLOCK DECLARATION'S BY-KEY RUN (structural).** The by-key
  statements bind the name's key, and the key is a cell of the card row
  the by-id run returns, so a by-key statement in the by-id run would
  bind a value that run produced: the admission rule would mark the tail
  unverified and every by-key reader would fall back to the blocking path,
  one round trip each. The by-key run must stay after the by-id run.
- **THE STANDARD CARDS' FIND AND THE CARD BLOCK'S SIMPLE-NAME RUN (named,
  one POST).** Both bind literals only, so they COULD share a round trip.
  They do not, because they are declared by two different modules at two
  different seams (src/card/fetch/standard-card-declaration.ts and the
  Lexicon's phase 1 in src/card/fetch/lexicon.ts). Named, not landed: the
  two seams are the save's, and joining them is a change of the save's
  shape, not of the packing.
- **THE NOTIFICATION PHASE'S REPEATED WALKS (the operator's ruling).** The
  same two set card ids and the same three rule contents are read seven
  times, once per saved card, and the seven followers' rows are read one
  at a time. Merging them is a memo that outlives the commit, which is
  the operator's visibility decision. NOT LANDED.
- **THE ANCESTOR WALK'S LEVELS (structural).** The nester read and the
  liveness read of a level are dependent: the liveness read decides which
  nesters the next level reads.
- **THE TOUCH WRITE (round six's named refusal, unchanged).** Six writes
  of the same shape, one per card, each after that card's content write.
  Cross-card batching would reorder the stamping, and the stamped
  timestamps are part of the answer.
- **THE PERMISSION WALK'S OWN READS (round six's measured refusal,
  unchanged).** 212 -> 213 when they were declared: the cascade
  interleaves a write per member, and each write invalidates the driver's
  read memo before the next member's walk reads it.
- **THE CARD INSERT'S FOLLOWERS (round six's structural refusal,
  unchanged).** The INSERT computes the new card's id server-side
  (NEW_CARD_ID_SQL in src/card/history/write-path.ts) and the statements
  that follow bind that id; a batch cannot bind a value its own round trip
  produces.

## 10. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** Every
  measurement ran on the local Hrana endpoint against the local copy of
  the serving deck.
- **The about-175 target was not met** (198, not 175). The accept-200
  line was met (198).
- **The memo that outlives the commit was not landed.** That is the
  operator's visibility ruling, and the family named it as the operator's.
