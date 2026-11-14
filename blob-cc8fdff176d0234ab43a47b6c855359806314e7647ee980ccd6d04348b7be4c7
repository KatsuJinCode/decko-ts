# reg-evt-mod-account-update-role-cache: the registration carries the plain stub, and the port's own reason says so

The roster row `reg-evt-mod-account-update-role-cache` (family register-events)
reads "event update_role_cache (card-mod-account)", verdict PORTED, bucket DONE.
Its receipt was one line: "verified: the mod event registry carries a real body
(fn:) or an engineOwned registration naming the engine code that owns the body,
at the cited line".

That line overstated what the registry carries. The registration for this event
is a plain declaration with no body and no engine-owned marker, and the port's
own comment at that declaration names the reason. This receipt states exactly
what the evidence shows.

## What the row is

Ruby declares `event :update_role_cache, :finalize` in
card-mod-account-0.20.0/set/type_plus_right/role/members.rb:1-7. The body
refreshes a role-hash cache: `Self::Role.update_rolehash(left.id, item_ids)`
(members.rb:5-7).

## What the port's registration actually carries

src/card/mod-loader/mods/card-mod-account.ts:1923

    events: [event({ event: "update_role_cache", at: "finalize" })],

A plain `event(...)` declaration: Ruby's set membership and metadata (the
finalize stage) and no body. It is not an `engineOwnedEvent(...)`, and it names
no engine code, because no engine code implements the body.

## Why the body has no counterpart to run

The port keeps no role-hash cache. The role lists are derived from the
reference rows FRESH at every read
(src/card/permissions/read-rules.ts:245-265, `role_ids_from_role_member_cards`
reads the same rows `generate_rolehash` would), so there is no cache to
refresh and the event has no behavior to run. The port's own comment at the
declaration states the same thing and calls the shape a plain stub, NOT
engineOwnedEvent.

## What this receipt does NOT claim

- The row's PORTED verdict stands: the observable outcome is the same in both
  systems, because the port's read path never consults a cache the event would
  have refreshed.
- The row's citation line in the roster (mods/card-mod-account.ts:1768) is
  stale: the declaration now sits at card-mod-account.ts:1923. The port's
  comment, not the line number, is the evidence.
- No Ruby engine was executed for this event. The Ruby side is read from the
  pinned gemset's own bytes at the line named above.
