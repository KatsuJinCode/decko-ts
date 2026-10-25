# reg-treewalk-e1

- Ruby's file set: `card-1.110.0/mod/core/set/ (25)`
- The row's own label: the core mod's 25 set modules
- 24 Ruby file(s), 169 def(s).
- PORTED 53 / PORTED-INLINE 71 / NAMED-COLLAPSE 38 / SKIP 7 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries the core mod by a different mechanism and names where each def went: the write-path set modules are named in the action engine (src/card/actions/card-action-engine.ts, the core-mod block - the assignment family, the new-args normalizers, the autoname condition, the abort block, the state and subcard guards, the trash copies and the type resolvers, each collapsing into the engine's create-or-update resolution, typed inputs, posted-tree walk, set_autoname carry, event walk and delete path), and the admin-config and mod-card surface is named in the core admin runtime (src/card/mod-loader/mods/core-admin-runtime.ts, the admin block - collapsing into the ADMIN_CONFIG transcription, the mod-asset tables, the permission layer and MOD_SPECS). The pinned bytes were executed for the row's probes.

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
