# mx-B-041: GET /_signout revokes the session (session cookie gone)

The roster row `mx-B-041-7-rename-history-search-change` (family [Family])
reads "GET /_signout revokes the session (session cookie gone)", verdict
PASS, bucket DONE, with the evidence basis "verified - every instrument
entry for B-041 is pass (live-acceptance-lane+whole-harness)". This receipt
is the family's own adjudication of that row: the instrument the registry's
own ledger records for it, the Ruby oracle that pins the surfaces the
instrument touches, and a fresh measurement at this tip.

## What the row is

Leaving the site has to end the session, not merely hide it. The row
grades the two facts a person can observe: the request is answered, and the
session cookie is gone from the browser afterwards. A page that renders as
anonymous while the cookie is still on disk has not signed anybody out.

## The instrument

The exercise's "7. rename, history, search, changes, sign out and back in"
group carries the sign-out attempt (tools/edge-signed-in-exercise.mjs:
1060-1069). It notes the request ledger's length (:1061), navigates to
`/_signout` (:1062), takes the request-ledger lines that appeared since
(:1063) and picks the one whose path is the sign-out path (:1064), reads
the browser's cookies after the request (:1065), and records PASS only when
a request line exists AND no cookie named `decko_ts_session` is left
(:1066). The next record on the same attempt (:1067-1068) is the row
mx-B-042 and is adjudicated in its own receipt.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "GET /_signout
revokes the session (session cookie gone)", id ACT-041, check_ids
["B-041"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, http-verb, native-local-bundle: pass

## The oracle

THE REVOCATION IS RUBY'S OWN; THE `/_signout` PATH IS THE PORT'S OWN. Those
are two different things and this receipt keeps them apart.

Ruby's own sign-out is an event on the sign-in card,
card-mod-account-0.20.0/set/self/signin.rb:19-23:

    event :signout, :validate, on: :delete do
      Auth.signin AnonymousID
      Env.reset_session
      abort :success
    end

The repository also carries Ruby's own captured sign-out request
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
arm `signout`): status 303, `Location: http://127.0.0.1/*signin`, and
`signed_in_as: null`. That is Ruby's own record of a session that was
revoked by the request.

The `/_signout` path itself is NOT Ruby's. It is the port's own surface, in
the `/_*` namespace the port reserves for its own non-card endpoints, so
that no card can ever be named this. Its own code says so
(deploy/bunny-worker-src/bunny-edge-session-viewer.ts:101-109:

    export const EDGE_SIGNOUT_PATH = "/_signout";

and :241-243: "The sign-out surface: `GET|POST /_signout`"). The handler
is `handleEdgeSignout` (:243-300): the origin gate runs before any
session work, then the caller's own session row is revoked and the cookie
is cleared, and the surface is idempotent, so a second sign-out with the
same dead cookie answers 200 with `revoked: false`. It is mounted ABOVE
the write surface, and the mount's own comment records why
(deploy/bunny-worker-src/bunny-edge-engine-handler.ts:288-315): the write
surface's route matcher claims a bare `POST /_signout` as a create-card
request, and on the release where that was true the request CREATED a card
named "signout" while the session stayed live. The cleared cookie the
surface sends is src/server/write-routes.ts:392-394
(`clearedSessionCookieHeader`, `Max-Age=0`), and the card route that
carries Ruby's own sign-out event is src/server/write-routes.ts:1527-1552
(`handleSignout`).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The session
revocation, the reset of the visitor's session, the abort that leaves no
card row behind, and the redirect to the sign-in card are Ruby's own, and
the port runs each of them on its own DELETE path. The `/_signout` PATH,
the origin gate, the `{ ok, revoked }` answer shape and the cookie's NAME
(`decko_ts_session`, src/server/write-routes.ts:363) are the port's own
facts, named here as named-instrument facts and NOT claimed as
oracle-matched. The check's own predicate (a request line exists and the
session cookie is gone) is the harness's own instrument, and the live
answer is what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0d8545b193f9293c658376882c7d904a1, started
    2026-10-24T10:56:20.358Z, the source files clean
    verdict: PASS
    evidence: {"status":200,"cookies":["decko_visit"]}

The sign-out request was answered 200, and the only cookie left in the
browser was `decko_visit`, the visitor cookie; the session cookie
`decko_ts_session` was gone. The run as a whole graded 253 of 253 checks
passed, 0 failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- This receipt does not claim that `/_signout` is Ruby's own path. It is
  the port's own surface; Ruby's own path is DELETE `/delete/*signin`.
