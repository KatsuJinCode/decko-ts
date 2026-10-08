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

**Bunny Database sessions.** Bunny's SQL API documentation describes baton
sessions but asks customers who need them to contact Bunny, so they may not be
enabled on every database. Where they are not, the server closes each stream,
`BunnyDbDriver.transaction()` fails with an error saying so, and saves on that
database are refused rather than written statement by statement. Before the
Bunny write path (`DECKO_WRITE_PATH`, off by default) is turned on, a
transaction should be run once against a scratch Bunny database to confirm
the baton is kept. If it is not, the alternative is the compensating journal
D1 uses, which needs an atomic Hrana `batch` request (steps with conditions)
in place of the pipeline.

**New card ids and orphan history (a deliberate difference from Ruby).** A
deck can hold history rows (`card_acts.card_id`, `card_actions.card_id`)
naming a card id that has no card row: card rows deleted, or a copy made
without the cards table's id counter. When such an id is the one the next
create would take, Ruby on the same SQLite data creates the card with it and
the deleted card's actions become the new card's history: its create action
is the old one (`create_action` is `actions.first`), and `first_create?` is
false, so the new action also stores change rows (card-1.110.0
`mod/history/set/all/history.rb:38-44`, `history/events.rb:25-35`,
`history/actions.rb:21-23`). Run on the local Ruby oracle against a copy of
its deck (`tools/persistence/orphan-history-probe.rb`): the new card took the
orphan's id, its `create_action` was the orphan action, and its own create
action stored four change rows (name, type, content, trash), where a plain
create stores none. On Decko's MySQL production database the
AUTO_INCREMENT counter is past every id ever used, so a new card never meets
old history there. This port keeps that outcome on copies that lost the
counter: a new card takes the AUTOINCREMENT id unless history rows name that
id or a later one, and then the first id past every id they name
(`NEW_CARD_ID_SQL` in `src/card/history/write-path.ts`; part of the INSERT,
index lookups only). Before, the create was refused (`expected exactly 1
action row`); with atomic saves that refusal wrote nothing, and before atomic
saves it left the card row behind. Pinned on every backend in
`tests/card/actions/atomic-saves.test.ts` (the two orphan-history cases).

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
