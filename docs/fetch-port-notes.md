# Fetch/cache layer port notes (decko-ts)

Wave 2 port of the Decko card fetch/cache layer over the SQLDatabaseDriver
foundation. Truth source, read directly from the installed gems:

- `card-1.110.0` (`gems/card-1.110.0/lib/card/`):
  `fetch.rb`, `fetch/retrieve.rb`, `fetch/store.rb`, `fetch/results.rb`,
  `fetch/card_class.rb`, `fetch/all.rb`, `cache.rb`, `cache/temporary.rb`,
  `cache/shared.rb`, `cache/class_methods.rb`, `cache/card_class.rb`,
  `cache/all.rb`, `cache/populate.rb`, `lexicon.rb`, `codename.rb`,
  `mark.rb`, `name.rb` (mark parsing), `name/all.rb` (name/key composition),
  `dirty.rb` (name_before_act), `content/all.rb` (content fallback),
  `error.rb` (NotFound classes).
- `card-mod-history-0.20.0`: `lib/card/action.rb`, `lib/card/change.rb`,
  `lib/card/action/changes.rb` (the history tables' role - see the
  composition map: they do NOT compose fetched cards).
- `cardio-0.20.0` (`lib/cardio/railtie.rb:41`): `max_temporary_cache_keys`
  default 10,000.
- `mod/core/set/all/` in card-1.110.0: `states.rb` (real/virtual/unknown),
  `type.rb` (type_name/type_code), `trash.rb` (trash semantics),
  `initialize.rb:80` (uncacheable?).

## Ported surface

