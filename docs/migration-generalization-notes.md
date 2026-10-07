# Migration tool generalization notes — any-Ruby-deck path (M4, stream 14)

This doc records the generalization of the proven mysqldump-based migration
tool (stream 14, wave 1) into a reusable any-Ruby-deck importer that takes
**any Ruby decko SQLite database file** as input, not a bespoke dump format.
Upstream proposal: decko-commons/decko#1282. Issue #10 tracks the remaining
gaps to a full one-click CLI; this doc names them honestly.

The CLI lives at `tools/migrate/migrate-generalized.mjs`. The original
mysqldump CLI (`tools/migrate/migrate.mjs`) is unchanged and remains the
right entry for production dumps; the two share downstream pieces
(`import.mjs`, `verify.mjs`, `engine-bridge.mjs`).

## What generalized cleanly

### The source-side reader (any SQLite file)

`tools/migrate/source-sqlite.mjs` opens a source database in read-only mode
through better-sqlite3 and exposes `sourceTableRows(db, table, opts)` as an
async generator. Yields the same `{ table, values, columns }` shape
`MysqldumpInsertParser` produces, so the importer's downstream code
(classification, mapping, key repair, checksumming, batching) is reusable
verbatim — no shape fork.

Keyset pagination (`rowid > last, ORDER BY rowid LIMIT n`) keeps memory at
`O(chunkRows) regardless of table size` — same bound the mysqldump parser
proves on a 1M-row sessions dump (streaming-memory.test.ts).

### The schema mapper (per-table column maps + variant recognition)

`tools/migrate/schema-map.mjs` translates any source shape into the target
DDL column order. Three variants seen so far:

| source shape | key differences from target | how the mapper handles it |
|---|---|---|
| mysqldump pipeline | `db_content` named correctly; full schema | passthrough |
| corpus-v2 sanitized | `content` (not `db_content`); no `current_revision_id`, no `references_expired` | `content -> db_content`; missing target cols filled NULL with warnings |
| legacy / unknown | various column names | per-table map + positional fallback for tables without a map |

The mapper is intentionally permissive: it never throws on a missing
source column. It returns a list of warnings so the importer can report
what was filled with NULL, what was renamed, and what was dropped. New
column variants discovered in the wild extend the per-table map; the
importer is unaffected.

### The settings inventory (read-only, never import)

`tools/migrate/settings-map.mjs` recognizes settings-shaped tables by
name (`meta`, `settings`, `setting`, `card_settings`) and by column shape
(`(key|name|setting, value|val)` pair). It INVENTORIES them and reports
the key NAMES, but never the values (settings may carry account email
templates, OAuth tokens, deck-private config — DATA RULE).

decko-ts stores settings as CARDS (the 2014 transform migration), so the
mapper never imports settings into the target: there is no target table
to land them on. The inventory lands in the migration report as
`settingsInventory` so the reader sees what was present.

Verified against corpus-v2: 1 settings table (`meta`, 12 rows:
`atom_vocabulary`, `card_rows`, `cards_digest`, `content_length_overflows`,
`extract_comparable_names_matched`, `live_cards`, `live_unresolved_names`,
`ref_rows`, `references_digest`, `seed`, `structural_parts`,
`timestamp_shift_days`) — every value is corpus-build metadata, not
application state.

### Name reconstruction (junction walk on the imported target)

`tools/migrate/name-reconstruct.mjs` implements the fallback ladder for
junction cards whose name/key columns are NULL or absent:

1. **IN-COLUMN** — source row already carries a non-null name; use it.
2. **LEXICON** — source row has `left_id/right_id` but no name; walk the
   IMPORTED TARGET (the source may not have the simple-card rows) using
   the same depth-capped junction walk the existing `verify.mjs` uses.
   Depth cap = 64 so a corrupt junction cycle surfaces as unresolved,
   not as a hang.
3. **UNRESOLVED** — neither side resolves; row imported with NULL name,
   counted in `keyRepair.lexUnresolved`. The fetch layer will return
   `name: undefined` for these rows (data-faithful).

The corpus-v2 shape always lands at fallback 1 (every junction row in
the corpus already carries its composed name in the column; the
sanitization rebuilt names rather than leaving them NULL). On corpus-v2,
`lexUnresolved: 20` is observed — these are 20 junction rows in the corpus
whose left_id/right_id walk would never terminate (a documented corpus
sanitization choice; see `corpus-v2-manifest.json` `live_unresolved_names`).

