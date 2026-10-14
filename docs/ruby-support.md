# Ruby support

This repository serves Ruby Decko as well as the TypeScript engine:

1. **card-mod-batched-nests** (`ruby/card-mod-batched-nests/`): the batched
   loading that keeps this engine's query count flat, as a gem a stock Decko
   0.20.0 app adds to its Gemfile.
2. **One instrument for both engines**: the reference harness grades stock
   Ruby, Ruby with the gem, and the TypeScript engine with the same runner,
   fixtures and grader.

## card-mod-batched-nests

Stock Decko renders a nest by fetching its card when the nest is reached, so a
card nesting 200 cards costs about 200 queries, and a tree of 1,111 cards about
1,111. The gem loads the cards a content nests and links to before its chunks
render, a level at a time, and loads the cards Decko's own machinery needs
(list items, mod asset groups, the cards set patterns read, rule cards) in
batches. A nest tree then costs a few queries per level.

It is the proposed decko-commons/decko change for card 1.110.0 / decko 0.20.0,
packaged so it needs no fork:

- the change's new modules (`Card::Cache::Prefetch`, `PrefetchRelated`,
  `KnownRows`, `PrefetchRules`, `Card::Format::Nesting::Prefetch`,
  `Card::Lexicon::Prefetch`) are in `lib/card/` under their upstream names and
  paths; Decko autoloads a card mod's `lib/` directory;
- the change's edits to eleven existing files are modules prepended to the
  classes and set modules they edit (`lib/cardio/batched_nests.rb`), each
  naming the file it stands in for. They are installed by `config/late`, which
  Decko runs after the mods' sets load.

### Installing

```ruby
# Gemfile of a Decko 0.20.0 app
gem "card-mod-batched-nests", path: "<checkout>/ruby/card-mod-batched-nests"
```

Two settings, both on by default, can be set in `config/application.rb`:

| Setting | Effect |
|---|---|
| `config.prefetch_nests` | nests and links loaded a level at a time before rendering |
| `config.prefetch_machinery` | list items, asset groups, pattern cards and rule cards loaded in batches; codename cards kept in one cache entry |

With both false the stock code paths run.

### Query counts

`benchmarks/run_ruby_deep_nesting_bench.rb` seeds the shared `BenchDN`
fixtures into a deck and counts SQL queries (schema queries excluded) for one
cold render (`Card::Cache.reset` first) of each fixture's root in the `open`
view.

Measured 2026-10-14, Ruby 3.4.11 (x64-mingw-ucrt), decko 0.20.0, card
1.110.0, sqlite3, on copies of `reference-harness/fixtures/synthetic-v2/deck`,
one warmup and one measured cold render per fixture. The run records are
pinned under their SHA-256 in `benchmarks/results/runs/`:
`deep-nesting-ruby-014bd126730480e7.json` (stock) and
`deep-nesting-ruby-433a5529609786ab.json` (with the gem; its `config` block
records `batched_nests_gem`, `prefetch_nests` and `prefetch_machinery`).

| Fixture | Cards | Stock 0.20.0 | With card-mod-batched-nests |
|---|---:|---:|---:|
| chain d1 | 1 | 4 | 3 |
| chain d2 | 2 | 5 | 4 |
| chain d4 | 4 | 7 | 6 |
| chain d8 | 8 | 11 | 10 |
| chain d10 | 10 | 13 | 12 |
| chain d16 | 16 | 19 | 18 |
| chain d20 | 20 | 23 | 22 |
| fan f1 | 2 | 5 | 4 |
| fan f4 | 5 | 8 | 4 |
| fan f16 | 17 | 20 | 4 |
| fan f50 | 51 | 54 | 4 |
| fan f100 | 101 | 104 | 4 |
| fan f200 | 201 | 204 | 4 |
| tree d4xf4 | 341 | 344 | 8 |
| tree d3xf10 | 1,111 | 1,114 | 9 |

Chains of 50, 100 and 200 cards exceed Decko's `max_depth` of 20 and are
refused by both, as in stock Decko; those rows are in the run records. A chain
is one nest per level, so batching a level saves nothing there; the one query
saved is machinery batching.

To reproduce, from `reference-harness/oracle/app` on a copy of a deck
(`BUNDLE_GEMFILE=Gemfile.batched` for the gem, unset for stock):

```bash
RAILS_ENV=development DATABASE_URL=sqlite3:<deck copy> \
BENCH_OUT=<out.json> BENCH_RENDER_N=1 BENCH_WARMUP=0 \
BENCH_DEPTHS=1,20 BENCH_FANOUTS=200 BENCH_TREES=4x4,3x10 \
  bundle exec decko runner ../../../benchmarks/run_ruby_deep_nesting_bench.rb
```

