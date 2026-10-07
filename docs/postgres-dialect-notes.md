# PostgreSQL dialect notes

PostgreSQL support for the decko-ts storage-driver seam (issue #8, parallel
to D1 / libSQL / local SQLite). This file documents:

- the dialect mapping (SQLite-flavored engine SQL → PostgreSQL-flavored
  driver SQL);
- the `PostgresDriver` surface and its connection injection contract;
- the dialect-mapping test battery (no live server needed);
- the live-PG rung — what MUST be covered before this driver can claim
  byte parity with the existing SQLite/MySQL/Ruby oracle paths.

The pattern this doc follows: every claim about engine SQL cites the
file:line that emits it; every claim about PG behavior cites either the
dialect unit tests (pure mapping) or a runtime-verified observation.

## Honest bar

**Without a live PostgreSQL server this is dialect + contract work, NOT
proven parity.** The dialect mapping is unit-tested with pure inputs
(43 cases in `tests/server/drivers/postgres-dialect.test.ts`); the
driver's contract is exercised against a `FakePostgresConnection`
(14 cases in `tests/server/drivers/postgres.test.ts`); the conformance
suite's exact queries are replayed through the dialect mapper to prove
the engine's SQL is what the live PG server would receive (6 cases in
`tests/server/drivers/postgres-conformance.test.ts`).

**Local-PG probe (this machine, 2026-09-23).** A live-PG rung is not
wired in this repo today. The probe ran on the operator's Windows host:

- `where psql` / `where pg_isready` / `where postgres` — no binaries on PATH.
- `Get-Service | Where-Object Name -like '*postgres*'` — no installed
  service (Windows error 1060 / "service does not exist").
- `Get-Process postgres` — no running process.
- `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`
  — `False` (no listener on the default PG port).
- `C:\Program Files\PostgreSQL` / `C:\Program Files (x86)\PostgreSQL` —
  neither directory exists.
- `where docker` — no Docker CLI; a `docker run postgres:16-alpine`
  bootstrap is therefore not available either.

Conclusion: no PG executor is reachable from this lane. The
**integration tests** (`describe.skipIf(LIVE_PG_URL === "")` blocks in
`tests/server/drivers/postgres-conformance.test.ts`) are skipped-pending-PG
in this environment, exactly as the contract documents. The dialect +
contract layer above runs unconditionally against the `FakePostgresConnection`
and is the only parity evidence until a PG server is wired.

What is NOT proven without a live server:

- that PostgreSQL accepts the rewritten SQL;
- that the rows PG returns match the engine's row type expectations;
- that collation (`LOWER(...)` rewrite), REGEXP (`~*`), and `LASTVAL()`
  semantics match the engine's storage contract;
- that PG's BIGSERIAL/IDENTITY id generation maps onto the engine's
  `last_insert_rowid()` reads;
- that the corpus replay (`benchmarks/corpus-v2/replay-shard.test.ts`)
  produces the same rows against PG as against SQLite.

The **live-PG rung** below specifies what must pass for those gaps to
close.

## Architecture

```
engine emits SQLite-flavored SQL + ? placeholders
        ↓
PostgresDriver.query / .batch
        ↓
toPostgresSql()  — pure, deterministic
        ↓
   * `?` → `$1`, `$2`, ...  (in order, outside string literals and comments)
   * SQLite functions → PG equivalents (see table below)
   * REGEXP → ~*
   * COLLATE NOCASE → LOWER(...)
   * PRAGMA → commented out
   * last_insert_rowid() → lastval()
        ↓
toPostgresValue() — scalar → PG bind form
        ↓
connection.query(sql, params)  — INJECTED PostgresConnection
```

The connection is injected, not constructed (`src/server/drivers/postgres.ts:30`
declares the narrow `PostgresConnection` interface; `PostgresDriver`'s
constructor takes it as `options.connection`). The engine never imports
`pg` (consistent with the no-vendor-SDK rule, `src/server/driver.ts:5-7`).
Tests use `FakePostgresConnection` (a capture + queue + throw fake);
production uses any client satisfying the interface (node-postgres v8
`Client`/`PoolClient` both do).

