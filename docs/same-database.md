# Same data, no migration: serving a Ruby Decko database as it is

The port opens a database written by Ruby Decko (card 1.110.0 / decko
0.20.0) and serves it directly. There is no import or conversion step, and
Ruby can keep serving the same database alongside the port.

## What happens on first open

Every Node host opens a deck through `openSameDatabase`
(`src/server/same-database.ts`): the staging server (`vm-staging-server.mjs`)
and the reference-harness adapter that the parity grade runs. It adds the
objects the port needs that Ruby's schema does not have, and nothing else:

| Object | Why the port needs it |
| --- | --- |
| `deck_data_version` table, one row | The freshness stamp the render gate checks before reusing cached work. |
| Six `AFTER INSERT/UPDATE/DELETE` triggers on `cards` and `card_references` | Bump the stamp. They fire on Ruby's writes too, so a card saved by Ruby invalidates the port's cached renders. |
| `auth_sessions` and its two indexes, `auth_migrations` | The port's session table and its bookkeeping (`db/migrations`). Ruby's own `sessions` table is left alone. |
| `cards_name_trash_index`, `cards_right_id_trash_index`, `cards_codename_present_index`, `cards_key_last_char_index` | Non-unique lookup indexes for the serving path. They add no constraint a Ruby write could fail. |
| `cards_key_binary_index`, `cards_codename_binary_index` | Only when the database has no BINARY-collated index leading on `key` / `codename`. A Ruby-built SQLite deck already has one, so these are not created there. |

Every statement is `CREATE ... IF NOT EXISTS` or `INSERT OR IGNORE`. Nothing
is dropped, altered or rewritten: no column is added to a Ruby table, no
Ruby index is removed, no Ruby row changes. A second open creates nothing.

## Reading and writing the same rows

The port reads Ruby's tables in Ruby's row shapes and writes rows Ruby
reads: `cards`, `card_acts`, `card_actions`, `card_changes`,
`card_references` and `card_virtuals` are compared row for row against Ruby
for every write in the reference fixture (the grade's persistence and side
effects figures).

Passwords: on a database that carries Ruby's schema, the host stores
passwords with Ruby's salted SHA-1 (`Card::Auth.encrypt`) unless
`DECKO_PASSWORD_HASH` says otherwise, so an account whose password the port
sets can still sign in through Ruby. Setting `DECKO_PASSWORD_HASH=pbkdf2`
opts out; Ruby then cannot verify those passwords.

## Evidence

Measured 2026-10-14 on Windows, Node 24, Ruby 3.4.

1. `tests/server/same-database.test.ts` copies the Ruby-built synthetic deck
   (`reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3`) to a
   scratch directory and checks that the first open adds exactly the objects
   above, that every object and every row Ruby created is unchanged, that a
   second open changes nothing, and that an UPDATE of `cards` issued the way
   ActiveRecord issues it moves the stamp.

   ```bash
   npx vitest run tests/server/same-database.test.ts
   ```

2. The parity grade opens a private copy of that same Ruby-built file
   through `openSameDatabase`, with no import:

   ```bash
   node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json \
        --fixture reference-harness/fixtures/synthetic-v1 --out <resultsDir>
   node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
        --actual <resultsDir>
   ```

   Result: rendering 1,754 of 1,754, semantics 2,389 of 2,389, persistence
   16 of 16, side effects 19 of 19, read-writes 8 of 8, other tables 12 of
   12, verdict pass. The grader compares every table that exists in the
   oracle's schema (read from the fixture's Ruby-built deck); a table only
   the engine's schema has is listed in the report's `engine_only_tables`
   field with its row deltas, and is neither a match nor a declared
   difference. Here that field lists `deck_data_version`, bumped by all
   twelve write steps.

3. `tools/same-database/cross-engine-check.mjs` drives both engines on one
   copy of the file: the port writes a card, stock Ruby opens the same file
   and renders it and writes a card of its own, then the port renders both.
   The HTML from the two engines is compared byte for byte after the
   grader's normalization. It needs Ruby and the oracle's gems (`GEM_HOME`).

   ```bash
   GEM_HOME=<ruby gem home> node tools/same-database/cross-engine-check.mjs
   ```

   Result: the `core` view and the full page of both cards (the port's card
   rendered by Ruby, Ruby's card rendered by the port) are the same from
   both engines, 4 of 4, and the freshness stamp moved on both engines'
   writes.

## Limits

- SQLite is what is measured here. The port has no MySQL driver: a Ruby
  deck on MySQL is not served directly today. Doing so needs a MySQL
  implementation of the driver interface (`src/server/driver.ts`) and
  MySQL dialect output from the CQL compiler (`src/cql/sql.ts`); the additive
  objects above would be created with MySQL DDL (triggers included).
  PostgreSQL is tracked separately.
- The harness converts its private copy of the deck from WAL to the rollback
  journal before opening it (`reference-harness/runner/run.mjs`), so that no
  sidecar files are left in the fixture; a served deck keeps whatever
  journal mode it has.
- Running Ruby's `db:schema:load` recreates its tables without the port's
  triggers; the next open by the port adds them again.
