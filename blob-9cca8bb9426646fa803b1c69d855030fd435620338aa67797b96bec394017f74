# Routes round four, 2026-10-23: the ten rows, the instrument that settled them, and the three that closed

Lane: `port/routes-round4-20261023` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round4-20261023`, branched at
`7bb793cc123137f90376c6d537bcb2b20ee9ce73` (the round-three tip). The
checkout was created through the machine's own sanctioned entry point,
`C:/localProjects/diskSteward/agent/create_worktree.py` (it admitted the
checkout against the disk reserve and recorded custody). Every commit is
pushed forward-only to origin (KatsuJinCode/decko-ts, private).

Family state at the start of this round: 72 of 72 rows adjudicated, 37
DONE on the roster, 4 more closed on the round-three branch awaiting the
fold (A2, A4, A7, A13), 31 open. This round took ten of the 31.

## The instrument, and why this round needed one

Every route row in this family grades the port on ONE thing: which route
the pinned deck's table (decko-0.20.0/config/engine_routes.rb) matches
for a given request, and what that match puts in params. Until this round
that answer was READ OFF the pattern string, or HAND-BUILT as a params
hash. Both are weaker than executing the matcher, and this round proved it
on two rows:

- The capture for the `:mark/view/:view` arm asserted that the `.:format`
  capture "rides the VIEW segment for every format" - a claim the capture
  could not test, because it built the params hash by hand.
- The capture for the legacy `card/:view` arm recorded that the pinned
  `/new|edit/` requirement "is UNANCHORED, so it admits 'editing' and
  'newer' too". That cell asked the REGEXP whether a string matches, not
  the matcher whether a route answers.

So this round built the missing instrument:
`tests/server/oracle-capture-rails-route-recognition-ruby.rb`. It
evaluates the PINNED route file against a REAL
`ActionDispatch::Routing::RouteSet` (actionpack-7.2.4) - the pinned file
executed, not re-typed - and records, for a fixed case list, the route
that matched (its index in the table, its verb, its path spec), the params
it produced, and the no-match answer where nothing matched. The route
count the capture records is the table's own: 29.

The load path needed care: the gemset shadows a handful of Ruby standard
library names (benchmark, cgi, json, logger, securerandom, set - the
nested card gem lib answers `require "set"` with card/set.rb). The capture
pre-requires every shadowed name from the standard library FIRST, then
APPENDS the gemset's lib directories, so the standard library keeps
priority on those names while every gem's own require paths still resolve.
That is why the real actionpack router loads here at all.

## The ten rows

| Row | Commit | Disposition |
| --- | --- | --- |
| A8 the `:mark/view/:view` arm | `0ee11a76c`, `0529ab3e0` | CLOSED on both hosts. The `.rss` suffix cell is the format for every format, and the pinned side is now executed rather than assumed. |
| A9 the legacy `card/:view` arm | `bf9bd6a63` | CLOSED on the markless shape, and the unanchored-constraint divergence is RETRACTED: the port was never wrong there, the evidence was. |
| A12 the markless delete | `eaf9cebcc` | KEPT NAMED, with the blast radius now MEASURED. The operator's yes belongs to it. |
| A17 the GET action routes | `f20d3de26` | The markless one-segment spellings CLOSE on the pinned precedence; the create and delete GET halves stay NAMED (the recorded hardening). |
| A18 the `(card)/create` arm | `50bf0f52a` | CLOSED. The port's arm already had its own `patch`; the pinned side is now on the record in the executed matcher's own words. |
| A22 the wildcard | `51c3ecd78` | The row's answer is re-measured on the executed matcher; the named remainder (the `:new-form` arm) stays named. |
| A23 the Jasmine mount | `fa6c01c8b` | SKIP-AND-NAME, re-measured. The mount cannot fire. The pin's gem-count drift is named. |
| B5 the `card#asset` action | `1e9f76cee` | The HTTP-visible answer is re-measured on the executed matcher; the log-line divergence stays named. |
| B6 the `setup` before_action | `7504bb80e` | KEPT NAMED, and its PRICE is named with it: the edge read path builds no card action engine. |
| B7 the `authenticate` before_action | `0d72926b0` | KEPT NAMED; the write path's own header grammar difference is now pinned. |

**Three rows closed (A8, A9, A18). Seven kept named (A12, A17, A22, A23,
B5, B6, B7).** Two further cells closed inside kept-named rows: A17's
markless one-segment spellings, and A9's constraint cell (retracted).

### What closed, and on what evidence

**A8.** The route's `.:format` capture rides the VIEW segment for EVERY
format. The executed matcher says so outright: "GET /Front/view/open.rss"
answers the view "open" in the rss format, on the same route (order 9) as
the bare read. The port's three-segment arm split `.json` and left every
other suffix in the view segment, so an `.rss` suffix arrived at the engine
as a view named "<view>.rss" and answered the engine's unsupported-view
422 where the pinned deck answers through its rss format. The edge's arm
now splits the two formats the port serves, and the staging host's rss
gate now admits the three-segment `:mark/view/:view` shape, which it did
not: that host served the shape with `stripFormat`, so the suffix was
stripped and the HTML page answered.

