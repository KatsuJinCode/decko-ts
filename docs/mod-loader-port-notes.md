# Mod loader port notes (stream S3)

The mod-loading REGISTRATION mechanism: how a card-mod gem plugs its set
patterns, views, and setting definitions into a running deck. Oracle: card
1.110.0 / decko 0.20.0 (`C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/`), live
oracle app `tools/oracle/decko-oracle-app`. All file+line cites are the
installed gems.

Delivered:

- `src/card/mod-loader.ts` + `src/card/mod-loader/` (mod-manifest.ts,
  mod-order.ts, mod-registrar.ts, mod-engine-host.ts, mod-view-helpers.ts,
  mods/card-mod-help.ts)
- `tests/card/mod-loader/` (mod-load-order, mod-registration,
  help-mod-integration tests + the capture script
  oracle-capture-help-mod.rb)
- `fixtures/captured/help-mod-loader.json` (live-oracle capture)
- the reference port of **card-mod-help** end-to-end, byte-verified

## 1. The Ruby mechanism (file+line)

### 1.1 What a mod is

`Cardio::Mod` (lib/cardio/mod.rb:42-96): name (normalized),
path (must exist - `required_path` raises "mod not found: X", mod.rb:88-95),
group, index. `Mod.normalize_name` strips the `card-mod-` prefix
(lib/cardio/mod/class_methods.rb:26-28). A gem is a mod when its name starts
with `card-mod-` or it carries `metadata["card-mod"]`
(class_methods.rb:109-113).

### 1.2 Load order (Cardio::Mod::Dirs, lib/cardio/mod/dirs.rb)

`Dirs#initialize` (dirs.rb:51-63) assembles, in order:

1. **core mods** - the card gem's own `mod/` directory, added through
   `add_from_dir` -> `Dir.entries.sort` (dirs.rb:152-157, 168-172), group
   "gem-card". card-1.110.0 ships exactly one: `mod/core`.
2. **gem mods** - every bundle spec that passes `gem_spec?`
   (class_methods.rb:102-113), iterated in `Bundler.definition.specs` order
   (class_methods.rb:61-65), group from `metadata["card-mod-group"]`
   (default "gem", dirs.rb:144-150; the defaults group is "gem-defaults").
   **This order is the bundle's dependency-closure resolve order, NOT
   name-sorted**: the live capture has card-mod-help (index 7) loading
   AFTER its markdown (5) and permissions (6) dependencies, and
   card-mod-defaults last (33). Bundler's resolve is deck input, so the TS
   port takes the gem order as input exactly like Ruby takes it from
   Bundler.
3. **deck mod dirs** - per `Cardio.paths["mod"]` path: a Modfile (explicit
   `mod` / `mod_gem` order, dirs.rb:159-166, loaded by
   lib/cardio/mod/modfile_loader.rb) or the alphabetically sorted directory
   listing (`add_from_dir`, dirs.rb:168-172). Ruby byte-sort: uppercase
   before lowercase. Group :custom (mod.rb:47-53).

Duplicate names raise at insertion - `name conflict: mod with name "X"
already loaded` (dirs.rb:66-71).

`CARD_MODS=none` aborts mod loading entirely (class_methods.rb:7-8).

### 1.3 The load itself (Cardio::Mod::Loader, lib/cardio/mod/loader.rb)

`Loader.load_mods` (loader.rb:16-21), four phases:

1. **SetPatternLoader** (loader.rb:17, set_pattern_loader.rb:7-21): every
   mod's `set_pattern/*.rb` in mod order, files path-sorted
   (`each_file_in_dir`, loader.rb:73-80). Each file is wrapped by
   SetPatternTemplate (set_pattern_loader.rb:24-62) as
   `class Card::Set::<Camel> < Card::Set::Pattern::Base` whose postamble
   calls `register "<code>".underscore.to_sym, (options || {})`
   (set_pattern_loader.rb:55-61). `ClassMethods#register`
   (lib/card/set/pattern/class_methods.rb:13-18) FRONT-INSERTS into
   `Pattern.concrete` (`insert opts.delete(:index).to_i, self`; no core
   pattern passes :index, nil.to_i = 0) - so the concrete table ends in
   reverse file order, which is the lookup/precedence order.
