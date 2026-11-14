# Round 2 — the save path's remaining cost is five whole-deck composed-key walks (2026-10-20)

Continues `save-path-read-ladder-round-1-transaction-read-memo-2026-10-18.md`
(round 1: the transaction-scoped read memo, 691 → 526 POSTs). This round
re-measures the save ladder on top of round 1 and names what is left.

**No product code changed.** Every candidate cut that survived measurement was
a dead end; the three are recorded in §4 with their numbers so nobody re-runs
them.

## 1. Instrument and command

The repo's own write-path ladder probe (the same one round 1 used), run twice on
the same tree, same deck, same machine:

```
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-BEFORE.json
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-BEFORE2.json
```

Worktree `C:/localProjects/decko-ts-mini-writepath-20261020`, branch
`perf/mini-writepath-20261020`, base commit `d8050251`, bundle rebuilt from
that tree (`node tools/bundle-bunny-edge-engine.mjs`, 7121348 bytes).

## 2. The save, twice

| measure                          | run 1   | run 2   |
|----------------------------------|--------:|--------:|
| pipeline POSTs                   | 439     | 439     |
| statements                       | 597     | 597     |
| `Server-Timing` `db;stmt`        | 594     | 594     |
| db wall (ms)                     | 818     | 1117    |
| statement-exec (ms)              | 471     | 618     |
| **whole-deck universe walk**     | **5×375 ms** | **5×478 ms** |
| …as a share of statement-exec    | **80%** | **77%** |
| CONTROL edit page: POSTs / stmts | 12 / 102 | 12 / 102 |
| CONTROL edit page: db wall (ms)  | 925     | 1169    |

Counts are deterministic and identical across runs. The millisecond columns are
machine variance, and the control moves with them (925 → 1169 ms on an
unchanged ladder) — the same effect round 1 documented. **The counts and the
5× shape are the finding; the absolute ms is the range.**

## 3. What the save still spends its time on, by ms (run 1)

```
== POST /update/Brandon_WilliamsCraig (the graded save): 439 POSTs, 597 stmts, db wall 818 ms (stmt-exec 471 ms)
      5x    375ms  WITH RECURSIVE resolved(id, ckey) AS ( SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND +trash = 0 UNION SELECT j
    161x     20ms  SELECT * FROM cards WHERE id = ? LIMIT 1
      7x     13ms  SELECT preferences.id AS rule_id, sets.id AS set_id, sets.left_id AS set_left_id, sets.codename AS set_own_codename, set
     55x      6ms  SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1
     35x      5ms  SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1
     22x      5ms  SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1
     41x      4ms  SELECT DISTINCT referer_id FROM card_references WHERE ref_type = 'I' AND referee_id = ? AND referer_id IS NOT NULL
     30x      4ms  SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1
```

One statement shape is the whole cost: the same `WITH RECURSIVE
resolved(id, ckey)` text, **identical SQL, identical (empty) argument list, five
times in one save** — sequence indices 213, 242, 293, 339, 366 of 597, at 81,
76, 69, 71, 78 ms.

### Where it is built, and why the round-1 memo does not catch it

- Built by `resolveRowsAgainst(..., "wholeDeck")` —
  `src/card/permissions/read-rules.ts:1186-1189`, running
  `RULE_KEY_UNIVERSE_STATEMENT` (`src/card/permissions/read-rules.ts:811`).
- Memoized per driver generation in `ruleResolutionCaches` and dropped by
  `expireRuleResolutionCache` (`read-rules.ts:798`), which the write path calls
  from `src/card/actions/card-action-engine.ts:1791`, `:3800` and `:6042`.
- The one write-path consumer is the `self` set-pattern member lookup:
  `src/card/permissions/set-read-rule.ts:608` asks
  `resolveRuleIdsByKeys(driver, [anchorKey])` — **one key**, which routes to the
  whole-deck walk (`read-rules.ts:1084`).

**The round-1 memo correctly refuses to serve these five.** Between each pair
there are writes — the save creates four cards (`INSERT INTO cards` at sequence
indices 219, 248, 344, 372) and updates one (`UPDATE cards SET type_id=?,
db_content=?, trash=?, left_id=?, right_id=?` at 303). The universe is a
function of `cards.key`, `cards.trash`, `cards.left_id` and `cards.right_id`,
so it genuinely changes between the reads. Serving an earlier answer would be a
stale rule map.

