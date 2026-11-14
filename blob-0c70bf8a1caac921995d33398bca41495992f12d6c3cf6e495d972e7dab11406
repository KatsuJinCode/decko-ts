# Routes round three, 2026-10-23: the eight rows the family had not closed

Lane: `port/routes-round3-20261023` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round3-20261023`, branched at
`aa130c667214e567b581f60af28745d1e0ce930e` (the newest [Family] tip: the tranche
10 landing and cleanup receipt). The checkout was created through the machine's
own sanctioned entry point,
`C:/localProjects/diskSteward/agent/create_worktree.py` (it admits the checkout
against the disk reserve and records custody). Every commit is pushed
forward-only to origin (KatsuJinCode/decko-ts, private).

## Why this round is not the round the ask named

The ask this lane was handed said: the [Family] family (72 rows) has 48 of 72
rows adjudicated through tranche 6, "possibly more through tranche 7", and to take
the next eight unadjudicated rows in row-id order from the newest routes-family
tip, checking `port/routes-tranche7-20261021` first and
`port/routes-tranche6-20261021` (tip `e87290a51`) second.

**Both of those are stale, and the row list is empty.** This lane re-derived the
state instead of reading it off the ask, and the derivation is mechanical: read the
family's OWN commit subjects (the commits whose subject begins with "[Family]"),
keep the distinct register-routes row ids they name, and compare that set with the
register's own row inventory.

| Branch tip | Distinct row ids named by the family's own commits | Remaining |
| --- | --- | --- |
| `port/routes-tranche-20261020` | 16 | 56 |
| `port/routes-tranche4-20261021` | 24 | 48 |
| `port/routes-tranche5-20261021` | 32 | 40 |
| `port/routes-tranche6-20261021` | 40 | 32 |
| `port/routes-tranche7-20261021` | 48 | 24 |
| `port/routes-tranche8-20261022` | 56 | 16 |
| `port/routes-tranche9-20261022` | 64 | 8 |
| `port/routes-tranche10-20261022` | 72 | 0 |

The register's own inventory (the completeness roster's [Family] family, read at
`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`, the
roster's own `at` stamp 2026-10-23T05:02:37.512Z) holds exactly those 72 rows:
A1-A23, B1-B14, C1-C17, D1-D5 and E1-E13. So:

1. **The ADJUDICATION is complete.** Every one of the 72 rows is named by a
   "[Family]" commit at the newest tip. There is no unadjudicated row left to
   take, and the ask's own eight-row selection rule therefore yields nothing.
   The eight rows the ask's baseline would have selected are also already
   landed: the tranche-7 baseline's next eight in row-id order are A23, B7, B10,
   B11, C16, C17, D1 and D2, and every one of them was adjudicated on 2026-10-22
   (A23, B7, B10, B11, C16 and C17 by tranche 10; D1 and D2 by tranche 8).
2. **What remains is CLOSURE.** 35 of the 72 rows sit at WORKING ON IT in the
   roster. For the four rows this lane took, the named open item is NOT a
   measurement gap: it is that the row's landed body is not observable in the
   canonical tree (the roster fold's rule B1, `git merge-base --is-ancestor`
   against `C:/localProjects/decko-ts-release-lead`'s HEAD), which the
   integration lane owns.

This lane therefore took the eight rows the family has not closed, in row-id
order, and ran the per-row protocol on each: capture the pinned oracle evidence
through the shared rig, pin the oracle-matched test, close the row where the port
matches the Ruby oracle, measured-skip-and-name where it cannot.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| A2 the explicit file route | `52c6b019f` | CLOSED, with the pinned dispatch's REGISTERED-FORMAT cell newly pinned on the port's side. The pinned deck's own dispatch (card_controller/response.rb:102-109) sends an explicit file request to the file sender even when the requested format is a registered one (`explicit_file_format?(rf) ? :file : rf.to_sym`); the capture records both halves of that cell, and the port's side of it was not pinned before this round. Measured in this lane: GET /files/~7/12.html answers 200 and the STORED bytes (the PNG magic, byte for byte), the store asked for the rev id 12, no size segment. The one named divergence stays as it is (the pinned route's mark requirement is /[^-]+/, so a dashed mark does not match the files route in Ruby; the port keeps the dash and serves the file, deliberately, because the pinned requirement would send a dashed card's attachment URL to the bad_address view). |
| A4 the three deprecated asset routes | `782fc55eb` | CLOSED on the pinned card#asset answer, verified on the port's server and host legs. The pinned method (card_controller/rest.rb:22-27) renders the fixed body "Decko installation error: missing public directory symlinks" at 404 and raises nothing, and the controller's before_action table excludes :asset from setup, authenticate and load_card, so the arm runs ZERO deck-state before_actions against the five a read runs. The port answers the same body at the same status for each of the three prefixes, the edge host and the staging host answer it too, and the prefix set the port serves is read off the pinned capture's own route list rather than from a constant. |
| A7 the type/:type read route | `97f9df31a` | CLOSED, and the row's verdict is corrected from PARTIAL to PORTED. The register's suggested fix ("renders the type's Search card") is WITHDRAWN by measurement: nothing in the pinned gemset reads params[:type] except the card's own fetch options, and the pinned deck answers the HOME card's page (the route is a get to card#read with no view and no mark, it is the deck's ninth route, matched before the generic ":mark/:view" arm and before the wildcard). The port answers the home card's page. |
| A8 the :mark/view/:view arm | `0b4e75a6e` | MEASURED SKIP-AND-NAME. The arm's .json half is closed (the suffix splits into the format, the two-segment arm's rule). The .rss half is not: the pinned route's .:format capture rides the VIEW segment for every format, and the port's three-segment arm splits .json and leaves every other suffix in the view segment. Measured in this lane on the port's grammar: parsePath("/Front/view/related.rss") answers {name: "Front", view: "related.rss"} and parsePath("/Front/view/open.rss") answers {name: "Front", view: "open.rss"}. The pinned rss format declares thirteen views (feed, feed_body, feed_title, feed_item, feed_item_description, feed_description, comment_box, menu, open, content, open_content, closed), and a suffixed name is none of them, so the port's request cannot reach a view the rss format declares. The new leg in the row's parity test pins the measured cell, so the gap is a measurement on both sides. Not closed here because the rss format's own surface is the rss row's, and that row is itself open on the roster: splitting .rss on this arm without the rss surface settled would move the request from the engine's unsupported-view answer to an answer this lane has not measured, which is the one thing the parity law forbids. |
| A9 the card/:view route | `e8f1bc737` | MEASURED SKIP-AND-NAME, two named divergences re-measured on the port's grammar in this lane. (1) THE MARKLESS SHAPE: the pinned route's :mark is OPTIONAL, so /card/edit carries no mark and implicit_mark lands on the home mark (the HOME card's edit view); the port's two-segment arm answers the card named "card" in view "edit" (parsePath("/card/edit") -> {name: "card", view: "edit"}). Closing the cell means giving the two-segment arm the request core's bare arm's async home resolution, which changes what a markless two-segment path means for every path of that shape. (2) THE CONSTRAINT: the pinned requirement is /new|edit/ and it is UNANCHORED, so it admits "editing" and "newer" too; the port admits the exact segment "edit" and carries "new" on its own new-card arm, so widening the port's arm would collide with that arm. The row's marked shape matches the pinned deck and is pinned (the edge renders /card/edit/<mark> byte-equal to /<mark>?view=edit). |
| A12 the markless delete route | `cf63e2946` | MEASURED SKIP-AND-NAME. The marked half matches the pinned deck and is pinned (DELETE / with a card[name] body trashes that card and redirects at 303). The cell that does not match: the pinned controller runs load_mark ONLY for the read action, so a write never reaches implicit_mark; a write's mark is the URL mark or the body's card[name], and with neither the pinned name is the EMPTY name, the fetch finds no card, and the controller raises Card::Error::NotFound (the pinned 404). The port's markless write arms fall back to the *home rule's card when the body carries none, which is implicit_mark, a method the pinned controller never runs for a write. Measured in this lane over the port's own HTTP write surface: DELETE / with no body answers 422, with the mark resolution aimed at the rule-named card. The fix is the markless write arms taking the mark from the body only and answering the pinned 404, which is the markless-update row's own arm; it changes what a bodyless DELETE / does to a live deck, so it is named and not taken. |
| A13 the typed create route | `4779a0c49` | CLOSED. The pinned route is registered at order 15, before the marked create; the create action rides NO load_mark; the type rides uri_fetch_opts' ||= (the body's card[type] wins, the URL segment is the fallback); and the route declares NO .:format capture, so a suffixed segment stays IN the type (the recorded Card.new ask for the suffixed segment is {type: "Foo.json", name: ""}). The port matches every cell: POST /type/<x> classifies as the typed create, the bare /type stays the marked create of the card literally named "type", the segment rides verbatim, and the underscore fold stays the name-resolution layer's business because the pinned params[:type] is unfolded. The json-shaped responses on the MARKED create belong to the .:format routes' response-format surface and are named here so they are not lost; they are not this row's subject. |
| A17 the GET action routes | `cef93a0b6` | MEASURED SKIP-AND-NAME. The port's two read halves match and are pinned: the grammar answers the read and asset spellings (/read/Front, /read, /card/read/Front, /card/read, /asset, /card/asset) and the edge and staging hosts serve them, against the pinned facts that the read action renders the card's page with NO view default and that the asset action answers the fixed installation-error 404 with no deck-state before_action at all. The cell that does not match: in the pinned deck the create and delete GET alternatives SAVE and DELETE a card on a plain link click (the capture records card.save! with a 303, the new_card?/update! chain, and card.delete! with a 303). The port keeps those two off the plain-link surface on purpose (its recorded hardening is same-origin-XHR-only for GET mutations), so /create/<x> and /delete/<x> fall through to the generic two-segment arm and are read as a card named "create" in view "<x>" (parsePath("/create/New") -> {name: "create", view: "New"}). Admitting them would remove the port's recorded hardening, and the register's own suggested fix is a hardening change rather than a port. |

**Four rows closed (A2, A4, A7, A13), four rows skipped and named with their
measured mechanism (A8, A9, A12, A17).**

## The instrument: what was shared, what was added, what was not touched

The shared loading rig (`tests/server/oracle-capture-pinned-deck-harness-ruby.rb`)
and the shared candidate reduction
(`tests/server/pinned-route-table-candidate-reduction-ruby.rb`) are UNTOUCHED by
every commit in this round. Both were already present in the tree this round
branched from, so nothing was copied in.

Two files changed, both test files, both oracle-matched test files:

- `tests/server/explicit-file-route-parity.test.ts` (row A2): one new leg pins
  the port's side of the pinned dispatch's registered-format cell.
- `tests/server/mark-view-view-route-parity.test.ts` (row A8): one new leg pins
  the measured .rss cell, so the named gap is a measurement on both sides.

The other six row commits are the lane's own named records (empty commits with
the row's evidence in the message), which is the shape the family has used
before for a row whose verification was already complete.

## Captures: byte-stable on re-run, all eight verified in this lane

Every row's capture script was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` and compared with its
committed fixture, byte for byte:

