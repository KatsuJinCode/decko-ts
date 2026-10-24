# mx-B-037: navbar sign out revokes the session without changing cards

The roster row `mx-B-037-6-delete-a-card` (family [Family]) reads "navbar
sign out revokes the session without changing cards", verdict PASS, bucket
DONE, with the evidence basis "verified - every instrument entry for B-037
is pass (live-acceptance-lane+whole-harness)". This receipt is the family's
own adjudication of that row: the instrument the registry's own ledger
records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

Signing out has to do four things at once, and the row names all four: the
browser's session cookie must be gone, the server must refuse the old
token even when a client replays it, the landing page must read as
anonymous, and the deck's cards must be exactly what they were before the
click. A sign-out that only clears the cookie fails the second and third;
a sign-out that deletes something fails the fourth.

## The instrument

The exercise's "6. delete a card" group carries the navbar sign-out check
(tools/edge-signed-in-exercise.mjs:1018-1044). It visits the home page
(:1019), reads the navbar's `a.signout-link` href (:1020-1021) and requires
it to be a local URL (:1022), reads the session cookie (:1023) and refuses
to continue without one (:1024), digests every row of the owned `cards`
table before the click (:1025), waits for the response whose path is the
link's path (:1026-1029), clicks the link (:1030), then lands on the home
page and reads whether that page is signed in (:1034), reads the cookies
again (:1035), and REPLAYS the old session token against the loopback
server to tell a server-side revocation apart from a cleared cookie
(:1036-1039). It re-digests the cards table (:1040). The record (:1041-1042)
grades PASS only when all four hold at once: the landing page is anonymous,
the session cookie is gone, the replayed token no longer signs in, and the
card rows are unchanged.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "navbar sign out
revokes the session without changing cards", id ACT-037, check_ids
["B-037"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE SIGN-OUT LINK IS RUBY'S OWN, BYTE FOR BYTE. The repository carries a
committed capture of a real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl).
Its arm `probe-view:406:sign_out@set/self/account_links.rb` holds

    <a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a>

and Ruby's own source for those bytes is
card-mod-layout-0.20.0/set/self/account_links.rb:44-48:

    view :sign_out, link_options(:signed_in?) do
      link_to_card :signin, account_link_text(:sign_out),
                   class: nav_link_class("signout-link"),
                   path: { action: :delete }
    end

with the item list that decides it at :26 (`navbar_item_views` is
`%i[my_card sign_out sign_up sign_in]`) and the class helper at :82-84.
The `path: { action: :delete }` is what makes the link a DELETE-path link
to the `*signin` card, which is the path Ruby's own card route builds
(card-mod-format-0.20.0/lib/card/path.rb:32-45).

THE SESSION REVOCATION IS RUBY'S OWN. Ruby's sign-out is an event on the
sign-in card, card-mod-account-0.20.0/set/self/signin.rb:19-23:

    event :signout, :validate, on: :delete do
      Auth.signin AnonymousID
      Env.reset_session
      abort :success
    end

So in Ruby's own deck the visitor is signed in as Anonymous, the session is
reset, and no card row is saved (the abort happens before any save). The
repository also carries Ruby's own captured sign-out request
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
arm `signout`): status 303, `Location: http://127.0.0.1/*signin`, and
`signed_in_as: null`, which is Ruby's own record that the session was gone
after the request. The same capture records the `*signin` card's own
`signout` event in its events list, and its `delta` counts ZERO changes to
cards, card_acts, card_actions, card_changes, card_references,
card_revisions, card_virtuals, sessions and users. That is Ruby's own
evidence for the second half of the row: Ruby's sign-out touches no card
row at all.

The port runs the same three things. The link is rendered at
src/card/render/navbar-views.ts:369 (the navbar item) and :390 (the
account dropdown item) with the same href and the same class. The sign-out
route is src/server/write-routes.ts:1527-1552: `handleSignout` revokes the
session row (`revokeSession(token)`), drops the visitor's session history
and session cards (`delete visit.history`, `visit.cards = {}`) and
redirects to the `*signin` card; it is dispatched at :1818-1822. The
cleared cookie is src/server/write-routes.ts:392-394
(`clearedSessionCookieHeader`, `Max-Age=0`).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The sign-out link's
class, href and text, the DELETE-path route, the revocation of the session
and the reset of the visitor's session are Ruby's own, and the port renders
and runs each of them. Two facts are NOT Ruby's own and are named here as
named-instrument facts: the session cookie's NAME (`decko_ts_session`,
src/server/write-routes.ts:363) and the page's signed-in marker
(`decko.signed_in`, src/card/render/page.ts:1272). The harness says the same
in its own words at tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs
:39-45. The instrument's replay probe is the harness's own construct, not
Ruby's, and this receipt does not claim it is.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0d8545b193f9293c658376882c7d904a1, started
    2026-10-24T10:56:20.358Z, the source files clean
    verdict: PASS
    evidence: {"href":"/delete/*signin","status":303,"landingSignedIn":false,"replaySignedIn":false,"cardsUnchanged":true}

The link's href is Ruby's own `/delete/*signin`, the request answered 303
as Ruby's own captured sign-out did, the landing page was anonymous, the
old session token replayed against the loopback server no longer signed in
(server-side revocation, not only a cleared cookie), and every row of the
cards table was byte-identical before and after. The run as a whole graded
253 of 253 checks passed, 0 failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
