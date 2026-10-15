# Atomic saves and the SQL transaction contract

## Context

A card save writes many rows: the card, any subcards and junction sides, the
act, its actions and field changes, references, virtual-card rows, and
sometimes a stored file. Ruby Decko runs the validation and storage phases of
a save inside one database transaction (`with_transaction_returning_status`,
card `mod/core/set/all/result.rb`) and runs the integration phase — follower
mail, integrate-stage events — only after the commit (`after_commit
:integration_phase`, `lib/card/director/phases.rb`).

The engine had no transaction at all. The SQL interface offered only `query` and
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
| Interrupted transaction undone by | the database | the database (a dropped stream rolls back) | the next transaction, or any serving read once the lock lease is known expired (the read restores the journal before answering) |
| Other connections see uncommitted writes | no | no | no: a serving read answers only from a batch that saw the lock free, and otherwise waits for the holder (or restores a lease-expired holder's journal first) |
| Writers serialized | database-wide (SQLite write lock) | database-wide (SQLite write lock; a `BEGIN IMMEDIATE` refused as busy is retried with backoff up to the lock timeout) | database-wide (lock row with a lease) |
| `batch()` atomic on its own | yes | no (a pipeline autocommits each statement) | yes |
| Ids given back by a rollback | yes | yes | no (ids skip, as PostgreSQL sequences do) |

Two D1 lease properties sit behind that table. **Fencing:** every statement a
transaction's callback issues — reads included — is batched with an ownership
assert against the lock row, and a D1 batch is atomic, so a statement can
only execute while its transaction still owns the lease. A transaction that
lost its lease therefore writes nothing after the takeover; its commit fails
with `TransactionLeaseLostError`, and that report is then literally true:
the winner restored the writes made before the takeover, and nothing made
after it landed. **Readers wait for a live save:** a serving read answers only from an atomic batch whose lock-row read found the lock free. Commit, rollback and takeover each free the lock in the batch that settles the journal, so such a read saw committed rows only. When a live transaction holds the lock, the read discards its results, waits and runs again; the wait is bounded by the holder's lease. A read issued from the transaction's own call tree (tracked with AsyncLocalStorage) through another driver object is answered, so a save does not wait for itself. **Read-time repair:** a serving read carries the lock row
in its own atomic batch, and when the row names a holder whose lease has
expired, the read restores that holder's journal first and answers only
after, so an interrupted save's rows are not served and its recovery does
not wait for the next transaction. Batches that write skip the check (they
cannot be safely re-run after a repair; the engine writes journaled tables
only inside transactions).

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
runs two simultaneous saves to the same card on SQLite, D1, libSQL and Bunny.
`tests/card/actions/d1-multi-user-saves.test.ts` checks that no reader on
another driver object is served a save that fails. `tools/hosted-conformance/run.mjs`
runs these suites against hosted databases (`docs/hosted-conformance.md`).

## One D1 batch per save: investigated, not adopted

A D1 batch is one SQLite transaction, so a save whose writes were sent as a
single batch would never be visible half-done. That needs every write a save
makes to be known before any of them is sent. It is not, in this port or in
Ruby: a save reads its own writes and branches on them. Traced on local
SQLite (every statement issued inside `transaction()`; measured 2026-10-14,
the four saves of a create with a subcard, an update with a subcard, a rename
and a delete over the atomic-saves test deck):

| Save | Reads | Reads after the save's first write | Write statements and batches |
|---|---|---|---|
| create with a subcard | 44 | 37 | 32 across the four saves |
| update with a subcard | 25 | 18 | |
| rename | 19 | 7 | |
| delete | 16 | 11 | |

The reads after the first write include the row just inserted (`SELECT *
FROM cards WHERE id = ?`), `last_insert_rowid()` for the act and action ids
the next rows carry, `COUNT(*)` over the card's own action rows, and the
recursive name-resolution query over `cards`, which must see the parent row
the subcard's name resolves through. Deferring the writes would mean
answering all of those from an overlay of pending rows, which for joins and
recursive queries is a second SQL engine in the Worker, or restructuring the
save into plan-then-apply phases Ruby does not have. Neither keeps the port
faithful, so the save path keeps its interactive shape.

## Snapshot reads: an alternative, not adopted

The read isolation D1 has (readers wait for a live save; "Readers wait for a
live save" above) was chosen over a second design, recorded here because it
would let readers answer during a save instead of waiting.

The journal already holds, for every row a live transaction touched, the row
as it was before (`decko_undo_*`, first entry per row). A serving read that
finds a live, unexpired holder in the lock row could answer from that
pre-transaction state inside one atomic batch: stash the lock (so the journal
triggers stay off), copy the touched rows' current images to a redo table,
restore the before-images, run the reads, put the current images back, empty
the redo table and restore the lock. D1 runs the batch as one transaction, so
the writer would never observe the swap and other readers would never see the
intermediate state. Two requirements found while designing it:

- `deck_data_version` must also read as its pre-transaction value. The
  writer's statements bump it as they run, and a reader that pairs the bumped
  stamp with pre-transaction rows would cache old content under the new
  stamp; nothing bumps it again at commit, so that stale entry would be
  served afterwards. The journal would have to record the stamp when it
  takes the lock, and the snapshot batch would have to report that value and
  restore the current one after the reads. (Waiting reads do not have this
  problem: a read that waited sees the committed rows and the committed
  stamp together.)
- The swap is a write batch, so every serving read during a live save
  becomes a write on the primary (about four row writes per touched row).

Waiting reads were adopted because they need no write on the read path and
no second copy of the deck's rows, and because a reader that waits is what
SQLite itself does for a writer's commit in rollback-journal mode. Their cost
is the wait: a read during a save is answered after the save ends, and a
hung writer delays readers until its lease expires. If that wait proves too
long on hosted D1, snapshot reads are the design to revisit.

## Implemented and verified adapters

"Verified" names what the tests ran against. Hosted runs are listed with
their date; everything else ran against local emulations.

| Adapter | Implemented | Conformance suites run against |
|---|---|---|
| Local SQLite (`LocalSqliteDriver`) | yes | real SQLite (better-sqlite3), in memory and on disk with two connections |
| Cloudflare D1 (`CloudflareD1Adapter`) | yes | workerd's local D1 under Miniflare, including the multi-user read-isolation tests; hosted D1 on 2026-10-14 (`tests/hosted/hosted-write-path.test.ts` through a remote binding: the 7 transaction conformance cases and 10 save scenarios, all passing, on a throwaway database deleted afterwards). That hosted run predates waiting reads; the read-isolation and concurrent-save suites have not yet run on hosted D1 (`tools/hosted-conformance/run.mjs` runs them) |
| libSQL over HTTP (`LibSqlHttpAdapter`) | yes | a Hrana v2 test server in this repository backed by real SQLite, including two writers on separate driver objects; not sqld, Turso or Bunny |
| Bunny Database (`BunnyDbDriver`) | yes | the same Hrana test server; hosted Bunny Database on 2026-10-14 (`tools/hosted-conformance/run.mjs --target bunny` on a scratch database created, given a token and deleted with the account API key): transaction conformance and save scenarios 17 of 17 and atomic saves 11 of 11 pass; one concurrent-save case and one multi-user read-isolation case fail with Bunny's `TRANSACTION_TIMEOUT` when two writers contend, which the busy-`BEGIN` retry does not cover |
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
old history there. This engine keeps that outcome on copies that lost the
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
one extra row write per journaled row it changes. Readers on other driver
objects are not served a save's rows while it runs: they wait until it
commits or rolls back, so a failed save is never visible to another user.
The cost is that reads wait for the save in progress, as SQLite readers wait
for a writer's commit in rollback-journal mode. A D1 save that fails is
undone at once; one whose isolate dies is undone by the next save or by the
first serving read after its lease expires, and readers wait at most until
then. Every statement the save runs is fenced to the lease (the ownership
assert rides in the statement's own atomic batch), so a save that lost its
lease writes nothing further and fails with `TransactionLeaseLostError`,
with the reported outcome matching the database's final state. A D1 save
that holds the lock longer than its lease (two minutes) loses it and fails.
Readers sharing the save's own driver object share its transaction and see
its rows, on every adapter; the Workers write path builds its own adapter
per request, so serving reads never share it.

Verified under workerd's local D1 (Miniflare), not hosted D1:
`tests/card/actions/d1-multi-user-saves.test.ts` (a read during a save
that then fails; four concurrent writers with failing saves and two
readers) and the lease cases in `tests/server/drivers/transactions.test.ts`.
Both multi-user tests fail against the previous read path.

Writes to journaled tables made outside the save path while a D1 save is open
are journaled under that save and undone if it rolls back. Requests write
those tables only through the save path; the other writers are first-boot
seeding and the pod import tool, which run before or outside serving.