2. **SetLoader** (loader.rb:18, set_loader.rb:7-45): every mod's
   `set/**/*.rb`, walked in `Pattern.grouped_codes` groups
   (lib/card/set/pattern.rb:47-51): `[:all]`, `[:abstract]`, then the
   nonbase patterns REVERSED out of the concrete table (= pattern
   registration order). Loop nesting is groups OUTER, mods, then the
   group's patterns, files path-sorted (set_loader.rb:26-44). Loading a
   file (SetTemplate, set_template.rb:5-138) defines the module chain
   `Card::Set::<Pattern>::<Anchor>` with `extend Card::Set`; number
   prefixes are stripped from path segments
   (`Loader#parts_from_path`, loader.rb:61-65).
   Loading ends with `Card::Set.finalize_load` (set_loader.rb:17-20), whose
   `clean_empty_modules` (registrar.rb:59-71) drops modules that defined
   nothing.
3. **process_base_modules** (loader.rb:19, registrar.rb:42-49): includes
   the `all`-set modules into Card itself. The TS registries have no class
   inclusion to replay (views are table entries), so this phase is a no-op
   in the port.
4. **late initializers** (loader.rb:30-34): the mods' `config/late`
   scripts - the port's `prepareEngine` hook covers the state that must
   exist before the first render (see 1.5).

### 1.4 What a loaded set file registers

- **The set module**: `Card::Set.extended` ->
  `register_set` (lib/card/set/registrar.rb:16-29): all-set modules go to
  `modules[:base]`, abstract to `[:abstract]`, everything else to
  `[:nonbase][shortname]` (dedup `unless list.member?`,
  registrar.rb:74-77). The baskets live on `Card::Set.modules`
  (lib/card/set.rb:136-144).
- **Views**: a `format :html do view :x, opts do ... end end` block
  (lib/card/set/format.rb:91-102) defines
  `Card::Set::<Pattern>::<Anchor>::HtmlFormat` and registers it
  (`register_set_format`, format.rb:133-155). `AbstractFormat#view`
  (lib/card/set/format/abstract_format.rb:97-100) -> ViewDefinition
  (abstract_format/view_definition.rb:12-21): the block is stored in
  `views[self][view]` AND defined as the method `_view_<view>` - a LATER
  definition of the same view REPLACES the method (module reopening).
- **View configs**: `view :x, unknown: true, cache: :never, wrap: :slot` -
  ViewOpts (abstract_format/view_opts.rb:25-64) splits def-opts from
  settings; `interpret_view_settings` (view_opts.rb:49-57) tags
  `unknown_ok[view] = true` globally and defines a method
  `_view_<view>__<setting>` per remaining setting
  (VIEW_SETTINGS = cache, compact, denial, perms, unknown, wrap, expire;
  view_opts.rb:17), read back by `Format#view_setting`
  (lib/card/format/render.rb:55-57). The `wrap:` list is applied by the
  render pipeline (`with_wrapper` around `final_render`,
  render.rb:96-97 + lib/card/format/wrapper.rb:19-29) - which is why a
  `wrap: :slot` view RENDERS THE SLOT DIV EVEN WHEN ITS BODY IS BLANK
  (the `wrapper :slot` method itself is card-mod-format-0.20.0
  set/all/html/wrap.rb:11-14; slot_attributes:26-31, wrap_classes:94-99,
  wrap_data:37-48, slot_id:33-35).
- **Settings**: `setting_opts ...` (lib/card/set/advanced_api.rb:10-14)
  extends Card::Setting and runs `register_setting`
  (lib/card/setting.rb:63-72): group (fixed list setting.rb:45-54, default
  :other), `set_position` (setting.rb:101-110 - occupied slot INSERTS
  before it, free slot ASSIGNS leaving nil holes, absent appends),
  `register_preference` (setting.rb:95-99; codename derived from the set
  anchor, setting.rb:96), `help_text_for_setting` (setting.rb:112-114
  stores the string on BOTH the Self and the Right set module),
  restricted_to_type (setting.rb:116-123).
