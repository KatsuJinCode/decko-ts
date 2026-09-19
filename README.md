# decko-ts

TypeScript port of the Decko card engine. Target: full compatibility with
Ruby Decko (card 1.110.0 / decko 0.20.0) for ANY deck — any combination of
mods, cards, and settings. The running Ruby engine is the oracle; the
acceptance criterion is byte-for-byte output parity. Upstream proposal:
decko-commons/decko#1282 (held on this fork until parity + flawless
production run, per the proposal's question 3 recommendation).

## Layout

- `src/server/` — host-facing layer: SQL/blob driver interface, adapters
  (Cloudflare D1, libSQL-over-HTTP), schema row types.
- `src/card/` — the card engine core ported from the Ruby card gem:
  name algebra, cards, sets/rules/permissions (wave 2+), rendering (wave 3).
- `src/cql/` — Card Query Language: parser, AST, SQL translation.
- `db/` — schema: SQLite-compatible DDL derived from the production MySQL
  schema and the Ruby migrations.
- `tools/oracle/` — the Ruby oracle harness: a local decko app + capture
  scripts that record Ruby behavior into `fixtures/captured/`.
- `fixtures/captured/` — the oracle's recorded outputs (committed; they are
  the executable specification).
- `docs/` — port tracker, per-stream notes.

## Ground rules

- The engine never imports vendor SDKs or branches on provider names.
- Tests: vitest. Typecheck: `npm run typecheck`. Both must pass before any
  commit lands.
- Ruby truth lives in the installed gems (C:\Ruby33-x64, card-1.110.0,
  decko-0.20.0) and, for the production schema, the Culturesmith mysqldump.
- Nothing from this repo goes to decko-commons upstream until Julian says
  so.