## Dialect mapping — what gets rewritten

Every entry cites the engine file that emits the SQLite form.

| SQLite form                              | PG rewrite                                 | Engine source                                       | Dialect test                                              |
| ---------------------------------------- | ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| `?` placeholder (in order, top-level)    | `$1`, `$2`, ...                            | `src/cql/sql.ts:185,205,201`                        | `postgres-dialect.test.ts: replaces sequential placeholders` |
| `?` inside `'...'` string literal        | unchanged                                  | n/a (defensive)                                     | `postgres-dialect.test.ts: does NOT replace ? inside a string literal` |
| `?` inside `-- ...` line comment         | unchanged                                  | n/a (defensive)                                     | `postgres-dialect.test.ts: does NOT replace ? inside a line comment` |
| `?` inside `/* ... */` block comment     | unchanged                                  | n/a (defensive)                                     | `postgres-dialect.test.ts: does NOT replace ? inside a block comment` |
| `INSTR(haystack, needle)`                | `STRPOS(haystack, needle)`                 | `src/card/render/prefetch.ts:138-145`               | `postgres-dialect.test.ts: rewrites INSTR(...) to STRPOS(...)` |
| `SUBSTR(h, s)`                           | `SUBSTRING(h FROM s)`                      | `src/card/render/prefetch.ts:139,166,170`           | `postgres-dialect.test.ts: rewrites SUBSTR(haystack, start)` |
| `SUBSTR(h, s, l)`                        | `SUBSTRING(h FROM s FOR l)`                | `src/card/render/prefetch.ts:141,166,170`           | `postgres-dialect.test.ts: rewrites SUBSTR(haystack, start, length)` |
| `last_insert_rowid()`                    | `lastval()`                                | `src/card/history/write-path.ts:454,491,637`        | `postgres-dialect.test.ts: rewrites last_insert_rowid() to lastval()` |
| `field REGEXP ?`                         | `field ~* ?`                               | `src/cql/sql.ts:201`                                | `postgres-dialect.test.ts: rewrites REGEXP to ~*`         |
| `col COLLATE NOCASE = ?`                 | `LOWER(col) = LOWER(?)`                    | `src/card/render/prefetch.ts:331,491`               | `postgres-dialect.test.ts: rewrites `col COLLATE NOCASE = ?`` |
| `col COLLATE NOCASE IN (?,?,?)`          | `LOWER(col) IN (LOWER($1), LOWER($2), ...)`| `src/card/render/prefetch.ts:488-491,504-505`       | `postgres-dialect.test.ts: rewrites the prefetch batch IN-list verbatim` |
| `col COLLATE NOCASE NOT IN (...)`        | `LOWER(col) NOT IN (LOWER(...), ...)`      | (variant)                                           | `postgres-dialect.test.ts: rewrites NOT IN with NOCASE`   |
| `col COLLATE NOCASE <> ?`                | `LOWER(col) <> LOWER(?)`                   | (variant)                                           | `postgres-dialect.test.ts: rewrites `<>` with NOCASE`     |
| `col COLLATE NOCASE LIKE ?`              | `LOWER(col) LIKE LOWER(?)`                 | (variant)                                           | `postgres-dialect.test.ts: rewrites LIKE with NOCASE`     |
| `PRAGMA ...;`                            | `-- PRAGMA ...`                            | `db/schema.sqlite.sql:43` (DDL only)                | `postgres-dialect.test.ts: comments out a PRAGMA line in DDL` |
| `datetime('now')`                        | `CURRENT_TIMESTAMP`                        | n/a (engine never emits; defensive)                 | `postgres-dialect.test.ts: rewrites datetime('now') to CURRENT_TIMESTAMP` |
| `WITH RECURSIVE`, `COALESCE`, `SUM`, `CASE WHEN`, `LIMIT/OFFSET`, `CAST AS INTEGER/REAL/TEXT`, `EXISTS`, `IN`, `IS NULL`, `JOIN` | unchanged (compatible) | many sites | `postgres-dialect.test.ts: passes through engine-compatible SQL` |

