# Render-fix notes: the uniform-slow-corpus-render defect and the deep-junction nest defect

Stream: render-fix (2026-09-20). Two evidence-backed defects, both fixed in
`src/card/render/**` with byte-parity preserved. Everything below cites a
measured artifact or a Ruby-source line; nothing is from memory.

## Defect 1 — every corpus render cost ~1.4 s+ where Ruby costs ~4.5 ms

### Symptom

`benchmarks/corpus-v2/diagnose-slow-entry.test.ts` (shard 0: 1009 cards
seeded into the in-memory LocalSqliteDriver, 3242 render entries) completed
every render but slowly and uniformly. Synthetic depth-sweep chains rendered
in 0.1 ms warm / 2.4 ms cold — the slowness was specific to corpus-shaped
roots.

### Profile (tests/card/render/slow-entry-profiling.test.ts, temporary
harness; full shard-0 seed, 120-entry subset spread across the shard)

| measurement | value |
|---|---|
| avg per-entry wall | 4206.1 ms |
| avg per-entry time inside driver.query/batch | 4205.3 ms (**JS share ~0%**) |
| worst entry | 172015 ms (`nylnnxhfjjnlez:open`) |
| statement shape dominating | `WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 10000), frontier(key) AS (...)` — the prefetcher's two walk statements: `x2 total=347736.8 ms` on the worst entry |
| warm re-render of an already-rendered root | 0.2 ms, **0 driver calls** (closureWarm works; the cost is the cold prefetch per new root) |
| EXPLAIN QUERY PLAN of the walk | recursive step = `SCAN f` (frontier) × `SCAN n` (10 000 nums rows) × `SEARCH c USING INDEX cards_trash_index (trash=?)` |

### Mechanism (two cooperating causes)

1. **The numbers-table span scan.** The walk CTE enumerated `{{` positions by
   joining a 10 000-row recursive `nums` table against every frontier card
   and evaluating `substr(c.db_content, n.n, 2) = '{{'` (+ an `instr` over a
   fresh `substr`) at every position. That is O(10k × frontier) string
   allocations per walk, re-paid on every cold root.
2. **The key join could not use the key index.** The plan shows the card
   lookup falling back to `cards_trash_index` — trash=0 matches ~all rows —
   instead of `cards_key_index`. Why: `db/schema.sqlite.sql` declares
   `cards_key_index` as `ON "cards" ("key" COLLATE NOCASE)` (the UNIQUE
   rejection semantics from production), while the CTE joined with
   `c."key" = f.key` under the column's implicit BINARY collation. SQLite
   will not use a NOCASE-ordered index for a BINARY equality, so **every one
   of the 10k × frontier positions probed ~all 1009 cards**. The same
   collation mismatch affects every BINARY `key = ?`/`IN` lookup engine-wide
   (see "Out of scope" below).

Multiplying: ~10k positions × frontier rows × ~1009-row probe ≈ tens of
millions of row visits per walk — the measured 1.7 s–173 s per cold render.

### Fix (src/card/render/prefetch.ts, `walkStatement`)

1. **Span-chain walk instead of the numbers table.** The frontier is now
   `frontier(t, rest)`: `t` = a target key, `rest` = the content still to
   scan. Four recursive arms — seed the scan of a matched target (`substr`
   once, only for content that `LIKE '%{{%'`), advance one `{{` span by
   slicing the cursor with `instr`, emit the span's best-effort key
   (cut-at-`|`, trim, lower, spaces→underscores — the same transform as
   before), and terminate the scan. Rows are pure functions of (key, scan
   position), so `UNION` dedups and cycles terminate exactly as before.
   Cost drops from O(10k × frontier × cards) to O(total content chars) in
   C-speed `instr` scans.
2. **Key comparisons annotated `COLLATE NOCASE`** (the CTE target matches
   and the fallback `key IN (...)` / side-key joins). Lossless: decko keys
   are lowercased ASCII by construction (schema-notes.md), so NOCASE
   equality is the same relation as BINARY equality — and the planner can
   now seek `cards_key_index`.
