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

## Measured result

Measured 2026-10-14 on the synthetic-v1 deck: 6 renders of the fixture mod's
views (RichText, Pointer, Tag, User and a structured Topic card; a direct view
and an alias view) and 2 creates through its event (one where `when:` holds,
one where it does not). All 8 are byte-identical to stock Ruby Decko (card
1.110.0, decko 0.20.0) loading the same mod from its `mod/` directory, after
the harness's `data-slot-id` normalization.

Reproduce (plan.json lists `deck`, `deckJson`, `modDir`, `renders`, `events`;
the port's `deck` must be a private copy, the oracle's paths absolute):

    node tools/ruby-mods/port-run.mjs plan.json > port-out.json
    RUBY_GEMS_PATH=<oracle bundle path> bash tools/ruby-mods/oracle-run.sh plan.json oracle-out.json
    node tools/ruby-mods/compare.mjs port-out.json oracle-out.json

Costs on the measuring machine: VM boot plus shim and mod load about 0.9 s
once per process; a render through Ruby 17-90 ms, dominated by the nested
port renders it calls back into.

## DSL features that run

- `format :html do ... end` and `format do ... end` (base-format views are
  registered on html).
- `view :name, opts do ... end` with `unknown:`, `perms:`, `cache:`, `wrap:`,
  `denial:` passed to the loader's view config; `view :name, :other` aliases.
- `def` inside a format block (format helpers) and at the top of a set file
  (card methods, including `when:` predicates).
- In view bodies: `card.name`, `card.key`, `card.type_name`, `card.id`,
  `card.content`, `render(view)`, `render_<view>` / `_render_<view>`,
  `output`, `wrap_with`, `content_tag`, `h` / `html_escape`.
- `event :name, :stage, on:, changed:, when:` with a Symbol or Proc `when:`;
  in event bodies `name`, `content`, `content=`, `action`, `new?`.
- `card_accessor` / `accessor` define `<field>_card` and `<field>`; the field
  card is read from the engine's render cache.
- Accepted and ignored: `include_set`, `assign_type`, `basket` (recorded),
  `add_to_basket`, `before`, `wrapper`, `delegate` (defined as forwarding).

## Limits, as measured

1. Only the event dispatcher path is proven. `content=` writes through the
   save-input seam (`ModEventSaveInput.setContent`); the full
   `CardActionEngine` save path creates that seam only for the comment mod
   today, so a Ruby event that assigns content during a real save raises
   instead of silently doing nothing.
2. `when:` is evaluated inside the Ruby body, so the dispatcher reports such
   an event as fired even when its condition was false (the body is a no-op).
3. Set scoping beyond `all/` is not yet verified against the oracle: the
   loader registers each file under its set path (`type/date`, `right/x`),
   but only `all/` views were byte-compared.
4. Upstream mods, loaded unmodified through the shim (card-mod-*-0.20.0):
   card-mod-date loads all 5 set files and registers `type/date :core`; its
   render was not compared. card-mod-help, card-mod-tabs and
   card-mod-comment stop at `Abstract::` constant references
   (`include_set Abstract::...`); card-mod-markdown needs the kramdown gem,
   which is not in the wasm image.
5. Helpers outside the list above (`link_to_card`, `nest`, `field_nest`,
   `t`, I18n, Rails helpers, `Card.fetch`, `Card.search`) are not provided.
6. Node only. Workers would need the wasm module precompiled and passed to
   `DefaultRubyVM`, and the 30+ MB wasm image counts against the bundle size.
