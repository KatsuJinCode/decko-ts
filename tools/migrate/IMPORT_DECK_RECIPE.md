# import-deck.mjs — the productized importer, with the chunking recipe

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
   (reported as "duplicate-id skip"). The dedup exists because the
   anonymized corpus-v2 seed has thousands of duplicate-id and
   duplicate-(left_id,right_id) rows from a UNION-style sanitization
   that was supposed to be idempotent but was not. Real production
   data should hit zero dedup hits.

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

## The chunk-size recipe (measured on the 867MB anonymized seed)

The anonymized corpus-v2 seed is 826.7 MiB / 3,871,640 lines / 1,206,985
INSERT statements (94234 cards + 1112744 card_references + 7 meta).
The default (`--chunk-rows 1000 --chunk-bytes 8 MiB`) produces chunks
where the card_references chunks are ~200 KB / 1000 statements each but
the cards chunks (which carry long content strings) blow up to 7-16 MB
each. Those large chunks hit wrangler's local-D1 per-file limit:

  X [ERROR] statement too long: SQLITE_TOOBIG

Measured ceiling on that seed:

| --chunk-rows | --chunk-bytes | Largest chunk | D1 wrangler outcome |
|--------------|----------------|---------------|---------------------|
| 1000 (default) | 8 MiB (default) | 16.1 MB | FAIL with SQLITE_TOOBIG on the long-content cards chunks |
| 500           | 1 MiB           | 2.6 MB | PASS every chunk |

Recipe (recorded here for future runs):

  --chunk-rows 500 --chunk-bytes 1048576

This produces 2498 chunks for the 826.7 MiB seed:
- 2225 card_references chunks (~80-90 KB each, 500 statements each)
- 273 cards chunks (200 KB - 2.6 MB each, 500 statements each)
- Total: 1206260 statements / ~210 MB SQL on disk after the chunk
  wrapper (BEGIN/COMMIT/header overhead).

Wall time for the chunk apply (verified end-to-end via
tools/migrate/apply-chunks-to-d1-local.mjs against the wrangler local
D1 file at deploy/.wrangler/state/v3/d1/.../miniflare-D1DatabaseObject/...sqlite):

  2498 chunks applied in 34.9s (better-sqlite3, all 2498 BEGIN/COMMIT pairs
  honored sequentially)

The same 5 chunks via `wrangler d1 execute --local --file`:
  5 chunks in 54s = ~10s per chunk (most of that is miniflare startup,
  not the SQLite writes - the actual INSERTs complete in tens of ms).

Per-chunk limits discovered:
- SQLITE_TOOBIG on chunks > 8 MiB (16 MiB chunks fail with
  `statement too long`). The CLI's `--chunk-bytes` enforces this.
- wrangler d1 execute --file refuses files with multiple transactions
  (each chunk's BEGIN/COMMIT counts as one transaction, so chunks are
  inherently single-transaction files).
- `wrangler d1 execute --local --file` round-trips cleanly on every
  500-row / 1 MiB chunk. A 500-row card_references chunk of ~85 KB
  applies in 30-50 ms after miniflare startup.

Final D1 counts after the 867MB-seed import (verified via wrangler
d1 execute --local --command):
  cards:            93700
  card_references:  1112560
  junction count:   74814 (cards WHERE left_id IS NOT NULL AND trash = 0)
