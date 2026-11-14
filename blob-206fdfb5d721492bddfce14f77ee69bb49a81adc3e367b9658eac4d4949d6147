# Serve a Ruby Decko MySQL database as it is

Status: open. SQLite is delivered and measured (docs/same-database.md); MySQL
is not.

## Required behaviour

The port opens a Ruby Decko 0.20.0 database on MySQL/MariaDB, unmodified,
and serves it with no import step: the same additive objects
`openSameDatabase` creates on SQLite (freshness stamp and its triggers,
`auth_sessions`, lookup indexes) are created with MySQL DDL, idempotently,
never altering a table Ruby owns. Rows the port writes are rows Ruby reads.

## Done looks like

1. A `SQLDatabaseDriver` over `mysql2` (src/server/drivers/mysql.ts) that
   passes the driver conformance suite (tests/server/drivers/conformance.ts).
2. MySQL output from the CQL compiler (src/cql/sql.ts) and from the other
   engine SQL that uses SQLite-only forms. Measured 2026-10-14, files under
   src/ containing each form: REGEXP 13 (a UDF on SQLite; native on MySQL),
   strftime 6, json_each 4, json_group_array 4, INSERT OR IGNORE 4,
   sqlite_master 2, substr( 2, json_extract 1, ON CONFLICT 1, pragma_ 1,
   and 14 files with `||` string concatenation (CONCAT on MySQL unless
   PIPES_AS_CONCAT is set per session).
3. `openSameDatabase` creates its objects on MySQL (information_schema in
   place of sqlite_master; MySQL trigger syntax).
4. The synthetic-v1 deck loaded into MariaDB by Ruby (the oracle app with
   `DATABASE_URL=mysql2://...`), opened by the port with no import, graded
   against expected (rendering 1754/1754), and the cross-engine check
   (tools/same-database/cross-engine-check.mjs) passing on that database.

## What exists

- tools/oracle/boot-mysql-server.sh describes the portable MariaDB 11.4.5
  the oracle harness uses (gitignored under tools/oracle/portable-mariadb/).
  `mariadbd.exe --no-defaults --datadir=<scratch> --port=<free port>
  --bind-address=127.0.0.1 --skip-grant-tables --console` boots on an empty
  datadir with only mariadbd.exe and server.dll present (checked
  2026-10-14); no install-db or client binaries are needed for a test
  server.
- `mysql2` is not yet a dependency. Installing it needs a node_modules that
  belongs to this checkout rather than a shared link.
