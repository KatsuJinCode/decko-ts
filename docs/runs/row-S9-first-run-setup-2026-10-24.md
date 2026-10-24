# S9: the first-run setup of the first admin account

The roster row `S9` (group session, the [Family] capability family) reads
"First-run setup of the first admin account", sourced from `cucumber setup
'Shark visits site for first time'` and `cypress user/setup_spec`. It was
`out_of_scope`, with the recorded reason "one-time setup of a fresh deck".
This receipt is the family's own adjudication of that row: the pinned
Ruby's own bytes for the contract, the port's own bytes beside them, and
the measured reason the row cannot be closed by a run of this family.

## What the row is

A brand new deck has no user account at all, so it has to offer one way to
become an administrator, once, before anything else works. The row is that
first-run setup.

## The oracle

THE SETUP SURFACE IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The capture reads the pinned gemset and writes nothing but its own
fixture:

    GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
      ruby tests/card/mod-loader/oracle-capture-first-run-setup.rb

    wrote C:/localProjects/decko-ts-capability-round7-20261024/fixtures/captured/first-run-setup.json

Two pinned files own the contract:

1. card-1.110.0 lib/card/auth/setup.rb owns THE CENSUS. `needs_setup?` is
   true until the deck carries a user account; `needs_setup_if_no_accounts`
   is `user_account_count.zero?`; `user_account_cql` selects the accounts
   that are NOT the shipped ones (`creator_id <> Card::DeckoBotID`); and
   `user_account_count` counts them with `Card.count_by_cql cql`.

2. card-mod-account-0.20.0 set/type/user.rb owns THE SETUP SURFACE and THE
   EVENTS. The `:setup` view is gated on `perms: :needs_setup?`, its title
   is "Your deck is ready to go!", its button is "Set up", and the form
   posts the `check_setup` trigger with `success: { redirect: true, mark:
   path(mark: "") }`. Then `check_setup` is `abort :failure unless
   Auth.needs_setup?`, `setup_first_user` grants the first user the three
   roles in `basket[:roles_for_first_user] = %i[help_desk shark
   administrator]`, and `signin_after_setup` is `Auth.signin id`.

The capture keeps the owners' bytes, their line ranges and their files'
SHA-256 digests in fixtures/captured/first-run-setup.json. It carries no
timestamp, so a re-run is byte-stable.

## The port

THE PORT CARRIES THE SAME CONTRACT, SO THE PORT IS NOT THE GAP:

- the census, in src/card/auth/first-run-setup.ts (`countUserAccounts`,
  which counts the account rows that are not the shipped holders, and
  `setupWindowState`, which reports the one reason every caller acts on);
- the setup surface, in src/server/first-run-routes.ts, with Ruby's own
  title ("Your deck is ready to go!") and button ("Set up");
- the three first-user roles, in the port's own bytes.

tests/card/mod-loader/card-mod-first-run-setup.test.ts (13 checks) pins all
of it.

## Why the row stays out of scope, measured rather than asserted

THE DECK THIS FAMILY EXERCISES IS ALREADY SET UP. The harness seeds two
accounts of its own into the deck copy it drives
(tools/edge-signed-in-exercise/lib/seed-local-accounts.mjs, "Harness Admin"
and "Harness Member"), so the census over that deck is not zero, Ruby's own
gate closes the setup surface there, and no signed-in run of this family can
reach it.

The roster's grader returns an out_of_scope row UNCHANGED
(tools/edge-signed-in-exercise/lib/local-policy.mjs `verifiedCapabilities`),
so no result can credit this row either. The pin asserts both facts, so the
row cannot drift into a permanently red row and hide a real cause behind a
failing test. That is why this row is named rather than closed: the
capability is real, the port carries it, and the exercise cannot reach it.

## What this receipt does NOT claim

- The setup journey itself is not exercised by this family and is not
  claimed here.
- The port's own first-run journey is covered by the repository's own
  suites (tests/card/auth/first-run-setup.test.ts and
  tests/card/auth/first-run-setup-endpoint.test.ts) over a disposable corpus
  deck, which is a different deck from the one this family drives.
- Nothing here touches a live deck, a live edge or any deployment.