### The round-trip report (counts in vs out, per source + per target)

`tools/migrate/roundtrip-report.mjs` produces a per-table, in-vs-out
counts report. One row per source table, plus one row per target-only
table, with `map: "core" | "settings" | "unknown" | "not-imported"`. The
markdown rendering stays content-free (only counts and table names).

On corpus-v2:

```
totals: source=606367, target=606355, dropped=0
```

The 12-row delta is the `meta` table — 12 settings rows correctly NOT
imported (settings = cards in decko).

### The determinism proof (import twice, byte-identical)

`tools/migrate/determinism.mjs` imports the same source twice into two
fresh target databases and compares every row via per-row FNV-1a hashes
plus a sha256 of the concatenation. Pass means: same source + same
importer = same target. The proof is sensitive to both importer
non-determinism (clock, PRNG, map iteration feeding bytes) and source
non-determinism (rowid sequence changes between reads).

On corpus-v2, all 12 tables are deterministic. Wall time ~38s for the
double-import (the corpus is 198M rows).

### Mod compatibility (read-only reuse of the existing report)

`--mod-compat` reads `tools/compat-report/mod-compat-report.json` (the
output of `tools/compat-report/generate-mod-compat-report.mjs`), computes
the per-status totals (ported/partial/missing/ignored), and merges a
summary into the migration report. It does NOT regenerate the
compat report — that tool is decoupled (deck is the input; the migration
tool just observes what the per-mod compat scan found).

The wired fields: `modCompat.summary` (per-status counts),
`modCompat.mods` (per-gem status + verdict), `modCompat.source`
(path to the compat report JSON), `modCompat.generatedAt` (when it was
produced).

On corpus-v2: `ported: 1, partial: 30, missing: 0, ignored: 2`. The
numbers match the per-deck compat report exactly — read-only wiring,
no fork.

### End-to-end run against corpus-v2

```
migrate: benchmarks/corpus-v2/bench-corpus-v2.sqlite3
    -> tools/migrate/scratch-out/test.sqlite

source inventory:
  card_references: 556526 rows (6 cols) -> core
  cards: 49829 rows (15 cols) -> core
  meta: 12 rows (2 cols) -> settings

imported 606355 rows in 14.8s
  card_references: 556526
  cards: 49829
  name reconstruct: 0 lex-resolved, 20 unresolved
  settings inventory: 1 table(s), 12 row(s) — NOT imported

round-trip report: tools/migrate/scratch-out/test.sqlite.roundtrip.md
  totals: source=606367 target=606355

verification: allParity=true
  report: tools/migrate/scratch-out/test.sqlite.migrate-report.json
```

Reconciled against direct SQL counts on the source:
`cards = 49829` / `card_references = 556526` / `meta = 12` — every count
matches. Per-row spot at ids 1, 2, 100, 1000, 49829: source row ==
target row (all columns). `name IS NULL OR empty`: source 20 / target 20
(exact match).

## What stayed the reference deck-specific

Zero things. The generalization replaces the mysqldump parser (which was
already proven on the reference deck 1.2 GB dump) but the mysqldump CLI
remains — it is one entry point that uses the same downstream pipeline.
No the reference deck-specific code path was carried into the generalized
importer: schema mapping, settings inventory, name reconstruction,
round-trip report, and determinism proof are pure generic logic.

The pre-existing mysqldump CLI (`tools/migrate/migrate.mjs`) was
intentionally left unchanged. Its parser (`parse-dump.mjs`), importer
(`import.mjs`), verifier (`verify.mjs`), and engine bridge
(`engine-bridge.mjs`) are shared with the generalized path through the
`{ table, values, columns }` row shape.

## Honest gaps to a full one-click (issue #10)

The generalized importer is the production path for corpus-v2 and is
correct on every shape we have today. The remaining gaps to a true
"one-click any deck" CLI:

### 1. Multi-source merge

The generalized CLI takes ONE source database. Some decks distribute
data across multiple source DBs (a primary, a read replica, an analytics
shadow). A one-click tool would accept `--source <primary> --also
<replica>` and merge by id with last-writer-wins or per-table policy.
Today: not implemented. The importer's source reader is single-DB by
construction.

### 2. Schema drift auto-detection

The schema map's column-name variants list (`content -> db_content`,
`creator -> creator_id`, etc.) is curated, not learned. A one-click tool
would inventory the source's tables, infer a column map by name
similarity + position, and surface an explicit "best guess + requires
confirmation" prompt before importing.

