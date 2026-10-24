# Routes round six, 2026-10-23: the two rows with an unblock condition land, four rows close on parity with their pins strengthened

Lane: `port/routes-round6-20261024` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round6-20261024`, branched at
`f1a5ed4aab9fbf2032043cd2e86a3231671fbcf7` (the round-five tip, the newest
pushed routes-family tip: `git ls-remote origin 'refs/heads/port/routes-*'`
read `port/routes-round5-20261023` at that hash, and round four's
`3f719bc7` is its ancestor). The checkout was created with `git init` plus a
targeted fetch of that one tip, because the machine's disk gate refuses a
second full clone of a repository the machine already holds; node_modules
came across from the round-five checkout (robocopy, 6126 files, 649.76 MB,
no network). Every commit is pushed forward-only to origin
(KatsuJinCode/decko-ts, private).

Family state at the start of this round, read from the completeness
roster's own file
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`,
`at` stamp 2026-10-23T21:43:41.945Z): 72 rows, 41 DONE, 31 WORKING ON IT,
0 BLOCKED. The roster's rows are the 72 register-routes rows A1-A23, B1-B14,
C1-C17, D1-D5 and E1-E13.

## The six rows this round took, and how they were chosen

The rows are the next six open rows in row-id order, with the rows already
taken by the round lanes (three, four, five) and by the tranches excluded.
Rounds three, four and five took A2, A4, A7, A8, A9, A12, A13, A17, A18, A22,
A23, B5, B6, B7, B8, B9, B10, B11, B13 and C3; the tranches took the rest of
the register-routes family. The next six open rows in row-id order are
therefore:

