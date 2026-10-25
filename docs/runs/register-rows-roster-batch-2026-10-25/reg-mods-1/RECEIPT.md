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
