# Engine Round 8 — Implementation Specs

**Gate.** Round 8 is gated on round 7 releasing `src/`. The four mechanisms
below each touch round-7 territory; the collisions and read-only cross-refs
are documented per-section so the implementer can land them in the right
order once the round-7 surface is committed. The two corpus-side fixes
(set-500-codename, wikirate-tag-404) have *zero* round-7 file overlap and
can land even if round 7's engine surface slips.

The spec was assembled from four traced mechanisms recorded during the
round-7 readiness probe. Every file:line cite is preserved; every
verification command is reported as not-run for this READ-ONLY session
unless otherwise noted.

---

## 1. Family: nested-listings

### Mechanism (with cites)

Three interlocking gaps stop the engine from rendering nested-listing
bodies. Evidence cited inline; corpus probes from the four oracles.

**1) Setting-type core view is not ported.** The `*read` oracle
(`6547-_read.html:103`) opens with `<div id="Xread-content-view"
class="card-slot content-view … d0-card-content">` containing a
rule-help alert and a full `<h3>All read rules that apply to</h3>` block
that iterates every pattern (`*all`, `*all_plus`, `*type+*read`,
`*right+*read`, etc.) and nests each rule bar via
`<p><h5>generic_label.downcase</h5>…</p>`. Ruby source:
`card-mod-rules-0.20.0/set/type/setting.rb:39-55` (haml `core` view) +
`set/type/setting/core.haml:1-12` +
`card-mod-rules-0.20.0/set/rule/editor.rb:24-28` (`view :rule_help`
emitting the `<div class="alert alert-info rule-instruction">`). The TS
`coreView` (`src/card/render/views.ts:181-354`) has explicit branches
for toggle/search_type/pointer-list/set/date/image/file/CodeRay but NO
branch for `typeCode === "setting"`. Falls through to
`fmt.processContent(fmt.renderRaw())` (`views.ts:353`), so a setting
card whose raw content is empty renders an empty content-view —
exactly the "3,612 lines of oracle, empty content-view" failure
shape. The `rule_help` view IS registered in
`src/card/mod-loader/mods/card-mod-rules.ts:295-318`
(`ruleHelpView`/`ruleHelpAlert`) but only fires for the rule-card
dispatch (`isRuleCard(ctx)`); the setting-card branch
(`card-mod-rules.ts:300-308`) nests `*all+<setting>` and reads THAT
rule card's `rule_help` — fine when the calling card is type=setting
and the nested content view delegates to `core` via
`titled`→`titled_content`→`core`. The missing piece is `coreView`'s
setting-type branch.

**2) Set-card listing body delegates to a missing helper.** The Set
oracle (`259-Set.html:103`) shows the
`set-description-titled-view` followed by `<h1>Set Cards</h1>` and a
`<blockquote><p>{{+*type+by_name|titled}}…</p></blockquote>` block that
nests `Set+*type+by_name` as a titled search-result-list. The
`cardListView` (`views.ts:825-838`) emits `<div class="card-list
card-list-bar search-result-list">…</div>` — the wrapper shape is
right — but the Set card's `core` view
(`card-mod-rules-0.20.0/set/type/set/html_views.rb:6-11`) is the Rules
section, not the literal content. The Set oracle's "Set Cards"
heading + body comes from the Set card's raw content `Set Cards`
block (rich text + `<blockquote>{{+*type+by_name|titled}}</blockquote>`).
TS `processContent(renderRaw())` scans for nests and dispatches each
`{{+*type+by_name|titled}}` through `format.ts:488-522` `nest()`. That
machinery works; the GAPS are (a) when `+*type+by_name` resolves to a
Search-type card whose `core` invokes `card_list`, the `executeSearch`
engine hook (`src/card/render.ts:1326-1329`) returns
`this.searchResults.get(fmt.card.key) ?? []` — but the `cardListView`
body is invoked, the per-item nestRecord path is `nest_record`
(`format.ts:594-605`) which calls `sub.renderView("bar", opts)` — for
a set-typed result whose `bar` view fires, the `prepareBar`
(`views.ts:877-896`) and `barBodyHtml` (`views.ts:899-913`) chain
works; and (b) the `Search` view's `bar` view hook
`voo.hide :one_line_content` (`views.ts:399-402`) reads
`typeCode === "search_type"` — verified.

**3) The *all nested-rules tree uses `setRulesCoreHtml` correctly but
`collectSetRules` may not return ALL rules.** The *all oracle
(`274-_all.html:103-898`) renders the Rules section via
`<h4 class="mt-3">Rules</h4>` + setting-filter + 6 category accordions,
each containing `<ul class="nav flex-column"><li class="nav-item"><div
…bar-view…>`. TS `setRulesCoreHtml` (`views.ts:486-494`) →
`collectSetRules` (`views.ts:534-537`) → `renderSettingListItems`
(`views.ts:592-660`) — verified: this returns
`<li class="nav-item">${slotHtml}</li>` (line 607) — the byte-shape
matches. The
`nestRecord(stored, "bar", {nest_name, show: ["bar"], home_view: "bar"})`
at line 602 builds the bar slot via the chain-aware
`format.ts:594-605`. The bar_left shows `*all+*captcha` title,
bar_middle is empty (hidden), bar_right shows the rule's compact-mode
one-line content — `ruleBarRightHtml`
(`src/card/render/rule-bar-right.ts:141-146`) →
`ruleOneLineContent` (line 104) → for pointer/list-typed rule cards
with permission right, `pointerListOneLineContent` (line 80) emits
`<div class="pointer-list"><div class="pointer-item item-link"><a
class="wanted-card">…</div></div>` — verified by `_all.html:185`
showing
`<div class="text-muted one-line"><div class="pointer-list"><div
class="pointer-item item-link"><a class="known-card"
href="/Anyone_Signed_In">…</a></div></div></div>`. For
`_all+*read` the bar_right renders the same shape.

The hosting-side failure shape ("24 empty `<p>`") comes from the
*interaction* of (1) and the titled view body: `titledView`
(`views.ts:1140-1149`) wraps `d0-card-header` + `d0-card-body` (which
contains the result of `titled_content` → `core`), and when `core`
returns "" (image non-source, file non-source, setting with empty
raw), the body emits `<div class="d0-card-body …"></div>` with no
inner bytes — Ruby ships the same shape for those cases. The
setting-type branch is the only structural gap; the others
(image/file non-source empty body, pointer-list outer wrappers) are
byte-pinned and round 7 already covers.

**Specific files / functions where the dispatch stops or wires
incorrectly:**

- `src/card/render/views.ts:181-354` `coreView`: branches present for
  toggle/search_type/pointer-list/set/date/image/file/CodeRay.
  MISSING: `typeCode === "setting"` (or `typeName === "Setting"`) —
  must call a new `settingCoreHtml(ctx)` that returns the
  `setting.rb:39-55` haml block: `render_rule_help` + `<h3>All
  #{card.name.tr "*", ""} rules that apply to</h3>` + per-pattern
  `<p><h5>klass.generic_label.downcase</h5>…</p>`.
