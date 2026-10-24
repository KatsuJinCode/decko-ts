# mx-B-042: after sign out the page is anonymous

The roster row `mx-B-042-7-rename-history-search-change` (family [Family])
reads "after sign out the page is anonymous", verdict PASS, bucket DONE,
with the evidence basis "verified - every instrument entry for B-042 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

After leaving, the site must show itself to a stranger: no account name, no
Sign out link, and a page that says it is not signed in. The row is the
check that the session is really over in the rendered page, not only in the
cookie jar.

## The instrument

The same sign-out attempt carries this record
(tools/edge-signed-in-exercise.mjs:1060-1069). After the sign-out request
has been made and graded, the check visits the home page (:1067) and
records PASS only when that page is not signed in (:1068).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "after sign out the
page is anonymous", id ACT-042, check_ids ["B-042"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE SIGNED-OUT PAGE IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The repository's committed capture of a real Ruby deck's responses
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json)
holds the arm `after-signout-write`: the request that follows a sign-out
answers 403, and the page it carries is a signed-out page. Its body sets
the page's signed-in marker to false

    decko.signed_in=false;

and its navbar offers the signed-out links

    <a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a>
    <a class="nav-link signin-link known-card" href="/*signin">Sign in</a>

with no Sign out link anywhere on the page. Ruby's own source for the
sign-out itself is card-mod-account-0.20.0/set/self/signin.rb:19-23, and
Ruby's own source for the navbar items is
card-mod-layout-0.20.0/set/self/account_links.rb:25-27 (`navbar_item_views`
is `%i[my_card sign_out sign_up sign_in]`), where the sign-out item is
gated on `signed_in?` (:44) and the sign-in item on `not_signed_in?`
(:39-42).

The port runs the same thing. The sign-out route is
src/server/write-routes.ts:1527-1552: `handleSignout` revokes the session
row, drops the visitor's session history and session cards, and redirects
to the `*signin` card. The page's signed-in marker is written at
src/card/render/page.ts:1272 (`decko.signed_in=${signedIn};`), and the
navbar's items are rendered at src/card/render/navbar-views.ts:365-370,
where the sign-out item exists only when the visitor is signed in.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The signed-out
page's own marker value, its navbar offering Sign up and Sign in and
carrying no Sign out, and the sign-out event that produces them are
Ruby's own, and the port renders each of them. The page marker
`decko.signed_in` itself, the way the harness reads it, and the session
cookie's NAME (`decko_ts_session`, src/server/write-routes.ts:363) are the
port's and the harness's own facts, named here as named-instrument facts
and NOT claimed as oracle-matched; the harness says the same in its own
words at tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:39-45. The
check's own predicate (the page does not read as signed in) is the
harness's own instrument, and the live answer is what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0d8545b193f9293c658376882c7d904a1, started
    2026-10-24T10:56:20.358Z, the source files clean
    verdict: PASS
    evidence: {"signedIn":false}

The home page after the sign-out did not read as signed in. The run as a
whole graded 253 of 253 checks passed, 0 failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
