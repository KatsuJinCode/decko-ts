# Row mx-B-110 - the final browser asset audit: the deck rows migrated, the audit green

Row: `mx-B-110-final-main-browser-asset-audit` in the completeness roster
(`docs/registry/completeness-roster.json`, family matrix-journey, bucket
WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check id `B-110`; the action is "no script, stylesheet, font or image failed
during the complete main browser journey".

## What the row asked for

The row's blocker text: "Migrate the remaining widgets.twimg.com rows in
decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 cards.db_content
(same guarded CAS shape as the 2026-10-18 live-deck migration, custody
recovery/release/private-probes/private-tool-repairs-20261018/remote-widget-cas/plan.json)
and re-run the final asset audit."

The triage that produced that text (brandonDojoTech/docs/reports/
matrix-fails-triage-1-2026-10-19.md, row ACT-109) classified the red as deck
DATA, not engine: "Twitter-feed cards embed the retired 2011 widget script
over plain http; browsers refuse mixed content on the https origin; both
engines serve the same content". The live deck was migrated on 2026-10-18
(12 content cells, deck version 52 -> 64); the local working-copy fixture
was not, and the triage reproduced the red at the pure tip - "run 1 audit
FAIL, 28 contexts, 4 failures, all
http://widgets.twimg.com/j/2/widget.js mixed-content".

## What the deck actually held when this lane looked

The triage named 20 fixture rows still embedding the widget: ids 612, 613,
1512, 1513, 1514, 2670-2676, 10207, 13115, 15709, 27782, 44149, 44151,
45757, 46041 (5 of them trashed).

Measured on the fixture at this lane's start, the same query returns
**three** rows, and all three are trashed:

    id 612  name "freeaikitwitterfeed"  trash 1  setUser('freeaiki')
    id 1512 name "GBACtwitter"            trash 1  setUser('gobearsaiki')
    id 2671 name null                     trash 1  setUser('processarts')

So 17 of the triage's 20 had already been migrated (the fixture's own
backup `deck.sqlite3.pre-widget-fallback-20261019` is dated 2026-10-19, and
the migrated cards now carry the fallback link, e.g. id 613:
`\n<p><a href="https://twitter.com/freeaiki">@freeaiki on Twitter</a></p>`).
The row's named work was therefore the three rows that remained.

## The migration this lane applied

`tools/deck-fixtures/migrate-retired-twitter-widget-embeds-cas.mjs` - the
same guarded CAS shape as the 2026-10-18 live-deck migration: ONE atomic
statement whose admission is a MATERIALIZED subquery counting the target
rows whose content still matches the expected pre-image, reading the deck's
version row and counting the version rows; the UPDATE runs only when every
one of those agrees, and it RETURNS the rows it wrote, so a concurrent write
to any target cell aborts the whole migration instead of clobbering it. No
schema, history, name, type or timestamp is touched.

Applied to the fixture with `--include-trashed` (the three remaining rows
are trashed, so they are not served; they are migrated anyway so the fixture
carries no retired widget at all):

- admission: matches 3, deck version 62955, version rows 1, allowed true
- rows written: 612, 1512, 2671 - written content matches the expected
  fallback byte for byte
- deck version after: 62958 (the deck's own version triggers moved it)
- cards still embedding the retired script after: **0**
- the replacement is the shape the already-migrated cards carry, with the
  handle read from the widget's own `setUser('...')` call

Receipt: `docs/reports/receipts/matrix-journey-row-mx-B-110-retired-widget-embeds-cas-2026-10-20.json`.

One receipt caveat, stated rather than hidden: the receipt's
`sha256After` is the main file's hash as it stood before SQLite's
close-time WAL checkpoint, so it equals `sha256Before`; the main file's
hash after the checkpoint is
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`. The
script now checkpoints before hashing, so a later run records both.

## The audit, re-run

The same instrument the triage's failing run used - `node
tools/edge-signed-in-exercise.mjs` - on this branch's base (8268a145,
source files clean, bundle SHA256
`c75e149eceaf074a4fb1cc58b274b42470cfe0df869eb87210e50f7ed35bc378`, a
throwaway copy of the pinned 21676-card deck, headless Chromium): **240 /
242 passed**, and the audit leg is green -

    == final browser asset audit
      PASS  no script, stylesheet, font or image failed across the exercised
      browser contexts

The triage's red (28 contexts, 4 mixed-content failures) does not reproduce
at this base: the fixture's deck rows no longer carry the retired widget
script, which was the whole cause.

## Disposition

- The row's named work is **done**: the remaining widget rows are migrated
  under the guarded CAS, and the final browser asset audit passes at this
  base with the rows gone.
- The row's bucket is unchanged in the roster (this lane does not edit the
  roster); it is ready to move to DONE on the next roster refresh, with
  this receipt and the run report as its evidence.
- The live deck is a different deck and a different authorisation: the
  2026-10-18 live-deck migration is on record (custody
  `brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/remote-widget-cas/plan.json`).
  Nothing in this lane deploys and nothing in this lane touches live.

## Battery

- `node tools/edge-signed-in-exercise.mjs`: 240 / 242 passed; the two
  failures are named in the row mx-B-081 receipt and are not this row's
  surface.
- `node tools/deck-fixtures/migrate-retired-twitter-widget-embeds-cas.mjs
  --dry-run`: 0 candidates, admission matches 0, deck version 62958, one
  version row - the fixture is clean and a re-run is a no-op.
- No engine source touched by this commit.
