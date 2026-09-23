# Benchmark corpus + Ruby nesting-depth report (decko-ts, #1282 program)

Status: corpus built and verified; first real Ruby R1/R2 numbers measured.
Companion documents: `benchmarks/METHODOLOGY.md` (commitment map),
`benchmarks/results/*.json` (machine-readable artifacts, each carrying its
own environment block). Date of all measurements: 2026-09-19.

## 1. The sanitized benchmark corpus

- Source: `source-deck-migration/incoming/source-deck-2026-09-07.sql`
  (1.2 GB mysqldump), parsed in one linear pass anchored on
  `INSERT INTO ... VALUES` line boundaries (no chunk-wide backtracking
  regexes; per-field matching is the quote/backslash-aware scanner pattern
  already proven on this dump by the privacy-review tooling).
- Output: `benchmarks/corpus/bench-corpus.sqlite3` (gitignored, ~207 MB,
  rebuildable with `python benchmarks/sanitize_corpus.py`), plus
  `benchmarks/corpus/sanitize-manifest.json`.
- Contents: 49,829 card rows (47,235 live + 2,594 trashed preserved with
  flags), 556,526 card_references rows with all ids preserved as-is.
  Reference-type mix: `I` (inclusion) 283,157 -- the recursion benchmark
  asset -- plus `L` 23,386, `P` 247,610, `Q` 2,373.
- Schemes (details in the script header of `sanitize_corpus.py`):
  - **Names**: simple named cards get a lowercase-letters token of exactly
    the original name's byte length, derived from the card id, made
    globally unique by deterministic collision rehash. Junction names
    compose their parts' tokens through the left_id/right_id graph, so
    part count, depth and topology are preserved by construction.
  - **Content**: byte-length preserving; HTML tag skeleton kept with
    attributes stripped; comments gutted; text runs replaced with
    deterministic letter filler (newlines preserved); `{{inclusions}}`
    resolved to the target's sanitized name where the name resolves,
    otherwise filler of the same length. When content is pure markup
    (third-party embeds), the freed byte budget is appended as a trailing
    filler run so the total stays exact.
  - **Codenames / referee keys**: deterministic collision-free synthetic
    tokens (same input -> same token), padded toward original length.
  - **Timestamps**: all shifted by one fixed offset (+427 days, +11111 s);
    intervals and ordering preserved, absolute dates broken.
  - **Determinism**: per-card/vocabulary PRNG streams seeded from ids;
    verified by running the pipeline under two different
    `PYTHONHASHSEED` values and comparing a content+name digest
    (`2a9d51d6...` both runs).

### 1.1 Source-dump facts discovered while building

- **80% of live cards arrive with `name IS NULL`** (37,769 of 47,235; both
  sides of the fidelity check agree on 9,466 named live cards). The dump
  reaches this pipeline with names already stripped for most rows, so the
  corpus preserves that state: named cards are sanitized, unnamed cards
  stay unnamed.
- **No `*read` rule cards exist by name** (0 rows matching `*read` /
  `+*read`) -- rule-card names were stripped like all other names. The
  read-rule synthetic role-bucket transform is implemented in the
  sanitizer but is a no-op on this dump. The structural read-rule columns
  (`read_rule_class` with values like `*all plus` / `*right` / `*self`,
  and `read_rule_id`) are preserved as-is. Reader-list cardinality
  preservation is therefore untested against this corpus (gap, section 5).

## 2. Structural fidelity (verify_sanitized.py)

`verify_sanitized.py` recomputes original-side metrics straight from the
dump and sanitized-side metrics from the corpus SQLite; it never trusts
the sanitizer's manifest. Results (also in
`benchmarks/results/corpus-verification.json`):

| metric | original | sanitized | equal |
|---|---|---|---|
| card rows total | 49829 | 49829 | yes |
| live cards | 47235 | 47235 | yes |
| trashed cards | 2594 | 2594 | yes |
| references rows | 556526 | 556526 | yes |
| references multiset (referer, referee, type, present) | -- | -- | yes |
| type distribution (live) | 47235 | 47235 | yes |
| name-length histogram (named live) | 9466 | 9466 | yes |
| content-length histogram (live) | 47234 | 47234 | yes |
| junction part-count distribution | max 6 | max 6 | yes |
| row-level topology (id, left_id, right_id, type_id) | 47235 rows | 0 mismatches | yes |
| top-20 inclusion fan-out degrees | max 112 | max 112 | yes |

Everything the #1282 corpus commitment names is preserved exactly. The
build iteration history is worth recording: the first scheme (`p<id>`
name tokens) shifted 858 of 9,466 name lengths (token length varies with
id digit count) and pure-markup embed contents lost their freed byte
budget (168 cards short, 3 over). Both were fixed -- length-fitted unique
name tokens and the trailing-filler rule for zero-run content -- and the
final verification is exact.

## 3. Content-absence proofs

- **Word 5-grams**: 30,979 5-grams extracted from tags-stripped original
  content of 217 deterministically sampled cards (rule `id % 199 == 3`)
  vs the same cards' sanitized content: **overlap 0**.
- **Sampled card names**: 50 original names sampled with a seeded PRNG;
  49 absent from the corpus name+key space as substrings. The single
  "hit" is a **1-character name** -- a one-letter substring of random
  letters is statistically unavoidable and not a leak (substring testing
  is only meaningful from ~4 characters up; exact-name checking passes).
- **Distinctive content tokens**: 11/11 sampled original alpha tokens
  (>= 8 chars) absent from every sanitized content.
- **Deterministic leak patterns** (the proven public-leak scanner's
  keyword list + email pattern, plus SSN/phone digit shapes), scanned
  over ALL sanitized names, contents and referee keys with cheap
  rejection prefilters (email requires `@`; digit shapes require a
  digit -- filler contains neither, so those hits are structurally
  impossible):

