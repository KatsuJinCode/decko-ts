# Ruby Support & Upstream Portability (`ruby/card-mod-batched-nests/`)

This repository serves **upstream Ruby Decko (`0.20.0` / `card 1.110.0`)** as a first-class engine alongside the TypeScript and Edge engines:

1. **`card-mod-batched-nests` (`ruby/card-mod-batched-nests/`)**: A drop-in Ruby Decko card-mod gem—structured under upstream `card/lib/card/` file paths so it can also be opened directly as a pull request against `decko-commons/decko`—providing:
   - **Phase 1 Level-by-Level Nest & Machinery Batching (`Card::Cache::Prefetch`, `PrefetchRelated`, `KnownRows`, `PrefetchRules`, `Card::Format::Nesting::Prefetch`, `Card::Lexicon::Prefetch`)**: Drops cold SQL queries on `tree d3xf10` (`1,111` cards) from **`1,114` to `9` (`123.8x` fewer)** and `fan f200` (`201` cards) from **`204` to `4` (`51.0x` fewer)**.
   - **Phase 2 1-Trip Page Closure Bundle (`Card::Cache::LivePageBundle`, `lib/card/cache/live_page_bundle.rb`)**: Reads and writes the portable SQLite/D1 `live_page_bundles` + `deck_data_version` SQL tables (`BUNDLE_SCHEMA_VERSION = 2`) shared with the TypeScript and Edge engines, hydrating the page's card + lexicon closure (including 20-level linear chains `chain d20` that level-by-level prefetch cannot collapse below `22` queries) in **1 SQL query** on a cold Ruby worker in steady state (when no `deck_rule_flags` are pending).
   - **Phase 2 `O(1)` Lazy Permission-Rule Watermarks (`Card::Rule::LazyWatermark`, `lib/card/rule/lazy_watermark.rb`)**: Replaces stock Decko's `O(N)` `Card::Set::Right::Read#update_read_ruled_cards` table-wide card scan on `*read` rule saves with a single `O(1)` epoch flag row in `deck_rule_flags` (`epoch`, `rule_id`, `set_id`, `pattern_code`, `anchor_id`, `anchor_left_id`, `anchor_right_id`, `anchor_key`, `is_delete`, `created_at`) plus lazy read-time reconciliation (`reconcile_read_rule_if_stale!`), scheduled 30-day compaction (`run_scheduled_compaction_if_due!`), and batched CQL search compaction (`compact_pending_rule_flags!`, in 250-card prefetched slices and 500-id grouped `update_all` batches) against `deck_card_rule_watermarks` and `deck_rule_watermark_meta`.
2. **One Reference Harness for Both Engines**: The reference harness (`reference-harness/SPEC.md`) grades stock Ruby (`adapters/ruby/`), Ruby with `card-mod-batched-nests` (`adapters/ruby-batched/`), and the TypeScript engine (`adapters/ts/`) with the exact same runner, fixtures, and byte-identity grader.

---

## `card-mod-batched-nests` Architecture

Stock Decko renders a nest by fetching its card when the nest is reached, so a card nesting 200 cards costs about 200 queries, and a tree of 1,111 cards costs 1,114 queries.

`ruby/card-mod-batched-nests` packages both Phase 1's batched nest loader and Phase 2's 1-trip SQL bundle + lazy rule watermarks so a stock Decko 0.20.0 application needs no fork:

- The upstream modules live in `lib/card/` under their exact upstream names and paths (`lib/card/cache/prefetch.rb`, `prefetch_related.rb`, `known_rows.rb`, `prefetch_rules.rb`, `live_page_bundle.rb`, `lib/card/format/nesting/prefetch.rb`, `lib/card/lexicon/prefetch.rb`, `lib/card/rule/lazy_watermark.rb`). Decko autoloads a card mod's `lib/` directory.
- The hooks into stock classes and set modules live in `lib/cardio/batched_nests.rb`, prepended by `config/late/batched_nests.rb` after the mods' sets load.

### Installing in Any Stock Ruby Decko 0.20.0 App

```ruby
# Gemfile of a Decko 0.20.0 app
gem "card-mod-batched-nests", path: "<checkout>/ruby/card-mod-batched-nests"
```

Decko automatically loads the gem's `config/early` and `config/late` initializers via its `metadata["card-mod"] = "batched_nests"` gemspec entry. Four settings can be configured in `config/application.rb`:

