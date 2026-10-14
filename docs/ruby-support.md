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
1.110.0, sqlite3, on a copy of `reference-harness/fixtures/synthetic-v2/deck`:

| Fixture | Cards | Stock 0.20.0 | With card-mod-batched-nests |
|---|---:|---:|---:|
| chain d1 | 1 | 4 | 3 |
| chain d20 | 20 | 23 | 22 |
| fan f200 | 201 | 204 | 4 |
| tree d4xf4 | 341 | 344 | 8 |
| tree d3xf10 | 1,111 | 1,114 | 9 |

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
class and message. `test/byte_identity.rb` compares a run in the stock app
with a run in the app with the gem and fails on any difference.

```bash
# in reference-harness/oracle/app, each on its own copy of the same deck
DATABASE_URL=sqlite3:<copy 1> DIGEST_OUT=stock.json \
  bundle exec decko runner ../../../ruby/card-mod-batched-nests/test/render_digest.rb
BUNDLE_GEMFILE=Gemfile.batched DATABASE_URL=sqlite3:<copy 2> DIGEST_OUT=gem.json \
  bundle exec decko runner ../../../ruby/card-mod-batched-nests/test/render_digest.rb
ruby ../../../ruby/card-mod-batched-nests/test/byte_identity.rb stock.json gem.json
```

Result on the synthetic-v2 deck: not yet recorded.

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
against the stock captures is a second check that the gem changes no output:

```bash
node runner/run.mjs --adapter adapters/ruby-batched/adapter.json --fixture fixtures/synthetic-v2 --out <resultsDir>
node runner/grade.mjs --fixture fixtures/synthetic-v2 --actual <resultsDir> --report report.json
```
