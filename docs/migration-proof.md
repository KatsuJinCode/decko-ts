# Migration proof on a 49,829-card deck

Measured 2026-10-14 on Windows 11, Node 24.19.0, Miniflare
5.20261006.1-alpha, with `tools/migrate/prove-deck-migration.mjs`. The deck
is a private captured deck (49,829 cards, 47,235 of them not trashed). It is
not redistributed; only aggregate figures are recorded here.

Reproduce:

```
node tools/migrate/prove-deck-migration.mjs --deck <deck.sqlite> --work <scratch-dir> [--summary <file.json>]
```

The script copies the deck into the scratch directory (sha256 checked),
imports it with `import-deck.mjs --dedup` at the 500-row / 1 MiB chunk
recipe, lands the chunks in a D1 database inside a local Miniflare instance,
reads every row back through the D1 binding, compares each `cards` and
`card_references` row column by column against the source, renders every
non-trashed card through the port's RenderEngine, and deletes the scratch
directory.

## Figures

| Step | Result |
|---|---|
| Rows imported | 606,355 (49,829 cards + 556,526 references) |
| Chunks | 1,275 |
| Import (ingest + chunk + validate) | 75.5 s |
| D1 schema + apply all chunks | 19.3 s |
| Row verification, both stores | 19.0 s |
| Cards present in staging SQLite / D1 | 49,829 / 49,829 (0 missing) |
| References present in staging SQLite / D1 | 556,526 / 556,526 (0 missing) |
| Reference rows differing from source | 0 in SQLite, 0 in D1 |
| Card rows differing from source | 1,046 in SQLite, the same 1,046 in D1 |
| File and image cards | 1,350 |

The 1,046 differing card rows fall in exactly two columns:

- `references_expired`, 1,037 rows: the source stores the value as TEXT; the
  target column is INTEGER (Ruby's MySQL column is `int`), so SQLite stores
  the same number as an integer. The verifier compares storage class as well
  as value, so these count as differences.
- `key`, 9 rows: the source holds nine pairs of keys that differ only in
  ASCII letter case. The target's `cards_key_index` is COLLATE NOCASE, as
  Ruby's `utf8mb3_unicode_ci` index is, so the second key of each pair is
  set to NULL by the importer's documented collision policy.

The source also carries 20 cards whose `left_id` names no card; they are
carried over unchanged.

## Rendering: not yet proven on this deck

All 47,235 non-trashed cards were rendered through the `content` view:
0 rendered, 47,097 raised "card not found", 138 had no composable name.
Render time was 322 s.

The cause is in the deck, not in the migration: the port finds cards by
key, and in this deck 5,508 of the 9,739 simple cards store a `key` that is
not the key Ruby's name algorithm derives from the card's name (649 of them
differ only in letter case). Lookups by name therefore miss.

No byte comparison against the Ruby oracle was possible: the locally held
oracle captures are of a different deck.

## What remains

Rendering this deck needs its keys rebuilt from names with the port's name
algorithm (`deriveKeyWithEngine`), which is what Ruby stores for every card.
That is a deliberate change to source data, so it is recorded here rather
than applied.
