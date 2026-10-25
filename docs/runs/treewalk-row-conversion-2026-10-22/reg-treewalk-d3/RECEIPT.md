# reg-treewalk-d3

- Ruby's file set: `card-1.110.0/lib/generators/ (51)`
- The row's own label: Rails generators for a new deck, mod, set, migration + the deck templates scaffold
- 7 Ruby file(s), 39 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 31 / SKIP 8 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port is not Rails and has no generator, and the port's provisioning surface names where each generator def went (src/server/first-run-routes.ts, the generator-surface block): the install menu collapses to absence because the port provisions a deck through the first-run journey plus the boot seed; the deck generator's step methods collapse to absence because there is no Rails app to scaffold; the migration generator collapses into the deploy migrations (src/server/deploy-migrations.ts); and the mod and set generators collapse to absence because the port's mods and set modules are read from the deck corpus, not scaffolded. The pinned bytes were executed for the row's probes.

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
