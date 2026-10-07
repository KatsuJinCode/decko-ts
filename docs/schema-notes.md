# Schema notes — core decko tables, MySQL truth -> SQLite DDL

Stream 4, wave 1 (2026-09-19). Ground truth and deliverables:

- **Production truth**: a private MySQL 8.0 production dump (1.2 GB, mysqldump 10.13), not distributed.
- **Engine truth**: installed gems `gems/card-1.110.0` and `decko-0.20.0`.
- Deliverables: `db/schema.sqlite.sql` (executable port target), `db/schema.mysql-reference.sql` (verbatim extraction), `src/server/schema.ts` (row types + inventory), `tests/server/schema.test.ts` (sync + round-trip proof).

## Re-derivation recipe (the 1.2 GB dump is never read whole)

```bash
D=/absolute/path/to/your-deck-dump.sql

# 1. Locate every CREATE TABLE block (all 12 sit in the dump's schema section,
#    lines 19-1534; the gaps are INSERT data, e.g. card_changes spans 134-1025).
grep -n "CREATE TABLE" "$D"
# -> 25, 51, 87, 127, 1031, 1090, 1166, 1202, 1403, 1443, 1466, 1531

# 2. Find each block's closing line (the ") ENGINE=..." line).
grep -n "ENGINE=" "$D"

# 3. Slice block by block with sed (start = "Table structure" comment line
#    for context, end = the ENGINE line). Example for cards:
sed -n '1196,1232p' "$D"
```

Sanity guard: every block produced this way is < 40 lines; if a slice comes back huge, the line numbers are stale — re-run step 1.

## Table inventory

The dump contains exactly 12 tables and nothing else — no site-custom ("deck") tables and no mod-created tables. Verified by scanning all 33 installed `card-mod-*-0.20.0` gems for `create_table`/`add_column` schema migrations (zero found; mod `data/transform/` files are data migrations, not schema) and by the absence of any unknown names in `grep -n "CREATE TABLE"`.

### Core DDL (in db/schema.sqlite.sql) — 12 tables

| Table | Class | Role | AUTO_INCREMENT hi-water (from dump schema) | INSERT batches in dump |
|---|---|---|---|---|
| `cards` | CORE | the central table; every card is a row | 53,070 | 152 |
| `card_acts` | CORE | save events (actor, when, ip) | 351,482 | 11 |
| `card_actions` | CORE | per-action rows within an act | 461,871 | 6 |
| `card_changes` | CORE | per-field after-values per action | 278,789 | 878 |
| `card_references` | CORE | inclusion/link reference graph | 6,302,836 | 28 |
| `card_revisions` | CORE | legacy pre-1.14 revisions, still populated | 89,593 | 48 |
| `card_virtuals` | CORE | materialized virtual-card cache | 345 | 6 |
| `delayed_jobs` | ENGINE-JOBS | background queue; created by core migration `20170908114442_create_delayed_jobs.rb`, consumed by card-mod-delayed_job | 5,277 | 6 |
| `sessions` | RAILS-INFRA | ActiveRecord::SessionStore; part of the deployed base schema (no mod creates it) | 2,150,503 | 39 |
| `schema_migrations` | RAILS-INFRA | Rails migration bookkeeping | n/a (no id) | 1 |
| `ar_internal_metadata` | RAILS-INFRA | Rails environment metadata | n/a (text PK) | 1 |
| `transform_migrations` | RAILS-INFRA | decko `Cardio::Migration::Transform` bookkeeping | n/a (no id) | 1 |

Row counts: mysqldump carries no live row counts, so exact counts are **n/a** without loading the DB. The AUTO_INCREMENT values are high-water marks (rows ever allocated, including deleted); INSERT-batch counts are single-pass `grep -oE "^INSERT INTO \`[a-z_]+\`" | sort | uniq -c` counts — each batch holds many rows, so batch count ≪ row count.

### Core classification evidence (Ruby gems)

