# reg-redteam-A2 — the Cardio application layer (migrations, seeds, CLI, generators)

Row: `reg-redteam-A2` in `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`
(verdict UNPORTED, bucket WORKING ON IT). Its blocker: "REAL-GAP — the Cardio application layer
(`lib/cardio/migration*`, `db/seeds.rb`, `lib/cardio/seed.rb`, `lib/decko/cli.rb`,
`lib/generators/**`, `lib/decko/rake_tasks/`) has no port counterpart; the port CLI is
`src/card/pods/cli.ts` (sow/eat only). Fix: port the migration/seed/CLI surface or rule it out of
the parity surface."

The second half of that instruction is the honest one, and this is the audit that rules it in
parts and names the rest. Ruby side read from the pinned gemset
(`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`), port side at canonical tree
`decko-ts-release-lead` @ `d8050251`.

## 1. Migrations — three different things share the word

**Schema migrations (Rails/ActiveRecord).** `Cardio::Migration < ActiveRecord::Migration[6.1]`
(`card-1.110.0/lib/cardio/migration.rb:1-9`) with `Assumption`, `Stamp`, `Port` mixins and a
version file `card-1.110.0/db/version.txt` (`20221031182227`). The mods in this pin ship **zero**
`data/schema` files (`find card-mod-*/data/schema -type f` → 0), so no mod contributes a schema
migration; the schema is the gem's own `db/schema.rb`.
**Port: OUT OF SCOPE BY MECHANISM, with the table kept.** The port ships the schema as SQL
(`db/schema.sqlite.sql`, `db/schema.mysql-port.sql`) and applies host migrations from
`db/migrations/*.sql` (`npm run db:migrations:apply`, wrangler D1) — a host mechanism, not a
Rails migration class. Ruby keeps the `schema_migrations` / `transform_migrations` tables; the
port declares `transform_migrations` in `src/server/schema.ts:300` for schema parity. **Named
divergence: the migration FRAMEWORK (a Rails class hierarchy, an assumption/stamp DSL, a
version.txt) has no port counterpart because the port has no Rails runtime; the artifacts it
produces do.**

**Transform migrations (mod-declared DATA migrations).** This is the interesting half and the
one the row's "migration" word covers without distinguishing. The pinned mods ship **22** dated
Ruby files under `data/transform/` — `move_roles`, `member_ids`, `death_to_machines`,
`migrate_customizable_bootstrap_skin`, `fix_compound_self_sets` (newest, 2025-02-04), and so
on. Each is a one-time upgrade of an EXISTING deck's data to a newer mod shape.
**Disposition: NAMED DIVERGENCE, with the reason it costs nothing observable.** A transform
rewrites rows a deck accumulated under an older mod version. Every deck this engine creates is
seeded fresh from the current mod data (`src/card/auth/boot-seed.ts`, `db/seed.sql`), so no
legacy row exists for a transform to rewrite — the migration runner would be dead code on every
reachable deck. The `transform_migrations` table is already declared port-side, so a future
runner would have its bookkeeping. Porting 22 dated scripts that can only fire on decks this
engine never produces would add unreachable code.

**Deck-version bookkeeping.** The register's row noted "Version tracking exists port-side as
`deck_data_version` + `auth_migrations` tables — the register never says whether schema
versioning maps." **It does not map, and that is correct:** port-side `deck_data_version` is not
a schema version at all, it is the deck's committed-WRITE stamp used for cache freshness
(`src/card/one-trip/one-trip-fetch.ts:257,298-300`; `src/card/live/live-render.ts:13`; the 18
Bunny triggers that bump it, `src/card/drivers/bunny-db.ts:332-333,677`). Conflating the two
would be the mistake; the port's freshness stamp is a different concept with the same table
name, and this note is the disambiguation.

## 2. Seeding — ported, different mechanism

Ruby: `card-1.110.0/db/seeds.rb` + `lib/cardio/seed.rb` (writes the deck's cards from each mod's
`data/*.yml`, e.g. `card-mod-account-0.20.0/data/real.yml`, and caches the result to a file
named by `seed_type`). Port: `src/card/auth/boot-seed.ts` creates the same deck rows in the same
engine the runtime uses, and `db/seed.sql` carries the SQL seed. The one Ruby-specific piece —
the seed CACHE FILE (`seed_type`, `seed_cache_from_stash`, `extra_seed_tables`, all dispositioned
in `reg-redteam-cfg-railtie-keys-disposition-2026-10-20.md`) — is CLI plumbing with no runtime
surface. **PORTED in behavior, N/A in mechanism.**

