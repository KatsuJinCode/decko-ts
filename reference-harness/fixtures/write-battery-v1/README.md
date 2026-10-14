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
| `expected/persist-steps/step-NN.json` | the Ruby oracle's state after each PUBLIC write operation (every step the withheld set does not claim) |
| `expected/persist-steps/ruby-outside-delta.json` | the rows the operations wrote outside the probe's own records (Ruby's whole-deck delta) |
| `expected/persist-steps/deliberate-differences.json` | the declared engine differences on this deck (step 7, and step 67) |
| `expected/side-effects-ruby.json` | the Ruby oracle's recorded trace of the public scenario steps |
| `withheld/steps.json` | the probe steps withheld until disclosure, and why |
| `withheld/persist-steps/` | the Ruby oracle's recording of the FULL 70-step op list, made with the withheld set present |
| `withheld/side-effects-ruby-steps.json` | the Ruby oracle's recording of the scenario-battery steps withheld until disclosure, cut from the full-list trace |
| `MANIFEST.json` | the sha256 of every public file above and how each recording was made |

## The withheld step set

`withheld/` is not part of this fixture's public surface and must be excluded
from every release package. It holds the write-probe steps whose purpose is to
reproduce a Ruby defect the public material is not cleared to carry; see each
step's `why` in `withheld/steps.json`.

The probe loads `withheld/steps.json` only when it is present. Absent it — the
packaged case — the probe runs the public op list and prints
`[withheld until disclosure] NOT RUN: <n> steps (<path>)`. Present it, the
probe runs all 70 steps and compares them against `withheld/persist-steps/`.

That is why the public recording is a separate cut. Every recorded dump
carries the whole deck state, so a step that stores withheld content would
leave it in all fifty later dumps. The public recording is therefore made over
the public list, not trimmed out of the full one; re-record it the way
section 4 below describes, with `withheld/steps.json` moved aside.

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

   The drive runs the oracle with production error handling (rescue_all in
   the controller, no developer exception page), as a deployed Decko site
   does, so a failed step records the public "Wild Card!" page and no
   backtrace. The trace records no exception messages or backtraces at all,
   so it carries no machine path.

4. Record the 70 write operations (one `decko runner` process per step):

       bash tools/persistence/run-ruby-steps.sh reference-harness/oracle/app \
         reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 <out dir> 70

Rebuilding the deck reproduces it row for row: the generator is deterministic
and the builder freezes the deck.json clock, so even the account salts are
stable. The manifest pins the recorded bytes.

One deliberate difference from a fresh rebuild, and it is now the only one. The
build path recorded above and in `MANIFEST.json`'s `provenance` is the stock
oracle (`reference-harness/oracle/build-deck.sh`, then `seed.rb`) against
decko 0.20.0 / card 1.110.0, and that path only creates the tables stock Decko
creates. A committed deck file that carries any other table was therefore not a
byte-reproducible output of the recorded path.
`reference-harness/corpus/drop-private-app-tables-from-fixture-decks.mjs`
reduces every committed fixture deck to the stock schema (2026-10-10 here,
2026-10-13 for the last fixture that still carried foreign tables), so the
committed files are now what the recorded build produces. Those tables were
never part of the battery: each was empty, nothing in this repository created or
read them, and no recording touched them, so the batteries and the whole-deck
comparison were blind to their presence either way.