- `card-1.110.0/mod/core/data/schema/` — the engine's schema migrations: create `card_acts`/`card_actions`/`card_changes` (20140822...), `card_virtuals` (20180514...), `delayed_jobs` (20170908...). The base `cards`/`card_references`/`card_revisions` tables predate tracked migrations (the earliest migration `20110511221913` *requires* pre-1.6 installs; older migrations were removed from the gem), so the dump is the only complete record of their final shape — hence dump-as-ground-truth.
- Later core migrations the dump reflects (and the gem's own `db/schema.rb` does NOT): `cards_trash_index` (20240628...), unique `index_card_virtuals_on_left_id_and_right_id` (20200805...), unique `cards_codename_index` (20241017...). The dump is *newer* than the gem's schema dump; where they disagreed, the dump won.
- **Warning**: `card-1.110.0/db/schema.rb` is NOT engine truth — it is an ActiveRecord site dump regenerated from some other database (version stamp `2026_09_19_200002`). It contains a legacy `users` table and site-custom `library_*` tables that do not exist in the reference deck production. Do not derive DDL from it; the core-table columns do match the dump and were used as a cross-check.

### Excluded from the core DDL

- Nothing from the reference deck dump was excluded: it has no site-custom or mod tables.
- Known mod/extension points (for future waves, listed per the task):
  - `card-mod-delayed_job` — consumes `delayed_jobs` (table itself ships with core).
  - Rails session store — consumes `sessions` (same: base schema, not a mod).
  - Legacy `users` table — dropped from production by core transform migration `20140307231621_user_data_to_cards.rb`; a port must NOT recreate it.
  - The other site's `library_*` tables (gem schema.rb only) — site-custom, out of scope.
  - All 33 installed card-mods — create zero tables; their data lives in cards. No mod DDL exists to port.

## Type-mapping decisions (MySQL -> SQLite)

| MySQL (dump) | SQLite | Why |
|---|---|---|
| `int`, `bigint` | `INTEGER` | SQLite INTEGER is 64-bit; bigint only appears on `delayed_jobs.id` and folds losslessly. |
| `AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Matches the InnoDB contract that ids are never reused after delete (InnoDB persists the counter since 8.0). Plain `INTEGER PRIMARY KEY` (rowid alias) *would* reuse; `AUTOINCREMENT` forbids it. Cost is negligible at this write volume. |
| `datetime` | `TEXT`, canonical **UTC `YYYY-MM-DD HH:MM:SS.mmm`** | Chosen over integer-epoch because: (1) lexicographic order == chronological order at fixed width, (2) the format family matches both the dump's own values (`2018-12-20 00:22:40`) and ActiveRecord-on-SQLite serialization, so imports and oracle comparisons need no conversion, (3) human-readable diffing against MySQL truth, (4) SQLite `datetime()`/`strftime()` operate on it directly. The space separator (not `T`) matches MySQL dump values exactly; `T` vs space only matters for equality against imported rows, so the canonical form is fixed as space + milliseconds. Epoch integers would be faster to compare but lose readability and force conversion at every import/compare boundary. |
| `varchar(n)` | `TEXT` | SQLite ignores length limits; the real n is kept in per-column comments (e.g. `varchar(255)`) so the truth survives. Engine layer may enforce if it ever matters. |
| `text` / `mediumtext` | `TEXT` | SQLite TEXT is unlimited, so MySQL's capacity tiers collapse. Where the dump said `mediumtext` (16 MiB cap: `cards.db_content`, `card_changes.value`, `card_virtuals.content`, `delayed_jobs.handler`) the comment records it. No `longtext` exists in the core schema. |
| `tinyint(1)` | `INTEGER` + `CHECK (col IN (0,1))` | ActiveRecord boolean storage shape (0/1). CHECK turns silent garbage into errors; nullable booleans (`card_actions.draft`) get the CHECK but no NOT NULL, exactly per dump. |
| `decimal` | **not needed** | No core table carries DECIMAL (the `library_*` tables that do are not in this dump). Rule decided in advance if one ever appears: store as TEXT to preserve exactness. |
| `utf8mb3`/`utf8mb4` charsets | native UTF-8 | SQLite text is UTF-8; charset declarations vanish. |

## Collation decision (the one real semantic gap)

MySQL `utf8mb3_unicode_ci` compares **case-insensitively**; SQLite's default is binary (case-sensitive). Assessment:

- Lookups are safe under binary collation: decko's engine normalizes `key` and `referee_key` to downcased ASCII before write (name->key algorithm), so equality queries never depend on ci behavior.
- **Uniqueness** is different: production's `cards_key_index` UNIQUE would reject a case-variant duplicate; binary SQLite would accept it. To reproduce production semantics, the two UNIQUE indexes on ci columns (`cards_key_index` on `key`, `cards_codename_index` on `codename`) carry `COLLATE NOCASE` (ASCII-only folding, which matches decko's ASCII key normalization). Tested: inserting `SCHEMA_ROUND_TRIP` after `schema_round_trip` throws.
- Residual gap: NOCASE folds only ASCII; ci-equivalence of non-ASCII in MySQL would differ. decko keys are ASCII-normalized, codenames are ASCII in practice — accepted risk, recorded here.

## Index decisions

- Every MySQL `KEY`/`UNIQUE KEY` became a `CREATE INDEX`/`CREATE UNIQUE INDEX` with the **same name** (byte-comparable against production). Index inventory is asserted by test against the verbatim reference.
- `card_virtuals` index names are deliberately swapped in production (`left_id_index` is on `right_id` and vice versa; from core migration `20200805200729`). Preserved verbatim — this is a trap for anyone "fixing" it; don't.
- MySQL multi-column NULL semantics match SQLite: both allow duplicate (NULL, x) rows in unique indexes. Parity holds with no extra work.
- **FULLTEXT/SPATIAL**: none exist in the core schema (verified against all 12 blocks), so nothing was dropped. Standing decision: if a future table needs full-text, the SQLite answer is an FTS5 virtual table, not a plain index.
- `ar_internal_metadata`'s `PRIMARY KEY ("key")` stays an in-table constraint (text PK); `schema_migrations`/`transform_migrations` have no PK and only a unique index, mirroring the dump exactly.

## Foreign keys: none, on purpose

The production schema declares **zero** FOREIGN KEY constraints (verified across all 12 blocks — relationships like `card_actions.card_id -> cards.id` are application-enforced, standard for this ActiveRecord codebase). The SQLite DDL therefore declares none either. Fidelity choice; side benefit: bulk import from the MySQL dump needs no table ordering. If wave 2+ wants enforcement, add it as an opt-in overlay, not by editing this DDL's semantics.

## What the tests prove

`tests/server/schema.test.ts` (better-sqlite3, temp-file DB):

1. Parsed DDL table list == `TABLE_ORDER` == `TABLES` keys (12 tables).
2. Parsed per-table column list == `TABLES` columns (exact order).
3. Parsed index inventory == verbatim MySQL index inventory (per table).
4. All 12 tables exist after executing `db/schema.sqlite.sql`.
5. Round-trip: cards insert -> select -> field-for-field equality (`toEqual`), with storage-shape spot checks.
6. Round-trip: act -> action -> change chain across nullable join columns.
7. UNIQUE enforcement on `cards.key` (exact + case-variant via NOCASE) and `(left_id, right_id)`.
8. CHECK enforcement on `trash` (tinyint(1) boolean).
9. AUTOINCREMENT never reuses ids after delete (InnoDB contract).

Plus the compile-time half in `src/server/schema.ts`: 12 type-level assertions pin each row interface's keys to its `TABLES` column map (fails `tsc` on drift).

## Honest gaps

- **Live row counts**: not derivable from a dump; AUTO_INCREMENT high-water marks reported instead.
- **DEFAULT values**: only production-declared defaults were carried (`referer_id 0`, `ref_type ''`, `referee_key ''`, delayed_jobs' `0`s). `card_actions.draft` and `cards.trash` have NO default in production and none here either — the engine layer must always supply them, exactly like ActiveRecord does today.
- **Collation**: NOCASE is ASCII-only; see the residual-gap note above.
- **AUTOINCREMENT cost**: marginally slower rowid allocation than plain INTEGER PRIMARY KEY; chosen for the no-reuse contract. Revisit only if profiling ever says otherwise.
- **data types beyond the 12 tables**: mod-owned data migrations and card *content* (type_code -> type_id mappings, FieldID codes for `card_changes.field`) live in card-gem code, not the schema; they are wave-2+ concerns and only referenced here where the schema forces it (`field` is "a FieldID code", `action_type` enum values come from `Card::Action::TYPE_CODES` in Ruby — not yet pinned in TS).
- **Dump recency**: ground truth is 2026-09-07; production may have migrated since. Re-run the grep/sed recipe to re-derive before trusting edge cases.
