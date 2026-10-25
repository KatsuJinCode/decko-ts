# Edge signed-in exercise: the W4 row, the followers list and the all-followed-cards view, opened

The branch is `port/w4-follow-probe-20261025`, created at the newest pushed
roll tip (`deploy/full-candidate-20261029`, `c9ab5b3356e7ee1db1f8444967dd6cc09efc6157`).
The whole-family exercise ran once, at this row's tip (`3bf4c7a3960132461c38713d527494c4251ebbaf`,
the source tree clean and committed: the run's provenance carries
`sourceFilesClean: true` and `dirty: false`, and the build receipt's
`sourceDiffSha256` is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
the clean-tree value). The commits after it carry this receipt, the run record
and the roster's own status strings; they carry no behaviour.

One full run, every journey group and every check module, on the LOCAL stack
that the harness boots itself: the loopback database and object storage, a
local copy of the deck on the engine schema (the same local snapshot the
earlier rounds used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`), two
throwaway local accounts (one holding the `administrator` role, one signed in
with no role), headless Chromium with a throwaway profile, and the harness's own
in-process mail capture. Nothing reached the live edge and nothing was written
to the live D1: the run's provenance carries `productionRuntime: false`. The
executed bundle is the deploy's own artifact, SHA-256
`57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4`.

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/w4-family-20261025/report.md
```

The run started at `2026-10-25T08:47:54.541Z` and completed at
`2026-10-25T09:06:25.363Z`.

## The grade line

**311 / 320 checks passed**, 9 failed. Four of the nine failures are this row's
own four declared legs. The other five are named in the last section, and the
control run at this row's parent commit separates them from this row.

## The W4 row (follow: followers list and 'all followed cards' view)

| check | result | the evidence |
|---|---|---|
| W4 the followers list names exactly the accounts that follow the card | FAIL | the view answered 403 and rendered no list at all (`noPointerList`, `missingFollowerNames`); the two stored follow rules the member and the administrator hold on that card were read back from the deck as `*always` |
| W4 the Engage tab's follower count equals the accounts the followers list names | FAIL | the board's own link reads "2 followers" and the stored rules make exactly two followers, but the list the same link opens names none: the count and the list disagree |
| W4 the all-followed-cards view lists the followed cards and no unfollowed card | FAIL | the dashboard answered 403 and rendered neither the Follow/Ignore tabs nor any of the nine stored follow rules (`missingFollowedCard`, `itemCountDisagreesWithStoredRules`) |
| W4 a card nobody follows has an empty followers list | FAIL | the control card's view answered 403 as well: it is not the empty pointer list Ruby's `left ? item_names.to_pointer_content : ""` arm produces, it is the create view |

WHAT THE PROBE DID, AND WHAT IT PROVED ON THE WAY: the member created three
cards, followed two of them from their Engage tabs (each follow write
answered 200 and the deck stores `*always` on the rule
`<card>+*self+Harness Member+*follow`), and the administrator followed the
first of them as well (200, `*always`), so the followers list had more than
one name in it and "exactly" had something to be exactly about. The expected
follower set of each card is computed from the deck's stored follow preference
rows and the option each one carries, never assumed: two accounts for the
first card, one for the second, none for the control.

THE BOARD'S TWO LINKS ARE RIGHT. The followers link's href names the card's own
`*followers` junction and its label carries the count as Ruby writes it ("2
followers"), and the overview link's href names the signed-in user's `*follow`
card with the literal text "all followed cards". Both were graded against the
recorded Ruby bytes (the table below) and both hold.

## Every element against the recorded original

The recorded behaviour is the pinned Ruby's own bytes, already in the
repository, and this probe graded the port's answers against them:

| element | the recorded original | the port at this tip |
|---|---|---|
| the board's followers link target | `card.name.field(:followers)` -> `/Oracle_Basics+*followers/content?layout=overlay&...` (fixtures/captured/board-views.json, the recorded Ruby engage tab) | the same shape: `/Harness_W4_followed_a_mvnlr2xb+*followers/content?layout=overlay&slot[items][view]=closed` |
| the board's followers link label | `"#{cnt} follower#{'s' unless cnt == 1}"` (the same capture); "1 follower" there, "2 followers all followed cards" in the Ruby oracle's own recorded observation (fixtures/captured/smell-row-r4-2026-10-24/evaluate-follow-operations-ruby33.json) | "2 followers" |
| the board's overview link target | `link_to_card [Auth.current, :follow]` -> `/Tova+*follow/content?layout=overlay&...` (the same capture) | the same shape: `/Harness_Member+*follow/content?layout=overlay&slot[items][view]=closed` |
| the board's overview link text | the literal "all followed cards" | "all followed cards" |
| the followers list view | 200, `firstView=titled`, naming the accounts that follow ("Ada Admin+*followers Mira Member", "Home+*followers Mira Member"; the oracle's recorded answers, tests/card/set-modules/virtual-set-modules.test.ts) | 403 for the signed-in member ("Sorry! You need permission to create this.") and 404 for an anonymous reader ("Not Found Could not find Home+*followers") |
| the all-followed-cards view | 200, `firstView=titled`, "Follow Ignore" and the held rule row ("Mira Member+*follow Follow Ignore check everything"; the same recorded answers) | 403 for the signed-in member and 404 for an anonymous reader |

THE PINNED RUBY'S OWN SOURCE for both views is captured in
fixtures/captured/followers-list.json by
tests/card/mod-loader/oracle-capture-followers-list.rb: card-mod-follow-0.20.0
set/right/followers.rb owns the followers list (`def content` is
`left ? item_names.to_pointer_content : ""`, `def item_names` is
`left ? left.follow_set_card.prototype.follower_names : []`), set/right/following.rb
owns the signed-out arm of the following card's core view, and
card-mod-edit-0.20.0 set/all/board/follow_section.rb owns the two links. The
predicate that grades all of this is
tools/edge-signed-in-exercise/lib/w4-follow-views.mjs, and its pin test runs
those recorded bytes through it.

## The mechanism, measured three ways

The port's own TypeScript host renders the view; the deploy's bundle does not.
Over the SAME deck rows, with the SAME dist build:

```
node tools/edge-signed-in-exercise/follow-view-seat-comparison.mjs \
  --address "/Home+*followers" --address "/Brandon_WilliamsCraig+*follow" \
  --host http://127.0.0.1:<port> --host-label ts-host-stock
```

(the same command against a host started without the stock deck profile, which
leaves the seat off, answers 404 on both addresses)

| engine | the absent-card seat | `/Home+*followers` | `/Brandon_WilliamsCraig+*follow` |
|---|---|---|---|
| the deploy's bundle (`deploy/dist/bunny-edge-engine.bundle.js`) | off on the page path | 404, "Not Found Could not find Home+*followers" | 404, "Not Found Could not find Brandon WilliamsCraig+*follow" |
| the port's own host, stock profile (`vm-staging-server.mjs`, `DECKO_DECK_PROFILE=stock`) | on | 200, the pointer list (`pointer-list` present, no create form) | 200, the pointer list |
| the port's own host, non-stock profile | off | 404, "Not Found Could not find Home+*followers" | 404, "Not Found Could not find Brandon WilliamsCraig+*follow" |

("Brandon WilliamsCraig" is a user card in this deck, so its address is the
all-followed-cards dashboard of a real user; the probe's own dashboard is the
member's, whose content view an anonymous reader is not allowed to read, so the
port's own host answers that one address with a denial rather than with the
list.)

THE MECHANISM, IN ONE SENTENCE: the deploy's bundle serves the page path with
`RenderEngine#renderAbsentCards` OFF (the flag's default,
`src/card/render.ts`), so the ROWLESS follow-family junctions
(`<card>+*followers`, `<User>+*follow`) are never seated as cards, the page's
unknown-card arm fires (card-mod-format set/all/html/error.rb:81-86
`page_view_for_unknown`), and the page answers the create view - the signed-in
member, who may not create, gets the create denial - or the not-found page for
an anonymous reader. The bundle seats that flag for the new-card form render
(`deploy/bunny-worker-src/bunny-edge-engine-request.ts:1378`) and for the
wildcard address, and NOT on the page path; the port's own host seats it for a
stock deck (`vm-staging-server.mjs:1413`), which is why the same source over
the same rows renders the list there. The views themselves are ported and
match the recorded Ruby bytes: the port commit that carries them
(`47098136`, "Port the ACT-155 / W4 follow-family views, matched to the stock
Ruby oracle") is an ancestor of this tip, and the port's own pins for them
(tests/card/follow/act155-w4-followers-view-content.test.ts,
act155-w4-follow-overview-assembly.test.ts) pass at this tip.

SO THE ROW STAYS OPEN, WITH THE DIFFERENCE NAMED: the port's pages do not match
the recorded original's pages, the difference is the unknown-card arm in
place of the two views, and the cause is the bundle's absent-card seat. What
closes this row is one flag on the bundle's page path (or the views rendered
without it), not another probe.

## The other five failures in this run, and the control that separates them

Against the family's last committed whole-family record
(`docs/runs/edge-signed-in-exercise-round9-final-2026-10-25.json`, source
`c46d0f04fa`, 293 results, 293 passing): 291 of its passing checks are present
and passing here, 0 are absent, and 2 are present and FAILING here - "C20 the
stored row is the junction joining the card's +*right set to the member" and
the timings check ("no signed-in page exceeded 3 s of server time", which
recorded a 5389 ms page). This record also carries 19 checks the baseline does
not have, because the lanes that landed after the round-nine record added
their own rows; three of those fail here: the M1 toolbar leg, the N9 layout
leg and the P5 `*type_plus_right` leg.

None of those five is this row's business, and none of them can be caused by
this commit: the commit adds one check module (which the loader runs LAST,
its file name sorts after every other `checks-*.mjs`) and one registry row.

The control run at this row's parent commit says so with evidence rather than
with an argument. It ran the same exercise at `c9ab5b3356e7ee1db1f8444967dd6cc09efc6157`
(this row's parent, the tree without the probe), on the same deck rows and the
same bundle (the source deck SHA-256 `6aebb6546a...`, the executed bundle
SHA-256 `57ca0c1e...`, the source tree clean and committed, `sourceFilesClean`
true, the build receipt's `sourceDiffSha256` the clean-tree value
`e3b0c442...`), started `2026-10-25T10:03:38.302Z` and completed
`2026-10-25T10:19:53.323Z`:

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/w4-control-family2/report.md
```

**311 / 316 checks passed**, 5 failed: the M1 toolbar leg, the N9 layout leg,
the P5 `*type_plus_right` leg, the C20 junction leg and the timings check (a
4226 ms page). Compared with that control, name by name: **311 of its 311
passing checks are present and passing here, 0 regressed, 0 absent**, and this
record carries exactly 4 checks the control did not have, all four of them
this row's own legs. So the commit that carries the probe regresses nothing;
the five other failures are at this tip before the probe, and the four failures
that are this row's are the row's contract, measured.

## The battery

The row's own pin test ran at this tip:

```
node --test tools/edge-signed-in-exercise/test/w4-follow-views.test.mjs
```

5 tests, 5 pass. It runs the recorded Ruby bytes (the engage tab's two links
and their label, the Ruby oracle's recorded count, the pinned gemset's source
for both views) through the predicate, and it holds the failure shapes each
leg can fail on: a missing name, an invented name, the unknown-card create
form, a listed card the user does not follow, and an item count that
disagrees with the stored rules.

## What this row does not claim

The follow MAIL and the unfollow link in that mail are the W5 and W6 rows'
contracts, and stopping a follow is W2's contract. This run claims only the
two views the W4 row names, and it records that they do not render.
