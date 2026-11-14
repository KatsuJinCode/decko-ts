# reg-evt-mod-follow-cache-expired-for-new-set: the registration carries the plain stub, and the port's own reason says so

The roster row `reg-evt-mod-follow-cache-expired-for-new-set` (family
register-events) reads "event cache_expired_for_new_set (card-mod-follow)",
verdict PORTED, bucket DONE. Its receipt was one line: "verified: the mod event
registry carries a real body (fn:) or an engineOwned registration naming the
engine code that owns the body, at the cited line".

That line overstated what the registry carries. The registration for this event
is a plain declaration with no body and no engine-owned marker, and the port's
own comment at that declaration names the reason. This receipt states exactly
what the evidence shows.

## What the row is

Ruby declares `event :cache_expired_for_new_set, :store, on: :create` in
card-mod-follow-0.20.0/set/type/set.rb:1. The body expires the follower caches
for a new set.

## What the port's registration actually carries

src/card/mod-loader/mods/card-mod-follow.ts:2001

    events: [event({ event: "cache_expired_for_new_set", at: "store", on: ["create"] })],

A plain `event(...)` declaration: Ruby's set membership and metadata (the store
stage, the create trigger) and no body. It is not an `engineOwnedEvent(...)`,
and it names no engine code, because no engine code implements the body.

## Why the body has no counterpart to run

The port keeps no follower cache to expire.
src/card/notify/follower-resolver.ts rebuilds the preference index per
`resolveFollowers` call, so the next reader sees the fresh rows either way and
the observable outcome is the same as Ruby's. The port's own comment at the
declaration calls the shape a NAMED REMAINDER, not engineOwnedEvent, for the
same reason as the follower_ids events above it: no engine cache to expire.

## What this receipt does NOT claim

- The row's PORTED verdict stands: the observable outcome is the same in both
  systems, because the port never holds the cache the event would have
  expired.
- The row's citation line in the roster (mods/card-mod-follow.ts:1765) is
  stale: the declaration now sits at card-mod-follow.ts:2001. The port's
  comment, not the line number, is the evidence.
- No Ruby engine was executed for this event. The Ruby side is read from the
  pinned gemset's own bytes at the line named above.