### Identifiers (case-sensitive on PG, not SQLite)

PostgreSQL folds unquoted identifiers to lowercase. The engine's tables
and columns are always lowercase (`src/server/schema.ts` TABLES
constant), so the rewrite is a no-op. If a future wave introduces
mixed-case identifiers the rewrite would need to add `"..."` quoting —
documented, not implemented.

### String literals

The walker handles `''` (the SQL standard escape for a single quote
inside a string literal). PG accepts this form, so no rewrite is needed.
The dialect test `handles doubled single-quote escapes inside string
literals` pins this.

### Datetime storage

The engine's canonical datetime form is `YYYY-MM-DD HH:MM:SS.mmm`
(fixed-width, lex == chrono) stored as TEXT — `src/card/history/act.ts:46-55`.
This form is identical in SQLite, PG, MySQL, etc. (a TEXT column), so
no rewrite is needed. The dialect test `does NOT rewrite the
storage-shape datetime` pins this.

### Parameter values

`toPostgresValue` maps:

| JS value      | PG bind form                | Rationale                                              |
| ------------- | --------------------------- | ------------------------------------------------------ |
| `null`        | `null`                      | PG NULL — same as SQLite NULL                          |
| `undefined`   | `null`                      | Engine never emits; defensive normalization             |
| `number`      | `number`                    | PG binds to numeric column; matches SQLite             |
| `string`      | `string`                    | PG text / varchar — same as SQLite                     |
| `bigint`      | string of digits            | PG int8 binds from string; survives 64-bit safely      |
| `boolean`     | `true` / `false`            | PG native `boolean` column                             |
| `Uint8Array`  | `Buffer` (node-postgres)    | PG bytea — node-postgres requires `Buffer`, not Uint8Array |

The dialect tests in `toPostgresValue` cover every case. The driver
test `maps Uint8Array params to Buffer` pins the bytea path.

## DDL — out of scope here, in scope for the schema stream

This driver translates RUNTIME SQL only. DDL conversion (the
SQLite-truth `db/schema.sqlite.sql` → PostgreSQL DDL) lives with the
schema stream. The dialect module exports two helpers for that stream:

- `pgIdentityColumn(sqliteFragment)` — replaces
  `INTEGER PRIMARY KEY AUTOINCREMENT` with
  `INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` (PG 10+
  identity column; monotonic, no reuse, matches SQLite AUTOINCREMENT
  semantics).
- `stripPragmas(ddl)` — returns the cleaned SQL and the removed PRAGMA
  lines. Used to convert `db/schema.sqlite.sql` for PG bootstrap.

Both are tested in `postgres-dialect.test.ts: pgIdentityColumn ...` and
`stripPragmas returns the cleaned SQL ...`. They are NOT invoked by
the runtime driver — DDL runs once at deployment, not on a hot path.

## Driver contract — what PostgresDriver guarantees

| Contract                                     | Driver behavior                                      | Test                                                   |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `query(sql, params)`                         | `?` → `$N`, functions rewritten, params mapped       | `postgres.test.ts: rewrites ? placeholders ...`        |
| `batch(statements)`                          | each statement rewritten + issued in order           | `postgres.test.ts: rewrites every statement and sends them in order` |
| `rowsAffected` on writes                     | mapped from PG `rowCount`                            | `postgres.test.ts: returns rows, rowsAffected, ...`    |
| `rowsAffected` on reads                      | `0`                                                  | (same test)                                            |
| `lastInsertRowId`                            | **omitted** (PG has no connection-scoped rowid)      | `postgres.test.ts: returns rows, rowsAffected, ...`    |
| bad SQL                                      | throws                                               | `postgres.test.ts: propagates a scripted connection error` |
| parameter count mismatch                     | throws with a clear message                          | `postgres.test.ts: throws a clear error when SQL has more placeholders than params` |
| empty batch                                  | returns `[]` without contacting the connection       | `postgres.test.ts: returns an empty array ...`         |
| `close()`                                    | releases the connection exactly once                 | `postgres.test.ts: releases the underlying connection exactly once` |
| connection injected, not constructed         | constructor takes `{ connection }`                   | (file-level — `src/server/drivers/postgres.ts:58`)     |
| no vendor SDK imported                       | `pg` is NOT a dependency in this repo                | (file-level — `package.json`)                          |

