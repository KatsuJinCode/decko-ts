# The owner's save: family round five (2026-10-23)

Lane `port/savepath-round5-20261023`, in the exclusive lane checkout
`C:/localProjects/decko-ts-savepath-round5-20261023`, created from the
family's tip `c9882203` through the machine's sanctioned lane copy. Pushed
forward-only to KatsuJinCode/decko-ts (private).

## 1. The rows, in row-id order, and what happened to them

| Row | Population | Disposition |
|---|---|---|
| ROW-1 | the reads of the deck's STANDARD CARDS, which the card-block declaration never names because it only receives the save's input tree | **CLOSED ON PARITY** - a NEW declaration at a NEW seam; **245 -> 233 POSTs** |
| ROW-2 | the read shapes no declaration can answer: the type-codename read, the two codename-triple JOINs, the trashed-junction, the unary-plus junction, the trashed-key | **TWO LANDED, THREE REFUSED, ALL FIVE NAMED** - **233 -> 227 POSTs** |

**THE OPERATOR-BLOCKED LEVER STAYS BLOCKED.** The after-commit read memo
(round three's ROW-3, wave four's ROW-4) is the operator's visibility ruling
and was not landed in this round, in any form.

## 2. The round's starting point, measured

This lane reproduced the family's number on its own tree, with no change of
any kind: **245 pipeline POSTs, 760 statements** on the graded save.

**THE PROFILE THAT NAMED THE ROWS.** The graded save's in-transaction phase
holds 120 pipeline POSTs, of which 97 carry exactly ONE statement. Those 97
reads, by shape: 27 junction id lookups, 18 live rows by id, 14 rows by id, 7
live rows by key, 6 codename id lookups (the rule types, resolved one at a
time), 4 codename-triple JOINs, 4 type-codename JOINs, 4 trashed junctions,
4 unary-plus junctions, 3 codenames by id, and 7 more.

## 3. The ladder, and the family's count

| | |
|---|---|
| The graded save, pipeline POSTs | **691 -> 227** (a **67.2%** reduction over the family's first measurement) |
| This round's share | **245 -> 227** (18 POSTs, 7.3%) |
| The target (about 175, accept 200 or below) | **NOT MET.** The measured number is 227, which is 27 POSTs above 200 |

**THE FAMILY'S LADDER, WITH THE MEASUREMENT EACH RUNG LANDED:**

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
| **round five ROW-1: the deck's standard cards are declared** | **4c06cc25** | **233** |
| **round five ROW-2: the walked card's two shapes ride one round trip, and the trashed junction is declared** | (this round's second commit) | **227** |

(The rungs are not monotonic because some lanes measured a different tree
from the one the rung before it measured; the ladder's own reports say so
where they do.)

## 4. What remains above the 200 line

27 POSTs above the target. The 72 in-transaction single-statement reads that
remain, and why no declaration answers them, are in the shape-registry
report (docs/reports/owner-save-shape-registry-extended-2026-10-23.md,
section 5). In short: the 27 junction lookups bind the permission walk's own
pairs, the 21 by-id reads bind the save's own cards, and the 3 rule-type
codename reads that survive are the ones the save's card write invalidates
(it assigns `trash`, which their WHERE names).

## 5. The gates, on this round's tip

```
npx vitest run tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts --reporter=verbose
npx vitest run tests/card/actions/ tests/card/permissions/ tests/card/drivers/ tests/card/fetch/ tests/card/follow/ tests/card/notify/ tests/server/ --reporter=dot
npx tsc --noEmit
```

The counts are in the receipt (docs/reports/receipts/owner-save-family-round-five-20261023.json).

## 6. The disk cost, and the residue

```
added to the repo (4 new files):
  docs/reports/owner-save-standard-cards-declared-2026-10-23.md
  docs/reports/receipts/owner-save-standard-cards-declared-20261023.json
  docs/reports/owner-save-shape-registry-extended-2026-10-23.md
  docs/reports/receipts/owner-save-shape-registry-extended-20261023.json
  docs/reports/owner-save-family-round-five-2026-10-23.md
  docs/reports/receipts/owner-save-family-round-five-20261023.json
  src/card/fetch/standard-card-declaration.ts
  tests/card/fetch/standard-card-declaration.test.ts
  tests/card/actions/list-card-shapes-declaration.test.ts
changed (8 files):
  src/card/actions/card-action-engine.ts        (the declaration's seam)
  src/card/actions/list-content.ts               (the two shapes, declared)
  src/card/actions/name-validation.ts            (the trashed shapes)
  src/card/actions/refresh-references-out.ts     (the type-codename shape)
  src/card/fetch/card-block-declaration.ts       (the trashed junction)
  src/card/fetch/card-read-shapes.ts             (the registry)
  src/card/permissions/read-rules.ts             (the unary-plus junction)
  src/card/permissions/set-read-rule.ts          (the codename shape)
removed from the repo: 0 bytes
residue:
  the lane's clone C:/localProjects/decko-ts-savepath-round5-20261023 (a linked
    worktree of C:/localProjects/decko-ts-release-lead, with node_modules shared
    through a junction; the git objects are shared)
  the lane's gitignored tmp/ scratch: the ladder receipts (the baseline, the
    attribution copies, the per-row measurements and the two refusal
    experiments), the gate logs, and this lane's scan script
```

## 7. What was not done

- **Nothing was deployed and nothing was pushed to a live host.** The hosted
  service was not contacted; every measurement ran on the local Hrana
  endpoint against the local copy of the serving deck.
- **The target was not met** (227, not 175 or 200).
- **The memo that outlives the commit was not landed.** That is the
  operator's visibility ruling, and the family named it as the operator's.