| Row | Capture | Committed fixture md5 | Re-run |
| --- | --- | --- | --- |
| A2 | `oracle-capture-explicit-file-route-ruby.rb` | `e2d644d0e5d0b647b1176c0150dada3f` | IDENTICAL |
| A4 | `oracle-capture-deprecated-asset-routes-ruby.rb` | `d981e0f17738f3bfb29f65219bf897e5` | IDENTICAL |
| A7 | `oracle-capture-type-route-ruby.rb` | `1dbcd8e4d7abd00c7b562300426a0f12` | IDENTICAL |
| A8 | `oracle-capture-mark-view-view-route-ruby.rb` | `adae3a1301d3c2dc05dd5400fde60c10` | IDENTICAL |
| A9 | `oracle-capture-card-view-route-ruby.rb` | `169023f5bdba38fcec0612055eb18e00` | IDENTICAL |
| A12 | `oracle-capture-markless-delete-route-ruby.rb` | `a13d96fc044c8e353ac660fb48c32242` | IDENTICAL |
| A13 | `oracle-capture-typed-create-route-ruby.rb` | `215d69c95beccb3a1f0857f8bddb35a4` | IDENTICAL |
| A17 | `oracle-capture-get-action-routes-ruby.rb` | `3385ee47f540b9f3ac5f52916bf97f8a` | IDENTICAL |

