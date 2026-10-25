# reg-treewalk-c2-dirty-rb-dirty-method-factory-rb

- Ruby's file set: `card-1.110.0/lib/card/dirty.rb, dirty/method_factory.rb`
- The row's own label: `dirty.rb`, `dirty/method_factory.rb`
- 2 Ruby file(s), 11 def(s).
- PORTED 1 / PORTED-INLINE 10 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

Closed as the port's own documented collapse: the five defs the 2026-10-22
receipt named are the ActiveRecord change-tracker surface, and the port
carries that surface by the action engine's explicit fields rather than by
card methods over AR. The collapse block lives in the engine's own event-card
builder (src/card/actions/card-action-engine.ts, the `eventCard` doc
comment), a file that cites both of the row's Ruby sources, with one sentence
per def and the mechanism beside each:

- `attribute_before_act` (dirty.rb:23-33) - the engine records each field's
  before-act value explicitly on the dispatched event card
  (`dbContentBeforeAct`, `typeIdBeforeAct`, `nameBeforeAct`; the record sites
  are card-action-engine.ts:4273-4286 and :4753), and the recorded field is
  that def's answer for the saves the engine runs;
- `define_dirty_methods` (method_factory.rb:5-13) - the port defines no
  methods dynamically; the factory's generated per-field surface is the
  explicit field list;
- `attribute_is_changing?` (dirty.rb:40-45) - the engine's `changedFields`
  computation (card-action-engine.ts:4755, `updateChangedFields`);
- `not_in_callback?` (dirty.rb:35-37) - it discriminates ActiveRecord
  callback stages, the engine has no callback stages, so the discriminator
  has nothing to discriminate;
- `dirty_name` (dirty.rb:64-70) - the referer walk composes each
  descendant's before-name from the parts' before-names
  (src/card/actions/update-referer-content.ts, whose header cites
  lib/card/dirty.rb:60-70 and states the composition), which is where the
  port needs the answer.

The row's fixture was regenerated from the pinned bytes after the block
landed (fixtures/captured/card-dirty-methods-ruby-oracle.json, 22 probes,
counts PORTED 1 / PORTED-INLINE 10, GAP 0), the instrument re-run answers
`files=2 defs=11 PORTED=1 INLINE=10 SKIP=0 GAP=0 -> CLOSABLE`, the parity
suite reads 204/204 against the regenerated fixture, tsc is clean on the
touched file, and the engine's own battery (tests/card/actions/, 74 files)
is green but for the five environmental failures of the MySQL-native fixture
group ("Table 'atomic_1.sqlite_master' doesn't exist", the same table error
the v21 roll receipt documents as outside the correctness gate).

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
Close: `port/workbatch-c-20261025`, workbatch-c lane, 2026-10-25.
