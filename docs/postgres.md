# PostgreSQL decks

Ruby Decko runs on PostgreSQL as well as MySQL. The port can serve a deck
from PostgreSQL too, through `PostgresDriver`
(`src/server/drivers/postgres.ts`). It sits beside the SQLite, D1 and libSQL
drivers behind the same `SQLDatabaseDriver` interface.

## Connecting

The driver accepts any client with a node-postgres-shaped
`query(text, params)` method:

```ts
import pg from "pg";
import { PostgresDriver, configurePgTypes } from "./src/server/drivers/postgres.js";

configurePgTypes(pg.types); // 64-bit integers and NUMERIC as numbers
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const driver = new PostgresDriver({ client });
```

For tests and local tooling, use PGlite (`@electric-sql/pglite`). It is
PostgreSQL compiled to WebAssembly and runs in-process, with nothing to
install:

```ts
import { PGlite } from "@electric-sql/pglite";
const driver = new PostgresDriver({ client: await PGlite.create() }); // or PGlite.create(dataDir)
```

Give the driver one connection (`pg.Client`), not a `pg.Pool`. Transactions
run BEGIN and COMMIT on the client the driver holds, and a pool could run
them on different connections. The engine never imports either SDK; the
host constructs the client.

## Transaction guarantee

`transactionGuarantee` is `native`:

- atomic on failure;
- crash recovery is done by the database;
- readers on other connections are isolated;
- writers are serialized per driver object;
- `batch()` is not atomic on its own;
- `idsReusedAfterRollback: false` — PostgreSQL sequences do not give back
  ids that a rolled-back transaction consumed.

Inside a transaction, every statement runs under its own savepoint. A failed
statement then undoes only itself, as in SQLite, instead of aborting the
whole PostgreSQL transaction.

## Dialect translation

The engine writes SQLite-dialect SQL, so each statement is translated before
it runs (`translateSqliteToPostgres`). Some SQLite built-ins are provided
instead by a compatibility schema, `decko_sqlite`, which the driver creates
on first use and puts on the session's search path ahead of `pg_catalog`.

