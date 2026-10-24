# Routes round ten, 2026-10-24: A12 closes on parity, and the family reaches its true floor

Lane: `port/routes-a12-20261024` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-a12-20261024`, branched at
`836b9b67b62e7224272297b1a4041e4583914370` (the round-nine tip, the
newest pushed routes tip: `git ls-remote --heads origin 'refs/heads/port/routes-*'`
reads `port/routes-round9-20261024` at that hash, and it is the newest
commit of that family by date). node_modules came across from the
round-nine checkout as a local copy, with no network. Every commit is
pushed forward-only to origin (KatsuJinCode/decko-ts, private: `gh repo
view KatsuJinCode/decko-ts --json isPrivate` reads `true`).

Family state at the start of this round, read from the round-nine receipt
(the same family's own count): 72 rows, 68 DONE, 4 open. The open rows
were A12 (operator decision), B9 and B10 (operator and named flags), and
C10 (measured skip).

One commit carries the fix, the pinned tests and this receipt, so the
landing is the branch tip of `port/routes-a12-20261024` on top of the
round-nine tip.

## The row this round took

| Row | Disposition |
| --- | --- |
| A12 the markless delete route | CLOSE ON PARITY, on a landed change. The markless write arms take the mark from the BODY only, and a body-less markless write answers the pinned 404. The destructive divergence the row carried is closed, and it is named below so the next reader does not have to re-derive it. |

## The operator's ruling, and what it releases

The operator's ruling of 2026-10-24, in the brief that sent this lane:
port everything exactly, and allow an exception only where Ruby's own
behaviour is flat wrong, broken or destructive, documented when one is
allowed.

A12 is not an exception case. The pinned Ruby behaviour is the correct
one here and the PORT was the destructive side: on a deck whose `*home`
rule names a LIVE card, a body-less `DELETE /` trashed that card where
the pinned deck answers 404. So the ruling releases the row's
operator-decision flag in the only direction it can be released, and the
port is brought onto the pinned answer exactly.

## The pinned answer (the evidence)

The pinned deck's own sources, read in the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`:

- `decko-0.20.0/lib/card_controller.rb:22` is
  `before_action :load_mark, only: [:read]`. The mark is loaded for the
  READ action only.
- `decko-0.20.0/lib/card_controller/mark.rb:28-40` is `implicit_mark`,
  and `mark.rb:42-44` is `home_mark`
  (`Card::Rule.global_setting(:home) || "Home"`). Both live behind
  `load_mark`, so a WRITE never reaches either of them.
- `card-1.110.0/lib/card/fetch/card_class.rb:118-126` is
  `standard_uri_fetch`, whose line 119 is
  `mark = params[:mark] || card_opts[:name]`, and
  `card_class.rb:128-133` is `uri_fetch_opts`, whose line 131 fills
  `opts[:name]` from the body's `card[name]` or from the URL mark. A
  write's mark is therefore the URL mark or the body's `card[name]`, and
  with NEITHER the mark is the EMPTY name.
- `decko-0.20.0/lib/card_controller/rest.rb:49-54` is `load_card`
  (`raise Card::Error::NotFound unless card`), and
  `card-1.110.0/lib/card/error.rb:88-90` gives `NotFound` the status
  404.

The two committed captures carry the same facts in the pinned deck's own
executed words:

- `fixtures/captured/markless-delete-route-ruby-oracle.json` (row A12)
  records the pinned before_action table, where the `delete` action's
  list is `setup, authenticate, load_card, refresh_card` and `load_mark`
  appears only under `read`; it records the fetch options, where the
  label "neither: no mark and no card name" carries `opts {"name": ""}`;
  and it records the fetch result for a mark that names no card as
  `nil`.
- `fixtures/captured/markless-update-verbs-ruby-oracle.json` (row A11)
  records the update action's before_action list with no `load_mark` in
  it, and the fetch ask for a body-less write: `mark ""`,
  `new {"name": ""}`.

## What landed

1. THE MARKLESS UPDATE ARM (`src/server/write-routes.ts:2009-2015`):
   the mark is the URL mark, else the body's `card[name]`, and with
   NEITHER the arm raises the not-found error
   (`CardActionError("not-found", "no card name in request (no mark, no card[name])")`,
   the 404). The `*home` rule fallback is gone from the arm.
