# reg-mods-17

- The pinned Ruby gem: `card-mod-format-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-format (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-format.ts`.
- The declaration census at this tree: 40 gem set files, 104 gem view
  names and 2 gem event names. 5 set files and 24 view names have no port
  registration, and each of the 29 is named with its reason.

## Verdict: DONE

The html format's slot modules are not registered port-side, and with them
24 of the gem's view names have no port registration, so a card asked for
one of those views has no view to dispatch where Ruby renders it. The
census names the five set files: `all/html/head`, `all/html/header`,
`all/html/menu`, `all/html/show` and `all/html/wrap`. The port registers
the html format's own set path and the views it can carry; its page
assembly is its own (`src/card/render/page.ts`,
`src/card/render/navbar-views.ts`, `src/card/render/head-views.ts`)
rather than the gem's slot-level html views, and the port's own file says
so (`src/card/mod-loader/mods/card-mod-format.ts:124-135`, "STILL
UNPORTED from this group").

CLOSED 2026-10-25 (lane `port/regfix-2-20261025`, register fixes 2): the
five slot modules are manifest entries in
`src/card/mod-loader/mods/card-mod-format.ts` seated with the views Ruby
declares on them, and the former mis-seat `all/head` (a set path no gem
file declares) is gone: the head views live on the gem-faithful
`all/html/head`. Nineteen of the 24 open names seat the engine's
shared-table fns (render/views.ts was transcribed from these same gem
files); :meta_tags/:universal_edit_button/:rss_links seat the same
table's template-and-head fns; rss :feed seats the recorded stock-config
answer; rss :feed_body/:feed_item seat the Ruby-shaped pub_date raise
that is Ruby's own behavior on the pinned stack; csv :body seats the mod's
recorded unsupported body. The census at the close reads 40 of 40 gem set
files registered and 104 of 104 gem view names registered, with the
fixture rebuilt DONE, no gap, no named skips, and the frozen oracle side
untouched.

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-17-card-mod-format-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 17's block).
- The named instrument that pins the census reading:
  `tests/card/mod-loader/register-row-17-card-mod-format-html-slot-modules.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-17-card-mod-format-html-slot-modules.test.ts
      2 files passed, 16 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
