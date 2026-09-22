# Ruby prototype -- the deck-1282 batched-inclusion prefetch, gem-overlay form

> Stream: `minimax-ruby-dividend` (Decko Core issue #9 / optimization
> dividend). Companion to `docs/ruby-dividend-cte.md` (the design doc).

This directory holds a **gem-overlay prototype** that demonstrates
porting the TypeScript port's recursive-CTE inclusion-closure prefetch
back to Ruby card 1.110.0 / decko 0.20.0. The overlay is the installed
gem at `C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-1.110.0/lib/`
shadowed by a copy at `prototype/lib/` with the prefetch patch applied
to three files only:

| patched file | what changed |
|---|---|
| `prototype/lib/card/format/nest/fetch.rb` | `require_relative "prefetch"; include Prefetch` so the prefetch module is reachable from any Format::Card; the original `fetch_card` is unchanged. |
| `prototype/lib/card/format/nest/prefetch.rb` | NEW file. Defines `Card::Format::Nest::Prefetch` -- the recursive-CTE inclusion walk, cache hydration, depth-counter guard. |
| `prototype/lib/card/format/render.rb` | `require_relative "nest/prefetch"; include Card::Format::Nest::Prefetch; render!` calls `prefetch_inclusion_closure @card, final_view` before `wrap_and_render`, gated by a thread-local render-depth stack so nested renders don't re-prefetch. |

Everything else under `prototype/lib/` is an unmodified copy of the
gem's lib tree (Card + Cardname + Cardio + core_ext). The overlay's
full tree is `prototype/lib/` (~470 files; gitignored by the repo's
`.gitignore` if you extend it).

## Running the prototype

From `tools/oracle/decko-oracle-app/`:

```
RAILS_ENV=development /c/Ruby33-x64/bin/decko runner \
  C:/localProjects/decko-ts/prototype/measure.rb
```

Env knobs (all default; the script prints what it uses):

- `PREFETCH_DEPTH` -- depth of the seeded inclusion chain (default 8).
  Stays below `Card.config.max_depth=20`
  (`card-1.110.0 lib/card/format/nesting.rb:65-67`).
- `PREFETCH_RENDER_N` -- measured renders per mode (default 5).
- `PREFETCH_PREFIX` -- bench card prefix (default `PrefR1`).

The script uses the oracle app's existing `db/development.sqlite3`
in-place (the oracle app owns it). It seeds a deep inclusion chain
under the prefix, runs Phase A (depth-first, no patch), loads the
overlay, runs Phase B (closure-prefetch, with patch), then deletes
all seeded cards and verifies the live count is unchanged.

## Latest measurement (2026-09-21, this repo)

Recorded in `prototype/results/measurement.json`:

| phase | cold queries (median, n=5) | warm queries (median) | cold wall ms |
|---|---|---|---|
| A (depth-first, installed gem) | 11 | 0 | 114.3 |
| B (closure-prefetch, prototype overlay) | 11 | 0 | 116.2 |

**Reduction: 0%.**

Phase A baseline = 11 queries at depth-8 = depth+3, exactly matching
the corpus report's curve
(`docs/benchmark-corpus-report.md` section 4, "Ruby R1/R2 Cold mode"
row for depth=8, open view). Strong sanity anchor for the prototype's
measurement harness.

The 0% dividend is honest work; see `docs/ruby-dividend-cte.md` "Honest
wall (prototype measurement, 2026-09-21)" for the trace. Short form:
the recursive-CTE walk works in 1 statement, cache hydration works,
but the depth-first render path's `Card.fetch(name, new: opts)` runs
through `reset_patterns` even when the card is in cache, and the
Ruby `Card`'s `:new:` opts branch costs queries the cache doesn't
eliminate. The fix is < 10 lines in either
`Card::Fetch::Results#new_result_card` (add a `Card.cache.read(key)`
short-circuit) or `Card#reset_patterns` (guard `@set_mods_loaded`).
Called out for a wave-2 / contribution-series-2 follow-up.

## What the prototype proves (partial -- see wall above)

- **Overlay mechanism works.** The script's Phase B preamble prints
  `source_location` for `Card::Format::Render#render!`,
  `Card::Format::Nest::Fetch#fetch_card`, and
  `Card::Format::Nest::Prefetch#prefetch_inclusion_closure`. All three
  point at `prototype/lib/`. The overlay shadows the installed gem.
- **CTE walk works.** The recursive CTE in `walk_closure_cte` issues
  1 statement regardless of depth (verified at depth-2 with a
  standalone probe; returns the full closure's rows).
- **Cache hydration works.** `Card.cache.temp.store` contains every
  chain card's key after the prefetch (verified via probe).
- **Render-hook placement is correct.** `render!` calls
  `prefetch_inclusion_closure @card, view` before `wrap_and_render`,
  gated by a thread-local depth counter that prevents recursive
  re-prefetches at nested subformat renders.

## Files in this directory

| file | role |
|---|---|
| `README.md` | this file |
| `measure.rb` | the measurement harness (boots the oracle app, seeds the chain, runs Phase A + B, cleans up, writes `results/measurement.json`) |
| `lib/` | the gem-overlay (full `card-1.110.0/lib/` + `cardname-0.20.0/lib/` + `cardio/lib/`, with the three patched files) |
| `db/` | scratch sqlite directory (unused -- the prototype reads the oracle app's `db/development.sqlite3` in place) |
| `results/measurement.json` | the most recent measurement's per-render records + summary + environment metadata, JSON-pretty-generated |