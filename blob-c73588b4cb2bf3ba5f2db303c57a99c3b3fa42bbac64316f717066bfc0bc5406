# W4: the followers list and the all-followed-cards view, opened on the signed-in deck

- Row: `cap-W4` (tools/edge-signed-in-exercise/capabilities.json, id `W4`), the follow
  family's "Followers list and 'all followed cards' view".
- Branch: `port/w4-follow-probe-20261025`, from the pushed roll tip
  `deploy/full-candidate-20261029` (`c9ab5b3356e7ee1db1f8444967dd6cc09efc6157`).
- Verdict: the two LINKS on the Engage tab are the original's own bytes; both VIEWS,
  opened, answer `403` with the loud denial "Sorry! You need permission to create
  this." The row stays open, with the differences and the mechanism named below.

## Why the row was open

The row's own finding said so: no id-prefixed check had ever run for it, so no
signed-in run could credit it, and the two links the board shows had been read
without either view being opened. Declaring a leg is not passing it, so the row
needed an instrument, not a binding.

## The instrument

- Module: `tools/edge-signed-in-exercise/checks-w4-follow-views.mjs` (topic
  `w4-follow-views`). The member creates three cards, follows two of them from
  their Engage tabs, and the administrator follows one of those as well, so the
  followers list holds more than one name and "exactly" has something to be exactly
  about.
- Predicate: `tools/edge-signed-in-exercise/lib/w4-follow-views.mjs`, graded against
  the pinned Ruby's recorded bytes, not against prose.
- Pin test: `tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs`. Run in this
  lane: `node --test tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs`,
  5 tests, 5 pass, 0 fail.

## The runs

| run | command | source | result |
|---|---|---|---|
| the probe | `node tools/edge-signed-in-exercise.mjs --only w4-follow-views --out .runtime/w4-lane/run1/report.md` | `3bf4c7a3` | 5 of 9 checks passed; the four W4 legs failed |
| the whole family | `node tools/edge-signed-in-exercise.mjs --out .runtime/w4-lane/family/report.md` | `3bf4c7a3` | 320 results, 311 passed, 9 failed |
| the baseline | `node tools/edge-signed-in-exercise.mjs --out .runtime/w4-baseline/report.md` | `c9ab5b33` (the parent commit, the probe module absent) | 316 results, 311 passed, 5 failed: the RichText editor toolbar leg, the N9 applied layout leg, the P5 `*type_plus_right` leg, the C20 junction leg and the timings leg |
| the seat forms | `node .runtime/w4-lane/follow-view-seat-forms.mjs` | `3bf4c7a3` | every seat for the junction answers the unknown card arm |

Both family runs used the family's own recipe on the local signed-in deck (the local
copy of Brandon's deck, 21676 cards copied, deck SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`), the rebuilt edge
bundle (SHA-256 `57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4`),
two throwaway local accounts (one holding the administrator role, one with no role) and
a headless browser with a throwaway profile. Nothing reached the live site and nothing
was written to the object store.

The control run is what separates this row's failures from the rest of the family: the
parent commit, without the probe module, already fails the RichText editor toolbar
leg, the N9 applied layout leg, the P5 `*type_plus_right` leg, the C20 junction leg
and the timings leg, and it carries no W4 leg at all. The probe therefore adds four
checks and four failures, all four of them this row's own legs, and regresses nothing.

## What matches the pinned Ruby

The Engage tab's two links are the original's own shape, and the count reconciles with
the deck's stored follow rules:

- The followers link's href is
  `/<card>+*followers/content?layout=overlay&slot[items][view]=closed` with the label
  `2 followers`. The recorded original engage tab carries the same href shape and the
  same `1 follower` label (`fixtures/captured/board-views.json`, the bot and tova
  actors); the source is card-mod-edit-0.20.0 `set/all/board/follow_section.rb:31-36`,
  whose label is `"#{cnt} follower#{'s' unless cnt == 1}"`.
- The overview link's href is
  `/<account>+*follow/content?layout=overlay&slot[items][view]=closed` with the literal
  `all followed cards` (card-mod-edit-0.20.0
  `set/all/board/follow_section.rb:16-20`, `link_to_card [Auth.current, :follow]`).
- The count is the deck's own: the member and the administrator each hold a
  `<card>+*self+<account>+*follow` rule whose option is `*always`, so the rendered
  `2 followers` equals the stored follower set the probe read out of the database.

## What differs, measured

Both views, opened, answer `403` with the loud denial "Sorry! You need permission to
create this.", and the captured page carries the unknown card create form's title, so
the port takes the unknown card branch and names no follower and no followed card.

| capture | page | status |
|---|---|---|
| `.runtime/w4-lane/run1/report.md.raw/008.html` | `/<card>+*followers` | 403 |
| `.runtime/w4-lane/run1/report.md.raw/009.html` | `/<card>+*followers/content` | 403 |
| `.runtime/w4-lane/run1/report.md.raw/012.html` | `/<unfollowed card>+*followers` | 403 |
| `.runtime/w4-lane/run1/report.md.raw/014.html` | `/<account>+*follow` | 403 |
| `.runtime/w4-lane/run1/report.md.raw/015.html` | `/<account>+*follow/content` | 403 |