2. THE MARKLESS DELETE ARM (`src/server/write-routes.ts:2164-2169`): the
   same rule, the same 404, and no card is looked up, so no card can be
   trashed.
3. The `homeMarkContent` import is gone from the write path (it sat at
   `src/server/write-routes.ts:124` before this landing). The helper
   itself stays in `src/card/render/page.ts:1269`, because it is the
   port's `home_mark` seam for the READ path, which is row B9's own
   subject and stays named.

The arms that carry a mark are untouched: a URL mark still wins, and the
body's `card[name]` still wins over it. The marked delete and the marked
update answer exactly as before.

## Before and after, measured on the port's own HTTP write surface

Both columns were measured in this lane, over the shared write-route
bridge, on the row's own deck (a `*home` rule naming a live card called
`Target`, plus a live `Home`).

| Request | Port BEFORE the landing | Port AFTER the landing | Pinned Ruby |
| --- | --- | --- | --- |
| `DELETE /` with no body, `*home` names a LIVE card | 303, and the live rule-named card's trash flag is set to 1 | 404, and no card is trashed | 404 |
| `DELETE /` with no body, `*home` names an already trashed card | 422 USERERROR (the arm aimed at the rule-named card) | 404 | 404 |
| `DELETE /` with no body, `*home` blank | 303, and `Home` is trashed | 404, `Home` survives | 404 |
| `PUT /` with no body name | 303, and the rule-named card's content is overwritten | 404, and no card's content changes | 404 |
| `PUT /` with `card[name]` | 303, that card updated | 303, that card updated | 303 |
| `PUT /` with `card[name]` for a MISSING card | (not reachable before: the arm aimed at the `*home` card) | 303, the card is created | 303 |
| `DELETE /` with `card[name]` | 303, that card trashed | 303, that card trashed | 303 |

## The pinned failing test, first

The destructive case was pinned before the fix, and it fails without it.
In this lane the fix was put back to its pre-landing shape and the
pinned tests were run against it:

```
npx vitest run tests/server/markless-delete-route-parity.test.ts tests/server/write-routes-markless-implicit-mark.test.ts
Test Files  2 failed (2)
     Tests  7 failed | 9 passed (16)
```

The failures were the destructive case and its kin, with the raw
assertions:

- "THE DESTRUCTIVE CASE, CLOSED: a bodyless DELETE / trashes nothing":
  `expected 303 to be 404`
  (`tests/server/markless-delete-route-parity.test.ts:279`);
- "the port matches the pinned deck: with no body name the delete answers
  the pinned 404": `expected 422 to be 404`
  (`tests/server/markless-delete-route-parity.test.ts:263`);
- "no mark, no card[name]: the pinned write fetches the EMPTY name and
  answers the 404": `expected 303 to be 404`
  (`tests/server/write-routes-markless-implicit-mark.test.ts:189`);
- "card[name] in the body wins the mark (mark_from_card_hash first)":
  `expected 'updated through the rule' to be 'Target body original'`,
  the rule-named card's content carried the earlier leg's write;
- "the port answers the pinned 404 where the pinned write raises
  NotFound": `expected 303 to be 404`;
- "no body: there is no mark, so the pinned 404 and nothing is trashed":
  `expected 422 to be 404`;
- "a blank *home rule: the bodyless DELETE still trashes nothing":
  `expected 303 to be 404`.

THE BLAST RADIUS, MEASURED DIRECTLY. The pre-landing test file
(`tests/server/markless-delete-route-parity.test.ts` at the round-nine
tip) was run against the pre-landing source in this lane, as a temporary
copy under `tests/server/`, and its blast-radius leg PASSED there:

```
npx vitest run tests/server/a12-blast-radius-baseline.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

That leg is named "NAMED REMAINDER, BLAST RADIUS: with a LIVE home card
the port's bodyless DELETE trashes it", and it asserts the 303 AND
`trash === 1` for the card the `*home` rule names. So the destructive
behaviour was observed in this lane, not only described: the pre-landing
port answered 303 and set the trash flag on a live card. The temporary
copy was moved out of the tracked tree afterwards, and the source was
restored byte-identically (md5 `9eb798f81dd7a6db1717ae7c5011e0a8` before
and after).

The pinned legs after the landing (the same two files, the fix in place):

```
npx vitest run tests/server/markless-delete-route-parity.test.ts tests/server/write-routes-markless-implicit-mark.test.ts
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

