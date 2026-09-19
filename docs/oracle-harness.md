# Ruby oracle harness

Records Ruby Decko behavior as deterministic JSON fixtures. The fixtures
in `fixtures/captured/` are the executable specification: the decko-ts
port must reproduce them byte-for-byte (modulo documented normalizations).

- Oracle versions: card 1.110.0 / decko 0.20.0 on Ruby 3.3
  (`C:\Ruby33-x64`), Rails 7.2.3.2 stack, SQLite via the precompiled
  `sqlite3-2.9.6-x64-mingw-ucrt` gem.
- Oracle app: `tools/oracle/decko-oracle-app/` (gitignored; disposable,
  rebuildable from the commands below).
- Captures: `tools/oracle/capture.rb` (smoke) and
  `tools/oracle/cql_capture.rb` (CQL battery) write JSON with deeply
  sorted keys, 2-space pretty-printing, and a trailing newline.

## Re-running a capture

From the repo root, in Git Bash:

```bash
cd tools/oracle/decko-oracle-app
RAILS_ENV=development bundle exec decko runner C:/localProjects/decko-ts/tools/oracle/capture.rb
RAILS_ENV=development bundle exec decko runner C:/localProjects/decko-ts/tools/oracle/cql_capture.rb
```

Seeding is create-if-missing (re-runs converge, no duplicate cards).
Captures are read-only against the card set afterwards.

Byte-stability check (the contract):

```bash
sha256sum ../../fixtures/captured/*.json   # before
# re-run both captures
sha256sum ../../fixtures/captured/*.json   # after - must match
```

Verified 2026-09-19: two consecutive runs of each capture produce
identical sha256 sums (`smoke.json`, `cql-basic.json`).

## Rebuilding the oracle app from scratch

The app is disposable. Full rebuild (only needed if the app dir is
deleted or the DB is corrupted):

```bash
cd C:/localProjects/decko-ts/tools/oracle
C:/Ruby33-x64/bin/decko new decko-oracle-app -d sqlite3 --skip-bundle
cd decko-oracle-app
printf '\n# Windows timezone data (zoneinfo dirs do not exist on Windows)\ngem "tzinfo-data"\n' >> Gemfile
printf '\n# ActiveSupport 7.2 JSON encoding passes legacy quirks_mode kwarg; json 3.x removed it\ngem "json", "~> 2.7"\n' >> Gemfile
bundle install --local
RAILS_ENV=development bundle exec decko setup
# then re-run the captures above; re-captured ids may differ from the
# committed fixtures (see "id stability" below)
```

Note: `--skip-bundle` is honored partially - the generator still runs
`bundle install --quiet` (resolved from local gems). `decko setup`
without `RAILS_ENV=development` targets production (it created
`db/production.sqlite3` first); always set `RAILS_ENV=development`.

The two Gemfile patches above are required; neither can be skipped:

1. `tzinfo-data` - Rails boots via TZInfo; Windows has no zoneinfo
   directories, so `decko setup` aborts with
   `TZInfo::DataSourceNotFound` without it.
2. `json ~> 2.7` - the bundle otherwise resolves json 3.0.2, which
   removed the legacy `quirks_mode` kwarg that ActiveSupport 7.2's JSON
   encoding passes (`JSON.generate(value, quirks_mode: true, ...)`).
   With json 3.x every HTML body render dies with
   `ArgumentError: unknown keyword: quirks_mode` (only `:title` survives,
   because it does not build data attributes and so never serializes a
   tag option through `to_json`). Pinning json 2.x restores the Rails
   7.2-supported dependency matrix; it patches nothing in card/decko.

## Fixture contents

`smoke.json` - seeded card set + captures. Seeds (all created by
"Decko Bot" via `Card::Auth.as_bot`):

| Card | Type | Purpose |
|---|---|---|
| Oracle Basics | RichText | plain card |
| Oracle Junction (+child_one, +child_two) | RichText | junction family |
| Oracle Rich (+rich_child) | RichText | nested `{{inclusion}}` in content |
| Oracle Search | Search | CQL `{"left":"Oracle Junction","sort":"name"}` |
| Oracle Restricted (+\*self, +\*self+\*read) | RichText/Set/List | read-rule setup |

Captured sections: `cards` (attributes for the seeds + the rule set
cards), `rendered` (views :open/:closed/:content/:title for four cards,
plus an unknown-view error sentinel), `cql_search` (name-only result
sets), `read_rule` (rule card, rule content, effective readers via
`who_can(:read)`, and `ok_to_read?` under Anonymous vs Decko Bot).