**A9.** The route's `:mark` group is OPTIONAL, so "/card/edit" matches the
arm with NO mark, and a READ runs load_mark
(card_controller.rb:22), so implicit_mark lands on home_mark: the pinned
answer is the HOME card in the "edit" view. The port answered the card
named "card", which 404s on every deck without one. The port's arm now
hands the request core a `homeEdit` kind, and the request core rewrites the
request onto the bare "/" arm, the arm that already owns the per-request
home-rule resolution.

The constraint cell is RETRACTED. The pinned matcher does not ask the
requirement whether a string matches; it embeds the requirement in the
segment's own regexp (actionpack's journey/path/pattern.rb, visit_SYMBOL)
inside the anchored path regexp, so the segment must match the requirement
ENTIRELY. The executed matcher refuses "/card/newer" and "/card/editing"
on that arm, and they fall through to the generic two-segment arm. The
pinned deck's `card/:view` arm admits exactly "new" and "edit", which is
what the port's grammar already did.

**A17.** The action arm sits at table order 20, but the `:mark(.:format)`
arm sits at order 6 and comes FIRST, so the ONE-SEGMENT "/read" and
"/asset" are the cards named "read" and "asset". The port's arms took
those spellings as the action, so "/read" answered the home card's page
(200) where the pinned deck reads a card that is not there (404), and
"/asset" answered card#asset's installation-error stub where the pinned
deck reads the card "asset". The port's own UPDATE arm already had this
shape right, so the grammar is now consistent across the three.

**A18.** The port's arm already carried its own `patch` and tested
'post || patch'. The pinned side is now on the record in the executed
matcher's own words: "POST /card/create/Front" and "PATCH
/card/create/Front" both reach the arm on table order 24, and "PUT
/card/create/Front" matches NO route in the pinned table at all.

## What this round did NOT land, named

- **A12** the markless write arms' fallback to the `*home` rule's card
  where the pinned deck answers the empty name and the 404. The fix is the
  markless-update row's own arm (C7), it changes what a bodyless DELETE /
  does to a live deck, and the operator's yes belongs to it.
- **A17** the create and delete GET halves on the plain-link surface.
  Admitting them would remove the port's recorded same-origin-XHR-only
  hardening for GET mutations.
- **A22** the signed-in may-create `:new-form` arm, whose shape the
  harness cannot pin (no boot prime, and the lexicon write seam takes a
  side pair).
- **A23** the mounted-engine arm. The mount is behind two conjuncts and
  the constant is never defined by any gem in the pin, so the mount cannot
  fire; a Jasmine mount would have to be a NEW arm, not a fix into an
  existing one.
- **B5** the symlink-hint log line. Not HTTP-visible, so the row's answer
  (the body and the status) matches; the log difference is named rather
  than invented into the port.
- **B6** the edge host's asset-input refresh seam, and its price: the
  refresh runs through CardActionEngine#refreshReadAssetInputs, and the
  edge's READ path builds no action engine at all. The staging host wires
  it because it builds the action engine's whole collaborator set.
- **B7** the write path's own header grammar (case-insensitive, and with
  none of the pinned pair delimiters), the denial-VIEW renderer, and the
  Cloudflare shell's missing session surface. The X-API-Key half is row
  C17 and is still open.
- **The Cloudflare shell's rss surface** (deploy/worker.ts carries none),
  which is the rss row's own gap, not the route rows'.
- **The roster fold itself.** The roster lives in the other repo and is
  folded by that repo's own guarded scripts. This round's dispositions are
  fold inputs.

## Rule B1, the containment fact, and what the fold would show

Rule B1 of the roster fold needs the row's landed body to be observable in
the canonical tree. Machine-checked in this lane, against the canonical
checkout's HEAD `34c31a71223e93c4599edd24d59b0d10428154bd` (the canonical
branch fetched into this lane's clone so the ancestry test could run):

- `git merge-base --is-ancestor 7bb793cc1 FETCH_HEAD` (the round-three
  tip): NOT an ancestor.