3. The content scan cap stays (`SQL_CONTENT_SCAN_CAP`, 10k chars); content
   past the cap rides the JS fallback exactly as before, and the fallback
   remains the semantic authority, so byte parity is untouched.

### Result (post-fix measurement)

Full shard-0 diagnostic re-run (all 3,242 render entries, 2026-09-21, this
repo, in-memory better-sqlite3): **0 timeouts, 0 engine exceptions, worst
entry 697.8 ms** (pre-fix worst: 172,015 ms — a 246x tail cut), total
644 s ≈ **199 ms/entry average** (pre-fix subset average was 4,206 ms).
The remaining average is honest work, not the old pathology: ~55% of
corpus views are permission-denied in Ruby (98,747 of 180,442 captured
views start with the denied span) and the TS engine — whose read-rule
layer is a separate pending stream — renders those FULLY, paying real
inclusion-closure cost where Ruby emitted 76 bytes; plus every entry here
is a cold top-level render. The `nums` statement shape no longer appears
in the driver log.

## Defect 2 — deep junction nests threw `nest target not found`

### Mechanism (confirmed from docs/deploy-notes.md finding 2, then re-derived)

- The recursive CTE joined the frontier on `c."key" = f.key`. Post-2020
  junction rows carry NULL name/key columns (2020 Lexicon convention), so a
  junction reference key (`a_b+c`-form composed key) never matched a row and
  junctions never entered the SQL frontier.
- The JS fallback (`verifyClosure`) handled junction references with a
  side-key join that required BOTH sides to be simple keys, and its
  `matchedPairs` resolution recorded only one-joint pairs. A depth-3
  reference (`A+B+C`: left side `A+B` is itself compound) was decomposed
  into pending sides but never re-assembled — the junction row for `A+B+C`
  was never fetched, and the render's `format.nest` threw
  `nest target not found` where Ruby rendered.

### Fix (src/card/render/prefetch.ts)