| pattern | sanitized corpus | original instrument sample (217 texts) |
|---|---|---|
| email | 0 | 85 |
| ssn shape | 0 | 0 |
| phone shape | 0 | 10 |
| keyword list | 14 | 39 |

  The instrument column proves the scanners fire on real text. The 14
  sanitized keyword hits were each inspected with context: all are
  3-letter keywords (`mom`, `dad`, `son`) materializing as short random
  filler runs at tag boundaries, e.g. `<div>mom </div>`, `<div>dad</div>`
  -- a coincidence class the filler's construction makes unavoidable
  (P(exact 3-letter run matches one of the 3-letter keywords) ~ 1/5859
  per such run). No original text is involved; the same scan on real
  content is what the instrument column shows.

## 4. Ruby R1/R2: queries per render vs nesting depth (the money number)

Artifact: `benchmarks/results/ruby-nesting-r1-r2.json` (full per-render
records + environment block: Ruby 3.3.12, card 1.110.0 / decko 0.20.0,
Rails 7.2.3.2, SQLite `db/development.sqlite3` 4,751,360 bytes,
i7-14700F, 32 GB RAM, Windows x64-mingw-ucrt). Harness:
`benchmarks/run_ruby_bench.rb` against the oracle app; seeds only
`BenchR1`-prefixed cards; 400 background cards; 15 measured renders +
3 warmups per shape; query counts via `ActiveSupport::Notifications` on
`sql.active_record` (SCHEMA excluded); render path is Anonymous (the
realistic page path). Cleanup proved in-artifact: 550 cards deleted,
0 remaining, live count before seed == after cleanup (617).

**Cold mode** (card cache evicted before every fetch+render -- the full
query path, where the N+1 shape lives):

| shape | depth / fanout | nest style | queries per render (median) | wall ms (median) |
|---|---|---|---|---|
| chain | 1 | open | 4 | 16.3 |
| chain | 2 | open | 5 | 27.4 |
| chain | 4 | open | 7 | 47.7 |
| chain | 8 | open | 11 | 84.9 |
| chain | 16 | open | 19 | 165.5 |
| chain | 32 | open | render ERROR at max_depth cap | -- |
| chain | 1 | content | 3 | 7.6 |
| chain | 2 | content | 4 | 9.4 |
| chain | 4 | content | 6 | 22.3 |
| chain | 8 | content | 10 | 31.4 |
| chain | 16 | content | 18 | 53.6 |
| chain | 32 | content | render ERROR at max_depth cap | -- |
| fan | 1 | open | 5 | 26.8 |
| fan | 4 | open | 8 | 60.9 |
| fan | 16 | open | 20 | 239.2 |

Headline: **Ruby query count is linear in inclusion depth -- exactly
depth + 3 (open view) / depth + 2 (content view): one additional SQL
query per nesting level, i.e. per nested card** (19 queries at depth 16
vs 4 at depth 1), and linear in fan-out (fanout + 4). Wall-clock grows
roughly linearly too. This is the Ruby side of the #1282 N+1 claim; the
TS side must hold a constant number of queries per render regardless of
depth, and `run_ts_bench.ts` registers the identical shapes for that
comparison (currently all PENDING -- the render engine lands in wave 3;
no numbers are fabricated).

**Warm mode** (cache-hot render): **0 SQL queries at every depth** --
Decko's process card cache serves warm renders entirely from memory.
Both modes are recorded because they answer different questions: cold is
the query-path cost per unique page, warm is the steady-state cost of a
long-running process.

**Engine guard finding**: Decko caps render recursion at
`Card.config.max_depth` (default 20) and raises
`Card::Error::UserError` ("Man, you're too deep. (Too many levels of
nests at a time)") -- depth-32 chains raise at ~24 queries into the cold
path. Recorded as a result, not a crash: the port must replicate the
guard, and the Ruby depth curve's measurable range is 1..16.

Incidental observation from the same artifact: deleting 550 bench cards
through the card API took 466.6 s (~0.85 s/card) -- noted as a
write-path datapoint, not part of R1-R4.

## 5. Honest gaps

- **Reader-list role buckets untested**: this dump carries no named
  `*read` rule cards, so the cardinality-preserving role-bucket
  transform has no input here (section 1.1). It is implemented and
  unit-testable against a dump that retains rule names.
- **Corpus-scale Ruby runs**: the depth curves are measured at
  ~1,000-card DB scale (400 background cards), not at the 47k corpus
  scale; `BENCH_BACKGROUND` is the rerun knob. Corpus scale is wired for
  R3 (CQL latency), whose Ruby/TS measurement runs are the next wave.
- **TS side**: `run_ts_bench.ts` is a registry scaffold; all 30 shape
  entries report PENDING (`results/ts-nesting-r1-r2.json`). R4 CPU-ms is
  plumbed through the TS metrics interface and the Ruby artifact does
  not yet carry a CPU-ms column (wall-clock only); wave 3 adds it
  symmetrically.
- **Determinism**: verified at the pipeline level (digest stability
  across Python hash seeds on a 1,934-row slice); a full byte-level
  re-run check of the 207 MB corpus was not performed.
- **Repo checks at finish time**: `npx tsc --noEmit` over the whole repo
  is red from concurrent in-flight work in `src/card/fetch/*` and
  `src/cql/*` (other agents live in those directories); the benchmark
  program's own TS (`benchmarks/**`) typechecks clean in isolation
  (`tsc -p` with include limited to `benchmarks/**`: 0 errors), and
  `npx vitest run` failures (10, all in `tests/cql/execution.test.ts`)
  are likewise in the concurrently-edited CQL area, untouched by this
  work.
