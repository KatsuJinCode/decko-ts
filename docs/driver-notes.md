# Storage driver notes

Storage-driver foundation for the decko-ts port (upstream proposal
decko-commons/decko#1282). The seam is `src/server/driver.ts`
(`SQLDatabaseDriver`: `query(sql, params)` + `batch(statements)`, frozen —
other streams code against it). This document records what each adapter in
`src/server/drivers/` guarantees, the provider differences the engine layer
must not assume away, and what remains unproven.

## Verification method (grounding, not memory)

- The Hrana v2 wire contract was verified against the reference
  implementation in this repo's dependency tree: `@libsql/hrana-client`
  `lib-esm/http/client.js` (defines the `v2/pipeline` endpoint for the v2
  JSON encoding), `lib-esm/shared/json_encode.js` (request + tagged-value
  encoding), `lib-esm/shared/json_decode.js` (response decoding). No web
  lookups were used.
- better-sqlite3 behavior was verified by executing v13.0.3 directly:
  `Statement.reader` (false for writes), `columns()` (throws on non-reading
  statements), `raw().all()` (array rows), `run()` returning
  `{changes, lastInsertRowid}` (number by default), `db.transaction(fn)`
  returning a wrapped function, and number params binding with REAL storage
  class.
- miniflare D1 was verified by booting workerd locally on Windows and
  exercising the binding (raw outputs quoted below).

## LocalSqliteDriver — `src/server/drivers/local-sqlite.ts`

Reference driver over better-sqlite3; the dev/test workhorse. Synchronous
under the hood, async signatures are resolved promises. Dev/test/CLI only —
never an edge deployment target.

Guarantees:

- Rows are plain objects keyed by column name; duplicate column names
  collapse (last wins), matching better-sqlite3's own object-row behavior.
- Reading statements: `rowsAffected: 0`, `lastInsertRowId` omitted (SQLite
  does track a connection-level `last_insert_rowid()`, but surfacing it on
  reads would make results inconsistent with the remote adapters).
- Writing statements: `rowsAffected` = `changes`; `lastInsertRowId`
  reported when > 0, omitted otherwise.
- `batch` runs in ONE synchronous SQLite transaction: atomic, on any error
  everything rolls back and the error rethrows.
- Errors always throw (`SqliteError`); nothing is swallowed.
- Extra (not part of the frozen interface): `close()` for local resource
  cleanup.

Typing note: better-sqlite3 ships no TypeScript definitions and
@types/better-sqlite3 is not installed (deps frozen for wave agents). The
schema stream maintains the core ambient module in
`tests/schema/better-sqlite3.d.ts` (`export =` style). TypeScript does NOT
merge a second `declare module "better-sqlite3"` block into an `export =`
declaration — verified with a minimal repro — so `local-sqlite.ts` narrows
`prepare()`'s result through its own runtime-verified interfaces
(`BetterSqlite3Statement` / `BetterSqlite3Database`) at the single boundary.
If @types/better-sqlite3 is ever added, delete that local interface.

## CloudflareD1Adapter — `src/server/drivers/d1.ts`

Wraps a D1Database binding declared structurally (`D1DatabaseLike`,
`D1PreparedStatementLike`, `D1ResultLike`) — the engine never imports vendor
SDKs, and @cloudflare/workers-types is not installed in this repo (it is a
devDependency of miniflare and does not hoist; miniflare's own .d.ts
references it, which `skipLibCheck` suppresses).

Guarantees:

- `query` → `prepare(sql).bind(...params).all()`; `meta.changes` →
  `rowsAffected`; `meta.last_row_id` → `lastInsertRowId` (omitted when 0);
  a reported `success: false` throws even if the SDK did not.
- `batch` → `db.batch(...)`: D1 executes statements sequentially in one
  implicit transaction — atomic, all-or-nothing.
- Errors always throw (D1 rejects with `D1_ERROR: ...`).

Verified against miniflare 5 local D1 emulation (workerd, Windows):

- Write meta: `{"served_by":"miniflare.db","changes":1,"last_row_id":1,...}`,
  `success: true`.
- Bad SQL rejects: `D1_ERROR: near "SELEC": syntax error at offset 0:
  SQLITE_ERROR`.
- bigint bind values are REJECTED: `D1_TYPE_ERROR: Type 'bigint' not
  supported` — pinned by a dedicated test so a D1 upgrade that changes this
  surfaces here.
- JS numbers bind with REAL storage class (`typeof(?)` → `"real"`); there
  is no integer binding for JS numbers on D1. INTEGER-declared columns still
  read back as JS numbers (SQLite column affinity normalizes lossless reals
  on storage), so value round-trips pass — storage-CLASS assertions would
  not.

Miniflare 5 alpha integration notes (2026-09-19, miniflare
5.20260918.0-alpha, workerd 1.20260918.1):

- The classic single-worker options shape (`{modules, script,
  d1Databases}`) is rejected by the v5 zod schema (`workers: undefined —
  expected array`), and the raw `workers: [{...}]` array shape is rejected
  too (`config: undefined — expected object`): v5 moved to
  wrangler-config-style worker options while the shipped README still
  documents the v4 shape.
- The package exports `convertV4MiniflareOptions()`; converting classic
  options through it and passing the result to `new Miniflare(...)` boots
  workerd cleanly on Windows (the `workerd-windows-64` binary ships in the
  dependency tree). The D1 test file does exactly this and documents it
  inline.
- Data persistence is left at miniflare's default (ephemeral temp dir,
  cleared on `dispose()`) — tests stay hermetic.