| Row | Commit | Disposition |
| --- | --- | --- |
| C4 the `reload` JSON arm | `b9d3f0d5` | CLOSE on the row's subject, with the case-sensitive cell now pinned on the port's HTTP layer. The route-level honor rides every save arm; the row's remaining item is NOT a route cell (the PORTED asset/layout mod views do not emit `success[reload]` in their forms - the mods family's emission concern) and is named, not closed. |
| C5 the `slotter_magic?` arm | `a565a17d` | CLOSE on the row's subject, with a GAP FOUND AND LANDED: the SESSION-card save path answered the redirect where Ruby answers `{magic: true}` (rest.rb:80-89's `cud_success` is the shared ladder for create, update and delete). The exact-spelling cells are now pinned on the HTTP layer. |
| C6 the Home mark | `f41639d4` | CLOSE on the row's subject, with the dependency that makes the read follow an edit now pinned: the read goes through the engine's fetcher, so a rule edit is visible once the write path's expiry has run. |
| C7 the markless `PUT /` | `765f104c` | CLOSE on the row's subject, with the row's remaining cell NAMED as the divergence it is: the pinned body-less write fetches the EMPTY name and raises NotFound, while the port aims at the implicit mark. The change that would close it changes what a body-less PUT does to a live deck, so it belongs to the operator-decision row (A12's delete half) and is not taken here. |
| C8 the `cud_success` flavor lattice | `f10e91cd` | CLOSED on the row's unblock condition: the soft arm now reaches a normal request, because the pinned flavor switch applies the envelope's override regardless of ajax. The delete rewrite keeps its precedence. |
| C10 the NotFound 404 + `:not_found` view | `d56fb782`, correction `a8dbc7b9` | CLOSED on the row's unblock condition: the page entry point offers the unknown main card to the format, so the port's main+root `view_for_unknown` arm answers `:not_found` and writes the 404 the pinned one writes. |

**Four rows closed on parity with their pins strengthened (C4, C5, C6, C7),
two rows closed on their unblock condition (C8, C10), and one named
remainder inside the six (C7's body-less cell, and C4's mods-emission
item).**

## What landed, row by row

### C10: the unknown main card reaches the format

The row's unblock condition was that the render entry points offer an
unknown main card to the format, so the port's main+root `view_for_unknown`
arm answers `:not_found` and writes the 404 the way the pinned one does.
The port's page render refused the card first - `page.ts` raised `card not
found: <name>` before a RenderFormat was built - so the format's own arm
(`src/card/render/format.ts` `viewForUnknown`, the block that writes
`pageErrorStatus`) was unreachable. The PINNED format
(`card-1.110.0/lib/card/format/error.rb:18-25`) answers `:not_found` and
writes `root.error_status = 404` with no exception anywhere and without
reading the card.

The landing: the page entry point admits the uri_fetch new-card record when
the fetch misses (the controller's own `Card.fetch` idiom,
`card_class.rb:104-133`), the main render carries `params.absentCard` (the
seat that works when the engine keeps `renderAbsentCards` off, which is the
hosts' posture), and the substituted-view gate now tells a SETTLED create
denial (the rendered not_found page at 404 is the answer) from an
UNRESOLVED verdict (the settle flow's control transfer, the create-form
arm's own path).

The pinned side of the answer, read from Ruby's own RECORDED render
(`reference-harness/fixtures/synthetic-v1/expected/render.jsonl.gz`, the
`page:anonymous:Nonexistent Card` row): the article carries
`<div id="main">` and the not_found frame - the "Not Found" title, the
"Could not find" body naming the card, the `not_found-view` slot class. The
port's page for the same card still equals those recorded bytes (the
fresh-deck absent-cards suite, 12 cases, run in this lane).

The correction commit `a8dbc7b9` is the row's tsc record: the landing
admitted the record through a reassigned `let`, which drops TypeScript's
property narrowing of `record.name`, and `npx tsc --noEmit` found twelve
TS18048 errors and one TS2345 in the same file. The vitest battery never
saw them (vitest transpiles without type checking), and the staging
server's own dist build failed on them. The admission is now const-shaped
and `npx tsc --noEmit` exits 0 with no output.

### C8: the soft arm reaches a normal request

The pinned flavor switch (`response.rb:25-33`) is `redirect_type =
success.redirect || default_cud_success_redirect_type` and then `if
redirect_type.to_s == "soft"`. The DEFAULT asks `Card::Env.ajax?`
(`response.rb:35-37`), so ajax answers soft and a normal request answers
hard ONLY when the envelope carries no override; an explicit
`success[redirect]=soft` therefore takes the soft branch on a normal
request too, and the soft branch re-renders the target's view at 200 with
no redirect at all. The port's slot arm was gated on `isAjax`, so that
request answered the 303 - the divergence the row carried since tranche 7.

The landing reads the flavor switch's own answer: the envelope's redirect
answer is FALSE for an absent key and for an empty string (the pinned
`Success#redirect` uses `present?`, so an empty redirect is not an
override - the capture's own "|| GAP" row), and the exact, case-sensitive
`soft` string is the only override that takes the soft branch. The DELETE
REWRITE keeps its precedence: `configure_successful_deletion`
(`location_history.rb:12-17`) runs BEFORE `cud_success` (the `:finalize`
event) and rewrites the deleted card's own success to `redirect = true`,
so a delete's flavor is hard and it answers the 303 to `:previous`.

### C5: the slotter rung on every save arm

`rest.rb:80-89`'s `cud_success` is the SHARED answer for create, update and
delete (`rest.rb:75-79`'s `handle`). The port's `cud_success` lattice
answers `{magic: true}` on every ordinary save, but the SESSION-card save
path answered the redirect where Ruby answers `{magic: true}`. The path now
answers the rung, in Ruby's order.

### C4, C6, C7: the pins

- C4: the pinned predicate is an EXACT, case-sensitive string compare
  (`env/success.rb:41-43`), and the capture records the cell `TRUE` as
  answering false. The port's own check is the same exact compare, and the
  cell is now pinned on the real HTTP write surface.
- C6: the read follows the rule through the write path's expiry. Both
  halves are measured on one engine: a raw database edit with NO expiry is
  invisible to the read (the fetcher's card entry is cached), and the same
  edit with the write path's expiry - what every save on the port performs
  on the card it wrote - is visible.
- C7: the row's own capture is now read inside the row's own test, so the
  pinned side and the port's side sit in one place, and the body-less cell
  is named as the divergence it is.

## Captures: re-run in this lane, against the pinned gemset

Every capture below was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` (68 gems,
actionpack-7.2.4 present) and compared with its committed fixture, byte for
byte; Ruby 3.4.11 on PATH, no Rails, no database.

| Capture | Committed fixture md5 | Re-run |
| --- | --- | --- |
| cud-reload-slotter (C4, C5) | `85cd510189ef4bbfb483e802f2db43ad` | IDENTICAL |
| home-mark (C6) | `1b6b6df083ec6e42615e59fbc360019b` | IDENTICAL |
| markless-update (C7) | `786075b0f57c10a7dcf501f41fa05da4` | IDENTICAL |
| markless-update-verbs (C7) | `a5a1ab06dca189943cb3f778bed162a1` | IDENTICAL |
| cud-success-redirect-lattice (C8) | `3171cfa634f0d75f8955a51db72f3a51` | IDENTICAL |
| not-found-404-view (C10) | `68a500debec8e7eac4dbb9d3c7633797` | IDENTICAL |

## The battery (final state, run in this lane)

- **The full `tests/server/` suite**: **124 files passed, 1 skipped (125);
  1248 tests passed, 14 skipped, 0 failed**. The one skipped file is
  `tests/server/edit-session-replay.test.ts` ("needs data or setup that a
  clean clone does not have"), the same skip the round-three, round-four
  and round-five receipts record. The count is the round-five tip's 1242
  passed plus this round's six new legs (C4 one, C5 two, C6 one, C7 one,
  C8 one, C10 the flipped divergence case rewritten in place).
- **Per row**, the touched-file battery at that row's own commit:
  - C4: `npx vitest run tests/server/write-routes-cud-reload-slotter.test.ts`
    -> 1 file passed, 7 tests passed, 0 failed.
  - C5: `npx vitest run tests/server/write-routes-cud-reload-slotter.test.ts
    tests/server/write-routes-session-card.test.ts` -> 2 files passed, 16
    tests passed, 0 failed.
  - C6: `npx vitest run tests/server/home-mark-parity.test.ts` -> 1 file
    passed, 6 tests passed, 0 failed; and the two host arms of the same
    row, `npx vitest run tests/deploy/bunny-edge-home-mark.test.ts` -> 1
    file passed, 4 tests passed, and `npx vitest run
    tests/deploy/staging-home-mark-endpoint.test.ts` -> 1 file passed, 4
    tests passed.
  - C7: `npx vitest run tests/server/write-routes-markless-implicit-mark.test.ts`
    -> 1 file passed, 7 tests passed, 0 failed.
  - C8: `npx vitest run tests/server/cud-success-redirect-lattice-parity.test.ts`
    -> 1 file passed, 21 tests passed, 0 failed.
  - C10: `npx vitest run tests/server/not-found-404-view-parity.test.ts` ->
    1 file passed, 14 tests passed, 0 failed; and `npx vitest run
    tests/card/render/fresh-deck/absent-cards.test.ts` -> 1 file passed, 12
    tests passed (the port's page for an unknown card against Ruby's
    RECORDED render).
- `npx tsc --noEmit`: **exit 0, zero output lines**, read directly from
  tsc. `npx tsc -p tsconfig.json` (the staging bootstrap's own recipe):
  **exit 0**.
- The date gate on this receipt: `node
  C:/localProjects/brandonDojoTech/tools/meeting-date-gate.mjs
  docs/reports/routes-round6-2026-10-23.md --today "Friday 2026-10-23"` ->
  **DATE GATE PASS** (the machine clock reads 2026-10-23).

## A defect found in the shared staging bootstrap, named for the record

The staging dist bootstrap's readiness gate
(`tests/card/auth/staging-server-dist-bootstrap.ts`) checks that every dist
module the server imports EXISTS and is non-empty, but not that its content
is CURRENT. This round's C10 landing added no export, but the row's own
first landing broke the dist BUILD (the type errors above), and the
bootstrap's `tsc -p tsconfig.json` failed inside the suite's beforeAll,
which failed the staging-boot suites with a wall of missing-dist-module
names. The gate's currency gap is the same shape the round-five receipt
named, and it is still open for the harness lane that owns it.

## What this round did NOT land, named

- **C7's body-less markless PUT**: the pinned write fetches the EMPTY name
  and raises NotFound; the port aims at the implicit mark. The change that
  would close it changes what a body-less PUT does to a live deck, so it
  belongs to the operator-decision row (A12's delete half, which keeps its
  operator-decision flag and is not touched here).
- **C4's mods emission**: the PORTED asset/layout mod views do not emit
  `success[reload]` in their forms (the pinned producers are
  `card-mod-assets set/abstract/asset_inputter.rb:78` and
  `card-mod-layout set/right/enabled_roles.rb:44`) - the mods family's
  concern.
- **C10's create-form landing on the hosts' posture**: the hosts' engine
  keeps `renderAbsentCards` off, so no create verdict is consulted there and
  the not-found cell is the one that answers. The `:new-form` arm stays
  row C15's surface.
- **A12**: untouched, kept named with its operator-decision flag.
- **B9's empty-?mark= divergence**: unchanged, and it carries the operator
  decision flag in its own test comments.

## Disk

Added: the lane's own checkout `C:/localProjects/decko-ts-routes-round6-20261024`
(a `git init` plus one targeted fetch, node_modules copied in from the
round-five checkout, no network), the rebuilt `dist/` build output
(gitignored), seven commits, this report and the round's test pins. Moved
out of the checkout: this lane's scratch directory `.tools-tmp-round6/` (the
capture re-runs, the two probes and the battery logs), ARCHIVED to
`C:/localProjects/decko-ts-lane-archives/routes-round6-20261024-tools-tmp/`
rather than deleted, so the checkout carries none of it and none of its
bytes is lost.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, or a locally booted staging server.
