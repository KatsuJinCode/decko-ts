# reg-treewalk-c2-mailer-rb-9-26

- Ruby's file set: `card-1.110.0/lib/card/mailer.rb`
- The row's own label: `mailer.rb:9-26`
- 1 Ruby file(s), 2 def(s).
- PORTED 0 / PORTED-INLINE 1 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 1.

## Verdict: WORKING ON IT

The port does not carry 1 of the row's defs: The port builds its mail headers in renderMail and its envelope in the transport, so the three defaults Ruby holds in ONE method are split across two port functions: the row's def is defaults_from_config, and the port cites only its charset half (src/card/notify/mail.ts:202).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `defaults_from_config` | mailer.rb:18 | public | unreachable |

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
