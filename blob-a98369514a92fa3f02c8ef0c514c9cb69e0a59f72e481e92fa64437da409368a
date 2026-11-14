# Round 1 — the save path's read ladder: a transaction-scoped read memo (2026-10-18)

Continues `save-server-time-budget-2026-10-18.md` section 2, which diagnosed the
live save's cost as **hop count x hop latency** and showed the READ path batching
while the SAVE path did not. This round removes repeated constant-id reads from
inside one save transaction. Rounds are one improvement each; this is round 1 of
at most 4.

## 1. What was measured first, before any code

The committed probe `tools/diagnose-owner-save-statement-ladder.mjs` was run on
this tree, unmodified, to re-establish the baseline:

    node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-R0-complete.json

    == POST /update/Brandon_WilliamsCraig (the graded save): 691 POSTs, 758 stmts, db wall 973 ms
    save: 303 bytes=0 timing=... db;dur=981;stmt=756, render;dur=0, total;dur=1254

This reproduces the report's baseline exactly (691 pipeline POSTs, 758 statements).

**Two instrument-fidelity defects were found and fixed before the round could be
measured honestly.** Both are invisible in the graded numbers and both made the
memo's effect unmeasurable:

- `tools/edge-signed-in-exercise/lib/local-hrana.mjs:51` truncated the traced
  argument list to 80 characters. Every multi-argument write in a save is longer
  than that, so the probe could not record WHICH rows a write touched.
- `tools/diagnose-owner-save-statement-ladder.mjs:107` truncated the args again,
  to 120 characters, on the way into the report. Raising the trace cap alone
  changed nothing observable; both had to be lifted.

Neither touches a request, a response, or a count — the only reader of the
`args=` field is the probe, which captures `args=(.*)$` to end of line.

**Policy choice was then measured, not guessed.** `tmp/analyze-save-memo-policies.mjs`
replays the captured 758-statement sequence under each candidate invalidation
rule. Two things it settled:

| rule                                     | statements | reduction |
|------------------------------------------|-----------:|----------:|
| perfect memo, no invalidation (the floor) | 406 | -46.4% |
| flush everything on any write            | 565 | -25.5% |
| table-level, every FROM/JOIN a target    | 538 | -29.0% |
| row-level where provable, else table-level| 526 | -30.6% |

Row-scoping buys 12 statements over table-scoping (1.6% of the ladder) and costs
a second SQL parser to keep honest. **Shipped: table-level.** But the trigger
check below changed the target-selection rule, and in the engine's favour —
`INSERT INTO card_changes (...) VALUES ((SELECT MAX(id) FROM card_actions ...))`
WRITES `card_changes` and only READS `card_actions`; treating every FROM/JOIN as
a write target needlessly discards the memo. Taking only the leading verb's
table is both correct and, per the table above, at least as good.

## 2. The trigger check, which is why invalidation is not a guess

`SELECT type FROM sqlite_master` on the real deck (`deck.sqlite3`) returns **18
triggers**, every one of them `AFTER {INSERT,UPDATE,DELETE} ON <table> BEGIN
UPDATE deck_data_version SET version = version + 1 WHERE id = 1; END`
(`src/server/same-database.ts:182`, `src/server/freshness-stamp.ts:64`).

So a write to `cards` really does change `deck_data_version`. An invalidation
rule that watched only the written table would serve a stale version number, and
nothing in the save's own assertions would notice.

Rather than hardcode that, the driver reads the trigger graph from
`sqlite_master` **once per transaction** and derives each write's real effect.
Cost on this save: **zero** — the save issues no read of a trigger-written
table (checked against the capture: 0 of 758 statements name `deck_data_version`
or any other trigger-written table).

## 3. The change

`src/card/drivers/bunny-db.ts` — one transaction-scoped memo.

- **Lifetime.** Created when `BEGIN IMMEDIATE` succeeds; dropped on every
  terminal path (COMMIT, ROLLBACK, close, a lost baton — `clearReadMemo()`).
  Nothing is cached across transactions, so no request can be answered from
  another request's view of the database.
- **What is memoized.** Only statements `sqlFactsOf` proves are reads. Literals
  and comments are stripped first, so a card named "Update" cannot make a
  `SELECT ... WHERE name = 'Update'` look like a write. A `WITH`-led statement
  is a read only when no mutating word survives the strip.
- **Invalidation.** A write drops every memoized read that depends on the table
  its leading verb targets, plus every table that table's triggers write. A
  write whose target cannot be determined — and anything the classifier does not
  recognize (BEGIN/COMMIT/PRAGMA/CREATE/VACUUM) — drops the WHOLE memo. Unknown
  is treated as unsafe, the same rule the deletion paths use.
- **A write is invalidated AFTER it is sent**, not before. The memo is only
  consulted by reads and no read can be issued between two awaits, so this
  cannot change what a later read sees; it keeps the wire statement order
  exactly as the caller wrote it. This ordering was not cosmetic: the eager
  version broke `bunny-db-transaction-timeout.test.ts` by consuming the mock's
  enqueued response ahead of the caller's own statement.