## 3. CLI — the port covers the engine-facing verbs

Ruby `decko-0.20.0/lib/decko/cli.rb` is a Rails application runner: it execs inside a Decko app
(`Cardio::ScriptLoader.exec!`) and then loads `decko/commands/application`. Its engine-facing
siblings are the pod verbs (`decko eat`, `decko sow`), which the port ports as
`src/card/pods/cli.ts` / `src/card/pods/eat.ts` / `src/card/pods/sow.ts` (the register's A-R3/A-R4
rows already grade both PORTED). **PORTED for the verbs that touch the engine; the Rails app
runner itself is N/A.**

## 4. Generators and rake tasks — Rails scaffolding, no engine surface

`card-1.110.0/lib/generators/deck/**` is an app scaffold: `templates/config/*.erb`,
`databases/{mysql,postgres,oracle,jdbc*,sqlite3,frontbase,ibm_db}.yml`, `puma.rb`,
`cucumber.yml`, `bin/spring.erb` — i.e. "generate a new Ruby on Rails application that hosts a
deck". `card-1.110.0/lib/generators/{migration,mod,set}` are file-scaffolding generators for
Ruby set files. `decko-0.20.0/lib/decko/rake_tasks/` is empty in this pin, and `decko`'s Swagger
YAML generator (`lib/decko/swagger.rb` + `lib/decko/swagger/`) is a documentation task (the
register's D row already confirmed it adds no routes).
**All INERT for the parity surface:** they generate Ruby source files for a Rails app. The port
generates a deck through its own host tooling (`tools/deploy/*`, `npm run db:migrations:apply`,
`npm run build:engine`) and never emits `.erb` or set-module Ruby files.

## Bottom line

Six sub-surfaces, three dispositions: the seed/engine-facing verbs are **ported**, the
migration framework / generators / rake tasks / Swagger are **out of scope by mechanism** (they
produce or consume Rails runtime artifacts, not card behavior), and the mod transform
migrations are a **named divergence** whose only reachable decks are legacy decks this engine
never creates. The row's instruction "port the migration/seed/CLI surface" would add Ruby-shaped
tooling to a Cloudflare Worker engine and change no card byte.

## Commands run (this tree, base d8050251)

- `cat card-1.110.0/db/version.txt` → `20221031182227`; `head -40 card-1.110.0/lib/cardio/migration.rb` (ActiveRecord::Migration[6.1] + Assumption/Stamp/Port).
- `find card-mod-*/data/schema -type f | wc -l` → 0; `find card-mod-*/data/transform -type f | wc -l` → 22 (newest `20250204175412_fix_compound_self_sets.rb`).
- `find card-1.110.0/lib/generators decko-0.20.0/lib/generators -type f` → Rails app scaffolding (`config/*.erb`, `databases/*.yml`, `puma.rb`, `cucumber.yml`).
- `ls decko-0.20.0/lib/decko/rake_tasks/` → empty; `head -25 decko-0.20.0/lib/decko/cli.rb` (Rails app runner).
- `ls db/migrations/` → `001-auth-sessions.sql`; `grep -rn "deck_data_version" src/` → the freshness stamp, cited above.
- `grep -rn "transform_migrations" src/` → table declaration only (`src/server/schema.ts:300`).

No test was added by this row: no source file changed.

Suites run in this tree while writing the disposition: `npx vitest run tests/migrate/
tests/card/pods` → the first run showed `tests/migrate/import-deck.test.ts` failing with
`nest index: NOT built (exit 2)`. Root cause, measured: the child
`tools/deploy/build-nest-index.mjs --db … --json` exits 2 with
`Cannot find module … dist/vendor/edge-bootstrap-scss-snapshot.js` — this WORKTREE's `dist/`
had been produced by a test's `tsc -p tsconfig.json`, which compiles TypeScript but does not
copy the runtime assets (`tools/dist/runtime-assets.mjs`'s `copyRuntimeAssets`, called by
`npm run build:engine`). After `npm run build:engine`, `npx vitest run tests/migrate/` →
**93 passed, 1 skipped** (the skip is the documented data gate in
`tests/migrate/cli-engine-verification.test.ts`). Worktree setup artifact, not a source
regression.