1. **SQL side — junction targets enter the walk.** A new recursive CTE
   `resolved(id, ckey)` composes the key of EVERY non-trashed row: simple
   cards from their key column; junction rows one joint per pass in both
   orientations (`left.ckey || '+' || right."key"` for a resolved left and a
   simple right, then the mirrored arm) — the `DbLexicon.nameToLex`
   walk (src/card/fetch/lexicon.ts) expressed in SQL, to fixpoint. This is
   legal single-statement SQLite: each recursive arm references the
   recursive table exactly once (compound-arm recursive selects), and a
   second recursive CTE may reference the first (both probed empirically on
   better-sqlite3 13 / SQLite 3.53, Windows — probe preserved in the
   stream's profiling harness output). The frontier scan arm matches targets
   through `resolved`, and the walk/type+side final selects fetch rows
   through `resolved` — so junction cards' CONTENT participates in the SQL
   closure walk at any depth. The driver batch stays ONE round trip with
   the same two statements (the #1282 shape; pinned counts unchanged).
2. **JS side — the fallback resolves compound references recursively through
   side ids.** `verifyClosure` now partitions each round's pending names:
   depth-2 pairs keep the direct side-key join (sides fetched in the same
   round so composition succeeds); a compound reference whose sides are both
   already known joins the junction row by its UNIQUE
   `(left_id, right_id)` pair (`index_cards_on_left_id_and_right_id`); a
   reference with an unresolved compound side pushes the sides as pending —
   the same recursion DbLexicon does — until the junction resolves through
   its composed key. Rounds stop when nothing new fetches (unknown names are
   the render's decision, wave 3), bounded by MAX_FALLBACK_ROUNDS.
3. `composeAndCache` returns the composed records so the closure walk can
   index composed-key → id (the resolution check no longer needs the old
   one-joint `matchedPairs` bookkeeping).

### Proof

- Synthetic: tests/card/render/junction-depth-closure.test.ts — depth-3 and
  depth-4 junction inclusion chains render their nested bodies with
  `fallbackRounds === 0` (pure SQL closure), constant #1282 query shape
  (5 round trips / 6 statements), a plural-stem depth-3 chain that forces
  the recursive side-id fallback, and the depth-2 shape unchanged.
- Corpus: tests/card/render/junction-depth-corpus-replay.test.ts — corpus
  entry 3360 (shard-000002), a depth-3 junction card whose content nests the
  depth-5 junction `iimvszurewpkg+kvypbzbzhcjjwar+cfvoytpxlh+geyhnubhb+
  xptdirwqgothvb`, replays all four captured Ruby views (closed/content/
  open/title) byte-identically through the replay harness. Before the fix
  this class threw `nest target not found` (the replay driver's nestGap
  classification, benchmarks/corpus-v2/replay-shard.test.ts:300-305).

## Gates

- `npx tsc --noEmit`: **exit 0, repo-wide** (2026-09-21, coordinator-run after stream recovery).
- `npx vitest run tests/card/render`: **29/29 across 7 files** — includes
  oracle-replay 20/20 byte-exact, the depth-sweep constant-query pins,
  junction-depth-closure 4/4 (depth-2 at 5 RT/6 statements, depth-3 and
  depth-4 covered by the pure SQL walk with fallbackRounds === 0, and the
  deliberate plural-stem miss exercising the recursive side-id fallback),
  and the corpus proof test: corpus entry 19334 (shard-000014, a depth-3
  junction nesting a depth-3 junction) replays all four captured Ruby
  views byte-identically.
- Full `npx vitest run`: deferred until the parallel streams (set-keys
  parity, unknown-nest, read-permission) land; the corpus replay numbers
  above are their shared before-picture.
- Corpus replay classification on shard 0 with this stream's fixes landed:
  999 records → 728 pass / 270 structure-pending / 1 real; 2,426 judged
  renders → 1,650 pass / 148 structure-pending / 112 nest-target /
  816 permission-pending / 516 real (set-key class fragment mismatches,
  the next stream's target).

## Completions on top of this stream (2026-09-21)

The original measurement pass was cut short by a system restart; the
work was finished from its on-disk state:
- `composeAndCache` cross-call composition: sides cached by an earlier
  fallback round now resolve through the lexicon (warm reads), so a
  junction fetched in round N composes instead of re-fetching forever.
- The batch's side expansion is RECURSIVE to fixpoint (`reached` CTE):
  a junction chain needs its sides' sides in-batch or mid-chain
  junctions compose only through cold per-card lexicon queries
  (measured: 3 extra round trips per chain level).
- Test fixtures: junction chains use digit-suffixed part names because
  DeckoName.key SINGULARIZES (measured: key("beta") = "betum"), and the
  counting driver is reset before render so the pins measure the render,
  not the seed INSERTs.

## Out of scope / honest notes

- **Fetch-layer BINARY key lookups** (`src/card/fetch/**` — another
  stream's territory): `lexQuery`'s `key = ?` and the fetch layer's key
  lookups still compare under BINARY and cannot seek `cards_key_index`
  either. Invisible at local scale (in-memory 1k rows), a latent O(n) lookup
  at 47k scale. The fix belongs to the fetch stream (annotate `COLLATE
  NOCASE` the same way) or a BINARY-collated companion index in
  db/schema.sqlite.sql (schema stream's call).
- **Unknown-card nests** (`{{name}}` where the card does not exist): the
  corpus profile surfaced 8/120 subset entries that throw
  `nest target not found` for genuinely absent SIMPLE targets — Ruby renders
  an unknown-nest view (wave 3, format.ts's documented deferral). Unchanged
  by this stream; the diagnostic records them as errors and moves on.
- The `resolved` closure computes composed keys for all junction rows of the
  deck per walk statement (one materialization each, ~O(junction rows)). At
  47k scale that is still one indexed statement per walk, and only on cold
  roots; if it ever matters, the closure can move to a maintained table —
  noted, not built.