The four declared legs and their verdicts:

| leg | verdict | what the run recorded |
|---|---|---|
| the followers list names exactly the accounts that follow the card | FAIL | no pointer list on the page, no follower name named; the stored follower set was `Harness Member`, `Harness Admin` |
| the Engage tab's follower count equals the accounts the followers list names | FAIL | the label `2 followers` and the stored set agree (2 and 2), but the list names 0, so the two disagree |
| the all-followed-cards view lists the followed cards and no unfollowed card | FAIL | the page names no followed card; the two stored rule cards for the member were never listed |
| a card nobody follows has an empty followers list | FAIL | no pointer list on the page at all (the empty list is not rendered) |

## No seat renders it

A second measurement over the same deck rows on the same deploy bundle
(`.runtime/w4-lane/follow-view-seat-forms.mjs`, the harness's own local stack) asked
the junction in every shape the affordance can use:

| address | answer |
|---|---|
| `/Home+*followers` | 404, the not found page, no pointer list |
| `/Home+*followers/content` | 404, the not found page, no pointer list |
| `/Home+*followers/content?layout=overlay&slot[items][view]=closed` (the board link's own href) | 404, the not found page, no pointer list |
| `/Home+*followers?view=core` | 404, the not found page, no pointer list |

The anonymous reader gets the not found page and the signed-in member gets the create
denial; neither gets the follower names.

## The mechanism, named and bounded

**The view bodies are not the cause.** The port's own machinery for the pinned Ruby's
virtual card is present and green at this tip: `npx vitest run
tests/card/set-modules/virtual-set-modules.test.ts` passes 17 of 17, and that file
renders `Home+*followers` through `engine.render(..., "core")` and expects the pointer
list with the follower names. The content override that carries those names
(`src/card/mod-loader/mods/card-mod-follow.ts:285`, registered at `:1756`) is therefore
working.

**The divergence is in the page path's own absent card handling.** The page's absent
root seat (`src/card/render/page.ts:347-360` and `:432-440`) and its
`isKnownVirtualCard` questions (`:374` and `:388`) are what decide a rowless card's
page, and the hosts' posture is part of it: `RenderEngine#renderAbsentCards` is off by
default (`src/card/render.ts:762`), the deploy bundle turns it on only for the new card
form render (`deploy/bunny-worker-src/bunny-edge-engine-request.ts:1378`) and the
port's own Node host only for a stock deck (`vm-staging-server.mjs:1413`).

**The original seats the card.** The pinned Ruby fetches with `new: {}` and, because
card-mod-follow-0.20.0 `set/right/followers.rb:21-23` declares the junction virtual
(`def virtual?; new?; end`), the junction is KNOWN (card-1.110.0
`mod/core/set/all/states.rb:44-50`) and renders the left card's follower names as the
pointer content (`set/right/followers.rb:13-19` with
`set/all/follow/follower_ids.rb:53-55`).

**The open seam.** This probe does not isolate which of the two page path questions
decides it on the served artifact (the seat, or the `isKnownVirtualCard` answer for
this name on this deck). The next measurement is a bundle against host comparison of
the same address over the same rows.

**The dashboard address is this deck's shape, not a port gap.** The follow set module
is `TypePlusRight::User::Follow` (card-mod-follow-0.20.0
`set/type_plus_right/user/follow.rb`) and Ruby's anchor is the left card's TYPE NAME
(card-1.110.0 `mod/core/set_pattern/08_type_plus_right.rb:30-32`,
`anchor_name card: "#{left_type(card)}+#{card.name.tag}"`). This deck names its account
cardtype `Person` (card id 4, codename `user`; the captured original bytes render
account cards with `data-card-type-name='Person'`,
`fixtures/captured/email-templates-raw-oracle.json`) while the stock gemset names it
`User` (card-1.110.0 `mod/core/data/real.yml:40`), and the port's own pin test seeds a
`User` named type for the same reason
(`tests/card/set-modules/virtual-set-modules.test.ts:78`). So `<account>+*follow`
resolves to no follow set module on this deck, in the original as well as in the port,
and both take the unknown card branch. The original's own answer for that address on
this deck was NOT measured: the original is not runnable against this deck in this
harness.

## The row's state

`not_covered`, with the four legs declared. The whole family exercise at this tip
graded 0 of 4 for this row, so the registry computes the row as not covered
(`verifiedCapabilities` credits a name only when the run recorded it and it passed).

## What was not done

- The original was not run against this deck, so the divergence claim rests on the
  pinned gemset's source and on the recorded original bytes in this repository, not on
  a live Ruby answer for this deck.
- The failing question inside the port's page path was not isolated; the probe names
  the seam, not the line.
- The port was not changed. This probe measures and names; it does not port.