The full sweep and its comparison with the TypeScript engine are in
`docs/scaling-comparison-deep-nesting.md`. Wall-clock times are recorded in
the output but not compared here.

### Rendered output is unchanged

`ruby/card-mod-batched-nests/test/render_digest.rb` renders every card of a
deck from a cold cache in the `open`, `core` and `titled` HTML views and the
`molecule` JSON view, and records the bytes; rendering errors are recorded by
class and message. `test/byte_identity.rb` takes three runs on copies of the
same deck: stock, stock again (the control), and with the gem.

Stock Decko does not render the same bytes twice. The control finds what
varies between two stock runs, and only those values are masked:

| Masked value | Where stock Decko produces it |
|---|---|
| `data-slot-id` | card-mod-format `set/all/html/wrap.rb` writes `SecureRandom.hex(10)` into every wrapped slot |
| accordion context in `card-<key>-<context>-collapse-id` | card-mod-bootstrap `set/all/bootstrap/accordion.rb` builds the id; on the admin dashboard the context is a number that differs between two stock runs (where the caller gets it has not been traced) |
| the `*now` card's content | the current time, to the minute |

A value is masked only if the control still differs when that value alone is
left unmasked, and the check fails if the control differs anywhere else.

Result, 2026-10-14, on a copy of `reference-harness/fixtures/synthetic-v2/deck`
(951 cards, 3,804 renders), Ruby 3.4.11, decko 0.20.0, card 1.110.0:

| Run | Queries | Renders differing from stock, raw | after masking |
|---|---:|---:|---:|
| stock control | (sharded, 8 processes) | 2,312 | 0 |
| with card-mod-batched-nests | 52,070 (stock: 147,229) | 2,312 | 0 |

All three masks were needed by the control. With them, all 3,804 renders under
the gem are byte-identical to stock.
The check cannot see a difference inside those three values; everything
else in every render is compared byte for byte. The raw counts agree too:
the same 2,312 renders differ in the control as under the gem.

```bash
# in reference-harness/oracle/app, each run on its own copy of the same deck
DATABASE_URL=sqlite3:<copy 1> DIGEST_OUT=stock.json   bundle exec decko runner ../../../ruby/card-mod-batched-nests/test/render_digest.rb
DATABASE_URL=sqlite3:<copy 2> DIGEST_OUT=control.json   bundle exec decko runner ../../../ruby/card-mod-batched-nests/test/render_digest.rb
BUNDLE_GEMFILE=Gemfile.batched DATABASE_URL=sqlite3:<copy 3> DIGEST_OUT=gem.json   bundle exec decko runner ../../../ruby/card-mod-batched-nests/test/render_digest.rb
ruby ../../../ruby/card-mod-batched-nests/test/byte_identity.rb stock.json control.json gem.json
```

A run takes about 40 minutes in one process (the oracle app's file cache is
cleared before every render). `DIGEST_SHARD=i/n` splits it across processes;
pass the shard files comma-separated.

## One instrument for both engines

The reference harness (`reference-harness/SPEC.md`) drives an engine through
an adapter and grades its answers against the stock Ruby oracle's captures.
Three adapters share it:

| Adapter | Engine |
|---|---|
| `adapters/ruby/` | stock Ruby Decko 0.20.0 (the oracle itself) |
| `adapters/ruby-batched/` | Ruby Decko 0.20.0 with card-mod-batched-nests |
| `adapters/ts/` | this TypeScript engine |

`adapters/ruby-batched` runs the same oracle app and `adapter.rb` under
`app/Gemfile.batched` (`oracle/run-adapter.sh batched`), so a grade of it
against the stock captures is a second check that the gem changes no output.

Graded 2026-10-14 on `fixtures/synthetic-v1` (fixture digest `7a96292d…`),
adapter checkout `71b43a84` (clean), Ruby 3.4.11 x64-mingw-ucrt, normalisation
N1–N3; report in `reference-harness/grade-reports/synthetic-v1-ruby-batched-report.json`:

| Kind | Graded | Pass |
|---|---:|---:|
| rendering | 1,754 | 1,754 |
| semantics | 2,389 | 2,389 |
| persistence | 16 | 16 |
| side effects | 19 | 19 |
| reads that wrote only what the oracle's reads wrote | 8 | 8 |
| write steps whose other tables match the oracle's | 12 | 12 |

Verdict: pass. The report's `actual` field names where the results were
written; it is replaced by a placeholder because that directory was outside
the checkout.

```bash
node runner/run.mjs --adapter adapters/ruby-batched/adapter.json --fixture fixtures/synthetic-v1 --out <resultsDir>
node runner/grade.mjs --fixture fixtures/synthetic-v1 --actual <resultsDir> --report report.json
```