| Setting | Default | Effect |
| --- | --- | --- |
| `config.prefetch_nests` | `true` | Nests and links loaded a level at a time before rendering (`O(depth)` instead of `O(N)`). Works on all ActiveRecord adapters (SQLite, PostgreSQL, MySQL). |
| `config.prefetch_machinery` | `true` | List items, asset groups, pattern cards, and rule cards loaded in batches; codename cards kept in one cache entry (with `respond_to?` guards for stock `card 1.110.0` `cache_class_from_type` and `retrieval_from_db_query`). Works on all ActiveRecord adapters. |
| `config.live_page_bundles` | `false` (opt-in, SQLite/D1) | Automatically wraps top-level `Card::Format#show` (`depth == 0`) in `Card::Cache.with_live_page_bundle` (and can also be called directly) to hydrate a page's 17-column card + lexicon closure from `live_page_bundles` in **1 SQL query** in steady state (guarded by `deck_data_version.version` and the 6 `trg_live_page_bundles_*` + 18 `*_bump_deck_data_version_*` SQLite triggers, which invalidate bundles on any mutation to the 15 non-rule payload columns or `card_references`, discard orphan `kind: "delta"` bundles without a substrate bundle, and prune stale-stamp rows on persist). |
| `config.lazy_rule_watermarks` | `false` (opt-in in Ruby; auto-enabled in TS when `deck_rule_flags` exists unless `DECKO_LAZY_RULE_WATERMARKS=0`, SQLite/D1) | `*read` rule saves write a single `O(1)` epoch row to `deck_rule_flags` (`raise_read_rule_flag!`) and purge any `L3` `edge_render_cache` / `decko_edge_render_cache` rows instead of scanning and updating `read_rule_id` across every card in the database; `reconcile_read_rule_if_stale!` lazily re-derives `read_rule_id` on read against `deck_card_rule_watermarks` (persisting the reconciled `read_rule_id` + watermark when writable, with a `<= 2s` cross-isolate schema-probe window in TS), while `compact_pending_rule_flags!` compacts in bounded slices in Ruby (`batch_size: 250–500` with durable per-slice watermarks and per-card error isolation) and evaluates up to `batchSize` candidate cards per run in TypeScript (`O(⌈K/400⌉)` write statements). |

### Query Counts Across Stock Ruby, `card-mod-batched-nests` (Phase 1), and 1-Trip Bundle (Phase 2)

`benchmarks/run_ruby_deep_nesting_bench.rb` seeds the shared `BenchDN` fixtures into a deck and counts SQL queries (schema queries excluded) for one cold render (`Card::Cache.reset` first) of each fixture's root in the `open` view.

Measured on Ruby 3.4.11 (`decko 0.20.0`, `card 1.110.0`, `sqlite3`) on copies of `reference-harness/fixtures/synthetic-v2/deck` (`deep-nesting-ruby-014bd126730480e7.json` for stock and `deep-nesting-ruby-433a5529609786ab.json` for `card-mod-batched-nests`):

| Fixture | Cards | Stock Ruby 0.20.0 | Ruby + `card-mod-batched-nests` (Level Prefetch) | Ruby / TS + `live_page_bundles` (1-Trip Closure Hit) |
| --- | ---: | ---: | ---: | ---: |
| `chain d1` | 1 | 4 | 3 | **1** |
| `chain d2` | 2 | 5 | 4 | **1** |
| `chain d4` | 4 | 7 | 6 | **1** |
| `chain d8` | 8 | 11 | 10 | **1** |
| `chain d10` | 10 | 13 | 12 | **1** |
| `chain d16` | 16 | 19 | 18 | **1** |
| `chain d20` | 20 | 23 | 22 | **1** |
| `fan f1` | 2 | 5 | 4 | **1** |
| `fan f4` | 5 | 8 | 4 | **1** |
| `fan f16` | 17 | 20 | 4 | **1** |
| `fan f50` | 51 | 54 | 4 | **1** |
| `fan f100` | 101 | 104 | 4 | **1** |
| `fan f200` | 201 | 204 | 4 | **1** |
| `tree d4xf4` | 341 | 344 | 8 | **1** |
| `tree d3xf10` | 1,111 | 1,114 | 9 | **1** |

Why does level-by-level prefetch take `22` queries on `chain d20` (`20` cards deep) while `fan f200` (`201` cards wide) takes `4`? Because a linear chain (`A -> B -> C -> ...`) only discovers `B`'s name after fetching `A`'s content. Phase 2's **`Card::Cache::LivePageBundle` (`live_page_bundles`)** records the complete discovered card + lexicon closure on the first cold render and loads the entire 20-card chain in **1 SQL `SELECT`** on every subsequent cold worker or process render until a card mutation bumps `deck_data_version`.

### Rendered Output Is Byte-Identical (`3,804 / 3,804` Renders)

`ruby/card-mod-batched-nests/test/render_digest.rb` renders every card of a deck from a cold cache (`DIGEST_AUTH=bot` by default, or `DIGEST_AUTH=anon` for anonymous permission-filtered rendering) in the `open`, `core`, and `titled` HTML views and the `molecule` JSON view, and `test/byte_identity.rb` compares stock Ruby against Ruby with `card-mod-batched-nests`:

| Run (`synthetic-v2/deck`, 951 cards, 3,804 renders) | Total SQL Queries | Renders Differing After Control Mask |
| --- | ---: | ---: |
| Stock Ruby 0.20.0 control | 147,229 | 0 |
| Ruby 0.20.0 + `card-mod-batched-nests` | **52,070 (`2.83x` fewer across all 3,804 renders)** | **0** |

### Reference Harness Parity (`synthetic-v1`, `4,198 / 4,198` Checks Including Save & Expire Paths)

Graded on `fixtures/synthetic-v1` (`reference-harness/grade-reports/synthetic-v1-ruby-batched-report.json`) with `card-mod-batched-nests` active on Ruby 3.4.11 (`decko 0.20.0`, `card 1.110.0`), exercising both read rendering and card creates/updates/renames/deletes (`Card#expire` and cache invalidation across all `16` persistence steps, `19` side-effect mutations, and `12` write-table verification checks):

| Kind | Graded | Pass |
| --- | ---: | ---: |
| `rendering` | 1,754 | 1,754 |
| `semantics` | 2,389 | 2,389 |
| `persistence` | 16 | 16 |
| `side effects` | 19 | 19 |
| `reads that wrote only what the oracle's reads wrote` | 8 | 8 |
| `write steps whose other tables match the oracle's` | 12 | 12 |
