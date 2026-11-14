# Activation current user and permission proxy

The canonical Ruby 3.3 supplemental signup capture leaves three card stamps
different from the 7bac96cd Bunny capture: the generated holder and status
are updated by the newly signed-in holder, while the account root is
updated by Anonymous (fixture ID 201). This is not the administrator's ID.
The act/actions/changes/reference counts already matched; no output was
normalized to hide the three differences.

Stock source establishes the lifecycle:

- `card-mod-account-0.20.0/set/right/account/views.rb:2-4` builds the verify
  token URL with `anonymous: true`.
- `card-1.110.0/lib/card/auth/token.rb:38-40` authenticates that token as
  Anonymous before the card's event runs.
- `card-mod-account-0.20.0/set/all/account.rb:20-23` stamps cards in
  `prepare_to_validate` using `Auth.current_id`.
- `right/account/events.rb:19-24,87-92` signs in the holder, enters bot
  permissions, and generates status/holder activation subcards.
- `card-1.110.0/lib/card/auth/proxy.rb:7-24` changes `as_id`, retaining an
  established `current_id`. Bot permissions do not imply bot stamps.
- `card-mod-history-0.20.0/lib/card/act.rb:132-134` attributes the act to
  `Auth.current_id` at act save.

The engine now carries the current stamp actor independently from the
permission actor, plus the root's earlier prepare-stage stamper. Existing
callers retain their prior defaults. The same real account-root transaction
updates generated status and User type; no follow-up SQL correction or
outer transaction is introduced. A no-change root's existing director touch
uses its prepare-stage stamp. Generated children and ancestor timestamps use
the current user.

The actual verification-mail composer also omitted `anonymous: true` even
though the manually constructed token unit test included it. The composer
now emits the stock claim. The real HTTP regression decodes the delivered
token and checks that claim before following the actual link, then checks
holder/status/account stamps, User type, act attribution, fresh login,
missing-transport refusal, and invalid-token nonmutation. History tests
separately check root and generated-card stamps in one act. The preexisting
Ruby capture is reused; no fresh Ruby process is needed for these controls.

Private original evidence remains at
`tmp/journey-complete-ruby33-2dd8b2d8/ruby` and
`tmp/journey-bunny-integrated-7bac96cd/bunny-local`. The latter completed all
six flows but remains strict-red on asset failures, error text, mail, and
these stamps. The earlier ad428/e274 captures are preserved too. A scoped
HTTP/source repair does not retroactively make any browser capture green.