| SQLite | PostgreSQL |
| --- | --- |
| `?`, `?NNN` | `$n` |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY`, plus a trigger that assigns the next id when an insert gives `id` as NULL |
| an insert that names `id` | the sequence is moved past the inserted id |
| untyped column, `datetime(6)`, `varchar(n)`, `text(n)` | `TEXT` (times stay in the port's text form, byte for byte) |
| `boolean`, `TRUE`, `FALSE` | `INTEGER`, `1`, `0` |
| `x IS [NOT] TRUE` / `FALSE` on any operand (integer, text, boolean, expression) | `decko_sqlite.is_true(x)` / `is_false(x)`, with SQLite's truth: non-zero numbers, a text's numeric prefix, NULL neither true nor false; `IS NOT` negates |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `last_insert_rowid()` | the id the driver recorded from the previous INSERT (SQLite's per-connection value) |
| `x COLLATE NOCASE = ?` | `lower(x) = lower($n)`; in an index, the collation is dropped (keys are stored lower-case) |
| `LIKE` | `ILIKE` (SQLite's LIKE ignores ASCII case) |
| `REGEXP` | `~` |
| `CROSS JOIN t ON ...` | `JOIN t ON ...` |
| `rowid` | `id`; `ORDER BY rowid` on a table without an id becomes `ORDER BY 1` |
| `json_each(?)`, `json_object`, `json_array` | `json_array_elements_text(?::json)`, `json_build_object`, `json_build_array` |
| `substr` with a negative start, scalar `max(a, b)` / `min(a, b)`, `instr`, `char`, `json_extract`, `json_group_array` | functions in `decko_sqlite` with SQLite's semantics |
| comparing an integer column with text (an id against a JSON-list element) | `=`, `<>`, `<`, `<=`, `>`, `>=` operators in `decko_sqlite`, both directions, with SQLite's affinity rule: text that spells a number compares as that number, other text is larger than any integer |
| `sqlite_master`, `sqlite_sequence` | views in `decko_sqlite` over the PostgreSQL catalog |
| `CREATE TRIGGER ... BEGIN ... END` | a PL/pgSQL trigger function and a row trigger |
| a recursive CTE with several recursive arms | one recursive arm that reads the CTE once and feeds each row to every arm through `CROSS JOIN LATERAL` |
| a bare bind parameter in a recursive CTE's anchor (`SELECT $1, 'n'`) | `CAST($1 AS type)`, the type the recursive term's column has, read from the database's column catalog |
| mixed-case unquoted identifiers (`AS partyId`) | quoted, so result column names keep their case |
| `PRAGMA` | skipped |

Ordering also has to match SQLite:

- **NULLs.** SQLite sorts NULL first under `ASC` and last under `DESC`, so
  every `ORDER BY` term gets an explicit `NULLS FIRST` or `NULLS LAST`.
- **Ties.** Rows that tie on every sort term come out of SQLite in the order
  its scan visited them, and card searches depend on that order (Ruby's
  results on the same deck show it too). For a top-level query over `cards`,
  the driver appends the scan order as the final sort terms:
  `read_rule_id, id` when the query filters `read_rule_id IN (...)` (SQLite
  reads those through the `read_rule_id` index), otherwise `id`.
- **DISTINCT.** PostgreSQL can only sort a `DISTINCT` query by selected
  columns. When the query does not select the scan-order columns, the
  driver adds them in an inner query and sorts by them in an outer one.

A statement the translator does not recognize runs unchanged and fails
loudly. Errors carry the translated PostgreSQL text.

Known limits:

- An integer column compared with a bind parameter that holds text is
  typed by PostgreSQL from the column, so the parameter must parse as an
  integer. SQLite compares the number the text spells. The operators
  below apply where the text side is a value (another column, a literal
  cast to text, a `json_each` element), which is the shape the engine's
  integer-versus-text comparisons have. A text literal in that position is
  typed the same way (`1 = '1.0'` fails); a comparison of two literals is
  not translated.
- The tie-order rule models SQLite's plans for the card queries the engine
  issues. It is not a general emulation of SQLite's query planner.

## Importing a Ruby Decko PostgreSQL database

```bash
pg_dump --format=plain --no-owner <ruby_deck_db> > deck.sql
node tools/migrate/import-pg-dump.mjs --dump deck.sql --pglite ./deck-pgdata
node tools/migrate/import-pg-dump.mjs --dump deck.sql --pg postgres://user@host/deck
```

The importer:

- creates the port's schema (`db/schema.sqlite.sql`, through the driver's
  translation) in an empty database;
- reads the dump's `COPY` blocks line by line;
- converts values to the port's storage, using the dump's own `CREATE TABLE`
  column types:
  - booleans become 0/1;
  - timestamps become `YYYY-MM-DD HH:MM:SS`, with `.ffffff` only when the
    microseconds are not zero;
- copies the tables and columns the port has, and reports any others as
  skipped.

Tests: `tests/tools/migrate/pg-dump-import.test.ts`.

## Verification

Measured 2026-10-14 on PGlite 0.5.10 and node 24.19.0, from a clean
checkout:

- Driver and transaction conformance, plus the translation checks:
  `npx vitest run tests/server/drivers/postgres-pglite.test.ts`
  (18 tests).
- Atomic saves: `npx vitest run tests/card/actions/atomic-saves.test.ts`.
  The 11 scenarios pass on the `PostgreSQL (PGlite, native)` backend
  alongside the other backends (55 tests). PGlite is a single session, so
  this backend's observer shares the session. Before each read, it checks
  that no writing transaction is open (`pg_current_xact_id_if_assigned()`
  is NULL), so what it reads is committed.
- Reference grade on the synthetic-v1 fixture, with the engine served from
  PostgreSQL:

  ```bash
  node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts-postgres/adapter.json \
    --fixture reference-harness/fixtures/synthetic-v1 --out <resultsDir>
  node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 --actual <resultsDir>
  ```

  Measured 2026-10-15 at commit 5a44ac5c (`fix/postgres-full-grade`, on the
  integration line's base 535763df), with no uncommitted changes, so the
  grade is a release grade: rendering 1754/1754, semantics 2389/2389,
  persistence 16/16, side effects 19/19, read writes 8/8, other tables
  12/12, verdict pass. The plain `ts` adapter
  (`reference-harness/adapters/ts/adapter.json`) gives the same figures on the
  same commit.

  Before this commit the same grade on the integration line's tip
  (535763df) rendered 12/1754: every page and view failed with PostgreSQL's
  error `recursive query "reach" column 1 has type text in non-recursive term
  but type integer overall`. The `reach` CTE in `prefetch.ts` seeds its anchor
  with a bare bind parameter, which PostgreSQL types as text. The translator
  now types such a parameter from the recursive term's column.

  Recursive and CTE statements: every `WITH RECURSIVE` the engine issues is
  run on PGlite by `tests/server/drivers/postgres-recursive-ctes.test.ts`
  (21 tests, 2026-10-15, 5a44ac5c): the inclusion nest index, the rule and
  search sides, the help and script sides, both rule-universe walks, the
  one-trip inline discovery walk, the rule-key universe and closures, and the
  rstar member walk. The attached side-file form of the one-trip walk is
  SQLite's `ATTACH` and has no PostgreSQL form; the engine runs the inline form
  on PostgreSQL. The semantics of `IS TRUE` and of integer-versus-text
  comparisons are checked against SQLite's own answers in
  `tests/server/drivers/postgres-pglite.test.ts` (18 tests in that file).
  Atomic saves (`tests/card/actions/atomic-saves.test.ts`, 55 tests) and the
  dump importer (`tests/tools/migrate/pg-dump-import.test.ts`, 3 tests) pass
  on the same commit.

  The `ts-postgres` adapter is the `ts` adapter with the engine on
  PostgreSQL. The harness grades persistence by reading the deck's SQLite
  file, so the adapter does two things:
  - at start, it loads that file into PGlite;
  - after every step that wrote, it copies PostgreSQL's tables back over the
    file (`reference-harness/adapters/ts-postgres/pg-mirror.ts`).

  The persistence figures therefore grade the state the engine left in
  PostgreSQL.

### Tie order of an unordered search

Three semantics ops grade `search:<actor>:Links To Topic 001` (`{link_to:
"Topic 001"}`) as failing on the `ts-postgres` adapter: PostgreSQL returns
`Note 001`, `Note 031`, `Topic 020+related`, `Topic 024+summary`, where the
fixture's expected order is `Topic 020+related`, `Topic 024+summary`, `Note
001`, `Note 031`. The CQL statement has no sort token, so Ruby emits no
`ORDER BY` and the row order is whatever the engine's plan yields. Measured
2026-10-15 at `29ea3192`:

- Ruby's SQL for the statement is the same text on both engines:
  `SELECT DISTINCT c0.name, c0.left_id, c0.right_id FROM cards c0 JOIN
  card_references cr1 ON c0.id = cr1.referer_id WHERE (cr1.ref_type = 'L' AND
  cr1.referee_id = 655) AND c0.trash is false AND c0.read_rule_id IN (...)`.
- On SQLite the plan is an index search on `card_references_referee_id_index`
  and a `TEMP B-TREE FOR DISTINCT`, which yields `Topic 020+related` first.
  On PostgreSQL it is a bitmap scan on `card_references_ref_type_index` and
  an explicit sort on the DISTINCT columns, which yields `Note 001` first.
- The stock Ruby oracle, run on PostgreSQL with its own schema (its
  dumper's `boolean` columns), returns `Note 001, Note 031, Topic 020+related,
  Topic 024+summary` for the anonymous and admin actors. The port on
  PostgreSQL returns the same. The port's statement differs from Ruby's only
  in its translation (`decko_sqlite.is_false(c0.trash)` for `trash is false`,
  bound parameters), and it is the same statement the port issues on SQLite.
- The same Ruby oracle on SQLite reproduces the fixture's order, and the
  plain `ts` adapter on SQLite matches it.

So on PostgreSQL the port and Ruby agree for these two actors, and the
fixture's order is the SQLite engine's. The port adds no tie-break, and
none is needed to match Ruby on the same database. The grade against the
SQLite-recorded fixture still reports these three ops, and whether the
instrument should grade an unordered search against the database it runs on
is a decision for the release lead.

Not settled: the `member` actor. Ruby raises `undefined method 'admin?'` for
`Mira Member` on both SQLite and PostgreSQL with this deck (its `users` table
is empty), while the fixture records a result for it. The port returns the
same order as for the other actors. Ruby on PostgreSQL here ran on PGlite
(PostgreSQL 18.6, WebAssembly) through `@electric-sql/pglite-socket`, not a
native server.