- `src/card/render/views.ts:1049-1134` `barBottomView`: pointer/list
  and 3-part rule-card composition junction paths are handled;
  setting-type cards nested inside the *all rules tree rely on
  `content_view` → `core` reaching the setting branch (cross-coupled
  with #1).
- `src/card/render/format.ts:284-344` `renderView`: view dispatch
  seam; for setting-type cards the current path lands on `contentView`
  (`views.ts:1057-1134`) → `coreView` → empty. No skipContentWrap
  path for setting-type (unlike pointer/list, rule, 3-part composition
  junction).
- `src/card/render/rule-bar-right.ts:80-99`
  `pointerListOneLineContent` + `pointerListOneLineItem`: already
  ported, emits the correct `<div class="pointer-list">…item-link…
  </div>` shape pinned at corpus:6560 and visible at oracle
  `_all.html:185` and `_read.html:118`. The dispatch is gated on
  `isPermissionRightSetting(rightSetting)` (line 131); a typo or
  setKeys mis-eval would silently fall through to `truncatedCore`.
- `src/card/render/pointer-list.ts:147-201` `pointerListCoreHtml`:
  outer wrapper branching on `isRuleCardWithPermissionRight(parent)`
  is correct (card-list-bar vs simple pointer-list); the per-item slot
  wrap at line 241-260 (`pointerListItemSlot`) emits the
  `mini_bar-view` slot with `view:"bar"` data-slot — pinned by
  corpus:77.
- `src/card/render/views.ts:486-660` `setRulesCoreHtml` +
  `renderCategoryAccordion` + `renderSettingListItems`: complete and
  verified; the *all Rules tree is NOT empty in the engine — only the
  `*read`-style setting-page Rules sections are.
- `src/card/render/format.ts:594-605` `nestRecord`: nest the per-item
  slot for both pointer-list (`views.ts:255` via `renderPointerListItem`)
  and the *all rules tree (`views.ts:602`); byte-shape correct.
- `src/card/render.ts:1326-1329` `executeSearch`: pre-executed search
  results fed to `cardListView` (`views.ts:825-838`) for
  `Set+*type+by_name`-type titled nests; works.
- `src/card/mod-loader/mods/card-mod-rules.ts:295-318` `ruleHelpView`:
  two-set dispatch (rule cards vs setting cards); the setting branch
  correctly nests `*all+<setting>` for `rule_help`. The missing
  setting-type core view makes the `_render_rule_help` line in
  `setting.rb:42` unreachable.

**Ruby sources inspected and pinned:**

- `card-mod-rules-0.20.0/set/type/setting.rb:39-55` (haml `core` view).
- `card-mod-rules-0.20.0/set/type/setting/core.haml:1-12` (the bytes).
- `card-mod-rules-0.20.0/set/rule/editor.rb:24-28` (rule_help alert
  wrapper).
- `card-mod-rules-0.20.0/set/rule/bar_view.rb:9-46` (rule bar shape:
  `_rule-item #{category_classes}` class_up + bar_right →
  `rule_short_content`).
- `card-mod-bar_and_box-0.20.0/set/all/bar.rb:1-86` +
  `set/all/bar.haml` + `set/all/bar_body.haml` + `set/all/bar_menu.haml`
  (the `bar`/`mini_bar`/`closed`/`open`/`bar_left`/`bar_right`/
  `bar_bottom` family; already ported by round 7).
- `card-mod-list-0.20.0/set/abstract/01_list.rb:38-46` (`view
  :view_list` iterates `[:bar :box :closed :titled :labeled]` —
  byte-shape NOT ported; the named-view variant is currently
  unreachable).
- `card-mod-list-0.20.0/set/abstract/01_list/html_views.rb:6-13`
  (standard_pointer_core) + `wrap_item` (line 28-30).
- `card-mod-permissions-0.20.0/set/abstract/permission.rb:9-23` (the
  `_left` content → "Inherit from left card" path; visible at
  `_read.html:160` and absent in the TS port because no permission
  setting card reaches the bar_right dispatch in round 7's tree).
- `card-mod-permissions-0.20.0/set/self/read.rb:1-4` (setting_opts
  help_text; visible at `_read.html:103` "Who can view cards in the
  [[Set]]").

**Corpus pins:**

- `_read.html:103-118` shows the rule-help alert + `<h3>All read rules
  that apply to</h3>` + `<h5>all cards</h5>` +
  `_all+Xread-bar-view` with `text-muted one-line > pointer-list >
  pointer-item item-link`.
- `_read.html:160` shows the `_all_plus+Xread` case rendering
  `<span class="inherit-perm">Inherit from left card</span>` inside
  `bar-right` (the `core_inherit_content` branch of
  `card-mod-permissions-0.20.0/set/abstract/permission.rb:98-105`).
- `_all.html:176-211` shows the `_all+Xcreate-bar-view` with
  `bar-left col-6 col-md-5` + empty
  `bar-middle d-none d-md-flex col-md-4` +
  `bar-right col-6 col-md-3` containing
  `text-muted one-line > pointer-list > pointer-item item-link >
  a.known-card` — the rule-bar-right pointer-list path on a
  `*all+*create` rule (type=list, right=*create,
  dbContent="Anyone Signed In"). Pinned.
- `_all.html:103-127` shows the `<h4 class="mt-3">Rules</h4>` +
  `<form role="filter" … action="/Xall/accordion_bar_list">` + the
  per-category accordion shape.
- `Set.html:103-109` shows `set-description-titled-view` body with
  `Sets define a group…` paragraph (raw text + a single `<a>` link),
  then `<h1>Set Cards</h1>` + `<blockquote><p>` containing
  `set-Xtype-by_name-titled-view`. The `+*type+by_name` search nest
  produces
  `<div class="card-list card-list-bar search-result-list">…<div
  class="search-result-item item-bar">…bar-view…`. Pinned.
- `Wikirate.html:103-114` shows the 11 titled sub-views
  (`+image`, `+description`, `+document`, `+related`,
  `+organizer_s`, `+supporter`, `+tag`,
  `+increasing_open_data_literacy…`, `+intro_to_the_project`,
  `+what_we_do`, `+news_item`); bodies are image (single `<img>`),
  rich-text (paragraph), list-as-card-list-bar, or HTML bar
  (`+intro_to_the_project`, `+what_we_do` — both empty `bar-right`
  because their content is HTML prose, no `text-muted one-line`
  wrap).

### Port plan

Single coherent change concentrated in `src/card/render/views.ts`
coreView + a new sibling module for the Setting-type core body. Each
line is small; total estimated size is ~250 lines of new TS plus the
existing infra untouched.

**File 1: `src/card/render/views.ts`** (round-7 territory; the change
is colocated with the existing coreView branches at lines 209-353).

- Add a `settingCoreHtml(ctx)` function (~80 lines) immediately after
  `setRulesCoreHtml` (line 494). It builds the
  `card-mod-rules-0.20.0/set/type/setting.rb:39-55` shape: call
  `fmt.renderView("rule_help")` for the alert, then
  `fmt.renderView("h3", …)`-shaped helper to emit `<h3>All
  #{name_without_stars} rules that apply to</h3>`, then iterate
  `card.setClassesWithRules()` (a new engine hook, see File 4) — for
  each `klass, rules`, emit
  `<p><h5>${klass.generic_label.downcase}</h5>` and either nest
  `rules.first` view `:bar` with `show: [:full_name]` if
  `klass.anchorless?` or nest each rule view `:bar`. ~80 lines.
- Add a `coreView` branch (8 lines) after the existing `set` branch
  (line 257-264) and before the `date` branch (line 274):
  `if (fmt.card.typeCode === "setting" || fmt.card.typeName ===
  "Setting") return settingCoreHtml(ctx);`.
- Add `core_inherit_content` rendering for the `_left`-content
  permission rules in `src/card/render/rule-bar-right.ts`: when
  `card.typeCode === "list"` and `card.dbContent === "_left"` and
  `rightSetting` is one of the four permission settings, render
  `<span class="inherit-perm">Inherit from left card</span>` (the
  `card-mod-permissions-0.20.0/set/abstract/permission.rb:98-105`
  path). Pinned at `_read.html:160`. ~10 lines, replaces the current
  `truncatedCore(card.dbContent)` branch for that case.

**File 2: `src/card/render/format.ts`** (round-7 territory; touches
`nest` view-options plumbing for `show: [:full_name]`).

- The new `settingCoreHtml` nests with `show: [:full_name]` for
  `klass.anchorless?` rules; that token rides through
  `nestRecord(opts)` cleanly because `nestOptionEntries` (line
  572-580) already forwards `show`/`hide` arrays verbatim. No code
  change required beyond reading the docs.

**File 3: `src/card/render/pointer-list.ts`** (round-7 territory; the
`_left`-inherit path lives in the same family).

- No structural change. The rule-bar-right `_left` rendering belongs
  in `rule-bar-right.ts` (File 1), not here.

**File 4: `src/card/render.ts`** (round-7 territory; engine hook
addition).

- Add
  `setClassesWithRules(host: RenderCard): Array<{ klass: PatternClass, rules: RenderCard[], anchorless: boolean }>`
  to the engine interface (RenderEngineLike, `format.ts:676-746`).
  It walks the prepare-warmed render-card map and groups rules by
  their left-side pattern (all / all_plus / type_plus_right / right /
  type / self / etc.) —
  `card-mod-rules-0.20.0/set/type/setting.rb:16-31`
  `set_classes_with_rules` + `rules_for_set_class`. ~50 lines
  including the pattern-class lookup. The pattern-class instance
  comes from `src/card/set-patterns/registry.ts:123` (`generic_label`)
  and `src/card/set-patterns/labels.ts:33,73` (`All "X" cards`, `All
  "+X" cards`) which already provide the `generic_label` lookup;
  `anchorless` is the same predicate used in the existing rule-list
  infrastructure (`views.ts:486+`).
- Optional follow-on: also export `findSettingCard` (already at
  `render.ts:1361+`) as the public hook for the per-pattern rule
  lookup.

**Total: ~140 lines of new TS + a ~10-line modification to
rule-bar-right.ts + an ~8-line branch insertion in views.ts#coreView.**

### Round-7 collision notes

Every file touched is round-7 territory. The overlap is the WHOLE
round-7 file surface — none of the changes lands in fresh territory.

- `render.ts` — round-7 file. File 4 adds the `setClassesWithRules`
  engine hook alongside the existing
  `collectRules`/`findSettingCard`/`executeSearch` hooks (lines
  1326-1369). Direct collision; the change is on the same hook
  surface and shares the warmed render-card map. Files conflict on
  insertion order at `src/card/render.ts:~1340` — round 7 already
  extended `collectRules` (line 1341); the new hook must land BEFORE
  the closing brace of the engine interface in `format.ts:746` to
  keep the seam consistent.

- `render/views.ts` — round-7 file (the entire `HTML_VIEWS` table at
  line 1290+ is round-7 territory). File 1 adds the `settingCoreHtml`
  function and one `coreView` branch. Direct collision on `coreView`
  (lines 181-354) — the new branch sits between the existing `set`
  branch (line 257-264) and the `date` branch (line 274-302); both
  round-7 pin comments at lines 220-241 (search_type exemption) and
  250-256 (pointer-list) need to remain unchanged.

- `render/format.ts` — round-7 file. File 2 is documentation-only
  (the show/hide plumbing already forwards correctly per the
  `nestOptionEntries` table at lines 572-580); no code collision but
  round 7's `RenderEngineLike` interface (`format.ts:676-746`) needs
  to grow by one method to carry `setClassesWithRules`. Direct
  interface collision at `format.ts:676`.

- `render/pointer-list.ts` — round-7 file. No code change in this
  PR. Documented for the next reader: the `_left`-inherit rendering
  lives in `rule-bar-right.ts`, not here.

- `render/rule-bar-right.ts` — round-7 file. File 1 (the rule-bar-right
  `_left`-inherit branch) extends `ruleOneLineContent` (line
  104-137) by adding an
  `if (card.typeCode === "list" && card.dbContent === "_left" &&
  isPermissionRightSetting(rightSetting))` branch ahead of the
  existing `truncatedCore(card.dbContent)` fall-through (line
  134-136). Direct collision on the dispatch shape (round 7's
  cluster-6 reconciliation comment at lines 64-79 needs to remain
  the source of truth for permission-right vs not).

- `fetch/retrieve.ts` — round-7 file. NOT touched by this PR. The
  setting-type rules' existence is read off the warmed render-card
  map (`render.ts:1343-1351`); no fetch plumbing changes.

- `name.ts` — round-7 file. NOT touched. The
  `*all+*read`/`*all+*create`/`*all_plus+*read`/`*type+*read`/
  `*right+*read`/etc. names already parse through `DeckoName.parse`
  correctly (round 7's name algebra handles the underscore-keyed
  variants).

- `mod-loader.ts` + the mod loader files — round-7 territory. NOT
  touched. The setting-type core view is a hardcoded branch in
  `coreView`, not a mod-registered view. The `rule_help` view is
  already registered in
  `src/card/mod-loader/mods/card-mod-rules.ts:295-318`; the setting
  card's `view :rule_help` in Ruby (`setting.rb:59-61`) is NOT ported
  as a separate view because the new `settingCoreHtml` inlines the
  rule_help call directly (matches the HAML line 1
  `_render_rule_help`). If a future round chooses to register
  `rule_help` for the Setting set module instead of inlining, the
  mod-loader surface is the same shape as
  `card-mod-rules.ts:295-318` and the dispatch would move there.

Net collision: 5 of 8 round-7 files receive code changes (or
interface growth); 3 (fetch/retrieve.ts, name.ts, mod-loader.ts) are
referenced for the negative — they were inspected and found not to
need changes.

### Verification plan

Two-tier verification:

**Tier 1 — corpus byte-shape probes (the ask's named check).** Run
the four oracle pages through the staging harness against the new
build and diff against `tmp/raw-ground-truth/oracle-pages/`:

- `tests/card/render/render-oracle.test.ts` (existing oracle harness)
  — add three new test cases: `recapture-raw:38769-Wikirate:render:open`,
  `recapture-raw:259-Set:render:open`,
  `recapture-raw:274-_all:render:open`. Existing test
  infrastructure: pass.
- `recapture-raw:6547-_read:render:open` (new) — the `_read` oracle
  at 337KB needs a new shard entry; the existing `_read.html`
  (corpus:6547 already exists, but the recapture-raw shard carries
  the full 3,612-line `_read` body and would land at
  recapture-raw-shard-000003.jsonl, offset unknown without a
  re-capture). Run
  `node scripts/capture-expected.js --root 6547 --card "*read" --view open`
  against the live Decko Ruby server, save to
  `tmp/raw-ground-truth/expected/recapture-raw-shard-NNN.jsonl`, and
  diff against the staging render. The expected byte identity is the
  full `_read.html` body minus slot-id randomization (which the
  harness already accounts for via the `data-slot-id="RANDOMIZED"`
  substitution).

**Tier 2 — targeted cluster probes.** Three new fixtures in
`tests/card/render/` covering the new branches:

- `tests/card/render/setting-core.test.ts` — render `*read` against
  a minimal seeded corpus (3 patterns: `*all+*read`, `*type+*read`,
  `*right+*read`; each with a 1-item pointer list dbContent
  "Anyone"). Assert: presence of `<div class="alert alert-info
  rule-instruction">`, presence of `<h3>All read rules that apply
  to</h3>`, presence of the three `<p><h5>…</h5>…bar-view…</p>`
  blocks with the correct generic labels ("all cards", "cards of a
  given type", "given field cards"). 1 test, ~30 lines.
- `tests/card/render/setting-inherit-perm.test.ts` — render
  `*all_plus+*read` (dbContent "_left") inside a `_read` page;
  assert the bar_right contains
  `<span class="inherit-perm">Inherit from left card</span>` per
  `_read.html:160`. 1 test, ~15 lines.
- `tests/card/render/set-listing-body.test.ts` — render `Set` against
  the corpus-v2 fixture (already seeded with 1,009 cards including
  `Set`); assert the `set-Xtype-by_name-titled-view` body contains
  `<div class="card-list card-list-bar search-result-list">` and at
  least one `<div class="search-result-item item-bar">…bar-view…
  </div>`. 1 test, ~20 lines.

**Tier 3 — regression safety.** Re-run the existing
`tests/card/render/render-oracle.test.ts` (1,080 tests across 48
shards, the byte-equality fixture) to confirm zero regression on the
corpus-shaped entries. Re-run `tests/card/mod-loader/` (the
chain-aware dispatch tests) to confirm the new `coreView` branch does
not get hijacked by a later mod loader's :core registration. Re-run
`tests/card/render/nest-item-and-one-line-limit.test.ts` (the
rule-bar-right pointer-list shape regression) to confirm the
`_left`-inherit branch is downstream of the existing cluster-6
reconciliation.

**Acceptance gate:** Tier 1 byte-identity for the 4 named oracle
pages + Tier 2 new-test green + Tier 3 zero regression. The `_read`
recapture is the costliest step (one fresh Oracle pull against the
Ruby server); the rest reuses existing harness.

---

## 2. Family: set-500-codename

### Mechanism (with cites)

Codenames resolve through the codehash (DbCodenameRegistry.c2i Map)
loaded by `DbCodenameRegistry.processCodenames` at first use
(`src/card/fetch/codename.ts:120-123`). The codehash is built from the
cards table `WHERE codename IS NOT NULL` (`codename.ts:33-37`). When a
mark resolution hits an unknown codename, four throw sites exist:

- `src/card/fetch/retrieve.ts:150` — `CodenameMarkArg` →
  `codenames.id()` returns undefined →
  `throw new CodenameNotFoundError(`codename doesn't exist:
  ${mark.codename}`)`
- `src/card/fetch/retrieve.ts:184` — `":codename"` string mark →
  same throw
- `src/card/fetch/retrieve.ts:209` — `nameFromMark` on a
  `CodenameMarkArg` → same throw
- `src/card/name.ts:248` — `DeckoName.idFromString(":codename")` →
  `getNameEnvironment()?.codename?.id()` returns undefined → same
  throw
- `src/card/name.ts:270` — `badMark` on `":codename"` → same throw

The corpus seeding (`raw-corpus-seeding.ts` /
`permission-corpus-seeding.ts`) loads rows from recapture shards into
the `cards` table. The raw corpus (`fixtures/corpus/shard-*.jsonl`)
carries:

- `*type` card id 266 with codename `"type"` (pattern card for the
  `*type` pattern, code `"type"` in `PATTERN_TABLE` `registry.ts:274`)
- `*members` card id 98 with codename `"members"` (referenced by
  `cql/parser.ts:560` `member_of` and `parser.ts:572` `member` as
  `{ codename: "members" }`)
- `"by_name"` card id 184 named `"lvpmhsf"` with codename `"by_name"`
  (referenced by `card-mod-list` `autocompleteOptionsCard`
  `card-mod-list.ts:536`, `"*all+by name"` options card)

The recaptured corpus-v2 anonymization
(`fixtures/corpus-v2/recapture/recapture-shard-*.jsonl`) preserves
shape but replaces the simple-card names + codenames for these three.
The codehash is therefore seeded without `type`, `/ by_name`, /
`members`.

When GET `/Set` renders, `RenderEngine.render` →
`fetcher.fetchByName("Set")` → `normalizeMark` → `nameFromMark` →
`DeckoName.parse("Set")` (simple, no codename lookup). Then
`setRulesCoreHtml` (`views.ts:486`) iterates each setting in the
static group tables (`views.ts:708-714` `GROUP_TO_SETTINGS`) and calls
`fmt.engine.findSettingCard(settingCodename)` (`views.ts:614`). None
of those setting codenames
(`autoname`/`default`/`structure`/`create`/`read`/`update`/`delete`/
`captcha`/`head`/`layout`/`style`/`script`/`help`/`input_type`/`guide`/
`content_options`/`content_option_view`/`on_create`/`on_update`/
`on_delete`/`thanks`/`follow_fields`/`follow`) is
`"type"`/`"by_name"`/`"members"` — that branch does not throw. The
`setRulesCoreHtml` also walks `renderView`'s `nestRecord` path
(`views.ts:602,621`) which calls `fetchRenderCard`, which is a
synchronous Map lookup, not a codename lookup.

The 500 actually fires from the pattern-walk side of the render —
the `*type` pattern has code `"type"` (`registry.ts:274`),
`patternCardName` `"*type"` (`registry.ts:275`).
`PatternInstance.patternCardName` (`instance.ts:79-87`) calls
`getNameEnvironment()?.codename?.id("type")` which returns undefined
in the anonymized corpus (because the card with codename `"type"` was
renamed and its codename column nulled). The instance falls through
to the `spec.patternCardName` fallback `"*type"` — that branch does
NOT throw.

The throw site that matches `"codename doesn't exist: type"` /
`"by_name"` / `"members"` is `normalizeMark`'s `idFromMark`
(`retrieve.ts:148-152`) when a code path passes a `CodenameMarkArg` or
`":codename"` string. The CQL parser (`parser.ts:560,572`) is the only
production call site that emits a `{ codename: "members" }`
`CodenameMarkArg` — but that path is reached only when `member_of` /
`member` CQL clauses are parsed, which happens for Search-type cards
with content that includes such clauses. The set-type rule card
`"Set+*type+by_name"` in the captured oracle (line 112 of
`oracle-pages/259-Set.html`) is type `search_type`
(`data-card-type-id="30"`); the engine prepares its CQL — and
`"Set+*right+*structure"`-shaped search cards carry content that
includes `refer_to` / `member_of` clauses. When `parseCql` walks the
`member_of` clause (`parser.ts:558-561`), it inserts
`{ referred_to_by: { left: val, right: { codename: "members" } } }` —
but this is the parser AST, not a runtime lookup. The runtime lookup
fires when the search warm tries to materialize the CQL SQL —
through `restrict` → `idFromVal` (`parser.ts:485-489`) which uses
`opts.resolveCardId`. `resolveCodename` on `parser.ts:564` is called
only for `member` (not `member_of`), and the codename `"members"` is
then looked up via `fetcher.codenames.id("members")`
(`set-type-assignment.ts:160`) which returns undefined because the
corpus-v2 codehash lacks `"members"`.

The earlier `"by_name"` variant fires from the
`autocompleteOptionsCard` path (`card-mod-list.ts:534-537`) only when
a Search/List item view nests a `name_autocomplete_field` — not on
`/Set` open. The `"type"` variant fires for any card whose prepare
phase touches the `*type` pattern walk — every card touches it. The
common denominator is that the recaptured corpus (corpus-v2) does not
seed the pattern cards' codenames (`"type"`), the reference-card
codenames (`"members"`), or the by_name card (the raw `"lvpmhsf"`
with codename `"by_name"`). The fix is to seed these three codenames
in the recapture's card rows BEFORE the codehash loads.

### Port plan

The fix lives in the corpus seeding layer, not in decko-ts engine
code. The recapture script
`tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` (and the parallel
`tests/card/render/permission-corpus-seeding.ts`
`createCorpusSeededStorage`) ingest the recapture-shard-*.jsonl rows
directly into the `cards` table; the codehash reads
`WHERE codename IS NOT NULL` (`codename.ts:33-37`), so adding the
codename column on three seed rows is sufficient.

Three codenames to register in the seed rows:

- codename `"type"` → card name `"*type"` (id 266 in the raw corpus;
  the `*type` pattern card, `registry.ts:274`)
- codename `"by_name"` → card name `"by name"` (the
  unmodified-by-name raw card; id 184 in the raw corpus, originally
  named `"by_name"` / `"by name"`, anonymized to `"lvpmhsf"`)
- codename `"members"` → card name `"*members"` (id 98 in the raw
  corpus, registry-driven; referenced by `cql/parser.ts:560,572`)

For each: write a row to the `cards` table with the canonical name,
the codename column set, `type_id` pointing at the appropriate
cardtype (Basic for these three), and the same anonymized content.
The simplest implementation is one inline INSERT in the seeding
script (post-anonymization, before codehash build), keyed on a
deterministic stable id range that doesn't collide with recaptured ids
— e.g. the three rows take fixed ids 1, 2, 3 in a reserved seed range,
and the recapture ingest shifts its id assignments to start at 100.
The fix is a few lines in the seeding script, no decko-ts engine
code change. Estimated size: ~30 lines (3 INSERTs + a guarded helper
that ensures they're present across seed runs).

### Round-7 collision notes

Round 7 files explicitly listed in the ask: `render.ts`
(`src/card/render.ts`), `views.ts` (`src/card/render/views.ts`),
`format.ts` (`src/card/render/format.ts`), `rule-bar-right.ts`
(`src/card/render/rule-bar-right.ts`), `pointer-list.ts`
(`src/card/render/pointer-list.ts`), `retrieve.ts`
(`src/card/fetch/retrieve.ts`), `name.ts` (`src/card/name.ts`),
`mod-loader` (`src/card/mod-loader.ts`).

The fix is entirely in the corpus seeding
(`tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` and
`tests/card/render/permission-corpus-seeding.ts`). It does NOT
modify any of the round 7 files. The throw sites in
`retrieve.ts:150/184/209` and `name.ts:248/270` are the surface; the
fix is upstream of them.

Read-only cross-references that DO appear in round 7 files but are
not modified:

- `src/card/fetch/codename.ts:33-37` — the SELECT that builds the
  codehash; unchanged, the new INSERTs feed it
- `src/card/render/views.ts:708-714` — `GROUP_TO_SETTINGS` settings
  codenames (none of `type`/`by_name`/`members`); unchanged, the
  `*type + by_name` card is rendered via the nested rule list, not via
  `findSettingCard`
- `src/card/render.ts:1264-1283` — `preloadAllSettingCards` (the 23
  setting codenames); unchanged, does not need
  `type`/`by_name`/`members`

Round 7 files touched by the FIX (none): 0. The fix is in seed-data
land, not engine code.

### Verification plan

The fix is verified by re-running the hosted-copy GET `/Set` against
the seeded corpus. Concrete verification:

1. Build seed storage:
   `tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` with the three
   INSERTs added (codename `"type"` / `"by_name"` / `"members"`
   written before the codehash build).
2. Cold-start the engine (RenderEngine with the seeded FetchEngine),
   call `engine.render("Set", "open")`, capture the rendered HTML.
3. Diff against `tmp/raw-ground-truth/oracle-pages/259-Set.html`
   (the Ruby-rendered Set page, 879 lines, captures the rule chain
   incl. `Set+*type+by_name`). The 500 disappears; the Set page
   renders with the Rules section showing the search-type rule row.
4. Targeted sub-checks (each passes iff its command returns the
   expected value):
   - `node -e 'const {FetchEngine}=require("./src/card/fetch"); ...
     await engine.codenames.id("type")` returns a positive integer
     (not undefined)
   - `await engine.codenames.id("by_name")` returns a positive integer
   - `await engine.codenames.id("members")` returns a positive integer
   - `engine.render("Set", "open")` resolves with a string of length
     > 0 and contains `data-card-name="Set+*type+by_name"` (the rule
     row visible in the captured oracle)
5. The check the ask names is the served URL: the decko-ts deploy
   worker (`worker.ts` / `wrangler.toml`) hitting GET `/Set` on the
   seeded deck returns HTTP 200 with the Set page bytes; the prior
   500 with body `"codename doesn't exist: type"` is gone.

None of the above commands were executed in this session — the ask
is READ-ONLY, and the fix is plan-only. Reporting the verification
recipe, not the result.

---

## 3. Family: wikirate-tag-404

### Mechanism (with cites)

TWO-LAYER BUG, both read-only-verified in this ask:

**1) PRIMARY (serving path):** `vm-staging-server.mjs:212-272`
(`primeEngine`) never wires `FetchEngine.virtualCardLookup`. The hook
is declared as optional at `src/card/fetch.ts:120` and only evaluated
at `src/card/fetch.ts:383-397` inside `newResultCard`. Without the
hook, the compound-name fetch path returns `undefined` for any name
whose junction row does not exist in `cards`, and the staging server's
catch at `vm-staging-server.mjs:1403-1418` then turns that into HTTP
404 with the engine's "card not found: Wikirate+tag" message. The hook
IS wired in two test files
(`tests/card/render/structure-corpus-seeding.ts:240`,
`tests/card/render/virtual-card-fetch-render.test.ts:112`) and is
documented as the storage factory's responsibility in the
virtual-cards module doc (`src/card/fetch/virtual-cards.ts:44-49`),
but neither production serving entry (this mjs file AND
`deploy/worker.ts:73-80` `bootDeck`) wires it.

**2) LATENT (rule universe):** even with the hook wired,
`Wikirate+tag` still resolves undefined — verified directly by
re-running `fetcher.fetchByName("Wikirate+tag")` with
`createVirtualCardLookup` wired against the corpus's 139-rule
universe (statement at `src/card/rules/structure.ts:88-124`, helpers
at `:140-180`). The candidate walk
(`src/card/fetch/virtual-cards.ts:108-119` ->
`set-patterns/rule-names.ts:47`) tries, in order,
`Place+tag+*type plus right+*structure`,
`tag+*right+*structure`, `*all plus+*structure`,
`*all+*structure` — none exist (queried directly: 0 rows match). So
`Wikirate+tag` is a corpus/rule-universe gap that no amount of
fetch-layer wiring can paper over; the live Ruby deck must have
additional rules the scrubbed corpus does not carry. By contrast,
sibling names with `*right`/`*self`/`*type` rights DO resolve through
existing rules (`*right+*right+*structure`,
`*self+*right+*structure`, `*type+*right+*structure`) — verified.

**PROOF THE CARD DOES NOT EXIST IN CORPUS** (run against
`tmp/raw-ground-truth/deck/corpus-v2.sqlite3`):

- `SELECT * FROM cards WHERE name LIKE '%Wikirate+tag%'` → 0 rows.
- `Wikirate` card: id=38769, key='wikirate', type_id=442 (Place).
- `tag` card (codename under `*structure`-as-right is what the
  right-name resolves to): id=128, key='tag', name='tags',
  type_id=22281 (BasicCs).
- `SELECT id FROM cards WHERE left_id=38769 AND right_id=128 AND
  trash=0` → 0 rows.
- 11 junction rows total reference Wikirate (`Wikirate+Image`,
  `Wikirate+description`, `Wikirate+Documents`, `Wikirate+related`,
  etc.); none are `Wikirate+tag`.
- 40,090 of 49,829 corpus rows are orphan junction rows (name NULL) —
  the universe virtual cards are meant to resolve.

**PROOF THE FETCH RETURNS UNDEFINED** (run via
`node tmp-verify-wikirate-tag.mjs` against corpus-v2.sqlite3 with the
staging server's exact primeEngine path):

- `fetcher.fetchByName("Wikirate+tag")` → undefined.
- `fetcher.lexicon.id(DeckoName.parse("Wikirate+tag"))` → undefined.
- Trace: `fetchByName` → `fetchWithOptions` → `normalizeMark` returns
  `{kind:"name", name: DeckoName("Wikirate+tag")}` →
  `retrieveExisting` → `retrieveFromDb`
  (`src/card/fetch/retrieve.ts:248-283`); compound name (line 257
  `mark.name.isSimple` is false because
  `DeckoName.parse("Wikirate+tag").isCompound` is true — see
  `src/card/name.ts:469`); falls to the `else` at line 276
  `const id = ... await lexicon.id(mark.name)`; `lexQuery`
  (`src/card/fetch/lexicon.ts:223-233`) renders
  `WHERE left_id = ? AND right_id = ? AND trash = 0` with params
  `[38769, 128]`; zero rows → `id === undefined` →
  `return { row: undefined, ... }`. Without the `virtualCardLookup`
  hook, `newResultCard` (`src/card/fetch.ts:353-398`) returns
  undefined at line 397. Staging server catches and 404s.

**PROOF THE ORACLE EMITS THE LINK AS WANTED** (oracle html
`tmp/raw-ground-truth/oracle-pages/38769-Wikirate.html:50-58`):

- `<a class="full-page-link wanted-card" href="/Wikirate+tag">` —
  `class="wanted-card"` is the deck's mark for a virtual card with no
  real row; the link is emitted unconditionally by the bar-menu
  partial regardless of whether the junction row exists.
- Same row also emits
  `<a rel="nofollow" class="edit-link slotter" href="/Wikirate+tag/edit">`
  and `href="/Wikirate+tag/board"` — every one 404s on the staging
  copy for the same reason.
- Sibling `<a class="full-page-link known-card"
  href="/Wikirate+Documents">` lines (oracle:118, :227) carry
  `class="known-card"` — these resolve fine because real junction
  rows exist.

**FIX LOCATION:**

- File: `vm-staging-server.mjs`, function `primeEngine` at lines
  212-272.
- Add a final block (after the lexicon warm at line 271) that runs
  `structureRuleUniverseStatement()` (already exported from
  `dist/src/card/rules/structure.js`, the same statement
  `tests/card/render/structure-corpus-seeding.ts:237` uses), folds
  the result with `structureUniverseFromResults` +
  `structureRuleTypesFromResults`, and assigns
  `fetcher.virtualCardLookup = createVirtualCardLookup(fetcher,
  { contents, ruleTypeIds })` — exactly the shape at
  `tests/card/render/structure-corpus-seeding.ts:240-243`.
- The same fix needs to land in `deploy/worker.ts` `bootDeck` (lines
  73-80) and its `primeCqlNameResolver` (lines 144-214) so the
  Cloudflare worker path matches; the worker has the same root-cause
  bug. The render-side `RenderEngine` already loads its own structure
  universe at `src/card/render.ts:688-700` (`parseStructureContents`)
  and is unaffected — that path serves only the *content* of a card
  whose existence the fetch layer already determined.
- Note for the latent gap: even with the wiring, `Wikirate+tag` will
  continue to 404 until either the corpus grows a
  `Place+tag+*type plus right+*structure` rule, the rule-universe
  loader looks harder (it currently misses anything with a multi-step
  set chain), or the live deck's resolved rule is captured into the
  corpus. That is a separate corpus/seed fix, not a code fix.

### Port plan

Single touch in `vm-staging-server.mjs` `primeEngine` (lines 212-272):

1. Add imports near line 48:
   - `import { createVirtualCardLookup } from "./dist/src/card/fetch/virtual-cards.js";`
   - `import { structureRuleUniverseStatement, structureUniverseFromResults, structureRuleTypesFromResults } from "./dist/src/card/rules/structure.js";`
2. After the `fetcher.lexicon.write(...)` loop at line 271 (end of
   the existing primeEngine), append one block:
   - `const [universeResult] = await driver.batch([structureRuleUniverseStatement()]);`
   - `fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, { contents: structureUniverseFromResults(universeResult), ruleTypeIds: structureRuleTypesFromResults(universeResult) });`
3. Mirror the same 4-6 lines inside `deploy/worker.ts` `bootDeck`
   (after line 79) and `primeCqlNameResolver` (after the
   lexicon-write loop at line 212), so the CF Worker path matches.

Estimated size: ~6 lines of mjs + ~6 lines of TS in worker.ts. No
new files; no schema change. Imports already exist in tests, dist
already exports all three helpers.

### Round-7 collision notes

Round 7 touched `render.ts`, `views.ts`, `format.ts`,
`rule-bar-right.ts`, `pointer-list.ts`, `retrieve.ts`, `name.ts`,
`mod-loader`. THIS GAP TOUCHES NONE OF THEM.

- `retrieve.ts` is in the collision list but the gap is upstream of
  it (the engine's compound-name DB lookup is correct; it's the
  FETCH seam that needs the `virtualCardLookup` wiring). No edit to
  `retrieve.ts` is needed.
- `name.ts` is in the collision list but `DeckoName.parse` correctly
  produces `isCompound=true` for `"Wikirate+tag"` — the gap is not in
  name parsing. No edit to `name.ts`.
- `render.ts` already loads the structure universe on its own
  (`parseStructureContents` at `render.ts:688-700`); nothing for this
  gap.
- No shared file is modified by the fix. The new code is isolated to
  `primeEngine` in `vm-staging-server.mjs` and `bootDeck`/
  `primeCqlNameResolver` in `deploy/worker.ts`.

Flag for round 7: `render.ts`, `retrieve.ts`, `name.ts` are listed
but read-only here — no edits in this round.

### Verification plan

1. Re-run the corpus-side check the ask named:
   `node -e "const Database=require('better-sqlite3');const db=new Database('tmp/raw-ground-truth/deck/corpus-v2.sqlite3',{readonly:true});console.log(db.prepare('SELECT id FROM cards WHERE left_id=38769 AND right_id=128 AND trash=0').all())"`
   — confirm 0 rows (card does not exist).
2. After the fix, restart the staging server
   (`node vm-staging-server.mjs tmp/raw-ground-truth/deck/corpus-v2.sqlite3 3100`);
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/Wikirate+tag`
   — expect 200 (was 404) for any compound name whose rule walk
   hits. Sibling probe:
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/Wikirate+*right`
   — expect 200, proving the wiring works. Counter-probe for the
   latent gap:
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/Wikirate+tag`
   — still 404 (the rule-universe is missing the tag-set rule; that
   requires a corpus/seed fix, not a code fix).
3. Mirror verification on the CF worker:
   `tests/deploy/deploy-worker-miniflare.test.ts` already exercises
   `/Wikirate+*right` style routes via miniflare; add (or extend) an
   assertion for `/Wikirate+tag` returning 200 if the rule-universe
   is grown, or document the latent gap as expected 404.
4. Oracle parity probe:
   `curl -s http://localhost:3100/Wikirate+*right | grep -c 'wanted-card'`
   should now match the oracle's pattern (one wanted-card link per
   unresolved virtual card remaining, zero for resolved ones). For
   `Wikirate+tag` specifically, the oracle still emits
   `wanted-card`; the served page will continue to mark it wanted
   until the rule-universe gap is closed.

---

## 4. Family: coldstart-500

### Mechanism (with cites)

The codename codehash is loaded lazily.
`DbCodenameRegistry.codehash()` (`src/card/fetch/codename.ts:113-124`)
reads from `CardCache` (key `CODENAMES_CACHE_KEY`, `codename.ts:16`)
and, on miss, runs `processCodenames()` (`codename.ts:147-152`) which
executes
`SELECT id, codename, name, left_id, right_id FROM cards WHERE codename IS NOT NULL`
(`codename.ts:21-22`). The result is written to the cache and
memoized in `codehashValue`. The sync peek adapters `peekId` /
`peekNameForId` / `peekName` (`codename.ts:76-87`) read from that memo
and return `undefined` until the load runs.
`FetchEngine.installNameEnvironment()` (`src/card/fetch.ts:666-690`)
wires those peeks into the global name environment so
`DeckoName.parse(":members")` (`src/card/name.ts:161-181`) →
`idFromString` (`name.ts:240-253`) finds them; if
`getNameEnvironment()` returns undefined, OR the codename is not in
the codehash, the call throws
`CodenameNotFoundError("codename doesn't exist: members")`
(`name.ts:247-249`).

The hosted origin's boot path is `vm-staging-server.mjs#primeEngine`
(lines 212-272). It (1) `await engine.codenames.ensureLoaded()` at
line 214, (2) does a single full-table
`SELECT id, name, left_id, right_id FROM cards WHERE trash = 0` at
line 219-222, (3) composes junction names, (4)
`fetcher.installNameEnvironment()` at line 261, and (5)
`fetcher.lexicon.write(...)` for every row. So the codehash and the
sync name-environment adapters SHOULD be hot before the server takes
requests. The first-request failure on `/help` therefore has to come
from a render-time codename lookup that runs BEFORE the render's own
codehash fold (or a card whose content carries a `:members` mark that
the deck genuinely doesn't carry).

The render path that first requests hit
(`src/card/render.ts:279-538`):

- L 280: `fetcher.fetchByName(cardName)` — cache miss on cold, runs a
  SELECT.
- L 291-296: `closureWarm` (`render.ts:1741-1766`) is a MEMBER
  predicate on `this.renderCards`. On the first request it returns
  `false` because the engine's render-card map is empty. THIS IS THE
  `closureWarm` ORDERING BUG: every per-engine state map
  (`renderCards`, `idsByKey`, `searchResults`, `optionsCardCache`,
  `setHostChainCache`, `ruleCache`, `viewDispatchCache`,
  `deniedVerdicts`, `deniedVerdictsByKey`, `ruleTypeIds`,
  `structureContents`, `structureProcessed`, `taskVerdicts`,
  `readPermission`) is initialized undefined; only `readPermission`
  (L 291) and `ruleTypeIds` (L 292) and `structureContents` (L 293)
  get the cold detection, and the cold codehash statement is folded
  into the prefetch's FIRST batch via `coldStatements` (L 297-304)
  followed by `prefetchInclusionClosure` (L 305-321).
- L 322-330: `foldedResults = stats.additionalResults`, then
  `parseRuleTypeIds(foldedResults, ...)` folds the codehash via
  `foldCodehashResults` (`codename.ts:101-108`). Only NOW is
  `codehashValue` populated and the sync peeks return real ids.
- L 338: `applyStructureContent()` (`render.ts:738-819`) iterates
  EVERY prepared render card and calls
  `DeckoName.parse(refName).key` (`render.ts:761`) for every
  reference. This call has NO try/catch for
  `CodenameNotFoundError` — unlike `cardReferenceKeys`
  (`render.ts:1781-1797`), which catches it, and `prefetch.ts:523-531`,
  which also catches it. So a reference whose text starts with `:`
  reaches `idFromString` (`name.ts:240-253`) and throws if the
  codename isn't in the codehash.

Why "later requests succeed": `applyStructureContent` writes to
`this.renderCards` and mutates `card.dbContent` in place
(`render.ts:754-759`, `card.dbContent = resolved.templateContent`).
`structureProcessed` (`render.ts:239, 744-745`) marks cards BEFORE
the ref iteration throws, and the structured template REPLACES the
raw content (`render.ts:754-759`) — so once pass 1 has touched a
card, its raw `:members` is gone on the next render. On the second
request, `closureWarm` returns `true` (`renderCards` has the root
card and every transitive ref) and the cold prefetch is skipped;
`applyStructureContent` walks the render-cards map but
`structureProcessed.has(key)` short-circuits every card pass 1
marked. The throw site is bypassed.

Why "members" specifically: the deck's content includes a reference
that is either `:members` directly OR a tag that decko's rule walk
produces from a member-list junction (e.g. `<Role>+*members`). The
`MEMBERS_CODENAME` constant (`src/card/permissions/read-rules.ts:67`)
names the `*members` setting card. If that card is NOT in the
scrubbed corpus (the corpus anonymizer omits `*members` rows), the
codehash has no `members` entry, the throw fires, and the
structured-template substitution that pass 1 performed mutates the
bad reference away before the engine returns to idle — leaving pass
2 unblocked.

Net mechanism: cold render hits a `DeckoName.parse(":members")` call
before the codehash fold reaches `codehashValue`; the throw unwinds
out of `applyStructureContent`; pass 1's mutation of `card.dbContent`
to the structured template eliminates the offending ref; the next
request's `closureWarm === true` skips the cold path; subsequent
requests render normally because no further codename-mark reference
is iterated.

### Port plan

Two independent fixes, port plan for the TypeScript engine
(`C:/localProjects/decko-ts/src/`, READ-ONLY this session; edits
land in `vm-staging-server.mjs` OR `render.ts`).

**Fix A (server boot pre-warm, smallest diff, no engine changes):**
in `vm-staging-server.mjs` extend `primeEngine` (lines 212-272) with
a warm-render pass. After the existing lexicon + codehash load
completes (after line 271), call
`await render.render(HOME_CARD_NAME, OPEN_VIEW)` once. That drives
`RenderEngine.render()` end-to-end with `closureWarm === false`,
populates `renderCards`, `idsByKey`, `searchResults`,
`deniedVerdicts`, `ruleTypeIds`, `structureContents`,
`structureProcessed`, `ruleCache`, `viewDispatchCache`, `helpRules`,
and the `helpResolver` (lines 260-262 already wire help-rules — the
warm render closes that path too). Subsequent production requests
find `closureWarm === true` (`render.ts:296` short-circuits the cold
prefetch and the `applyStructureContent` loop is skipped via
`structureProcessed`). Estimated size: ~5-10 lines added to
primeEngine, plus a try/log on the warm render so a missing-card
doesn't abort boot.

**Fix B (engine warm path, address the root cause):** make the
render's `applyStructureContent` resilient to bad codename marks
the same way `cardReferenceKeys` (`render.ts:1791`) and the prefetch
closure (`prefetch.ts:526`) already are. Wrap the
`DeckoName.parse(refName).key` call at `render.ts:761` in a
try/catch for `CodenameNotFoundError` and `NameNotFoundError` that
drops the ref (mirroring `prefetch.ts:525-531`'s
`if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) { pending.delete(nameStr); continue; }`).
Estimated size: 6-10 lines, single-site change in `render.ts`.
Optionally also harden `parseRuleTypeIds` (`render.ts:1622-1639`) —
the `void this.fetcher.codenames.ensureLoaded()` branch on line
1632 fires `void` (does not await) and then immediately reads
`peekId` (lines 1635-1637); a warm-closure first render can race the
in-flight load and produce a fully-undefined `ruleTypeIds`. Convert
that branch to `await this.fetcher.codenames.ensureLoaded()` (no
`void`).

### Round-7 collision notes

Round 7's files per the ask: `render.ts`, `views.ts`, `format.ts`,
`rule-bar-right.ts`, `pointer-list.ts`, `retrieve.ts`, `name.ts`,
`mod-loader`. Touch-points for THIS fix:

- `render.ts`: load-bearing (Fix B's try/catch is at `render.ts:761`;
  the `ruleTypeIds` await fix is at `render.ts:1632-1637`). Shared
  with round 7.
- `retrieve.ts`: NOT modified by Fix A or Fix B. No collision.
- `name.ts`: NOT modified. No collision. The throw site at
  `name.ts:247-249` stays as-is (other ports intentionally surface
  it; Fix B absorbs the throw one level up).
- `views.ts`, `format.ts`, `rule-bar-right.ts`, `pointer-list.ts`,
  `mod-loader`: NOT modified. No collision.

Fix A is server-side (`vm-staging-server.mjs`, not in round 7's list)
so it has ZERO round-7 overlap regardless. The minimum-overlap plan
is Fix A: 0 round-7 files touched. Fix B touches exactly one
round-7 file (`render.ts`).

### Verification plan

Verification lives in two pieces:

1. **Engine side (Fix B).** Replay a single `/help`-shaped render
   through the corpus replay driver with a counting driver, then
   assert (a) the response is 200 on the first request, and (b) no
   `CodenameNotFoundError` escapes. The existing replay path is the
   corpus driver under `tools/`; the test command that already gates
   this lane is the round m-tsc / round m tests tree gates
   (`tmp-gate-roundm*.log` in the repo root), specifically the
   closure-warm-200 / first-render-no-throw assertions on the corpus
   shard. Run: the gate the deck battery uses for "first-request
   renders return 200 with zero queries on the second request" —
   this is what round-m has been instrumenting. Confirm the gate
   passes both cold (first request) and warm (second request).

2. **Server side (Fix A).** Restart `vm-staging-server.mjs` against
   the scrubbed corpus, then issue ONE `curl -s
   http://127.0.0.1:3100/help` BEFORE any other request. Assert
   (a) HTTP 200, (b) the response body's bytes do not contain
   "codename doesn't exist", and (c) the response body contains the
   layout shell. Then issue a second `curl` and confirm zero SQL
   round trips on the second request (the perf gate). The HTTP smoke
   command is
   `curl -s -o /tmp/help.html -w "%{http_code}\n" http://127.0.0.1:3100/help`
   followed by `grep -c "codename doesn't exist" /tmp/help.html`
   (must be 0) and `grep -c "Culturesmith" /tmp/help.html` (must be
   >= 1).

Both fixes verify the same observable: first request to `/help`
returns 200, body contains the layout, no `CodenameNotFoundError` in
the response bytes. Run command named in the ask for THIS ask is the
trace and the engine fix; the explicit restart-and-curl named above
is the deploy-time smoke. Neither check was executed in this
READ-ONLY session — both are not-run, to be executed after the port
lands.

---

## Recommended implementation order

Cheapest + least-colliding first. The four fixes partition into two
groups by their round-7 overlap; the corpus-side fixes have zero
round-7 file edits and can land as soon as the round-7 release
delivers the seed/storage factory shape.

1. **set-500-codename** (Family 2). Touches only seed-script files
   (`tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts` and
   `tests/card/render/permission-corpus-seeding.ts`). Zero round-7
   collision. ~30 lines. Can land before round 7's `src/` release.
   Acceptance: `engine.render("Set", "open")` returns 200 with the
   `Set+*type+by_name` rule row, and the three `codenames.id(...)`
   peeks return positive integers.

2. **wikirate-tag-404** (Family 3). Touches only `vm-staging-server.mjs`
   `primeEngine` (lines 212-272) and the matching `deploy/worker.ts`
   `bootDeck`/`primeCqlNameResolver` blocks. Zero round-7 collision
   (the round-7 files `retrieve.ts`, `name.ts`, `render.ts` are
   inspected but not modified). ~12 lines. Can land before round 7's
   `src/` release. Acceptance: `GET /Wikirate+*right` returns 200;
   `GET /Wikirate+tag` still 404s (documented latent gap; requires
   corpus/seed fix, not a code fix).

3. **coldstart-500** (Family 4, Fix A first). Touches only
   `vm-staging-server.mjs`. Fix A is server-side; zero round-7 file
   edits. ~5-10 lines. Can land before round 7's `src/` release.
   Acceptance: first `curl http://127.0.0.1:3100/help` returns 200
   with no `"codename doesn't exist"` bytes; second curl shows zero
   new SQL round trips. Fix B (render.ts try/catch + await) is the
   root-cause patch and lands once round 7's `src/` is committed;
   ~6-10 lines, single-site change in `render.ts:761` plus an
   `await` swap at `render.ts:1632`.

4. **nested-listings** (Family 1). Touches `render.ts`, `views.ts`,
   `format.ts`, `rule-bar-right.ts`, and `pointer-list.ts` (read-only
   reference). 5 of 8 round-7 files receive code changes. ~140 lines
   new + ~18 lines modification. Lands after round 7's `src/` is
   released, in this internal order: setting-type `coreView` branch
   first (8 lines), `settingCoreHtml` next (~80 lines), then
   `setClassesWithRules` engine hook (~50 lines), then the
   `_left`-inherit branch in `rule-bar-right.ts` (~10 lines).
   Acceptance: Tier 1 byte-identity for `*read` / `*all` / `Set` /
   `Wikirate` oracle pages + Tier 2 new-test green + Tier 3 zero
   regression on the existing 1,080-test oracle shard.

Ordering rationale: 1 and 2 unlock `/Set` and `/Wikirate+*right`
respectively on the deployed copy before round 7 ships, giving the
deck a working baseline to test against. 3 (Fix A) keeps `/help`
warm-stable before the round-7 source releases, removing the
first-request flake without touching round-7 territory. 4 is the
last PR because every file it touches is round-7 territory; landing
it on top of an already-committed round-7 surface minimizes the diff
review and keeps the setting-type branch out of the round-7 merge
train.