- `git merge-base --is-ancestor 0d72926b0 FETCH_HEAD` (this round's tip):
  NOT an ancestor.
- `git merge-base --is-ancestor 34c31a71 HEAD`: the canonical HEAD is not
  in this branch's history either.

So the containment promotes no row, for this round or for round three's
four, and the integration lane owns that step. The PROJECTED family count
if the integration lane absorbs this branch: 37 DONE today + round three's
4 (A2, A4, A7, A13) + this round's 3 (A8, A9, A18) = **44 of 72 DONE, 28
open**. Without that containment the fold promotes none of them, exactly
as it promoted none of round three's four.

## Captures: re-run in this lane, against the pinned gemset

Every capture was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` and compared
with its committed fixture, byte for byte:

| Row | Capture | Committed fixture md5 | Re-run |
| --- | --- | --- | --- |
| A18 | `oracle-capture-explicit-create-route-ruby.rb` | `a57e7fe9bc4c0d903510d6e2902f08d8` | IDENTICAL |
| A22 | `oracle-capture-bad-address-wildcard-view-ruby.rb` | `1cc4e3b8fdc672290dd72dc977101936` | IDENTICAL |
| A22 | `oracle-capture-wildcard-bad-address-ruby.rb` | `e6a136ada973c35968999b4ffcc79cca` | IDENTICAL |
| A23 | `oracle-capture-jasmine-mount-ruby.rb` | `a4bfa45732795a19a56d76622e00b8b9` | ONE CELL DIFFERS, see below |
| B5 | `oracle-capture-card-asset-action-ruby.rb` | `db21fd884f8243ae423c5ae7da77dadb` | IDENTICAL |
| B6 | `oracle-capture-setup-before-action-ruby.rb` | `8f7e340211d489fce0544f159f3fcf92` | IDENTICAL |
| B7 | `oracle-capture-request-authenticators-ruby.rb` | `3827a7da07f0074b6e878c640462ca57` | IDENTICAL |
| the instrument | `oracle-capture-rails-route-recognition-ruby.rb` | new this round | byte-stable across two runs, md5 `7e195c7ccbc3156e8528f03d8a8c6870` at the instrument commit |

**The A23 gem-count drift, named.** The jasmine mount capture differs from
its committed fixture in ONE cell: `gemCount`, 151 in the committed
fixture against 68 in the current pin. The pin on this machine now holds
68 gem directories where the original held 151, so the machine's pin has
SHRUNK. Every other cell is identical, so the row's conclusion is
unchanged and stronger on the current pin: there is still no gem named
jasmine and still not one ruby source naming the JasmineRails constant.
The committed fixture is left as the original's evidence, the precedent
the tranche-5 receipt set for exactly this drift.

## The quoted source ranges, re-pointed

Two families of capture quote the port's OWN source by line number, and
this round moved that source. Every stale range was re-pointed by matching
the QUOTED TEXT (from the committed fixtures) as a contiguous block in the
current source, and the affected fixtures were regenerated against the
pinned gemset. The diffs are confined to the quoted line numbers and their
text: 20 leaf changes for the port-only-routes fixture, 53 and then 45
for the e6-e13 fixture, and ZERO text changes in any of them. The third
capture regenerated byte-identical each time.

## Battery (final state, run in this lane)

- **The full `tests/server/` suite**: **124 files passed, 1 skipped (125);
  1233 tests passed, 14 skipped, 0 failed** (115.8s, exit 0). The one
  skipped file is `tests/server/edit-session-replay.test.ts`, which the
  runner reports as "needs data or setup that a clean clone does not have".
  The count is the round-three tip's 1222 plus this round's new legs.
- **The full `tests/deploy/` suite**: **83 files passed, 1 failed, 1
  skipped (85); 671 tests passed, 1 failed, 10 skipped** (86.0s). The one
  failure is `tests/deploy/worker-edge-cache-runtime.test.ts`, the
  pre-existing environmental failure this lineage's receipts record
  (tranche three through tranche eight all record it, and the tranche-four
  receipt records it failing ALONE on this machine at the tranche's base).
  Re-verified in this lane: the file fails ALONE here (3 passed, 1 failed
  in 7.2s), so it is not a suite-load artifact, and its subject under test
  is the Cloudflare shell (deploy/worker.ts) with the edge cache module
  (deploy/src/worker-edge-cache.js) - and deploy/worker.ts's import closure
  contains NEITHER of the files this round changed (the only "bunny-edge"
  occurrence in it is a comment). The failure's own message is the cache
  stamp ("armed; cache=miss; not-stored" against the expected
  "miss+stored"), which is the cache module's own subject.
- **Per row**, the battery at that row's own commit is in that row's
  commit message.
- `npx tsc --noEmit`: **exit 0, zero output lines**, the exit code read
  directly from tsc. `node --check vm-staging-server.mjs`: exit 0.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, or a locally booted staging server.

## Disk

Added: the lane's own checkout
`C:/localProjects/decko-ts-routes-round4-20261023` (a git worktree of the
routes family's trunk clone, with node_modules copied in from the tranche 8
clone, no network) plus twelve commits, this report, and the round's
instrument and fixture.

Moved out of the checkout: this lane's scratch directory `.tools-tmp/` (the
re-run captures, the probe scripts and the range-re-pointing helper),
ARCHIVED rather than deleted, so the checkout carries none of it and none
of its bytes is lost.