## LibSqlHttpAdapter — `src/server/drivers/libsql-http.ts`

Speaks Hrana v2 (JSON encoding) over HTTP — the wire protocol libSQL/Turso
servers expose. Wire shape (grounded in @libsql/hrana-client, see above):

- `POST <url>/v2/pipeline`, `Authorization: Bearer <token>` when configured,
  body `{"requests": [{"type": "execute", "stmt": {"sql", "args",
  "want_rows": true}}, ..., {"type": "close"}]}`.
- Bind args are tagged Hrana values: `{"type": "null"}`,
  `{"type": "integer", "value": "<digits as string>"}`, `{"type": "float",
  "value": <number>}`, `{"type": "text", "value": "..."}`,
  `{"type": "blob", "base64": "..."}`. Integral JS numbers bind as integers
  (storage-class fidelity); non-finite numbers, out-of-i64 bigints,
  booleans, undefined, arrays and objects are rejected up front with clear
  errors.
- Response entries are decoded per the reference implementation:
  `{"type": "ok", "response": {"type": "execute", "result": {cols, rows,
  affected_row_count, last_insert_rowid?}}}` or `{"type": "error",
  "error": {"message", "code"}}`. Lenient aliases: `"response"` accepted
  for the `"ok"` tag, a missing inner response type tag tolerated, v1-style
  string `cols` tolerated. Hrana integers travel as strings and decode to
  number when within the JS safe range, bigint otherwise (mirrors
  @libsql/client's default `IntMode: "number"`).

Guarantees:

- `query` = one pipeline POST (execute + close). `batch` = a REAL
  multi-execute pipeline: ONE POST carries every statement's execute plus
  the close, results returned in statement order. (The old draft returned
  `[]` from batch — that gap is closed and asserted by tests.)
- `batch` is NOT transactional: a Hrana pipeline executes each statement
  with autocommit on the server. Local-sqlite and D1 batches ARE
  transactional. If the engine ever needs atomic multi-statement writes
  over libsql-http, that belongs at the engine layer as explicit
  BEGIN/COMMIT executes — a deliberate, documented difference, not an
  accident.
- Protocol violations are never swallowed: HTTP non-2xx, a missing
  `results` array, or a results-count mismatch all throw `LibSqlHttpError`
  (with `status` / `code` / `statementIndex` when known); in-band error
  results throw with the server message and code; per-cell value decoding
  is strict (unknown value types are errors, not undefined).

## Conformance suite — `tests/server/drivers/conformance.ts`

`runDriverConformance(suiteName, factory)` runs the shared contract:
create table; insert with params (rows/rowsAffected/lastInsertRowId
mapping); batch of two statements returning ordered results; null /
integer / float / text (unicode) round-trip; error surfacing (bad SQL
throws from `query` AND `batch`; the driver stays usable after failures).
One deliberate leniency: on SELECT, `lastInsertRowId` is
provider-dependent (SQLite tracks it per connection), so the suite accepts
absent or the last inserted rowid — nothing else.

Currently passing the full suite:

1. `LocalSqliteDriver` (file-backed, `tests/server/drivers/local-sqlite.test.ts`)
2. `LibSqlHttpAdapter` against the mock Hrana server
   (`tests/server/drivers/libsql-http-mock.test.ts`)
3. `CloudflareD1Adapter` under miniflare's local D1
   (`tests/server/drivers/d1-miniflare.test.ts`)
4. Cross-check: `@libsql/client` with a `file:` URL wrapped in
   `SQLDatabaseDriver` (`tests/server/drivers/libsql-client-file.test.ts`).
   This is NOT a shipped adapter — @libsql/client is a devDependency and
   production HTTP traffic goes through LibSqlHttpAdapter. It exists to
   prove the conformance suite is strict against a second independent
   implementation. Its types map cleanly onto the driver contract; the only
   awkwardness is `unknown[]` params needing an `InValue[]` cast.

The mock Hrana server (`tests/server/drivers/mock-hrana-server.ts`) is
protocol-faithful but sqlite-backed: it decodes requests with the same
rules as the adapter, executes SQL for real, encodes responses in the
reference shapes, captures every request body, records wire-shape
violations, and can queue a raw response body so tests can prove the
adapter surfaces protocol drift. The tests assert the EXACT wire body —
tagged args, `want_rows: true`, the trailing `close`, one POST per batch,
the Authorization header.

## Known provider differences

| Aspect | LocalSqliteDriver | CloudflareD1Adapter | LibSqlHttpAdapter | @libsql/client (cross-check) |
| --- | --- | --- | --- | --- |
| `lastInsertRowId` type | number (bigint beyond 2^53) | number | number when safe, else bigint | bigint always |
| Integer binding | INTEGER storage class | REAL storage class (no integer binding for JS numbers) | tagged integer for safe ints, float otherwise | integer |
| Batch atomicity | transactional | transactional | NOT transactional (per-statement autocommit) | transactional ("write" mode) |
| bigint params | supported | rejected (`D1_TYPE_ERROR`) | supported (i64 range) | supported |
| Boolean params | rejected natively | unverified | rejected up front | coerced by client (0/1) |
| Blob params / returns | Buffer in / Buffer out | ArrayBuffer or Uint8Array in / ArrayBuffer out | Uint8Array in (base64 on wire) / Uint8Array out | ArrayBuffer-style in / ArrayBuffer out |
| Rows shape | plain objects, duplicate columns: last wins | plain objects | plain objects built from `cols` | hybrid Row instances; wrapper converts to plain objects |
| SELECT `rowsAffected` | 0 | `meta.changes` (0) | `affected_row_count` (0) | 0 |

Engine-layer rule of thumb: rely on VALUES, never on storage classes or
`typeof`, and normalize `lastInsertRowId` through `BigInt()` before
comparing.

## What remains unproven

- A real Turso/libSQL server round trip. The adapter is tested against a
  protocol-faithful mock and cross-checked against @libsql/client's file
  backend; this environment has no network access to a live server.
- D1 in production (Cloudflare account). Miniflare's emulation is
  workerd-faithful for the surface exercised here, but production adds
  auth, request size limits, and replica behavior that are not covered.
- Baton reuse in LibSqlHttpAdapter: every pipeline closes its stream
  (stateless requests), which is correct but not the fastest pattern; a
  baton-carrying session is a possible future optimization and is
  unexercised.
- Blob round-trips: all three adapters support blobs, but the conformance
  suite covers only null/integer/float/text (per the stream's scope), and
  the adapters disagree on the returned JS type (see table) — a
  normalization decision belongs to the engine layer.
- Concurrent writers on local-sqlite: single-process assumption, no
  `busy_timeout` configured.
- Request timeout defaults: `timeoutMs` is optional and enforced with
  `AbortSignal.timeout` per pipeline POST; no default is set, so a call
  without it can hang as long as the transport allows.
