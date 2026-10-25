# reg-treewalk-d1

- Ruby's file set: `card-1.110.0/config/ (32) + db/ (4)`
- The row's own label: Rails env config, core-extension initializers, locale catalogs, schema.rb
- 30 Ruby file(s), 62 def(s).
- PORTED 20 / PORTED-INLINE 3 / NAMED-COLLAPSE 28 / SKIP 10 / INERT-API 1 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port is not Rails and has no monkey patches, and the port's own source names where each core extension and patch went: the ActiveRecord batching patch collapses into the chunked-row reads (src/server/chunked-row-reads.ts), the better_errors tmp-frame patch collapses to absence because the port generates no tmp set files (src/server/server-error-debugger-arm.ts), the Kaminari URL patch collapses into the paging module's own link composition (src/card/render/search-paging.ts), the callback-condition patch collapses into the event dispatcher's own condition walk (src/card/mod-loader/mod-event-dispatch.ts), the I18n demarcation hook collapses to the identity path (src/card/i18n/i18n.ts), the Hash nested-write patch collapses to absence with its one runtime caller named - the board view the port's own card-mod-edit file lists as not ported (src/card/mod-loader/mods/card-mod-edit.ts) - and the Hash, Module, Kernel and Object extensions collapse into the port's Map registries and typed records (src/card/mod-loader/mod-registrar.ts). The pinned bytes were executed for the row's probes.

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
