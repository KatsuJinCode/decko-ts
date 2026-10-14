# Running unported Ruby card-mods

The port can load a Ruby card-mod's `set/**/*.rb` files unmodified and run
them against the TypeScript engine. CRuby 3.4 compiled to WebAssembly
(`@ruby/wasm-wasi` with `@ruby/3.4-wasm-wasi`, optional dependencies) runs a
shim of the Card set-module DSL; the views and events it records register
into the mod loader as an ordinary `ModSource`, after the ported gem mods, as
Cardio::Mod::Dirs orders an app's `mod/` after its gems.

- Shim: `src/card/mod-loader/ruby-mod/card-set-shim.rb`
- Loader: `src/card/mod-loader/ruby-mod/ruby-mod-source.ts` (`loadRubyMod(dir)`)
- Fixture mod: `fixtures/ruby-mods/greeting` (one view, one alias view, one event)
- Comparison: `tools/ruby-mods/port-run.mjs`, `tools/ruby-mods/oracle-run.sh`,
  `tools/ruby-mods/compare.mjs`

View and event bodies execute in Ruby. A body that asks for another view
(`render_core`, `render :titled`) or for card data calls back into the engine
through a bridge object, so views the port already implements render with the
port's bytes.

## Measured results

All measured 2026-10-14 on the synthetic-v1 deck against stock Ruby Decko
(card 1.110.0, decko 0.20.0), byte comparison after the harness's
`data-slot-id` normalization.

1. Fixture mod (`fixtures/ruby-mods/greeting`), 15 comparisons: 14 identical.
   Covered: all-set view on RichText, Pointer, Tag, User and structured Topic
   cards; a view alias; a type set (`type/basic`, RichText's codename)
   overriding the all-set view; an abstract set reached through
   `include_set`; a right set (`right/structure`) using `nest`,
   `link_to_card` and `t`; two creates through the event (`when:` true and
   false). The one difference is `Card.fetch` of a card the render had not
   seated: the port answers nil, Ruby finds the card (limit 3 below).
2. card-mod-date run from its upstream Ruby source in place of the
   hand-ported manifest: all 5 set files load; `Date :core` on two Date
   cards (created by the oracle and read by the port from the same deck) and
   a fixture view nesting it are identical (3 of 3).
3. card-mod-help and card-mod-tabs run from upstream Ruby source: both load
   (help's `setting_opts` reaches the setting registry; tabs reports
   `Abstract::BsBadge` undefined, it lives in card-mod-bootstrap). Of 7
   renders, 1 is identical, and that one (`help_text` on a rule card) is
   answered by the hand-ported rules mod, not by the Ruby code. The other 6
   end in render errors: the bodies call engine helpers the shim does not
   provide (rule lookups, haml templates, the bootstrap `tabs` helper).

Reproduce (plan.json lists `deck`, `deckJson`, `modDir`, `renders`,
`events`, optionally `setup` creates with `deckOut`, and `upstreamMods`;
the port's `deck` must be a private copy, paths absolute):

    RUBY_GEMS_PATH=<oracle bundle path> bash tools/ruby-mods/oracle-run.sh plan.json oracle-out.json
    node tools/ruby-mods/port-run.mjs plan.json > port-out.json
    node tools/ruby-mods/compare.mjs port-out.json oracle-out.json

Costs on the measuring machine: VM boot plus shim and mod load about 0.9 s
once per process; a render through Ruby 17-90 ms, dominated by the nested
port renders it calls back into.

## DSL features that run

- `format :html do ... end` and `format do ... end` (base-format views are
  registered on html).
- `view :name, opts do ... end` with `unknown:`, `perms:`, `cache:`, `wrap:`,
  `denial:` passed to the loader's view config; `view :name, :other`
  aliases, bound in the defining set module as `alias_block` does.
- Set files under `all/`, `type/`, `right/`, `self/` register under their
  set path; `abstract/` files register only through `include_set`.
- `include_set Abstract::X` (the mod's own `set/abstract/x.rb`); an
  abstract no loaded file defines becomes an empty stand-in and is reported.
- `def` inside a format block (format helpers) and at the top of a set file
  (card methods, including `when:` predicates); `delegate`.
- In view bodies: `card.name`, `card.key`, `card.type_name`, `card.id`,
  `card.content`, `render(view)`, `render_<view>` / `_render_<view>`,
  `output`, `wrap_with`, `content_tag`, `h` / `html_escape`,
  `nest(name, view:, title:, show:, hide:, size:)` through the engine's nest
  path, `link_to_card(name, text, class:)`, `t(key, default:)`,
  `Card.fetch` (engine-seated cards only).
- `event :name, :stage, on:, changed:, when:`; `when:` (Symbol or Proc) runs
  in Ruby as a dispatcher predicate before the event fires, so a false
  condition is a when-false skip. In event bodies `name`, `content`,
  `content=`, `action`, `new?`.
- `card_accessor` / `accessor` define `<field>_card` and `<field>`.
- `setting_opts` reaches the setting registry.
- Accepted and ignored: `assign_type`, `basket` (recorded),
  `add_to_basket`, `before`, `wrapper`.

## Limits, as measured

1. Only the event dispatcher path is proven. `content=` writes through the
   save-input seam (`ModEventSaveInput.setContent`); the full
   `CardActionEngine` save path creates that seam only for the comment mod
   today, so a Ruby event that assigns content during a real save raises
   instead of silently doing nothing.
2. `Card.search` raises: the port's search is asynchronous and the bridge is
   synchronous.
3. `Card.fetch` sees only cards the engine seated for the render; Ruby
   fetches any card.
4. `t` answers its `default:` only and raises without one; no locale files
   are loaded, and `I18n.localize` is absent.
5. Not provided: rule lookups (`rule_card`, `rule`), haml templates,
   bootstrap helpers (`tabs`, badges), `link_to` path options, Rails view
   helpers beyond `content_tag`. These are what stop the upstream help and
   tabs views.
6. Gems the wasm image lacks (card-mod-markdown needs kramdown) do not load.
7. Node only. Workers would need the wasm module precompiled and passed to
   `DefaultRubyVM`, and the 30+ MB wasm image counts against the bundle size.
