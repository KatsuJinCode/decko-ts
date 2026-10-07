# Migration tool notes — Ruby Decko mysqldump → decko-ts SQLite (M4, stream 14)

The M4 one-click migration path: any Ruby Decko mysqldump becomes a working
decko-ts SQLite database — same data, new runtime underneath, no editorial
transforms. This generalizes the proven the reference deck importer
(a private production dump (not distributed)`) into a reusable tool.
Port-tracker stream 14, wave 3 (2026-09-20). Upstream proposal:
decko-commons/decko#1282.

```
node tools/migrate/migrate.mjs --dump <file.sql> --out <deck.sqlite> --verify [--engine-verify]
```

## Files

| File | Role |
|---|---|
| `tools/migrate/parse-dump.mjs` | streaming, quote-aware mysqldump INSERT parser (+ `.d.mts` types) |
| `tools/migrate/import.mjs` | rows → SQLite target over the DDL (+ `.d.mts` types) |
| `tools/migrate/verify.mjs` | post-import verification + content-free JSON report (+ `.d.mts` types) |
| `tools/migrate/engine-bridge.mjs` | the only seam to the TypeScript engine: RenderEngine spot-render, Lexicon junction checks, DeckoName key derivation (+ `.d.mts` types) |
| `tools/migrate/migrate.mjs` | CLI entry point |
| `tests/migrate/**` | synthetic-fixture test suite (28 tests; zero real content) |

## Parser grammar and design (parse-dump.mjs)

Ground truth: the production dump grammar (mysqldump 10.13 over MySQL 8.0,
verified against the reference deck 2026-09-07 dump — 1177 `INSERT INTO
`x` VALUES` statements, 0 column-list variants, single physical lines up to
3.6 MB) plus the `--complete-insert` column-list variant for robustness.
Everything else in a dump (LOCK/UNLOCK TABLES, `/*!...*/` conditional
comments, `--`/`#` comments, CREATE/DROP/SET) is skipped quote-aware.

**The design constraint is the lesson from the 1.2 GB the reference deck
migration**: naive backtracking regexes (`/'(?:[^'\\]|\\.)*'/` over a full
line) HANG on production dumps. The parser is therefore:

1. **Linear** — a forward state machine (scan → table → post-table → cols
   → await-open → fields → between). The only searches are native
   `indexOf` plus a bounded backward walk over an escape run. Zero
   backtracking regexes anywhere.
2. **Anchored** — consumed input is compacted away (never re-scanned) at
   statement/tuple boundaries; compaction never runs while a string
   literal is open, so an escape run is never cut in half.
3. **Quote-aware** — string literals (single AND double quote forms),
   backslash escapes, doubled quotes (`''`, the NO_BACKSLASH_ESCAPES
   convention, which MySQL accepts in every mode) are tracked in one
   forward pass; tuple/field boundaries are only trusted outside literals.
4. **Streaming** — fixed 1 MiB read chunks; rows are emitted the moment
   their `)` closes; buffer compaction keeps retention at
   O(chunk + one decoded value) regardless of line length.

Value decoding follows MySQL server string-literal semantics exactly:
`\0 \' \" \b \n \r \t \Z \\` map to their characters; `\%` and `\_` KEEP
the backslash (they evaluate to the two-character sequences); unknown
`\x` drops the backslash. NULL → null; integers/floats (incl. exponent
signs: `1.5e-3`) → JS numbers; `0x…`, `x'…'`, `b'…'` → Uint8Array;
`_binary`/`_charset` introducers are consumed. Unknown bare tokens are
carried verbatim.

**Chunk-boundary correctness is pinned by test**: every parse test runs
the same dump at feed sizes 1, 2, 3, 7, 64, and 1 MiB characters and
requires byte-identical rows. The bugs this caught during development
(each a resume-state bug invisible in whole-file feeding): a partial
`VALUES` keyword erroring instead of waiting; a closed tuple leaving the
machine in the wrong state (now an explicit `between` state); column
names accumulating in a per-invocation local array; a string terminator
on the buffer's last char being ambiguous (doubled quote cannot be
ruled out without one more character).

