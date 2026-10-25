# reg-mods-29

- The pinned Ruby gem: `card-mod-session-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-session (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-session.ts`.
- The declaration census at this tree: 2 gem set files, 0 gem view names
  and 4 gem event names, every set file and every event name registered
  port-side, with nothing left open.

## Verdict: DONE

The row's gap is closed: the port's Session-card delete now matches the
pinned gem.

RUBY (`card-mod-session-0.20.0 set/type/session.rb:42-45`):

    event :delete_in_session, :prepare_to_store, on: :delete do
      self.session_content = nil
      abort :success
    end

The body clears the visitor's session content for that card, and the abort
unwinds the delete, so no card row is written: Ruby's delete of a Session
card never trashes a row.

THE PORT. A Session card's content lives in the VISITOR SESSION
(`src/card/session/visitor-session.ts`: `sessionCardContent` /
`storeSessionCardContent`), not in a cards row: the create arm stores it
there and the engine's session-type create writes no row. So the session
content IS the card, and this lane's change makes the write path's delete
leg answer the session-card delete directly
(`src/server/write-routes.ts`, the delete leg): the content is cleared, no
row is touched, and the response is the delete's success response. The
event declaration follows the same shape as the create arm's
(`src/card/mod-loader/mods/card-mod-session.ts`): `delete_in_session` is
engine-owned, because the write route is its body.

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-29-card-mod-session-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 29's block, the closed form: the fixture carries no gap).
- The test that fails without the change:
  `tests/server/write-routes-session-card-delete.test.ts` (the delete
  clears the visitor's session content and writes no row; the control
  says an ordinary delete is still an ordinary delete).

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/server/write-routes-session-card-delete.test.ts tests/card/mod-loader/card-mod-session.test.ts tests/server/write-routes-session-card.test.ts
      4 files passed, 45 tests passed.

The test was checked against the tree WITHOUT the change: the
session-card delete then answers 422 ("no such card") where it now
answers 303, and the control still passes.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
