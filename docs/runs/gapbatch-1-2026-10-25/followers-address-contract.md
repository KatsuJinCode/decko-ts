# Gap batch 1, gap 1: the followers address contract

One of the three follow-surface gaps the enumeration audit named
(docs/runs/enumeration-audit-2026-10-25.md in the audit worktree, family
follow-surface): a card's `*followers` page answers 200 with the follower
names, and the wrong-shaped address (`<card>+followers`, no asterisk)
answers 404. The recorded original's own bytes for both halves are
fixtures/captured/followers-address-junction.json: `asterisked` 200,
`un_asterisked` 404, on the same deck shape this port serves.

## What closed it

Two commits on port/gapbatch-1-20261025:

1. `1640bd87` seats RenderEngine#renderAbsentCards on the serving boot
   (deploy/bunny-worker-src/bunny-edge-deck-boot.ts, bootEdgeServingEngines),
   the one function every serving engine of the bundle comes from: the
   isolate's shared deck engine and each live render's own engines. That is
   the scope the Ruby controller gives the seat (rest.rb load_card fetches
   every requested card with `Card.fetch name, new: {}`), and the same
   posture the port's own Node host already runs for the stock deck profile
   (vm-staging-server.mjs). With the seat on, a rowless junction a set
   module declares virtual (card-mod-follow set/right/followers.rb:21-23
   `def virtual?; new?; end`) is KNOWN (states.rb:44-50) and renders its
   views, while a plain unknown card takes page_view_for_unknown
   (card-mod-format set/all/html/error.rb:81-87).
2. `ef472024` makes the known-virtual question ask its set membership
   strictly (src/card/render/virtual-card-registry.ts passes
   strictCodenames to src/card/render/content-overrides.ts's
   cardBelongsToSet). The seat exposed a false positive in the registry's
   name-spelling fallback: the unstarred junction `X+followers` matched the
   registered set `right/followers` through the spelling of its anchor
   (codename "followers"), so the wrong shape rendered as a known card.
   Ruby's module key is built from anchor_codenames
   (set/pattern/base.rb:21-29, :39-43,
   `part.cardname&.codename || break`): an anchor whose card does not exist
   builds no module key. With strict resolution the unstarred shape is
   unknown again and page_view_for_unknown answers it.

## The measured bytes (the checks this receipt ran)

The exercise's own instrument, booted on a fresh local stack against a copy
of the local deck (21676 cards), anonymous posture, after both commits:

| address | status | main slot |
|---|---|---|
| `/Home+*followers` | 200 | `titled-view ALL ALL_PLUS TYPE-list RSTAR RIGHT-Xfollower TYPE_PLUS_RIGHT-rich_text-Xfollower`, the List-typed virtual junction, pointer list body |
| `/Home+followers` | 404 | `not_found-view`, page_view_for_unknown's anonymous arm, the recorded original's answer |
| `/NoSuchLeft_gapprobe+NoSuchRight_gapprobe` | 404 | `not_found-view` (the compound unknown control, unchanged) |

The predicate probe over the same deck rows (dist build, both commits
applied), before and after the strict fix:

| name | registry predicate | module walk predicate |
|---|---|---|
| `Home+followers` | true before the fix, false after | false both |
| `Home+*followers` | true | true |

## The signed-in exercise lines

`node tools/edge-signed-in-exercise.mjs --only w4-follow-views` at source
`ef472024`, the deck snapshot the W4 probe used (SHA-256 6aebb654...),
bundle SHA-256 35bba0c1...:

```
PASS  W4 the followers list names exactly the accounts that follow the card
PASS  W4 the Engage tab's follower count equals the accounts the followers list names
PASS  W4 a card nobody follows has an empty followers list
```

The module's six followers-view doors (page and `/content` for the followed
card, the second followed card and the unfollowed control) each answered
200 with the pointer list; the followers list of the followed card named
exactly the two accounts whose follow rules the deck stores, and the
unfollowed card's list rendered empty.

## State

CLOSED. Both halves of the recorded contract answer as the capture records
them: the starred page with the follower names, the wrong-shaped address 404.