### lastInsertRowId is intentionally absent

SQLite tracks `last_insert_rowid()` per connection. PG does not — the
engine's `SELECT last_insert_rowid() AS id` reads (history/write-path.ts:454,491,637)
go through the dialect mapper and become `SELECT lastval() AS id`,
which returns the value most recently returned by `nextval()` in the
current session. For SERIAL/IDENTITY columns this is exactly what the
engine wants. The driver does NOT surface `lastInsertRowId` on the
result shape because:

1. PG has no per-connection rowid concept for the driver to forward;
2. inventing one (e.g. parsing RETURNING output) would diverge from
   the engine's `last_insert_rowid()` read pattern;
3. the engine's `ActWriter` and `CardActsWriter` already handle
   `lastInsertRowId === undefined` by falling back to
   `SELECT lastval() AS id` (history/write-path.ts:637).

This is documented in the driver's `pgResultToQueryResult` comment
(`src/server/drivers/postgres.ts:103-114`).

## Batch atomicity — known gap

`PostgresDriver.batch` issues statements sequentially, one per
`connection.query()` call. There is no implicit transaction wrapping
the batch the way `LocalSqliteDriver.batch` provides
(`src/server/drivers/local-sqlite.ts:99-105`) or the way D1's
`db.batch()` provides (`src/server/drivers/d1.ts:65-75`).

The driver test `propagates the first connection error and stops
issuing further statements` proves the failure case: a mid-batch error
halts the rest. But SUCCESS does NOT mean atomic — a power loss between
statements 3 and 4 of a 10-statement batch would leave the DB with
statements 1–3 applied and 4–10 not.

This is consistent with the libsql-http adapter's documented behavior
(`src/server/drivers/libsql-http.ts:32-37`): "a Hrana pipeline is NOT
transactional — each execute commits on the server as it runs. If
atomic batch behavior is needed, wrap the statements in explicit
BEGIN/COMMIT executes at the engine layer."

The engine's writers (history/write-path.ts) DO wrap their multi-statement
acts in BEGIN/COMMIT at the engine layer for SQLite (the conformance
suite passes on that path). For PG, the engine layer would need to
emit BEGIN/COMMIT around the batch — that is a future wave's work, not
this driver's. The live-PG rung below covers the verification.

## Test pyramid

```
                      ┌──────────────────────────┐
                      │   live PG (when wired)    │   live-PG rung (below)
                      │   conformance suite       │
                      └──────────────┬───────────┘
                                     │ proves the dialect mapping
                                     │ survives a real PG executor
                      ┌──────────────▼───────────┐
                      │  postgres-conformance     │   tests/server/drivers/
                      │  dialect battery          │   postgres-conformance.test.ts
                      └──────────────┬───────────┘
                                     │ asserts exact dialect output
                                     │ for the conformance suite's queries
                      ┌──────────────▼───────────┐
                      │  postgres.test.ts         │   tests/server/drivers/
                      │  driver shape + errors    │   postgres.test.ts
                      └──────────────┬───────────┘
                                     │ proves the driver's contract
                                     │ over an injected connection
                      ┌──────────────▼───────────┐
                      │  postgres-dialect.test.ts │   tests/server/drivers/
                      │  pure mapping cases       │   postgres-dialect.test.ts
                      └──────────────────────────┘
```

Every layer is independent. No layer requires a live server.

## Live-PG rung — what must pass before this is proven parity

