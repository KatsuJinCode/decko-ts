# reg-redteam-cfg (the ten unclaimed railtie config keys) — per-key disposition

Row: `reg-redteam-cfg-shared_cache-load_strategy-seed_type-seed_cache_from_stash-extra_seed_tables-cache_set_module_list-cache_log_level-rescue_all_in_controller-assets-encoding`
in `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json` (verdict
UNPORTED, bucket WORKING ON IT). Its blocker: "8 of these 10 railtie keys have LIVE readers
in the pinned gemset (readers counted this session: shared_cache 1, load_strategy 2,
seed_type 1, seed_cache_from_stash 1, extra_seed_tables 1, cache_set_module_list 1,
cache_log_level 3, rescue_all_in_controller 1) and no port counterpart; only assets and
encoding have zero readers and are inert. Fix: implement the 8 live config reads or pin each
as an accepted divergence."

The reader census reproduces (commands and outputs below). The disposition per key follows.
**No code changed: seven of the eight live keys are Ruby-Rails plumbing with no
card-visible byte surface in this engine, and the eighth (`rescue_all_in_controller`) is
already implemented as the deployed posture the port documents.**

Ruby side: pinned gemset `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`
(`card-1.110.0/lib`, `decko-0.20.0/lib`). Port side: canonical tree
`decko-ts-release-lead` @ `d8050251`, the base of branch `port/redteam-20261020`.

## Reader census, re-run

`grep -rn "<key>" card-1.110.0/lib decko-0.20.0/lib card-mod-*/lib` — one reader each for
`shared_cache` (cache/class_methods.rb:96), `seed_type` (cardio/seed.rb:9),
`seed_cache_from_stash` (cache/populate.rb:50), `extra_seed_tables` (cardio/seed.rb:58),
`cache_set_module_list` (set/pattern/all.rb:15), `rescue_all_in_controller`
(decko-0.20.0/lib/card_controller/errors.rb:14, consumed at card_controller.rb:28); two for
`load_strategy` (cardio/mod/loader.rb:52, set_loader.rb:10); three for `cache_log_level`
(cache.rb:100, card_controller/response.rb:11, and a commented example at
cache/class_methods.rb:21). `assets` and `encoding`: no reader in the gemset.

## Per key