**Measured**: the full 1.2 GB production dump parses in ~25.5 s (~47 MB/s)
on this workstation, all 12 tables recognized, row counts sane — single
linear pass, bounded memory throughout.

## Import (import.mjs)

- Column order comes from `db/schema.sqlite.sql` itself
  (`parseTargetSchema`), not a hardcoded copy — the importer can never
  drift from the schema stream's decisions. Positional rows map onto the
  DDL column order; explicit column lists intersect with it. Version
  drift (extra/missing tail columns) pads/truncates with a warning.
- The DDL is applied in bulk-load order: CREATE TABLEs first, all INSERTs,
  then CREATE INDEXes (order-of-magnitude win on multi-million-row tables;
  production `card_references` holds ~557k rows, `sessions` ~252k).
- Rows stream parser → batched parameterized INSERTs (default 1000 per
  transaction) → flush; peak memory is O(batch + parser buffer).
- Pragmas for the one-shot bulk load: WAL, synchronous OFF during import
  (restored to NORMAL at the end), temp_store MEMORY, 64 MiB page cache;
  WAL checkpoint on completion.
- Fresh-target guard: refuses a database that already contains `cards`
  rows unless `append` is set (a silent mixed-deck import is the failure
  this prevents).
- Per-row failures: on a batch error the chunk re-runs statement-by-statement
  so one bad row does not lose the chunk; failures are reported with
  table + row id (default aborts on first failure; `maxErrors` collects).
- Non-core tables (site-custom/deck tables) are skipped with a count in
  `skippedTables` — nothing silently vanishes.

### What the importer does to card data (data-faithful contract)

- **id preservation**: every row lands with its source id (AUTOINCREMENT
  counters follow the explicit ids; ids are never reused, matching the
  InnoDB contract the DDL encodes).
- **trash handling**: `trash=1` rows import as-is, no filtering anywhere
  — the fetch layer's `lookInTrash` and the Lexicon's by-id reads depend
  on them being present.
- **junctions**: `left_id`/`right_id` land untouched. That IS the Lexicon
  reconstruction state — `src/card/fetch/lexicon.ts` composes compound
  names from these columns at read time; nothing to precompute.
- **name/key columns** per the fetch layer's rules
  (src/card/fetch/card-record.ts): simple cards (left_id NULL) get their
  name/key composed FROM the columns, compound cards through the Lexicon
  walk (post-2020 rows carry NULL name/key columns by convention and must
  stay NULL). The importer therefore copies columns as-is, with exactly
  one repair: a SIMPLE row (left_id NULL) whose key column is NULL but
  name is present gets `key = deriveKey(name)` when a deriver hook is
  supplied. The CLI supplies no deriver (it counts such rows into
  `keyRepair.nullSimpleKeys` and reports them — no guessing); tests and
  engine deployments supply the real `DeckoName.parse(name).key` from
  src/card/name.ts (single source of the name algebra; the tool never
  reimplements it).

## Verification (verify.mjs) and the engine bridge

Verification has two layers:

1. **SQL-level (always)**: per-table count parity; order-independent
   per-table checksums (sum of per-row FNV-1a over a canonical
   serialization) computed over the source stream at import time and
   re-computed over the target via keyset pagination (portable to
   D1/libsql, bounded memory); id extremes; junction-walk sampling
   (compound cards resolved by walking left/right ids in SQL,
   depth-capped so a junction cycle surfaces as unresolved, not a hang).
2. **Engine-level (optional)**: the bridge imports the REAL
   FetchEngine/RenderEngine and (a) resolves sampled junctions through
   the Lexicon, (b) spot-renders N random cards (content + title views),
   recording sha256 + byte length and a `contentContained` structural
   check, (c) byte-compares against `fixtures/captured/smoke.json` when
   the migrated deck contains the oracle fixture cards (arbitrary decks
   report `cardsPresent: 0` honestly).