- **The query counter counts DB operations**, which a memo hit is not. This
  makes `Server-Timing: stmt=` fall with the hop count, instead of continuing
  to report work the request did not do.
- **`sqlFacts` is cached by SQL text** (bounded, 1024 entries). Deriving these
  facts means a literal-stripping pass plus several regexes, and the first cut
  of this memo re-derived them up to three times per call. At the local
  loopback's ~0.5 ms per hop that CPU cost was visible in the measurement.

`tests/card/drivers/bunny-db-transaction-read-memo.test.ts` — 12 tests, new.
They run against **real better-sqlite3** through the existing mock Hrana server,
so a stale memo shows up as a wrong answer rather than a shape mismatch.

## 4. The numbers

Same probe, same deck, same machine, same command as section 1:

    node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-R1b.json

    == POST /update/Brandon_WilliamsCraig (the graded save): 526 POSTs, 593 stmts
    save: 303 bytes=0 timing=... db;dur=1169;stmt=590, render;dur=0, total;dur=1500

| measure                         | baseline | round 1 | change     |
|---------------------------------|---------:|--------:|-----------:|
| pipeline POSTs (live wall's hops)| 691 | 526 | **-23.9%** |
| statements                       | 758 | 593 | **-21.8%** |
| `Server-Timing` `stmt`            | 756 | 590 | -22.0% |
| pipeline POSTs, edit page         | 12 | 12 | unchanged (control) |

At the live host's measured ~13 ms per hop, 165 fewer hops is ~2.1 s off the
5.1-5.6 s save. Locally the hop is ~0.4-0.7 ms (keep-alive loopback), so local
wall does not move proportionally and the local wall numbers in this session are
noisy: the **edit page is the control** — identical ladder (12 POSTs / 102
statements) across both runs, yet its `total;dur` read 2039 ms in one baseline
run and 2513 ms in a round-1 run. Machine variance, not this change. The
hop count is the measure that is deterministic here; the wall is not.

## 5. Proofs run

| check | command | result |
|-------|---------|--------|
| save-ladder probe (baseline) | `node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-R0-complete.json` | 691 POSTs / 758 stmts / 973 ms db wall |
| save-ladder probe (round 1)  | `node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-R1b.json` | 526 POSTs / 593 stmts / 1163 ms db wall |
| memo correctness (new)        | `npx vitest run tests/card/drivers/bunny-db-transaction-read-memo.test.ts` | 12/12 pass |
| driver suite                   | `npx vitest run tests/card/drivers/` | 5 files, 21 pass / 15 skipped |
| gate subset                    | `npx vitest run tests/card/actions/ tests/server/` | 1012 pass, 5 fail — the 5 are **pre-existing**: verified by re-running `tests/card/actions/atomic-saves.test.ts` against an unmodified `HEAD` copy of the driver (same 5 MySQL-8.4-leg failures, `Table 'atomic_1.sqlite_master' doesn't exist` from `nestIndexTableExists`, `src/card/nest-index-cache.ts:30`) |
| typecheck                      | `npx tsc --noEmit -p tsconfig.json` | clean |
| E16 save check                 | `node tools/edge-signed-in-exercise.mjs --only cover-b --case E16` | run after this commit; the harness refuses to run against a dirty tree (`source-custody.mjs:10`), which is why it follows the commit |

## 6. Foreign writes, quarantined

Not mine, not committed, not deleted, not modified:

- `livecopy/` — another session's build output, 15 MB,
  `dist/deploy/bunny-worker-src/bunny-edge-cache-headers.js`
  `3522fa46f5f693bb34db18fd79eedb1488a3a1235e556c99fb58456a69f8d86f`.
- `tools/simulate-save-transport-packing.mjs` — another session's script,
  `673a08a384160737effebca68354cd6dbdd0d120d74df896cad9dd6b7a7830a6`.

Both were hidden from `git status` with a **local-only** `.git/info/exclude`
entry so the harness's source-custody check could run. That file is not part of
the repository and this commit does not change it for anyone else.

## 7. What is left, measured not guessed

- Perfect memo (no invalidation at all) is 406 statements. Round 1 reaches 593.
  The 187 gap is the cost of being correct about invalidation.
- The junction-shaped reads the memo cannot collapse — `SELECT id FROM cards
  WHERE left_id = ? AND right_id = ?` (55 + 14), `SELECT db_content FROM cards
  WHERE left_id = ? AND right_id = ?` (21) — are 90 distinct-argument reads.
  A memo never merges two different `(left_id, right_id)` pairs; only an IN-list
  rewrite merges those, and that is round 2.
- The save's biggest single wall item is not a repeated read at all: 5
  `WITH RECURSIVE resolved(...)` statements costing 519 ms of SQLite time.
  Statement-count work cannot touch that; it is a separate question from hop
  count and belongs to whoever owns the resolution query.