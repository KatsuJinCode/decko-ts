# Gap batch 1, gap 3: the follower count slot

One of the three follow-surface gaps the enumeration audit named: the
follower count slot (`RIGHT-Xfollower.content-view`), shown on the board as
the "N followers" link, renders the count and opens the list. The recorded
original's own bytes are fixtures/captured/board-views.json (the engage
tab's followers link, label "1 follower", href the card's own `*followers`
junction) and fixtures/captured/unfollow-board.json (the follow button's
`data-update-foreign-slot` pointing at the slot).

## What was measured (the checks this receipt ran)

The signed-in exercise at the lane's final commit `23b701e9` (the same
evidence at `ef472024`), the deck snapshot the W4 probe used
(SHA-256 6aebb654...). The Engage tab of the followed card, read off the
rendered board:

```
followers link href: /Harness_W4_followed_a_<run>+*followers/content?layout=overlay&slot[items][view]=closed
followers link text: "2 followers"
overview link href:  /Harness_Member+*follow/content?layout=overlay&slot[items][view]=closed
overview link text:  "all followed cards"
linksOk: true
```

The count reconciles with the deck's own stored follow rules: the member
and the administrator each hold a `<card>+*self+<account>+*follow` rule
whose option is `*always`, and the rendered `2 followers` equals the stored
follower set the module read back from the database (2) and equals the
followers list the junction page names (the list leg's two names). The
link opens the list: the href's address answers 200 with the pointer list
in the same run (the module's six followers-view doors, page and
`/content`).

Exercise lines:

```
PASS  W4 the followers list names exactly the accounts that follow the card
PASS  W4 the Engage tab's follower count equals the accounts the followers list names
PASS  W4 a card nobody follows has an empty followers list
```

## State

CLOSED. The board's count link renders the count, the count is the deck's
own stored follower set, and the link opens the list at the address the
recorded original's own href names.