## Battery (final state, run in this lane, exit codes and counts read directly)

- **The round's own battery** (the nineteen files the eight rows rest on): **19
  files passed, 118 tests passed, 0 failed** (16.7s). The eight rows' server
  parity files, the nine host legs they depend on, and the two write-path suites
  the markless and typed create arms live in.
- **Per row**, the battery at that row's own commit is in that row's commit
  message.
- `npx tsc --noEmit`: **exit 0, zero output lines**, the exit code read
  directly from tsc and not through a pipe.
- The full `tests/server/` suite was run once in this lane after the two test
  edits: **124 files passed, 1 skipped (125); 1222 tests passed, 14 skipped, 0
  failed** (131.6s, exit 0). The one skipped file is
  `tests/server/edit-session-replay.test.ts`, which the runner reports as
  "needs data or setup that a clean clone does not have". The count is the
  tranche 10 tip's 1220 plus this round's two new legs.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned gemset or
the port's own source.

## What this round did NOT land, named

- **A8** the .rss suffix cell on the three-segment arm, and the staging host's
  segment-count gate on the same shape. The rss format's own surface is the rss
  row's, and that row is open.
- **A9** the markless /card/edit shape (the two-segment arm has no async home
  resolution) and the unanchored /new|edit/ constraint (widening it collides with
  the port's new-card arm).
- **A12** the markless write arms' fallback to the *home rule's card where the
  pinned deck answers the empty name and the 404. The fix is the markless-update
  row's own arm and it changes what a bodyless DELETE / does to a live deck, so
  the operator's yes belongs to it.
- **A17** the create and delete GET halves on the plain-link surface. Admitting
  them would remove the port's recorded same-origin-XHR-only hardening for GET
  mutations.
- **A2** the dashed-mark cell, deliberately: the port is more permissive there
  on purpose.
- The roster fold itself: the roster lives in the other repo and is folded by
  that repo's own guarded scripts. This round's dispositions are fold inputs.
  Rule B1 of that fold still needs this branch to be an ancestor of the
  canonical tree, and the integration lane owns that.

## Disk

Added: the lane's own checkout `C:/localProjects/decko-ts-routes-round3-20261023`
(a git worktree of the routes family's trunk clone, with node_modules copied in
from the tranche 8 clone, no network) plus eight commits and this report.
Moved out of the checkout: this lane's scratch directory `.tools-tmp/` (the
re-run captures, the probe script and the commit-message drafts, 88,084 bytes),
ARCHIVED rather than deleted into
`/tmp/decko-ts-routes-round3-20261023-temp-archive/scratch`, so the checkout
carries none of it and none of its bytes is lost. Nothing else was created, and
no process outlives this lane.
