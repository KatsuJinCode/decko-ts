# decko-ts parity ledger — 2026-09-22

The standing answer to "where is the port against byte-for-byte parity with
the Ruby oracle (card-1.110.0 / decko-0.20.0), and what is left." Numbers
cite their source; every claim names the command or file that produced it.

## Capstone doctrine (Julian, 2026-09-22 morning)

1. Once a suite or corpus surface is proven byte-identical, it is RECORDED
   below and NOT re-run during development. Regression re-verification
   happens ONCE, at the capstone. Proven suites' day-to-day protection is
   the narrow named-path tests of whatever is being changed, not sweeps.
2. The full 48-shard corpus replay is THE CAPSTONE: it runs once, at the
   very end, when every fix is landed — as the final proof and the record
   of everything byte-identical. It is not a development loop.
3. The 4-slice run launched 2026-09-21 23:35 is the BASELINE INVENTORY
   (pre-prepare-cache, pre-final-fixes): its results JSONs feed the final
   reconciliation, and the capstone run replaces its numbers.
4. Long runs happen in PARALLEL with all other work, never as a blocker.

Capstone cost after the prepare-cache fix (below): ~200k renders × ~56 ms
÷ 4 slices ≈ **under an hour**, down from ~8 h.

## The measure

The corpus replay (`benchmarks/corpus-v2/replay-shard.test.ts`) replays the
captured oracle corpus — 48 shards, 47,235 live cards, every captured card
record AND every captured rendered view — through the landed TS engine and
byte-compares against what Ruby actually rendered. Denied views are judged
(same anonymous viewer as the capture); nothing is skipped. The claim the
M1 milestone wants: zero unexplained divergences at corpus scale.

## Measured so far

Shard-000000 (1,000 lines; the smoke, commit 1bc526e):

| area | total | byte-exact | classified | real fail |
| --- | --- | --- | --- | --- |
| card records | 999 | 857 | 142 structure-pending* | **0** |
| rendered views | 3,242 | 2,831 (87.3%) | 410 real fails → all four classes FIXED below | — |

\* structure-pending = the record's content IS a *structure rule template;
those entries are proven byte-exact by
tests/card/render/structure-corpus-replay.test.ts (FULL sweep green, 465
entries, ~17 s).

## PROVEN byte-identical (recorded once; not re-run during development)

