# Stock follow links through the shared write host

The C376 complete Bunny browser capture records an actual remote GET to
`/update/Topic_008+*self+Ada_Admin+*follow` returning 404. The page's follow
button remains unchanged, no follow rows persist and no follower mail is
sent. The stock Ruby33 capture of the identical journey creates three cards,
one act, three actions and one reference, touches an updater and sends the
follower notice. The actual hrefs match.

Stock `decko-0.20.0/config/engine_routes.rb:41-44` explicitly routes GET
update actions. `card-mod-follow-0.20.0/set/all/follow/follow_link.rb`
builds its button as a remote anchor with an update URL, card content and
success mark/view. Rails UJS follows that anchor with GET; this is not a
missing POST event. The port's core `write-routes.matchRoute` already
implements that exact GET alternative and its normal create-if-missing,
authentication, origin and permission behavior.

The shared Workers-shaped host intercepted GET first and admitted only a
small list of account triggers. All follow GETs therefore bypassed the
implemented core and reached the ordinary read parser as a card named
`update`, producing 404. The host now delegates armed explicit GET update
routes to its existing write dispatcher. Disarmed requests, HEAD, bare
reads and unrelated action routes retain their existing behavior. The
same origin and card permissions still run; no GET is translated into a
fabricated POST and no query content is invented.

The shared saved-slot wrapper also discarded `success[view]`, always
requesting `titled`. It now passes the actual requested view to the host's
fresh actor-bound renderer; absent view still means `titled`. The follow
response can consequently return its real `follow_section` slot and show
the updated unfollow control.

The actual local Bunny HTTP regression obtains the real rendered follow
href, follows it with GET, checks the resulting slot/unfollow state, exact
`*always` content in the actual rule tree, actor 611 in the persisted act,
and a real follower message through the production capture-transport seam.
The canonical Ruby33 raw row independently establishes `*always` as the
stored pointer content. Shared-host controls exercise a real GET update,
cross-origin refusal with unchanged content, and off/HEAD/unrelated reads.

The original full comparison remains FAIL at 23/51. Its unfollow-mail
reference returns 403 while the candidate returned 404; the existing
product contract requires 200. This route repair does not waive that
contract or label the failing reference a successful unfollow flow.
Full comparison, original output and a separate actual-network audit are
preserved in the release's private `browser-full-bunny-c376b59c` directory.

All ten actual Bunny HTTP tests and 22 origin/host-dispatch controls passed.
The combined run also passed 15 available session-surface controls, but its
two preexisting fixture-dependent controls were unavailable in this checkout;
they are not claimed verified. A TypeScript literal annotation was corrected
after that run; all 22 origin controls were rerun (5.13s), and TypeScript
validation passed. No unavailable control was removed or enabled artificially.

## Actual browser rerun

Clean `8f2ec754245d68c9eb1992e43970894ac491cfb5` was built with the first-class
browser-host distribution and ran the three unchanged follow journeys
serially through the real Bunny handler over owned loopback Hrana/storage.
The owned processes exited naturally. Every required asset loaded.

| Journey | Actual update request | Duration | Product outcome |
|---|---|---:|---|
| follow-from-board-admin | GET 200 | 24.836s | Real follow tree saved, button becomes unfollow, one follower notice |
| unfollow-from-board-member | GET 422 | 22.819s | Refused missing-side create; no follow change; RED as a successful unfollow journey |
| unfollow-from-mail | GET 403 | 17.377s | Real permission refusal; existing product policy remains RED |

The member-board observations alone are both 200 and the runner reports
completion. Those facts do not prove an unfollow: the actual network action
is 422 and leaves no follow delta. The core permission source already
documents prior real Ruby probes for both denials
(`view-task-rules.ts:341–410`); permissions were not weakened for the fixture.

Each rerun's entire recorded row delta and mail array equals the respective
existing Ruby33 capture under the comparator's existing stable key sorting.
No new normalization was applied. This remains diagnostic: the rerun's
fixture-tree hash is `066062…`, while the historical reference has `e5798f…`.
It is not promoted to exact-fixture or full-suite parity.

Raw JSON/HTML, clean source/build/runtime provenance, the detailed action
network summary, logs and SHA-256 manifest are preserved outside the worktree
in the private evidence bundle `follow-get-host-8f2ec754`, withheld from the public package.
