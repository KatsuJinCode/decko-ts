# reg-mods-1

- The pinned Ruby gem: `card-mod-account-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-account (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-account.ts`.
- The declaration census at this tree: 23 gem set files, 24 gem view names,
  31 gem event names, every set file registered port-side, and 2 names left
  open, each one named with its reason.

## Verdict: WORKING ON IT

The port does not carry the two account event bodies, and the dispatch
would ignore them if it did. Ruby's `password_redirect`
(`set/right/account/events.rb:26-28`) appends `{ id: name, view: "edit" }`
to the Success object the controller reads after the save, and Ruby's
`signout_upon_delete` (`set/right/account/events.rb:49-51`) calls
`Self::Signin.signout`, which clears the rack session. The port declares
both events with no body at all
(`src/card/mod-loader/mods/card-mod-account.ts:1459-1464` and
`1493-1498`), and the port's event dispatch awaits the body and binds its
result to nothing (`src/card/mod-loader/mod-event-dispatch.ts:870`), so
only the port's abort THROW unwinds a save. The port's own recorded
outcome for the second one is written down in the write path: the session
survives the account close (`src/server/write-routes.ts:2304-2309`).

## Close (port/regfix-1-20261025, 2026-10-25)

The row closed. Both events now carry their Ruby bodies, and the
dispatcher applies a body's return value the way Ruby applies the body's
env mutations:

- `password_redirect` returns `{ successAppend: { id: card.name,
  view: "edit" } }` - the port of `success << { id: name, view: "edit" }`
  (env/success.rb:44-49 `apply`). The dispatcher folds the value into the
  stage report (`bodyOutcomes`), the engine folds the act's reports into
  the ActionResult (`takeActEnvOutcomes`, the request-scoped bag the
  outermost entry resets and reads), and the write route merges the append
  OVER the request's own success envelope before its answer ladder reads
  it - the controller's post-save read, with the appended keys overriding
  the envelope's because Ruby applies the body's hash onto the
  params-built Success.
- `signout_upon_delete` returns `{ signout: true }` - the port of
  `Self::Signin.signout` (signin.rb:19-23 `Auth.signin AnonymousID;
  Env.reset_session`). The route revokes the request's session token (the
  port's anonymous degradation, session-store.ts), drops the visitor bag,
  and answers with the cleared session cookie - the same pair its own
  signout arm applies. The route comment that recorded the opposite
  outcome (the session surviving the close) is superseded.
- The `password_redirect?` predicate now reads the real `+password`
  content: the account mod's state source
  (mod-event-state-sources.ts) populates the `card_accessor :password`
  child content (right/account.rb:4) fresh off the saving row, replacing
  the absent-field read that answered blank for every deck.

The pinned instrument changed shape with the row, as its own header
directed: the gap pins became the behavior pins
(`tests/card/mod-loader/register-row-1-card-mod-account-event-bodies.test.ts`),
and the old file keeps the inverse assertion
(`register-row-1-card-mod-account-bodyless-events.test.ts`: the events are
bodyless no longer). The row's fixture carries the DONE verdict and an
empty gap, with the close note.

The battery at the close commit:

    ./node_modules/.bin/vitest run \
      tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts \
      tests/card/mod-loader/register-row-1-card-mod-account-bodyless-events.test.ts \
      tests/card/mod-loader/register-row-1-card-mod-account-event-bodies.test.ts
      3 files passed, 43 tests passed.

plus `tsc --noEmit` clean and the full correctness battery holding its
known failure set (the battery line rides the lane's run report).

## The names the row leaves open

| name | kind | reason |
| --- | --- | --- |
| `send_` | event | the gem's interpolated event name `event :"send_#{email}"` (`set/right/account/events.rb:33`) read literally; the port registers the three concrete names `send_password_reset_email`, `send_verification_email` and `send_welcome_email` |
| `title` | view | the engine's own view table registers it (`src/card/render/views.ts`) |

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-1-card-mod-account-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 1's block).
- The named instrument that pins this row's two mechanisms:
  `tests/card/mod-loader/register-row-1-card-mod-account-bodyless-events.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run \
      tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts \
      tests/card/mod-loader/register-row-1-card-mod-account-bodyless-events.test.ts
      2 files passed, 8 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
