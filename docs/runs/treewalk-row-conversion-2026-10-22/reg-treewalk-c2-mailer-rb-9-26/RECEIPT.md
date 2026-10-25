# reg-treewalk-c2-mailer-rb-9-26

- Ruby's file set: `card-1.110.0/lib/card/mailer.rb`
- The row's own label: `mailer.rb:9-26`
- 1 Ruby file(s), 2 def(s).
- PORTED 1 / PORTED-INLINE 1 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries both of the row's defs by citation. new_mail is the port's renderMail and transport envelope (src/card/notify/mail.ts, whose header cites card-1.110.0 lib/card/mailer.rb:9-16), and defaults_from_config is the port's defaultsFromConfig (src/card/notify/mail.ts), the same normalization Ruby's body runs over Card.config.email_defaults: an absent config answers only the utf-8 charset, return_path falls back to from only when from is set, an explicit return_path or charset is kept, and keys the method does not name pass through (mailer.rb:18-23). The pinned bytes were executed for the row's probes, and each config shape is pinned port-side (tests/card/notify/mail.test.ts).

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
