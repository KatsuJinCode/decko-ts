# The card-block declaration, widened: every card block the save touches (2026-10-22)

Extends the transport packing's card-block declaration so that the
speculation reaches every card block the save issues, not one of them.

Branch `port/savepath-blocks-20261022`, base `1e0f0721` (the transport
packing's landed tip), worktree
`C:/localProjects/decko-ts-savepath-blocks-20261022`.

## 1. Headline

| | |
|---|---|
| The graded save, pipeline POSTs | **437 -> 374** (a 63-POST, 14.4% reduction) |
| The graded save, statements | 771 -> 807 (the declaration's own statements are on the wire) |
| **The target (about 175, accept 200 or below)** | **NOT MET.** The measured number is 374. The difference is 174 POSTs, and section 5 names and mechanizes every population in it |
| Equivalence | re-proven on this commit: **19,469 composed keys, 0 wrong, 0 missing, 0 invented**; 1,489 rule-shaped, 0 wrong |
| Green suites | **none turned red** (section 6) |

**The target is not met, and the number that IS met is 374.** Nothing here
claims otherwise. Section 5 names the 174 round trips that are still missing
and why a declaration at the seams this lane reached cannot name them.

## 2. What ran

```
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-BEFORE-blocks-20261022.json
node tools/run-save-statement-ladder-to-completion.mjs --out tmp/ladder-AFTER-v10-20261022.json
node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/ladder-ATTR-v9-20261022.json
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/
npx tsc --noEmit
```

**The BEFORE tree is this same worktree at 1e0f0721 with no change of any
kind** (the ladder's own before-run, same machine, same session, same serving
deck): **437 POSTs, 771 statements**. The AFTER run is the same tree with this
commit's changes: **374 POSTs, 807 statements**.

**WHERE THE READS ARE, MEASURED.** The receipt's own map
(`docs/reports/save-path-transport-packing-2026-10-22.md`, section 4.3) named
the engine seams and the reads each one issued. This lane re-measured that
map on its own tree, with the ladder's attribution copy plus a temporary
SQL-comment tag on every candidate read site (the tag was a diagnostic
instrument; it is not landed, and every tagged file was restored from `HEAD`
before the first line of this commit). The attribution is what the map below
is built on.

## 3. The mechanism, and what was wrong with it

### 3.1 The declaration the packing lane landed

`src/card/actions/card-action-engine.ts` gains `prefetchSubcardBlock`, called
from `saveSubcardsInWriter` before the block's loop. It declares the block's
name resolutions (the Lexicon's own shapes) and then the rows those ids name
(the deck's three read-by-id shapes, named once in
`src/card/fetch/card-read-shapes.ts`).

**The declaration reached ONE of the save's ~129 card blocks.** The receipt
named the reason: the declaration is made AT THE CARD-BLOCK SEAM, and the
save's other card blocks are issued by ~20 other engine sites, each of which
learns its card's id at its own moment. A declaration made at the card-block
seam covers the block it is given and no other.

### 3.2 The two widenings

**THE SEAM: the save's INPUT TREE.** The input tree (the main card's name
and the names of the fields posted under it) is the one place that knows
every card the save touches BEFORE the save touches any of them. The
permission walk (the read-rule walk, inside `assertCanWrite`) resolves those
same names one at a time, and each resolution was a round trip: the
ladder's attribution shows **39 name lookups and 32 card-row reads, 71
statements, 71 single-statement POSTs** in that walk alone.

The declaration is now made at the top of the save, over the input tree
(`declareSaveInputTree`), so the permission walk's own reads of the block's
names and ids are memo hits. **The permission walk's 71 single-statement POSTs
are now ZERO.**

**THE SHAPES: every shape the deck reads a card by.** The declaration named
three read-by-id shapes. The deck reads a card by id, by key, and by a
junction's two sides, and each read has its own statement string; a prefetch
only answers a reader whose statement is IDENTICAL to the one it prefetched.
`src/card/fetch/card-read-shapes.ts` now names all of them, one per seam:

| shape | the seam that reads it |
|---|---|
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | the write path's `fetchRowById`, the read-rule write path's `fetchCardsRow`, the ancestor walk's batch |
| `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` | the fetch layer's retrieve path, the referer-content path |
| `SELECT codename FROM cards WHERE id = ?` | the mod event state's `codenameOfId`, the read-rule write path |
| `SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1` | the Lexicon's `idToLex` |
| `SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1` | the fetch layer's retrieve path, the key arm |
| `SELECT codename FROM cards WHERE key = ? AND trash = 0` | the mod-event runtime's codename lookup |
| `SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1` | the Lexicon's own simple-name lookup |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` | the Lexicon's compound lookup, the write path's junction read |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | the follower's junction read |
| `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | the follower's junction-content read |
| `SELECT id FROM cards WHERE type_id = ?` | the follower's type-membership read |

Every reader now reads its shape FROM that file, so a reader and the
declaration cannot drift apart.

**THE TYPE CHAIN.** A card's type is a property of the deck, not of the card,
and the design's own capture
(`docs/reports/live-save-transport-design-2026-10-18.md`, section 4) says the
ids a save binds most are exactly the deck's type cards (the user type, the
RichText type, the `*all` card. The declaration therefore walks the type
chain (the type of every card the block names, and the type of every card
THAT card names) is one link per round trip, and names those ids' rows too.

### 3.3 What the declaration is, and is not

The declaration is a SPECULATION. The driver remembers the answers under the
same keys the readers use, and a read the driver cannot vouch for is a MISS:
the reader's own read then takes the blocking path, at its own sequence
point, and answers the same. **The declaration changes the NUMBER of round
trips, never the ANSWERS.**

## 4. The measurement

| | BEFORE (1e0f0721) | AFTER (this commit) |
|---|---:|---:|
| graded save, pipeline POSTs | **437** | **374** |
| graded save, statements | 771 | 807 |
| graded save, db wall (local Hrana) | 344 ms | 331 ms |
| the permission walk's single-statement POSTs | 71 | **0** |
| single-statement POSTs, of which inside the transaction | 377 (323) | **309 (255)** |

**THE STATEMENT COUNT ROSE BY 36 AND THE POST COUNT FELL BY 63.** The
declaration's own statements are on the wire (the prefetch is not free), and
they buy the permission walk's 71 round trips. On the hosted shape the design
measures the hop at 13 ms, so 63 fewer hops is 819 ms of wall, against the
local db wall's 19 ms of extra statement execution. **The local db wall is
the wrong number for this trade; the hop count is the one the target names.**

### 4.1 The run split the admission rule forces, and why

The declaration's own test caught a real defect, and the mechanism is worth
naming because every declaration will hit it.

**A by-key read binds a KEY, and the by-id rows the same declaration
returned CARRY that key as a cell.** The admission rule says a statement
that binds a value an earlier statement in ITS OWN run produced cannot be
answered from that run (the probe's arm 3: the bound value is fixed when the
request is sent). So a by-key statement sharing a run with the by-id rows
comes back UNVERIFIED, the driver does not remember it, and the reader falls
back to the blocking path (the round trip the declaration was supposed to
remove, bought back.

**⇒ THE BY-KEY SHAPES RIDE THEIR OWN RUN, AFTER THE BY-ID RUN, AND THE
CODENAME-BY-KEY COMES FIRST.** The by-id run has produced the keys by then,
so a by-key statement's binding is a value the transaction produced BEFORE
the run (which the rule does not treat as a dependency); and the codename
shape binds the key without producing it, while the row shape produces the
key, so putting the producer last keeps every statement vouchable.

The declaration is therefore three runs: the name lookups (the Lexicon's own
two phases), the by-id and by-pair shapes, and the by-key shapes.

## 5. The difference, named and mechanized

The target was "about 175 round trips, accept 200 or below". The measured
number is 374, so the difference is **174 round trips**. They are not one
population; they are three, and each has a mechanism:

### 5.1 The write-back reads (the store phase's own cards): 150 POSTs

The save's remaining single-statement POSTs, by shape, from the attribution
receipt (`docs/reports/receipts/save-ladder-blocks-summary-20261022.json`):

| shape | reads | distinct | single-statement POSTs | inside the transaction |
|---|---:|---:|---:|---:|
| `SELECT * FROM cards WHERE id = ? LIMIT 1` | 165 | 84 | 56 | 56 |
| `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1` | 89 | 55 | 49 | 49 |
| `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` | 52 | 48 | 22 | 22 |
| `SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1` | 22 | 16 | 22 | 22 |
| `SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1` | 21 | 3 | 21 | 0 |
| `SELECT codename FROM cards WHERE id = ?` | 54 | 38 | 18 | 18 |
| `SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1` | 61 | 38 | 16 | 16 |
| `SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1` | 14 | 3 | 14 | 14 |
| `SELECT codename FROM cards WHERE key = ? AND trash = 0` | 12 | 12 | 12 | 12 |
| the follower's three reads and the reference count | 28 | n/a | 28 | 0 |
| the rest | n/a | n/a | 21 | 21 |
| **total** | | | **309** (255 inside the transaction, 54 outside) | |

The store phase's per-card runs are ~20 reads each, and the attribution
shows them at the indices 251-267, 272-282, 292-320, 340-353, 373-388, 404-415
and 435-455. Two mechanisms keep them on the wire:

1. **A card's own write drops its own prefetched row.** The engine writes a
   subcard's content and then reads the row back (the attribution's
   `UPDATE cards SET db_content = ? ... WHERE id = ?` and the
   `SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1` beside it). The
   driver's read memo drops the row the write changed, correctly: the read
   must see the new content. A prefetch taken BEFORE the write cannot answer
   it, and one taken AFTER it needs the id the write produced.
2. **A card's creation is a new id.** The four `INSERT INTO cards`
   statements produce ids that do not exist before the statement, so no
   declaration can name them.

**⇒ These are the design's own irreducible barriers** (section 4 of the
design: "consumes a WRITE's result (a new rowid), yes, the id does not exist
before the insert"). The design counts 26 of them on its capture; this save
has more, because the graded save creates four subcards and re-reads each.

### 5.2 The name lookups a write's row-drop takes with it: 65 POSTs

The driver's read memo drops a memoized read when a write might have changed
its answer, and the rule it applies is deliberately conservative: a read
pinned to `key` is dropped by a write pinned to `id`, because the two
predicates name different columns and the driver does not claim they are
disjoint. So the store phase's name lookups (the 49 junction lookups and the
16 key lookups above, 65 of the 309) each cost a round trip even though the
declaration named those names and those names' ids.

**⇒ THE MECHANISM IS THE MEMO'S INVALIDATION RULE, NOT THE DECLARATION.**
A write that assigns no column the read's predicate names, and whose row the
read did not return, cannot change the read's answer; a refinement of
`disjointFrom` in `src/card/drivers/bunny-db.ts` would keep those reads. That
is a change to the driver's correctness-critical memo, and this lane did not
make it: the lane's task was the DECLARATION, and a memo whose staleness
rules changed is a different lane's risk to carry.

### 5.3 The post-commit fan-out: 54 POSTs

The save's notification phase runs AFTER the commit, and the driver's read
memo is transaction-scoped: a prefetch outside a transaction has no memo to
hold its answers. So the follower's reads (the 41
`SELECT DISTINCT referer_id FROM card_references ...`, the 21
junction-content reads, the 7 rule reads, the 7 type-membership reads and the
7 reference counts: 54 single-statement POSTs, all of them outside the
transaction) each cost a round trip. **A prefetch that worked outside a
transaction, or a batch at the follower's own loop, is the lever here**, and
the follower's loop is a genuine run of seven reads repeated six times.

### 5.4 What is left, in one line

**The 374 that remain are 374 dependency runs.** The declaration removed the
runs whose names and ids the save HOLDS (the permission walk's 71 are now
zero), and what is left are the runs whose ids the save LEARNS (the new
cards' rowids, the rows the save writes back), the runs the memo's
conservative invalidation takes with them, and the runs that live outside the
transaction. The design's own floor statement (section 4) says the floor is
"one round trip per real dependency run", and it counted 175 runs on its
593-statement capture; the graded save this lane measured has 807 statements
and 374 runs, of which the 174 above are the ones a declaration cannot reach
without the two changes named in 5.2 and 5.3.

## 6. The gates

**EQUIVALENCE, re-proven on this commit**
(`tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts`,
the serving deck at
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`):

```
deck ...: 19482 live cards, 5681 keyed, 19469 composed keys, 1489 rule-shaped, 0 ambiguous (0 rule-shaped)
equivalence over ALL composed keys: 19469 checked, 0 wrong, 0 missing, 0 invented
equivalence over RULE-SHAPED keys: 1489 checked, 0 wrong
```

**THE BATTERY ON THE TOUCHED FILES** (`npx vitest run`, the suites that own
the touched files): see section 6.1.

**`npx tsc --noEmit`**: the same **3 pre-existing errors** in
`tests/card/actions/write-path-races.test.ts` (the family's own baseline) and
no new one.

### 6.1 The battery's result

```
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ \
  tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/

Test Files  1 failed | 131 passed | 5 skipped (137)
     Tests  5 failed | 1499 passed | 37 skipped (1541)
```

**The 5 failures are the family's known failure set**: all five are
`tests/card/actions/atomic-saves.test.ts` "atomic saves: MySQL 8.4 (native)"
("Table 'atomic_1.sqlite_master' doesn't exist"; there is no MySQL server on
this machine). The packing lane's receipt records the same five at the family
tip ("the 5 are `atomic-saves.test.ts` MySQL 8.4 (native), the family's known
failure set (no MySQL server on this machine), unchanged"). **NO GREEN SUITE
TURNED RED.** The 6 suites "not run" are the ones that need data or setup a
clean clone does not have (the corpus-replay files need
`DECKO_TS_CORPUS_REPLAY=1`; the two others need a live host).

**THE DECLARATION'S OWN CONTRACT**
(`tests/card/fetch/card-block-declaration.test.ts`, new): 5 tests, all
passing. They pin that ONE declaration answers EVERY shape the deck reads a
card by (the by-id, by-key and by-pair readers each cost NO execute after it),
that the deck's TYPE cards are declared too, that a compound name travels with
its sides, that a name the deck does not hold resolves to nothing and the
reader's own read of it still answers the same, and that the junction shapes
are declared when the scope asks for them.

## 7. The disk cost and the residue

```
added to the repo:
  src/card/fetch/card-block-declaration.ts          (new) the declaration
  src/card/fetch/card-read-shapes.ts                the widened shape set
  tests/card/fetch/card-block-declaration.test.ts   (new) the declaration's contract
  docs/reports/save-path-card-block-declaration-2026-10-22.md  (new) this report
  docs/reports/receipts/save-ladder-blocks-summary-20261022.json (new) the summary
  receipt: both runs's POST, statement and wall counts, and their full per-shape
  statement tallies
  and the eight files whose readers now take their shape from the named place:
    src/card/actions/card-action-engine.ts
    src/card/actions/update-referer-content.ts
    src/card/fetch/lexicon.ts
    src/card/fetch/retrieve.ts
    src/card/notify/follower-resolver.ts
    src/card/permissions/set-read-rule.ts
    src/server/write-routes.ts
removed from the repo: 0
residue: this lane's clone (C:/localProjects/decko-ts-savepath-blocks-20261022,
  on its own branch port/savepath-blocks-20261022), node_modules/ (npm ci,
  gitignored), and the lane's gitignored tmp/ scratch (the ladder receipts and
  the lane's three diagnostic scripts). The temporary SQL-comment tags the lane
  used to attribute the reads are NOT landed: every tagged file was restored
  from HEAD before the first line of the commit, and `git diff --stat` names
  only the files above.
```

## 8. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The hosted
  Bunny service was not contacted; every measurement ran on the local Hrana
  endpoint against the local copy of the serving deck.
- **The target was not met** (374, not 175 or 200). Section 5 names the
  difference and the mechanism.
- **The driver's read memo was not changed.** Section 5.2 names the change
  and why this lane did not make it.
- **The post-commit fan-out was not reached.** Section 5.3 names the lever.
- **The per-subcard store declaration was measured and DROPPED.** Declaring
  each subcard's own block at the store seam was implemented and measured at
  **403 and 418 POSTs** (worse than this commit's 374): the declaration's four
  phases cost more round trips than the subcard's own run costs, because the
  run's reads are spread over shapes the subcard's name cannot name. The
  measurement is named here so the next lane does not repeat it.