Runtime matrix for the bridge (the one TypeScript seam): under vitest,
vite resolves its explicit `.ts` specifiers into src/ — everything loads.
Under bare node, loading fails at src's internal `.js` specifiers (node
does not rewrite `.js` → `.ts`), the CLI catches the rejection and runs
the engine checks through the repo's vitest runner instead
(`--engine-verify` spawns `tests/migrate/cli-engine-verification.test.ts`
with env-configured paths). So `--verify` alone always works; engine
verification needs the repo checkout (which the migration tool already
requires for the DDL and engine).

### The report is content-free by construction (DATA RULE)

The JSON report carries ids, counts, hashes, booleans, timings, and the
repo's own synthetic fixture names — never migrated card names, content,
or rendered HTML. `tests/migrate/verify.test.ts` audits this by asserting
known synthetic markers do not appear in the serialized report. Warnings
are built from table/shape metadata only; per-row error messages are
SQLite constraint texts truncated to 300 chars (they name constraints,
not values).

## What migrates vs. what does not (honest list)

**Migrates**: all 12 core-table row sets found in a standard dump —
cards, card_acts, card_actions, card_changes, card_references,
card_revisions, card_virtuals, delayed_jobs, sessions,
schema_migrations, ar_internal_metadata, transform_migrations — with
ids, trash state, junctions, history trails, and read-rule references
preserved. Any additional site-custom tables are skipped AND counted in
the report (standard dumps carry none — verified in docs/schema-notes.md).

**Explicitly out of scope** (also embedded in every report as
`outOfScope`):

- **attachments/files** — uploaded files live on disk/object storage,
  never inside a mysqldump; re-attach separately.
- **user credentials/accounts** — modern decko has no users table (the
  2014 transform migration turned user data into cards); account cards
  import as data, but login/password behavior belongs to a future
  decko-ts account layer.
- **rails sessions** — `sessions` rows import as-is but are inert (no
  Rails session store in decko-ts).
- **background jobs** — `delayed_jobs` imports for id fidelity but is
  stale queue state, not source of truth.
- **ruby code assets** — set modules, HAML views, mods are code, not
  data; behavior parity is the mod-layer stream's job.
- **search/caches** — `card_virtuals` is a materialized cache; imported
  only for fidelity, treat as stale.

## Test suite (tests/migrate — synthetic only)

28 tests: parser grammar + feed-size invariance + adversarial strings +
truncation tolerance (9); importer id/trash/junction preservation, key
repair through the real DeckoName, fresh-target guard, per-row error
isolation, DDL-derived column order (7); full round-trip through
FetchEngine/RenderEngine/CQL (5); verification parity/tampering/
content-free audit (3); CLI end-to-end spawn incl. refusal of an
occupied target (2); 1M-row streaming bounded-memory proof (1); plus the
env-gated CLI engine-verification entry (skipped in the normal suite).

The streaming test generates a ~90 MB, 1,000,000-row dump (written in
batches, so generation is also bounded), parses it (asserting the parser
retained-buffer high-water mark stays under 8 MB of characters — far
below one INSERT line, ruling out whole-line accumulation), imports it,
and asserts heap growth stays under 150 MB (a row-accumulating
implementation at 1M rows would exceed 200 MB) with full count parity
and a spot-row check. Wall time ~30 s in-suite.

## Known limits / honest gaps

- Byte-length buffer accounting is in CHARACTERS (post-UTF-8-decode),
  not bytes; the memory bound argument holds up to the 4× UTF-8
  expansion factor.
- Order-independence of checksums means two swapped rows are not
  detected by checksums alone (counts + id extremes cover the realistic
  failure shapes; row-level diffing is out of scope for a parity check).
- `--engine-verify` requires the repo checkout + vitest (by design — the
  engine is TypeScript; see the runtime matrix above).
- Dump-side grammar is mysqldump-shaped (uppercase `INSERT INTO ... VALUES`,
  backslash or doubled-quote escapes). A dump produced with exotic
  settings (e.g. `--hex-blob`) would need the introducer handling
  extended; the parser errors loudly on anything it cannot place rather
  than guessing.
- Timestamps are carried as dump text (canonical `YYYY-MM-DD HH:MM:SS`
  family) — the DDL's documented TEXT datetime form; no conversion.
- Sessions/ar_internal_metadata/schema_migrations rows land in the
  target but decko-ts does not consume them (inert, listed above).
