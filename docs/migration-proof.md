# Migration proof on a 49,829-card deck

Measured 2026-10-14 on Windows 11, Node 24.19.0, Miniflare
5.20261006.1-alpha, with `tools/migrate/prove-deck-migration.mjs`. The deck
is a private captured deck (49,829 cards, 47,235 of them not trashed). It is
not redistributed; only aggregate figures are recorded here.

Reproduce:

```
node tools/migrate/prove-deck-migration.mjs --deck <deck.sqlite> --work <scratch-dir> --rebuild-keys [--summary <file.json>]
```

The script copies the deck into the scratch directory (sha256 checked),
imports it with `import-deck.mjs --dedup --rebuild-keys` at the 500-row /
1 MiB chunk recipe, lands the chunks in a D1 database inside a local
Miniflare instance (then adds the freshness stamp row and its triggers),
reads every row back through the D1 binding, compares each `cards` and
`card_references` row column by column against the source, renders every
non-trashed card through the port's RenderEngine in the `page` and `core`
views, and deletes the scratch directory.

## Rebuilt keys

Ruby stores `Card::Name#key` of the name in every simple card's `key`
column, and both Ruby and the port find cards by that key. In this deck
5,508 of the 9,739 simple cards stored a key that is not the key of their
name (649 of those differ only in letter case), so no card could be found
by name and nothing rendered.

`--rebuild-keys` recomputes the key of every card that stores a name with
the port's name algebra (`src/card/name.ts` under the deck inflection
table, the same function the serving engine uses), before the key
collision policy runs. On this deck:

| | |
|---|---|
| Named (simple) cards examined | 9,739 |
| Keys changed | 5,508 (649 in letter case only) |
| Keys set to NULL by the collision policy afterwards | 0 |

Compound cards store NULL name and key, as Ruby's do; the Lexicon composes
them from `left_id` / `right_id`, so they are not touched.

## Row verification

| Step | Result |
|---|---|
| Rows imported | 606,355 (49,829 cards + 556,526 references) |
| Chunks | 1,275 |
| Cards present in staging SQLite / D1 | 49,829 / 49,829 (0 missing) |
| References present in staging SQLite / D1 | 556,526 / 556,526 (0 missing) |
| Reference rows differing from source | 0 in SQLite, 0 in D1 |
| Card rows differing from source | 0 in SQLite, 0 in D1 |
| Card keys rebuilt (counted apart from differences) | 5,508 in SQLite, 5,508 in D1 |
| File and image cards | 1,350 |

Each source value is compared after it is given the target column's
declared type affinity, as SQLite does on insert. This matters for
`references_expired`: 1,037 source rows store it as TEXT, the target column
is INTEGER (Ruby's MySQL column is `int`), and the stored value is the same
integer. A key cell counts as rebuilt only when the target holds exactly the
key the verifier recomputes from the source name.

The nine case-only key pairs that the collision policy had to resolve
without `--rebuild-keys` no longer collide once keys are derived from names.

The source also carries 20 cards whose `left_id` names no card; they are
carried over unchanged.

## Rendering

All 47,235 non-trashed cards were attempted. 9 have no composable name
(a part is missing from the deck) and were not rendered.

| View | Rendered | Errors | Error classes | Bytes |
|---|---|---|---|---|
| `page` | 47,204 | 22 | `UnsupportedViewError` 10, `Date::Error` 7, `UnknownLayoutError` 5 | 733,246,401 |
| `core` | 47,217 | 9 | `Date::Error` 7, `NoMethodError` 1, `Error` 1 | 108,675,088 |

Every error class above is the port's reproduction of a raise Ruby makes on
the same input, with Ruby's class name and message:

- `Date::Error`: a Date-type card whose content is not a parseable date
  (Ruby's `Date.parse`).
- `UnsupportedViewError`: Ruby's `Card::Error::UserError` for a view the
  card's set does not support.
- `UnknownLayoutError`: a layout rule that names a layout card the deck
  does not hold (Ruby's `Card::Error::UserError`).
- `NoMethodError`: a card whose content is a layout template, rendered
  outside a page (`main.rendered` on nil in Ruby's nesting code).
- `Error` ("card not found"): a live compound card whose left side is a
  simple row (no `left_id`) with a `+` in its name. Its composed name
  parses as a three-part name, and Ruby's `Lexicon#lex_to_id` resolves a
  compound name through `(left_id, right_id)` pairs, which the deck does
  not hold for this one. The deck has 23 such simple rows.

Live compound cards with a trashed part (43 in this deck) all render in
both views.

None of these was a port defect, so no change to `src/` was made; the
byte-identity grade on the synthetic-v1 corpus cannot have moved from
1754/2389/16/19/8/12.

The importer's own validation report says `allChecksPass: false`; the
only failing check is the 20 source cards whose `left_id` names no card.

No byte comparison against the Ruby oracle was possible: the locally held
oracle captures are of a different deck. These figures show that every card
renders or raises one of the port's reproductions of a Ruby raise; the
attribution of each raise above comes from reading the port and the Ruby
source, not from running Ruby on this deck, and none of it shows the bytes
equal Ruby's.

## Timings

| Step | Time |
|---|---|
| Import (ingest + rebuild keys + chunk + validate) | 45.0 s |
| D1 schema + apply all chunks + stamp | 17.6 s |
| Row verification, both stores | 15.8 s |
| Render, both views | 1,383.4 s (page 996.9 s, core 372.1 s) |

Two complete runs gave identical row and render figures, rendered bytes
included; the timings are from the second.