**The rebuilds are semantically required, not a bug.** Measured on the probe's
own deck: 19,494 live cards, of which **13,811 carry no `key` and every one of
them is a junction** (`left_id` and `right_id` both set). A created card is
therefore always either a seed (`"key" IS NOT NULL`) or something the recursive
arms can compose, so no create can be skipped. The universe walk itself
materializes **19,481 rows**.

## 4. Three candidate cuts, all measured, all rejected

Run against the probe deck directly (`better-sqlite3`, readonly).

**(a) Push the requested key into the final projection.** `… SELECT rs.ckey,
rs.id FROM resolved rs WHERE rs.ckey = ?`. *Rejected: no speedup.*

| shape                                    | ms   |
|------------------------------------------|-----:|
| whole-deck walk (shipped), warm          | 77.5 |
| filtered to one key, warm                | 83.2 |
| filtered to one key, warm (2nd)          | 76.3 |

SQLite materializes the whole recursive CTE before the outer filter runs, so
the filter removes nothing. This is the same trap round 1's own comment
records for bounding the arms ("an order of magnitude slower").

**(b) `UNION ALL` + a final `SELECT DISTINCT`, to dedup once instead of at
every recursion step.** *Rejected: 20–30% slower, identical row set.*

| run | `UNION` (shipped) | `UNION ALL` + `DISTINCT` |
|-----|------------------:|-------------------------:|
| 1   |            64.3 ms |                   86.6 ms |
| 2   |            75.6 ms |                  103.0 ms |
| 3   |            78.4 ms |                   89.6 ms |

Row sets identical (19,481 = 19,481, set-equal). The shipped `UNION` is the
better shape; there is nothing to win here.

**(c) The `self` lookup is a no-op walk — drop the resolver call.** The code's
own note (`read-rules.ts:728-731`) claims one composed key yields exactly one
`(id, ckey)` row. **That part holds:** on the deck, 19,481 rows and 19,481
distinct ckeys — a key never maps to two ids. But the consequence does *not*:
walking 25 anchors and asking the universe for their own composed name resolved
to a **different** card in **25 of 25** cases, 0 absent. So `self` genuinely
resolves a sibling card, and the walk cannot be replaced by `[anchor.id]`.
*Rejected.*

## 5. What the remaining cut would require

The cost is structural, not incidental: one consumer, one key, and a 19,481-row
whole-deck composition, rebuilt once per mutation.

The render path already answers the same job ~10× cheaper
(`RULE_KEY_RULE_CLOSURE_STATEMENT`, `read-rules.ts:990`, with the cost
comparison at `:1105-1109`), and it cannot be used here because a card's own
composed name is not rule-shaped. Getting the write path off the whole-deck walk needs one of:

1. a per-key walk seeded from the requested key's `'+'`-segment runs (the shape
   round 1's note says it replaced), applied only to the `self` lookup; or
2. an **incremental** universe update — inserting one row per created card
   instead of dropping and re-walking. Adding a card adds exactly one
   `(id, ckey)` row; adding a junction does not change any other card's composed
   key. But an `UPDATE` that moves `left_id`/`right_id` or flips `trash` still
   forces a full rebuild, and the correctness of the incremental arm has to be
   pinned against the full walk on a real deck.

Both are changes to rule resolution, which is fail-open when wrong (see
`rule-closure-scoped-resolution.test.ts` for the precedent). Neither was landed
here: this round's budget bought the measurement, not a proof of equivalence.

## 6. Reproduce

```
git worktree add C:/localProjects/decko-ts-mini-writepath-20261020 -b perf/mini-writepath-20261020 d8050251
node tools/bundle-bunny-edge-engine.mjs
node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-BEFORE.json
```

The probe's statement text is truncated to 120 characters on the way into the
report (`tools/edge-signed-in-exercise/lib/local-hrana.mjs:61`), so the walk's
identity was confirmed against the source text at `read-rules.ts:811`, not from
the report's truncated copy.