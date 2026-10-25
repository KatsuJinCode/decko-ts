# reg-redteam-cfg-max_depth-max_char_count-compress_assets-max_temporary_cache_keys

- Roster row: family `register-redteam`, label `max_depth, max_char_count,
  compress_assets, max_temporary_cache_keys config key`, verdict PORTED,
  bucket DONE. Four railtie config keys in one row.
- The row's sourceParent: `max_depth, max_char_count, compress_assets,
  max_temporary_cache_keys (railtie config key) -> PORTED`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1099): `max_depth, max_char_count,
  compress_assets, max_temporary_cache_keys | PORTED | dsl A13/A14 + mods
  script entry; max_temporary_cache_keys referenced in
  src/card/fetch/cache.ts`.

## Verdict: SOURCE EXISTS (outcome a). The citation is added below, one
## per key.

## The citations (at this tree, roll tip c17906db, branch port/suspects-20261025)

- max_depth: `src/card/render/format.ts:797-798` exports the key's value
  with its source named.
      /** Card.config.max_depth (card 1.110.0 lib/cardio/railtie.rb:17). */
      export const RUBY_MAX_DEPTH = 20;
  Consumed as the format default at format.ts:924
  (`this.maxDepth = opts.maxDepth ?? RUBY_MAX_DEPTH`) and at the page seat
  (`src/card/render.ts:2605-2613`) and the render rounds
  (`src/card/render.ts:7328`).
- max_char_count: `src/card/render/format.ts:686-690`.
      /** nesting.rb:69-71 `max_char_count` reads `Card.config.max_char_count`;
       *  the railtie default is 200 (card-1.110.0 lib/cardio/railtie.rb:16). ...
       *  The headless port has no Cardio config surface - the default is pinned. */
      const MAX_NEST_CHAR_COUNT = 200;
  Consumed by the elision gate at format.ts:2323.
- compress_assets: `src/card/actions/card-action-engine.ts:514-524` (the
  option doc names `Cardio.config.compress_assets (card-mod-script
  00_script.rb compress?)`), field at 650, engine default false at 732;
  the style half carries the same option
  (`src/card/actions/style-asset-events.ts:79-81`).
- max_temporary_cache_keys: `src/card/fetch/cache.ts:30-32`.
      /** Cardio.config.max_temporary_cache_keys default
       *  (cardio-0.20.0 lib/cardio/railtie.rb:41: `config.max_temporary_cache_keys = 10_000`). */
      export const DEFAULT_MAX_TEMPORARY_CACHE_KEYS = 10_000;
  The option travels through `src/card/fetch.ts:156-171`
  (`maxTemporaryCacheKeys` -> `maxTemporaryKeys`).

ONE CITATION DRIFT, NAMED: the port's comment cites
`cardio-0.20.0 lib/cardio/railtie.rb:41`, a gem layout this machine's
pinned oracle set does not carry (the oracle set holds
`card-1.110.0/lib/cardio/railtie.rb`, where the same assignment with the
same value sits at line 44). The value the port pins (10_000) matches the
pinned tree. The comment's version name is stale, not the value.

## The original side, read and recorded

All four keys, one file plus their readers:

- `card-1.110.0/lib/cardio/railtie.rb:16` `config.max_char_count = 200`;
  reader `card-1.110.0/lib/card/format/nesting.rb:69-70` (used by the
  compact-mode gate at nesting.rb:53).
- `card-1.110.0/lib/cardio/railtie.rb:17` `config.max_depth = 20`; reader
  `card-1.110.0/lib/card/format/error.rb:34` (monitor_depth) and
  `card-1.110.0/lib/card/format/nesting.rb:66`.
- `card-1.110.0/lib/cardio/railtie.rb:35` `config.compress_assets = true`
  (development turns it off:
  `card-1.110.0/config/environments/development.rb:11`); readers
  `card-mod-script-0.20.0/set/abstract/00_script.rb:41` and
  `card-mod-style-0.20.0/set/abstract/01_css.rb:88`.
- `card-1.110.0/lib/cardio/railtie.rb:44`
  `config.max_temporary_cache_keys = 10_000`; reader
  `card-1.110.0/lib/card/cache/temporary.rb:14`
  (`MAX_KEYS = Cardio.config.max_temporary_cache_keys`).

The port's four pinned values (20, 200, false, 10_000) match the pinned
assignments; the compress_assets pin is the development value (false),
matching the environment the oracle captures ran under, and the port's own
doc says so (card-action-engine.ts:514-524's option contract).

## The prior receipt for this row

None in the repo: the register B table (line 1099) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
