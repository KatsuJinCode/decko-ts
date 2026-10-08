# Atomic saves and the SQL transaction contract

## Context

A card save writes many rows: the card, any subcards and junction sides, the
act, its actions and field changes, references, virtual-card rows, and
sometimes a stored file. Ruby Decko runs the validation and storage phases of
a save inside one database transaction (`with_transaction_returning_status`,
card `mod/core/set/all/result.rb`) and runs the integration phase — follower
mail, integrate-stage events — only after the commit (`after_commit
:integration_phase`, `lib/card/director/phases.rb`).

The port had no transaction at all. The SQL interface offered only `query` and
`batch`, and the save path wrote row by row, so a failure part-way through a
save left whatever it had already written. The clearest case: creating a card
with a subcard of an unknown type threw, but the parent card stayed in the
database. A rejected request could change the deck, and a retry could not be
trusted.

The backends do not offer the same tools. Local SQLite and libSQL have real
interactive transactions. Cloudflare D1 does not: it refuses `BEGIN`, and its
only atomic unit is a batch whose statements are fixed before it runs, while a
save reads between writes (generated ids, the rows it just wrote).

## Decision

**The interface.** `SQLDatabaseDriver` gains `transaction(work)` and a
`transactionGuarantee` that states, property by property, what that adapter
actually provides (`src/server/driver.ts`). `work` is atomic on every adapter:
if it throws, or the commit fails, every write it made is undone. Every
statement issued through the same driver object while `work` runs belongs to
the transaction, and transactions on one driver object never overlap.

**The save path.** `CardActionEngine` runs each top-level save — create,
update, delete, revert — inside `transaction()`. A save that runs another save
(a revert's nested update) joins it. The integration phase (ancestor
timestamps, integrate-stage events, recently edited settings, follower mail)
runs after the commit, so a failed save sends nothing. A file stored by a save
that then fails is deleted again. The shared fetch caches, which saw the
uncommitted rows, are reset after a rollback. The engine refuses to save
through a driver with no transaction rather than save non-atomically.

**Per adapter.**

| | Local SQLite | libSQL over HTTP, Bunny Database | Cloudflare D1 |
|---|---|---|---|
| Mechanism | `BEGIN IMMEDIATE` / `COMMIT` on the driver's connection | `BEGIN IMMEDIATE` / `COMMIT` on one Hrana stream (baton) | Compensating: undo journal kept by triggers, restored in one atomic batch |
| Atomic on failure | yes | yes | yes |
| Interrupted transaction undone by | the database | the database (a dropped stream rolls back) | the next transaction (the lock lease expires and it restores the journal) |
| Other connections see uncommitted writes | no | no | yes, until commit or rollback |
| Writers serialized | database-wide (SQLite write lock) | database-wide (SQLite write lock) | database-wide (lock row with a lease) |
| `batch()` atomic on its own | yes | no (a pipeline autocommits each statement) | yes |
| Ids given back by a rollback | yes | yes | no (ids skip, as PostgreSQL sequences do) |

The D1 journal covers the tables a save writes (`cards`, `card_acts`,
`card_actions`, `card_changes`, `card_references`, `card_virtuals`). It is
installed on a database the first time a transaction runs, and reinstalled
when those tables' schema changes. Render caches (`one_trip_*`) and sign-in
sessions are deliberately outside it: they are written outside saves and must
never be undone by a save's rollback.

D1 also needed a correction to `rowsAffected`. D1's `meta.changes` is
`sqlite3_total_changes()`, which counts rows that triggers wrote; with the
`deck_data_version` triggers an UPDATE of one card reported two rows, and the
writer, which requires exactly one, refused every update on D1. The adapter
now follows each write with `SELECT changes()` in the same batch.

**Verification.** `tests/server/drivers/transaction-conformance.ts` is the
shared transaction suite (commit, rollback of inserts, updates, deletes and
batches, statement failure, recovery after failure, no lost update under
concurrency). `tests/card/actions/atomic-saves.test.ts` injects a failure at
each stage of a real save (subcard validation, reference write, history
write, a child's trash, the attachment identifier) on every backend and
compares every table before and after. `tests/card/actions/concurrent-saves.test.ts`
runs two simultaneous saves to the same card on SQLite and D1.

## Implemented and verified adapters

"Verified" names what the tests ran against. Nothing here was run against a
hosted service.

| Adapter | Implemented | Conformance suites run against |
|---|---|---|
| Local SQLite (`LocalSqliteDriver`) | yes | real SQLite (better-sqlite3), in memory and on disk with two connections |
| Cloudflare D1 (`CloudflareD1Adapter`) | yes | workerd's local D1 under Miniflare; not hosted D1 |
| libSQL over HTTP (`LibSqlHttpAdapter`) | yes | a Hrana v2 test server in this repository backed by real SQLite; not sqld, Turso or Bunny |
| Bunny Database (`BunnyDbDriver`) | yes | the same Hrana test server; reads also against the live database in earlier deploy checks, never writes |
| PostgreSQL | **no** — removed | — |

**PostgreSQL.** An adapter and a SQL dialect translator existed, tested only
against a fake connection; nothing constructed it. No PostgreSQL server can
run on the development machine without installing one, so it could not be
verified, and an unverified adapter in the tree reads as support. It was
removed in commit `521433c1`; its parent holds the code for
whoever takes PostgreSQL on, which means running the shared conformance,
transaction and failure-injection suites against a real server and an
existing Decko PostgreSQL schema.

## Consequences

A rejected save changes nothing, on every backend, and retrying it is safe.
Mail and other integration effects follow a committed save only.

On D1 a save costs two extra round trips (taking the lock, committing) and
one extra row write per journaled row it changes. A reader on another
connection can see a D1 save's rows before it commits; a D1 save that fails
or whose isolate dies is undone, the latter by the next save. A D1 save that
holds the lock longer than its lease (two minutes) loses it and fails.

Writes to journaled tables made outside the save path while a D1 save is open
are journaled under that save and undone if it rolls back. Requests write
those tables only through the save path; the other writers are first-boot
seeding and the pod import tool, which run before or outside serving.