| key | Ruby reader | Disposition |
|---|---|---|
| `shared_cache` | cache/class_methods.rb:93-96 — `@shared_cache = Cardio.config.shared_cache && Cardio.cache`; when set, `cache_by_class` builds `Cache::Shared` (`:15`), renews on write (`:39`) and resets (`:69`) | **PORTED.** `src/card/fetch/cache.ts` carries both levels: `TemporaryCache` (temporary.rb) and `SharedCache` with `renew()` (shared.rb#renew), `reset()` (stamp rotation, shared.rb#reset) and `annihilate()`, and the `{database}-{class}-{stamp}:` prefix (shared.rb#full_key). The enable condition is the same shape — the port's Shared layer exists only when a host passes a `SharedCacheStore` (the stand-in for `Cardio.cache`, cache.ts:154-157). Ruby's default is false, the port's is host-supplied: same knob, different supplier. |
| `load_strategy` | cardio/mod/loader.rb:51-52 `load_strategy ||= Cardio.config.load_strategy`, passed to the Zeitwerk loader | **NAMED DIVERGENCE (inert).** It selects the Ruby constant-loading strategy for `require` vs eager autoload of set modules. The TS engine has no `require` and its mod loader is a registry assembled at build time (`src/card/mod-loader/`), so there is no code path this key could gate. No card-visible bytes either way. |
| `seed_type` | cardio/seed.rb:9 `db_path Cardio.config.seed_type, 0` — the file name the seed cache is written to | **NAMED DIVERGENCE (dev tooling).** It names a path inside the seeding CLI (`rails db:seed`), not the runtime. The port's seed path is `src/card/auth/boot-seed.ts`, driven by the host; there is no seed-cache file to name. |
| `seed_cache_from_stash` | cache/populate.rb:50 `return unless Cardio.config.seed_cache_from_stash` — warm the cache from the stash while seeding | **NAMED DIVERGENCE (seeding-time only).** The guard is inside `Card::Cache::Populate`, which runs from the seed command. The port's boot seed (`boot-seed.ts`) writes rows and lets the cache warm from reads; there is no populate phase to gate. Default false in Ruby, so the deployed runtime behavior is identical either way. |
| `extra_seed_tables` | cardio/seed.rb:58 `TABLES + Cardio.config.extra_seed_tables` | **NAMED DIVERGENCE (dev tooling).** Same class as `seed_type`: it widens the table list of the seeding CLI. The port's schema is fixed in code (`src/server/schema.ts`) and created by migrations, not by a seed table list. |
| `cache_set_module_list` | set/pattern/all.rb:15 `set_modules if Cardio.config.cache_set_module_list` — memoize the pattern's set-module list | **NAMED DIVERGENCE (performance knob, no byte surface).** Both arms return the same module list; only caching differs. The port caches set resolution unconditionally (`src/card/render/set-keys-to-modules.ts`), which is the `true` arm's behavior at Ruby's `false` default. No rendered byte differs. |
| `cache_log_level` | cache.rb:100 `return yield unless (log_action = Cardio.config.cache_log_level)`; card_controller/response.rb:11 logs `Card::Cache.tallies` when set | **NAMED DIVERGENCE (logging channel).** It adds hit/miss tallies to a log sink and changes no return value. The port's `TemporaryCache.resetCount` / cache-layer counters are test-visible but never reach a response body. |
| `rescue_all_in_controller` | card_controller.rb:28 `rescue_from_class StandardError if rescue_all?`; errors.rb:13-14 reads the config, :18-22 `handle_exception` renders the error view | **ALREADY IMPLEMENTED (deployed posture).** The port always takes the rescue path for a save error and renders the error view; `src/card/actions/card-action-engine.ts:1588-1597` states the mechanism and cites the posture: the base config default is false (decko-0.20.0/lib/decko/railtie.rb:9) but a deployed site sets it (config/environments/production.rb:1-3), and the port models the deployed one. This is the same "baked default" shape the register already accepted for `space_last_in_multispace` and `allow_inline_styles`. |
| `assets` | none in the gemset (decko railtie sets `config.assets.enabled = false`) | **INERT**, as the row says. Rails asset pipeline. |
| `encoding` | none in the gemset | **INERT**, as the row says. |

## What this means for the row

Seven of the eight "live" keys gate Rails-side machinery (constant loading, seeding CLI,
memoization, logging) whose arms differ in cost, not in output; the eighth is implemented as
the deployed posture. Under the parity law — matches the source = done — the row's "implement
the 8 live config reads" instruction would add knobs with no observable behavior change and
would risk the wrong answer on `cache_set_module_list` (the port already runs the cached arm)
and `rescue_all_in_controller` (the port already runs the rescued arm). The honest close is
this table, not seven new config keys.

## Commands run to produce this

- `grep -rn "<key>" <gems>/card-1.110.0/lib <gems>/decko-0.20.0/lib <gems>/card-mod-*/lib` for each of the ten keys (readers and line numbers as cited).
- `sed -n '1,40p' <gems>/decko-0.20.0/lib/card_controller/errors.rb`; `sed -n '1,20p' <gems>/decko-0.20.0/lib/card_controller.rb`; `sed -n '1,20p' <gems>/decko-0.20.0/lib/decko/railtie.rb`.
- `grep -rn "rescue_all_in_controller\|rescueAll" src/` in the canonical tree → one hit, a citation comment (card-action-engine.ts:1590); no unimplemented key read.
- `sed -n '145,215p' src/card/fetch/cache.ts`; `sed -n '1,60p' src/card/fetch/cache.ts` (the Shared/Temporary layers and their renew/reset/stamp-prefix port).
- No test was added or changed by this row: nothing in the engine moved, so there is nothing new to pin. The cache suites were run anyway as a baseline for the table: `npx vitest run tests/card/fetch/` → 7 files, 89 tests passed (includes tests/card/fetch/cache.test.ts).