The MySQL-oracle-rung pattern in `docs/oracle-harness.md:127-137` is the
precedent: each storage backend has a "live rung" that exercises real
SQL semantics, and the parity claim rests on it. This section is the
spec for the live-PG rung.

### Setup

The current repo does not carry the `pg` client as a dependency. A
future stream adds it. Once added:

```bash
npm install pg            # node-postgres v8+
npm install --save-dev @types/pg
```

Then add a Postgres service to the dev environment (Docker image
`postgres:16-alpine` is the smallest footprint):

```bash
docker run -d --name decko-pg -e POSTGRES_PASSWORD=dev \
  -p 5432:5432 postgres:16-alpine
```

Set the connection string:

```bash
export POSTGRES_URL='postgres://postgres:dev@127.0.0.1:5432/postgres'
```

### Wiring the live conformance suite

In `tests/server/drivers/postgres-conformance.test.ts` (the
shared-conformance integration file). A live wire looks like:

```typescript
import pg from "pg";
import { runDriverConformance } from "./conformance.js";

describe("conformance: PostgresDriver (live)", () => {
  let client: pg.Client;
  let driver: PostgresDriver;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
    await client.connect();
    const conn: PostgresConnection = {
      query: async (sql, params) => {
        const r = await client.query(sql, params);
        return { rows: r.rows, rowCount: r.rowCount };
      },
      release: () => client.end(),
    };
    driver = new PostgresDriver({ connection: conn });
  }, 30_000);

  afterAll(async () => {
    await driver.close();
  });

  runDriverConformance("conformance: PostgresDriver (live)", () => ({
    driver,
  }));
});
```

### What MUST be covered by the live rung

The shared conformance suite (`tests/server/drivers/conformance.ts`)
covers:

1. CREATE TABLE / INSERT / SELECT with various value types — round-trips
   NULL, integer, float, text;
2. batch of two statements — results returned in order;
3. bad SQL throws (and does not corrupt connection state);
4. schema usability after a failed statement.

The shared suite is necessary but not sufficient. The PG-specific
extensions the live rung must additionally cover:

| Test case                                                    | Proves                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| CREATE TABLE with `BIGSERIAL PRIMARY KEY` / IDENTITY         | PG-specific id generation works                                   |
| INSERT + `RETURNING id` (engine-added)                       | PG's RETURNING reads back the new id                              |
| SELECT `lastval()` after INSERT                              | `last_insert_rowid()` rewrite matches PG semantics                |
| COLLATE NOCASE rewrite vs PG native collation                | LOWER() rewrite is functionally equivalent for ASCII keys         |
| REGEXP (`~*`) against a known pattern                        | CQL `match` queries work against PG                                |
| Substring / strpos chained expression                        | Engine's `instr/substr/instr` span scan executes on PG            |
| `WITH RECURSIVE` depth limit                                 | PG recursion bounds don't bite the prefetch walk                  |
| Bigint binding beyond JS safe-integer range                  | Bigint → string param mapping survives 64-bit values              |
| Bytea binding with non-UTF8 bytes                            | Buffer wrapping is lossless                                       |
| pg_sleep / timezone / collation settings                     | Engine's datetime shape (UTC "YYYY-MM-DD HH:MM:SS.mmm") sorts correctly under PG TIMESTAMP |

### Corpus replay against live PG

The corpus replay (`benchmarks/corpus-v2/replay-shard.test.ts`,
unreadable from this stream's directory list per the read-only list —
wave-1 reads only) replays a captured corpus and asserts byte parity.
The live-PG rung must:

1. Apply the PG schema (DDL via the schema stream's PG emitter,
   using the `pgIdentityColumn` / `stripPragmas` helpers exported
   from this dialect module).
2. Seed the PG database with the same JSON fixtures the SQLite path
   uses.
3. Run the corpus replay against `PostgresDriver` (live wired).
4. Compare the row sets with the SQLite replay's outputs — byte
   parity requires identical row content for the same input CQL
   statements, modulo documented normalizations (e.g. SQLite's
   `INTEGER` becomes PG's `BIGINT`; the engine normalizes both to
   JS `number` when within safe-integer range).

