# reg-treewalk-e3

- Ruby's file set: `card-1.110.0/mod/core/data/ (71)`
- The row's own label: 58 migration files, real.yml/test.yml/recode.yml, 7 fixtures
- 47 Ruby file(s), 110 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 53 / SKIP 0 / INERT-API 57 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port never replays the pinned migration history, and its schema module says so in its own source (src/server/schema.ts, the migration-history block): each migration entrypoint collapses into the folded schema (db/schema.sqlite.sql is the history's result, the corpus arrived already migrated, and a fresh provisioned database receives the folded schema from the deploy chain's first migration), the migration-scoped connection collapses into the driver layer, the transform helpers collapse into the corpus and the render layer, and forward schema changes are the deploy migrations' numbered SQL files (src/server/deploy-migrations.ts). The pinned bytes were executed for the row's probes.

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-round1b-20261024` in KatsuJinCode/decko-ts.