| TS file | Ruby source |
|---|---|
| `src/card/fetch.ts` (`FetchEngine`) | fetch.rb (Fetch#retrieve_or_new + option handling), fetch/store.rb, fetch/results.rb, fetch/card_class.rb, cache/card_class.rb, cache/all.rb (Card#expire) |
| `src/card/fetch/cache.ts` | cache.rb, cache/temporary.rb, cache/shared.rb, cache/class_methods.rb |
| `src/card/fetch/retrieve.ts` | fetch/retrieve.rb, mark.rb#id_or_name, name.rb#id_from_string!/#bad_mark |
| `src/card/fetch/lexicon.ts` | lexicon.rb |
| `src/card/fetch/codename.ts` | codename.rb |
| `src/card/fetch/card-record.ts` | the composed Card shape (map below) + states.rb predicates |

API: `fetchById` / `fetchByKey` / `fetchByName` / `fetch` / `fetchWithOptions`
(the `fetch(*marks, opts?)` Ruby surface including multi-mark compose),
`bracket` (Card[]), `quickFetch`, `cardId`, `fetchTypeId`, `expireName`,
`expireCard`, `writeToCache`/`writeToTempCache`, `retrieveFromCacheByKey/ById`,
`resetCaches`, `installNameEnvironment` + `warmLexicon` (bridge to
`src/card/name/environment.ts`).

## The retrieval ladder (fetch.rb#retrieve_or_new)

1. **Mark normalization** (`mark.rb#id_or_name` + `fetch.rb#normalize_mark`):
   `Integer` -> id mark; `"~1234"` -> id mark but ONLY if the Lexicon knows
   the id, else `Card::Error::NotFound` (`name.rb:104-106`); `":code"` /
   Symbol -> `Codename.id!`, else `CodenameNotFound` (`codename.rb:89-91`);
   everything else -> a Card::Name (multi-mark args compose with "+",
   `mark.rb` flatten + `Name.compose`); relative names absolutize against
   `new[:supercard]` (`fetch.rb:36-41`).
2. **Cache** (`fetch/retrieve.rb#retrieve_from_cache`): by KEY for names,
   by id -> Lexicon.name(id) -> key for ids (`cache/card_class.rb:13-26`).
   A cached card is dropped when `look_in_trash` AND the cached card is
   `new?` - the db version is wanted (`retrieve.rb:15-17`).
3. **Database** (`fetch/retrieve.rb#retrieve_from_db`): `{key:}` for simple
   name marks; `{id:}` for integer marks, "~id" marks, and compound names
   (compound ids resolve through the Lexicon's side ids); `trash = false`
   added unless `look_in_trash`; a nil query (unresolvable compound mark)
   skips the db entirely (`retrieve.rb:22-23`).
4. **Cache update** (`fetch/store.rb`): write the card to cache when
   `fresh_from_db` (came from db, not trash) OR a `new_for_cache`
   placeholder was instantiated, AND the card is not `uncacheable?`. The
   cache write is keyed by `card.key` (`cache/card_class.rb#write_to_cache`);
   `local_only` writes the temp level only.
5. **Results** (`fetch/results.rb`): nil card -> nil. `new_card?` cards:
   with `new:` opts -> quick_renew/renew and return; `skip_virtual` -> nil;
   otherwise assign the name and return the card only if `known?` (real ||
   virtual). Real cards: finalize (include_set_modules - see deferrals) and
   return.

### Hard vs soft failures (per the source)

- **Soft (nil)**: unknown names, unresolvable compound marks, trashed cards
  without `look_in_trash`. `Card.fetch` NEVER raises for a well-formed mark
  that simply does not exist; `results` returns nil unless `known?`.
- **Hard (raise)**: only malformed marks - `"~9999"` with no such id
  (`NameNotFoundError` < `Card::Error::NotFound`) and unknown codenames
  (`CodenameNotFoundError` < `Card::Error::CodenameNotFound`).
- **RangeError rescue** (`fetch.rb:34-36`): an id beyond the column range
  does not raise; `Card.fetch` returns a new card NAMED
  `card id out of range: <id>`. (Ruby quirk verified in source: the rescue
  reads `f.mark`, which is only assigned when the mark normalized BEFORE the
  db touch - integer-arg marks. A "~huge" STRING mark raises inside
  `Fetch.new`, where `f` is still nil; the port routes both cases to the
  rescue's intended placeholder behavior.)
- **Virtual cards**: a compound card matching a structure rule is returned
  by fetch as a real-looking card (`states.rb#virtual?`). Requires the
  rules engine - DEFERRED (below); until then the port returns nil for
  virtual marks, which is exactly the `skip_virtual` behavior.

## Row-composition map (table -> attribute -> Ruby method)

A fetched card is composed from the `cards` table ONLY. The history tables
are not part of fetch composition.

| Attribute | Source table / composition | Ruby method |
|---|---|---|
| `id` | `cards.id` | ActiveRecord attribute |
| `name` | `cards.left_id` set: composed by joining the side cards' names through the Lexicon (`cards` self-join via `left_id`/`right_id`); else `cards.name` column | `lib/card/name/all.rb:12-14#name` -> `Lexicon.lex_to_name([left_id, right_id])` |
| `key` | composed name's key when compound; else `cards.key` column | `lib/card/name/all.rb:17-19#key` |
| `codename` | `cards.codename` column (Ruby: `super&.to_sym` - the plain AR reader) | `lib/card/codename.rb:5-7#codename` |
| `leftId` / `rightId` | `cards.left_id` / `cards.right_id` | ActiveRecord attributes |
| `typeId` | `cards.type_id` | ActiveRecord attribute |
| type NAME | NOT a column - the type CARD's name, fetched by `cards.type_id` | `mod/core/set/all/type.rb#type_name` (`quick_fetch(type_id)&.name`) |
| `type_code` | NOT a column - the type card's codename | `mod/core/set/all/type.rb#type_code` (`Card::Codename[type_id]`) |
| `dbContent` | `cards.db_content` column | `lib/card/content/all.rb:19#content` (`db_content \|\| (new_card? ? default_content : "")`) |
| `trash` | `cards.trash` (tinyint 0/1 -> boolean) | `mod/core/set/all/trash.rb#trash?` |
| `creatorId`/`updaterId`/`createdAt`/`updatedAt`/`currentRevisionId`/`readRuleClass`/`readRuleId`/`referencesExpired` | `cards` columns | ActiveRecord attributes |

**Why the history tables are absent**: `card_acts` / `card_actions` /
`card_changes` record the EDIT trail (card-mod-history-0.20.0
`lib/card/action.rb` doc; `Card::Change::TRACKED_FIELDS = %w[name type_id
db_content trash left_id right_id]`, change.rb:25). A card's CURRENT
attributes live in `cards` columns; `current_action` is a transient runtime
attribute, not storage (`lib/card.rb:146`,
`action_specific_attributes`). Verified: `retrieve_from_db` is a plain
`Card.where(query).take` over `cards` - no join with any history table.
The history stream (wave 1.5) owns those tables on the write side.

**Compound name/key columns**: since the 2020 migration, compound cards
store NULL in `cards.name`/`cards.key` with `left_id`/`right_id` set
(db/schema.sqlite.sql comments) - composition through the Lexicon is the
only correct read. Pre-2020 production rows may still carry populated
columns.

## Fetch cache semantics (the scoping answer)

`Card.fetch` reads and writes `Card::Cache[Card]` - a TWO-level cache
(`lib/card/cache.rb` module doc):

- **Temporary** (`cache/temporary.rb`): a per-process Hash - request/script
  scoped. Often "ahead" of the database: it can hold unsaved alterations
  and even placeholders for cards that do not exist. Capped at
  `max_temporary_cache_keys` (default 10,000; the overestimating `reps`
  counter is ported exactly).
- **Shared** (`cache/shared.rb`): cross-process, mirrors the database, and
  also stores "records of records that have been requested but are missing"
  (i.e. placeholders) and virtual cards. Keys are prefixed
  `{database}-{classKey}-{stamp}:{key}`; `reset` rotates the stamp, which
  orphans every entry without enumeration.

Operations (cache.rb): `read` = `temp.fetch(key) { shared.read(key) }` -
temp first, shared fallback, shared hits are copied into temp; `write` hits
both; `delete`/`reset` hit both; `fetch` same with write-back. A stored nil
is a temp HIT (`exist?`-based fetch) but Rails shared stores cannot hold
nil - ported as-is.

Keying and lookup: the cache is keyed by card KEY
(`cache/card_class.rb#write_to_cache`); `retrieve_from_cache_by_id` maps
id -> name -> key through the Lexicon (`cache/card_class.rb:17-22`), so the
Lexicon (`Card::Cache[Lexicon]`, a separate cache instance per Ruby class,
`cache/class_methods.rb#[]`) must be warm for id-cache hits.

Invalidation is EVENT-DRIVEN, not TTL-based: saves call `Card#expire`
(`cache/all.rb:17-24`), which deletes BOTH key versions - the current name's
key and `name_before_act`'s key (`each_key_version`, cache/all.rb:104-108) -
deletes the legacy `"~<id>"` key (`expire_id`; nothing writes that key
anymore since `write_to_cache` only writes `card.key`, but expire still
clears it), expires view-cache keys (`expire_views` - DEFERRED to the
renderer wave), and recursively expires the left card of compound names
(`expire_left`, cache/all.rb:39-43). Cross-process visibility comes from
the shared stamp reset; the class-level `renew`/`reset` machinery
(`cache/class_methods.rb`) is ported as `resetCaches()`.

Also ported: `after_write_to_temp_cache` -> `write_lexicon`
(`cache/card_class.rb:9-11`, `cache/all.rb:5-15`) - every temp-cache write
of a card mirrors id->name and lex->id into the Lexicon cache.

## Deliberate divergences (each is a decision, not an oversight)

1. **Broken-lexicon fallback**: Ruby's `Card#name` for a compound card
   whose side card is unresolvable is nil (and `#key` would raise composing
   `name.key` on nil). The port falls back to the row's own
   name/key columns in that case. Production pre-2020 rows carry columns;
   post-2020 rows with a missing side card are already corrupt data.
2. **`Lexicon.name(unknown_id)`** returns undefined instead of Ruby's
   `(name || "").to_name` empty-name object; blankness is the unknown
   signal at every Ruby consumer (`key.present?`, `name.present?`), so
   behavior is identical.
3. **`needs_prep?` -> false** (`fetch/store.rb:38-42`): that branch exists
   to pre-compute set-pattern modules before caching. Without set modules
   (rules wave), a cached real card and a freshly prepped one are
   indistinguishable, so the branch is observable-behavior-equivalent to
   false. `skip_modules` is accepted but is a no-op for the same reason.
4. **Async**: Ruby is synchronous; the driver is async. Everything
   db-touching returns a Promise; the caches stay synchronous like Ruby's.
   The sync name-environment adapters (`installNameEnvironment`) serve
   cache-warm entries only - `warmLexicon` primes them (the NameLexicon
   contract in name/environment.ts is sync by design).
5. **"~huge" string marks**: Ruby's RangeError rescue only works for
   integer-arg marks (see "hard vs soft failures"); the port routes both
   integer and "~digits" overflow to the rescue's placeholder behavior.

## Deferred boundaries (each with the wave that owns it)

| Boundary | Ruby surface | Owner |
|---|---|---|
| Card CREATION on fetch-if-absent | `new:` opts that actually save (`Card.create!`), full `renew`/`newish` (`handle_type`, `assign_attributes`, supercard wiring, subcards) | write path (wave 1.5 stream continues; `fetch(new:)` here only instantiates/caches placeholders and dups) |
| Virtual cards | `states.rb#virtual?` -> `structure` rule lookup; fetch returns generated cards for e.g. `Home+*editors` | rules wave (sets/rules); until then virtual marks fetch nil (= `skip_virtual` behavior) |
| Read rules / permissions | `read_rule_class`/`read_rule_id` columns, `ok?(:read)` filtering in queries | rules wave (the smoke `read_rule` fixture entry stays in rules-engine's hands) |
| Set modules / patterns | `include_set_modules`, `needs_prep?`, `patterns?`, `uncacheable?` setters | rules wave (mod loading) |
| View-cache expiry | `expire_views`, `view_cache_keys`, `Card::View.cache` | renderer wave |
| `Card#fetch` field traversal | `fetch/all.rb` (`card.fetch :field` chains) | the wave that lands live card instances with name wiring (engine integration) |
| `uri_fetch` / `fetch_from_cast` | `fetch/card_class.rb:59-134` | web/Decko-app wave |
| Draft/act-aware retrieval | `current_action` transient wiring, `Action#card` (`Card.fetch id, look_in_trash: true` works already) | history/write-path stream |

## Tests

`tests/card/fetch/` on real in-memory SQLite (better-sqlite3 via the REAL
`LocalSqliteDriver`, DDL from `db/schema.sqlite.sql` applied statement-wise
through the driver - see the note in fetch-test-storage.ts), cards seeded as
plain INSERT rows: junction pairs with NULL name/key columns + side cards,
trashed cards, codenamed cardtype cards.

- `cache.test.ts` (13): temp/shared/facade semantics, max-keys reset, stamp
  rotation, temp->shared fallthrough, both-level writes.
- `lexicon.test.ts` (14): id/name by key and side-ids, trash asymmetry
  (`id()` excludes trash, `name(id)` does not - lexicon.rb:122 vs
  :101-110), missing-side behavior, cache-warm zero-query repeats,
  compound reverse-entry caching, `writeTemp`/`deleteFor`.
- `fetch.test.ts` (43): hit/hit-cache/miss (query-count proven), placeholder
  caching of misses, byId/byKey/ByName parity, multi-mark compose, codename
  marks, NotFound vs nil vs out-of-range, trash exclusion + look_in_trash
  (including the cached-placeholder drop, retrieve.rb:15-17), composition
  map assertions (compound columns NULL, type-card resolution, history rows
  ignored), cache scoping (temp vs shared vs local_only), invalidation
  (expireName, both key versions, "~id" key, recursive left expiry),
  fetch-with-new surface, validate_opts!, blank marks, uncacheable guard.
- `oracle-replay.test.ts` (1): registers the **card-engine** replay handler
  per `docs/replay-harness.md` - seeds a mini-deck reconstructing the
  captured smoke cards (captured ids/contents, junction parts, cardtype
  cards with codenames) and byte-diffs all 10 captured card records against
  Ruby truth. All 10 pass (id stripped on both sides by the harness).

Total: 71 tests in tests/card/fetch (75 including the shared file's suite).

## Oracle-verification status

- VERIFIED against the captured oracle: the 10 smoke `card-engine` records
  (`name`, `key`, `content`, `codename`, `type`, `type_code`, `left`,
  `right`) byte-exact via the replay harness.
- NOT YET oracle-covered (needs future capture rungs or the owning waves):
  trash/look_in_trash behavior, placeholder caching, invalidation timing,
  compound-name key canonicalization variants - these are pinned by
  source-cited unit tests only (file:method cites above); a richer capture
  (rename, trash, re-fetch) would upgrade them.
- The `rules-engine` smoke entry (read_rule) is untouched here - rules wave.