### What this rung does NOT claim

- **Byte parity vs the MySQL/Ruby oracle.** The current Ruby oracle
  (`docs/oracle-harness.md`) is SQLite-only. There is no MySQL oracle
  rung; without one, MySQL-flavored regex semantics (which card-1.110.0
  emits for CQL `match`, see `docs/oracle-harness.md:127-137`) cannot
  be compared against PG's `~*` directly. A MySQL oracle rung must be
  built first; only then does PG's CQL `match` rewrite have a true
  parity reference.
- **Performance parity.** SQLite's on-device execution model and PG's
  client/server model differ enough that any timing comparison needs
  PG-specific tuning (connection pool size, prepared statement cache,
  index choices). This doc says nothing about performance.
- **Migration from SQLite.** If a deployment moves an existing
  SQLite database to PG, the data type mapping (e.g. SQLite TEXT
  → PG TEXT or VARCHAR) and datetime form must be verified. The
  dialect module's runtime mapper does not address bulk data
  migration; that is a separate ops path.

## Real gaps — what this dialect does NOT yet cover

This section enumerates the dialect gap families: jsonb,
sequence ids, and schema differences between Decko's PG schema and our
SQLite schema expectations. Each gap cites the current evidence on
disk and the work item that closes it. The dialect module is the
runtime mapper only; DDL conversion belongs in the schema layer and is
the natural home for many of these gaps.

### A. jsonb / json1

**State on disk.** Grep across `src/` and `docs/` for `json_extract`,
`jsonb`, `json_array_length`, `json_object`, `json1` returns exactly
one hit — `src/server/drivers/postgres-dialect.ts:34`, the existing
"OUT OF SCOPE" comment. The engine does not currently emit any SQLite
JSON1 function (`json_extract`, `json_array_length`, `json_each`,
`json_tree`, ...). The runtime dialect mapper therefore has nothing to
rewrite today.

**Where json1 WOULD be expected in a future wave.** A search of the
running Card gem on this machine finds two PG-leaning storage shapes
that the decko-ts engine does NOT yet read via JSON1:

- `decko-demo/my_demo/mod/card-mod-ai_assistant/set/type/ai_embedding.rb:14`
  — "Decko card content is a string and there is no pgvector column on
  the [table]". The embedding vector is JSON-stringified in a TEXT
  column. If a future engine wave reads that field as JSON (e.g.
  `json_extract(value, '$.vector')`), the dialect will need to map to
  PG's `value->'vector'` or `value->>'vector'` (`jsonb` if the column
  is migrated).
- `decko-demo/my_demo/mod/card-mod-vector_search/README.md:159-173` —
  pgvector sidecar table referenced as future work. Out of scope until
  that wave lands.

**Closing the gap.** The dialect module currently documents the gap
in a comment (`src/server/drivers/postgres-dialect.ts:34-36`). The
mapping rules would live in `rewriteSqliteFunctions` once the engine
emits a JSON1 function:

| SQLite form             | PG rewrite                              |
| ----------------------- | --------------------------------------- |
| `json_extract(j, '$.k')`| `j->'k'` (jsonb) or `j->>'k'` (text)    |
| `json_array_length(j)`  | `jsonb_array_length(j)`                 |
| `json_each(j)`          | `jsonb_array_elements(j)`               |
| `json_object(k, v, ...)`| `jsonb_build_object(k, v, ...)`         |

Whether the target column is `jsonb` or `text` is a schema-stream
decision, not a runtime-dialect one — the dialect rewrite above is
shape-stable across both.

### B. Sequence ids (BIGSERIAL / IDENTITY / lastval() / currval())

**State on disk.** The dialect mapper already rewrites `INTEGER PRIMARY
KEY AUTOINCREMENT` → `INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY
KEY` (`src/server/drivers/postgres-dialect.ts:491-496`,
`pgIdentityColumn`). The engine's id-readback path
(`SELECT last_insert_rowid()` in `src/card/history/write-path.ts:454,491,637`)
is rewritten to `SELECT lastval()` by the same mapper
(`src/server/drivers/postgres-dialect.ts:186`).

