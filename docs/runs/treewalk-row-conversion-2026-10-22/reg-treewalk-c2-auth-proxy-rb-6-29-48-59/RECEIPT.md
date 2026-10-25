# reg-treewalk-c2-auth-proxy-rb-6-29-48-59

- Ruby's file set: `card-1.110.0/lib/card/auth/proxy.rb`
- The row's own label: `auth/proxy.rb:6-29, 48-59`
- 1 Ruby file(s), 6 def(s).
- PORTED 0 / PORTED-INLINE 4 / NAMED-COLLAPSE 2 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries four of the row's six defs by citation and names the two save/restore defs as collapses in its own source. `as` and `as_bot` (proxy.rb:5-24) collapse into "pass a different actor object", because the actions layer takes an explicit actor parameter, and `as_id` and `as_card` are the port's own actor resolution (src/card/actions/card-action-engine.ts). The two defs the port does not carry are named in the port's own words (src/card/auth/actor.ts): `with` (proxy.rb:48-59) and `temporarily` (proxy.rb:63-76) both save and restore a process-global current_id around the block, and the port has no process-global to save, so a block that runs as another actor is written as a call that takes the actor its caller passes. The rig measures both defs as NAMED-COLLAPSE against that statement. The pinned bytes were executed to confirm the two methods' shapes: `with` needs its argument and resolves it through Card.id, and `temporarily` reads the current_id it saves.

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