| surface | proven | evidence | commit |
| --- | --- | --- | --- |
| name engine (algebra + keys) | 2026-09-19 | tests/card/name/** | pre-31f2048 |
| fetch layer + key parity | 2026-09-20 | tests/card/fetch/**, corpus records 0 real fails | 31f2048 |
| read-permission denial bytes | 2026-09-21 | permission-corpus-replay.test.ts | 31f2048 |
| *structure templates (FULL 465 entries) | 2026-09-22 | structure-corpus-replay.test.ts FULL green | db2b30e/c58d64a |
| help-popover corpus entries (13 byte-exact) | 2026-09-21 | help-popover-corpus-replay.test.ts | 31f2048 |
| CodeRay json/css/html vs Ruby capture | 2026-09-22 | code-highlighting byte-identity (23 tests) | 1bc526e |
| rule bar-cols + bar_right one-line | 2026-09-22 | mini-bar-cols + rule-bar-right pins | c58d64a |
| set-card views (7 entries; 12 drifts classified) | 2026-09-22 | set-card-views-corpus-parity.test.ts | c58d64a |
| BadQuery/DateError sentinels | 2026-09-22 | search-bad-query-error + date-error tests | 1bc526e |
| Date cardtype valid path (strftime) | 2026-09-22 | date-cardtype-view.test.ts (16) | c58d64a |
| write conformance (8 Ruby scenarios) | 2026-09-21 | write-path.test.ts | 31f2048 |
| CQL MySQL-match battery (27/30 replay) | 2026-09-21 | S1 oracle rung, fixtures/captured/cql-mysql-match.json | 1bc526e |
| migration parity + determinism (606k rows) | 2026-09-21 | T4 proveDeterminism run | 31f2048 |
| follow-notification mail bytes (real capture) | 2026-09-22 | notify tests vs fixtures/captured/follow-notification.json | 1bc526e |

## The wrong thing found and fixed (2026-09-22, Julian: "you're probably
## doing something wrong")

`LocalSqliteDriver` had NO prepared-statement cache: every render
re-compiled every SQL text from scratch — the multi-KB recursive closure
walk TWICE per render plus the folded statements. Fixed with a
Map<sql-text, stmt> cache scoped to the driver handle (measured: steady-
state render ~570 ms → **~56 ms**, 10x; probe in perf-probes-2026-09-21/).
The capstone replay inherits this automatically.

## Failure classes found → their resolutions (all landed, all tested)

| class | size on shard-0 | resolution | proof |
| --- | --- | --- | --- |
| CodeRay syntax highlighting (json/css/html cardtypes) | largest | full port, byte-identical vs captured Ruby `CodeRay.scan(...).div`; wired into coreView | tests/card/render/code-highlighting/ (23 tests) |
| per-set bar-column rule | corpus:67 + 253 | rule-read with 6,6 rule-module default (bar-cols.ts) + rule cards' :bar_right one-line content (rule-bar-right.ts) | mini-bar-cols-setting.test.ts (12), structure FULL sweep |
| pointer/list cardtype content views | corpus:77 family | card-list pointer-list wrapper + item slots + swapBarSlotToMiniBar | pointer-list-content-view.test.ts (4) |
| missing render validations | corpus:77:open + 5 dates | BadQuery (invalid search JSON) + Date::Error raises, sentinel-byte-exact | search-bad-query-error.test.ts (9), date-error.test.ts (10) |
| set-card html views | 7 pinned entries | Rules section accordions, open-view hide list, set menu popover, rule bar classes | set-card-views-corpus-parity.test.ts |
| Date cardtype valid path | no oracle exists (all 4,021 corpus Date cards hold invalid content) | strftime core port, deterministic-seed tests | date-cardtype-view.test.ts (16) |

Render directory: 133/133 green (npx vitest run tests/card/render/, 2026-09-22 04:43) — recorded once per the capstone doctrine; not re-run.

## The data-drift class (classified, never excused)

The oracle bytes were captured from a live deck that had drifted from the
corpus dump the replay seeds: counts baked into bytes ("49 default rules"
vs the dump's truth), and *head rule rows the capture deck had and the dump
lacks (verified 2026-09-22: the dump holds exactly 4 *head rules, none on
the six affected sets — so a faithful render of the dump produces the
permission denial where the oracle pins the rendered bar). ~30 views total
across the corpus carry this. Each occurrence is counted and printed with
its evidence (set-card-views + structure suites); none is silently excused.

The clean elimination is a corpus re-capture from a dump-faithful deck
(~1 day including the re-replay). Decision: not worth it for the M1 claim;
booked for whenever the corpus regenerates for real reasons.

## What stands between here and the demo

1. 48-shard replay lands → aggregate the four slice inventories, reconcile
   every entry against the classes above (each maps to a fix or a drift).
2. One final full replay for the M1 number.
3. Redeploy the Cloudflare worker with the integrated engine; smoke the
   live deck.
4. Show Julian: the parity number, the live worker, and this ledger.

## What stands between the demo and 100% of the plan

- Write-path depth: 8 Ruby conformance scenarios green; set_read_rule save
  path (P3) and references write stream (P4) still open — their agents died
  silently (see below) and the scopes revert to the queue.
- Mod breadth: compat report says 1 ported / 30 partial / 2 ignored
  (tools/compat-report/); the corpus only exercises a slice of them.
- Side-effect wiring: notify's save-path integration hook (the ported
  follow-email needs its registration line landed in the action engine).
- PostgreSQL rung: 91 dialect tests green; live-PG proof specified, not run.
- M2/M3 product milestones (one-click deploy, live metrics) and the CF
  token cleanup owed after Julian sees the demo.

## Fleet post-mortem (2026-09-22 morning)

The three long-running regular agents (R3 search cores, P3 set_read_rule,
R4 HAML/ERB rules) were found inert at 8.5 h: timestamps show R3's last
exec at 20:27 the previous night and zero exec activity ever for P3/R4 —
all three died with the ZCode restarts and left stale registry rows. P3
and R4 wrote nothing; R3's outputs were already committed. Lessons applied:
liveness is judged from exec/transcript timestamps, never from "no
output.txt yet" or a file mtime; streams are scoped shorter with check-ins;
workflow-subagent results must be submitted before turn end (wave E's E1
failed exactly this way and was repaired by amend + salvage).
