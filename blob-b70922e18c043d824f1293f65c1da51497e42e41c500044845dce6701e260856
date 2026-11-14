# reg-dsl-B22: closed on the reproduced quirk

Row: `Card::Content`/query family row B22, "name: nil broken-SQL case: Ruby 1.110
emits `c0.key is ()` (Array.wrap collapses the list); port renders `c0.key is
NULL`". Verdict at this landing: the port reproduces the pinned broken SQL, so
the row's first fix arm (render the collapsed empty IN list for a null name
value) is taken and the divergence is gone.

## The mechanism, read in the pinned gemset this session

C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems, card-1.110.0:

- lib/card/query/value.rb:22-23, `parse_value`: a bare nil value parses to
  `["is", nil]`.
- lib/card/query/value.rb:27-31, `standard_sql`: for the name field ONLY,
  `@value = Array.wrap(@value).map { |v| v.to_name.key }`. `Array.wrap(nil)`
  is `[]` (activesupport core_ext/array/wrap.rb:39-41), so the scalar nil
  collapses to an empty list before sqlize sees it. A null inside an array
  (`{ name: ["is", nil] }`) takes no collapse: the raw value there is `[nil]`,
  and `Array.wrap([nil])` keeps the member.
- lib/card/query/value.rb:79-86, `sqlize_array`: an empty list renders `()`,
  a one-element list of a non-list operator renders the bare scalar, and a
  multi-element list joins with `","`.

So Ruby's text for `{ name: nil }` is `c0.key is ()` (invalid SQL; the search
raises), for `{ name: ["is", nil] }` it is `c0.key is NULL` (the size-one
scalar branch), and for `{ name: ["is", nil, nil] }` it is
`c0.key is (NULL,NULL)`. A nil on any other field skips the wrap entirely
(`{ id: nil }` renders `c0.id is NULL` through value.rb:74).

## What landed

`src/cql/parser.ts`: `ParsedValue` carries `nullFromScalar`, set only by the
bare-scalar-null branch of `buildValue`, and `standardizeValues` (the port of
`standard_sql`, already guarded on the name field and the non-match operator
exactly where Ruby's line sits) applies the collapse there. No SQL-generator
change: with the collapsed empty list, the existing list branch renders `()`
by itself. The doc block on `standardizeValues` carries the value.rb cites.

Test pins, `tests/cql/sql-generation.test.ts` (the old `is NULL` pin is
replaced, not deleted):

- `{ name: null }` renders `c0.key is ()`.
- `{ name: ["is", null] }` renders `c0.key is NULL` (no collapse, the
  size-one scalar branch).
- `{ name: ["is", null, null] }` renders `c0.key is (NULL,NULL)`.
- `{ id: null }` still renders `c0.id is NULL` (field-guarded).

## Verification, run in this lane

- `npx vitest run tests/cql/`: 18 files, 315 tests, 0 failed, exit 0.
- The broader battery is recorded in the lane run doc
  (docs/runs/workbatch-a-20261025/README.md).

## Notes for the next reader

- Behavior change, deliberate: a search whose statement carries a bare
  `name: null` now fails with the driver's SQL error, exactly as the pinned
  deck's search does. Nothing in the port's own callers passes a bare null
  name (grep over src/ and tests/ found the pins only).
- The register's entry ("the port declines to reproduce the broken SQL",
  graded "oracle-verified, deliberate") described the state this landing
  replaces; the prior documentation of the decline lived in the removed
  docs/cql-port-notes.md "Known approximations" list (removed with the
  2026-10-07 docs set) and nowhere current, which is part of why the row
  stayed open.
