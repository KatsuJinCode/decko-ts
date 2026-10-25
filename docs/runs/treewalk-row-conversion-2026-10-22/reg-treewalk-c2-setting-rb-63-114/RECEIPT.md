# reg-treewalk-c2-setting-rb-63-114

- Ruby's file set: `card-1.110.0/lib/card/setting.rb`
- The row's own label: `setting.rb:63-114`
- 1 Ruby file(s), 12 def(s).
- PORTED 1 / PORTED-INLINE 8 / NAMED-COLLAPSE 3 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries the setting registry and names the three option helpers behind register_setting in its own source (src/card/mod-loader/mod-registrar.ts, the SettingRegistry block): the option-fill helper (setting.rb:87-89 standard_setting_opts) collapses into register's literal field initialization (the typed RegisteredSetting members, with the one proc the schema does not carry named where the deck's one proc-carrying registration lives, src/card/mod-loader/mods/card-mod-list.ts); the type-restriction store (setting.rb:91-93 restrict_setting_to_type) collapses into the restrictedToType codename-string field with the prototype type resolved when the settings render (src/card/render/views.ts, visibleSettingsForGroup); and the registration-time id set (setting.rb:116-119 permitted_type_ids) collapses into that same query-time resolution. The pinned bytes were executed for the row's probes.

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