- **Format-level methods** (`def raw_help_text` inside `format :html do`)
  land on the set's HtmlFormat module - the override channel for narrower
  sets (Set precedence beats Format precedence, format.rb:55-77).

### 1.5 Boot-time state a mod's views assume

A mod view like card-mod-help's `:help` calls `rule_card(:help)`
(set/all/help.rb:1-4), which walks the deck's rule CACHE
(lib/card/rule/all.rb:9-15; the cache loads deck-wide at boot,
lib/card/rule/cache.rb:10-27). The TS render path resolves cards from the
prepared render-card map, so the mod port's `prepareEngine` hook performs
the analogous one-batch warm (see 3.2).

## 2. The manifest design

A ported mod exports ONE `DeckoModManifest` (src/card/mod-loader/
mod-manifest.ts) mirroring the gem's FILE structure, so a per-mod port is
mostly transcription:

| gem artifact | manifest field | cites |
|---|---|---|
| `set_pattern/<code>.rb` | `setPatterns[]` (`code` + `spec: PatternSpec` + optional `index`) | set_pattern_loader.rb:55-61, class_methods.rb:13-18 |
| `set/<pattern>/<anchor>.rb` | `setModules[]` (`setPath` e.g. "all/help") | loader.rb:61-65 |
| `format :html do view :x, ...` | `setModules[n].formats.html.views[]` (`view`, `viewFn`, `config`) | format.rb:91-102, abstract_format.rb:97-100 |
| `unknown:`/`perms:`/`cache:`/`wrap:`/`denial:` view opts | the view's `config` | view_opts.rb:17,49-64 |
| `setting_opts ...` | `setModules[n].settingOpts` | advanced_api.rb:10-14, setting.rb:63-72 |
| config/late + the boot-time rule-cache warm | `prepareEngine(host)` | loader.rb:30-34, rule/cache.rb:10-27 |

`ModLoader` (src/card/mod-loader.ts):

- `new ModLoader(sources, views = HTML_VIEWS)` - the second parameter
  defaults to the LIVE view record (src/card/render/views.ts
  `HTML_VIEWS`), which is the same object every `RenderEngine` hands its
  formats (src/card/render.ts `this.views = HTML_VIEWS`). Registration
  mutates that record the way `define_method` replaces the old method, so
  **no registry file was edited**: the existing export is the hook.
- `resolveOrder({gemMods, deckModDirs})` - the Dirs port; gem order is
  deck input (1.2). The compiled-in core IS the ported "core mod", so the
  loader defaults `coreMods` to empty.
- `load()` - the four phases (1.3). The concrete pattern table is seeded
  from the frozen `PATTERN_TABLE` (the ported mod/core set_pattern files)
  and mod patterns front-insert on top. Set files walk groups x mods x
  byte-sorted paths. Every registration is recorded.
