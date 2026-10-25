# reg-dsl-B21: closed on the declared and pinned parity surface

Row: "SQL cosmetics: comment slot, LIMIT double spaces, count( distinct ...),
SELECT DISTINCT with joins, offset only with limit". The register grades the
row DIVERGENT (documented, deliberate) with "the parameterized shape is the
parity surface ... No behavioral difference"; the roster's fix arms are "emit
Ruby's SQL text shape or pin the parameterized form as the declared parity
surface". This landing takes the second arm the rest of the way: the
declaration, which had lost its home, is restored as a decision record and
pinned by a test.

## Why the second arm and not the first

The first arm's literal reading (inline Ruby's quoted literals) is refused on
the mechanism: a CQL statement's values are untrusted input, and interpolating
them into SQL text is the injection vector parameterization exists to close.
That is the destructive class the operator's 2026-10-24 parity ruling carves
out, and the refusal is total. The four spacing shapes are literal text and
could be emitted around placeholders, but the port's canonical text is pinned
across the whole tests/cql/ suite, so a spacing rewrite would move every pin
in the family for no behavioral gain. Decision 0010 records that balance and
what a future lane must do to revisit it.

## What landed

- docs/decisions/0010-cql-sql-text-parity-surface.md: the declaration, with
  each divergence cited to the pinned source
  (card-1.110.0 lib/card/query/sql_statement.rb:44-50, 54-58, 77, 99-107;
  lib/card/query/card_query.rb:41-45; lib/cardio/railtie.rb:26). The record
  corrects the register's shorthand on one point: the comment slot is not a
  statement property; it is generated from the statement's inspect text and
  only when config.sql_comments is on, whose pinned default is OFF, so the
  pinned deck's own SQL text carries no comment either.
- src/cql/sql.ts: the header's dangling citation ("all documented in )" named
  the removed docs/cql-port-notes.md) now cites the decision record, and the
  header's divergence list names the comment slot explicitly.
- tests/cql/sql-text-parity-surface.test.ts: the mechanical pin of the
  declared surface over eleven statement shapes (canonical single-space text,
  no comment slot, placeholders equal params and no inlined string literal,
  the port's coalesce count shape, DISTINCT with the join list, OFFSET only
  with LIMIT).
- docs/decisions/README.md: the index table gains its missing 0009 row and
  the new 0010 row.

## Verification, run in this lane

- npx vitest run tests/cql/sql-text-parity-surface.test.ts: 4 tests passed.
- npx vitest run tests/cql/: 19 files, 319 tests, 0 failed, exit 0.

## Named remainder

The four spacing shapes (comment slot, the LIMIT block's doubled and trailing
spaces, the count field's paren space, the subquery SELECT's depth
indentation) stay un-emitted, each cited in decision 0010; the pin test fails
if any of them appears, which is the signal that the surface moved and the
decision must be revisited in the same landing.