**Gaps the runtime mapper does NOT yet cover.** Three PG-specific
behaviors a future wave must reason about:

1. **`lastval()` requires a prior `nextval()` in the same session.**
   PG `lastval()` returns "the value most recently returned by
   `nextval()` in the current session" and raises
   `ERROR: lastval is not yet defined in this session` if `nextval()`
   was never called. With IDENTITY columns (`GENERATED BY DEFAULT AS
   IDENTITY`), an INSERT implicitly calls `nextval()`, so the rewrite
   works on the id column. With a non-IDENTITY sequence read via
   `nextval(seq)` from a sibling statement, the same session-scoped
   contract applies. The driver test `maps ... last_insert_rowid()` in
   `postgres-dialect.test.ts:125-128` only proves the SQL rewrite; the
   live-PG rung must prove the semantics.

2. **`currval()` vs `lastval()`.** Both are session-scoped. `currval`
   is sequence-scoped (you pass the sequence name); `lastval` is the
   most-recent sequence overall. The engine's read uses the unnamed
   `last_insert_rowid()` shape, which PG maps cleanly to `lastval()`
   — no sequence-name gap today.

3. **BIGSERIAL vs INTEGER id columns.** The MySQL production schema
   uses `int` (32-bit) for every id; the SQLite port uses `INTEGER`
   (64-bit in SQLite, but the engine treats it as JS `number`). PG
   IDENTITY columns can be `INTEGER` (PG int4) or `BIGINT` (int8);
   the schema stream must pick the matching width. The current
   `pgIdentityColumn` rewrite does NOT change the width — it leaves
   `INTEGER` as `INTEGER`. If a future wave carries a `bigint` id
   (e.g. `card_changes` ids grow beyond int4 on a long-lived
   installation), the schema stream must rewrite
   `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGINT GENERATED BY DEFAULT
   AS IDENTITY PRIMARY KEY`, not the current `INTEGER ...` form.

### C. Schema differences — Decko's PG schema vs the SQLite port

**State on disk.** This repo carries `db/schema.sqlite.sql` (the
engine's target) and `db/schema.mysql-reference.sql` (production
the reference deck MySQL truth, dated 2026-09-07). It does NOT carry
`db/schema.postgres.sql`; PG DDL conversion is documented as the
schema stream's responsibility (`src/server/drivers/postgres-dialect.ts:478-484`
— "DDL helpers — used by callers that build PG DDL from the engine's
emitted SQLite DDL").

The Decko Ruby gem (`decko-demo/my_demo/`) ships MySQL as its default
dialect and PG as a documented alternative (`docs/getting-started.md:31` —
"a database — MySQL 5.7+ or PostgreSQL 9.4+"). The decko Ruby core
migrations do not carry a separate PG schema file — the PG dialect is
provided by Rails ActiveRecord and the engine relies on the same
DDL-emit path that the SQLite-truth MySQL dumps are derived from.
There is therefore NO PG-truth DDL to diff against in this repo; the
schema stream must build `db/schema.postgres.sql` from `db/schema.sqlite.sql`
plus the conversion rules below.

**Real schema-difference gaps the runtime dialect does NOT address
(because they are DDL, not DML):**