- `installInto(host)` - runs each mod's `prepareEngine` once (the phase-4
  analog); `modEngineHost(engine, fetcher)` (mod-engine-host.ts) adapts a
  RenderEngine + FetchEngine pair, reaching the engine's private
  cacheFetchedRecord through the established cast pattern (same shape as
  help-popover.ts's RenderEngineHelpHost seam).
- `reset()` - restores the exact pre-load state (views added/overridden,
  configs, settings, patterns, baskets). `reload()` = reset + load
  (loader.rb:23-28 reload_sets).
- Introspection: `fetchMod` (dirs.rb:100-102), `requireMod`
  ("mod not found", mod.rb:88-95), `patternTable()` (concrete order incl.
  mod patterns; core-only = the frozen table's order), `viewConfigFor`,
  `settingsRegistry()`, `setModules()`.

Registration registries (src/card/mod-loader/mod-registrar.ts):

- `SetModuleBasket` - the `Card::Set.modules` port (base/abstract/nonbase,
  dedupe by set identity = shortname + contributing mod).
- `SettingRegistry` - the Card::Setting port: group arrays keep Ruby's NIL
  HOLES (`grp[pos-1] = self`, setting.rb:101-110), preferences,
  help_text stored for both self and right sets.
- `ModViewConfigTable` - the `_view_<x>__<setting>` port; later wins.
- `PatternOverlay` - concrete-order pattern table over the frozen core.
- `ViewRegistrationTable` - mutation with undo (added keys removed,
  overridden keys restored).

## 3. The reference mod: card-mod-help

Chosen as the smallest real mod whose surface the loader can prove
byte-exactly: six set files, no lib/, no events, no set_pattern files; its
views (:help, :help_text, :lead) are oracle-capturable renders; its
setting_opts (*help, *guide) are capturable registry state. It is in the
oracle bundle transitively (card-mod-defaults depends on it).

### 3.1 The capture

`tests/card/mod-loader/oracle-capture-help-mod.rb` (run through
`decko runner`, create-if-missing seeds, probe cards trashed after capture
so the shared DB returns to its prior state) recorded:

- `mods` - the 34-entry load order (core + gem-defaults group, Bundler
  resolve order)
- `pattern_codes` / `grouped_codes` - re-verified with mods loaded
- `registered_views` - which `_view_*` / `_view_*__*` methods the gem
  defined, WITH source locations pointing into the gem's
  set/all/help.rb:7/14/27 and set/right/help.rb:4
- `setting_groups` / `setting_opts_help` / `setting_opts_guide` /
  `setting_preferences` - the Card::Setting registry state
- `rendered` - the byte oracles for two probe cards x four views
  (:help/:help_text/:lead/:content), data-slot-id normalized (it is
  SecureRandom.hex(10) by design, wrap.rb:45)

Byte-stability: re-running the capture reproduces the fixture (JSON
deep-sorted + trailing newline, same contract as tools/oracle/capture.rb).
The probe seeds are trashed in the same run, so a re-run of the smoke
capture stays byte-stable.

### 3.2 The port (src/card/mod-loader/mods/card-mod-help.ts)

- set/all/help.rb -> three views:
  - `:help` - `wrap: :slot` means the render pipeline wraps EVEN WHEN the
    body returns blank (render.rb:96-97) - the mod view wraps
    unconditionally via `modSlotWrap`, which reproduces the oracle's
    empty-slot-div for a rule-less card and the
    `<div class="help-text">` body for a rule-bearing one. The body's
    edit-link bytes (`<span class='d-none'>...` + the rule_edit link,
    single-quoted class attr from help.rb:22) are the mechanical port of
    wrap_help_text (help.rb:18-25) + the nest(rule_card, view:
    :edit_link) shape (the rule card's edit_link override targets
    :rule_edit, card-mod-rules set/rule/editor.rb:60-62).
  - `:help_text` - bare bytes, no wrap config.
  - `:lead` - `class_up "card-slot", "lead"; _view_content`: the classUp
    extra lands at the class list's end (the classy chain) and
    `_view_content` calls the content view's method DIRECTLY (no
    before(:content) hook - the oracle bytes carry no d0-card-content).
- set/self/help.rb + set/self/guide.rb -> the two settingOpts entries
  (verbatim strings; positions 1 and 3 in group :editing).
- `prepareEngine` - ONE batch (the *help rule rows + transitive sides via
  a recursive CTE), then in-memory multi-pass junction-name composition
  (an id mark carries no name mark, so the lexicon cannot compose on
  demand), then cacheFetchedRecord per composed record. After this the
  views resolve rule cards synchronously: zero queries on the render path.
  This is the TS analog of Ruby's boot-time Rule::Cache warm.

### 3.3 The proof (tests/card/mod-loader/help-mod-integration.test.ts)

A seeded replica of the capture's probe deck (probe ids 1169/1170 - the
bytes carry data-card-id - plus the *help rule card and its set/setting/
codename cards):