`cql-basic.json` - read-only CQL battery over the seeds, each query
recorded with its canonical JSON form and its name-only result:
exact `name`, `left`/`right`/`plus` conditions, `sort: "name"` with
`limit` and `dir: "desc"`, `not`, exact `content`, `created_by`, an
empty-result query, and the `match` failure sentinel.

## Nondeterminism notes

1. **Slot ids (normalized).** Every wrapped slot render embeds a random
   DOM id: `card-mod-format-0.20.0/set/all/html/wrap.rb` ->
   `wrap_data` -> `"slot-id": SecureRandom.hex(10)`. The attribute
   appears with double quotes in most views and single quotes inside
   search-result bars. The capture normalizes
   `data-slot-id=<quote><20 hex><quote>` to `data-slot-id="RANDOMIZED"`
   at the recording layer (both quote styles); Ruby behavior is not
   patched. Presence of the attribute remains part of the fixture. Any
   other run-to-run diff is a real nondeterminism and must be
   investigated.
2. **Timestamps / creator ids (excluded).** `created_at`, `updated_at`,
   creator and updater ids are real times/rows and are not captured.
3. **seed_log (stdout only).** Whether a seed was created/updated/present
   differs across runs; capture.rb prints it to stdout and keeps it out
   of the JSON.
4. **id stability (informational).** Card ids depend on DB history: the
   committed fixtures carry ids from an app whose DB saw failed probe
   runs (gaps at 607, 609, 612...). A freshly rebuilt app produces a
   different id assignment. Name-keyed values are the parity spec; treat
   `id` fields as informational unless the DB is reused unchanged.
5. **Unordered CQL results.** Queries without an explicit `sort` (none in
   the committed fixtures) return SQLite scan order - stable per DB file
   but not across rebuilds. Always sort in new captures.

## Known oracle-on-SQLite limitation: CQL `match`

`match` is architecturally unsupported on SQLite in card 1.110: the
query compiler routes it through `ActiveRecord ConnectionAdapters#match`
(`card-1.110.0/config/initializers/02_patches/active_record.rb`),
implemented only for MySQL (`REGEXP`) and PostgreSQL (`~*`); the abstract
default raises (`RuntimeError: %{func} not implemented`, via
`Card::Query::Value::MatchValue#match_sql`). The fixture records the
raise as the observed SQLite behavior; no adapter patch was added,
because a patched oracle would fabricate behavior the production engine
(MySQL) does not have. match-parity requires a MySQL oracle rung.

## 1.110 facts the harness surfaced (port-relevant)

- The basic cardtype card is **named "RichText"** (codename `:basic`,
  id 2). No card named "Basic" exists; seeding with `type: "Basic"`
  silently falls back to the default type instead of failing.
- `Card.fetch` returns `nil` for missing cards (raises only when given
  `new:` or in hardened modes); guard fetches in capture code.
- `Card::Auth` is namespaced (`Auth` alone is unbound in runner scope);
  `Card::Auth.as_bot` bypasses permission checks, and the runner's
  default user is Anonymous (id 201 here), so writes outside `as_bot`
  raise permission errors.
- `who_can(:read)` returns role card ids; `*all+*read` default rule is
  the List card `"Anyone"`.

## RUNG ladder as executed (2026-09-19)

1. **Standalone card gem: NO.** `ruby -e "require 'card'"` fails at
   `card.rb:3` (`uninitialized constant ActiveSupport`); preloading
   ActiveSupport reaches `card.rb:131`
   (`uninitialized constant Cardio`, from `class Card < Cardio::Record`)
   - the full Card class requires the Rails engine and a DB. Name-level
   capture alone IS possible via the standalone `cardname-0.20.0` gem:
   `require "active_support"; require "active_support/core_ext";
   require "cardname"; require "core_ext"` (the gem never requires its
   own `lib/core_ext.rb`; `Object#to_name` lives there), then
   `"A+B".to_name` -> key/left/right/absolute/compound?/piece_names/
   tag_name/trunk_name. The gem lacks card-level aliases (`junction?`,
   `trait_name?` are card-gem extensions).
2. **Fresh decko app: YES.** `decko new decko-oracle-app -d sqlite3`
   scaffolded cleanly; needed the two Gemfile patches above and
   `RAILS_ENV=development`. 604 core cards seeded, runner boots.
3. **Capture loop: YES.** Two rungs of iteration: the `%w[...]`
   word-array trap split card names on spaces (bogus `nil` fetches -
   both the render list and the first probe used it); json 3.x broke
   rendering via `quirks_mode`; slot-id randomization needed recording
   -layer normalization. Final state: byte-stable.
4. **CQL battery: YES.** 11 recorded queries, byte-stable.
