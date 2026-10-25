# reg-redteam-cfg-email_defaults

- Roster row: family `register-redteam`, label `email_defaults config key`,
  verdict PORTED, bucket DONE.
- The row's sourceParent: `email_defaults (railtie config key) -> PORTED
  (missed)`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1096): `email_defaults | PORTED
  (missed) | src/card/notify/mail.ts:39 (Card.config.email_defaults[:from]
  shaping)`. The register's A-R6 row (line 1076) makes the same key
  "unclaimed (see B-table)".

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

The config key is read in TWO port files, and the honest mapping is: the
port carries the key's SEMANTICS (the configured default From), fed from
the host's configuration channel instead of a Card.config hash:

- `src/card/notify/mail.ts:39-41`: the template field doc names the key
  ("Card 'from' with no per-template override is the deck's
  Card.config.email_defaults[:from], with a 'Name <email>' construction,
  set/type/email_template.rb:55-79"). The key's consumer is
  `resolveFromAddress` (mail.ts:157-186, the port of
  `safe_from_and_reply_to!`, email_config.rb:52-79): its `defaultFrom`
  option (line 167) is the port's name for
  `Card::Mailer.default[:from]`, and line 184 prefers it over the
  template's own address exactly as Ruby's `actual_email` line does.
- `src/card/notify/smtp-transport.ts`: the host-side channel that plays
  `email_defaults` is `DECKO_SMTP_FROM`. The option mapping is at lines
  199-205 (the configured default From wins over the template's address,
  with the template's display name preserved), the env read is
  `smtpOptionsFromEnv` line 605 (`from: env.DECKO_SMTP_FROM`), and the
  module header's "From-default semantics" block (lines 41-49) states the
  mapping on the record: "the config From (DECKO_SMTP_FROM, default
  no-reply@deck.example) is what makes them deliverable" (line 47; the
  default itself is `DEFAULT_FROM` at line 106).

The register's line cite (mail.ts:39) still lands on the same field doc at
this tree. The row's claim is unchanged.

## The original side, read and recorded

- The key's own assignment:
  `card-1.110.0/lib/cardio/railtie.rb:18` `config.email_defaults = nil`.
- The key's reader: `card-1.110.0/lib/card/mailer.rb:19`
  (`(Card.config.email_defaults || {}).symbolize_keys` inside
  `defaults_from_config`, which mailer.rb:11-16 wires into every `new_mail`).
- The mod-side consumer the port mirrors:
  `card-mod-email-0.20.0/set/type/email_template/email_config.rb:61-77`
  (`safe_from_and_reply_to!`, the actual_email construction).

## The prior receipt for this row

None in the repo: the register B table (line 1096) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