- WITHOUT the mod: `render "Oracle Help Probe", "help"` raises
  UnsupportedViewError (the captured sentinel contract); `:content`
  already matches the oracle bytes (the seed deck is faithful).
- WITH the mod (loader.load + installInto): `:help`, `:help_text`,
  `:lead` and the rule-less `:help` EMPTY slot wrap all match the captured
  Ruby bytes exactly; `:content` is unchanged (the mod adds views, it does
  not alter core).
- The settings registry matches the oracle's Card::Setting state.

Mechanics tests: mod-load-order.test.ts (Dirs order vs the 34-entry
capture, byte sort, Modfile order, name conflict, mod-not-found, the
SetLoader group walk, mod-pattern front-insert);
mod-registration.test.ts (live HTML_VIEWS registration + restore, later-
mod override semantics, double-load idempotence + basket dedupe, view
configs vs the capture, the editing-group reconstruction WITH nil holes
from the capture, help_text on both sets, preferences).

## 4. Registry hooks: what was added, what needs a patch

**Added (no existing file edited):** all registration lands in the
loader-owned registries, except VIEWS, which use the pre-existing mutable
`HTML_VIEWS` export (mutated at runtime, restored on reset). The pattern
registry and rules/permissions files are untouched.

**Coordinator-applicable patch (needed only for UNKNOWN-CARD routing of
mod views and mod `perms:`/`denial:` configs):** src/card/render/format.ts
keeps the html view configs as private consts (`UNKNOWN_VIEW_CONFIG`,
line ~551; `PERMS_NONE_VIEWS`, line ~578) and src/card/permissions/view-
perms.ts likewise (`PERMS_NONE`, `DENIAL_VIEW`). To let MOD views
participate, make format.ts consult the loader's table as a fallback:

```ts
// format.ts - replace the two consts' read sites with fallback lookups:
import { modViewConfig } from "../mod-loader.js"; // the loader exports a
   // module-level accessor bound to the process-wide ModLoader instance
   // (see below)

// in viewForUnknown (format.ts ~line 304):
const configured = UNKNOWN_VIEW_CONFIG[requested] ?? modViewUnknown(requested);

// in renderView's denial check (format.ts ~line 272):
const perms = viewPerms(normalized) === "none" || modViewPerms(normalized) === "none"
  ? "none" : "read";
```

with a process-wide default instance exported from src/card/mod-loader.ts:

```ts
let defaultLoader: ModLoader | undefined;
export function setDefaultModLoader(loader: ModLoader): void { defaultLoader = loader; }
export function modViewUnknown(view: string): string | true | undefined {
  const c = defaultLoader?.viewConfigFor(view);
  return c?.unknown;
}
export function modViewPerms(view: string): string | undefined {
  return defaultLoader?.viewConfigFor(view)?.perms;
}
```

The reference mod works WITHOUT the patch: the proof cases render KNOWN
cards, where `unknown:`/`perms:` configs are inert (viewForUnknown and the
denial check never run). The patch extends the fidelity to unknown-card
nests of mod views (e.g. `{{some+missing+thing|help}}` should render :help
as requested per its `unknown: true` config). The `wrap:` and `cache:`
configs are metadata-only in the current TS render pipeline (views wrap
themselves; there is no view cache) and need no patch.

## 5. Per-mod port: the recipe

1. Read the gem's `set/` tree. One file -> one `setModules` entry
   (`setPath` as in the gem).
2. Each `view :x, opts do ... end` inside a format block -> a
   `ModViewDefinition`: port the body to a `ViewFn` (helpers available:
   `modSlotWrap` for `wrap: :slot` shapes; the format's own
   `renderView`/`processContent`/`nest` cover sub-renders), transcribe the
   opts into `config`.
3. Each `setting_opts` -> `settingOpts` (verbatim strings; position/group
   as written).