| MySQL / SQLite form            | PG form                          | Source line                                  | Notes                                                              |
| ------------------------------ | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `ENGINE=InnoDB DEFAULT CHARSET=utf8mb3` | (dropped; PG has no table engines) | `db/schema.mysql-reference.sql` (all tables) | Stripped by the schema stream when emitting PG DDL.                |
| `varchar(255) utf8mb3_unicode_ci` | `text` (engine's SQLite choice) or `varchar(255)` | `db/schema.sqlite.sql:51-53,77` | Engine keys are ASCII; PG collation is irrelevant.         |
| `datetime` (MySQL native)      | `text` (engine's SQLite choice) or `timestamp` (PG native) | `db/schema.sqlite.sql:11-17,57-58` | Engine storage shape is `YYYY-MM-DD HH:MM:SS.mmm` TEXT (fixed-width, lex == chrono). PG can store in either, but the engine layer expects the text form on read. |
| `tinyint(1)` (MySQL boolean)   | `boolean` (PG native) or `smallint` with `CHECK (col IN (0,1))` | `db/schema.sqlite.sql:64,106` | PG has a true `boolean`; SQLite needs the CHECK because it stores as INTEGER. |
| `mediumtext` (16 MiB cap MySQL)| `text` (PG unlimited)            | `db/schema.sqlite.sql:66,121,168,185`        | PG `text` has no length limit; parity is trivial.                   |
| `utf8mb3` charset              | `utf8` or PG-native              | `db/schema.sqlite.sql:40`                    | PG uses server-level encoding; the schema stream picks.            |
| Index names with mixed case (`"cards_key_index"`) | `"cards_key_index"` (quoted, case preserved) | `db/schema.sqlite.sql:68-78` | PG folds unquoted identifiers to lowercase; PG preserves case only inside double quotes. The engine emits quoted names — preserved verbatim. |
| `card_virtuals` index names deliberately swapped (`"left_id_index"` ON `"right_id"`) | Same — preserved verbatim | `db/schema.sqlite.sql:172-174` | Production truth from core migration `20200805200729`; this is intentional, do not "fix" when generating PG DDL. |
| `PRAGMA foreign_keys = OFF;`   | dropped (PG has session-level GUCs) | `db/schema.sqlite.sql:43`                  | Already handled by `stripPragmas` (`src/server/drivers/postgres-dialect.ts:501-508`). |

### D. Identifier case

**State on disk.** The runtime dialect does NOT add double-quotes to
identifiers (`src/server/drivers/postgres-dialect.ts:93-102` —
"PostgreSQL folds unquoted identifiers to lowercase"). The engine's
table and column names are lowercase by construction
(`src/server/schema.ts`), so the rewrite is a no-op today. If a
future wave introduces a mixed-case identifier, the dialect would
need to emit `"OriginalCase"` for every reference to that identifier
— documented, not implemented.

### E. Engine-emitted SQL the runtime mapper passes through unchanged

| Engine form                                | PG acceptance                     | Notes                                                  |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------------ |
| `WITH RECURSIVE`                           | identical                         | PG accepts the SQLite form verbatim.                   |
| `COALESCE`, `SUM`, `COUNT`, `EXISTS`, `IN`, `IS NULL`, `CASE WHEN` | identical         | SQL-standard; both engines accept.                     |
| `LIMIT n OFFSET m`                         | identical                         | SQL-standard.                                          |
| `CAST(x AS INTEGER/REAL/TEXT)`             | identical                         | PG accepts the SQLite type names.                      |
| `GROUP_CONCAT(x)` (not emitted today)      | rewrite to `STRING_AGG(x, ',')`   | Out of scope; engine never emits (verified grep).      |

### F. Out-of-scope, named for future waves

- `json1` (see A above).
- `RANDOM()` rewrite to PG `random()` — both engines return a real
  pseudo-random number; left alone.
- `GROUP_CONCAT` (not emitted today; rewrite to `STRING_AGG` is a
  one-line addition).
- `RANDOMBLOB`, `ZEROBLOB`, `HEX`, `UNHEX` — engine never emits.

## Changelog

- 2026-09-23: enumerated real gaps (jsonb/JSON1, sequence ids / IDENTITY
  semantics, schema deltas vs Decko's PG-flavored schema) that the
  runtime dialect does NOT yet cover; documented the schema stream as
  the owner of DDL conversion and the live-PG rung as the only path
  that proves byte parity.
- 2026-09-21: initial dialect + driver + fake + 43 dialect cases + 14
  driver cases + 7 conformance-integration cases. Live-PG rung
  documented but not yet wired.
