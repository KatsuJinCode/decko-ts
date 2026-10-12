# import-deck.mjs — the productized importer, with the chunking recipe

## Migration compatibility

| Source | Supported | Ingest path |
|---|---|---|
| SQLite deck file | yes | `source-sqlite.mjs` + `generalized-import.mjs` |
| MySQL dump (mysqldump text) | yes | `parse-dump.mjs` + `import.mjs` |
| deck-INSERT seed SQL | yes | `deck-seed-parser.mjs` |
| PostgreSQL dump | **no** | no PostgreSQL adapter or dialect translator exists in the tree (removed as unverified — `docs/decisions/0007-atomic-saves-and-transaction-contract.md`) |

Two further compatibility facts a migration must plan around:

- **Passwords.** By default the port stores new and upgraded passwords as
  PBKDF2, which **Ruby Decko cannot verify**. While Ruby Decko still serves
  the same deck (a shared-engine migration), the port must run with
  `DECKO_PASSWORD_HASH=legacy-sha1` so every digest stays in Ruby's form;
  accounts whose passwords the port already upgraded need a password reset to
  sign in through Ruby. Full detail: `docs/SECURITY.md`, approved divergence 2.
- **D1 transaction semantics differ** from Ruby's and from plain SQLite: a
  save on D1 is atomic through a compensating journal (not `BEGIN`/`COMMIT`),
  other connections can read a D1 save's rows before it commits, and ids
  handed back by a rollback are not reused. `docs/decisions/0007-atomic-saves-and-transaction-contract.md`
  is the authoritative table.

## What it does

`tools/migrate/import-deck.mjs` is the one-command productized path
from a real Decko source to a chunked D1-ready seed:

  node tools/migrate/import-deck.mjs \
    (--source <deck.sqlite> | --dump <dump.sql> | --seed <seed.sql>) \
    --out-dir <chunk-dir> [--apply] [--report <report.json>]

The pipeline:

1. INGEST — the source goes through the matching existing module:
     SQLite file   → tools/migrate/source-sqlite.mjs + generalized-import.mjs
     mysqldump text → tools/migrate/parse-dump.mjs + import.mjs
     deck-INSERT    → tools/migrate/deck-seed-parser.mjs (the deck-INSERT parser)
   Each produces { table, columns, values } rows that flow through the
   existing schema-map.mjs column-drift machinery.

2. DEDUP — every row is checked against four seen-sets per table
   (id, key, (left_id, right_id), codename). When a collision is found
   on a UNIQUE INDEX target, the second side is NULL'd on the duplicate
   row (the row still lands; the count is reported). When a collision
   is found on the PRIMARY KEY id, the duplicate row is skipped
   (reported as "duplicate-id skip"). The dedup exists because real
   dumps can carry thousands of duplicate-id and
   duplicate-(left_id, right_id) rows when an upstream sanitization
   pass was supposed to be idempotent but was not. A clean source
   should hit zero dedup hits.

3. CHUNK — read staging in target DDL column order and emit
   chunk-NNN.sql files at <out-dir>/chunks/. Each chunk is
   self-contained: header comment, BEGIN TRANSACTION, INSERTs in
   target order, COMMIT, PRAGMA pair. The chunker flushes when EITHER
   `--chunk-rows` OR `--chunk-bytes` is hit (default 1000 rows /
   8 MiB). The chunked SQL is ready for `wrangler d1 execute --local
   --file chunk-NNN.sql`.

4. APPLY (optional, --apply) — for every chunk, the CLI spawns
   `wrangler d1 execute <db> --local --file <chunk>` from <apply-dir>
   (default: deploy/). Wall time per chunk is recorded in
   <out-dir>/apply.timings.jsonl.

5. VALIDATE — d1-validator.mjs reads the staging DB and runs the
   four honest checks: card count, junction count, junction-walk
   resolution, per-table parity, orphan-junction check. The report
   is content-free (ids, counts, hashes only).

## The chunk-size recipe

Chunk size interacts with wrangler's local-D1 per-file limit. Under the
default (`--chunk-rows 1000 --chunk-bytes 8 MiB`), junction-style tables
produce ~200 KB chunks per 1000 statements, but tables whose rows carry
long content strings blow up to 7-16 MB per chunk at that row count.
Those large chunks hit wrangler's per-file limit:

  X [ERROR] statement too long: SQLITE_TOOBIG

Measured ceiling:

| --chunk-rows | --chunk-bytes | Largest chunk | D1 wrangler outcome |
|--------------|----------------|---------------|---------------------|
| 1000 (default) | 8 MiB (default) | 16.1 MB | FAIL with SQLITE_TOOBIG on the long-content chunks |
| 500           | 1 MiB           | 2.6 MB | PASS every chunk |

Recipe (recorded here for future runs):

  --chunk-rows 500 --chunk-bytes 1048576

At 500 rows / 1 MiB every chunk lands under wrangler's per-file limit
regardless of how much long content its rows carry.

Apply cost is dominated by per-invocation overhead, not by the SQLite
writes: with `wrangler d1 execute --local --file` each chunk pays a
multi-second miniflare startup while the INSERTs themselves complete in
tens of milliseconds. Driving the chunks straight against the local D1
SQLite file — which is what tools/migrate/apply-chunks-to-d1-local.mjs
does — honors every BEGIN/COMMIT pair sequentially and is far faster.

Per-chunk limits discovered:
- SQLITE_TOOBIG on chunks > 8 MiB (16 MiB chunks fail with
  `statement too long`). The CLI's `--chunk-bytes` enforces this.
- wrangler d1 execute --file refuses files with multiple transactions
  (each chunk's BEGIN/COMMIT counts as one transaction, so chunks are
  inherently single-transaction files).
- `wrangler d1 execute --local --file` round-trips cleanly on every
  500-row / 1 MiB chunk.
