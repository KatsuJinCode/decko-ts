# Row smell-profile-private-index-render

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-profile-private-index-render`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/profile-private-index-render.mjs`
- What this lane did: rebuilt the owned local deck the instrument measures against, and ran
  the instrument with a fresh label, in a copy of the evidence tree so that the recorded
  outputs were neither read nor overwritten.
- Commands:
  - the pinned checkout's own deck builder, `tools/edge-signed-in-exercise/lib/build-local-deck.mjs`
    in `C:/localProjects/decko-edge-verification-b00a4503` at commit
    `b00a450329af801915ae9dbc4668cf9a08ef628c`, called with the source deck
    `C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3`
    (the byte-restored a253 deck, sha256
    `c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc`) and the output
    `C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-nest-index-a253-20261019/baseline.sqlite3`;
    the builder reported 17 shared tables and 35 post-seed statements.
  - `node profile-private-index-render.mjs r2-baseline-a1 C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-nest-index-a253-20261019/baseline.sqlite3 private-nest-index-a253-20261019`
    (run in the copy of the evidence tree).
- Observed: the instrument booted the stack on the pinned deployable bundle, whose sha256
  it verified at boot (`a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e`),
  and then rendered the three routes `/`, `/About` and `/2011_12_14`. All three answered 200
  with timings, server-timing headers, SQL counts and pipeline counts: `/` in 518.7 ms with
  22781 bytes, `/About` in 401.7 ms with 21692 bytes, `/2011_12_14` in 274.2 ms with 15076
  bytes. The slow-SQL list is empty.
- Evidence in this directory: `fresh-r2-baseline-a1.json`, the instrument's own receipt.
- Gap, in one mechanism sentence: none; the row's own verification ran and every route it
  renders answered 200 with no slow SQL.

## What changed for this row

Round one recorded the row as blocked because the owned experiment deck under the pinned
checkout's `.runtime/` was not on disk. The deck is rebuildable from material that is on
disk: the byte-restored a253 deck and the pinned checkout's own builder, which reproduces
the engine's schema rather than copying a deck's table shapes. The instrument's own path
guard was satisfied by putting the rebuilt deck exactly where it demands it.

## The scope the instrument states, carried forward

The instrument's own scope line reads: a fresh Node process, the exact pinned deployable
bundle on an owned local SDK and Hrana shim, a single private render per route, an explicit
owned TLS exception, no browser, no hosted and no runtime acceptance, and only the known
ephemeral origin projected from the HTML for diagnostic equivalence. This receipt closes
the row on that scope and claims nothing wider.
