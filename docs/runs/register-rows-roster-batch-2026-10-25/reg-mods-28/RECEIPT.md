# reg-mods-28

- The pinned Ruby gem: `card-mod-search-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-search (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-search.ts`.
- The declaration census at this tree: 29 gem set files, 23 gem view names
  and 0 gem event names. 24 set files and 11 view names have no port
  registration, and each of the 35 is named with its reason.

## Verdict: WORKING ON IT

The two request-term views have no port answer. Ruby's `:name_complete`
and `:name_match` (`set/abstract/0_search/views.rb:38-44`) read a REQUEST
parameter (`term_param` to `Env.params[:term]`) and run ad-hoc CQL
against it at view time, for any card. The port's prepared request-term
seat (`RenderEngine#searchBoxCompleteSeat`,
`src/card/render.ts:11678-11683`) is search-scoped: the two views that
use it (`:complete` and `:search_box_complete`) raise when the seat is
absent, and the two request-term views have no seat, so they are not
registered port-side. What closing them would take is named in the port's
own file: a per-card request-term prepare for every card in the deck,
which is engine work and not a view body
(`src/card/mod-loader/mods/card-mod-search.ts:46-53`).

Of the 24 unregistered set files, 23 declare no view and no event (they
are method-only modules, so nothing is lost by not registering them). The
twenty-fourth is `self/recent`, the recent-cards module, whose three
views have no registration on the mod file. Of the 11 unregistered view
names, two are PORTED elsewhere (`:molecule` as the render layer's
`jsonMolecule`, `:feed_item_description` as `rssItemDescriptionView`).

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-28-card-mod-search-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 28's block).
- The named instrument that pins the seat facts:
  `tests/card/mod-loader/register-row-28-card-mod-search-request-term-seat.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-28-card-mod-search-request-term-seat.test.ts
      2 files passed, 28 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
