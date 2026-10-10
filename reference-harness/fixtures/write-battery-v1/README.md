# write-battery-v1 — the synthetic deck the write batteries run on

One committed synthetic deck plus the Ruby oracle's recordings beside it. It
is the starting state for the two deep write-parity instruments this
repository runs publicly:

- the 70-operation write probe — `tests/tools/persist-write-probe.test.ts`,
  comparing every operation's row delta with `expected/persist-steps/`;
- the 90-step side-effects scenario battery —
  `tests/tools/side-effects-scenario-battery.test.ts`, comparing the engine's
  trace with `expected/side-effects-ruby.json` through
  `tools/parity-side-effects/compare.mjs`.

Everything here is synthetic: invented names, example.com addresses,
fixture passwords, a generated deck on top of a stock Decko seed. No private
deck, no Ruby install and no environment variables are needed to run the two
batteries — only the repo's own build artifacts (dist, the LibSass program).

## Layout

| path | what it is |
| --- | --- |
| `deck.json` | the fixture's plain-data deck description (generator output) |
| `deck/deck.sqlite3`, `deck/files/` | the built deck: a stock `decko setup` seed with `deck.json` applied by the oracle builder, assets pre-compiled |
| `expected/persist-steps/step-NN.json` | the Ruby oracle's state after each of the 70 write operations |
| `expected/persist-steps/ruby-outside-delta.json` | the rows the 70 operations wrote outside the probe's own records (Ruby's whole-deck delta) |
| `expected/persist-steps/deliberate-differences.json` | the declared engine differences on this deck (steps 7, 20, 22, 31, 67) |
| `expected/side-effects-ruby.json` | the Ruby oracle's recorded trace of the 90 scenario steps |
| `MANIFEST.json` | the sha256 of every file above and how each recording was made |

## How it was built and recorded

All three steps run under the reference oracle (`reference-harness/oracle/`,
stock decko 0.20.0 / card 1.110.0); the exact commands and durations are
recorded in `MANIFEST.json`'s `provenance`.

1. Generate and build the deck:

       node reference-harness/corpus/generate-write-battery-deck.mjs reference-harness/fixtures/write-battery-v1
       bash reference-harness/oracle/build-deck.sh reference-harness/fixtures/write-battery-v1

2. Eat the mods' declared data into the built deck
   (`tools/parity-side-effects/ruby/seed.rb`, the loader `decko update`
   uses): the stock seed's template cards ship without the account and
   email mods' data — the email stylesheet card is RichText instead of
   SCSS, and every notification mail then fails to render — so the eaten
   copy becomes the fixture deck:

       cd reference-harness/oracle/app
       bundle exec ruby <repo>/tools/parity-side-effects/ruby/seed.rb . \
         <repo>/reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 <work dir>
       # <work dir>/ruby-deck.sqlite3, checkpointed, is committed as
       # deck/deck.sqlite3

3. Record the 90-step scenario trace (the drive's own setup finds the baked
   accounts and adds nothing, so the start deck it writes is byte-identical
   to the committed deck):

       cd reference-harness/oracle/app
       bundle exec ruby <repo>/tools/parity-side-effects/ruby/drive.rb . \
         <repo>/reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 <work dir>
       # stdout is the trace committed as expected/side-effects-ruby.json

4. Record the 70 write operations (one `decko runner` process per step):

       bash tools/persistence/run-ruby-steps.sh reference-harness/oracle/app \
         reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 <out dir> 70

Rebuilding the deck reproduces it row for row: the generator is deterministic
and the builder freezes the deck.json clock, so even the account salts are
stable. The manifest pins the recorded bytes.