## The captures

The port's own surface quotes moved with the landing: the write path
lost one import line, so the quoted block in the register-routes capture
sits one line higher. The capture was re-run against the pinned gemset
and the fixture was committed with the new lines, so every quoted line in
it is the line the file carries now.

```
DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
  ruby tests/server/oracle-capture-register-routes-remaining-eight-ruby.rb \
  > tmp-a12-tools/a12-capture-rerun.json
```

The re-run and the committed fixture agree byte for byte:
md5 `5f55c3d81e2775e17dcfe12c0714737d` for both. The fixture before this
round was md5 `2f16da17896772deea8f1dda7d60b536` (the round-nine tip),
and the diff over the two files is 9 lines changed and 9 lines changed:
the quoted line numbers alone, and the quoted text is the same block.

The two A12 and A11 captures were NOT re-committed: the fix changes the
port's behaviour, not the pinned deck's answers, and the committed
fixtures still hold.

## The battery

- **The full `tests/server/` suite**, run in this lane on the landing
  bytes: `npx vitest run tests/server/` -> **127 files passed, 1 skipped
  (128); 1318 tests passed, 14 skipped (1332); 0 failed**, exit 0, in
  164 s. The one skipped file is
  `tests/server/edit-session-replay.test.ts` ("needs data or setup that
  a clean clone does not have"), the same skip the round-three to
  round-nine receipts record. The count is the round-nine tip's 1318
  passed plus zero: this round rewrote legs in place instead of adding
  files, so no count moved.
- **TSC**: `npx tsc --noEmit` -> **exit 0, zero output lines**.
- No server was left behind by the run: the machine's own process audit
  (`node C:/Users/jpswi/.zcode/tools/process-hygiene-registry.mjs audit`)
  lists no process in this lane's checkout.

## The family count after this round

72 rows. **69 DONE, 3 open**: B9 and B10 (untouched, kept named with
their operator and named flags) and C10 (untouched, kept named with its
measured-skip flag).

**THE FAMILY IS AT ITS TRUE FLOOR.** Every row that remains open is a
named or operator-held row, and the last takeable row is closed on a
measurement.

THE COUNT HAS TWO SOURCES, and they are not the same number, so both are
recorded here. The family's own receipts carry 69 of 72 (this receipt
and the round-nine receipt before it). The completeness roster's own
file (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`,
`at` stamp 2026-10-24T13:05:36.247Z) carries 62 DONE and 10 WORKING ON
IT, because its buckets follow the CANONICAL tree and not the family
branches: its own D3 entry still reads "that gap is still open in the
canonical tree". This landing is on the routes-family branch, so the
canonical-tree fold is the release lead's step and the roster will move
when that fold runs.

## What this round did NOT land, named

- **B9, B10, C10**: untouched, kept named with their flags. B9 is the
  READ path's `implicit_mark` home fallback, and this landing does not
  touch it: the write arms no longer consult the `*home` rule, and the
  read path still does.
- **A17's create and delete GET arms**: still named, as the round-eight
  receipt records them. The round-eight receipt also records that the
  fix this round took was "mechanically available", and that is what
  this landing is.
- **The rounds before this one's named remainders**: untouched, still
  named.

## Disk

Added: the lane's own checkout `C:/localProjects/decko-ts-routes-a12-20261024`
(a `git init` plus one targeted fetch of the round-nine tip, an
unshallow, and node_modules copied in from the round-nine checkout, no
network) at 4.6 GB in total (node_modules 4.0 GB, the rebuilt dist is
gitignored), one commit, this receipt and the row's test pins.

Moved out of the checkout: this lane's scratch directory `tmp-a12-tools/`
(the capture re-run, the battery logs, the pre-fix source copy and the
pre-fix test copy), ARCHIVED to
`C:/localProjects/decko-ts-lane-archives/routes-a12-20261024-tools-tmp/`
rather than deleted, so the checkout carries none of it and none of its
bytes is lost.

The checkout itself is pushed (forward-only, to a private remote) and
carries no uncommitted change, so the machine's own idle sweep owns its
removal.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, the port's own test storage, or a locally
booted host.