4. Set-module helper methods -> plain functions in the mod module (they
   close over the view context the way Ruby's `self = format` does).
5. If a view resolves rules deck-wide, implement `prepareEngine` (one
   batch + compose + cache; see card-mod-help).
6. Feed `new ModLoader([{ manifest }])`, `load()`, `installInto(host)`,
   and assert against a live capture.

## 6. Honest remainder

- **card-mod-help is partially ported by design**: set/all/help.rb (three
  views, byte-verified), set/self/help.rb + set/self/guide.rb
  (setting_opts, registry-verified). NOT ported: set/all/guide.rb
  (view :guide renders the guide card's Markdown core - the Markdown
  format is card-mod-markdown's and unported; bytes would be raw source),
  set/right/guide.rb and set/right/help.rb (a format-level
  `def raw_help_text` and view :popover whose bytes run through
  card-mod-bootstrap's popover helper - neither oracle-captured),
  assets/style/help.scss (stylesheet surface), config/admin.yml (admin
  surface has no TS consumer).
- **View dispatch is global, not set-scoped.** Ruby binds views per set
  module (a `set/right/x.rb` view applies only to `*+x` cards, and
  narrower sets override wider ones). The TS render layer dispatches one
  global table (the pre-existing port shape - R1's surface); the loader
  therefore registers mod views globally and RECORDS the owning set module
  in the basket. Set-scoped dispatch (and Right::Help's :popover) needs
  the render layer to consult `card.setKeys` first - a render-stream
  change, noted for the coordinator. The captured corpus exercises only
  all-set mod views, which is why the byte proofs are unaffected.
- **Gem load order is deck input.** The loader does not reimplement
  Bundler's resolve; decks pass their bundle order (the capture pins the
  oracle deck's). A deck that hand-orders mods differently gets exactly
  what it orders - same as Ruby with a Modfile.
- **process_base_modules is a no-op** (no base-class inclusion exists in
  the TS port); `clean_empty_modules` has no surface to clean.
- **The settings registry is bookkeeping only.** Ruby's Card::Setting
  groups drive the rule ADMIN UI; the TS rule engine (lookup/apply) reads
  rule CARDS from storage and needs no registry. R1's concurrent
  setting-help-text.ts hardcodes the same gem strings for the menu
  popover; a later composition can replace that table's entries with
  `settingsRegistry()` lookups once loaders are wired deck-wide.
- **Events, chunks, layouts, haml templates, assets, migrations, i18n
  scopes** - the other things Ruby mods ship - are not modeled by the
  manifest; this stream's scope was the registration mechanism for
  patterns/views/setting defaults.
- **Overlap note:** stream R1 is concurrently porting the menu help
  popover (src/card/render/help-popover.ts + setting-help-text.ts), whose
  domain borders card-mod-help's. This stream's mod port does not install
  or depend on those files' resolver - it imports ONE pure exported
  function (`processHelpContent`, the [[...]] chunk walk) to avoid
  duplicating the link-chunk machinery; if that export moves, the fix is
  one import line in mods/card-mod-help.ts.

## 7. Gate results (this stream's run)

- `npx tsc --noEmit`: zero errors in every file this stream owns.
- `npx vitest run tests/card/mod-loader`: 28/28 green.
- `npx vitest run tests/card/permissions tests/card/render`: the failures
  present in both gate runs are NOT this stream's: every failing file is
  another stream's untracked in-flight test (view-perms-table.test.ts,
  view-task-verdicts.test.ts, view-perms-gate.test.ts, plus one
  render-engine query-count case) asserting against that stream's own
  mid-edit sources (git status: src/card/permissions/*, src/card/render*.ts,
  src/card/rules/index.ts all modified by the concurrent streams). No file
  in those suites imports mod-loader (grep-verified), and this stream's
  only tree changes are additions (src/card/mod-loader*, tests/card/
  mod-loader*, fixtures/captured/help-mod-loader.json, this doc) - there is
  no path by which they can affect those suites. The failure set also
  fluctuates between runs purely with the other streams' progress (one
  file fixed itself mid-session). Baseline suites this stream could
  measure cleanly stayed green: oracle-replay, rule-integration,
  read-permission, permission-corpus, unknown-nest, prefetch-parity,
  junction-depth, depth-sweep.
