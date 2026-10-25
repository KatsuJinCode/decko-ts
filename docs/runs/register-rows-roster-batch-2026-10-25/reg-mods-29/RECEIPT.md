# reg-mods-29

- The pinned Ruby gem: `card-mod-session-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-session (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-session.ts`.
- The declaration census at this tree: 2 gem set files, 0 gem view names
  and 4 gem event names, every set file and every event name registered
  port-side, with nothing left open. The row's gap is a BEHAVIOUR gap, not
  a registration gap.

## Verdict: WORKING ON IT

The `delete_in_session` event body is a declared stub and the write path
carries no session-card delete arm, so deleting a Session card does not
clear the visitor's session content the way Ruby's `session_content = nil`
plus `abort :success` does, and for a Session card that HAS a row the
ordinary delete leg trashes the row and leaves the content, where Ruby's
abort unwinds the trash and clears the content.

Ruby's body (`card-mod-session-0.20.0 set/type/session.rb:42-45`) is
`self.session_content = nil; abort :success`, and `session_content` is the
VISITOR SESSION's entry for that card (`session.rb:15-19`, the session key
`_card_<key>`), so the body clears the visitor's session and the abort
unwinds the save.

WHAT THE ORACLE SAYS, MEASURED HERE. The recorded Ruby trace
(`reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`,
the step `anon-session-card-delete`) answers the anonymous session-card
delete with 422 and KEEPS the visitor's session content: the card has no
row, so the delete never reaches the event. The port answers the same 422
and keeps the content. So the row's closure must land the body inside the
ENGINE's delete path, after the write-authority check, with the visitor
session in scope. A delete arm that cleared the content before that check
would answer 303 and clear the content where the oracle answers 422 and
keeps it, and the side-effects battery catches the difference: the arm this
lane first landed made the battery's `anon-session-card-delete` step
diverge, and the arm was withdrawn.

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-29-card-mod-session-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 29's block).
- The named instrument that pins the oracle's answer and the port's:
  `tests/server/write-routes-session-card-delete.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/server/write-routes-session-card-delete.test.ts tests/card/mod-loader/card-mod-session.test.ts tests/server/write-routes-session-card.test.ts tests/card/mod-loader/register-rows-roster-batch-inventory.test.ts
      5 files passed, 60 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
