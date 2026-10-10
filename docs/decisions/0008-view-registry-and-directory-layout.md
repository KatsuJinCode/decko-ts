# Views are a flat name→function registry, and the source layout is not a mirror

## Context

Two claims this repository used to make about itself were not true, and both
were load-bearing: a reader forming an expectation from either one would draw
a wrong conclusion about what a passing figure covers.

The first was a shape claim. `ARCHITECTURE.md` described views as registered
per set, with "the view a card renders depends on which sets it belongs to"
— which is what Ruby Decko does, and what a reader would assume a port of
Ruby Decko does.

The second was a layout claim. `ARCHITECTURE.md` said `src/card/` "mirrors
Ruby's `card/lib/card/` directory for directory", and gave a table that read
as a mapping. The table named a `content/` directory that does not exist.

Both were checkable in a minute and neither had been checked. The
correction below is not a redesign — the engine already behaves as described
here. It is a decision record of what the engine actually does, so that the
parity claims built on top of it say the right thing.

## What upstream actually does

Ruby's view definition keeps a registry keyed by **the set module that
declared the view**, and dispatch goes through it:

- `card/lib/card/set/format/abstract_format/view_definition.rb:8-9` —
  `mattr_accessor :views; self.views = Hash.new { |h, k| h[k] = {} }`, keyed
  by `self`, i.e. the set module.
- `:18-21` — `define_standard_view_method` stores **both** forms:
  `views[self][view] = block` (the per-set table) *and*
  `define_method view_method_name(view), &block` (a method on the set module).
- `card/lib/card/set/format.rb:172-174` — the method name is
  `"_view_#{view}"`, so a view is a method on a set module.
- `card/lib/card/format/render.rb:68-73` — `view_method(view)` checks
  `supports_view?` and then returns `method view_method_name(view)`, i.e.
  **method dispatch on the card's class**, which inherits through the set
  modules.
- `card/lib/card/set/format.rb:106` — `def view(...)` is the public DSL, a
  shortcut for `format { view(...) }`.

So upstream has two coupled things: a per-set table, and real method
dispatch through the module hierarchy. Scope is a consequence of *where the
method is defined*, not a key someone looks up.

The directory claim: upstream `card/lib/card/` has `content/` as its own
directory (`card/lib/card/content.rb` plus `card/lib/card/content/`), and
`view/`, `format/`, `set/`, `rule/`, `act/`, `history/`, `mod/` and others
beside it.

## Decision

**Views in this engine are a flat `Record<string, ViewFn>` — a name→function
map with no per-set dimension. Resolution has two layers, and which one
answers depends on whether a mod loader is bound to the engine.** The source
layout is named for the concept a directory carries, not mirrored
directory-for-directory from Ruby.

Concretely:

1. **The compiled table is flat.** `HTML_VIEWS: Record<string, ViewFn>`
   (`src/card/render/views.ts:6597`), where
   `ViewFn = (ctx: ViewContext) => string`
   (`src/card/render/format.ts:481`). There is no per-set table, no `View`
   module to reopen, and no `view :name do ... end` DSL. Behaviour Ruby
   expresses by reopening a set module is expressed here by a mod registering
   a function under a name.

2. **Resolution has two layers** (`RenderEngine.computeResolvedView`,
   `src/card/render.ts:2311`):
   - When a loader is bound, `loader.viewChain(setKeys, view, format)` walks
     the card's sets most-specific-first with format inheritance; the first
     entry wins. This is the set-scoped dispatch, and it lives in the mod
     loader, not in the compiled table.
   - Otherwise the flat compiled table is the whole answer. It is also the
     base layer underneath the chain when one is bound, so a loader-less
     engine and a loader-bound engine agree on every view the table defines.

3. **Which one the grade exercises is a fact about the harness, and it is
   stated rather than assumed.** `modDeckBound()` is
   `this.modLoader !== undefined` (`src/card/render.ts:2304`). The corpus
   runner never binds one — it builds its engine and registers replay
   handlers, not a mod deck — so **the graded corpus figure measures the flat
   table**. The Bunny host does bind one, at boot and before the render
   engine is constructed (`deploy/bunny-worker-src/bunny-edge-deck-boot.ts:113`),
   so **the deployed engine exercises both layers**. A view that resolves
   only through the chain is therefore not something the corpus figure
   covers, and no figure in this repository should be read as covering one.
   The single exception is `ensureCoreAdminRuntime`, which builds the core
   mod's admin runtime lazily for loader-less engines and says so at
   `src/card/render.ts:5117-5124`.

4. **`:after_integrate` and `:integrate_with_delay` are declared but not
   dispatched.** Both are legal `ModEventStage` values
   (`src/card/mod-loader/mod-manifest.ts:166-167`), and `:integrate_with_delay`
   carries real declarations — card-mod-follow registers there
   (`src/card/mod-loader/mods/card-mod-follow.ts:1185`), card-mod-carrierwave
   at `:893` — but the action engine's `dispatchEventStage` is called only
   for the stages it implements. On the save path `integrate_with_delay`
   appears in exactly two places: as a filter that drops the stage for an
   upload (`src/card/actions/card-action-engine.ts:611`, mirroring upstream's
   ActiveJob serialization failure at
   `card/lib/card/director/event_delay.rb:5-8`) and as the `stage` value on
   the built-in follow-notify hook
   (`src/card/notify/follow-notify.ts:115`). `:integrate` **is** dispatched,
   on create, update and delete (`src/card/actions/card-action-engine.ts:1348`,
   `:2035`, `:3178`), corresponding to upstream's
   `run_stage :integrate` (`card/lib/card/director/phases.rb:49`).

5. **The layout claim is withdrawn and restated.** `src/card/` is *named
   after* Ruby's `card/lib/card/` and follows it where the two correspond
   closely (`name/`, `fetch/`, `auth/`), but it is not a
   directory-for-directory mirror, and there is no `content/` directory —
   content parsing and the write path are one area, `actions/`. The table in
   `ARCHITECTURE.md` now says "what this directory is for" rather than
   reading as a mapping.

## Consequences

**A view's byte-level proof comes from a capture that rendered it, and a
graded figure covers the flat table.** The two together are the strongest
statement available: a view that a corpus figure covers is proven, but only
because the figure ran with no loader bound, which is exactly the layer that
table defines. A view proven through the chain alone has no equivalent
figure, and a deployment-only view's proof is a capture the public package
does not ship.

**A reader can no longer assume that a passing corpus figure covers what a
deployed deck renders.** The gap is narrow — the chain falls through to the
same compiled table for everything the table defines — but it is real, and it
is now written down rather than implied either way.

**Save-time event declarations are not behaviour.** A declaration at
`:after_integrate` or `:integrate_with_delay` is recorded and inspectable and
is not dispatched; the corpus grade cannot see one at all, because a graded
replay never runs the save path. Where a suite claims a save-time effect, it
is either running the path itself or asserting on a declaration — and those
are different claims.

**The layout table is documentation, not an index.** A reader looking for the
Ruby original of a behavior should follow the per-file citation in the
module's own header, which is what `NOTICE` now points at (197 of the 229
tracked TypeScript files under `src/card/` name a `.rb` path in a source
comment), not the directory table.

## What this does not change

No code changes with this record. The engine already behaved as described;
the decision is to state it and to correct the two documents that overstated
it. `docs/decisions/0004-mods-compiled-into-the-view-registry.md` still
governs what a mod's declaration completeness means, and this record does not
narrow or widen it — it adds the layer question that 0004's declaration-level
verdict does not answer.