# reg-mods-29

- The pinned Ruby gem: `card-mod-session-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-session (DONE)`.
- The port file: `src/card/mod-loader/mods/card-mod-session.ts`.
- The declaration census at this tree: 2 gem set files, 0 gem view names
  and 4 gem event names, every set file and every event name registered
  port-side, with nothing left open.

## Verdict: DONE

Ruby's body (`card-mod-session-0.20.0 set/type/session.rb:42-45`) is
`self.session_content = nil; abort :success`, and `session_content` is the
VISITOR SESSION's entry for that card (`session.rb:15-19`, the session key
`_card_<key>`), so the body clears the visitor's session and the abort
unwinds the save.

THE CLOSED MECHANISM. The body is the ENGINE's delete path's own
(`src/card/actions/card-action-engine.ts`, `deleteCardInner`): after the
write-authority check (`assertCanWrite(card, "delete")`, the port of
`ok_to_delete?`) and after every `:validate`-stage guard, at the delete
save's `prepare_to_store` seat and before the row write, a Session-typed
card's delete clears the visitor session's content for the card
(`src/card/session/visitor-session.ts` `storeSessionCardContent`, the port
of `session_content=`) and ends the save with the port's success abort
(`ModEventAbortSuccess`, `src/card/actions/types.ts`), which `deleteCard`
answers with the no-write success result, the session-type create arm's
shape. The write route hands the dispatch's visitor session in
(`src/server/write-routes.ts`, the delete leg's
`DeleteCardInput.visitorSession`), so the visitor session is in scope at
the body, and the mutated state reaches the response through the visitor
cookie the dispatch already serializes. The event's declaration is
engine-owned (`card-mod-session.ts`, `engineOwned: true`, the
`store_in_session` shape).

THE ORACLE BOUNDARY THE ARM HONORS. The recorded Ruby trace
(`reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`,
the step `anon-session-card-delete`) answers the anonymous session-card
delete with 422 and KEEPS the visitor's session content: the card has no
row, so the delete never reaches the event. The engine arm sits after the
route's live-row lookup by construction: the route calls
`engine.deleteCard` only for a card that HAS a row, so the oracle's step
still answers 422 with the content kept. A delete arm that cleared the
content before that check answered 303 and cleared the content where the
oracle answers 422 and keeps it; the side-effects battery caught the
difference and that arm was withdrawn (the row's earlier state on the
roster-batch branch). For a Session card that HAS a row, the abort
unwinds the delete: the row stays live, no action rows are written, and
the content goes, which is what Ruby's abort produces.

THE BOUNDARY NAMED, HONESTLY. The port's delete success answer still runs
the route-side `:finalize` arms (the location discard,
`discard_deleted_locations`' port), which Ruby's aborted save never
reaches because the abort ends the event cycle. No recorded oracle step
deletes a row-ful Session card, so no instrument measures the difference;
the row's recorded gap (the trash and the content) is closed, and this
sentence is the residual.

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census, now in its closed form:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-29-card-mod-session-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 29's block, the closed form).
- The named instrument that pins the closed behavior against the oracle's
  two legs (the 422 for the card with no row, the engine arm's clear plus
  no-write success for the card with one):
  `tests/server/write-routes-session-card-delete.test.ts`.

The battery at this tree:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/server/write-routes-session-card-delete.test.ts tests/card/mod-loader/card-mod-session.test.ts tests/server/write-routes-session-card.test.ts
      4 files passed, 52 tests passed.

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/server/write-routes-session-card-delete.test.ts tests/card/mod-loader/card-mod-session.test.ts tests/server/write-routes-session-card.test.ts tests/card/mod-loader/register-rows-roster-batch-inventory.test.ts
      5 files passed, 61 tests passed.

The side-effects oracle, step for step
(`node tools/parity-side-effects/ts-drive.mjs` over the committed
synthetic deck, then `node tools/parity-side-effects/compare.mjs` against
`expected/side-effects-ruby.json`):

    SIDE EFFECTS PASS 80 / 87; deliberate differences pinned 7; mismatches 0

The oracle step and the 19 steps after it (the battery's indexes 52 to
71): 19 PASS, and one (`restore-file-revision`, index 59) is one of the 7
pinned deliberate differences. `anon-session-card-delete` PASSes: the
port answers the same 422 and keeps the visitor's session content.

Branch: `port/regfix-4-20261025` in KatsuJinCode/decko-ts, from the
roster-batch tip `5efc8162` (which contains the roll tip
`deploy/full-candidate-20261029` at `c9ab5b33`).
