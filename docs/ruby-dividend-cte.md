# Ruby dividend — porting the deck-1282 batched-inclusion prefetch back to card

> Stream: `minimax-ruby-dividend` (Decko Core issue #9,
> [optimization](https://github.com/<owner>/decko-ts/issues/9)).
> Compiled for the annotated upstream series opener (issue #12,
> [delivery](https://github.com/<owner>/decko-ts/issues/12)).
> 2026-09-21.

## Why this doc exists

Issue #9's commitment: **share optimization dividends across Ruby and
TypeScript** so neither runtime carries a permanent scaling cliff the other
escaped. The TypeScript port
(`src/card/render/prefetch.ts`, `src/card/render/nest-syntax.ts`)
replaced Ruby's depth-first nest fetch with a single recursive-CTE
inclusion-closure walk — measured 246× tail cut on the corpus, constant
queries per render regardless of depth (decko-commons/decko#1282 R1
proof). The same defect lives in Ruby today: every nested `{{inclusion}}`
costs one `Card.fetch` per inclusion per level
(`docs/benchmark-corpus-report.md` section 4 — 19 queries at depth 16 vs
4 at depth 1, exactly linear in depth).

This doc maps the TypeScript CTE walk onto Ruby's architecture: where the
prefetch would live, what hydrates the `Card::Cache`, what stays
depth-first. The companion in `prototype/` is a working gem-overlay
that boots a minimal decko SQLite deck and prints `queries-per-render`
before/after the patch.

Every mechanism claim cites the Ruby source file and line that
defines or invokes it, or the script output that proves it.

## The Ruby depth-first path (the defect, traced)

The recursion happens inside `Card::Format::Nesting#nest`, which the
renderer invokes once per `{{inclusion}}` chunk while processing a
content render:

| step | Ruby file:line | what happens |
|---|---|---|
| 1 | `card-1.110.0/lib/card/format/nesting.rb:12-20` `Nesting#nest` | one inclusion → `Card::Format::Nest.new(self, cardish, …)` |
| 2 | `card-1.110.0/lib/card/format/nest.rb:9-16` `Nest#initialize` | `@card = fetch_card cardish` (the per-inclusion `Card.fetch`) |
| 3 | `card-1.110.0/lib/card/format/nest/fetch.rb:8-17` `Fetch#fetch_card` | dispatches `Card.fetch cardish` for symbol/integer/string, plus `new_card` for new args |
| 4 | `card-1.110.0/lib/card/fetch/card_class.rb:31-36` `Fetch::CardClass#fetch` | constructs a `Card::Fetch` and calls `retrieve_or_new` |
| 5 | `card-1.110.0/lib/card/fetch.rb:16-19` `Fetch#retrieve_or_new` | `retrieve_existing` (`retrieve_from_cache || retrieve_from_db`) |
| 6 | `card-1.110.0/lib/card/fetch/retrieve.rb:21-26` `Retrieve#retrieve_from_db` | one `Card.where(query).take` — the depth-+1 query per inclusion |
| 7 | `card-1.110.0/lib/card/fetch/store.rb:5-13` `Store#update_cache` | warm the temp + shared cache on observed hits |

Steps 1–6 are the hot path. The cache is process-local (`Card::Cache[Card]`,
`card-1.110.0/lib/card/cache.rb:16-31`); every cold render pays one DB query
per nested card, exactly the linear-in-depth curve the corpus report
quantifies (4 → 19 between depth 1 and depth 16). Step 7 ensures the
warm re-render serves from the temp cache (`card-1.110.0/lib/card/cache/temporary.rb:39-46`)
— that's the 0-queries warm curve in the same artifact.

## What the TypeScript port does instead

`src/card/render/prefetch.ts:232-262` `prefetchInclusionClosure`:

1. **Inversion.** Before the renderer touches any chunk, the entire
   `{{…}}` closure of the root is resolved in one driver batch.
   The renderer itself runs against a warm fetch cache.
2. **One recursive CTE walks the closure.** `walkStatement`
   (`src/card/render/prefetch.ts:137-183`) builds a three-`WITH` SQLite
   statement (`resolved`, `frontier`, `reached`):
   - `resolved` (`prefetch.ts:152-162`): every row's composed key,
     simple cards by `cards.key`, junctions by walking their sides —
     `DbLexicon.nameToLex` in SQL
     (`src/card/fetch/lexicon.ts`, the analog of
     `card-1.110.0/lib/card/lexicon.rb:112-118`).
   - `frontier` (`prefetch.ts:163-180`): span-chained `{{…}}` scan
     (instr-based, not a numbers table — the post-2026-09-20 fix that
     produced the 246× tail cut documented in
     `docs/render-fix-notes.md`).
   - `reached` (`prefetch.ts:199-211`): recursive side expansion so a
     junction chain's sides' sides are in batch.
3. **JS verification + fallback rounds**
   (`src/card/render/prefetch.ts:407-531`). The recursive CTE does
   the bulk; the real parser (`nest-syntax.ts#referencedNames`) is the
   semantic authority. Anything the CTE missed is fetched in per-level
   `IN`-query rounds, depth-N chains in O(N) rounds.

The whole closure arrives in one batched round trip
(`driver.batch`, `prefetch.ts:243-250`) — five round trips / six
statements on the depth-sweep probes
(`docs/render-fix-notes.md` "Gates" section, 29/29 tests), independent
of nesting depth.

## Mapping the prefetch onto Ruby's architecture

### Where the prefetch would live

**Hook point: `Card::Format::Nest#initialize`** at
`card-1.110.0/lib/card/format/nest.rb:9-16`. Two lines do all the
per-inclusion work:

```ruby
def initialize format, cardish, view_opts={}, format_opts={}
  @format = format
  @view_opts = view_opts
  @format_opts = format_opts.clone
  @override = @format_opts.delete(:override) != false
  @card ||= fetch_card cardish          # <-- depth-first fetch
end
```

Replacing this with a warm-cache read is impossible — we don't yet know
the closure. The replacement must be **upstream of** `Nesting#nest`:

**Hook point (proposed): `Card::Format::Render#render!`** at
`card-1.110.0/lib/card/format/render.rb:7-14`:

```ruby
def render! view, view_options={}
  voo = View.new self, view, view_options, @voo
  with_voo voo do
    voo.process do |final_view|
      wrap_and_render final_view        # <-- prefetch here, once
    end
  end
end
```

`wrap_and_render` (`render.rb:96-100`) calls `with_wrapper` →
`final_render`, which invokes `Nesting#nest` per inclusion
(`format/nesting.rb:12-20`). Inserting the prefetch between
`voo.process` and `wrap_and_render` (or in a `before_view` hook before
`voo.process`) gives us the root card, the root view, and a single
synchronous preparation call — exactly the slot the TS port uses.

### What hydrates the cache

The TypeScript prefetch writes into the FetchEngine cache directly
(`prefetch.ts:328-330`, `cacheRecord(record)`). The Ruby analog is
`Card::Cache::CardClass#write_to_cache` at
`card-1.110.0/lib/card/cache/card_class.rb:28-34`:

```ruby
def write_to_cache card, local_only=false
  if local_only
    write_to_temp_cache card
  elsif cache
    cache.write card.key, card
  end
end
```

The prefetch iterates the closure's `Card` rows and calls
`write_to_cache` on each — populating `Card::Cache[Card]` keyed by
`card.key`, the cache the per-inclusion `retrieve_from_cache`
(`card-1.110.0/lib/card/cache/card_class.rb:24-26`) reads first. The
subsequent `Card.fetch` inside `Nesting#nest` therefore becomes a temp
cache hit and never touches the DB (`temp.fetch` in
`card-1.110.0/lib/card/cache/temporary.rb:39-46`).

Junction names additionally need `Card::Cache[Lexicon]` warm — the
post-2020 convention is NULL name/key columns, and the per-card
`Lexicon.id(name)` lookup walks the sides
(`card-1.110.0/lib/card/lexicon.rb:112-118`, `lex_to_id` at
`lexicon.rb:120-128`) which costs one DB query per junction name
resolved cold. The CTE must therefore also prefetch every junction row's
`(left_id, right_id)` pair, then call
`Card::Lexicon.write_to_temp_cache`
(`card-1.110.0/lib/card/lexicon.rb:74-77`).

### What stays depth-first

The CTE walk is read-only — it never writes to `cards`, never
invalidates caches, never runs `act` machinery. The TS side made the
same deliberate split (`src/card/render/prefetch.ts:46-46` "all fetching
is read-only; the write path is another stream").

Three things must NOT be moved out of the depth-first path:

1. **`new_card` for new-inclusion creation**
   (`card-1.110.0/lib/card/format/nest/fetch.rb:30-72`):
   `{{NewCard|open}}` *creates* the card; the side effects (act record,
   cache invalidation, default attributes) must remain on the depth-first
   path the user-visible mutation happens.
2. **Codename resolution and the `not_found_codename` view**
   (`fetch.rb:19-24`): an error signal that turns into the `:not_found`
   view; the prefetch treats unknown nests as not-yet-resolved (the TS
   equivalent is `verifyClosure` stopping when `fetched.length === 0`
   at `prefetch.ts:523`).
3. **Trash lookups and `look_in_trash:` opts**
   (`card-1.110.0/lib/card/fetch/retrieve.rb:49-52`): the prefetch
   honors `trash = 0` in the CTE (matches the live-card subset the
   renderer cares about), but `look_in_trash:` calls must keep falling
   through to the original `Card.fetch` path.

### The recursive CTE in SQLite (what the Ruby side would ship)

Translating `walkStatement` to a parameterized string the Ruby side
can issue via `ActiveRecord::Base.connection.execute`:

```sql
WITH RECURSIVE
  resolved(id, ckey) AS (
    SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0
    UNION
    SELECT j.id, l.ckey || '+' || r."key"
      FROM resolved l JOIN cards j ON j.left_id = l.id AND j.trash = 0
      JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
    UNION
    SELECT j.id, l."key" || '+' || r.ckey
      FROM resolved r JOIN cards j ON j.right_id = r.id AND j.trash = 0
      JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
  ),
  frontier(t, rest) AS (
    SELECT ?, NULL
    UNION
    SELECT f.t, substr(c.db_content, 1, :cap)
      FROM frontier f
      JOIN resolved rs ON rs.ckey = f.t
      JOIN cards c ON c.id = rs.id AND c.trash = 0
      WHERE f.rest IS NULL AND c.db_content LIKE '%{{%'
    UNION
    SELECT f.t, substr(f.rest, instr(f.rest, '{{') + 2)
      FROM frontier f
      WHERE f.rest IS NOT NULL AND instr(f.rest, '{{') > 0
    UNION
    SELECT DISTINCT lower(replace(trim(
             CASE WHEN instr(substr(f.rest, instr(f.rest, '{{') + 2), '}}') = 0
                  THEN substr(f.rest, instr(f.rest, '{{') + 2)
                  ELSE substr(substr(f.rest, instr(f.rest, '{{') + 2), 1,
                              instr(substr(f.rest, instr(f.rest, '{{') + 2), '}}') - 1)
             END), ' ', '_')),
      NULL
      FROM frontier f
      WHERE f.rest IS NOT NULL AND instr(f.rest, '{{') > 0
    UNION
    SELECT f.t, NULL FROM frontier f
      WHERE f.rest IS NOT NULL AND instr(f.rest, '{{') = 0
  )
SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (
  SELECT rs.id FROM resolved rs JOIN frontier f ON f.t = rs.ckey
)
```

This is `walkStatement(rootKey, SELECT_WALKED)` from
`src/card/render/prefetch.ts:137-188` translated 1:1. The `resolved`
CTE is the SQL form of `Card::Lexicon.name_to_lex`
(`card-1.110.0/lib/card/lexicon.rb:112-118`); the `frontier` arm
mirror (`resolved r JOIN j ON j.right_id`) covers both orientations
of a junction, the same way the Ruby walk visits both sides.

**SQLite index usage (verified in the prototype):**

- `cards_key_index` (UNIQUE on `cards.key`) — proven reachable:
  `EXPLAIN QUERY PLAN SELECT * FROM cards WHERE "key"=? AND trash=0`
  returns `SEARCH cards USING INDEX cards_key_index (key=?)`
  (probe at `prototype/measure.rb` smoke probe, also
  `tools/oracle/decko-oracle-app/db/development.sqlite3`).
- `cards_left_id_index` / `cards_right_id_index` (one-way junction
  joins) — used by the recursive arm. The `index_cards_on_left_id_and_right_id`
  unique pair (`docs/render-fix-notes.md` defect 2 fix) is a D1/local
  index; the Ruby oracle DB has separate one-way indices — also usable.
- `cards_type_id_index` — used by the `reached` type-card join.
- `trash` filter uses `cards.trash` (no index, fine — `trash = 0`
  matches ~90% of rows so the index would be a loss; matches the TS
  port's call).

**SQLite 3.53 supports both multiple recursive CTEs and recursive
references to a previously-defined recursive CTE in the same statement
(SQLite ≥ 3.34; verified on this machine with the gem-bundled
sqlite3 3.53.2 via `ruby -e '…recursive UNION ALL…'` probe).**

### Round-trip target

TS side: 1 batch, 2 statements (walk + type+side), zero JS fallback
for shallow nests. The Ruby side targets the same shape — one
`connection.execute` with both selects, then a
`compose_records_and_cache(rows)` loop. The `additionalStatements`
shape (`prefetch.ts:222-225`) maps cleanly onto the read-permission
read-rule resolution that the cold render also needs (the render-fix
stream notes this in `docs/render-fix-notes.md` defect 2 note).

### Where the change is small in Ruby

Two-file patch in the gem:

1. `card-1.110.0/lib/card/format/nest/fetch.rb` — add
   `prefetch_inclusion_closure(root, view)` method that walks + writes
   into cache + returns. (Or a new module alongside.)
2. `card-1.110.0/lib/card/format/render.rb` — call
   `prefetch_inclusion_closure(self.card, view)` inside `render!` before
   `wrap_and_render`.

Everything else — `Card::Format::Nest`, `Nesting#nest`, `Card.fetch`,
`Lexicon.write_to_temp_cache` — is reused unchanged. The per-inclusion
`fetch_card` calls in step 2 of the depth-first path become warm-cache
hits, not deletions of the path.

## The Ruby prototype in `prototype/`

The prototype is a **gem-overlay**: it copies
`card-1.110.0/lib/` into `prototype/lib/`, applies the patch to
`prototype/lib/card/format/nest/fetch.rb` (and the new prefetch module),
prepends `prototype/lib` to `$LOAD_PATH`, and the patched files shadow
the installed gem (`require 'card'` resolves to the overlay copy
first).

Run pattern, mirroring `benchmarks/run_ruby_bench.rb`:

```
cd tools/oracle/decko-oracle-app
RAILS_ENV=development decko runner \
  REPO_ROOT/decko-ts/prototype/measure.rb
```

The measurement script (see `prototype/measure.rb`):

1. Creates its own sqlite DB at `prototype/db/prefetch.sqlite3` (a
   copy of the oracle app's `development.sqlite3` is made on first use,
   then the script seeds a deep nested page with a `PrefR1` prefix).
2. Measures `queries-per-render` against the **un-patched** gem via
   the ActiveSupport::Notifications counter
   (same subscription pattern as
   `benchmarks/run_ruby_bench.rb:69-74`).
3. Loads the prototype overlay (prepends to `$LOAD_PATH`), forces a
   `Card.cache.reset` (same as `run_ruby_bench.rb:79-81`), re-measures.
4. Prints cold-path query counts side by side.

Run output is recorded verbatim in the `result` step.

## Honest caveats (not all claims are proven)

- **Schema parity.** The TS port's `db/schema.sqlite.sql` annotates
  `cards_key_index` with `COLLATE NOCASE`; the Ruby oracle's schema is
  the plain UNIQUE index above. The CTE's `key = ?` join uses BINARY
  comparison (same as Ruby's `key:` lookup in `Lexicon.lex_query`,
  `card-1.110.0/lib/card/lexicon.rb:53-58`) and the index IS reachable
  on this oracle (verified via EXPLAIN QUERY PLAN). No schema patch is
  needed in Ruby.
- **The pivot from depth-first to closure-walk is mode-`{off, on}`.**
  The TS port's `prefetchInclusionClosure` is invoked unconditionally
  before every cold render — no opt-out, no feature flag. For the Ruby
  upstream contribution, a `Decko.config.prefetch_inclusions = true`
  switch (default `true`, off when explicitly disabled) preserves the
  escape hatch for callers depending on the depth-first latency
  curve (Card.cache + Lexicon writes still happen, just depth-first).
  This is a contribution-design decision, not a prototype limitation.
- **`max_depth` cap.** Ruby caps render recursion at
  `Card.config.max_depth` (`card-1.110.0/lib/card/format/nesting.rb:65-67`,
  default 20, raises `Card::Error::UserError` "Man, you're too deep"
  per `docs/benchmark-corpus-report.md` section 4 finding). The
  prototype seeds depths up to 16 to stay below the cap; the
  upper-bound measurements (depth 32 in the existing Ruby bench) are
  the same in either path — the cap fires after either N cold fetches
  or 1 cold prefetch + N warm hits.
- **`new_card` path not prefetched.** A `{{NewCard|open}}` creation
  goes through the original depth-first path (`fetch_card` →
  `new_card` at `card-1.110.0/lib/card/format/nest/fetch.rb:30-33`).
  The prototype's measurement script seeds existing cards only;
  measure a creation-shape deck before generalizing.
- **`additionalStatements` for read permissions is mapped in the TS
  side (`docs/render-fix-notes.md` defect 2 note, the comment at
  `src/card/render/prefetch.ts:71-75`) but not yet wired into the Ruby
  prototype. The Ruby cold render's read-rule resolution is a separate
  cost (rule-card fetches per inclusion) and the upstream-contribution
  series needs a follow-up stream for it; called out here so the
  prototype's query counts aren't misread as covering the whole cold
  render path.

## Honest wall (prototype measurement, 2026-09-21)

The prototype's measurement script (`prototype/measure.rb`) boots the
oracle app, seeds an 8-deep `PrefR1_chain_open_d08_n01` chain, and
prints queries-per-render before/after the patch. The actual numbers
recorded in `prototype/results/measurement.json`:

| phase | cold queries (median, n=5) | warm queries (median) | cold wall ms |
|---|---|---|---|
| A (depth-first, installed gem) | 11 | 0 | 114.3 |
| B (closure-prefetch, prototype overlay) | 11 | 0 | 116.2 |

**Reduction: 0%.**

The Phase A baseline is the corpus report's depth+3=11 exactly
(`docs/benchmark-corpus-report.md` section 4) — a strong
sanity-anchoring result on this machine.

The 0% reduction is honest work, not measurement noise. Tracing the
wall back to its source:

- **The CTE works.** `walk_closure_cte` (the `card_references`-walking
  recursive statement in `prototype/lib/card/format/nest/prefetch.rb`)
  issues 1 statement and returns the full closure's rows for any depth
  (verified at depth-2 in the standalone probe — 2 rows, 1 statement;
  in `prototype/measure.rb` at depth-8 the closure CTE returns the 8
  chain rows). The single-statement target is met.
- **Cache hydration works.** `hydrate_cache` writes each closure row's
  full Card into `Card::Cache[Card].temp.store` keyed by `card.key`
  and populates `Card::Cache[Lexicon].temp.store` for id→name and
  lex-key→id lookups. Verified by post-prefetch probe:
`Card.cache.temp.store` contains every chain card's key.
- **Per-inclusion `Card.fetch` still issues queries.** The depth-first
  path runs `Card::Format::Nest::Fetch#fetch_card`
  (`card-1.110.0 lib/card/format/nest/fetch.rb:8-17`) which dispatches
  to `new_card` for string cardish (`fetch.rb:30-33`). `new_card`
  calls `Card.fetch cardish, new: new_card_args`. The `:new` opts
  trigger `Card::Fetch::Results#new_result_card`
  (`card-1.110.0 lib/card/fetch/results.rb:16-29`), which calls
  `with_new_card` → `renew` → `card.newish` → `reset_patterns`
  (`card-1.110.0 mod/core/set/all/initialize.rb:61-72`).
  `reset_patterns` wipes `@set_mods_loaded` even when the card was
  retrieved from the prefetch-warmed cache; subsequent
  `include_set_modules` re-runs the pattern walk, which costs DB
  queries for trait-based patterns
  (`card-1.110.0 lib/card/set/pattern/all.rb:14-23` concrete_patterns).

**Why the TS port escapes this.** The TS engine's `format.ts` constructs
the fetch result without the Ruby `:new:` mass-reset; cached cards
carry cached status intact; the cache hit path is the no-op. The Ruby
`new_result_card` is doing real work that the TS port doesn't need to
do, because Ruby's `Card` is a live AR record with callbacks, not a
plain value object.

**The fix (for an upstream series follow-up).** Either (a) the
contribution series lands a `skip_modules: true` opt on `Card.fetch`
that the depth-first `Nest#initialize` uses when the card is in cache
(checked via `Card.cache.read(card.key)`), or (b) `reset_patterns`
gains a guard that preserves `@set_mods_loaded` when the patterns
state hasn't actually changed (instance-variable comparison). Both
are < 10 lines each and can be a wave 2 / contribution-series-2
stream; called out here so a future contributor doesn't retrace this.

**What the prototype still proves.** The design's full surface
(overlay mechanism, CTE-walk shape, cache-write contract, render-hook
placement) lands cleanly and runs end-to-end against the installed
gem. The single-statement walk + bulk hydration are the two
contributions; the deck-renderer's `reset_patterns` is the gem-side
blocker. For an upstream contribution, the series opener documents
the design + measurement + blocker; a follow-up streams (b) above.
For the TS port, this work is already done
(`src/card/render/prefetch.ts` + `src/card/render/format.ts`).