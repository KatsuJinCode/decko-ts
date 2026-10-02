# Ruby oracle harness

Records Ruby Decko behavior as deterministic JSON fixtures. The fixtures
in `fixtures/captured/` are the executable specification: the decko-ts
port must reproduce them byte-for-byte (modulo documented normalizations).

- Oracle versions: card 1.110.0 / decko 0.20.0 on Ruby 3.3
  (installed gems under the Ruby gems directory, `gem environment gemdir`),
  Rails 7.2.3.2 stack, SQLite via the precompiled
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
RAILS_ENV=development bundle exec decko runner ../../tools/oracle/capture.rb
RAILS_ENV=development bundle exec decko runner ../../tools/oracle/cql_capture.rb
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
cd tools/oracle
decko new decko-oracle-app -d sqlite3 --skip-bundle
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
   trunk_name. The gem lacks card-level aliases (`junction?`,
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
5. **MySQL rung (match capture): YES** (2026-09-21). See the next section.

## MySQL rung: CQL `match` capture (2026-09-21)

Closes the `match` gap left open above: this rung runs the SAME oracle
app against a MySQL-protocol server, where card 1.110's CQL `match`
actually executes (`ConnectionAdapters#match` -> `REGEXP`; the abstract
raise is all SQLite can record). The parity analysis this capture feeds
lives in `docs/cql-match-decision.md`; the TS replay is
`tests/cql/oracle-match-replay.test.ts`.

### Server: portable MariaDB, no install

Machine recon found no Docker and no MySQL/MariaDB install or service. What
the recon DID find: the `mysql2` gem's build had been attempted before and
failed (`extconf failed, exit code 1` - no client headers/libs), and the
network reachable. Provisioning therefore used the portable MariaDB
Windows zip, run entirely in userspace:

- `tools/oracle/downloads/mariadb-11.4.5-winx64.zip` (90.8 MB,
  archive.mariadb.org; extracted to
  `tools/oracle/portable-mariadb/mariadb-11.4.5-winx64/` - server, client,
  AND the client dev files the gem build needs).
- `tools/oracle/mysql-server/my.ini` - loopback-only (127.0.0.1:33061),
  dedicated datadir `tools/oracle/mysql-server/data`, charset
  utf8mb4 / collation utf8mb4_general_ci (the collation is load-bearing
  for match case semantics and is recorded in the fixture). Nothing is
  installed as a Windows service; deleting the two directories removes
  every trace.
- Init: `mariadb-install-db.exe -d <datadir> -c <my.ini>` (the Windows
  binary takes neither `--defaults-file` nor `--basedir`; use `-d`/`-c`).
- Boot: `bin/mariadbd.exe --defaults-file=<my.ini> --standalone`, or
  `bash tools/oracle/boot-mysql-server.sh` (waits for readiness).
- DB `decko_oracle` created manually (`CREATE DATABASE ... CHARACTER SET
  utf8mb4 COLLATE utf8mb4_general_ci`); `decko setup` ran the schema +
  core-card seed into it (604 cards, same count as the SQLite rung).

### Building mysql2 on Windows (all steps required, in order)

1. The gem's Windows build path has TWO branches
   (`ext/mysql2/extconf.rb:246+`): the dlltool/libmysql.a vendoring branch
   is skipped on RubyInstaller Rubies (`defined?(RubyInstaller)` - true
   here), so the link happens via plain `have_library('mysqlclient')`
   (`:115`): the lib dir must contain a `mysqlclient.lib`.
2. `tools/oracle/mysql-client-scratch/` provides the layout extconf
   wants: `include/` = the zip's `include/mysql/` contents (mysql.h at
   top), `lib/mysqlclient.lib` = copy of `libmariadb.lib`, plus
   `libmariadb.dll`.
3. Build: `gem install --local <cache>/mysql2-0.5.7.gem --no-document --
   --with-mysql-dir=C:/localProjects/decko-ts/tools/oracle/mysql-client-scratch`.
   The resulting import lib binds to `libmariadb.dll` (MariaDB's own dll
   name, not MySQL's). Noise from a RubyInstaller pacman keyring hook
   during the build is non-blocking.
4. The .so only finds `libmariadb.dll` when `RUBY_DLL_PATH` points at the
   client lib dir (RubyInstaller's DLL search mechanism; vendoring next
   to the .so and PATH entries both failed). EVERY mysql2-rung command
   therefore needs
   `RUBY_DLL_PATH=C:/localProjects/decko-ts/tools/oracle/mysql-client-scratch/lib`.
5. The app Gemfile carries `gem "mysql2", "~> 0.5.7", require: false`.
   The `require: false` is NOT optional: bundler's auto-require otherwise
   loads mysql2 on EVERY boot and the default SQLite rung dies with
   `LoadError: 126` (its dll needs RUBY_DLL_PATH). Rails' mysql2 adapter
   requires the gem itself when selected.

### Adapter switching

`config/database.yml` is now an ERB switch: default = the original SQLite
rung, byte-identical contract; `ORACLE_DB=mysql2` selects the mysql2
adapter at 127.0.0.1:33061 (db decko_oracle; `_test`/`_production` names
exist only because `decko setup` runs `db:create` for every environment).
The `decko setup` flow for MySQL needed development/Test/production all
mysql2-valid (its first attempt aborted creating `db/test.sqlite3` with a
sqlite filename under the mysql2 adapter).

### Capture

`tools/oracle/cql_match_capture.rb` (run header has the exact command):
seeds ten self-contained probe cards (all carry the unique token
"Matchprobe"; create-if-missing, content-converging) and records to
`fixtures/captured/cql-mysql-match.json`:

- `mechanism` - server version, adapter, collations, the applied
  `#match` method's source location (runtime proof of which patch module
  fired), the adapter's match output, and the generated SQL shape
  (`(c0.name REGEXP ... OR c0.db_content REGEXP ...)`).
- `queries` - 30 entries: plain words, case (both directions), escaped
  metacharacters, `~~` raw regex (wildcards, `\b`, classes, POSIX classes,
  backreferences, `\p{Han}`, `[[:<:]]`), `=` exact-name (incl. case
  variant), field-restricted `name:`/`content:` match, array values,
  empty-match no-op, compound-row NULL-name invisibility, accented/CJK
  matching, accent sensitivity. Every query pins `sort: "name"`.
- `rendered_match_search` - a Search card whose query IS a match query,
  rendered (`open`/`content`/`bar`), with `data-slot-id` AND
  `data-card-id` normalized (card ids are DB-local: the MySQL ids differ
  from the SQLite rung's).

Byte-stability verified 2026-09-21: three consecutive captures produced
identical sha256 (`d5780dc5...` for runs 2 and 3; run 1 differed because
first-creation state converges - the create-then-capture contract from
the SQLite rung applies here too).

### Concurrency warning for the SHARED SQLite deck

The SQLite rung's deck (`db/development.sqlite3`) is shared state: captures
are only trustworthy when nothing else is mutating the shared deck (check
for recent non-seed cards first). The MySQL rung is immune — its server,
datadir and database are private to this rung.
