# Gap batch 1, gap 2: the follow status view and the follow_section slot

One of the three follow-surface gaps the enumeration audit named: the
follow button's success view (`:follow_status`,
card-mod-follow set/all/follow/follow_link.rb `link_opts success_view=:follow_status`)
is the view the button writes into the `follow_section` slot
(`opts = link_opts(:follow_section)`), the slot the board's Engage tab
renders.

## What was measured (the checks this receipt ran)

The signed-in exercise at source `ef472024` (bundle SHA-256 35bba0c1...),
the deck snapshot the W4 probe used (SHA-256 6aebb654...), the module
following three cards the way a person does (the board's own follow link
clicked, never synthesized):

```
memberA  href /update/Harness_W4_followed_a_<run>+*self+Harness_Member+*follow
         ?card[content]=[[*always]]&success[mark]=Harness_W4_followed_a_<run>&success[view]=follow_section
         writeStatus 200
memberB  href /update/Harness_W4_followed_b_<run>+*self+Harness_Member+*follow
         ?card[content]=[[*always]]&success[mark]=Harness_W4_followed_b_<run>&success[view]=follow_section
         writeStatus 200
adminA   href /update/Harness_W4_followed_a_<run>+*self+Harness_Admin+*follow
         ?card[content]=[[*always]]&success[mark]=Harness_W4_followed_a_<run>&success[view]=follow_section
         writeStatus 200
```

Every follow click carries `success[view]=follow_section` (the success
view the follow button writes into the follow_section slot), every write
answered 200, and the stored options read back from the deck's own rule
rows are `*always` for all three. The Engage tab the writes re-rendered
carries the count label `2 followers` on the followed card (the
follow_section slot's own content view after the success write), which is
the count leg's PASS line:

```
PASS  W4 the Engage tab's follower count equals the accounts the followers list names
```

The follow status view's own bytes are pinned at this tip by the port's
mod-view pins (tests/card/mod-loader/card-mod-follow-views.test.ts: the
:follow_status view wraps the follow items list, right/follow.rb:58-60 with
follow_status.haml, and the success form encodes
`success[mark]=...&success[view]=follow_section`): that suite passes
(7 of 7), alongside the absent-card page pins (12 of 12), the not-found
format parity pins (15 of 15) and the set-module pins (17 of 17) in the
same run: 96 tests, 13 files, 0 failures.

## What this receipt does not claim

The update response's own body (the bytes the /update POST returns to the
browser) was not captured raw in this lane's runs; the module records the
write's status, the success parameters and the deck's stored rows. The
success view's rendered bytes on the deck are observed through the slot it
re-renders (the Engage tab's count label and follow state), not as a raw
response capture.

## State

CLOSED. The follow button's success view writes the follow_section slot:
the writes land (200, stored `*always`), the slot re-renders, and the
view's bytes stay pinned.