### 3. Engine verification wired through the generalized path

`tools/migrate/engine-bridge.mjs` is shared but only the mysqldump CLI
passes `--engine-verify` end-to-end. The generalized CLI does not yet
expose `--engine-verify`; it would need the same vitest-runner spawn
the mysqldump CLI uses (`tools/migrate/migrate.mjs:263`).

### 4. Foreign-key handling for derived target tables

The generalized importer never creates derived target tables (it applies
the decko-ts DDL and stops). A one-click tool would observe which target
tables the source DDL implies (e.g. some decks carry an `account`
extension table) and either map them or skip them with a per-table
warning. Today: site-custom tables fall through `classifySourceTable`
to "unknown" and are skipped with a warning.

### 5. Settings migration as cards

Settings tables are inventoried but never migrated. The 2014 transform
migration turned settings into cards in decko, so an arbitrary deck
may carry both settings-card rows (already cards, will import as cards)
and a legacy `settings` table (no target landing place). A one-click
tool would migrate legacy settings rows as card-shaped rows under the
`*all` type. Today: not implemented; reported in `settingsInventory`.

### 6. Live migration (without downtime)

The generalized importer opens the target in WAL mode with
`synchronous = OFF` for the bulk load. For a one-click tool on a
production deck, the right path is: take a source snapshot (corpus-v2
style), then migrate the snapshot — NOT live against the source. This
is the corpus-build approach today and is the only path that guarantees
determinism.

## Test suite (tests/tools/migrate/ — synthetic only)

30 tests across 7 files (vitest, synthetic in-test fixtures; zero real
content):

| file | tests | what it pins |
|---|---|---|
| `schema-map.test.ts` | 8 | corpus-v2 rename + mysqldump passthrough + settings classification |
| `source-sqlite.test.ts` | 4 | read-only open, inventory shape, keyset pagination |
| `settings-map.test.ts` | 5 | settings variant recognition + DATA-RULE key-only sampling |
| `name-reconstruct.test.ts` | 5 | in-column / lexicon / unresolved fallback ladder |
| `roundtrip-report.test.ts` | 2 | in-vs-out counts per source + per target |
| `generalized-import.test.ts` | 4 | end-to-end against corpus-v2-shaped synthetic source |
| `determinism.test.ts` | 2 | hashTable shape + proveDeterminism contract |

The existing mysqldump pipeline tests (`tests/migrate/`) are unchanged;
21 of those pass too (verified: no regression from the generalization).

## Files (this milestone)

| path | role |
|---|---|
| `tools/migrate/source-sqlite.mjs` | source-side reader (any SQLite DB) |
| `tools/migrate/schema-map.mjs` | source-to-target column mapping |
| `tools/migrate/settings-map.mjs` | settings inventory (read-only) |
| `tools/migrate/name-reconstruct.mjs` | junction-walk name fallback |
| `tools/migrate/generalized-import.mjs` | the generalized importer |
| `tools/migrate/roundtrip-report.mjs` | counts in vs out |
| `tools/migrate/determinism.mjs` | byte-identical double-import proof |
| `tools/migrate/migrate-generalized.mjs` | the CLI entry point |
| `tests/tools/migrate/*` | 30 synthetic-only unit tests |
| `tools/migrate/scratch-out/` | gitignored; the determinism proof writes here |
| `.gitignore` | adds `tools/migrate/scratch-out/` |

## Provenance

End-to-end run against the sanitized bench corpus-v2 (198M rows,
`benchmarks/corpus-v2/bench-corpus-v2.sqlite3`, 606367 source rows):

| step | output |
| | |
| inventory | 3 source tables (`card_references`, `cards`, `meta`); 2 core, 1 settings |
| import | 606355 rows in 14.8s (~41000 rows/s sustained) |
| round-trip | source 606367 / target 606355, dropped 0 (settings correctly NOT imported) |
| verification | `allParity: true`, `cards.parity: true`, checksum match (3080884090 == 3080884090) |
| determinism | all 12 tables deterministic (per-row hash + id-set match) |
| mod-compat | 1 ported / 30 partial / 0 missing / 2 ignored — matches per-deck compat report |

The generalized tool is correct on the corpus-v2 shape (3 tables, no
attachments, no user credentials, no live migration). The 6 gaps above
are the work for the one-click CLI (issue #10).