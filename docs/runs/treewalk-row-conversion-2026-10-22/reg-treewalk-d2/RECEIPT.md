# reg-treewalk-d2

- Ruby's file set: `card-1.110.0/bin/card + lib/cardio.rb + lib/cardio/ (55)`
- The row's own label: the Rails host: railtie, app class, CLI, commands, migrations, load strategies, sow/eat, seed, utils
- 56 Ruby file(s), 293 def(s).
- PORTED 36 / PORTED-INLINE 65 / NAMED-COLLAPSE 140 / SKIP 49 / INERT-API 3 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port is not Rails and has no cardio host, and the port's own source names where each host def went: the set-loader machinery collapses into the mod loader's manifest-driven phases and the wasm route for unported Ruby mods (src/card/mod-loader.ts, with src/card/mod-loader/ruby-mod/ruby-mod-source.ts), the seed, dump and cleanup machinery collapses into the boot seed and the engine's delete path (src/card/auth/boot-seed.ts), the migration bookkeeping collapses into the folded schema and the deploy ledger (src/server/schema.ts), and the Rails CLI layer collapses to absence because the port's runtime is its own worker and server (src/server/first-run-routes.ts). The pinned bytes were executed for the row's probes.

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
