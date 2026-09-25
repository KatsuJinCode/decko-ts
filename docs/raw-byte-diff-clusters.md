# Raw ground-truth byte-diff cluster map

Generated: 2026-09-25T07:38:03.732Z

## Inputs read

- `tmp\raw-ground-truth\enumeration\verification-aggregate.json` -- per-entry signature source
- `tmp\raw-ground-truth\enumeration\per-class-mechanisms.json` -- full-run baseline

## Population

- On-disk aggregate: `10274` entries, `3835` fail, `3658` byte-diff
- per-class-mechanisms full run: `10274` entries, `6345` fail, byte-diff = `5982` (`2573` card-engine + `3409` render-engine)

### Note on task-numbers vs on-disk numbers

The task description references 6,415 pass / 3,859 fail / 3,692 byte-diff. The on-disk `verification-aggregate.json` is coordinator-fresh but contains only shard 0 (341 entries). The most-recent FULL aggregate on disk is `per-class-mechanisms.json`, which shows 3,929 pass / 6,345 fail / 5,982 byte-diff (2,573 card-engine + 3,409 render-engine). The task's claimed numbers do not match either file. The cluster map below is grounded in (a) the on-disk aggregate for per-entry signatures (122 byte-diff entries from shard 0) and (b) the per-class-mechanisms baseline for full-run counts. Per-cluster extrapolation is documented inline.

## Cluster table

| # | Cluster | Owner | Count (shard 0) | One-line mechanism |
|---|---------|-------|-----------------|---------------------|
| 1 | `parens-name-key-normalization` | ENGINE | 99 | DeckoName.toKey normalizes trailing '(s)' to a single trailing underscore instead of Ruby's '_s' underscore, so `Organizer(s)` keys as `organizer_` (engine) vs `organizer_s` (Ruby). |
| 2 | `tiny-render-type-plus-right-rule-card` | ENGINE | 23 | Engine renders a *type+*right / *right rule card's open/content view as the bare rule-card bar (~10K bytes) while Ruby emits the SET's expanded children list (~60K bytes including _category-all _category-field _category-recent _category-common, four categories). |
| 3 | `set-card-pointer-list-vs-nested-content` | ENGINE | 690 | Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. |
| 4 | `boolean-yes-vs-integer-1` | VIEW-REGISTRY | 0 | Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. |
| 5 | `rule-card-content-as-literal-text` | VIEW-REGISTRY | 2 | Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. |
| 6 | `rule-card-content-as-pointer-list` | VIEW-REGISTRY | 3 | Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. |
| 7 | `read-rule-grant-vs-deny` | SEEDING | 221 | Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). |
| 8 | `runaway-output-recursion` | ENGINE | 2 | Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). |
| 9 | `as-in-layout-error-message-divergence` | ENGINE | 4 | For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. |
| 10 | `search-query-content-vs-literal` | ENGINE | 1 | Engine renders `*layout+*right+*content options:render:content` by interpreting the JSON content spec as a search query and rendering `<div class="search-no-results">` while Ruby renders the JSON literal `{"type": "Layout"}`. |
| 11 | `news-item-show-options-comment-box` | VIEW-REGISTRY | 1 | Engine's `News Item+discussion:render:open` data-slot has only `["open"]` in the show list while Ruby's has `["open","comment_box"]`. |
| 12 | `apostrophe-name-key` | ENGINE | 1 | Engine's name key normalization for an apostrophe diverges from Ruby's: Ruby key `paula_craig_father_s_day` (apostrophe -> `_s`), engine key `paula_craig_father__day` (apostrophe stripped, leaving the underscore from the leading space). |
| 13 | `favicon-text-content-divergence` | ENGINE | 1 | Engine and Ruby render *favicon:render:closed with different literal text — Ruby emits `A favicon (or shortcut icon) is a small image us...` while engine emits `<p><em>Please remember to click ...`. |
| 14 | `deep-read-rule-deny-on-self-or-right` | SEEDING | 586 | Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). |
| 15 | `whitespace-newline-before-div` | ENGINE | 262 | Ruby's HTML output includes a literal `\n` before the closing `</div>` of the inner-slot wrapper (after the accordion body closes), while engine emits the closing `</div>` directly without the newline. |
| 16 | `wiki-link-vs-known-card-html-anchor` | VIEW-REGISTRY | 22 | Ruby's renderer emits `<a class="known-card" href="/CardName">card-title</a>` for wiki-link content references while the engine emits the raw `[[CardName]]` literal. |
| 17 | `external-link-vs-raw-url` | VIEW-REGISTRY | 29 | Ruby wraps external URLs in `<a target="_blank" class="external-link" href="https://...">URL</a>` while the engine emits the raw URL text. |
| 18 | `invite-links-account-empty-div` | ENGINE | 48 | For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder. |
| 19 | `layout-content-pointer-list-wrap` | VIEW-REGISTRY | 30 | For `X+*self+*layout:render:closed|open` the engine wraps the layout name in a `<div class="pointer-list"><div class="pointer-item...">` wrapper while Ruby renders the literal layout name (e.g. |
| 20 | `skin-card-content-not-resolved` | SEEDING | 22 | For `X skin:record` (and `bootstrap: X:record`) Ruby resolves the structured-card content (~500KB of SCSS/CSS) into the JSON `content` field, while the engine returns the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch theme...` (200 bytes) — or for `bootstrap: X:record`, an empty content. |
| 21 | `structured-content-record-empty` | ENGINE | 3 | For *alerts, *now, *version, *count, etc., Ruby resolves the structured-card content (e.g. |
| 22 | `rules-form-filter-vs-content-view` | ENGINE | 6 | For `X+*type plus right:render:open` and similar rule-card composition junctions, Ruby emits a nested `<div id="X-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). |
| 23 | `search-results-vs-literal-content` | ENGINE | 0 | For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...`. |
| 24 | `card-list-name-vs-card-list-bar` | VIEW-REGISTRY | 8 | For `X+*right+*input type:render:content|open` Ruby emits `<div class="card-list card-list-name pointer-list">` while the engine emits `<div class="card-list card-list-bar pointer-list">`. |
| 25 | `known-card-vs-wanted-card-on-rule-set` | ENGINE | 80 | For `X+*type+*create:render:closed` and `X+*type+*delete:render:closed` (HTML/SCSS/Project Cardtype rules), Ruby emits `<a class="known-card" href="/Shark">` (the rule-card set's referent is a known card in Ruby's seed closure) while the engine emits `<a class="wanted-card" href="/Shark">` (same href but a different CSS class — engine treats it as wanted because the seed closure didn't register it as known). |
| 26 | `bar-right-config-content-missing` | VIEW-REGISTRY | 30 | For `mod: X:render:closed` (and similar bar-content cards), Ruby emits a populated `bar-right` slot with the card's description text (`configurations, scripts`, `styles`, `configurations, cardtypes, scripts, styles`) while the engine emits an empty `bar-right` (just a newline then `</div>`). |
| 27 | `help-tooltip-nbsp-empty` | VIEW-REGISTRY | 5 | For *Ace and *on update (and other help-text rule cards) Ruby emits a populated tooltip (`data-bs-content="Configure &lt;a target=&quot;_blank&quot; class=..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. |
| 28 | `set-card-associates-pointer-list` | ENGINE | 107 | For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). |
| 29 | `apostrophe-name-key-extended` | ENGINE | 165 | Broader version of the existing apostrophe-name-key cluster (C12, which only matched one ID). |
| 30 | `skin-card-bar-left-titled-vs-span-title` | VIEW-REGISTRY | 21 | For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). |
| 31 | `mod-record-template-literal-vs-inspected` | ENGINE | 1 | For `Mod:record` Ruby returns the Cardio::Mod inspection output (`#<Cardio::Mod:0x000001bc8a22c908>_mod\n#<Cardio::...`) as the content field, while the engine returns the unresolved template literal `<p>{{+description|content}}</p>\n<p>{{_|add_button|...</p>`. |
| 32 | `rule-card-default-description-missing` | ENGINE | 0 | For `Cardtype+*type+*default:render:content|open` and `Role+*type+*default:render:content|open` Ruby emits the description content (`Every Decko card has one and only one <strong>type</strong>...`) while the engine emits an empty `<p></p><p>&nbsp;</p><p>[[/new/Cardtype+*type+*defa...` placeholder. |
| 33 | `anonymous-card-name-key-truncation` | ENGINE | 1 | For card names that END with 's' followed by a +*self junction, the engine's name-key normalization drops the trailing 's' (Anonymous -> anonymou, similar pattern for other card names). |
| 34 | `wiki-link-vs-rich-content-link` | ENGINE | 20 | For card content views where the Ruby side emits a styled link (`<a class="btn btn-sm btn-outline-primary me-2 known-card"...`) and the engine emits the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch them...`, the engine's content view isn't applying the link-to-HTML transform for skin-card references. |
| 35 | `rule-item-set-category-attr-mismatch` | ENGINE | 14 | For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, etc. |
| 36 | `rule-card-input-type-pointer-list-literal` | VIEW-REGISTRY | 7 | For `X+*right+*input type:render:open` and `X+*right+*content options:render:open` Ruby emits the literal input-type value (`radio`, `select`, `multiselect`) or JSON literal `{"type":"..."}` while the engine emits a `<div class="pointer-list">` wrapper. |
| 37 | `denied-vs-render-rule-symmetric` | SEEDING | 1 | The symmetric counterpart to cluster 7 / C15: for a small set of entries (e.g. |
| - | **UNTRACED** | - | 1142 | no mechanism matched. |
| - | **Total** | - | 3658 | sum of byte-diff from shard 0. |

### Sum check

Clustered + UNTRACED = 3658 ; byte-diff total = 3658 ; diff = 0

## Per-cluster detail

### 1. `parens-name-key-normalization`

- **Owner**: ENGINE
- **Count (shard 0)**: 99
- **Mechanism**: DeckoName.toKey normalizes trailing '(s)' to a single trailing underscore instead of Ruby's '_s' underscore, so `Organizer(s)` keys as `organizer_` (engine) vs `organizer_s` (Ruby). Affects both record JSON `key` field and the slot-id emitted by slotWrap (card.name.safeKey -> div id suffix).

**Sample entry ids**:

- `recapture-raw:ABCglobal+Organizer(s):record` (offset=109, exp=219, act=218)
- `recapture-raw:ABCglobal+Organizer(s):render:open` (offset=30, exp=10569, act=9851)
- `recapture-raw:Archetypal+Organizer(s):record` (offset=71, exp=183, act=182)
- `recapture-raw:Archetypal+Organizer(s):render:open` (offset=30, exp=5610, act=4966)
- `recapture-raw:Archetypal+Participant(s):record` (offset=81, exp=197, act=196)

**Proposed fix sketch**:

src/card/name.ts: simpleKey currently strips a trailing '_' if the pre-replace string ends with the paren-group 's'; align with card-1.110.0 lib/card/name.rb #generate_part_names which keeps the interior word and appends '_s' for any '(...)' suffix. Test pin: recapture-raw:ABCglobal+Organizer(s):record (offset 109, exp 219, act 218 — `organizer_s` vs `organizer_`).

### 2. `tiny-render-type-plus-right-rule-card`

- **Owner**: ENGINE
- **Count (shard 0)**: 23
- **Mechanism**: Engine renders a *type+*right / *right rule card's open/content view as the bare rule-card bar (~10K bytes) while Ruby emits the SET's expanded children list (~60K bytes including _category-all _category-field _category-recent _category-common, four categories). Engine's rule-card content dispatch is short-circuiting to its own bar view and missing the rule's applied-template expansion (the category list the rule card composes from its content).

**Sample entry ids**:

- `recapture-raw:*captcha+*right:render:content` (offset=2384, exp=59486, act=9647)
- `recapture-raw:*captcha+*right:render:open` (offset=4954, exp=62084, act=12245)
- `recapture-raw:*content options+*right:render:content` (offset=2450, exp=67529, act=9937)
- `recapture-raw:*content options+*right:render:open` (offset=5127, exp=70234, act=12642)
- `recapture-raw:*help+*right:render:content` (offset=2133, exp=58952, act=15304)

**Proposed fix sketch**:

src/card/render/views.ts#coreView: when the rule card is a *type+*right or *right rule, render the SET member list (category items from the rule's content), not just the rule's own bar. Test pins: recapture-raw:*captcha+*right:render:open (exp 62084, act 12245, offset 4954) and recapture-raw:RichText+*type:render:content (exp 59491, act 9659, offset 2383).

### 3. `set-card-pointer-list-vs-nested-content`

- **Owner**: ENGINE
- **Count (shard 0)**: 690
- **Mechanism**: Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. Differences are concentrated at offset ~2400-2700 (after the accordion body), confirming the divergence is in the content-slot wrap, not the bar/preamble.

**Sample entry ids**:

- `recapture-raw:*home:render:open` (offset=1925, exp=4754, act=4274)
- `recapture-raw:ABCglobal+Supporters:render:open` (offset=2477, exp=5514, act=4888)
- `recapture-raw:Alchemy_Physics_Psychology+articles:render:open` (offset=2663, exp=6012, act=5373)
- `recapture-raw:Associative Inquiry+Supporters:render:open` (offset=2604, exp=10506, act=9774)
- `recapture-raw:Banana+Person:render:open` (offset=2363, exp=6216, act=5662)

**Proposed fix sketch**:

src/card/render/views.ts#openView + barBottomView: when the rendered card is a set card (not a pointer/list cardtype), emit a nested content-view slot per child instead of the card-list pointer-list wrapper. Test pins: recapture-raw:Brandon WilliamsCraig+Pages:render:open (offset 2540, exp 20541, act 18200) and recapture-raw:mythicity+Pages:render:open (offset 2375, exp 3127, act 4910 — engine LARGER here, same mechanism because Ruby's slot wrap is shorter than engine's pointer-list wrap).

### 4. `boolean-yes-vs-integer-1`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. Same offset (~970 in the value label position). Triggered by accordion-button labels and counter badges that format the value as a truthy/falsy display string.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#openView/closedView + content-overrides.ts: for *all+*captcha content, dispatch to the boolean-to-display formatter the same way bar/accordion bodies do (Ruby: 'yes'/'no', engine: '1'/'0'). Test pins: recapture-raw:*all+*captcha:render:content (offset 437, exp 446, act 444).

### 5. `rule-card-content-as-literal-text`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 2
- **Mechanism**: Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. Same offset band (~2800-3000) as the set-card cluster but differentiated by excerpt text being a short literal rather than a child slot.

**Sample entry ids**:

- `recapture-raw:Menu+*right+*default:render:open` (offset=5296, exp=7094, act=6991)
- `recapture-raw:Sign up - old+*html message:render:open` (offset=2608, exp=3755, act=3577)

**View-table work**:

src/card/render/views.ts#contentView: for *type+*right rule cards whose dbContent is a single literal (no items, no template), render the literal text directly instead of wrapping in a content-view slot. Test pins: recapture-raw:*table of contents+*right+*default:render:open (offset 2947, exp 2976, act 3624 — `4` literal vs nested content-view slot) and recapture-raw:Setting+*self+*table of contents:render:open (offset 2966, exp 2995, act 3654 — `0` literal vs nested slot).

### 6. `rule-card-content-as-pointer-list`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 3
- **Mechanism**: Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. Triggered by engine's isPointerOrListCard gate (src/card/render/pointer-list.ts:106) mis-classifying the card based on dbContent shape.

**Sample entry ids**:

- `recapture-raw:*all+*layout:render:closed` (offset=971, exp=2837, act=3016)
- `recapture-raw:*all+*layout:render:open` (offset=953, exp=5245, act=5388)
- `recapture-raw:*layout+*right+*content options:render:open` (offset=1544, exp=3661, act=3683)

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: only treat as pointer/list when the type card is actually pointer or list, not based on dbContent heuristics. Test pin: recapture-raw:*all+*layout:render:open (offset 953, exp 5245, act 5388 — `Default Layout` literal vs `<div class="pointer-list">`).

### 7. `read-rule-grant-vs-deny`

- **Owner**: SEEDING
- **Count (shard 0)**: 221
- **Mechanism**: Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). At offset ~2000-4500 (mid-list) Ruby renders a `<span class="denied">` while engine renders a real `<div id="...-bar-view">` (or vice versa). The seed closure for the *read rule universe is partial — the rule's set card or REFEREE_IDS walk is missing the grants the engine needs to deny. This is a byte-diff signature (not classified as `permission_denied_mismatch` because the verify script's excerpt-match regex misses the truncation pattern at long offsets).

**Sample entry ids**:

- `recapture-raw:*all:render:content` (offset=2023, exp=54734, act=40244)
- `recapture-raw:*all:render:open` (offset=4192, exp=56828, act=39854)
- `recapture-raw:Martial Nonviolence+Pages:render:content` (offset=8431, exp=38635, act=65895)
- `recapture-raw:AiBerk at ASC SumRet2010_group_03+*self:render:open` (offset=5236, exp=69004, act=13508)
- `recapture-raw:AiBerk at ASC SumRet2010_group_07+*self:render:open` (offset=5236, exp=69004, act=13508)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: extend the *read rule universe closure walk to follow the rule's SET card's card_references grants (not just left/right/type_id). Ruby's permissions.rb#read_rule? evaluates the union of grants via Card.where, which the current closure walk doesn't replicate. Test pin: recapture-raw:*all:render:content (offset 2023, exp 54734, act 40242 — denied spans present in Ruby where engine renders real cards).

### 8. `runaway-output-recursion`

- **Owner**: ENGINE
- **Count (shard 0)**: 2
- **Mechanism**: Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). Some kind of infinite recursion or runaway inclusion. Both expected and actual are non-error HTML, but the actual is ~100x larger than Ruby. Likely related to the search-query-content cluster (engine interpreting JSON content as a recursive search query without a depth limit).

**Sample entry ids**:

- `recapture-raw:Family+*right+*content options:render:content` (offset=517, exp=540, act=619284)
- `recapture-raw:Family+*right+*content options:render:open` (offset=1534, exp=3645, act=606393)

**Proposed fix sketch**:

src/card/render.ts (render entrypoint) + src/card/set-patterns/search.ts: add a recursion-depth guard around render() — when the same card name is being rendered as a nest within its own output, abort at depth 8 (matches Ruby's Card::View::Cache#fetched caching that prevents the same recursive nest). Test pin: recapture-raw:Family+*right+*content options:render:content (offset 517, exp 540, act 619284).

### 9. `as-in-layout-error-message-divergence`

- **Owner**: ENGINE
- **Count (shard 0)**: 4
- **Mechanism**: For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. Different error classes for the same card — engine's nest-depth limit fires before the credential lookup the engine should also have. Classified as `capture_error_still_raised:Card` by the verify script.

**Sample entry ids**:

- `recapture-raw:AsIn Layout:render:content` (offset=15, exp=74, act=49)
- `recapture-raw:AsIn Layout:render:open` (offset=15, exp=74, act=49)
- `recapture-raw:AsIn Layout+*self:render:content` (offset=2164, exp=60300, act=12753)
- `recapture-raw:AsIn Layout+*self:render:open` (offset=4753, exp=62917, act=15370)

**Proposed fix sketch**:

src/card/render.ts: a nest-depth guard should match the card's expected exception class (CAPTURE_ERROR was a credential error in Ruby; engine's guard fires first). Either move the credential check ahead of the depth guard or reproduce Ruby's Card::Error::PermissionDenied path. Test pin: recapture-raw:AsIn Layout:render:content (offset 15, exp 74, act 49).

### 10. `search-query-content-vs-literal`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: Engine renders `*layout+*right+*content options:render:content` by interpreting the JSON content spec as a search query and rendering `<div class="search-no-results">` while Ruby renders the JSON literal `{"type": "Layout"}`. Mechanism: the engine's content dispatch is treating `*layout+*right+*content options` as a Search-type card even though its content is a query spec, not a query result.

**Sample entry ids**:

- `recapture-raw:*layout+*right+*content options:render:content` (offset=521, exp=545, act=564)

**Proposed fix sketch**:

src/card/render/views.ts#coreView: for content views whose dbContent is literal JSON, render the literal instead of dispatching to the search query runner. Test pin: recapture-raw:*layout+*right+*content options:render:content (offset 521, exp 545, act 564).

### 11. `news-item-show-options-comment-box`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 1
- **Mechanism**: Engine's `News Item+discussion:render:open` data-slot has only `["open"]` in the show list while Ruby's has `["open","comment_box"]`. The comment_box view is missing from the engine's render dispatch for News Item + discussion junction; the engine's data-slot show:["open"] hides the comment_box.

**Sample entry ids**:

- `recapture-raw:News Item+discussion:render:open` (offset=3187, exp=3222, act=3221)

**View-table work**:

src/card/render/views.ts: register the `comment_box` view in the open/show list for `News Item+*type+*default` (and the discussion junction). Test pin: recapture-raw:News Item+discussion:render:open (offset 435, exp 3222, act 3173).

### 12. `apostrophe-name-key`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: Engine's name key normalization for an apostrophe diverges from Ruby's: Ruby key `paula_craig_father_s_day` (apostrophe -> `_s`), engine key `paula_craig_father__day` (apostrophe stripped, leaving the underscore from the leading space). Same family as the parens cluster but the trigger character is `'` not `(`.

**Sample entry ids**:

- `recapture-raw:Paula Craig - Father's Day:record` (offset=405, exp=513, act=512)

**Proposed fix sketch**:

src/card/name.ts#simpleKey: in the NOT_OK_FOR_KEY replace path, the regex needs to map `'` to `_s` (matching Ruby's underscore_apostrophe_s behavior in lib/card/name.rb #underscore) rather than stripping entirely. Test pin: recapture-raw:Paula Craig - Father's Day:record (offset 405, exp 513, act 512).

### 13. `favicon-text-content-divergence`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: Engine and Ruby render *favicon:render:closed with different literal text — Ruby emits `A favicon (or shortcut icon) is a small image us...` while engine emits `<p><em>Please remember to click ...`. Different card content from the engine's content resolution than Ruby's (possibly *favicon has multiple content versions, or the *favicon card's structured-content path picks a different field). Note: the open view is in the capture_error_still_raised class (different mechanism); only the closed view is byte-diff.

**Sample entry ids**:

- `recapture-raw:*favicon:render:closed` (offset=1528, exp=2746, act=2600)

**Proposed fix sketch**:

src/card/rules/structure.ts#structuredCardContent + src/card/fetch.ts: verify *favicon card's structured-content template resolution matches Ruby's structure_template walk. Test pin: recapture-raw:*favicon:render:closed (offset 1528, exp 2746, act 2600).

### 14. `deep-read-rule-deny-on-self-or-right`

- **Owner**: SEEDING
- **Count (shard 0)**: 586
- **Mechanism**: Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). The pattern is `X+*self:render:open|content` or `X+*right:render:open|content` for arbitrary X. Ruby's expected HTML contains a `<div id="X-Xself-Xdefault-bar-view">` (real card bar) while engine emits a `<span class="denied">` placeholder. Same root cause as cluster 7 (the *read rule universe closure is partial), but the shard-0 signature only matched a handful of *all/*help/*sidebar ids. The full-run signature generalizes to ANY *self / *right junction where the seed closure fails to bring the read grants for the SET card's children.

**Sample entry ids**:

- `recapture-raw:AiBerk+*self:render:content` (offset=2133, exp=59088, act=9716)
- `recapture-raw:AiBerk+*self:render:open` (offset=4657, exp=61640, act=12268)
- `recapture-raw:AiBerkLogo+*self:render:content` (offset=2166, exp=60000, act=6967)
- `recapture-raw:AiBerkLogo+*self:render:open` (offset=4753, exp=62615, act=9582)
- `recapture-raw:Aiki Peace Week+*self:render:content` (offset=2195, exp=61374, act=12918)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: the *read rule universe closure must walk the SET card's child-card grants (Ruby evaluates Card.where(matches_rule) for each *read rule's pattern and the closure doesn't replicate). Test pin: recapture-raw:Wendy Palmer+*self:render:open (offset 2173, exp 60489, act 9878).

### 15. `whitespace-newline-before-div`

- **Owner**: ENGINE
- **Count (shard 0)**: 262
- **Mechanism**: Ruby's HTML output includes a literal `\n` before the closing `</div>` of the inner-slot wrapper (after the accordion body closes), while engine emits the closing `</div>` directly without the newline. Single-byte diff per closing tag, but the `+discussion:render:open` family aggregates to ~260 entries because Ruby emits 3-5 such newlines in a typical discussion view. Pure formatting, no semantic difference.

**Sample entry ids**:

- `recapture-raw:Not really monothiests+discussion:render:open` (offset=3490, exp=3525, act=3524)
- `recapture-raw:Klickstein continues+discussion:render:open` (offset=3459, exp=4569, act=3496)
- `recapture-raw:Brenner and Zacks - Why Walking through a Doorway Makes You Forget +discussion:render:open` (offset=4287, exp=4322, act=4321)
- `recapture-raw:How Can I Keep From Singing - Lyrics+discussion:render:open` (offset=3669, exp=3704, act=3703)
- `recapture-raw:Michael Ventura - Letters at 3AM Remembering James Hillman+discussion:render:open` (offset=4085, exp=4120, act=4119)

**Proposed fix sketch**:

src/card/render/template.ts or the renderer that emits the inner-slot close tag: match Ruby's trailing-newline behavior before `</div>` (the discrepancy is a 1-byte whitespace newline that's not in the engine's serializer). Lowest-priority fix: normalise on either side. Test pin: recapture-raw:Jesus Christ+discussion:render:open (offset 3199, exp 3236, act 3235 — exp 1 byte longer for one newline).

### 16. `wiki-link-vs-known-card-html-anchor`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 22
- **Mechanism**: Ruby's renderer emits `<a class="known-card" href="/CardName">card-title</a>` for wiki-link content references while the engine emits the raw `[[CardName]]` literal. Triggered when the card's content contains `[[Name]]` and the renderer is in a view that should resolve the link to an HTML anchor (closed view most often, open view occasionally). The engine's wiki-link resolver is registered only for the named-link view, not for closed/open content bodies.

**Sample entry ids**:

- `recapture-raw:Steven Goldin+Menu:render:content` (offset=450, exp=2897, act=2743)
- `recapture-raw:Steven Goldin+Menu:render:open` (offset=3011, exp=5486, act=5332)
- `recapture-raw:Working through Conflict at Work+discussion:render:open` (offset=3583, exp=3994, act=3743)
- `recapture-raw:Archetypal+discussion:render:open` (offset=3371, exp=3584, act=3469)
- `recapture-raw:Medcalf Altink Saavedra Bhattacharya_Tuberculosis - A Short History+discussion:render:open` (offset=4596, exp=13835, act=13101)

**View-table work**:

src/card/render/views.ts#closedView + openView body: register the wiki-link resolver (the one that turns [[Name]] into a `<a class="known-card" href="/name">Title</a>`) for the closed view's content body and for the open view's tail. Test pin: recapture-raw:Guns+discussion:render:open and the 73 closed-view matches show the same mechanism.

### 17. `external-link-vs-raw-url`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 29
- **Mechanism**: Ruby wraps external URLs in `<a target="_blank" class="external-link" href="https://...">URL</a>` while the engine emits the raw URL text. Same wiki-link-resolver gap as the known-card cluster but for URLs (text starting with `http://` or `https://`). Triggered in discussion views and any content view that auto-links URLs.

**Sample entry ids**:

- `recapture-raw:Aikido mythology at Aikido Journal:render:open` (offset=3554, exp=7828, act=7686)
- `recapture-raw:Aurora Shooting 201200720 ABC GMA Jessica Ghawi+discussion:render:open` (offset=6902, exp=7210, act=7059)
- `recapture-raw:Privacy Resources+discussion:render:open` (offset=3277, exp=4107, act=3636)
- `recapture-raw:Christopher Li - Aikido and the Floating Bridge of Heaven+discussion:render:open` (offset=4050, exp=4465, act=4244)
- `recapture-raw:Police State USA+discussion:render:open` (offset=3384, exp=3778, act=3568)

**View-table work**:

src/card/render/text-processors.ts#autoLinkUrls: emit the external-link anchor wrapper in the same render pass as the wiki-link resolver. Test pin: recapture-raw:Why Do People Who Need Help From the Government Hate It So Much?+discussion:render:open (offset 4150, exp 5368, act 4721).

### 18. `invite-links-account-empty-div`

- **Owner**: ENGINE
- **Count (shard 0)**: 48
- **Mechanism**: For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder. The engine's invite-links template reads account-related fields (name, email, contact) that the seed closure didn't populate for non-Administrator accounts.

**Sample entry ids**:

- `recapture-raw:Ron Huggins:render:open` (offset=2478, exp=4715, act=2523)
- `recapture-raw:Denise Corbett:render:open` (offset=2536, exp=4809, act=2581)
- `recapture-raw:Petrice Kam:render:open` (offset=2485, exp=4721, act=2530)
- `recapture-raw:Rich A Lee:render:open` (offset=2468, exp=4693, act=2513)
- `recapture-raw:Bill Stynetski:render:open` (offset=2536, exp=4810, act=2581)

**Proposed fix sketch**:

src/card/render/account-views.ts#inviteLinks: the engine's invite-links template iterates over the Account+*self card's name/email/contact children. The seed closure loads the Account+*self card but not its name/email/contact child references. Test pin: recapture-raw:Ron Huggins:render:open (offset 2478, exp 4715, act 2523).

### 19. `layout-content-pointer-list-wrap`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 30
- **Mechanism**: For `X+*self+*layout:render:closed|open` the engine wraps the layout name in a `<div class="pointer-list"><div class="pointer-item...">` wrapper while Ruby renders the literal layout name (e.g. `bdwilliamscraig-layout`, `Golden_Bears_Aikido_at_UC_Berkeley main layout`, `GiveTwentyMainLayout`) inside `<div class="text-muted one-line">NAME</div>`. Triggered by the engine's `isPointerOrListCard` heuristic mis-classifying *layout+*self cards as pointer-list because their dbContent (a layout name string) doesn't match a single-literal pattern.

**Sample entry ids**:

- `recapture-raw:GBAC Contact+*self+*layout:render:closed` (offset=1097, exp=3159, act=3402)
- `recapture-raw:GBAC Contact+*self+*layout:render:open` (offset=1079, exp=5996, act=6203)
- `recapture-raw:GBAC Resources+*self+*layout:render:closed` (offset=1109, exp=3184, act=3427)
- `recapture-raw:GBAC Resources+*self+*layout:render:open` (offset=1091, exp=6019, act=6226)
- `recapture-raw:GBAC Structure+*self+*layout:render:closed` (offset=1113, exp=3189, act=3432)

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: require the card's TYPE card be pointer or list before applying pointer-list wrap, NOT just dbContent shape. Test pins: recapture-raw:GBAC Contact+*self+*layout:render:closed (offset 1097, exp 3159, act 3402) and recapture-raw:Recommendations+*self+*layout:render:open (offset 1099, exp 5676, act 5835).

### 20. `skin-card-content-not-resolved`

- **Owner**: SEEDING
- **Count (shard 0)**: 22
- **Mechanism**: For `X skin:record` (and `bootstrap: X:record`) Ruby resolves the structured-card content (~500KB of SCSS/CSS) into the JSON `content` field, while the engine returns the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch theme...` (200 bytes) — or for `bootstrap: X:record`, an empty content. Root cause: the skin card's *structure template uses `[[themeless bootstrap skin]]+[[+bootswatch theme]]` and the engine's include resolver doesn't follow the second-include syntax that Ruby's structured_content walk supports.

**Sample entry ids**:

- `recapture-raw:cerulean skin:record` (offset=39, exp=495997, act=217)
- `recapture-raw:cosmo skin:record` (offset=36, exp=495710, act=208)
- `recapture-raw:cyborg skin:record` (offset=37, exp=501247, act=211)
- `recapture-raw:darkly skin:record` (offset=37, exp=500345, act=211)
- `recapture-raw:flatly skin:record` (offset=37, exp=498728, act=211)

**Seed-side work**:

src/card/rules/structure.ts#structuredCardContent + tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts: resolve the `[[+bootswatch theme]]` include chain for skin cards during the seed walk so the engine's *structure walk sees the resolved content. Test pins: recapture-raw:cerulean skin:record (offset 39, exp 495997, act 217) and recapture-raw:bootstrap: functions:record (offset 45, exp 11151, act 162).

### 21. `structured-content-record-empty`

- **Owner**: ENGINE
- **Count (shard 0)**: 3
- **Mechanism**: For *alerts, *now, *version, *count, etc., Ruby resolves the structured-card content (e.g. `<!-- *alerts is deprecated. please remove from layouts. -->`, `Thursday, September 24, 2026 06:13 PM Pacific Standard Time`) into the JSON `content` field, while the engine returns empty `content:""`. Root cause: the engine's structured-card content path is short-circuiting on real-content rows whose name matches a *structure rule card — this is the same family as per-class-mechanisms baseline cluster #1 (2,573 entries in older run), and the *now / *alerts shards are what survives in the coordinator-fresh aggregate.

**Sample entry ids**:

- `recapture-raw:*alerts:record` (offset=32, exp=180, act=123)
- `recapture-raw:*now:record` (offset=29, exp=174, act=115)
- `recapture-raw:*version:record` (offset=33, exp=139, act=133)

**Proposed fix sketch**:

src/card/rules/structure.ts#structuredCardContent: when a card's name matches a *structure rule card (e.g. *now, *alerts, *version), the engine must apply the *structure rule template at fetch time, not just at render time. Test pins: recapture-raw:*now:record (offset 29, exp 174, act 115) and recapture-raw:*alerts:record (offset 32, exp 180, act 123).

### 22. `rules-form-filter-vs-content-view`

- **Owner**: ENGINE
- **Count (shard 0)**: 6
- **Mechanism**: For `X+*type plus right:render:open` and similar rule-card composition junctions, Ruby emits a nested `<div id="X-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). The engine's rule-card content dispatch is treating the card as a *rule card type instead of a *type plus right rule, so it serves the form view instead of the nested content view.

**Sample entry ids**:

- `recapture-raw:Item+Date+*type plus right:render:open` (offset=2679, exp=65327, act=12131)
- `recapture-raw:Item+Rights+*type plus right:render:open` (offset=2712, exp=65714, act=12203)
- `recapture-raw:Item+Title+*type plus right:render:open` (offset=2703, exp=65482, act=12182)
- `recapture-raw:Item+Type+*type plus right:render:open` (offset=2689, exp=65209, act=12141)
- `recapture-raw:Item+long+*type plus right:render:open` (offset=2689, exp=65030, act=9331)

**Proposed fix sketch**:

src/card/render/views.ts#openView: when the rendered card is a `X+*type plus right` rule junction, render the nested content-view slot, NOT the *type plus right rule form. The rule-editing form should only appear when the URL signals edit mode. Test pin: recapture-raw:Collection+Item+*type plus right:render:open (offset 2773, exp 66656, act 9493).

### 23. `search-results-vs-literal-content`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...`. The engine's content view dispatch is treating `*content options` as a Search-type card even though its content is a JSON query spec, not a query result. Same family as the existing search-query-content-vs-literal cluster (C10) but generalized from the single `*layout+*right+*content options:render:content` test pin to all rule-card composition junctions.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/views.ts#contentView: when dbContent is literal JSON (begins with `{` after trimming whitespace), render the literal instead of dispatching to the search-query runner. Test pin: recapture-raw:Topic+*right+*content options:render:content (offset 515, exp 539, act 7952).

### 24. `card-list-name-vs-card-list-bar`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 8
- **Mechanism**: For `X+*right+*input type:render:content|open` Ruby emits `<div class="card-list card-list-name pointer-list">` while the engine emits `<div class="card-list card-list-bar pointer-list">`. Single CSS class difference (`-name` vs `-bar`) but the visual rendering changes because the engine's pointer-list template picks the `-bar` modifier when the content type is *input type.

**Sample entry ids**:

- `recapture-raw:*style+*right+*input type:render:content` (offset=521, exp=600, act=1385)
- `recapture-raw:Collection+*right+*input type:render:content` (offset=537, exp=617, act=1407)
- `recapture-raw:*script+*right+*input type:render:content` (offset=525, exp=603, act=2833)
- `recapture-raw:Project+*right+*input type:render:content` (offset=525, exp=603, act=2833)
- `recapture-raw:*follow+*right+*input type:render:content` (offset=525, exp=604, act=1389)

**View-table work**:

src/card/render/pointer-list.ts#pointerListClasses: when the rule card is `X+*right+*input type`, use `card-list-name` not `card-list-bar` for the pointer-list modifier. Test pin: recapture-raw:Topic+*right+*input type:render:content (offset 526, exp 611, act 1426).

### 25. `known-card-vs-wanted-card-on-rule-set`

- **Owner**: ENGINE
- **Count (shard 0)**: 80
- **Mechanism**: For `X+*type+*create:render:closed` and `X+*type+*delete:render:closed` (HTML/SCSS/Project Cardtype rules), Ruby emits `<a class="known-card" href="/Shark">` (the rule-card set's referent is a known card in Ruby's seed closure) while the engine emits `<a class="wanted-card" href="/Shark">` (same href but a different CSS class — engine treats it as wanted because the seed closure didn't register it as known). One-byte / one-class divergence at offset ~1100.

**Sample entry ids**:

- `recapture-raw:*all+*delete:render:closed` (offset=1044, exp=2877, act=2878)
- `recapture-raw:*all+*read:render:closed` (offset=1020, exp=2970, act=2971)
- `recapture-raw:*all+*update:render:closed` (offset=1044, exp=2886, act=2887)
- `recapture-raw:*rstar+*delete:render:closed` (offset=1060, exp=2883, act=2884)
- `recapture-raw:Automatic Billing+*self+*delete:render:closed` (offset=1209, exp=3250, act=3251)

**Proposed fix sketch**:

src/card/render/known-card.ts: the engine's seed closure must register the rule-card set's referent cards (Anyone Signed In, Anyone, Shark) so the known-card resolver finds them. Test pin: recapture-raw:HTML+*type+*create:render:closed (offset 1105, exp 3025, act 3026).

### 26. `bar-right-config-content-missing`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 30
- **Mechanism**: For `mod: X:render:closed` (and similar bar-content cards), Ruby emits a populated `bar-right` slot with the card's description text (`configurations, scripts`, `styles`, `configurations, cardtypes, scripts, styles`) while the engine emits an empty `bar-right` (just a newline then `</div>`). Triggered because the engine's bar-right slot reads from a `bar_right_content` field that the rule-card content walk doesn't populate for `mod:` prefixed card names.

**Sample entry ids**:

- `recapture-raw:mod: account:render:closed` (offset=798, exp=2126, act=2100)
- `recapture-raw:mod: ace editor:render:closed` (offset=822, exp=2165, act=2142)
- `recapture-raw:mod: api key:render:closed` (offset=798, exp=2106, act=2100)
- `recapture-raw:mod: bar and box:render:closed` (offset=830, exp=2171, act=2156)
- `recapture-raw:mod: bootstrap:render:closed` (offset=814, exp=2154, act=2128)

**View-table work**:

src/card/render/views.ts#closedView + the mod-style card's bar template: the bar-right slot must read from the card's `bar_right_content` field, falling back to the card's truncated content or `short_content` if missing. Test pin: recapture-raw:mod: format:render:closed (offset 790, exp 2128, act 2086 — Ruby 'configurations, cardtypes, scripts, styles', engine empty).

### 27. `help-tooltip-nbsp-empty`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 5
- **Mechanism**: For *Ace and *on update (and other help-text rule cards) Ruby emits a populated tooltip (`data-bs-content="Configure &lt;a target=&quot;_blank&quot; class=..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. The engine's tooltip text source doesn't resolve the help-text rule card's structured content — it falls back to a non-breaking space instead.

**Sample entry ids**:

- `recapture-raw:*on create:render:closed` (offset=1114, exp=2152, act=2110)
- `recapture-raw:*on delete:render:closed` (offset=1114, exp=2152, act=2110)
- `recapture-raw:*on update:render:closed` (offset=1114, exp=2152, act=2110)
- `recapture-raw:*Ace:render:closed` (offset=1053, exp=2340, act=2013)
- `recapture-raw:*Ace:render:open` (offset=1040, exp=4105, act=2763)

**View-table work**:

src/card/render/views.ts#closedView (or the tooltip emit helper): the data-bs-content attribute must read the *Ace / *on update card's content, not fall back to &nbsp;. Test pin: recapture-raw:*Ace:render:closed (offset 1053, exp 2340, act 2013).

### 28. `set-card-associates-pointer-list`

- **Owner**: ENGINE
- **Count (shard 0)**: 107
- **Mechanism**: For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). The existing set-card-pointer-list-vs-nested-content cluster (C3) includes `+Associations+\w+` but not the bare `+Associates` form. The diff shape (offset 3000-3500, expected `i` got `c`, expected excerpt starts a nested content-view) is the same as C3; the ID suffix is just `+Associates` not `+Associations+...`. Test pin: recapture-raw:Christopher Li - Aikido and the Floating Bridge of Heaven+Associates:render:open.

**Sample entry ids**:

- `recapture-raw:Kimberly Winston - Huston Smith A History Of Faith+Associates:render:open` (offset=3018, exp=6376, act=5597)
- `recapture-raw:Sarah Zale - What is the the purpose of education?+Associates:render:open` (offset=3003, exp=6356, act=5582)
- `recapture-raw:Sylvester Wojtkowsk - Dwelling Imaginally in Soulless Times - An Appreciation of the Work of James Hillman+Associates:render:open` (offset=3772, exp=7344, act=6351)
- `recapture-raw:Victoria Sussens-Messerer - Five hundred new fairytales discovered in Germany+Associates:render:open` (offset=3391, exp=6855, act=5970)
- `recapture-raw:Craig Zelizer - Guide to Careers in International Affairs+Associates:render:open` (offset=3106, exp=6488, act=5685)

**Proposed fix sketch**:

src/card/render/views.ts#openView + barBottomView: extend the set-card detection to include `+Associates` (not just `+Associations+\w+`). Test pin: recapture-raw:Christopher Li - Aikido and the Floating Bridge of Heaven+Associates:render:open (offset 3116, exp 6502, act 5695).

### 29. `apostrophe-name-key-extended`

- **Owner**: ENGINE
- **Count (shard 0)**: 165
- **Mechanism**: Broader version of the existing apostrophe-name-key cluster (C12, which only matched one ID). Pattern: Ruby `X_s_Y` vs engine `X__Y` — for any card name with an apostrophe-s contraction (Brandon's, Mikko's, Rosalie's, Father's, Trump's, Founder's, Children's, etc.) or just a trailing 's' (Brandon WilliamsCraig's Family), the engine collapses the apostrophe-s to a single underscore. Affects both record JSON `key` and the slot-id suffix.

**Sample entry ids**:

- `recapture-raw:Brandon's Wagn questions+*self:record` (offset=65, exp=209, act=208)
- `recapture-raw:Brandon's Wagn questions+*self:render:content` (offset=17, exp=69046, act=7161)
- `recapture-raw:Brandon's Wagn questions+*self:render:open` (offset=17, exp=71866, act=9984)
- `recapture-raw:Mikko's Blog+*self:record` (offset=63, exp=174, act=173)
- `recapture-raw:Mikko's Blog+*self:render:content` (offset=15, exp=64927, act=9907)

**Proposed fix sketch**:

src/card/name.ts#simpleKey: in the NOT_OK_FOR_KEY replace path, the apostrophe-s contraction must map to `_s` (matching Ruby's underscore_apostrophe_s in lib/card/name.rb #underscore). Test pin: recapture-raw:Talk Like It's Brandon's 41st Birth Day+*self:record (offset 70, exp 255, act 253 — `talk_like_it_s_brandon_s_41st_birth_day` vs `talk_like_it__brandon__41st_birth_day`).

### 30. `skin-card-bar-left-titled-vs-span-title`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 21
- **Mechanism**: For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). The engine's closed-view bar template picks the card-title span fallback when the card's TYPE is skin and its image data isn't available.

**Sample entry ids**:

- `recapture-raw:cerulean skin:render:closed` (offset=743, exp=2492, act=2184)
- `recapture-raw:cosmo skin:render:closed` (offset=725, exp=2441, act=2142)
- `recapture-raw:cyborg skin:render:closed` (offset=731, exp=2458, act=2156)
- `recapture-raw:darkly skin:render:closed` (offset=731, exp=2458, act=2156)
- `recapture-raw:flatly skin:render:closed` (offset=731, exp=2458, act=2156)

**View-table work**:

src/card/render/views.ts#closedView + the skin cardtype's bar template: when the rendered card is a skin cardtype, render the media+icon bar-left, not the plain card-title span. Test pin: recapture-raw:cerulean skin:render:closed (offset 743, exp 2492, act 2184).

### 31. `mod-record-template-literal-vs-inspected`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: For `Mod:record` Ruby returns the Cardio::Mod inspection output (`#<Cardio::Mod:0x000001bc8a22c908>_mod\n#<Cardio::...`) as the content field, while the engine returns the unresolved template literal `<p>{{+description|content}}</p>\n<p>{{_|add_button|...</p>`. Triggered because the Mod card's content is itself a templated string and Ruby's content path resolves it while the engine's path stores it raw.

**Sample entry ids**:

- `recapture-raw:Mod:record` (offset=29, exp=1446, act=237)

**Proposed fix sketch**:

src/card/fetch.ts + src/card/render/content.ts: Mod card content is a template string ({{+description|content}}); the engine must apply the template walk at content-resolution time, not store the literal. Test pin: recapture-raw:Mod:record (offset 29, exp 1446, act 237).

### 32. `rule-card-default-description-missing`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For `Cardtype+*type+*default:render:content|open` and `Role+*type+*default:render:content|open` Ruby emits the description content (`Every Decko card has one and only one <strong>type</strong>...`) while the engine emits an empty `<p></p><p>&nbsp;</p><p>[[/new/Cardtype+*type+*defa...` placeholder. The engine's rule-card content dispatch is treating `*type+*default` as a system card that needs an edit form, not the rendered description content. Test pin: recapture-raw:Cardtype+*type+*default:render:content (offset 484, exp 2238, act 671).

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/views.ts#coreView: when the rule card is `X+*type+*default` for X in {Cardtype, Role}, render the description content body, not the placeholder paragraph. Test pin: recapture-raw:Cardtype+*type+*default:render:content (offset 484, exp 2238, act 671).

### 33. `anonymous-card-name-key-truncation`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: For card names that END with 's' followed by a +*self junction, the engine's name-key normalization drops the trailing 's' (Anonymous -> anonymou, similar pattern for other card names). Ruby keeps the full name in the slot id, engine truncates by one byte.

**Sample entry ids**:

- `recapture-raw:Anonymous+*self:render:content` (offset=17, exp=59721, act=9780)

**Proposed fix sketch**:

src/card/name.ts#safeKey: the engine's safeKey truncation is dropping the final 's' from card names that end in 's' before the +*self junction. Test pin: recapture-raw:Anonymous+*self:render:content (offset 17, exp 59721, act 9780 — id 'anonymous-Xself' vs 'anonymou-Xself').

### 34. `wiki-link-vs-rich-content-link`

- **Owner**: ENGINE
- **Count (shard 0)**: 20
- **Mechanism**: For card content views where the Ruby side emits a styled link (`<a class="btn btn-sm btn-outline-primary me-2 known-card"...`) and the engine emits the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch them...`, the engine's content view isn't applying the link-to-HTML transform for skin-card references. This is the open/content counterpart to the wiki-link-vs-known-card-html-anchor cluster (C17) but specifically when the engine doesn't even produce the anchor at all (just the raw `[[...]]`).

**Sample entry ids**:

- `recapture-raw:cerulean skin:render:content` (offset=396, exp=7356, act=452)
- `recapture-raw:cosmo skin:render:content` (offset=384, exp=7239, act=440)
- `recapture-raw:cyborg skin:render:content` (offset=388, exp=7278, act=444)
- `recapture-raw:darkly skin:render:content` (offset=388, exp=7278, act=444)
- `recapture-raw:flatly skin:render:content` (offset=388, exp=7278, act=444)

**Proposed fix sketch**:

src/card/render/views.ts#contentView + openView body: extend the wiki-link-to-anchor transform to apply to skin-card references (`[[themeless bootstrap skin]]` should become a styled `known-card` anchor). Test pin: recapture-raw:cosmo skin:render:content (offset 384, exp 7239, act 440).

### 35. `rule-item-set-category-attr-mismatch`

- **Owner**: ENGINE
- **Count (shard 0)**: 14
- **Mechanism**: For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, etc. family) Ruby emits the full `_rule-item _category-all _category-field _category-recent _category-common` set list as class names while the engine emits the same class prefix but terminates with `data-card-id="..." data-card-name="..."` instead of continuing the category list. Diff character ` ` (space, Ruby's continuing the class) vs `"` (engine closing the class attribute). Triggered by the engine's rule-item render emitting the class attribute too early — after the first two categories rather than all four.

**Sample entry ids**:

- `recapture-raw:*all plus:render:content` (offset=2222, exp=57603, act=9312)
- `recapture-raw:*all plus:render:open` (offset=4349, exp=59758, act=11467)
- `recapture-raw:GBA+*right+*layout+*self:render:content` (offset=3340, exp=18562, act=10326)
- `recapture-raw:GBA+*right+*layout+*self:render:open` (offset=6186, exp=21436, act=13200)
- `recapture-raw:Exhibit+Item+*type plus right:render:content` (offset=2472, exp=69381, act=10013)

**Proposed fix sketch**:

src/card/render/category-set.ts#renderCategorySet: include `_category-recent` (in addition to all/field/common) when the rule card is a *type plus right rule or similar. The engine's category enumeration is missing the 'recent' bucket AND the data-card-id is emitted before the category list is closed. Test pin: recapture-raw:*all plus:render:content (offset 2222, exp 57603, act 9312).

### 36. `rule-card-input-type-pointer-list-literal`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 7
- **Mechanism**: For `X+*right+*input type:render:open` and `X+*right+*content options:render:open` Ruby emits the literal input-type value (`radio`, `select`, `multiselect`) or JSON literal `{"type":"..."}` while the engine emits a `<div class="pointer-list">` wrapper. Test pin: recapture-raw:Collection+*right+*input type:render:open (offset 1120, exp 3051, act 4004 — literal `select` vs `<div class="pointer-list">`).

**Sample entry ids**:

- `recapture-raw:*style+*right+*input type:render:open` (offset=1088, exp=2993, act=3939)
- `recapture-raw:Collection+*right+*input type:render:open` (offset=1120, exp=3051, act=4004)
- `recapture-raw:*script+*right+*input type:render:open` (offset=1096, exp=3005, act=5394)
- `recapture-raw:Project+*right+*input type:render:open` (offset=1096, exp=3005, act=5394)
- `recapture-raw:*follow+*right+*input type:render:open` (offset=1096, exp=3007, act=3953)

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: a rule card whose dbContent is a single literal string (not a SET reference) should render the literal in `text-muted one-line`, NOT fall through to the pointer-list wrap. Test pin: recapture-raw:Collection+*right+*input type:render:open (offset 1120, exp 3051, act 4004).

### 37. `denied-vs-render-rule-symmetric`

- **Owner**: SEEDING
- **Count (shard 0)**: 1
- **Mechanism**: The symmetric counterpart to cluster 7 / C15: for a small set of entries (e.g. `Stossel What If Freud Was Right:render:open`), Ruby renders `<span class="denied">` while engine renders the actual `<div id="...-source_co...">` (engine ALLOWS where Ruby denies). Same root cause — the *read rule universe closure — but the direction is reversed. Cluster 7+C15 covers engine denies where Ruby renders; this one covers engine renders where Ruby denies.

**Sample entry ids**:

- `recapture-raw:Stossel What If Freud Was Right:render:open` (offset=3106, exp=10258, act=39411)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: the *read rule closure must match Ruby's symmetric evaluation. Test pin: recapture-raw:Stossel What If Freud Was Right:render:open (offset 3106, exp 10258, act 39411).

## UNTRACED entries

1142 entries did not match any defined cluster.

- `recapture-raw:Aiki Extensions+Organizer(s):record` (offset=243, exp=365, act=364)
  ```
  FAIL recapture-raw:Aiki Extensions+Organizer(s):record (card-engine)
    first difference at code-unit offset 243 (byte offset 243): expected "s" but got "\""
    expected excerpt: ...nBertram Wohak","key":"aiki_extension+organizer_s","left":"Aiki Extensions","name":"Aiki Extensi...
  ```
- `recapture-raw:Aikido and Psychotherapy - Martial Artists Making a Difference+Associations+tags:render:open` (offset=3334, exp=15932, act=17461)
  ```
  FAIL recapture-raw:Aikido and Psychotherapy - Martial Artists Making a Difference+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3334 (byte offset 3334): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:AsIn Project Management Training+Organizer(s):render:open` (offset=52, exp=6121, act=5388)
  ```
  FAIL recapture-raw:AsIn Project Management Training+Organizer(s):render:open (render-engine)
    first difference at code-unit offset 52 (byte offset 52): expected "s" but got "-"
    expected excerpt: ... id="a_in_project_management_training-organizer_s-open-view" class="card-slot open-view ALL ALL_...
  ```
- `recapture-raw:Brandon WilliamsCraig - A Martial Artists Making a Difference+Associations+tags:render:open` (offset=3320, exp=11268, act=14881)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig - A Martial Artists Making a Difference+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3320 (byte offset 3320): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Brandon WilliamsCraig+Project(s) Organizing:record` (offset=230, exp=393, act=392)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Project(s) Organizing:record (card-engine)
    first difference at code-unit offset 230 (byte offset 230): expected "s" but got "_"
    expected excerpt: ... of Peace","key":"brandon_william_craig+project_s_organizing","left":"Brandon WilliamsCraig","na...
  ```
- `recapture-raw:Colleagues:render:open` (offset=2586, exp=10663, act=3135)
  ```
  FAIL recapture-raw:Colleagues:render:open (render-engine)
    first difference at code-unit offset 2586 (byte offset 2586): expected "<" but got "["
    expected excerpt: ...t of associates who chose either a doctorate in <a class="wanted-card" href="/Cultural_Mythology...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+Organizer(s):render:open` (offset=53, exp=18113, act=17194)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+Organizer(s):render:open (render-engine)
    first difference at code-unit offset 53 (byte offset 53): expected "s" but got "-"
    expected excerpt: ...id="golden_bear_aikido_at_uc_berkeley-organizer_s-open-view" class="card-slot open-view ALL ALL_...
  ```
- `recapture-raw:Martially Nonviolent Education+Curriculum Development+Associations+tags:render:open` (offset=3312, exp=6767, act=5990)
  ```
  FAIL recapture-raw:Martially Nonviolent Education+Curriculum Development+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3312 (byte offset 3312): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:aikido+Participant(s):record` (offset=205, exp=313, act=312)
  ```
  FAIL recapture-raw:aikido+Participant(s):record (card-engine)
    first difference at code-unit offset 205 (byte offset 205): expected "s" but got "\""
    expected excerpt: ...Green\r\nStan Pranin","key":"aikido+participant_s","left":"aikido","name":"aikido+Participant(s)...
  ```
- `recapture-raw:Doctor Myth+*self+*layout:render:closed` (offset=1089, exp=3105, act=3130)
  ```
  FAIL recapture-raw:Doctor Myth+*self+*layout:render:closed (render-engine)
    first difference at code-unit offset 1089 (byte offset 1089): expected "0" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Image+*type+*help:render:closed` (offset=1030, exp=3047, act=3060)
  ```
  FAIL recapture-raw:Image+*type+*help:render:closed (render-engine)
    first difference at code-unit offset 1030 (byte offset 1030): expected "P" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Image+*type+*help:render:open` (offset=1012, exp=3010, act=3023)
  ```
  FAIL recapture-raw:Image+*type+*help:render:open (render-engine)
    first difference at code-unit offset 1012 (byte offset 1012): expected "P" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:John Abbe+musings:render:content` (offset=654, exp=4722, act=2150)
  ```
  FAIL recapture-raw:John Abbe+musings:render:content (render-engine)
    first difference at code-unit offset 654 (byte offset 654): expected "c" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-consideration" data-card-name="hmmm&lt;hr&gt;&lt...
  ```
- `recapture-raw:Ms Paula writing poetry and other creations:render:content` (offset=2742, exp=57875, act=36946)
  ```
  FAIL recapture-raw:Ms Paula writing poetry and other creations:render:content (render-engine)
    first difference at code-unit offset 2742 (byte offset 2742): expected "b" but got "m"
    expected excerpt: ...em-bar"><div id="paula_craig_i_m_staying_inside-bar-view" class="card-slot bar-view ALL TYPE-new...
  ```
- `recapture-raw:Ms Paula writing poetry and other creations:render:open` (offset=5265, exp=60426, act=39497)
  ```
  FAIL recapture-raw:Ms Paula writing poetry and other creations:render:open (render-engine)
    first difference at code-unit offset 5265 (byte offset 5265): expected "b" but got "m"
    expected excerpt: ...em-bar"><div id="paula_craig_i_m_staying_inside-bar-view" class="card-slot bar-view ALL TYPE-new...
  ```
- `recapture-raw:Paula Craig+musings:render:content` (offset=714, exp=55686, act=92421)
  ```
  FAIL recapture-raw:Paula Craig+musings:render:content (render-engine)
    first difference at code-unit offset 714 (byte offset 714): expected "#" but got "a"
    expected excerpt: ...card-id="35313" data-card-name="Paula Craig - I&#39;m Staying Inside" data-card-type-id="814" da...
  ```
- `recapture-raw:Plans:render:open` (offset=2382, exp=7381, act=2438)
  ```
  FAIL recapture-raw:Plans:render:open (render-engine)
    first difference at code-unit offset 2382 (byte offset 2382): expected "d" but got "b"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><p><div id="plan-Xright-by_name-titled-view" class="...
  ```
- `recapture-raw:*all plus+*delete:render:closed` (offset=1009, exp=2814, act=2924)
  ```
  FAIL recapture-raw:*all plus+*delete:render:closed (render-engine)
    first difference at code-unit offset 1009 (byte offset 1009): expected "s" but got "d"
    expected excerpt: ...right col-6'>
  ```
- `recapture-raw:*all plus+*read:render:closed` (offset=985, exp=2928, act=3038)
  ```
  FAIL recapture-raw:*all plus+*read:render:closed (render-engine)
    first difference at code-unit offset 985 (byte offset 985): expected "s" but got "d"
    expected excerpt: ...right col-6'>
  ```
- `recapture-raw:*all plus+*update:render:closed` (offset=1009, exp=2814, act=2924)
  ```
  FAIL recapture-raw:*all plus+*update:render:closed (render-engine)
    first difference at code-unit offset 1009 (byte offset 1009): expected "s" but got "d"
    expected excerpt: ...right col-6'>
  ```
- `recapture-raw:*recent:render:title` (offset=32, exp=69, act=55)
  ```
  FAIL recapture-raw:*recent:render:title (render-engine)
    first difference at code-unit offset 32 (byte offset 32): expected "R" but got "*"
    expected excerpt: <span class="card-title" title="Recent Changes">Recent Changes</span>
  ```
- `recapture-raw:*rstar:render:content` (offset=2038, exp=57019, act=14585)
  ```
  FAIL recapture-raw:*rstar:render:content (render-engine)
    first difference at code-unit offset 2038 (byte offset 2038): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:*rstar:render:open` (offset=4131, exp=59140, act=16706)
  ```
  FAIL recapture-raw:*rstar:render:open (render-engine)
    first difference at code-unit offset 4131 (byte offset 4131): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_group_07+*self:render:content` (offset=2327, exp=66067, act=10571)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_group_07+*self:render:content (render-engine)
    first difference at code-unit offset 2327 (byte offset 2327): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_group_11+*self:render:content` (offset=2327, exp=66067, act=10571)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_group_11+*self:render:content (render-engine)
    first difference at code-unit offset 2327 (byte offset 2327): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_wholegroup_01+*self:render:content` (offset=2362, exp=67362, act=10726)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_wholegroup_01+*self:render:content (render-engine)
    first difference at code-unit offset 2362 (byte offset 2362): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week embed+*self:render:content` (offset=2234, exp=62910, act=13203)
  ```
  FAIL recapture-raw:Aiki Peace Week embed+*self:render:content (render-engine)
    first difference at code-unit offset 2234 (byte offset 2234): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week embed+*self:render:open` (offset=4963, exp=65667, act=15960)
  ```
  FAIL recapture-raw:Aiki Peace Week embed+*self:render:open (render-engine)
    first difference at code-unit offset 4963 (byte offset 4963): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Anonymous+*self:record` (offset=65, exp=165, act=164)
  ```
  FAIL recapture-raw:Anonymous+*self:record (card-engine)
    first difference at code-unit offset 65 (byte offset 65): expected "s" but got "+"
    expected excerpt: ..."content":"{\"name\":\"_left\"}","key":"anonymous+*self","left":"Anonymous","name":"Anonymous+*s...
  ```
- `recapture-raw:Anonymous+*self:render:open` (offset=17, exp=62320, act=12374)
  ```
  FAIL recapture-raw:Anonymous+*self:render:open (render-engine)
    first difference at code-unit offset 17 (byte offset 17): expected "s" but got "-"
    expected excerpt: <div id="anonymous-Xself-open-view" class="card-slot open-view AL...
  ```
- `recapture-raw:Anyone Signed In+*self:render:content` (offset=2199, exp=61642, act=10009)
  ```
  FAIL recapture-raw:Anyone Signed In+*self:render:content (render-engine)
    first difference at code-unit offset 2199 (byte offset 2199): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Anyone Signed In+*self:render:open` (offset=4858, exp=64329, act=12696)
  ```
  FAIL recapture-raw:Anyone Signed In+*self:render:open (render-engine)
    first difference at code-unit offset 4858 (byte offset 4858): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Automatic Billing+*self:render:content` (offset=2211, exp=62013, act=15947)
  ```
  FAIL recapture-raw:Automatic Billing+*self:render:content (render-engine)
    first difference at code-unit offset 2211 (byte offset 2211): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Automatic Billing+*self:render:open` (offset=4894, exp=64724, act=18658)
  ```
  FAIL recapture-raw:Automatic Billing+*self:render:open (render-engine)
    first difference at code-unit offset 4894 (byte offset 4894): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BDWC_academic_resume+*self:render:content` (offset=2227, exp=62577, act=10133)
  ```
  FAIL recapture-raw:BDWC_academic_resume+*self:render:content (render-engine)
    first difference at code-unit offset 2227 (byte offset 2227): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BDWC_academic_resume+*self:render:open` (offset=4942, exp=65320, act=12876)
  ```
  FAIL recapture-raw:BDWC_academic_resume+*self:render:open (render-engine)
    first difference at code-unit offset 4942 (byte offset 4942): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BDWC_admin_resume+*self:render:content` (offset=2206, exp=61800, act=10040)
  ```
  FAIL recapture-raw:BDWC_admin_resume+*self:render:content (render-engine)
    first difference at code-unit offset 2206 (byte offset 2206): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BDWC_admin_resume+*self:render:open` (offset=4879, exp=64501, act=12741)
  ```
  FAIL recapture-raw:BDWC_admin_resume+*self:render:open (render-engine)
    first difference at code-unit offset 4879 (byte offset 4879): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Academic Resume+*self:render:content` (offset=2213, exp=62127, act=13068)
  ```
  FAIL recapture-raw:BW Academic Resume+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Academic Resume+*self:render:open` (offset=4900, exp=64842, act=15783)
  ```
  FAIL recapture-raw:BW Academic Resume+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BWLinkedInRecs+*self:render:content` (offset=2193, exp=61159, act=12928)
  ```
  FAIL recapture-raw:BWLinkedInRecs+*self:render:content (render-engine)
    first difference at code-unit offset 2193 (byte offset 2193): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BWLinkedInRecs+*self:render:open` (offset=4834, exp=63828, act=15597)
  ```
  FAIL recapture-raw:BWLinkedInRecs+*self:render:open (render-engine)
    first difference at code-unit offset 4834 (byte offset 4834): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW_ASC_SumRet2010_Anno+*self:render:content` (offset=2246, exp=63182, act=10213)
  ```
  FAIL recapture-raw:BW_ASC_SumRet2010_Anno+*self:render:content (render-engine)
    first difference at code-unit offset 2246 (byte offset 2246): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW_ASC_SumRet2010_Anno+*self:render:open` (offset=4996, exp=65960, act=12991)
  ```
  FAIL recapture-raw:BW_ASC_SumRet2010_Anno+*self:render:open (render-engine)
    first difference at code-unit offset 4996 (byte offset 4996): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bill Leicht 2011a+*self:render:content` (offset=2207, exp=61731, act=7058)
  ```
  FAIL recapture-raw:Bill Leicht 2011a+*self:render:content (render-engine)
    first difference at code-unit offset 2207 (byte offset 2207): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bill Leicht 2011a+*self:render:open` (offset=4882, exp=64434, act=9761)
  ```
  FAIL recapture-raw:Bill Leicht 2011a+*self:render:open (render-engine)
    first difference at code-unit offset 4882 (byte offset 4882): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:CSprnwczInSleepAKing+*self:render:content` (offset=2247, exp=62621, act=7178)
  ```
  FAIL recapture-raw:CSprnwczInSleepAKing+*self:render:content (render-engine)
    first difference at code-unit offset 2247 (byte offset 2247): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:CSprnwczInSleepAKing+*self:render:open` (offset=4987, exp=65389, act=9946)
  ```
  FAIL recapture-raw:CSprnwczInSleepAKing+*self:render:open (render-engine)
    first difference at code-unit offset 4987 (byte offset 4987): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cards with accounts+*self:render:content` (offset=2214, exp=62248, act=10070)
  ```
  FAIL recapture-raw:Cards with accounts+*self:render:content (render-engine)
    first difference at code-unit offset 2214 (byte offset 2214): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cards with accounts+*self:render:open` (offset=4909, exp=64971, act=12793)
  ```
  FAIL recapture-raw:Cards with accounts+*self:render:open (render-engine)
    first difference at code-unit offset 4909 (byte offset 4909): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cardtype+description+*type plus right:render:content` (offset=2325, exp=64988, act=7306)
  ```
  FAIL recapture-raw:Cardtype+description+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2325 (byte offset 2325): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cardtype+description+*type plus right:render:open` (offset=2842, exp=68009, act=9627)
  ```
  FAIL recapture-raw:Cardtype+description+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2842 (byte offset 2842): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:DanPinkVideo01+*self:render:content` (offset=2193, exp=61159, act=12928)
  ```
  FAIL recapture-raw:DanPinkVideo01+*self:render:content (render-engine)
    first difference at code-unit offset 2193 (byte offset 2193): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:DanPinkVideo01+*self:render:open` (offset=4834, exp=63828, act=15597)
  ```
  FAIL recapture-raw:DanPinkVideo01+*self:render:open (render-engine)
    first difference at code-unit offset 4834 (byte offset 4834): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Draft Letter Frager v1+*self:render:content` (offset=2246, exp=63088, act=10200)
  ```
  FAIL recapture-raw:Draft Letter Frager v1+*self:render:content (render-engine)
    first difference at code-unit offset 2246 (byte offset 2246): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Draft Letter Frager v1+*self:render:open` (offset=4999, exp=65869, act=12981)
  ```
  FAIL recapture-raw:Draft Letter Frager v1+*self:render:open (render-engine)
    first difference at code-unit offset 4999 (byte offset 4999): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Form submission thanks+*self:render:content` (offset=2242, exp=63052, act=10183)
  ```
  FAIL recapture-raw:Form submission thanks+*self:render:content (render-engine)
    first difference at code-unit offset 2242 (byte offset 2242): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Form submission thanks+*self:render:open` (offset=4990, exp=65828, act=12959)
  ```
  FAIL recapture-raw:Form submission thanks+*self:render:open (render-engine)
    first difference at code-unit offset 4990 (byte offset 4990): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Dojo at UC West Circle Green Mon Aug 2nd+*self:render:content` (offset=2442, exp=70534, act=11068)
  ```
  FAIL recapture-raw:Free Aiki Dojo at UC West Circle Green Mon Aug 2nd+*self:render:content (render-engine)
    first difference at code-unit offset 2442 (byte offset 2442): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free aiki locations+*self:render:content` (offset=2217, exp=62333, act=10086)
  ```
  FAIL recapture-raw:Free aiki locations+*self:render:content (render-engine)
    first difference at code-unit offset 2217 (byte offset 2217): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free aiki locations+*self:render:open` (offset=4915, exp=65059, act=12812)
  ```
  FAIL recapture-raw:Free aiki locations+*self:render:open (render-engine)
    first difference at code-unit offset 4915 (byte offset 4915): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:FreeAiki original site+*self:render:content` (offset=2245, exp=63209, act=13268)
  ```
  FAIL recapture-raw:FreeAiki original site+*self:render:content (render-engine)
    first difference at code-unit offset 2245 (byte offset 2245): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:FreeAiki original site+*self:render:open` (offset=4993, exp=65985, act=16044)
  ```
  FAIL recapture-raw:FreeAiki original site+*self:render:open (render-engine)
    first difference at code-unit offset 4993 (byte offset 4993): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBAC Faculty Glade Google Map+*self:render:content` (offset=2290, exp=64998, act=13563)
  ```
  FAIL recapture-raw:GBAC Faculty Glade Google Map+*self:render:content (render-engine)
    first difference at code-unit offset 2290 (byte offset 2290): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Healing Friction context+*self:render:content` (offset=2260, exp=63606, act=10262)
  ```
  FAIL recapture-raw:Healing Friction context+*self:render:content (render-engine)
    first difference at code-unit offset 2260 (byte offset 2260): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Healing Friction details+*self:render:content` (offset=2256, exp=63570, act=10245)
  ```
  FAIL recapture-raw:Healing Friction details+*self:render:content (render-engine)
    first difference at code-unit offset 2256 (byte offset 2256): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Javascript Weirdness+*self:render:content` (offset=2227, exp=62649, act=13158)
  ```
  FAIL recapture-raw:Javascript Weirdness+*self:render:content (render-engine)
    first difference at code-unit offset 2227 (byte offset 2227): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Javascript Weirdness+*self:render:open` (offset=4942, exp=65392, act=15901)
  ```
  FAIL recapture-raw:Javascript Weirdness+*self:render:open (render-engine)
    first difference at code-unit offset 4942 (byte offset 4942): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Leslie Marmon Silko+*self:render:content` (offset=2221, exp=62369, act=10103)
  ```
  FAIL recapture-raw:Leslie Marmon Silko+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Leslie Marmon Silko+*self:render:open` (offset=4924, exp=65100, act=12834)
  ```
  FAIL recapture-raw:Leslie Marmon Silko+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Word Disposition+*self:render:content` (offset=2236, exp=62478, act=7127)
  ```
  FAIL recapture-raw:MNv Word Disposition+*self:render:content (render-engine)
    first difference at code-unit offset 2236 (byte offset 2236): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Word Disposition+*self:render:open` (offset=4966, exp=65236, act=9885)
  ```
  FAIL recapture-raw:MNv Word Disposition+*self:render:open (render-engine)
    first difference at code-unit offset 4966 (byte offset 4966): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Martial Nonviolence context+*self:render:content` (offset=2281, exp=64383, act=10355)
  ```
  FAIL recapture-raw:Martial Nonviolence context+*self:render:content (render-engine)
    first difference at code-unit offset 2281 (byte offset 2281): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Metash dialogue BW NT+*self:render:content` (offset=2239, exp=62701, act=7130)
  ```
  FAIL recapture-raw:Metash dialogue BW NT+*self:render:content (render-engine)
    first difference at code-unit offset 2239 (byte offset 2239): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Metash dialogue BW NT+*self:render:open` (offset=4978, exp=65468, act=9897)
  ```
  FAIL recapture-raw:Metash dialogue BW NT+*self:render:open (render-engine)
    first difference at code-unit offset 4978 (byte offset 4978): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MorningFreeAikiToon+*self:render:content` (offset=2233, exp=62477, act=10154)
  ```
  FAIL recapture-raw:MorningFreeAikiToon+*self:render:content (render-engine)
    first difference at code-unit offset 2233 (byte offset 2233): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MorningFreeAikiToon+*self:render:open` (offset=4951, exp=65223, act=12900)
  ```
  FAIL recapture-raw:MorningFreeAikiToon+*self:render:open (render-engine)
    first difference at code-unit offset 4951 (byte offset 4951): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Nagler - Nonviolence Today presentation+*self:render:content` (offset=2348, exp=72896, act=13945)
  ```
  FAIL recapture-raw:Nagler - Nonviolence Today presentation+*self:render:content (render-engine)
    first difference at code-unit offset 2348 (byte offset 2348): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100602_2800+*self:render:content` (offset=2200, exp=61592, act=10010)
  ```
  FAIL recapture-raw:OR 20100602_2800+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100602_2800+*self:render:open` (offset=4861, exp=64281, act=12699)
  ```
  FAIL recapture-raw:OR 20100602_2800+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100702_Buddy01+*self:render:content` (offset=2221, exp=62369, act=10103)
  ```
  FAIL recapture-raw:OR 20100702_Buddy01+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100702_Buddy01+*self:render:open` (offset=4924, exp=65100, act=12834)
  ```
  FAIL recapture-raw:OR 20100702_Buddy01+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100702_Buddy02+*self:render:content` (offset=2221, exp=62369, act=10103)
  ```
  FAIL recapture-raw:OR 20100702_Buddy02+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100702_Buddy02+*self:render:open` (offset=4924, exp=65100, act=12834)
  ```
  FAIL recapture-raw:OR 20100702_Buddy02+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR 20100702_Buddy_Heidi02+*self:render:content` (offset=2263, exp=63923, act=10289)
  ```
  FAIL recapture-raw:OR 20100702_Buddy_Heidi02+*self:render:content (render-engine)
    first difference at code-unit offset 2263 (byte offset 2263): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3558+*self:render:content` (offset=2221, exp=62245, act=7092)
  ```
  FAIL recapture-raw:OR THXG 201011_3558+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3558+*self:render:open` (offset=4924, exp=64976, act=9823)
  ```
  FAIL recapture-raw:OR THXG 201011_3558+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR_20100703_2810med+*self:render:content` (offset=2221, exp=62369, act=10103)
  ```
  FAIL recapture-raw:OR_20100703_2810med+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR_20100703_2810med+*self:render:open` (offset=4924, exp=65100, act=12834)
  ```
  FAIL recapture-raw:OR_20100703_2810med+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:On Soul Charater and Calling - An Interview with James Hillman+*self:render:content` (offset=2507, exp=80546, act=14944)
  ```
  FAIL recapture-raw:On Soul Charater and Calling - An Interview with James Hillman+*self:render:content (render-engine)
    first difference at code-unit offset 2507 (byte offset 2507): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Peace Training Project+*self:render:content` (offset=2244, exp=63089, act=10189)
  ```
  FAIL recapture-raw:Peace Training Project+*self:render:content (render-engine)
    first difference at code-unit offset 2244 (byte offset 2244): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Peace Training Project+*self:render:open` (offset=4993, exp=65866, act=12966)
  ```
  FAIL recapture-raw:Peace Training Project+*self:render:open (render-engine)
    first difference at code-unit offset 4993 (byte offset 4993): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Process Arts exposure+*self:render:content` (offset=2235, exp=62793, act=10152)
  ```
  FAIL recapture-raw:Process Arts exposure+*self:render:content (render-engine)
    first difference at code-unit offset 2235 (byte offset 2235): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Process Arts exposure+*self:render:open` (offset=4969, exp=65555, act=12914)
  ```
  FAIL recapture-raw:Process Arts exposure+*self:render:open (render-engine)
    first difference at code-unit offset 4969 (byte offset 4969): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Process arts in Blessed Unrest by Paul Hawken+*self:render:content` (offset=2399, exp=69067, act=10892)
  ```
  FAIL recapture-raw:Process arts in Blessed Unrest by Paul Hawken+*self:render:content (render-engine)
    first difference at code-unit offset 2399 (byte offset 2399): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Process arts in the Change Handbook+*self:render:content` (offset=2329, exp=66477, act=10582)
  ```
  FAIL recapture-raw:Process arts in the Change Handbook+*self:render:content (render-engine)
    first difference at code-unit offset 2329 (byte offset 2329): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Robert Frager and Morihei Ueshiba+*self:render:content` (offset=2323, exp=65785, act=7334)
  ```
  FAIL recapture-raw:Robert Frager and Morihei Ueshiba+*self:render:content (render-engine)
    first difference at code-unit offset 2323 (byte offset 2323): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Rosa at Thinking About Art+*self:render:content` (offset=2269, exp=64215, act=13428)
  ```
  FAIL recapture-raw:Rosa at Thinking About Art+*self:render:content (render-engine)
    first difference at code-unit offset 2269 (byte offset 2269): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Rosa at WaHIarts+*self:render:content` (offset=2203, exp=61643, act=12998)
  ```
  FAIL recapture-raw:Rosa at WaHIarts+*self:render:content (render-engine)
    first difference at code-unit offset 2203 (byte offset 2203): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Rosa at WaHIarts+*self:render:open` (offset=4867, exp=64335, act=15690)
  ```
  FAIL recapture-raw:Rosa at WaHIarts+*self:render:open (render-engine)
    first difference at code-unit offset 4867 (byte offset 4867): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:TM_HuffPost_20100629+*self:render:content` (offset=2231, exp=62687, act=13178)
  ```
  FAIL recapture-raw:TM_HuffPost_20100629+*self:render:content (render-engine)
    first difference at code-unit offset 2231 (byte offset 2231): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:TM_HuffPost_20100629+*self:render:open` (offset=4951, exp=65435, act=15926)
  ```
  FAIL recapture-raw:TM_HuffPost_20100629+*self:render:open (render-engine)
    first difference at code-unit offset 4951 (byte offset 4951): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:TM_HuffPost_20100629_cache+*self:render:content` (offset=2278, exp=64160, act=10341)
  ```
  FAIL recapture-raw:TM_HuffPost_20100629_cache+*self:render:content (render-engine)
    first difference at code-unit offset 2278 (byte offset 2278): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The Myth of Peace Outline+*self:render:content` (offset=2267, exp=63847, act=10284)
  ```
  FAIL recapture-raw:The Myth of Peace Outline+*self:render:content (render-engine)
    first difference at code-unit offset 2267 (byte offset 2267): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The Value of the GPx Credential+*self:render:content` (offset=2313, exp=65455, act=10496)
  ```
  FAIL recapture-raw:The Value of the GPx Credential+*self:render:content (render-engine)
    first difference at code-unit offset 2313 (byte offset 2313): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Thomas Moore 20100629+*self:render:content` (offset=2235, exp=62987, act=10152)
  ```
  FAIL recapture-raw:Thomas Moore 20100629+*self:render:content (render-engine)
    first difference at code-unit offset 2235 (byte offset 2235): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Thomas Moore 20100629+*self:render:open` (offset=4969, exp=65749, act=12914)
  ```
  FAIL recapture-raw:Thomas Moore 20100629+*self:render:open (render-engine)
    first difference at code-unit offset 4969 (byte offset 4969): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Urban Visions embed+*self:render:content` (offset=2216, exp=62350, act=13093)
  ```
  FAIL recapture-raw:Urban Visions embed+*self:render:content (render-engine)
    first difference at code-unit offset 2216 (byte offset 2216): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Urban Visions embed+*self:render:open` (offset=4912, exp=65074, act=15817)
  ```
  FAIL recapture-raw:Urban Visions embed+*self:render:open (render-engine)
    first difference at code-unit offset 4912 (byte offset 4912): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:VAP+*type:render:content` (offset=2112, exp=58252, act=12388)
  ```
  FAIL recapture-raw:VAP+*type:render:content (render-engine)
    first difference at code-unit offset 2112 (byte offset 2112): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:VAP+*type:render:open` (offset=4597, exp=60765, act=14901)
  ```
  FAIL recapture-raw:VAP+*type:render:open (render-engine)
    first difference at code-unit offset 4597 (byte offset 4597): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:movement-education_org+*self:render:content` (offset=2241, exp=67627, act=13248)
  ```
  FAIL recapture-raw:movement-education_org+*self:render:content (render-engine)
    first difference at code-unit offset 2241 (byte offset 2241): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:movement-education_org+*self:render:open` (offset=4984, exp=70398, act=16019)
  ```
  FAIL recapture-raw:movement-education_org+*self:render:open (render-engine)
    first difference at code-unit offset 4984 (byte offset 4984): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:process arts in practice+*self:render:content` (offset=2251, exp=63655, act=13318)
  ```
  FAIL recapture-raw:process arts in practice+*self:render:content (render-engine)
    first difference at code-unit offset 2251 (byte offset 2251): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:201006-07 vacation in Oregon+*self:render:content` (offset=2288, exp=69992, act=10386)
  ```
  FAIL recapture-raw:201006-07 vacation in Oregon+*self:render:content (render-engine)
    first difference at code-unit offset 2288 (byte offset 2288): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:20101027 Sono 01+*self:render:content` (offset=2200, exp=61474, act=7041)
  ```
  FAIL recapture-raw:20101027 Sono 01+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:20101027 Sono 01+*self:render:open` (offset=4861, exp=64163, act=9730)
  ```
  FAIL recapture-raw:20101027 Sono 01+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ABC Board Bookmarks+*self:render:content` (offset=2221, exp=62153, act=7082)
  ```
  FAIL recapture-raw:ABC Board Bookmarks+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ABC Board Bookmarks+*self:render:open` (offset=4927, exp=64887, act=9816)
  ```
  FAIL recapture-raw:ABC Board Bookmarks+*self:render:open (render-engine)
    first difference at code-unit offset 4927 (byte offset 4927): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ABC banking and credit card statements to date+*self:render:content` (offset=2410, exp=69092, act=7541)
  ```
  FAIL recapture-raw:ABC banking and credit card statements to date+*self:render:content (render-engine)
    first difference at code-unit offset 2410 (byte offset 2410): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ABCglobal Board+*self:render:content` (offset=2201, exp=61193, act=7042)
  ```
  FAIL recapture-raw:ABCglobal Board+*self:render:content (render-engine)
    first difference at code-unit offset 2201 (byte offset 2201): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ABCglobal Board+*self:render:open` (offset=4861, exp=63881, act=9730)
  ```
  FAIL recapture-raw:ABCglobal Board+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AE Peace Dojos info distribution +*self:render:content` (offset=2312, exp=65494, act=7303)
  ```
  FAIL recapture-raw:AE Peace Dojos info distribution +*self:render:content (render-engine)
    first difference at code-unit offset 2312 (byte offset 2312): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AEweb notes 20101008+*self:render:content` (offset=2232, exp=62444, act=7113)
  ```
  FAIL recapture-raw:AEweb notes 20101008+*self:render:content (render-engine)
    first difference at code-unit offset 2232 (byte offset 2232): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AEweb notes 20101008+*self:render:open` (offset=4957, exp=65197, act=9866)
  ```
  FAIL recapture-raw:AEweb notes 20101008+*self:render:open (render-engine)
    first difference at code-unit offset 4957 (byte offset 4957): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ASCSR2010gallery03+*self:render:content` (offset=2218, exp=62052, act=10076)
  ```
  FAIL recapture-raw:ASCSR2010gallery03+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ASCSR2010gallery03+*self:render:open` (offset=4915, exp=64777, act=12801)
  ```
  FAIL recapture-raw:ASCSR2010gallery03+*self:render:open (render-engine)
    first difference at code-unit offset 4915 (byte offset 4915): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_calig_01+*self:render:content` (offset=2327, exp=66067, act=10571)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_calig_01+*self:render:content (render-engine)
    first difference at code-unit offset 2327 (byte offset 2327): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_civic+*self:render:content` (offset=2306, exp=65290, act=10478)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_civic+*self:render:content (render-engine)
    first difference at code-unit offset 2306 (byte offset 2306): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_dancing01+*self:render:content` (offset=2334, exp=66326, act=10602)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_dancing01+*self:render:content (render-engine)
    first difference at code-unit offset 2334 (byte offset 2334): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_dancing02+*self:render:content` (offset=2334, exp=66326, act=10602)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_dancing02+*self:render:content (render-engine)
    first difference at code-unit offset 2334 (byte offset 2334): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_group_12+*self:render:content` (offset=2327, exp=66067, act=10571)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_group_12+*self:render:content (render-engine)
    first difference at code-unit offset 2327 (byte offset 2327): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AiBerk at ASC SumRet2010_wholegroup_04+*self:render:content` (offset=2362, exp=67362, act=10726)
  ```
  FAIL recapture-raw:AiBerk at ASC SumRet2010_wholegroup_04+*self:render:content (render-engine)
    first difference at code-unit offset 2362 (byte offset 2362): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Extensions Newsletter highlights process arts contributions+*self:render:content` (offset=2524, exp=74016, act=11434)
  ```
  FAIL recapture-raw:Aiki Extensions Newsletter highlights process arts contributions+*self:render:content (render-engine)
    first difference at code-unit offset 2524 (byte offset 2524): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Bertram Wohak+*self:render:content` (offset=2395, exp=75261, act=7506)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Bertram Wohak+*self:render:content (render-engine)
    first difference at code-unit offset 2395 (byte offset 2395): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Brandon WilliamsCraig+*self:render:content` (offset=2451, exp=77957, act=7642)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Brandon WilliamsCraig+*self:render:content (render-engine)
    first difference at code-unit offset 2451 (byte offset 2451): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Paul Linden+*self:render:content` (offset=2381, exp=74587, act=7472)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Paul Linden+*self:render:content (render-engine)
    first difference at code-unit offset 2381 (byte offset 2381): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Richard Strozzi-Heckler+*self:render:content` (offset=2465, exp=78631, act=7676)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Richard Strozzi-Heckler+*self:render:content (render-engine)
    first difference at code-unit offset 2465 (byte offset 2465): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Tom Crum+*self:render:content` (offset=2360, exp=73576, act=7421)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Tom Crum+*self:render:content (render-engine)
    first difference at code-unit offset 2360 (byte offset 2360): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Wendy Palmer+*self:render:content` (offset=2388, exp=74924, act=7489)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Wendy Palmer+*self:render:content (render-engine)
    first difference at code-unit offset 2388 (byte offset 2388): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Peace Week 2010 Dispatch - Why It Is So Important to Teach Aikido to Children+*self:render:content` (offset=2638, exp=87594, act=8079)
  ```
  FAIL recapture-raw:Aiki Peace Week 2010 Dispatch - Why It Is So Important to Teach Aikido to Children+*self:render:content (render-engine)
    first difference at code-unit offset 2638 (byte offset 2638): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido and Psychotherapy 2010 at ITP+*self:render:content` (offset=2344, exp=66556, act=7385)
  ```
  FAIL recapture-raw:Aikido and Psychotherapy 2010 at ITP+*self:render:content (render-engine)
    first difference at code-unit offset 2344 (byte offset 2344): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido in Fredericksburg Training for Seniors +*self:render:content` (offset=2398, exp=69016, act=10891)
  ```
  FAIL recapture-raw:Aikido in Fredericksburg Training for Seniors +*self:render:content (render-engine)
    first difference at code-unit offset 2398 (byte offset 2398): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido of Columbus+*self:render:content` (offset=2214, exp=62051, act=10063)
  ```
  FAIL recapture-raw:Aikido of Columbus+*self:render:content (render-engine)
    first difference at code-unit offset 2214 (byte offset 2214): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido of Columbus+*self:render:open` (offset=4903, exp=64768, act=12780)
  ```
  FAIL recapture-raw:Aikido of Columbus+*self:render:open (render-engine)
    first difference at code-unit offset 4903 (byte offset 4903): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AikidoJournalEmbed+*self:render:content` (offset=2221, exp=62203, act=13108)
  ```
  FAIL recapture-raw:AikidoJournalEmbed+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AikidoJournalEmbed+*self:render:open` (offset=4918, exp=64928, act=15833)
  ```
  FAIL recapture-raw:AikidoJournalEmbed+*self:render:open (render-engine)
    first difference at code-unit offset 4918 (byte offset 4918): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AikidoSantaCruzEmbed+*self:render:content` (offset=2243, exp=62801, act=13238)
  ```
  FAIL recapture-raw:AikidoSantaCruzEmbed+*self:render:content (render-engine)
    first difference at code-unit offset 2243 (byte offset 2243): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AikidoSantaCruzEmbed+*self:render:open` (offset=4978, exp=65564, act=16001)
  ```
  FAIL recapture-raw:AikidoSantaCruzEmbed+*self:render:open (render-engine)
    first difference at code-unit offset 4978 (byte offset 4978): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Alexander McDonell+*self:render:content` (offset=2219, exp=62097, act=10090)
  ```
  FAIL recapture-raw:Alexander McDonell+*self:render:content (render-engine)
    first difference at code-unit offset 2219 (byte offset 2219): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Alexander McDonell+*self:render:open` (offset=4915, exp=64821, act=12814)
  ```
  FAIL recapture-raw:Alexander McDonell+*self:render:open (render-engine)
    first difference at code-unit offset 4915 (byte offset 4915): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ann Weiser Cornell+*self:render:content` (offset=2215, exp=62061, act=10073)
  ```
  FAIL recapture-raw:Ann Weiser Cornell+*self:render:content (render-engine)
    first difference at code-unit offset 2215 (byte offset 2215): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ann Weiser Cornell+*self:render:open` (offset=4906, exp=64780, act=12792)
  ```
  FAIL recapture-raw:Ann Weiser Cornell+*self:render:open (render-engine)
    first difference at code-unit offset 4906 (byte offset 4906): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Anno Sensei at ASC Summer Retreat+*self:render:content` (offset=2323, exp=66131, act=10541)
  ```
  FAIL recapture-raw:Anno Sensei at ASC Summer Retreat+*self:render:content (render-engine)
    first difference at code-unit offset 2323 (byte offset 2323): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Arny and Amy Mindell+*self:render:content` (offset=2229, exp=62579, act=10135)
  ```
  FAIL recapture-raw:Arny and Amy Mindell+*self:render:content (render-engine)
    first difference at code-unit offset 2229 (byte offset 2229): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Arny and Amy Mindell+*self:render:open` (offset=4948, exp=65326, act=12882)
  ```
  FAIL recapture-raw:Arny and Amy Mindell+*self:render:open (render-engine)
    first difference at code-unit offset 4948 (byte offset 4948): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AsIn Project Management Training+*self:render:content` (offset=2314, exp=65811, act=13683)
  ```
  FAIL recapture-raw:AsIn Project Management Training+*self:render:content (render-engine)
    first difference at code-unit offset 2314 (byte offset 2314): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Authenticity Character and Destiny+*self:render:content` (offset=2327, exp=66196, act=10560)
  ```
  FAIL recapture-raw:Authenticity Character and Destiny+*self:render:content (render-engine)
    first difference at code-unit offset 2327 (byte offset 2327): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Craigslist res+*self:render:content` (offset=2207, exp=61639, act=7048)
  ```
  FAIL recapture-raw:BW Craigslist res+*self:render:content (render-engine)
    first difference at code-unit offset 2207 (byte offset 2207): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Craigslist res+*self:render:open` (offset=4885, exp=64345, act=9754)
  ```
  FAIL recapture-raw:BW Craigslist res+*self:render:open (render-engine)
    first difference at code-unit offset 4885 (byte offset 4885): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Recommendations+*self:render:content` (offset=2214, exp=62016, act=10059)
  ```
  FAIL recapture-raw:BW Recommendations+*self:render:content (render-engine)
    first difference at code-unit offset 2214 (byte offset 2214): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Recommendations+*self:render:open` (offset=4906, exp=64736, act=12779)
  ```
  FAIL recapture-raw:BW Recommendations+*self:render:open (render-engine)
    first difference at code-unit offset 4906 (byte offset 4906): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW2010profile_bw+*self:render:content` (offset=2200, exp=61474, act=7041)
  ```
  FAIL recapture-raw:BW2010profile_bw+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW2010profile_bw+*self:render:open` (offset=4861, exp=64163, act=9730)
  ```
  FAIL recapture-raw:BW2010profile_bw+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brandon WilliamsCraig+*self:render:content` (offset=2236, exp=62820, act=10157)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+*self:render:content (render-engine)
    first difference at code-unit offset 2236 (byte offset 2236): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brandon WilliamsCraig+*self:render:open` (offset=4969, exp=65581, act=12918)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+*self:render:open (render-engine)
    first difference at code-unit offset 4969 (byte offset 4969): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brunner 20100921b - How Soon Can You Come+*self:render:content` (offset=2363, exp=73971, act=7434)
  ```
  FAIL recapture-raw:Brunner 20100921b - How Soon Can You Come+*self:render:content (render-engine)
    first difference at code-unit offset 2363 (byte offset 2363): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Call_for_Papers_for_Organization_Studies_-_Social_Movements_Civil_Societies_and_Corporations+*self:render:content` (offset=2696, exp=90594, act=12201)
  ```
  FAIL recapture-raw:Call_for_Papers_for_Organization_Studies_-_Social_Movements_Civil_Societies_and_Corporations+*self:render:content (render-engine)
    first difference at code-unit offset 2696 (byte offset 2696): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Celebrating the Nonviolent Peaceforce - mid 2010+*self:render:content` (offset=2416, exp=76106, act=10956)
  ```
  FAIL recapture-raw:Celebrating the Nonviolent Peaceforce - mid 2010+*self:render:content (render-engine)
    first difference at code-unit offset 2416 (byte offset 2416): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Check out The Art of Getting Up Again+*self:render:content` (offset=2351, exp=67167, act=10665)
  ```
  FAIL recapture-raw:Check out The Art of Getting Up Again+*self:render:content (render-engine)
    first difference at code-unit offset 2351 (byte offset 2351): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Christopher Franco+*self:render:content` (offset=2215, exp=62061, act=10073)
  ```
  FAIL recapture-raw:Christopher Franco+*self:render:content (render-engine)
    first difference at code-unit offset 2215 (byte offset 2215): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Christopher Franco+*self:render:open` (offset=4906, exp=64780, act=12792)
  ```
  FAIL recapture-raw:Christopher Franco+*self:render:open (render-engine)
    first difference at code-unit offset 4906 (byte offset 4906): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Congrats Nonviolent Peaceforce on your growing service to the world+*self:render:content` (offset=2557, exp=74901, act=11578)
  ```
  FAIL recapture-raw:Congrats Nonviolent Peaceforce on your growing service to the world+*self:render:content (render-engine)
    first difference at code-unit offset 2557 (byte offset 2557): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cs button - topbar - fabrication+*self:render:content` (offset=2284, exp=70512, act=7235)
  ```
  FAIL recapture-raw:Cs button - topbar - fabrication+*self:render:content (render-engine)
    first difference at code-unit offset 2284 (byte offset 2284): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cs button - topbar - investigation+*self:render:content` (offset=2298, exp=71186, act=7269)
  ```
  FAIL recapture-raw:Cs button - topbar - investigation+*self:render:content (render-engine)
    first difference at code-unit offset 2298 (byte offset 2298): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cs button - topbar - therapy of culture+*self:render:content` (offset=2333, exp=72871, act=7354)
  ```
  FAIL recapture-raw:Cs button - topbar - therapy of culture+*self:render:content (render-engine)
    first difference at code-unit offset 2333 (byte offset 2333): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cs button - topbar02a+*self:render:content` (offset=2219, exp=67197, act=7080)
  ```
  FAIL recapture-raw:Cs button - topbar02a+*self:render:content (render-engine)
    first difference at code-unit offset 2219 (byte offset 2219): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cs button - topbar02a+*self:render:open` (offset=4925, exp=69931, act=9814)
  ```
  FAIL recapture-raw:Cs button - topbar02a+*self:render:open (render-engine)
    first difference at code-unit offset 4925 (byte offset 4925): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Culturesmith collage 01+*self:render:content` (offset=2249, exp=63273, act=7160)
  ```
  FAIL recapture-raw:Culturesmith collage 01+*self:render:content (render-engine)
    first difference at code-unit offset 2249 (byte offset 2249): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Embody BASIC MNv+*self:render:content` (offset=2208, exp=61570, act=10031)
  ```
  FAIL recapture-raw:Embody BASIC MNv+*self:render:content (render-engine)
    first difference at code-unit offset 2208 (byte offset 2208): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Embody BASIC MNv+*self:render:open` (offset=4882, exp=64272, act=12733)
  ```
  FAIL recapture-raw:Embody BASIC MNv+*self:render:open (render-engine)
    first difference at code-unit offset 4882 (byte offset 4882): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Embody_Peace_website+*self:render:content` (offset=2227, exp=62649, act=13158)
  ```
  FAIL recapture-raw:Embody_Peace_website+*self:render:content (render-engine)
    first difference at code-unit offset 2227 (byte offset 2227): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Embody_Peace_website+*self:render:open` (offset=4942, exp=65392, act=15901)
  ```
  FAIL recapture-raw:Embody_Peace_website+*self:render:open (render-engine)
    first difference at code-unit offset 4942 (byte offset 4942): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ethan McCutchen+*self:render:content` (offset=2198, exp=61320, act=9997)
  ```
  FAIL recapture-raw:Ethan McCutchen+*self:render:content (render-engine)
    first difference at code-unit offset 2198 (byte offset 2198): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ethan McCutchen+*self:render:open` (offset=4852, exp=64002, act=12679)
  ```
  FAIL recapture-raw:Ethan McCutchen+*self:render:open (render-engine)
    first difference at code-unit offset 4852 (byte offset 4852): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Event - Three-day seminar with Toby Threadgill+*self:render:content` (offset=2402, exp=75598, act=7523)
  ```
  FAIL recapture-raw:Event - Three-day seminar with Toby Threadgill+*self:render:content (render-engine)
    first difference at code-unit offset 2402 (byte offset 2402): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Dojo Member+*self:render:content` (offset=2234, exp=62937, act=10164)
  ```
  FAIL recapture-raw:Free Aiki Dojo Member+*self:render:content (render-engine)
    first difference at code-unit offset 2234 (byte offset 2234): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Dojo Member+*self:render:open` (offset=4963, exp=65694, act=12921)
  ```
  FAIL recapture-raw:Free Aiki Dojo Member+*self:render:open (render-engine)
    first difference at code-unit offset 4963 (byte offset 4963): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Twitter+*self:render:content` (offset=2206, exp=61866, act=13023)
  ```
  FAIL recapture-raw:Free Aiki Twitter+*self:render:content (render-engine)
    first difference at code-unit offset 2206 (byte offset 2206): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Twitter+*self:render:open` (offset=4879, exp=64567, act=15724)
  ```
  FAIL recapture-raw:Free Aiki Twitter+*self:render:open (render-engine)
    first difference at code-unit offset 4879 (byte offset 4879): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:FreeAikiDojoMeetUpEmbed+*self:render:content` (offset=2268, exp=63622, act=13393)
  ```
  FAIL recapture-raw:FreeAikiDojoMeetUpEmbed+*self:render:content (render-engine)
    first difference at code-unit offset 2268 (byte offset 2268): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA Const Google v+*self:render:content` (offset=2213, exp=62127, act=13068)
  ```
  FAIL recapture-raw:GBA Const Google v+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA Const Google v+*self:render:open` (offset=4900, exp=64842, act=15783)
  ```
  FAIL recapture-raw:GBA Const Google v+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA banner 201010 v01_bear02+*self:render:content` (offset=2284, exp=64558, act=7245)
  ```
  FAIL recapture-raw:GBA banner 201010 v01_bear02+*self:render:content (render-engine)
    first difference at code-unit offset 2284 (byte offset 2284): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA banner 201010 v01_paw+*self:render:content` (offset=2263, exp=63787, act=7194)
  ```
  FAIL recapture-raw:GBA banner 201010 v01_paw+*self:render:content (render-engine)
    first difference at code-unit offset 2263 (byte offset 2263): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA logo - admin area+*self:render:content` (offset=2223, exp=67231, act=7094)
  ```
  FAIL recapture-raw:GBA logo - admin area+*self:render:content (render-engine)
    first difference at code-unit offset 2223 (byte offset 2223): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA logo - admin area+*self:render:open` (offset=4934, exp=69970, act=9833)
  ```
  FAIL recapture-raw:GBA logo - admin area+*self:render:open (render-engine)
    first difference at code-unit offset 4934 (byte offset 4934): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA_20101123_3539board+*self:render:content` (offset=2242, exp=63016, act=7143)
  ```
  FAIL recapture-raw:GBA_20101123_3539board+*self:render:content (render-engine)
    first difference at code-unit offset 2242 (byte offset 2242): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA_20101123_3539board+*self:render:open` (offset=4987, exp=65789, act=9916)
  ```
  FAIL recapture-raw:GBA_20101123_3539board+*self:render:open (render-engine)
    first difference at code-unit offset 4987 (byte offset 4987): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Golden Bears Aikido Club Member+*self:render:content` (offset=2300, exp=65491, act=10457)
  ```
  FAIL recapture-raw:Golden Bears Aikido Club Member+*self:render:content (render-engine)
    first difference at code-unit offset 2300 (byte offset 2300): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Golden Bears Aikido Club+*self:render:content` (offset=2256, exp=63438, act=7167)
  ```
  FAIL recapture-raw:Golden Bears Aikido Club+*self:render:content (render-engine)
    first difference at code-unit offset 2256 (byte offset 2256): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Golden_Bears_Aikido_at_UC_Berkeley main layout+*self:render:content` (offset=2407, exp=69411, act=14310)
  ```
  FAIL recapture-raw:Golden_Bears_Aikido_at_UC_Berkeley main layout+*self:render:content (render-engine)
    first difference at code-unit offset 2407 (byte offset 2407): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Golden_Bears_Aikido_at_UC_Berkeley_logo-BearHakama+*self:render:content` (offset=2438, exp=77396, act=7619)
  ```
  FAIL recapture-raw:Golden_Bears_Aikido_at_UC_Berkeley_logo-BearHakama+*self:render:content (render-engine)
    first difference at code-unit offset 2438 (byte offset 2438): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Guardians of Peace+*self:render:content` (offset=2212, exp=62119, act=13033)
  ```
  FAIL recapture-raw:Guardians of Peace+*self:render:content (render-engine)
    first difference at code-unit offset 2212 (byte offset 2212): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Guardians of Peace+*self:render:open` (offset=4900, exp=64835, act=15749)
  ```
  FAIL recapture-raw:Guardians of Peace+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Hedges - Do Not Pity+*self:render:content` (offset=2213, exp=66690, act=10059)
  ```
  FAIL recapture-raw:Hedges - Do Not Pity+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Hedges - Do Not Pity+*self:render:open` (offset=4907, exp=69412, act=12781)
  ```
  FAIL recapture-raw:Hedges - Do Not Pity+*self:render:open (render-engine)
    first difference at code-unit offset 4907 (byte offset 4907): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:HedgesDoNotPityembed+*self:render:content` (offset=2235, exp=62725, act=13198)
  ```
  FAIL recapture-raw:HedgesDoNotPityembed+*self:render:content (render-engine)
    first difference at code-unit offset 2235 (byte offset 2235): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:HedgesDoNotPityembed+*self:render:open` (offset=4960, exp=65478, act=15951)
  ```
  FAIL recapture-raw:HedgesDoNotPityembed+*self:render:open (render-engine)
    first difference at code-unit offset 4960 (byte offset 4960): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Hendricks Feder Demo ASL+*self:render:content` (offset=2251, exp=63655, act=13318)
  ```
  FAIL recapture-raw:Hendricks Feder Demo ASL+*self:render:content (render-engine)
    first difference at code-unit offset 2251 (byte offset 2251): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Hisateru Ishikawa+*self:render:content` (offset=2208, exp=61784, act=10033)
  ```
  FAIL recapture-raw:Hisateru Ishikawa+*self:render:content (render-engine)
    first difference at code-unit offset 2208 (byte offset 2208): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Hisateru Ishikawa+*self:render:open` (offset=4885, exp=64489, act=12738)
  ```
  FAIL recapture-raw:Hisateru Ishikawa+*self:render:open (render-engine)
    first difference at code-unit offset 4885 (byte offset 4885): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:I support all measures which bring more people peacefully to the polls+*self:render:content` (offset=2574, exp=75642, act=11654)
  ```
  FAIL recapture-raw:I support all measures which bring more people peacefully to the polls+*self:render:content (render-engine)
    first difference at code-unit offset 2574 (byte offset 2574): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Institute for  Transpersonal Psychology+*self:render:content` (offset=2355, exp=73120, act=13962)
  ```
  FAIL recapture-raw:Institute for  Transpersonal Psychology+*self:render:content (render-engine)
    first difference at code-unit offset 2355 (byte offset 2355): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:International Aiki Peace Week+*self:render:content` (offset=2295, exp=64757, act=7266)
  ```
  FAIL recapture-raw:International Aiki Peace Week+*self:render:content (render-engine)
    first difference at code-unit offset 2295 (byte offset 2295): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:JanNeveliusSite+*self:render:content` (offset=2196, exp=61382, act=12953)
  ```
  FAIL recapture-raw:JanNeveliusSite+*self:render:content (render-engine)
    first difference at code-unit offset 2196 (byte offset 2196): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:JanNeveliusSite+*self:render:open` (offset=4846, exp=64060, act=15631)
  ```
  FAIL recapture-raw:JanNeveliusSite+*self:render:open (render-engine)
    first difference at code-unit offset 4846 (byte offset 4846): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:JanNeveliusYouTube+*self:render:content` (offset=2221, exp=62203, act=13108)
  ```
  FAIL recapture-raw:JanNeveliusYouTube+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:JanNeveliusYouTube+*self:render:open` (offset=4918, exp=64928, act=15833)
  ```
  FAIL recapture-raw:JanNeveliusYouTube+*self:render:open (render-engine)
    first difference at code-unit offset 4918 (byte offset 4918): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Jeffrey Hohenstein+*self:render:content` (offset=2215, exp=62061, act=10073)
  ```
  FAIL recapture-raw:Jeffrey Hohenstein+*self:render:content (render-engine)
    first difference at code-unit offset 2215 (byte offset 2215): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Jeffrey Hohenstein+*self:render:open` (offset=4906, exp=64780, act=12792)
  ```
  FAIL recapture-raw:Jeffrey Hohenstein+*self:render:open (render-engine)
    first difference at code-unit offset 4906 (byte offset 4906): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Judson Phillips v Methodists+*self:render:content` (offset=2277, exp=64570, act=10340)
  ```
  FAIL recapture-raw:Judson Phillips v Methodists+*self:render:content (render-engine)
    first difference at code-unit offset 2277 (byte offset 2277): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:KanjiBearBanner01+*self:render:content` (offset=2215, exp=61799, act=7086)
  ```
  FAIL recapture-raw:KanjiBearBanner01+*self:render:content (render-engine)
    first difference at code-unit offset 2215 (byte offset 2215): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:KanjiBearBanner01+*self:render:open` (offset=4900, exp=64512, act=9799)
  ```
  FAIL recapture-raw:KanjiBearBanner01+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:KanjiBearBanner02+*self:render:content` (offset=2215, exp=61799, act=7086)
  ```
  FAIL recapture-raw:KanjiBearBanner02+*self:render:content (render-engine)
    first difference at code-unit offset 2215 (byte offset 2215): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:KanjiBearBanner02+*self:render:open` (offset=4900, exp=64512, act=9799)
  ```
  FAIL recapture-raw:KanjiBearBanner02+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Kayla Feder Sensei on Aikido +*self:render:content` (offset=2283, exp=64737, act=13518)
  ```
  FAIL recapture-raw:Kayla Feder Sensei on Aikido +*self:render:content (render-engine)
    first difference at code-unit offset 2283 (byte offset 2283): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Knee-jerks 20100822+*self:render:content` (offset=2221, exp=66857, act=7082)
  ```
  FAIL recapture-raw:Knee-jerks 20100822+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Knee-jerks 20100822+*self:render:open` (offset=4927, exp=69591, act=9816)
  ```
  FAIL recapture-raw:Knee-jerks 20100822+*self:render:open (render-engine)
    first difference at code-unit offset 4927 (byte offset 4927): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Latest news item+*self:render:content` (offset=2201, exp=61543, act=10011)
  ```
  FAIL recapture-raw:Latest news item+*self:render:content (render-engine)
    first difference at code-unit offset 2201 (byte offset 2201): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Latest news item+*self:render:open` (offset=4864, exp=64234, act=12702)
  ```
  FAIL recapture-raw:Latest news item+*self:render:open (render-engine)
    first difference at code-unit offset 4864 (byte offset 4864): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:List of Tracked Items+*self:render:content` (offset=2232, exp=62676, act=7113)
  ```
  FAIL recapture-raw:List of Tracked Items+*self:render:content (render-engine)
    first difference at code-unit offset 2232 (byte offset 2232): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:List of Tracked Items+*self:render:open` (offset=4960, exp=65432, act=9869)
  ```
  FAIL recapture-raw:List of Tracked Items+*self:render:open (render-engine)
    first difference at code-unit offset 4960 (byte offset 4960): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Low impact body arts research+*self:render:content` (offset=2291, exp=64723, act=7252)
  ```
  FAIL recapture-raw:Low impact body arts research+*self:render:content (render-engine)
    first difference at code-unit offset 2291 (byte offset 2291): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Spoken Progression Stages+*self:render:content` (offset=2295, exp=64757, act=7266)
  ```
  FAIL recapture-raw:MNv Spoken Progression Stages+*self:render:content (render-engine)
    first difference at code-unit offset 2295 (byte offset 2295): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Word Techniques+*self:render:content` (offset=2225, exp=62187, act=7096)
  ```
  FAIL recapture-raw:MNv Word Techniques+*self:render:content (render-engine)
    first difference at code-unit offset 2225 (byte offset 2225): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Word Techniques+*self:render:open` (offset=4936, exp=64926, act=9835)
  ```
  FAIL recapture-raw:MNv Word Techniques+*self:render:open (render-engine)
    first difference at code-unit offset 4936 (byte offset 4936): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Management Resume BW+*self:render:content` (offset=2232, exp=62552, act=10129)
  ```
  FAIL recapture-raw:Management Resume BW+*self:render:content (render-engine)
    first difference at code-unit offset 2232 (byte offset 2232): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Management Resume BW+*self:render:open` (offset=4957, exp=65305, act=12882)
  ```
  FAIL recapture-raw:Management Resume BW+*self:render:open (render-engine)
    first difference at code-unit offset 4957 (byte offset 4957): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Mitsugi Saotome - Aikido Principles+*self:render:content` (offset=2316, exp=71526, act=13745)
  ```
  FAIL recapture-raw:Mitsugi Saotome - Aikido Principles+*self:render:content (render-engine)
    first difference at code-unit offset 2316 (byte offset 2316): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Money Power and Education+*self:render:content` (offset=2267, exp=63865, act=10293)
  ```
  FAIL recapture-raw:Money Power and Education+*self:render:content (render-engine)
    first difference at code-unit offset 2267 (byte offset 2267): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Morihei Ueshiba with students+*self:render:content` (offset=2286, exp=64960, act=13543)
  ```
  FAIL recapture-raw:Morihei Ueshiba with students+*self:render:content (render-engine)
    first difference at code-unit offset 2286 (byte offset 2286): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - DCWGlenOaks+*self:render:content` (offset=2230, exp=67568, act=7111)
  ```
  FAIL recapture-raw:Ms Paula - DCWGlenOaks+*self:render:content (render-engine)
    first difference at code-unit offset 2230 (byte offset 2230): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - DCWGlenOaks+*self:render:open` (offset=4955, exp=70321, act=9864)
  ```
  FAIL recapture-raw:Ms Paula - DCWGlenOaks+*self:render:open (render-engine)
    first difference at code-unit offset 4955 (byte offset 4955): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - MimiDCW+*self:render:content` (offset=2202, exp=66220, act=7043)
  ```
  FAIL recapture-raw:Ms Paula - MimiDCW+*self:render:content (render-engine)
    first difference at code-unit offset 2202 (byte offset 2202): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - MimiDCW+*self:render:open` (offset=4871, exp=68917, act=9740)
  ```
  FAIL recapture-raw:Ms Paula - MimiDCW+*self:render:open (render-engine)
    first difference at code-unit offset 4871 (byte offset 4871): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - PClion75th2003torysteller+*self:render:content` (offset=2328, exp=72286, act=7349)
  ```
  FAIL recapture-raw:Ms Paula - PClion75th2003torysteller+*self:render:content (render-engine)
    first difference at code-unit offset 2328 (byte offset 2328): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - Ruiz-Larson+*self:render:content` (offset=2226, exp=67534, act=7097)
  ```
  FAIL recapture-raw:Ms Paula - Ruiz-Larson+*self:render:content (render-engine)
    first difference at code-unit offset 2226 (byte offset 2226): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - Ruiz-Larson+*self:render:open` (offset=4946, exp=70282, act=9845)
  ```
  FAIL recapture-raw:Ms Paula - Ruiz-Larson+*self:render:open (render-engine)
    first difference at code-unit offset 4946 (byte offset 4946): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Beloved Mom and Grandma+*self:render:content` (offset=2307, exp=65571, act=10488)
  ```
  FAIL recapture-raw:Ms Paula Beloved Mom and Grandma+*self:render:content (render-engine)
    first difference at code-unit offset 2307 (byte offset 2307): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Developmental Consultant+*self:render:content` (offset=2314, exp=65830, act=10519)
  ```
  FAIL recapture-raw:Ms Paula Developmental Consultant+*self:render:content (render-engine)
    first difference at code-unit offset 2314 (byte offset 2314): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Mentor to Montessori Educators+*self:render:content` (offset=2357, exp=67259, act=7408)
  ```
  FAIL recapture-raw:Ms Paula Mentor to Montessori Educators+*self:render:content (render-engine)
    first difference at code-unit offset 2357 (byte offset 2357): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Musikgarten+*self:render:content` (offset=2223, exp=62463, act=10116)
  ```
  FAIL recapture-raw:Ms Paula Musikgarten+*self:render:content (render-engine)
    first difference at code-unit offset 2223 (byte offset 2223): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Musikgarten+*self:render:open` (offset=4933, exp=65201, act=12854)
  ```
  FAIL recapture-raw:Ms Paula Musikgarten+*self:render:open (render-engine)
    first difference at code-unit offset 4933 (byte offset 4933): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Pregnancy and Childbirth Advice+*self:render:content` (offset=2363, exp=67643, act=10736)
  ```
  FAIL recapture-raw:Ms Paula Pregnancy and Childbirth Advice+*self:render:content (render-engine)
    first difference at code-unit offset 2363 (byte offset 2363): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Recommendations+*self:render:content` (offset=2252, exp=63404, act=7153)
  ```
  FAIL recapture-raw:Ms Paula Recommendations+*self:render:content (render-engine)
    first difference at code-unit offset 2252 (byte offset 2252): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula writing poetry and other creations+*self:render:content` (offset=2385, exp=68287, act=7476)
  ```
  FAIL recapture-raw:Ms Paula writing poetry and other creations+*self:render:content (render-engine)
    first difference at code-unit offset 2385 (byte offset 2385): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MythoPsychology_logo02+*self:render:content` (offset=2246, exp=63182, act=10213)
  ```
  FAIL recapture-raw:MythoPsychology_logo02+*self:render:content (render-engine)
    first difference at code-unit offset 2246 (byte offset 2246): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MythoPsychology_logo02+*self:render:open` (offset=4996, exp=65960, act=12991)
  ```
  FAIL recapture-raw:MythoPsychology_logo02+*self:render:open (render-engine)
    first difference at code-unit offset 4996 (byte offset 4996): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:NCDD survey supports Promising Practices Report on Public Engagement+*self:render:content` (offset=2560, exp=75124, act=11592)
  ```
  FAIL recapture-raw:NCDD survey supports Promising Practices Report on Public Engagement+*self:render:content (render-engine)
    first difference at code-unit offset 2560 (byte offset 2560): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:New Associative Inquiry article 20100812+*self:render:content` (offset=2372, exp=67944, act=10758)
  ```
  FAIL recapture-raw:New Associative Inquiry article 20100812+*self:render:content (render-engine)
    first difference at code-unit offset 2372 (byte offset 2372): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:New Connection Ask+*self:render:content` (offset=2218, exp=61930, act=7079)
  ```
  FAIL recapture-raw:New Connection Ask+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:New Connection Ask+*self:render:open` (offset=4915, exp=64655, act=9804)
  ```
  FAIL recapture-raw:New Connection Ask+*self:render:open (render-engine)
    first difference at code-unit offset 4915 (byte offset 4915): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:New Culturesmith Facebook page+*self:render:content` (offset=2302, exp=65354, act=10448)
  ```
  FAIL recapture-raw:New Culturesmith Facebook page+*self:render:content (render-engine)
    first difference at code-unit offset 2302 (byte offset 2302): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Nonviolent Peaceforce about embed+*self:render:content` (offset=2318, exp=66042, act=13743)
  ```
  FAIL recapture-raw:Nonviolent Peaceforce about embed+*self:render:content (render-engine)
    first difference at code-unit offset 2318 (byte offset 2318): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:NorthBayAikidoGlossary+*self:render:content` (offset=2258, exp=63060, act=7189)
  ```
  FAIL recapture-raw:NorthBayAikidoGlossary+*self:render:content (render-engine)
    first difference at code-unit offset 2258 (byte offset 2258): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:NorthBayAikidoGlossaryEmbed+*self:render:content` (offset=2292, exp=64628, act=13553)
  ```
  FAIL recapture-raw:NorthBayAikidoGlossaryEmbed+*self:render:content (render-engine)
    first difference at code-unit offset 2292 (byte offset 2292): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Now is the time to join Golden Bears Aikido Club+*self:render:content` (offset=2420, exp=69944, act=10972)
  ```
  FAIL recapture-raw:Now is the time to join Golden Bears Aikido Club+*self:render:content (render-engine)
    first difference at code-unit offset 2420 (byte offset 2420): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_Liz+*self:render:content` (offset=2218, exp=62146, act=10089)
  ```
  FAIL recapture-raw:OAKzoo20100717_Liz+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_Liz+*self:render:open` (offset=4912, exp=64868, act=12811)
  ```
  FAIL recapture-raw:OAKzoo20100717_Liz+*self:render:open (render-engine)
    first difference at code-unit offset 4912 (byte offset 4912): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_Sunbear+*self:render:content` (offset=2246, exp=63182, act=10213)
  ```
  FAIL recapture-raw:OAKzoo20100717_Sunbear+*self:render:content (render-engine)
    first difference at code-unit offset 2246 (byte offset 2246): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_Sunbear+*self:render:open` (offset=4996, exp=65960, act=12991)
  ```
  FAIL recapture-raw:OAKzoo20100717_Sunbear+*self:render:open (render-engine)
    first difference at code-unit offset 4996 (byte offset 4996): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_SunbearKerr+*self:render:content` (offset=2278, exp=64254, act=10354)
  ```
  FAIL recapture-raw:OAKzoo20100717_SunbearKerr+*self:render:content (render-engine)
    first difference at code-unit offset 2278 (byte offset 2278): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_bat+*self:render:content` (offset=2218, exp=62146, act=10089)
  ```
  FAIL recapture-raw:OAKzoo20100717_bat+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717_bat+*self:render:open` (offset=4912, exp=64868, act=12811)
  ```
  FAIL recapture-raw:OAKzoo20100717_bat+*self:render:open (render-engine)
    first difference at code-unit offset 4912 (byte offset 4912): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717gallery+*self:render:content` (offset=2243, exp=62847, act=10177)
  ```
  FAIL recapture-raw:OAKzoo20100717gallery+*self:render:content (render-engine)
    first difference at code-unit offset 2243 (byte offset 2243): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OAKzoo20100717gallery+*self:render:open` (offset=4987, exp=65619, act=12949)
  ```
  FAIL recapture-raw:OAKzoo20100717gallery+*self:render:open (render-engine)
    first difference at code-unit offset 4987 (byte offset 4987): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3540+*self:render:content` (offset=2221, exp=62245, act=7092)
  ```
  FAIL recapture-raw:OR THXG 201011_3540+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3540+*self:render:open` (offset=4924, exp=64976, act=9823)
  ```
  FAIL recapture-raw:OR THXG 201011_3540+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3547+*self:render:content` (offset=2221, exp=62245, act=7092)
  ```
  FAIL recapture-raw:OR THXG 201011_3547+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3547+*self:render:open` (offset=4924, exp=64976, act=9823)
  ```
  FAIL recapture-raw:OR THXG 201011_3547+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3548+*self:render:content` (offset=2221, exp=62245, act=7092)
  ```
  FAIL recapture-raw:OR THXG 201011_3548+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3548+*self:render:open` (offset=4924, exp=64976, act=9823)
  ```
  FAIL recapture-raw:OR THXG 201011_3548+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3560+*self:render:content` (offset=2221, exp=62245, act=7092)
  ```
  FAIL recapture-raw:OR THXG 201011_3560+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3560+*self:render:open` (offset=4924, exp=64976, act=9823)
  ```
  FAIL recapture-raw:OR THXG 201011_3560+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011c1+*self:render:content` (offset=2200, exp=61474, act=7041)
  ```
  FAIL recapture-raw:OR THXG 201011c1+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011c1+*self:render:open` (offset=4861, exp=64163, act=9730)
  ```
  FAIL recapture-raw:OR THXG 201011c1+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011cc+*self:render:content` (offset=2200, exp=61474, act=7041)
  ```
  FAIL recapture-raw:OR THXG 201011cc+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011cc+*self:render:open` (offset=4861, exp=64163, act=9730)
  ```
  FAIL recapture-raw:OR THXG 201011cc+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Obama Tucson Memorial Speech video+*self:render:content` (offset=2325, exp=66303, act=13788)
  ```
  FAIL recapture-raw:Obama Tucson Memorial Speech video+*self:render:content (render-engine)
    first difference at code-unit offset 2325 (byte offset 2325): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PTP FAQ 1st draft+*self:render:content` (offset=2211, exp=61673, act=7062)
  ```
  FAIL recapture-raw:PTP FAQ 1st draft+*self:render:content (render-engine)
    first difference at code-unit offset 2211 (byte offset 2211): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PTP FAQ 1st draft+*self:render:open` (offset=4894, exp=64384, act=9773)
  ```
  FAIL recapture-raw:PTP FAQ 1st draft+*self:render:open (render-engine)
    first difference at code-unit offset 4894 (byte offset 4894): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Papers for Organization Studies - Social Movements, Civil Societies and Corporations+*self:render:content` (offset=2634, exp=88064, act=11928)
  ```
  FAIL recapture-raw:Papers for Organization Studies - Social Movements, Civil Societies and Corporations+*self:render:content (render-engine)
    first difference at code-unit offset 2634 (byte offset 2634): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paul Linden Kind Power video+*self:render:content` (offset=2283, exp=64737, act=13518)
  ```
  FAIL recapture-raw:Paul Linden Kind Power video+*self:render:content (render-engine)
    first difference at code-unit offset 2283 (byte offset 2283): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paul Linden demo+*self:render:content` (offset=2200, exp=61474, act=7041)
  ```
  FAIL recapture-raw:Paul Linden demo+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paul Linden demo+*self:render:open` (offset=4861, exp=64163, act=9730)
  ```
  FAIL recapture-raw:Paul Linden demo+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paul Rest - Aikido and Psychotherapy - Martial Artists Making a Difference+*self:render:content` (offset=2577, exp=84615, act=7948)
  ```
  FAIL recapture-raw:Paul Rest - Aikido and Psychotherapy - Martial Artists Making a Difference+*self:render:content (render-engine)
    first difference at code-unit offset 2577 (byte offset 2577): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paul Rest - Brandon WilliamsCraig - A Martial Artists Making a Difference+*self:render:content` (offset=2570, exp=84278, act=7931)
  ```
  FAIL recapture-raw:Paul Rest - Brandon WilliamsCraig - A Martial Artists Making a Difference+*self:render:content (render-engine)
    first difference at code-unit offset 2570 (byte offset 2570): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paula Craig dot com+*self:render:content` (offset=2220, exp=62388, act=13113)
  ```
  FAIL recapture-raw:Paula Craig dot com+*self:render:content (render-engine)
    first difference at code-unit offset 2220 (byte offset 2220): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Paula Craig dot com+*self:render:open` (offset=4921, exp=65117, act=15842)
  ```
  FAIL recapture-raw:Paula Craig dot com+*self:render:open (render-engine)
    first difference at code-unit offset 4921 (byte offset 4921): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Please pre-register+*self:render:content` (offset=2225, exp=66891, act=7096)
  ```
  FAIL recapture-raw:Please pre-register+*self:render:content (render-engine)
    first difference at code-unit offset 2225 (byte offset 2225): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Please pre-register+*self:render:open` (offset=4936, exp=69630, act=9835)
  ```
  FAIL recapture-raw:Please pre-register+*self:render:open (render-engine)
    first difference at code-unit offset 4936 (byte offset 4936): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Props to Aviv Sensei for inclusive aikido+*self:render:content` (offset=2375, exp=68167, act=10772)
  ```
  FAIL recapture-raw:Props to Aviv Sensei for inclusive aikido+*self:render:content (render-engine)
    first difference at code-unit offset 2375 (byte offset 2375): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Randori - Group Chaos+*self:render:content` (offset=2223, exp=67139, act=7084)
  ```
  FAIL recapture-raw:Randori - Group Chaos+*self:render:content (render-engine)
    first difference at code-unit offset 2223 (byte offset 2223): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Randori - Group Chaos+*self:render:open` (offset=4937, exp=69881, act=9826)
  ```
  FAIL recapture-raw:Randori - Group Chaos+*self:render:open (render-engine)
    first difference at code-unit offset 4937 (byte offset 4937): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Robert Frager Aikido in ITP curriculum video+*self:render:content` (offset=2395, exp=68913, act=14238)
  ```
  FAIL recapture-raw:Robert Frager Aikido in ITP curriculum video+*self:render:content (render-engine)
    first difference at code-unit offset 2395 (byte offset 2395): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SCT2010 responses by Next Person+*self:render:content` (offset=2312, exp=65642, act=10493)
  ```
  FAIL recapture-raw:SCT2010 responses by Next Person+*self:render:content (render-engine)
    first difference at code-unit offset 2312 (byte offset 2312): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Saving Lives is a Martial Art+*self:render:content` (offset=2287, exp=64689, act=7238)
  ```
  FAIL recapture-raw:Saving Lives is a Martial Art+*self:render:content (render-engine)
    first difference at code-unit offset 2287 (byte offset 2287): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Schizoid Playlist+*self:render:content` (offset=2211, exp=61673, act=7062)
  ```
  FAIL recapture-raw:Schizoid Playlist+*self:render:content (render-engine)
    first difference at code-unit offset 2211 (byte offset 2211): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Schizoid Playlist+*self:render:open` (offset=4894, exp=64384, act=9773)
  ```
  FAIL recapture-raw:Schizoid Playlist+*self:render:open (render-engine)
    first difference at code-unit offset 4894 (byte offset 4894): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:School_of_Peace-embed+*self:render:content` (offset=2234, exp=67294, act=13203)
  ```
  FAIL recapture-raw:School_of_Peace-embed+*self:render:content (render-engine)
    first difference at code-unit offset 2234 (byte offset 2234): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:School_of_Peace-embed+*self:render:open` (offset=4963, exp=70051, act=15960)
  ```
  FAIL recapture-raw:School_of_Peace-embed+*self:render:open (render-engine)
    first difference at code-unit offset 4963 (byte offset 4963): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Senseis Kayla Eric and Brandon at Aiki Expo 1 - 2002+*self:render:content` (offset=2435, exp=77187, act=14510)
  ```
  FAIL recapture-raw:Senseis Kayla Eric and Brandon at Aiki Expo 1 - 2002+*self:render:content (render-engine)
    first difference at code-unit offset 2435 (byte offset 2435): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Shift Peace Week 2010+*self:render:content` (offset=2239, exp=62701, act=7130)
  ```
  FAIL recapture-raw:Shift Peace Week 2010+*self:render:content (render-engine)
    first difference at code-unit offset 2239 (byte offset 2239): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Shift Peace Week 2010+*self:render:open` (offset=4978, exp=65468, act=9897)
  ```
  FAIL recapture-raw:Shift Peace Week 2010+*self:render:open (render-engine)
    first difference at code-unit offset 4978 (byte offset 4978): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ShusekaiComEmbed+*self:render:content` (offset=2207, exp=61681, act=13018)
  ```
  FAIL recapture-raw:ShusekaiComEmbed+*self:render:content (render-engine)
    first difference at code-unit offset 2207 (byte offset 2207): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:ShusekaiComEmbed+*self:render:open` (offset=4876, exp=64378, act=15715)
  ```
  FAIL recapture-raw:ShusekaiComEmbed+*self:render:open (render-engine)
    first difference at code-unit offset 4876 (byte offset 4876): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Summer Community Building Gathering 20100723-25+*self:render:content` (offset=2421, exp=76357, act=10975)
  ```
  FAIL recapture-raw:Summer Community Building Gathering 20100723-25+*self:render:content (render-engine)
    first difference at code-unit offset 2421 (byte offset 2421): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:TM HuffPost 20100802+*self:render:content` (offset=2231, exp=62687, act=13178)
  ```
  FAIL recapture-raw:TM HuffPost 20100802+*self:render:content (render-engine)
    first difference at code-unit offset 2231 (byte offset 2231): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:TM HuffPost 20100802+*self:render:open` (offset=4951, exp=65435, act=15926)
  ```
  FAIL recapture-raw:TM HuffPost 20100802+*self:render:open (render-engine)
    first difference at code-unit offset 4951 (byte offset 4951): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Target Aint People+*self:render:content` (offset=2213, exp=62127, act=13068)
  ```
  FAIL recapture-raw:Target Aint People+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Target Aint People+*self:render:open` (offset=4900, exp=64842, act=15783)
  ```
  FAIL recapture-raw:Target Aint People+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Thanks to Judge Walker+*self:render:content` (offset=2242, exp=63246, act=10183)
  ```
  FAIL recapture-raw:Thanks to Judge Walker+*self:render:content (render-engine)
    first difference at code-unit offset 2242 (byte offset 2242): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Thanks to Judge Walker+*self:render:open` (offset=4990, exp=66022, act=12959)
  ```
  FAIL recapture-raw:Thanks to Judge Walker+*self:render:open (render-engine)
    first difference at code-unit offset 4990 (byte offset 4990): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The Myth of Peace - Evidence+*self:render:content` (offset=2276, exp=69406, act=10336)
  ```
  FAIL recapture-raw:The Myth of Peace - Evidence+*self:render:content (render-engine)
    first difference at code-unit offset 2276 (byte offset 2276): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The Myth of Peace Acknowledgments+*self:render:content` (offset=2319, exp=65901, act=10524)
  ```
  FAIL recapture-raw:The Myth of Peace Acknowledgments+*self:render:content (render-engine)
    first difference at code-unit offset 2319 (byte offset 2319): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:TheArtofGettingUpAgain_embed+*self:render:content` (offset=2299, exp=64889, act=13598)
  ```
  FAIL recapture-raw:TheArtofGettingUpAgain_embed+*self:render:content (render-engine)
    first difference at code-unit offset 2299 (byte offset 2299): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Thomas Moore Redefining Education - Cultivating the Soul+*self:render:content` (offset=2465, exp=78759, act=11184)
  ```
  FAIL recapture-raw:Thomas Moore Redefining Education - Cultivating the Soul+*self:render:content (render-engine)
    first difference at code-unit offset 2465 (byte offset 2465): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Tracy Held-Potter+*self:render:content` (offset=2208, exp=66122, act=10042)
  ```
  FAIL recapture-raw:Tracy Held-Potter+*self:render:content (render-engine)
    first difference at code-unit offset 2208 (byte offset 2208): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Tracy Held-Potter+*self:render:open` (offset=4885, exp=68827, act=12747)
  ```
  FAIL recapture-raw:Tracy Held-Potter+*self:render:open (render-engine)
    first difference at code-unit offset 4885 (byte offset 4885): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Violence against nurses study 2009+*self:render:content` (offset=2321, exp=66015, act=7332)
  ```
  FAIL recapture-raw:Violence against nurses study 2009+*self:render:content (render-engine)
    first difference at code-unit offset 2321 (byte offset 2321): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WAGNSkype w Ethan20100726+*self:render:content` (offset=2271, exp=63901, act=10310)
  ```
  FAIL recapture-raw:WAGNSkype w Ethan20100726+*self:render:content (render-engine)
    first difference at code-unit offset 2271 (byte offset 2271): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WAGNSkype w Ethan20100727+*self:render:content` (offset=2271, exp=63901, act=10310)
  ```
  FAIL recapture-raw:WAGNSkype w Ethan20100727+*self:render:content (render-engine)
    first difference at code-unit offset 2271 (byte offset 2271): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WPA Dir Studies Job Description+*self:render:content` (offset=2301, exp=65203, act=7272)
  ```
  FAIL recapture-raw:WPA Dir Studies Job Description+*self:render:content (render-engine)
    first difference at code-unit offset 2301 (byte offset 2301): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:We Are Like These Things - Madeline Gleason+*self:render:content` (offset=2377, exp=74553, act=7458)
  ```
  FAIL recapture-raw:We Are Like These Things - Madeline Gleason+*self:render:content (render-engine)
    first difference at code-unit offset 2377 (byte offset 2377): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Whale of a story+*self:render:content` (offset=2200, exp=61474, act=7041)
  ```
  FAIL recapture-raw:Whale of a story+*self:render:content (render-engine)
    first difference at code-unit offset 2200 (byte offset 2200): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Whale of a story+*self:render:open` (offset=4861, exp=64163, act=9730)
  ```
  FAIL recapture-raw:Whale of a story+*self:render:open (render-engine)
    first difference at code-unit offset 4861 (byte offset 4861): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Why Aiki Peace Week?+*self:render:content` (offset=2226, exp=67192, act=7097)
  ```
  FAIL recapture-raw:Why Aiki Peace Week?+*self:render:content (render-engine)
    first difference at code-unit offset 2226 (byte offset 2226): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Why Aiki Peace Week?+*self:render:open` (offset=4941, exp=69935, act=9840)
  ```
  FAIL recapture-raw:Why Aiki Peace Week?+*self:render:open (render-engine)
    first difference at code-unit offset 4941 (byte offset 4941): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:World Peace Academy Switzerland+*self:render:content` (offset=2309, exp=65271, act=7300)
  ```
  FAIL recapture-raw:World Peace Academy Switzerland+*self:render:content (render-engine)
    first difference at code-unit offset 2309 (byte offset 2309): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:associative resonance image+*self:render:content` (offset=2281, exp=64383, act=10355)
  ```
  FAIL recapture-raw:associative resonance image+*self:render:content (render-engine)
    first difference at code-unit offset 2281 (byte offset 2281): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:death and bereavement+*self:render:content` (offset=2238, exp=62831, act=10159)
  ```
  FAIL recapture-raw:death and bereavement+*self:render:content (render-engine)
    first difference at code-unit offset 2238 (byte offset 2238): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:death and bereavement+*self:render:open` (offset=4975, exp=65596, act=12924)
  ```
  FAIL recapture-raw:death and bereavement+*self:render:open (render-engine)
    first difference at code-unit offset 4975 (byte offset 4975): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:masakatsu_agatsu_katsuhayabi+*self:render:content` (offset=2288, exp=64642, act=10386)
  ```
  FAIL recapture-raw:masakatsu_agatsu_katsuhayabi+*self:render:content (render-engine)
    first difference at code-unit offset 2288 (byte offset 2288): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:process arts for peace open workshop+*self:render:content` (offset=2340, exp=66678, act=10617)
  ```
  FAIL recapture-raw:process arts for peace open workshop+*self:render:content (render-engine)
    first difference at code-unit offset 2340 (byte offset 2340): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:self-destruction+*self:render:content` (offset=2203, exp=65780, act=10004)
  ```
  FAIL recapture-raw:self-destruction+*self:render:content (render-engine)
    first difference at code-unit offset 2203 (byte offset 2203): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:self-destruction+*self:render:open` (offset=4870, exp=68475, act=12699)
  ```
  FAIL recapture-raw:self-destruction+*self:render:open (render-engine)
    first difference at code-unit offset 4870 (byte offset 4870): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:the Playing in Sand Collectiv+*self:render:content` (offset=2295, exp=64757, act=7266)
  ```
  FAIL recapture-raw:the Playing in Sand Collectiv+*self:render:content (render-engine)
    first difference at code-unit offset 2295 (byte offset 2295): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:thought-leader_images+*self:render:content` (offset=2235, exp=67417, act=10152)
  ```
  FAIL recapture-raw:thought-leader_images+*self:render:content (render-engine)
    first difference at code-unit offset 2235 (byte offset 2235): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:thought-leader_images+*self:render:open` (offset=4969, exp=70179, act=12914)
  ```
  FAIL recapture-raw:thought-leader_images+*self:render:open (render-engine)
    first difference at code-unit offset 4969 (byte offset 4969): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:*create+*right:render:content` (offset=2374, exp=64967, act=9622)
  ```
  FAIL recapture-raw:*create+*right:render:content (render-engine)
    first difference at code-unit offset 2374 (byte offset 2374): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9607" dat...
  ```
- `recapture-raw:*create+*right:render:open` (offset=4931, exp=67552, act=12207)
  ```
  FAIL recapture-raw:*create+*right:render:open (render-engine)
    first difference at code-unit offset 4931 (byte offset 4931): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9607" dat...
  ```
- `recapture-raw:*delete+*right:render:content` (offset=2374, exp=64967, act=9622)
  ```
  FAIL recapture-raw:*delete+*right:render:content (render-engine)
    first difference at code-unit offset 2374 (byte offset 2374): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9619" dat...
  ```
- `recapture-raw:*delete+*right:render:open` (offset=4931, exp=67552, act=12207)
  ```
  FAIL recapture-raw:*delete+*right:render:open (render-engine)
    first difference at code-unit offset 4931 (byte offset 4931): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9619" dat...
  ```
- `recapture-raw:*read+*right:render:content` (offset=2356, exp=64587, act=9560)
  ```
  FAIL recapture-raw:*read+*right:render:content (render-engine)
    first difference at code-unit offset 2356 (byte offset 2356): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9611" dat...
  ```
- `recapture-raw:*read+*right:render:open` (offset=4885, exp=67144, act=12117)
  ```
  FAIL recapture-raw:*read+*right:render:open (render-engine)
    first difference at code-unit offset 4885 (byte offset 4885): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9611" dat...
  ```
- `recapture-raw:*read+*right+*content options:render:content` (offset=514, exp=545, act=557)
  ```
  FAIL recapture-raw:*read+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 514 (byte offset 514): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"extension_type":"User"}</div>
  ```
- `recapture-raw:*read+*right+*content options:render:open` (offset=3595, exp=3648, act=3660)
  ```
  FAIL recapture-raw:*read+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3595 (byte offset 3595): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:*update+*right:render:content` (offset=2374, exp=64967, act=9622)
  ```
  FAIL recapture-raw:*update+*right:render:content (render-engine)
    first difference at code-unit offset 2374 (byte offset 2374): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9615" dat...
  ```
- `recapture-raw:*update+*right:render:open` (offset=4931, exp=67552, act=12207)
  ```
  FAIL recapture-raw:*update+*right:render:open (render-engine)
    first difference at code-unit offset 4931 (byte offset 4931): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="9615" dat...
  ```
- `recapture-raw:20101125-28 vacation in Oregon+*self:render:content` (offset=2302, exp=70598, act=7283)
  ```
  FAIL recapture-raw:20101125-28 vacation in Oregon+*self:render:content (render-engine)
    first difference at code-unit offset 2302 (byte offset 2302): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Academic and Administrator cover and resume BW+*self:render:content` (offset=2409, exp=69133, act=7550)
  ```
  FAIL recapture-raw:Academic and Administrator cover and resume BW+*self:render:content (render-engine)
    first difference at code-unit offset 2409 (byte offset 2409): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Bulletin Board+*self:render:content` (offset=2225, exp=62187, act=7096)
  ```
  FAIL recapture-raw:Aiki Bulletin Board+*self:render:content (render-engine)
    first difference at code-unit offset 2225 (byte offset 2225): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Bulletin Board+*self:render:open` (offset=4936, exp=64926, act=9835)
  ```
  FAIL recapture-raw:Aiki Bulletin Board+*self:render:open (render-engine)
    first difference at code-unit offset 4936 (byte offset 4936): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido In The Schools Benefits+*self:render:content` (offset=2289, exp=65183, act=13568)
  ```
  FAIL recapture-raw:Aikido In The Schools Benefits+*self:render:content (render-engine)
    first difference at code-unit offset 2289 (byte offset 2289): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido Transforming Youth - Montreaux+*self:render:content` (offset=2334, exp=72230, act=13855)
  ```
  FAIL recapture-raw:Aikido Transforming Youth - Montreaux+*self:render:content (render-engine)
    first difference at code-unit offset 2334 (byte offset 2334): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido for Children+*self:render:content` (offset=2213, exp=62085, act=7054)
  ```
  FAIL recapture-raw:Aikido for Children+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido for Children+*self:render:open` (offset=4909, exp=64809, act=9778)
  ```
  FAIL recapture-raw:Aikido for Children+*self:render:open (render-engine)
    first difference at code-unit offset 4909 (byte offset 4909): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido for Seniors+*self:render:content` (offset=2214, exp=62016, act=10059)
  ```
  FAIL recapture-raw:Aikido for Seniors+*self:render:content (render-engine)
    first difference at code-unit offset 2214 (byte offset 2214): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido for Seniors+*self:render:open` (offset=4906, exp=64736, act=12779)
  ```
  FAIL recapture-raw:Aikido for Seniors+*self:render:open (render-engine)
    first difference at code-unit offset 4906 (byte offset 4906): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido in Education+*self:render:content` (offset=2225, exp=62187, act=7096)
  ```
  FAIL recapture-raw:Aikido in Education+*self:render:content (render-engine)
    first difference at code-unit offset 2225 (byte offset 2225): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido in Education+*self:render:open` (offset=4936, exp=64926, act=9835)
  ```
  FAIL recapture-raw:Aikido in Education+*self:render:open (render-engine)
    first difference at code-unit offset 4936 (byte offset 4936): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AikidoAge3YouTube+*self:render:content` (offset=2218, exp=61980, act=13083)
  ```
  FAIL recapture-raw:AikidoAge3YouTube+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:AikidoAge3YouTube+*self:render:open` (offset=4906, exp=64696, act=15799)
  ```
  FAIL recapture-raw:AikidoAge3YouTube+*self:render:open (render-engine)
    first difference at code-unit offset 4906 (byte offset 4906): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Arnold Mindell on communities+*self:render:content` (offset=2287, exp=64689, act=7238)
  ```
  FAIL recapture-raw:Arnold Mindell on communities+*self:render:content (render-engine)
    first difference at code-unit offset 2287 (byte offset 2287): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW 20110918-19+Narrative+*self:render:content` (offset=2261, exp=68745, act=10135)
  ```
  FAIL recapture-raw:BW 20110918-19+Narrative+*self:render:content (render-engine)
    first difference at code-unit offset 2261 (byte offset 2261): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW 20110918-19+Narrative+*self:render:open` (offset=2710, exp=71634, act=12369)
  ```
  FAIL recapture-raw:BW 20110918-19+Narrative+*self:render:open (render-engine)
    first difference at code-unit offset 2710 (byte offset 2710): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:BW 20110927+Narrative+*self:render:content` (offset=2239, exp=62953, act=10039)
  ```
  FAIL recapture-raw:BW 20110927+Narrative+*self:render:content (render-engine)
    first difference at code-unit offset 2239 (byte offset 2239): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW 20110927+Narrative+*self:render:open` (offset=2667, exp=65799, act=12243)
  ```
  FAIL recapture-raw:BW 20110927+Narrative+*self:render:open (render-engine)
    first difference at code-unit offset 2667 (byte offset 2667): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:BW 20110929+Narrative+*self:render:content` (offset=2239, exp=62953, act=10039)
  ```
  FAIL recapture-raw:BW 20110929+Narrative+*self:render:content (render-engine)
    first difference at code-unit offset 2239 (byte offset 2239): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW 20110929+Narrative+*self:render:open` (offset=2667, exp=65799, act=12243)
  ```
  FAIL recapture-raw:BW 20110929+Narrative+*self:render:open (render-engine)
    first difference at code-unit offset 2667 (byte offset 2667): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:BW Continuous To Do+*self:render:content` (offset=2221, exp=62153, act=7082)
  ```
  FAIL recapture-raw:BW Continuous To Do+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Continuous To Do+*self:render:open` (offset=4927, exp=64887, act=9816)
  ```
  FAIL recapture-raw:BW Continuous To Do+*self:render:open (render-engine)
    first difference at code-unit offset 4927 (byte offset 4927): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Teaching Philosophy+*self:render:content` (offset=2246, exp=62958, act=7147)
  ```
  FAIL recapture-raw:BW Teaching Philosophy+*self:render:content (render-engine)
    first difference at code-unit offset 2246 (byte offset 2246): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Teaching Philosophy+*self:render:open` (offset=4999, exp=65739, act=9928)
  ```
  FAIL recapture-raw:BW Teaching Philosophy+*self:render:open (render-engine)
    first difference at code-unit offset 4999 (byte offset 4999): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW_20100526_Culturesmith_WAGN_born+*self:render:content` (offset=2331, exp=65874, act=10507)
  ```
  FAIL recapture-raw:BW_20100526_Culturesmith_WAGN_born+*self:render:content (render-engine)
    first difference at code-unit offset 2331 (byte offset 2331): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Beware of the God+*self:render:content` (offset=2207, exp=61731, act=7058)
  ```
  FAIL recapture-raw:Beware of the God+*self:render:content (render-engine)
    first difference at code-unit offset 2207 (byte offset 2207): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Beware of the God+*self:render:open` (offset=4882, exp=64434, act=9761)
  ```
  FAIL recapture-raw:Beware of the God+*self:render:open (render-engine)
    first difference at code-unit offset 4882 (byte offset 4882): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bill - Michael - Facil Clase Centro Amar Bogotá 20100920+*self:render:content` (offset=2456, exp=79291, act=7674)
  ```
  FAIL recapture-raw:Bill - Michael - Facil Clase Centro Amar Bogotá 20100920+*self:render:content (render-engine)
    first difference at code-unit offset 2456 (byte offset 2463): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Billionaires Rule Our Schools embed+*self:render:content` (offset=2324, exp=66312, act=10564)
  ```
  FAIL recapture-raw:Billionaires Rule Our Schools embed+*self:render:content (render-engine)
    first difference at code-unit offset 2324 (byte offset 2324): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brandon WilliamsCraig Yodan Demonstration Sunset Cliffs Aikido+*self:render:content` (offset=2517, exp=73573, act=15028)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig Yodan Demonstration Sunset Cliffs Aikido+*self:render:content (render-engine)
    first difference at code-unit offset 2517 (byte offset 2517): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brandon WilliamsCraig Yodan Rehearsal Aikido of Berkeley+*self:render:content` (offset=2479, exp=72045, act=14778)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig Yodan Rehearsal Aikido of Berkeley+*self:render:content (render-engine)
    first difference at code-unit offset 2479 (byte offset 2479): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Buying Real Estate+*self:render:content` (offset=2218, exp=61930, act=7079)
  ```
  FAIL recapture-raw:Buying Real Estate+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Buying Real Estate+*self:render:open` (offset=4915, exp=64655, act=9804)
  ```
  FAIL recapture-raw:Buying Real Estate+*self:render:open (render-engine)
    first difference at code-unit offset 4915 (byte offset 4915): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Civility and Peace+*self:render:content` (offset=2217, exp=62054, act=10066)
  ```
  FAIL recapture-raw:Civility and Peace+*self:render:content (render-engine)
    first difference at code-unit offset 2217 (byte offset 2217): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Civility and Peace+*self:render:open` (offset=4912, exp=64777, act=12789)
  ```
  FAIL recapture-raw:Civility and Peace+*self:render:open (render-engine)
    first difference at code-unit offset 4912 (byte offset 4912): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Click on the right pointing triangle to open an embedded page+*self:render:content` (offset=2515, exp=73039, act=7806)
  ```
  FAIL recapture-raw:Click on the right pointing triangle to open an embedded page+*self:render:content (render-engine)
    first difference at code-unit offset 2515 (byte offset 2515): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Click on the triangle pointing down to close an embedded page+*self:render:content` (offset=2515, exp=73039, act=7806)
  ```
  FAIL recapture-raw:Click on the triangle pointing down to close an embedded page+*self:render:content (render-engine)
    first difference at code-unit offset 2515 (byte offset 2515): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Conflict Transformation org Board+*self:render:content` (offset=2318, exp=66042, act=13743)
  ```
  FAIL recapture-raw:Conflict Transformation org Board+*self:render:content (render-engine)
    first difference at code-unit offset 2318 (byte offset 2318): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Conversations with Huston Smith+*self:render:content` (offset=2305, exp=65374, act=10462)
  ```
  FAIL recapture-raw:Conversations with Huston Smith+*self:render:content (render-engine)
    first difference at code-unit offset 2305 (byte offset 2305): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Craig Zelizer Georgetown+*self:render:content` (offset=2255, exp=63693, act=13338)
  ```
  FAIL recapture-raw:Craig Zelizer Georgetown+*self:render:content (render-engine)
    first difference at code-unit offset 2255 (byte offset 2255): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Craig Zelizer Humor and Conflictology vol1iss2+*self:render:content` (offset=2409, exp=69133, act=7550)
  ```
  FAIL recapture-raw:Craig Zelizer Humor and Conflictology vol1iss2+*self:render:content (render-engine)
    first difference at code-unit offset 2409 (byte offset 2409): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Craig Zelizer LinkedIn+*self:render:content` (offset=2245, exp=63209, act=13268)
  ```
  FAIL recapture-raw:Craig Zelizer LinkedIn+*self:render:content (render-engine)
    first difference at code-unit offset 2245 (byte offset 2245): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Craig Zelizer LinkedIn+*self:render:open` (offset=4993, exp=65985, act=16044)
  ```
  FAIL recapture-raw:Craig Zelizer LinkedIn+*self:render:open (render-engine)
    first difference at code-unit offset 4993 (byte offset 4993): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Creating Bridges - Créer des Ponts Conference – Halifax Nova Scotia Oct 13-15 2010+*self:render:content` (offset=2634, exp=88599, act=11969)
  ```
  FAIL recapture-raw:Creating Bridges - Créer des Ponts Conference – Halifax Nova Scotia Oct 13-15 2010+*self:render:content (render-engine)
    first difference at code-unit offset 2634 (byte offset 2643): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:DLevineUChicFacultyPage+*self:render:content` (offset=2268, exp=63622, act=13393)
  ```
  FAIL recapture-raw:DLevineUChicFacultyPage+*self:render:content (render-engine)
    first difference at code-unit offset 2268 (byte offset 2268): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Daniel Siegel MD 20091018 TED video+*self:render:content` (offset=2332, exp=66564, act=13833)
  ```
  FAIL recapture-raw:Daniel Siegel MD 20091018 TED video+*self:render:content (render-engine)
    first difference at code-unit offset 2332 (byte offset 2332): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Deformities of the Old West+*self:render:content` (offset=2273, exp=64175, act=7204)
  ```
  FAIL recapture-raw:Deformities of the Old West+*self:render:content (render-engine)
    first difference at code-unit offset 2273 (byte offset 2273): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Don Levine - AikiCon syllabus aut 2010-final+*self:render:content` (offset=2387, exp=74965, act=7498)
  ```
  FAIL recapture-raw:Don Levine - AikiCon syllabus aut 2010-final+*self:render:content (render-engine)
    first difference at code-unit offset 2387 (byte offset 2387): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Don Levine - human rights and democratic procedures in Ethiopia - view point+*self:render:content` (offset=2591, exp=85289, act=7982)
  ```
  FAIL recapture-raw:Don Levine - human rights and democratic procedures in Ethiopia - view point+*self:render:content (render-engine)
    first difference at code-unit offset 2591 (byte offset 2591): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Don Levine - many dimensions of Aiki Extensions+*self:render:content` (offset=2396, exp=75874, act=7507)
  ```
  FAIL recapture-raw:Don Levine - many dimensions of Aiki Extensions+*self:render:content (render-engine)
    first difference at code-unit offset 2396 (byte offset 2396): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:EHBC Ggl Sprdsht Daily Log+*self:render:content` (offset=2269, exp=64053, act=10319)
  ```
  FAIL recapture-raw:EHBC Ggl Sprdsht Daily Log+*self:render:content (render-engine)
    first difference at code-unit offset 2269 (byte offset 2269): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:EH_HIAP_20110221_5min+*self:render:content` (offset=2234, exp=62910, act=13203)
  ```
  FAIL recapture-raw:EH_HIAP_20110221_5min+*self:render:content (render-engine)
    first difference at code-unit offset 2234 (byte offset 2234): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:EH_HIAP_20110221_5min+*self:render:open` (offset=4963, exp=65667, act=15960)
  ```
  FAIL recapture-raw:EH_HIAP_20110221_5min+*self:render:open (render-engine)
    first difference at code-unit offset 4963 (byte offset 4963): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Earth House Center+*self:render:content` (offset=2216, exp=62157, act=13053)
  ```
  FAIL recapture-raw:Earth House Center+*self:render:content (render-engine)
    first difference at code-unit offset 2216 (byte offset 2216): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Earth House Center+*self:render:open` (offset=4909, exp=64878, act=15774)
  ```
  FAIL recapture-raw:Earth House Center+*self:render:open (render-engine)
    first difference at code-unit offset 4909 (byte offset 4909): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Earth House staff+*self:render:content` (offset=2206, exp=61901, act=10040)
  ```
  FAIL recapture-raw:Earth House staff+*self:render:content (render-engine)
    first difference at code-unit offset 2206 (byte offset 2206): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Earth House staff+*self:render:open` (offset=4879, exp=64602, act=12741)
  ```
  FAIL recapture-raw:Earth House staff+*self:render:open (render-engine)
    first difference at code-unit offset 4879 (byte offset 4879): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Employment_applications+*self:render:content` (offset=2249, exp=63181, act=7150)
  ```
  FAIL recapture-raw:Employment_applications+*self:render:content (render-engine)
    first difference at code-unit offset 2249 (byte offset 2249): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Epworth Harvest of Gifts 2009+*self:render:content` (offset=2287, exp=64781, act=7248)
  ```
  FAIL recapture-raw:Epworth Harvest of Gifts 2009+*self:render:content (render-engine)
    first difference at code-unit offset 2287 (byte offset 2287): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Epworth quadri-montage+*self:render:content` (offset=2242, exp=67960, act=7143)
  ```
  FAIL recapture-raw:Epworth quadri-montage+*self:render:content (render-engine)
    first difference at code-unit offset 2242 (byte offset 2242): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Epworth quadri-montage+*self:render:open` (offset=4987, exp=70733, act=9916)
  ```
  FAIL recapture-raw:Epworth quadri-montage+*self:render:open (render-engine)
    first difference at code-unit offset 4987 (byte offset 4987): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Eva Broch Pierrakos - Pathwork 204+*self:render:content` (offset=2309, exp=71527, act=7300)
  ```
  FAIL recapture-raw:Eva Broch Pierrakos - Pathwork 204+*self:render:content (render-engine)
    first difference at code-unit offset 2309 (byte offset 2309): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:FAA Phonetic Alphabet and Morse Chart.svg+*self:render:content` (offset=2375, exp=74363, act=7466)
  ```
  FAIL recapture-raw:FAA Phonetic Alphabet and Morse Chart.svg+*self:render:content (render-engine)
    first difference at code-unit offset 2375 (byte offset 2375): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Facebook+*self:render:content` (offset=2213, exp=62127, act=13068)
  ```
  FAIL recapture-raw:Free Aiki Facebook+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Facebook+*self:render:open` (offset=4900, exp=64842, act=15783)
  ```
  FAIL recapture-raw:Free Aiki Facebook+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Google Group+*self:render:content` (offset=2241, exp=63171, act=13248)
  ```
  FAIL recapture-raw:Free Aiki Google Group+*self:render:content (render-engine)
    first difference at code-unit offset 2241 (byte offset 2241): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki Google Group+*self:render:open` (offset=4984, exp=65942, act=16019)
  ```
  FAIL recapture-raw:Free Aiki Google Group+*self:render:open (render-engine)
    first difference at code-unit offset 4984 (byte offset 4984): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Aiki and GBA Meetup+*self:render:content` (offset=2255, exp=63693, act=13338)
  ```
  FAIL recapture-raw:Free Aiki and GBA Meetup+*self:render:content (render-engine)
    first difference at code-unit offset 2255 (byte offset 2255): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Free Tech Support Worth Every Penny You Paid+*self:render:content` (offset=2400, exp=68612, act=7521)
  ```
  FAIL recapture-raw:Free Tech Support Worth Every Penny You Paid+*self:render:content (render-engine)
    first difference at code-unit offset 2400 (byte offset 2400): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA Google Group+*self:render:content` (offset=2199, exp=61605, act=12978)
  ```
  FAIL recapture-raw:GBA Google Group+*self:render:content (render-engine)
    first difference at code-unit offset 2199 (byte offset 2199): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA Google Group+*self:render:open` (offset=4858, exp=64292, act=15665)
  ```
  FAIL recapture-raw:GBA Google Group+*self:render:open (render-engine)
    first difference at code-unit offset 4858 (byte offset 4858): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA_20101123_3539+*self:render:content` (offset=2207, exp=61731, act=7058)
  ```
  FAIL recapture-raw:GBA_20101123_3539+*self:render:content (render-engine)
    first difference at code-unit offset 2207 (byte offset 2207): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA_20101123_3539+*self:render:open` (offset=4882, exp=64434, act=9761)
  ```
  FAIL recapture-raw:GBA_20101123_3539+*self:render:open (render-engine)
    first difference at code-unit offset 4882 (byte offset 4882): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Golden Bears Aikido 2011 Fundraiser flier+*self:render:content` (offset=2371, exp=67865, act=7452)
  ```
  FAIL recapture-raw:Golden Bears Aikido 2011 Fundraiser flier+*self:render:content (render-engine)
    first difference at code-unit offset 2371 (byte offset 2371): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Golden Bears Aikido Club Certificates+*self:render:content` (offset=2343, exp=66745, act=7374)
  ```
  FAIL recapture-raw:Golden Bears Aikido Club Certificates+*self:render:content (render-engine)
    first difference at code-unit offset 2343 (byte offset 2343): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:HakushuShintoHTML+*self:render:content` (offset=2214, exp=61942, act=13063)
  ```
  FAIL recapture-raw:HakushuShintoHTML+*self:render:content (render-engine)
    first difference at code-unit offset 2214 (byte offset 2214): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:HakushuShintoHTML+*self:render:open` (offset=4897, exp=64653, act=15774)
  ```
  FAIL recapture-raw:HakushuShintoHTML+*self:render:open (render-engine)
    first difference at code-unit offset 4897 (byte offset 4897): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:How does Free apply to Aiki+*self:render:content` (offset=2273, exp=64175, act=7204)
  ```
  FAIL recapture-raw:How does Free apply to Aiki+*self:render:content (render-engine)
    first difference at code-unit offset 2273 (byte offset 2273): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:How to Change Your Name In CA+*self:render:content` (offset=2295, exp=64757, act=7266)
  ```
  FAIL recapture-raw:How to Change Your Name In CA+*self:render:content (render-engine)
    first difference at code-unit offset 2295 (byte offset 2295): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Huston Smith website+*self:render:content` (offset=2232, exp=62687, act=13163)
  ```
  FAIL recapture-raw:Huston Smith website+*self:render:content (render-engine)
    first difference at code-unit offset 2232 (byte offset 2232): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Huston Smith website+*self:render:open` (offset=4957, exp=65440, act=15916)
  ```
  FAIL recapture-raw:Huston Smith website+*self:render:open (render-engine)
    first difference at code-unit offset 4957 (byte offset 4957): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:IMC Montessori Benefits+*self:render:content` (offset=2244, exp=63394, act=13273)
  ```
  FAIL recapture-raw:IMC Montessori Benefits+*self:render:content (render-engine)
    first difference at code-unit offset 2244 (byte offset 2244): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:IMC Montessori Benefits+*self:render:open` (offset=4996, exp=66174, act=16053)
  ```
  FAIL recapture-raw:IMC Montessori Benefits+*self:render:open (render-engine)
    first difference at code-unit offset 4996 (byte offset 4996): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:In-school Conflict Training+*self:render:content` (offset=2281, exp=69587, act=7232)
  ```
  FAIL recapture-raw:In-school Conflict Training+*self:render:content (render-engine)
    first difference at code-unit offset 2281 (byte offset 2281): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Inclusion to edit+*self:render:content` (offset=2211, exp=61673, act=7062)
  ```
  FAIL recapture-raw:Inclusion to edit+*self:render:content (render-engine)
    first difference at code-unit offset 2211 (byte offset 2211): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Inclusion to edit+*self:render:open` (offset=4894, exp=64384, act=9773)
  ```
  FAIL recapture-raw:Inclusion to edit+*self:render:open (render-engine)
    first difference at code-unit offset 4894 (byte offset 4894): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:International Peace and Conflict org+*self:render:content` (offset=2339, exp=66825, act=13878)
  ```
  FAIL recapture-raw:International Peace and Conflict org+*self:render:content (render-engine)
    first difference at code-unit offset 2339 (byte offset 2339): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Jim Wallis - Civility Pledge+*self:render:content` (offset=2272, exp=69498, act=7203)
  ```
  FAIL recapture-raw:Jim Wallis - Civility Pledge+*self:render:content (render-engine)
    first difference at code-unit offset 2272 (byte offset 2272): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Joosten - Nonviolence and the Child+*self:render:content` (offset=2320, exp=71564, act=13765)
  ```
  FAIL recapture-raw:Joosten - Nonviolence and the Child+*self:render:content (render-engine)
    first difference at code-unit offset 2320 (byte offset 2320): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Journal of Conflictology uoc edu+*self:render:content` (offset=2311, exp=65781, act=13698)
  ```
  FAIL recapture-raw:Journal of Conflictology uoc edu+*self:render:content (render-engine)
    first difference at code-unit offset 2311 (byte offset 2311): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ken Carlile Fbook Question+*self:render:content` (offset=2274, exp=63986, act=7215)
  ```
  FAIL recapture-raw:Ken Carlile Fbook Question+*self:render:content (render-engine)
    first difference at code-unit offset 2274 (byte offset 2274): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Kids Aikido and Arts Summer Camp+*self:render:content` (offset=2303, exp=65705, act=13658)
  ```
  FAIL recapture-raw:Kids Aikido and Arts Summer Camp+*self:render:content (render-engine)
    first difference at code-unit offset 2303 (byte offset 2303): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Klickstein continues+*self:render:content` (offset=2232, exp=62426, act=7103)
  ```
  FAIL recapture-raw:Klickstein continues+*self:render:content (render-engine)
    first difference at code-unit offset 2232 (byte offset 2232): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Klickstein continues+*self:render:open` (offset=4960, exp=65182, act=9859)
  ```
  FAIL recapture-raw:Klickstein continues+*self:render:open (render-engine)
    first difference at code-unit offset 4960 (byte offset 4960): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Klickstein continues+discussion+*self:render:content` (offset=2305, exp=65440, act=13414)
  ```
  FAIL recapture-raw:Klickstein continues+discussion+*self:render:content (render-engine)
    first difference at code-unit offset 2305 (byte offset 2305): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Klickstein continues+discussion+*self:render:open` (offset=2802, exp=68421, act=15715)
  ```
  FAIL recapture-raw:Klickstein continues+discussion+*self:render:open (render-engine)
    first difference at code-unit offset 2802 (byte offset 2802): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:LSD research video+*self:render:content` (offset=2213, exp=61937, act=7074)
  ```
  FAIL recapture-raw:LSD research video+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:LSD research video+*self:render:open` (offset=4900, exp=64652, act=9789)
  ```
  FAIL recapture-raw:LSD research video+*self:render:open (render-engine)
    first difference at code-unit offset 4900 (byte offset 4900): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv - similar projects+*self:render:content` (offset=2234, exp=67510, act=7115)
  ```
  FAIL recapture-raw:MNv - similar projects+*self:render:content (render-engine)
    first difference at code-unit offset 2234 (byte offset 2234): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv - similar projects+*self:render:open` (offset=4967, exp=70271, act=9876)
  ```
  FAIL recapture-raw:MNv - similar projects+*self:render:open (render-engine)
    first difference at code-unit offset 4967 (byte offset 4967): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Mailman Email commands quick reference+*self:render:content` (offset=2354, exp=67036, act=7405)
  ```
  FAIL recapture-raw:Mailman Email commands quick reference+*self:render:content (render-engine)
    first difference at code-unit offset 2354 (byte offset 2354): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Martial Nonviolence Cultural Resources+*self:render:content` (offset=2354, exp=67036, act=7405)
  ```
  FAIL recapture-raw:Martial Nonviolence Cultural Resources+*self:render:content (render-engine)
    first difference at code-unit offset 2354 (byte offset 2354): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Martially Nonviolent Education+*self:render:content` (offset=2302, exp=65014, act=7283)
  ```
  FAIL recapture-raw:Martially Nonviolent Education+*self:render:content (render-engine)
    first difference at code-unit offset 2302 (byte offset 2302): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Matching VanZilla TShirts+*self:render:content` (offset=2267, exp=63821, act=7208)
  ```
  FAIL recapture-raw:Matching VanZilla TShirts+*self:render:content (render-engine)
    first difference at code-unit offset 2267 (byte offset 2267): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Metashamanism links+*self:render:content` (offset=2221, exp=62153, act=7082)
  ```
  FAIL recapture-raw:Metashamanism links+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Metashamanism links+*self:render:open` (offset=4927, exp=64887, act=9816)
  ```
  FAIL recapture-raw:Metashamanism links+*self:render:open (render-engine)
    first difference at code-unit offset 4927 (byte offset 4927): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Mitsugi Saotome - God in Nature and Symbolism - Aikido+*self:render:content` (offset=2441, exp=77499, act=14552)
  ```
  FAIL recapture-raw:Mitsugi Saotome - God in Nature and Symbolism - Aikido+*self:render:content (render-engine)
    first difference at code-unit offset 2441 (byte offset 2441): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Montessori - A Remedy for War Thoughts on Peace and Education+*self:render:content` (offset=2498, exp=80184, act=14915)
  ```
  FAIL recapture-raw:Montessori - A Remedy for War Thoughts on Peace and Education+*self:render:content (render-engine)
    first difference at code-unit offset 2498 (byte offset 2498): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Montessori Conflict Training+*self:render:content` (offset=2288, exp=64500, act=7249)
  ```
  FAIL recapture-raw:Montessori Conflict Training+*self:render:content (render-engine)
    first difference at code-unit offset 2288 (byte offset 2288): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Montessori-amiorg_UNDecadePeace+*self:render:content` (offset=2312, exp=70700, act=13693)
  ```
  FAIL recapture-raw:Montessori-amiorg_UNDecadePeace+*self:render:content (render-engine)
    first difference at code-unit offset 2312 (byte offset 2312): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula - PCkidsPPsingXmas2003+*self:render:content` (offset=2301, exp=70669, act=7292)
  ```
  FAIL recapture-raw:Ms Paula - PCkidsPPsingXmas2003+*self:render:content (render-engine)
    first difference at code-unit offset 2301 (byte offset 2301): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Juice Plus+*self:render:content` (offset=2217, exp=62119, act=7068)
  ```
  FAIL recapture-raw:Ms Paula Juice Plus+*self:render:content (render-engine)
    first difference at code-unit offset 2217 (byte offset 2217): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Juice Plus+*self:render:open` (offset=4918, exp=64848, act=9797)
  ```
  FAIL recapture-raw:Ms Paula Juice Plus+*self:render:open (render-engine)
    first difference at code-unit offset 4918 (byte offset 4918): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ms Paula Performer Vocalist+*self:render:content` (offset=2272, exp=64276, act=10333)
  ```
  FAIL recapture-raw:Ms Paula Performer Vocalist+*self:render:content (render-engine)
    first difference at code-unit offset 2272 (byte offset 2272): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Mythunderstandings+*self:render:content` (offset=2213, exp=62018, act=10049)
  ```
  FAIL recapture-raw:Mythunderstandings+*self:render:content (render-engine)
    first difference at code-unit offset 2213 (byte offset 2213): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Mythunderstandings+*self:render:open` (offset=4903, exp=64736, act=12767)
  ```
  FAIL recapture-raw:Mythunderstandings+*self:render:open (render-engine)
    first difference at code-unit offset 4903 (byte offset 4903): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Nekhbet wikipedia+*self:render:content` (offset=2210, exp=61904, act=13043)
  ```
  FAIL recapture-raw:Nekhbet wikipedia+*self:render:content (render-engine)
    first difference at code-unit offset 2210 (byte offset 2210): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Nekhbet wikipedia+*self:render:open` (offset=4888, exp=64610, act=15749)
  ```
  FAIL recapture-raw:Nekhbet wikipedia+*self:render:open (render-engine)
    first difference at code-unit offset 4888 (byte offset 4888): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Nuclear Explosions 1945-1998 video+*self:render:content` (offset=2321, exp=71585, act=13768)
  ```
  FAIL recapture-raw:Nuclear Explosions 1945-1998 video+*self:render:content (render-engine)
    first difference at code-unit offset 2321 (byte offset 2321): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3561+*self:render:content` (offset=2221, exp=62245, act=7092)
  ```
  FAIL recapture-raw:OR THXG 201011_3561+*self:render:content (render-engine)
    first difference at code-unit offset 2221 (byte offset 2221): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:OR THXG 201011_3561+*self:render:open` (offset=4924, exp=64976, act=9823)
  ```
  FAIL recapture-raw:OR THXG 201011_3561+*self:render:open (render-engine)
    first difference at code-unit offset 4924 (byte offset 4924): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Open Source Aikido Lab+*self:render:content` (offset=2244, exp=63201, act=13233)
  ```
  FAIL recapture-raw:Open Source Aikido Lab+*self:render:content (render-engine)
    first difference at code-unit offset 2244 (byte offset 2244): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Open Source Aikido Lab+*self:render:open` (offset=4993, exp=65978, act=16010)
  ```
  FAIL recapture-raw:Open Source Aikido Lab+*self:render:open (render-engine)
    first difference at code-unit offset 4993 (byte offset 4993): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PLAikiRecoveryPeaceHTML+*self:render:content` (offset=2264, exp=63584, act=13373)
  ```
  FAIL recapture-raw:PLAikiRecoveryPeaceHTML+*self:render:content (render-engine)
    first difference at code-unit offset 2264 (byte offset 2264): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Pathwork Study Circle w Rosa Naparstek+*self:render:content` (offset=2353, exp=67077, act=7414)
  ```
  FAIL recapture-raw:Pathwork Study Circle w Rosa Naparstek+*self:render:content (render-engine)
    first difference at code-unit offset 2353 (byte offset 2353): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Pavel-EarthHouse2011-02+*self:render:content` (offset=2252, exp=68280, act=7173)
  ```
  FAIL recapture-raw:Pavel-EarthHouse2011-02+*self:render:content (render-engine)
    first difference at code-unit offset 2252 (byte offset 2252): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Pavel-EarthHouse2011-02v2+*self:render:content` (offset=2266, exp=68954, act=7207)
  ```
  FAIL recapture-raw:Pavel-EarthHouse2011-02v2+*self:render:content (render-engine)
    first difference at code-unit offset 2266 (byte offset 2266): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PaxPrxFbookLike+*self:render:content` (offset=2204, exp=61458, act=12993)
  ```
  FAIL recapture-raw:PaxPrxFbookLike+*self:render:content (render-engine)
    first difference at code-unit offset 2204 (byte offset 2204): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PaxPrxFbookLike+*self:render:open` (offset=4864, exp=64146, act=15681)
  ```
  FAIL recapture-raw:PaxPrxFbookLike+*self:render:open (render-engine)
    first difference at code-unit offset 4864 (byte offset 4864): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Peace Practices Introduction+*self:render:content` (offset=2284, exp=64466, act=7235)
  ```
  FAIL recapture-raw:Peace Practices Introduction+*self:render:content (render-engine)
    first difference at code-unit offset 2284 (byte offset 2284): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PeopleGreen Described+*self:render:content` (offset=2238, exp=62948, act=13223)
  ```
  FAIL recapture-raw:PeopleGreen Described+*self:render:content (render-engine)
    first difference at code-unit offset 2238 (byte offset 2238): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:PeopleGreen Described+*self:render:open` (offset=4972, exp=65710, act=15985)
  ```
  FAIL recapture-raw:PeopleGreen Described+*self:render:open (render-engine)
    first difference at code-unit offset 4972 (byte offset 4972): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Professional Materials+*self:render:content` (offset=2242, exp=63052, act=10183)
  ```
  FAIL recapture-raw:Professional Materials+*self:render:content (render-engine)
    first difference at code-unit offset 2242 (byte offset 2242): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Professional Materials+*self:render:open` (offset=4990, exp=65828, act=12959)
  ```
  FAIL recapture-raw:Professional Materials+*self:render:open (render-engine)
    first difference at code-unit offset 4990 (byte offset 4990): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RVW 20110528 birth_4442cr+*self:render:content` (offset=2263, exp=63787, act=7194)
  ```
  FAIL recapture-raw:RVW 20110528 birth_4442cr+*self:render:content (render-engine)
    first difference at code-unit offset 2263 (byte offset 2263): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RVW HS LW 20110703+*self:render:content` (offset=2210, exp=61954, act=7061)
  ```
  FAIL recapture-raw:RVW HS LW 20110703+*self:render:content (render-engine)
    first difference at code-unit offset 2210 (byte offset 2210): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RVW HS LW 20110703+*self:render:open` (offset=4894, exp=64666, act=9773)
  ```
  FAIL recapture-raw:RVW HS LW 20110703+*self:render:open (render-engine)
    first difference at code-unit offset 4894 (byte offset 4894): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Robert Frager and Pegge Bernecker +*self:render:content` (offset=2318, exp=66042, act=13743)
  ```
  FAIL recapture-raw:Robert Frager and Pegge Bernecker +*self:render:content (render-engine)
    first difference at code-unit offset 2318 (byte offset 2318): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Rosa Naparstek - Reach f+*self:render:content` (offset=2244, exp=68242, act=7145)
  ```
  FAIL recapture-raw:Rosa Naparstek - Reach f+*self:render:content (render-engine)
    first difference at code-unit offset 2244 (byte offset 2244): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Rosa Naparstek - Reach f+*self:render:open` (offset=4997, exp=71023, act=9926)
  ```
  FAIL recapture-raw:Rosa Naparstek - Reach f+*self:render:open (render-engine)
    first difference at code-unit offset 4997 (byte offset 4997): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Rosa Naparstek Introductory Meeting Pathwork Lecture Study Circle+*self:render:content` (offset=2547, exp=74009, act=7878)
  ```
  FAIL recapture-raw:Rosa Naparstek Introductory Meeting Pathwork Lecture Study Circle+*self:render:content (render-engine)
    first difference at code-unit offset 2547 (byte offset 2547): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SAITO 1973-6 Body techniques part 2+*self:render:content` (offset=2328, exp=71918, act=13813)
  ```
  FAIL recapture-raw:SAITO 1973-6 Body techniques part 2+*self:render:content (render-engine)
    first difference at code-unit offset 2328 (byte offset 2328): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SFEx-GBA20110217embed+*self:render:content` (offset=2238, exp=67332, act=13223)
  ```
  FAIL recapture-raw:SFEx-GBA20110217embed+*self:render:content (render-engine)
    first difference at code-unit offset 2238 (byte offset 2238): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SFEx-GBA20110217embed+*self:render:open` (offset=4972, exp=70094, act=15985)
  ```
  FAIL recapture-raw:SFEx-GBA20110217embed+*self:render:open (render-engine)
    first difference at code-unit offset 4972 (byte offset 4972): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SFEx-GBA20110217image+*self:render:content` (offset=2239, exp=67657, act=7140)
  ```
  FAIL recapture-raw:SFEx-GBA20110217image+*self:render:content (render-engine)
    first difference at code-unit offset 2239 (byte offset 2239): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SFEx-GBA20110217image+*self:render:open` (offset=4975, exp=70421, act=9904)
  ```
  FAIL recapture-raw:SFEx-GBA20110217image+*self:render:open (render-engine)
    first difference at code-unit offset 4975 (byte offset 4975): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SFEx-GBA20110217pdf+*self:render:content` (offset=2224, exp=66932, act=7105)
  ```
  FAIL recapture-raw:SFEx-GBA20110217pdf+*self:render:content (render-engine)
    first difference at code-unit offset 2224 (byte offset 2224): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SFEx-GBA20110217pdf+*self:render:open` (offset=4930, exp=69666, act=9839)
  ```
  FAIL recapture-raw:SFEx-GBA20110217pdf+*self:render:open (render-engine)
    first difference at code-unit offset 4930 (byte offset 4930): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Seabrook schools celebrate nonviolence+*self:render:content` (offset=2349, exp=67309, act=13948)
  ```
  FAIL recapture-raw:Seabrook schools celebrate nonviolence+*self:render:content (render-engine)
    first difference at code-unit offset 2349 (byte offset 2349): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The End of Awe by Maureen Dowd - NYTimes:render:open` (offset=3512, exp=21945, act=28208)
  ```
  FAIL recapture-raw:The End of Awe by Maureen Dowd - NYTimes:render:open (render-engine)
    first difference at code-unit offset 3512 (byte offset 3512): expected "+" but got "T"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:The Future of Aikido PayPal Registration+*self:render:content` (offset=2371, exp=67907, act=14078)
  ```
  FAIL recapture-raw:The Future of Aikido PayPal Registration+*self:render:content (render-engine)
    first difference at code-unit offset 2371 (byte offset 2371): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The Impossible Dream+*self:render:content` (offset=2227, exp=62649, act=13158)
  ```
  FAIL recapture-raw:The Impossible Dream+*self:render:content (render-engine)
    first difference at code-unit offset 2227 (byte offset 2227): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:The Impossible Dream+*self:render:open` (offset=4942, exp=65392, act=15901)
  ```
  FAIL recapture-raw:The Impossible Dream+*self:render:open (render-engine)
    first difference at code-unit offset 4942 (byte offset 4942): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:UChicago Magazine Article - Don Levine+*self:render:content` (offset=2345, exp=72601, act=13920)
  ```
  FAIL recapture-raw:UChicago Magazine Article - Don Levine+*self:render:content (render-engine)
    first difference at code-unit offset 2345 (byte offset 2345): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:UChicagoAikidoClubEmbed+*self:render:content` (offset=2264, exp=63584, act=13373)
  ```
  FAIL recapture-raw:UChicagoAikidoClubEmbed+*self:render:content (render-engine)
    first difference at code-unit offset 2264 (byte offset 2264): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:University of Chicago Aikido+*self:render:content` (offset=2288, exp=64500, act=7249)
  ```
  FAIL recapture-raw:University of Chicago Aikido+*self:render:content (render-engine)
    first difference at code-unit offset 2288 (byte offset 2288): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Waging Peace at Williams 2011+*self:render:content` (offset=2287, exp=64781, act=7248)
  ```
  FAIL recapture-raw:Waging Peace at Williams 2011+*self:render:content (render-engine)
    first difference at code-unit offset 2287 (byte offset 2287): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:White Shamans and Plastic Medicine Men+*self:render:content` (offset=2349, exp=67309, act=13948)
  ```
  FAIL recapture-raw:White Shamans and Plastic Medicine Men+*self:render:content (render-engine)
    first difference at code-unit offset 2349 (byte offset 2349): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Wikipedia - Empiricism+*self:render:content` (offset=2233, exp=67273, act=13200)
  ```
  FAIL recapture-raw:Wikipedia - Empiricism+*self:render:content (render-engine)
    first difference at code-unit offset 2233 (byte offset 2233): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Wikipedia - Empiricism+*self:render:open` (offset=4961, exp=70029, act=15956)
  ```
  FAIL recapture-raw:Wikipedia - Empiricism+*self:render:open (render-engine)
    first difference at code-unit offset 4961 (byte offset 4961): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Wildcat Canyon - Sphinx Grill_4047med+*self:render:content` (offset=2335, exp=72623, act=7366)
  ```
  FAIL recapture-raw:Wildcat Canyon - Sphinx Grill_4047med+*self:render:content (render-engine)
    first difference at code-unit offset 2335 (byte offset 2335): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Wildcat Canyon Regional Park+*self:render:content` (offset=2284, exp=64765, act=13501)
  ```
  FAIL recapture-raw:Wildcat Canyon Regional Park+*self:render:content (render-engine)
    first difference at code-unit offset 2284 (byte offset 2284): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WilliamsCraig Family+*self:render:content` (offset=2227, exp=62678, act=10133)
  ```
  FAIL recapture-raw:WilliamsCraig Family+*self:render:content (render-engine)
    first difference at code-unit offset 2227 (byte offset 2227): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WilliamsCraig Family+*self:render:open` (offset=4942, exp=65421, act=12876)
  ```
  FAIL recapture-raw:WilliamsCraig Family+*self:render:open (render-engine)
    first difference at code-unit offset 4942 (byte offset 4942): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WilliamsCraig Library+*self:render:content` (offset=2239, exp=62701, act=7130)
  ```
  FAIL recapture-raw:WilliamsCraig Library+*self:render:content (render-engine)
    first difference at code-unit offset 2239 (byte offset 2239): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:WilliamsCraig Library+*self:render:open` (offset=4978, exp=65468, act=9897)
  ```
  FAIL recapture-raw:WilliamsCraig Library+*self:render:open (render-engine)
    first difference at code-unit offset 4978 (byte offset 4978): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:bdwilliamscraig-layout+*self:render:content` (offset=2243, exp=67731, act=10197)
  ```
  FAIL recapture-raw:bdwilliamscraig-layout+*self:render:content (render-engine)
    first difference at code-unit offset 2243 (byte offset 2243): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:bdwilliamscraig-layout+*self:render:open` (offset=4990, exp=70506, act=12972)
  ```
  FAIL recapture-raw:bdwilliamscraig-layout+*self:render:open (render-engine)
    first difference at code-unit offset 4990 (byte offset 4990): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:metahsmanism links on delicious+*self:render:content` (offset=2296, exp=65444, act=13613)
  ```
  FAIL recapture-raw:metahsmanism links on delicious+*self:render:content (render-engine)
    first difference at code-unit offset 2296 (byte offset 2296): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:racism+case in point+brown skinned intruder 201109+*self:render:content` (offset=2442, exp=70085, act=7623)
  ```
  FAIL recapture-raw:racism+case in point+brown skinned intruder 201109+*self:render:content (render-engine)
    first difference at code-unit offset 2442 (byte offset 2442): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:wiktionary - Religion+*self:render:content` (offset=2222, exp=66902, act=13135)
  ```
  FAIL recapture-raw:wiktionary - Religion+*self:render:content (render-engine)
    first difference at code-unit offset 2222 (byte offset 2222): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:wiktionary - Religion+*self:render:open` (offset=4931, exp=69639, act=15872)
  ```
  FAIL recapture-raw:wiktionary - Religion+*self:render:open (render-engine)
    first difference at code-unit offset 4931 (byte offset 4931): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:wildcat on ebparks dot org+*self:render:content` (offset=2265, exp=64177, act=13408)
  ```
  FAIL recapture-raw:wildcat on ebparks dot org+*self:render:content (render-engine)
    first difference at code-unit offset 2265 (byte offset 2265): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW 20111125-27+Thoughts+historical truth+*self:render:content` (offset=2369, exp=74481, act=10627)
  ```
  FAIL recapture-raw:BW 20111125-27+Thoughts+historical truth+*self:render:content (render-engine)
    first difference at code-unit offset 2369 (byte offset 2369): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brenner and Zacks - Why Walking through a Doorway Makes You Forget +Associations+tags:render:open` (offset=3386, exp=9235, act=8425)
  ```
  FAIL recapture-raw:Brenner and Zacks - Why Walking through a Doorway Makes You Forget +Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3386 (byte offset 3386): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+Participant(s):render:open` (offset=55, exp=6120, act=5368)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+Participant(s):render:open (render-engine)
    first difference at code-unit offset 55 (byte offset 55): expected "s" but got "-"
    expected excerpt: ...="golden_bear_aikido_at_uc_berkeley-participant_s-open-view" class="card-slot open-view ALL ALL_...
  ```
- `recapture-raw:Joshua Holland - 10 Fun Facts About the Top 1 Percent+Associations+tags:render:open` (offset=3209, exp=6636, act=5866)
  ```
  FAIL recapture-raw:Joshua Holland - 10 Fun Facts About the Top 1 Percent+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3209 (byte offset 3209): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Lance Giroux - The Ronin Post 201112 - Nidan+Associations+tags:render:open` (offset=3068, exp=13483, act=12763)
  ```
  FAIL recapture-raw:Lance Giroux - The Ronin Post 201112 - Nidan+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3068 (byte offset 3068): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Lift Every Voice and Sing - Lyrics+discussion:render:open` (offset=3644, exp=3884, act=3741)
  ```
  FAIL recapture-raw:Lift Every Voice and Sing - Lyrics+discussion:render:open (render-engine)
    first difference at code-unit offset 3644 (byte offset 3644): expected "<" but got "["
    expected excerpt: ...hole church to sing at my funeral. The other is <a class="known-card" href="/How_Can_I_Keep_From...
  ```
- `recapture-raw:Michael Ventura - Letters at 3AM Remembering James Hillman+Associations+tags:render:open` (offset=3279, exp=9007, act=8217)
  ```
  FAIL recapture-raw:Michael Ventura - Letters at 3AM Remembering James Hillman+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3279 (byte offset 3279): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Nirmala Nataraj - The Crane and the Crocodile explores depression+Associations+tags:render:open` (offset=3377, exp=4628, act=3810)
  ```
  FAIL recapture-raw:Nirmala Nataraj - The Crane and the Crocodile explores depression+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3377 (byte offset 3377): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Occupy Process Arts+*self:render:content` (offset=2222, exp=62154, act=7083)
  ```
  FAIL recapture-raw:Occupy Process Arts+*self:render:content (render-engine)
    first difference at code-unit offset 2222 (byte offset 2222): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Occupy Process Arts+*self:render:open` (offset=4929, exp=64889, act=9818)
  ```
  FAIL recapture-raw:Occupy Process Arts+*self:render:open (render-engine)
    first difference at code-unit offset 4929 (byte offset 4929): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Occupy Wall Street - First Officical Statement+*self:render:content` (offset=2400, exp=75608, act=7521)
  ```
  FAIL recapture-raw:Occupy Wall Street - First Officical Statement+*self:render:content (render-engine)
    first difference at code-unit offset 2400 (byte offset 2400): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Occupy Wall Street - First Officical Statement+Associations+tags:render:open` (offset=3116, exp=4411, act=3667)
  ```
  FAIL recapture-raw:Occupy Wall Street - First Officical Statement+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3116 (byte offset 3116): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Project Portion+*type:render:content` (offset=2197, exp=61171, act=7028)
  ```
  FAIL recapture-raw:Project Portion+*type:render:content (render-engine)
    first difference at code-unit offset 2197 (byte offset 2197): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Project Portion+*type:render:open` (offset=4851, exp=63853, act=9710)
  ```
  FAIL recapture-raw:Project Portion+*type:render:open (render-engine)
    first difference at code-unit offset 4851 (byte offset 4851): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RichText+Brandon notes+*type plus right:render:content` (offset=2340, exp=65775, act=10438)
  ```
  FAIL recapture-raw:RichText+Brandon notes+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2340 (byte offset 2340): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RichText+Brandon notes+*type plus right:render:open` (offset=2871, exp=68825, act=12779)
  ```
  FAIL recapture-raw:RichText+Brandon notes+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2871 (byte offset 2871): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:RichText+GBA+*type plus right:render:content` (offset=2274, exp=62967, act=7185)
  ```
  FAIL recapture-raw:RichText+GBA+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2274 (byte offset 2274): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RichText+GBA+*type plus right:render:open` (offset=2736, exp=65882, act=9429)
  ```
  FAIL recapture-raw:RichText+GBA+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2736 (byte offset 2736): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:RichText+Gallery10+*type plus right:render:content` (offset=2316, exp=64708, act=7287)
  ```
  FAIL recapture-raw:RichText+Gallery10+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2316 (byte offset 2316): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RichText+Gallery10+*type plus right:render:open` (offset=2820, exp=67707, act=9591)
  ```
  FAIL recapture-raw:RichText+Gallery10+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2820 (byte offset 2820): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Saudi Woman Behaded for Practicing Sorcery+Associations+tags:render:open` (offset=3080, exp=4247, act=3513)
  ```
  FAIL recapture-raw:Saudi Woman Behaded for Practicing Sorcery+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3080 (byte offset 3080): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Starhawk to Occupy+Source Content+*self:render:content` (offset=2324, exp=65737, act=10414)
  ```
  FAIL recapture-raw:Starhawk to Occupy+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2324 (byte offset 2324): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Starhawk to Occupy+Source Content+*self:render:open` (offset=2836, exp=68752, act=12738)
  ```
  FAIL recapture-raw:Starhawk to Occupy+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 2836 (byte offset 2836): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Testing Requirements+*self:render:content` (offset=2229, exp=62411, act=7100)
  ```
  FAIL recapture-raw:Testing Requirements+*self:render:content (render-engine)
    first difference at code-unit offset 2229 (byte offset 2229): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Testing Requirements+*self:render:open` (offset=4950, exp=65160, act=9849)
  ```
  FAIL recapture-raw:Testing Requirements+*self:render:open (render-engine)
    first difference at code-unit offset 4950 (byte offset 4950): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Thomas Moore Remembering James Hillman+Associations+tags:render:open` (offset=3014, exp=8687, act=7973)
  ```
  FAIL recapture-raw:Thomas Moore Remembering James Hillman+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3014 (byte offset 3014): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:aiki potential graphics+*self:render:content` (offset=2250, exp=63182, act=7151)
  ```
  FAIL recapture-raw:aiki potential graphics+*self:render:content (render-engine)
    first difference at code-unit offset 2250 (byte offset 2250): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:give twenty success stories+*self:render:content` (offset=2274, exp=64293, act=10319)
  ```
  FAIL recapture-raw:give twenty success stories+*self:render:content (render-engine)
    first difference at code-unit offset 2274 (byte offset 2274): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:*input type+*right+*content options:render:closed` (offset=1210, exp=3820, act=3993)
  ```
  FAIL recapture-raw:*input type+*right+*content options:render:closed (render-engine)
    first difference at code-unit offset 1210 (byte offset 1210): expected "1" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Archetypally Speaking+*right:render:content` (offset=2249, exp=62432, act=7150)
  ```
  FAIL recapture-raw:Archetypally Speaking+*right:render:content (render-engine)
    first difference at code-unit offset 2249 (byte offset 2249): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BW Oversight+ARCHETYPALLY:render:open` (offset=3308, exp=11952, act=19730)
  ```
  FAIL recapture-raw:BW Oversight+ARCHETYPALLY:render:open (render-engine)
    first difference at code-unit offset 3308 (byte offset 3308): expected "T" but got "R"
    expected excerpt: ...ew" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-human TYPE_PLUS_RIGHT-rich_...
  ```
- `recapture-raw:Franz Xaver von Schönwerth - The Turnip Princess+Associations+tags:render:open` (offset=3144, exp=12508, act=11782)
  ```
  FAIL recapture-raw:Franz Xaver von Schönwerth - The Turnip Princess+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3144 (byte offset 3158): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Layout+*type:render:content` (offset=2134, exp=59041, act=15269)
  ```
  FAIL recapture-raw:Layout+*type:render:content (render-engine)
    first difference at code-unit offset 2134 (byte offset 2134): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Layout+*type:render:open` (offset=4662, exp=61597, act=17825)
  ```
  FAIL recapture-raw:Layout+*type:render:open (render-engine)
    first difference at code-unit offset 4662 (byte offset 4662): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Pacific Coast Theological Society - Call for Papers for 2012 April 13-14th+*self:render:content` (offset=2595, exp=84972, act=11682)
  ```
  FAIL recapture-raw:Pacific Coast Theological Society - Call for Papers for 2012 April 13-14th+*self:render:content (render-engine)
    first difference at code-unit offset 2595 (byte offset 2595): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Recommendations+*right:render:content` (offset=2448, exp=61515, act=12787)
  ```
  FAIL recapture-raw:Recommendations+*right:render:content (render-engine)
    first difference at code-unit offset 2448 (byte offset 2448): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="11377" da...
  ```
- `recapture-raw:Recommendations+*right:render:open` (offset=5117, exp=64212, act=15484)
  ```
  FAIL recapture-raw:Recommendations+*right:render:open (render-engine)
    first difference at code-unit offset 5117 (byte offset 5117): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="11377" da...
  ```
- `recapture-raw:RichText+Recommendations+*type plus right:render:content` (offset=2354, exp=66454, act=7375)
  ```
  FAIL recapture-raw:RichText+Recommendations+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2354 (byte offset 2354): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:RichText+Recommendations+*type plus right:render:open` (offset=2899, exp=69532, act=9736)
  ```
  FAIL recapture-raw:RichText+Recommendations+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2899 (byte offset 2899): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Sarah Zale - What is the the purpose of education?+Associations+tags:render:open` (offset=3157, exp=8861, act=8116)
  ```
  FAIL recapture-raw:Sarah Zale - What is the the purpose of education?+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3157 (byte offset 3157): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Staughton Lynd - A Letter To Other Occupiers+Associations+tags:render:open` (offset=3083, exp=8582, act=7858)
  ```
  FAIL recapture-raw:Staughton Lynd - A Letter To Other Occupiers+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3083 (byte offset 3083): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Aiki Links plus GBA+*self:render:content` (offset=2218, exp=62120, act=7069)
  ```
  FAIL recapture-raw:Aiki Links plus GBA+*self:render:content (render-engine)
    first difference at code-unit offset 2218 (byte offset 2218): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aiki Links plus GBA+*self:render:open` (offset=4920, exp=64850, act=9799)
  ```
  FAIL recapture-raw:Aiki Links plus GBA+*self:render:open (render-engine)
    first difference at code-unit offset 4920 (byte offset 4920): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bill Moyers - Why America — Where Only The Rich Get Richer — Is Not A Democracy+*self:render:content` (offset=2602, exp=87586, act=7997)
  ```
  FAIL recapture-raw:Bill Moyers - Why America — Where Only The Rich Get Richer — Is Not A Democracy+*self:render:content (render-engine)
    first difference at code-unit offset 2602 (byte offset 2606): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bluevolution+Writing+*self:render:content` (offset=2233, exp=62358, act=10011)
  ```
  FAIL recapture-raw:Bluevolution+Writing+*self:render:content (render-engine)
    first difference at code-unit offset 2233 (byte offset 2233): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bluevolution+Writing+*self:render:open` (offset=2654, exp=65191, act=12205)
  ```
  FAIL recapture-raw:Bluevolution+Writing+*self:render:open (render-engine)
    first difference at code-unit offset 2654 (byte offset 2654): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:GBA YTvidView+*right:render:content` (offset=2196, exp=60439, act=7037)
  ```
  FAIL recapture-raw:GBA YTvidView+*right:render:content (render-engine)
    first difference at code-unit offset 2196 (byte offset 2196): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:GBA YTvidView+*right:render:open` (offset=4842, exp=63113, act=9711)
  ```
  FAIL recapture-raw:GBA YTvidView+*right:render:open (render-engine)
    first difference at code-unit offset 4842 (byte offset 4842): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:J and P OJ and The Tree+*self:render:content` (offset=2254, exp=63216, act=7165)
  ```
  FAIL recapture-raw:J and P OJ and The Tree+*self:render:content (render-engine)
    first difference at code-unit offset 2254 (byte offset 2254): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Recipe+*type:render:content` (offset=2134, exp=58858, act=6875)
  ```
  FAIL recapture-raw:Recipe+*type:render:content (render-engine)
    first difference at code-unit offset 2134 (byte offset 2134): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Recipe+*type:render:open` (offset=4662, exp=61414, act=9431)
  ```
  FAIL recapture-raw:Recipe+*type:render:open (render-engine)
    first difference at code-unit offset 4662 (byte offset 4662): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Richard Strozzi-Heckler - The Aiki Way+Associations+tags:render:open` (offset=3004, exp=13459, act=12767)
  ```
  FAIL recapture-raw:Richard Strozzi-Heckler - The Aiki Way+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3004 (byte offset 3004): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:TRS MNv PcPx schedule and training email 20120707+*self:render:content` (offset=2440, exp=70301, act=10991)
  ```
  FAIL recapture-raw:TRS MNv PcPx schedule and training email 20120707+*self:render:content (render-engine)
    first difference at code-unit offset 2440 (byte offset 2440): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:media+GBA+YouTube Browser:render:open` (offset=4209, exp=102332, act=9212)
  ```
  FAIL recapture-raw:media+GBA+YouTube Browser:render:open (render-engine)
    first difference at code-unit offset 4209 (byte offset 4209): expected "M" but got "m"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;Media+GBA+VideoControl&quot;,&quot;nest_syntax&q...
  ```
- `recapture-raw:Aurora Shooting 201200720 ABC GMA Jessica Ghawi+Source Content+*self:render:content` (offset=2527, exp=73248, act=11313)
  ```
  FAIL recapture-raw:Aurora Shooting 201200720 ABC GMA Jessica Ghawi+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2527 (byte offset 2527): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aurora Shooting 201200720 ABC GMA Jessica Ghawi+Source Content+*self:render:open` (offset=3242, exp=76669, act=13927)
  ```
  FAIL recapture-raw:Aurora Shooting 201200720 ABC GMA Jessica Ghawi+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3242 (byte offset 3242): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Aurora Shooting 201200720 ABC GMA Justin Davis+Source Content+*self:render:content` (offset=2516, exp=72953, act=11265)
  ```
  FAIL recapture-raw:Aurora Shooting 201200720 ABC GMA Justin Davis+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2516 (byte offset 2516): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aurora Shooting 201200720 ABC GMA Justin Davis+Source Content+*self:render:open` (offset=3223, exp=76355, act=13866)
  ```
  FAIL recapture-raw:Aurora Shooting 201200720 ABC GMA Justin Davis+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3223 (byte offset 3223): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Automatic Supervillain+*self:render:content` (offset=2246, exp=62979, act=7147)
  ```
  FAIL recapture-raw:Automatic Supervillain+*self:render:content (render-engine)
    first difference at code-unit offset 2246 (byte offset 2246): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Automatic Supervillain+*self:render:open` (offset=4998, exp=65759, act=9927)
  ```
  FAIL recapture-raw:Automatic Supervillain+*self:render:open (render-engine)
    first difference at code-unit offset 4998 (byte offset 4998): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Barack Obama - Remembering the Victims of the Aurora Colorado Shooting+Source Content+*self:render:content` (offset=2672, exp=88425, act=11959)
  ```
  FAIL recapture-raw:Barack Obama - Remembering the Victims of the Aurora Colorado Shooting+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2672 (byte offset 2672): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Barack Obama - Remembering the Victims of the Aurora Colorado Shooting+Source Content+*self:render:open` (offset=3539, exp=92143, act=14786)
  ```
  FAIL recapture-raw:Barack Obama - Remembering the Victims of the Aurora Colorado Shooting+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3539 (byte offset 3539): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Barbara Ehrenreich - Smile! You've got cancer+Associates:render:open` (offset=300, exp=6293, act=5541)
  ```
  FAIL recapture-raw:Barbara Ehrenreich - Smile! You've got cancer+Associates:render:open (render-engine)
    first difference at code-unit offset 300 (byte offset 300): expected "#" but got "a"
    expected excerpt: ...data-card-name="Barbara Ehrenreich - Smile! You&#39;ve got cancer+Associates" data-card-type-id=...
  ```
- `recapture-raw:Bill Moyers and Chris Hedges - How Whole Regions of America Have Been Destroyed in the Name of Quarterly Profits+Source Content+*self:render:content` (offset=2950, exp=102351, act=13193)
  ```
  FAIL recapture-raw:Bill Moyers and Chris Hedges - How Whole Regions of America Have Been Destroyed in the Name of Quarterly Profits+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2950 (byte offset 2950): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Bill Moyers and Chris Hedges - How Whole Regions of America Have Been Destroyed in the Name of Quarterly Profits+Source Content+*self:render:open` (offset=4107, exp=106637, act=16428)
  ```
  FAIL recapture-raw:Bill Moyers and Chris Hedges - How Whole Regions of America Have Been Destroyed in the Name of Quarterly Profits+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 4107 (byte offset 4107): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:James Holmes Alleged Adult Friend Finder Profile And The Joker Photos+Source Content+*self:render:content` (offset=2669, exp=78838, act=11944)
  ```
  FAIL recapture-raw:James Holmes Alleged Adult Friend Finder Profile And The Joker Photos+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2669 (byte offset 2669): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:James Holmes Alleged Adult Friend Finder Profile And The Joker Photos+Source Content+*self:render:open` (offset=3535, exp=82552, act=14769)
  ```
  FAIL recapture-raw:James Holmes Alleged Adult Friend Finder Profile And The Joker Photos+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3535 (byte offset 3535): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Jessica Ghawi aka Redfield - the final post on her personal blog+Source Content+*self:render:content` (offset=2634, exp=86451, act=11790)
  ```
  FAIL recapture-raw:Jessica Ghawi aka Redfield - the final post on her personal blog+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2634 (byte offset 2634): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Jessica Ghawi aka Redfield - the final post on her personal blog+Source Content+*self:render:open` (offset=3460, exp=90090, act=14560)
  ```
  FAIL recapture-raw:Jessica Ghawi aka Redfield - the final post on her personal blog+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3460 (byte offset 3460): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:LEVON MINASSIAN - Japanese high school students to visit campus for leadership camp+Source Content+*self:render:content` (offset=2759, exp=92744, act=12345)
  ```
  FAIL recapture-raw:LEVON MINASSIAN - Japanese high school students to visit campus for leadership camp+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2759 (byte offset 2759): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:LEVON MINASSIAN - Japanese high school students to visit campus for leadership camp+Source Content+*self:render:open` (offset=3716, exp=96639, act=15299)
  ```
  FAIL recapture-raw:LEVON MINASSIAN - Japanese high school students to visit campus for leadership camp+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3716 (byte offset 3716): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Nathanel Rich - Jungleland:render:open` (offset=3221, exp=25334, act=67187)
  ```
  FAIL recapture-raw:Nathanel Rich - Jungleland:render:open (render-engine)
    first difference at code-unit offset 3221 (byte offset 3221): expected "+" but got "N"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Stanley Pranin - Historical Photo - Enter the Noma Dojo and prepare to be amazed+tags:render:open` (offset=3310, exp=9166, act=8355)
  ```
  FAIL recapture-raw:Stanley Pranin - Historical Photo - Enter the Noma Dojo and prepare to be amazed+tags:render:open (render-engine)
    first difference at code-unit offset 3310 (byte offset 3310): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Time cover 20120723 military suicides+*self:render:content` (offset=2344, exp=66838, act=7385)
  ```
  FAIL recapture-raw:Time cover 20120723 military suicides+*self:render:content (render-engine)
    first difference at code-unit offset 2344 (byte offset 2344): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:20120918+BW+Thoughts+*self:render:content` (offset=2229, exp=62594, act=10007)
  ```
  FAIL recapture-raw:20120918+BW+Thoughts+*self:render:content (render-engine)
    first difference at code-unit offset 2229 (byte offset 2229): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Archetypal role playing discussion on Facebook Aug 2012:render:open` (offset=3860, exp=28644, act=40922)
  ```
  FAIL recapture-raw:Archetypal role playing discussion on Facebook Aug 2012:render:open (render-engine)
    first difference at code-unit offset 3860 (byte offset 3860): expected "+" but got "A"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Epworth UMC Transition - Welcome, Questions, and Concerns+*self:render:content` (offset=2460, exp=79166, act=7651)
  ```
  FAIL recapture-raw:Epworth UMC Transition - Welcome, Questions, and Concerns+*self:render:content (render-engine)
    first difference at code-unit offset 2460 (byte offset 2460): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Huston Smith - Joseph Campbell and the Boy Who Was a Fire Hydrant+tags:render:open` (offset=3115, exp=11279, act=10514)
  ```
  FAIL recapture-raw:Huston Smith - Joseph Campbell and the Boy Who Was a Fire Hydrant+tags:render:open (render-engine)
    first difference at code-unit offset 3115 (byte offset 3115): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Ron Parker - Choose Whom You Will Serve+Source Content+*self:render:content` (offset=2459, exp=78076, act=11015)
  ```
  FAIL recapture-raw:Ron Parker - Choose Whom You Will Serve+Source Content+*self:render:content (render-engine)
    first difference at code-unit offset 2459 (byte offset 2459): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Ron Parker - Choose Whom You Will Serve+Source Content+*self:render:open` (offset=3110, exp=81365, act=13535)
  ```
  FAIL recapture-raw:Ron Parker - Choose Whom You Will Serve+Source Content+*self:render:open (render-engine)
    first difference at code-unit offset 3110 (byte offset 3110): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Thinking Archetypally about Waiting+*self:render:content` (offset=2338, exp=66494, act=7369)
  ```
  FAIL recapture-raw:Thinking Archetypally about Waiting+*self:render:content (render-engine)
    first difference at code-unit offset 2338 (byte offset 2338): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Three phase practice model+*self:render:content` (offset=2274, exp=64129, act=10317)
  ```
  FAIL recapture-raw:Three phase practice model+*self:render:content (render-engine)
    first difference at code-unit offset 2274 (byte offset 2274): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Working through Conflict at Work+*self:render:content` (offset=2317, exp=65723, act=7318)
  ```
  FAIL recapture-raw:Working through Conflict at Work+*self:render:content (render-engine)
    first difference at code-unit offset 2317 (byte offset 2317): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Anonymous+*account:record` (offset=45, exp=161, act=160)
  ```
  FAIL recapture-raw:Anonymous+*account:record (card-engine)
    first difference at code-unit offset 45 (byte offset 45): expected "s" but got "+"
    expected excerpt: {"codename":null,"content":"","key":"anonymous+*account","left":"Anonymous","name":"Anonymous...
  ```
- `recapture-raw:Brandon sings for Ms Paula and her kids 2011+*self:render:content` (offset=2384, exp=68675, act=10763)
  ```
  FAIL recapture-raw:Brandon sings for Ms Paula and her kids 2011+*self:render:content (render-engine)
    first difference at code-unit offset 2384 (byte offset 2384): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:EpBkUMCChgConf20111118rawaudio+*self:render:content` (offset=2314, exp=65301, act=10448)
  ```
  FAIL recapture-raw:EpBkUMCChgConf20111118rawaudio+*self:render:content (render-engine)
    first difference at code-unit offset 2314 (byte offset 2314): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Follow Your Bliss+discussion+*self:render:content` (offset=2289, exp=64180, act=7250)
  ```
  FAIL recapture-raw:Follow Your Bliss+discussion+*self:render:content (render-engine)
    first difference at code-unit offset 2289 (byte offset 2289): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Follow Your Bliss+discussion+*self:render:open` (offset=2766, exp=67125, act=9524)
  ```
  FAIL recapture-raw:Follow Your Bliss+discussion+*self:render:open (render-engine)
    first difference at code-unit offset 2766 (byte offset 2766): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Huston David born+*self:render:content` (offset=2212, exp=61977, act=9982)
  ```
  FAIL recapture-raw:Huston David born+*self:render:content (render-engine)
    first difference at code-unit offset 2212 (byte offset 2212): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Huston David born+*self:render:open` (offset=4896, exp=64689, act=12694)
  ```
  FAIL recapture-raw:Huston David born+*self:render:open (render-engine)
    first difference at code-unit offset 4896 (byte offset 4896): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Huston Smith article for CDSP+*self:render:content` (offset=2296, exp=64891, act=10354)
  ```
  FAIL recapture-raw:Huston Smith article for CDSP+*self:render:content (render-engine)
    first difference at code-unit offset 2296 (byte offset 2296): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Michael Christensen+*self:render:content` (offset=2223, exp=62197, act=7094)
  ```
  FAIL recapture-raw:Michael Christensen+*self:render:content (render-engine)
    first difference at code-unit offset 2223 (byte offset 2223): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Michael Christensen+*self:render:open` (offset=4929, exp=64931, act=9828)
  ```
  FAIL recapture-raw:Michael Christensen+*self:render:open (render-engine)
    first difference at code-unit offset 4929 (byte offset 4929): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:O Holy Night - Dallas TXmas 2011 - Brandon WilliamsCraig+*self:render:content` (offset=2452, exp=78114, act=14609)
  ```
  FAIL recapture-raw:O Holy Night - Dallas TXmas 2011 - Brandon WilliamsCraig+*self:render:content (render-engine)
    first difference at code-unit offset 2452 (byte offset 2452): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Research+discussion+*type plus right:render:content` (offset=2319, exp=64725, act=7290)
  ```
  FAIL recapture-raw:Research+discussion+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2319 (byte offset 2319): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Research+discussion+*type plus right:render:open` (offset=2829, exp=67733, act=9601)
  ```
  FAIL recapture-raw:Research+discussion+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2829 (byte offset 2829): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:STEVEN GREENHOUSE - NY Times - How Costco Became the Anti-Wal-Mart+tags:render:open` (offset=3109, exp=8701, act=7958)
  ```
  FAIL recapture-raw:STEVEN GREENHOUSE - NY Times - How Costco Became the Anti-Wal-Mart+tags:render:open (render-engine)
    first difference at code-unit offset 3109 (byte offset 3109): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:What we know frames a door into what we do not know+*self:render:content` (offset=2446, exp=70378, act=7627)
  ```
  FAIL recapture-raw:What we know frames a door into what we do not know+*self:render:content (render-engine)
    first difference at code-unit offset 2446 (byte offset 2446): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:*all+*style:render:closed` (offset=961, exp=2842, act=2860)
  ```
  FAIL recapture-raw:*all+*style:render:closed (render-engine)
    first difference at code-unit offset 961 (byte offset 961): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*all+*style:render:open` (offset=943, exp=5622, act=5367)
  ```
  FAIL recapture-raw:*all+*style:render:open (render-engine)
    first difference at code-unit offset 943 (byte offset 943): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*css+*self+*help:render:closed` (offset=1023, exp=3012, act=3046)
  ```
  FAIL recapture-raw:*css+*self+*help:render:closed (render-engine)
    first difference at code-unit offset 1023 (byte offset 1023): expected "A" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*css+*self+*help:render:open` (offset=1005, exp=3028, act=3014)
  ```
  FAIL recapture-raw:*css+*self+*help:render:open (render-engine)
    first difference at code-unit offset 1005 (byte offset 1005): expected "A" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*style:render:closed` (offset=1078, exp=2219, act=2054)
  ```
  FAIL recapture-raw:*style:render:closed (render-engine)
    first difference at code-unit offset 1078 (byte offset 1078): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:*style+*right:render:content` (offset=2366, exp=65096, act=15369)
  ```
  FAIL recapture-raw:*style+*right:render:content (render-engine)
    first difference at code-unit offset 2366 (byte offset 2366): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="17452" da...
  ```
- `recapture-raw:*style+*right:render:open` (offset=4910, exp=67668, act=17941)
  ```
  FAIL recapture-raw:*style+*right:render:open (render-engine)
    first difference at code-unit offset 4910 (byte offset 4910): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="17452" da...
  ```
- `recapture-raw:*style+*right+*content options:render:content` (offset=519, exp=568, act=62148)
  ```
  FAIL recapture-raw:*style+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 519 (byte offset 519): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type": "bootswatch_skin", "sort": "name"}</div...
  ```
- `recapture-raw:*style+*right+*content options:render:open` (offset=3628, exp=3699, act=65279)
  ```
  FAIL recapture-raw:*style+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3628 (byte offset 3628): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:*style+*right+*input type:render:closed` (offset=1106, exp=2999, act=3160)
  ```
  FAIL recapture-raw:*style+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1106 (byte offset 1106): expected "r" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:CG Jung - the Red Book+discussion:render:open` (offset=3480, exp=3789, act=3670)
  ```
  FAIL recapture-raw:CG Jung - the Red Book+discussion:render:open (render-engine)
    first difference at code-unit offset 3480 (byte offset 3480): expected "<" but got "["
    expected excerpt: ...ir own discussion area in Articles (above) &gt; <a class="known-card" href="/The_Red_Book_consid...
  ```
- `recapture-raw:CSS+*type:render:content` (offset=2113, exp=58252, act=15092)
  ```
  FAIL recapture-raw:CSS+*type:render:content (render-engine)
    first difference at code-unit offset 2113 (byte offset 2113): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:CSS+*type:render:open` (offset=4599, exp=60766, act=17606)
  ```
  FAIL recapture-raw:CSS+*type:render:open (render-engine)
    first difference at code-unit offset 4599 (byte offset 4599): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Image+discussion+*type plus right:render:content` (offset=2298, exp=64197, act=10267)
  ```
  FAIL recapture-raw:Image+discussion+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2298 (byte offset 2298): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Image+discussion+*type plus right:render:open` (offset=2787, exp=67163, act=12548)
  ```
  FAIL recapture-raw:Image+discussion+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2787 (byte offset 2787): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Lowe Dissertation+Paper One+*self:render:content` (offset=2282, exp=63915, act=7233)
  ```
  FAIL recapture-raw:Lowe Dissertation+Paper One+*self:render:content (render-engine)
    first difference at code-unit offset 2282 (byte offset 2282): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Lowe Dissertation+Paper One+*self:render:open` (offset=2752, exp=66846, act=9497)
  ```
  FAIL recapture-raw:Lowe Dissertation+Paper One+*self:render:open (render-engine)
    first difference at code-unit offset 2752 (byte offset 2752): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Lowe Dissertation+Steps and Deadlines+*self:render:content` (offset=2344, exp=66417, act=7375)
  ```
  FAIL recapture-raw:Lowe Dissertation+Steps and Deadlines+*self:render:content (render-engine)
    first difference at code-unit offset 2344 (byte offset 2344): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Lowe Dissertation+Steps and Deadlines+*self:render:open` (offset=2882, exp=69478, act=9733)
  ```
  FAIL recapture-raw:Lowe Dissertation+Steps and Deadlines+*self:render:open (render-engine)
    first difference at code-unit offset 2882 (byte offset 2882): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:SCSS+*type:render:content` (offset=2120, exp=58515, act=15151)
  ```
  FAIL recapture-raw:SCSS+*type:render:content (render-engine)
    first difference at code-unit offset 2120 (byte offset 2120): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:SCSS+*type:render:open` (offset=4620, exp=61043, act=17679)
  ```
  FAIL recapture-raw:SCSS+*type:render:open (render-engine)
    first difference at code-unit offset 4620 (byte offset 4620): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Sign up - old+*html message:render:content` (offset=5, exp=1000, act=822)
  ```
  FAIL recapture-raw:Sign up - old+*html message:render:content (render-engine)
    first difference at code-unit offset 5 (byte offset 5): expected "c" but got "i"
    expected excerpt: <div class='simple-core'>
  ```
- `recapture-raw:Skin+*type:render:content` (offset=2120, exp=58515, act=15151)
  ```
  FAIL recapture-raw:Skin+*type:render:content (render-engine)
    first difference at code-unit offset 2120 (byte offset 2120): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Skin+*type:render:open` (offset=4620, exp=61043, act=17679)
  ```
  FAIL recapture-raw:Skin+*type:render:open (render-engine)
    first difference at code-unit offset 4620 (byte offset 4620): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Stellucci - Jung e Hillman, eretici l’uno dell’altro, ovvero quando l’eresia diventa necessità+*self:render:content` (offset=2735, exp=94714, act=8359)
  ```
  FAIL recapture-raw:Stellucci - Jung e Hillman, eretici l’uno dell’altro, ovvero quando l’eresia diventa necessità+*self:render:content (render-engine)
    first difference at code-unit offset 2735 (byte offset 2748): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:classic skin:render:content` (offset=370, exp=2222, act=408)
  ```
  FAIL recapture-raw:classic skin:render:content (render-engine)
    first difference at code-unit offset 370 (byte offset 370): expected "<" but got "s"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:classic skin:render:open` (offset=2483, exp=4363, act=2549)
  ```
  FAIL recapture-raw:classic skin:render:open (render-engine)
    first difference at code-unit offset 2483 (byte offset 2483): expected "<" but got "s"
    expected excerpt: ...t;],&quot;home_view&quot;:&quot;content&quot;}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:customized classic skin:render:content` (offset=414, exp=5122, act=437)
  ```
  FAIL recapture-raw:customized classic skin:render:content (render-engine)
    first difference at code-unit offset 414 (byte offset 414): expected "<" but got "c"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:customized classic skin:render:open` (offset=2670, exp=7406, act=2721)
  ```
  FAIL recapture-raw:customized classic skin:render:open (render-engine)
    first difference at code-unit offset 2670 (byte offset 2670): expected "<" but got "c"
    expected excerpt: ...t;],&quot;home_view&quot;:&quot;content&quot;}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:20131018+BW+RVW+Plans+*self:render:content` (offset=2237, exp=63102, act=10052)
  ```
  FAIL recapture-raw:20131018+BW+RVW+Plans+*self:render:content (render-engine)
    first difference at code-unit offset 2237 (byte offset 2237): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Blumenfeld - A Culture of Cheating at the University?+discussion:render:open` (offset=4192, exp=5288, act=4980)
  ```
  FAIL recapture-raw:Blumenfeld - A Culture of Cheating at the University?+discussion:render:open (render-engine)
    first difference at code-unit offset 4192 (byte offset 4196): expected "<" but got "b"
    expected excerpt: ...ture of Cheating at the University?</p>
  ```
- `recapture-raw:Collection+*right:render:content` (offset=2403, exp=65784, act=12661)
  ```
  FAIL recapture-raw:Collection+*right:render:content (render-engine)
    first difference at code-unit offset 2403 (byte offset 2403): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="17826" da...
  ```
- `recapture-raw:Collection+*right:render:open` (offset=5005, exp=68414, act=15291)
  ```
  FAIL recapture-raw:Collection+*right:render:open (render-engine)
    first difference at code-unit offset 5005 (byte offset 5005): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="17826" da...
  ```
- `recapture-raw:Collection+*right+*content options:render:content` (offset=535, exp=562, act=5771)
  ```
  FAIL recapture-raw:Collection+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 535 (byte offset 535): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type":"Collection"}</div>
  ```
- `recapture-raw:Collection+*right+*content options:render:open` (offset=3662, exp=3711, act=8920)
  ```
  FAIL recapture-raw:Collection+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3662 (byte offset 3662): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:Collection+*right+*input type:render:closed` (offset=1138, exp=3060, act=3223)
  ```
  FAIL recapture-raw:Collection+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1138 (byte offset 1138): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Collection+*type:render:content` (offset=2162, exp=59886, act=6943)
  ```
  FAIL recapture-raw:Collection+*type:render:content (render-engine)
    first difference at code-unit offset 2162 (byte offset 2162): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Collection+*type:render:open` (offset=4746, exp=62498, act=9555)
  ```
  FAIL recapture-raw:Collection+*type:render:open (render-engine)
    first difference at code-unit offset 4746 (byte offset 4746): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Collection+Item+*type plus right:render:content` (offset=2291, exp=63704, act=7222)
  ```
  FAIL recapture-raw:Collection+Item+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2291 (byte offset 2291): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Collection+Item+*type plus right:render:open` (offset=2773, exp=66656, act=9493)
  ```
  FAIL recapture-raw:Collection+Item+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2773 (byte offset 2773): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Culturesmith blog 20140116+*self:render:content` (offset=2275, exp=64181, act=7216)
  ```
  FAIL recapture-raw:Culturesmith blog 20140116+*self:render:content (render-engine)
    first difference at code-unit offset 2275 (byte offset 2275): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Exhibit+*type:render:content` (offset=2141, exp=59115, act=6892)
  ```
  FAIL recapture-raw:Exhibit+*type:render:content (render-engine)
    first difference at code-unit offset 2141 (byte offset 2141): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Exhibit+*type:render:open` (offset=4683, exp=61685, act=9462)
  ```
  FAIL recapture-raw:Exhibit+*type:render:open (render-engine)
    first difference at code-unit offset 4683 (byte offset 4683): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Exhibit+Item+*type plus right:render:open` (offset=2731, exp=72291, act=12254)
  ```
  FAIL recapture-raw:Exhibit+Item+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2731 (byte offset 2731): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Exhibit+Item+*type plus right+*content options:render:content` (offset=581, exp=617, act=5961)
  ```
  FAIL recapture-raw:Exhibit+Item+*type plus right+*content options:render:content (render-engine)
    first difference at code-unit offset 581 (byte offset 581): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type":"Item", "sort":"name"}</div>
  ```
- `recapture-raw:Exhibit+Item+*type plus right+*content options:render:open` (offset=3913, exp=3971, act=9315)
  ```
  FAIL recapture-raw:Exhibit+Item+*type plus right+*content options:render:open (render-engine)
    first difference at code-unit offset 3913 (byte offset 3913): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:Exhibit+description+*type plus right:render:open` (offset=2829, exp=67879, act=12561)
  ```
  FAIL recapture-raw:Exhibit+description+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2829 (byte offset 2829): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:File+*right:render:content` (offset=2349, exp=58133, act=9533)
  ```
  FAIL recapture-raw:File+*right:render:content (render-engine)
    first difference at code-unit offset 2349 (byte offset 2349): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="17684" da...
  ```
- `recapture-raw:File+*right:render:open` (offset=4867, exp=60679, act=12079)
  ```
  FAIL recapture-raw:File+*right:render:open (render-engine)
    first difference at code-unit offset 4867 (byte offset 4867): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="17684" da...
  ```
- `recapture-raw:Item+*type:render:content` (offset=2120, exp=58344, act=6841)
  ```
  FAIL recapture-raw:Item+*type:render:content (render-engine)
    first difference at code-unit offset 2120 (byte offset 2120): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+*type:render:open` (offset=4620, exp=60872, act=9369)
  ```
  FAIL recapture-raw:Item+*type:render:open (render-engine)
    first difference at code-unit offset 4620 (byte offset 4620): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Contributor+*type plus right:render:content` (offset=2298, exp=64154, act=10147)
  ```
  FAIL recapture-raw:Item+Contributor+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2298 (byte offset 2298): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Contributor+*type plus right:render:open` (offset=2787, exp=67120, act=12428)
  ```
  FAIL recapture-raw:Item+Contributor+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2787 (byte offset 2787): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Contributor+*type plus right+*help:render:closed` (offset=1277, exp=3468, act=3471)
  ```
  FAIL recapture-raw:Item+Contributor+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1277 (byte offset 1277): expected "." but got "o"
    expected excerpt: ... responsible for making contributions to the res...</div>
  ```
- `recapture-raw:Item+Contributor+*type plus right+*help:render:open` (offset=1259, exp=3557, act=3560)
  ```
  FAIL recapture-raw:Item+Contributor+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1259 (byte offset 1259): expected "." but got "o"
    expected excerpt: ... responsible for making contributions to the res...</div>
  ```
- `recapture-raw:Item+Coverage+*type plus right:render:content` (offset=2277, exp=63377, act=10054)
  ```
  FAIL recapture-raw:Item+Coverage+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2277 (byte offset 2277): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Coverage+*type plus right:render:open` (offset=2745, exp=66301, act=12305)
  ```
  FAIL recapture-raw:Item+Coverage+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2745 (byte offset 2745): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Coverage+*type plus right+*help:render:closed` (offset=1253, exp=3423, act=3426)
  ```
  FAIL recapture-raw:Item+Coverage+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1253 (byte offset 1253): expected "." but got "l"
    expected excerpt: ...al or temporal topic of the resource, the spatia...</div>
  ```
- `recapture-raw:Item+Coverage+*type plus right+*help:render:open` (offset=1235, exp=3978, act=3981)
  ```
  FAIL recapture-raw:Item+Coverage+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1235 (byte offset 1235): expected "." but got "l"
    expected excerpt: ...al or temporal topic of the resource, the spatia...</div>
  ```
- `recapture-raw:Item+Creator+*type plus right:render:content` (offset=2270, exp=63118, act=10023)
  ```
  FAIL recapture-raw:Item+Creator+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2270 (byte offset 2270): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Creator+*type plus right:render:open` (offset=2731, exp=66028, act=12264)
  ```
  FAIL recapture-raw:Item+Creator+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2731 (byte offset 2731): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Creator+*type plus right+*help:render:closed` (offset=1245, exp=3408, act=3411)
  ```
  FAIL recapture-raw:Item+Creator+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1245 (byte offset 1245): expected "." but got "E"
    expected excerpt: ... primarily responsible for making the resource. ...</div>
  ```
- `recapture-raw:Item+Creator+*type plus right+*help:render:open` (offset=1227, exp=3486, act=3489)
  ```
  FAIL recapture-raw:Item+Creator+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1227 (byte offset 1227): expected "." but got "E"
    expected excerpt: ... primarily responsible for making the resource. ...</div>
  ```
- `recapture-raw:Item+Date+*type plus right:render:content` (offset=2244, exp=62469, act=9925)
  ```
  FAIL recapture-raw:Item+Date+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2244 (byte offset 2244): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Date+*type plus right+*help:render:closed` (offset=1221, exp=3363, act=3366)
  ```
  FAIL recapture-raw:Item+Date+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1221 (byte offset 1221): expected "." but got " "
    expected excerpt: ...r period of time associated with an event in the...</div>
  ```
- `recapture-raw:Item+Date+*type plus right+*help:render:open` (offset=1203, exp=3512, act=3515)
  ```
  FAIL recapture-raw:Item+Date+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1203 (byte offset 1203): expected "." but got " "
    expected excerpt: ...r period of time associated with an event in the...</div>
  ```
- `recapture-raw:Item+Format+*type plus right:render:content` (offset=2263, exp=62859, act=9992)
  ```
  FAIL recapture-raw:Item+Format+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2263 (byte offset 2263): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Format+*type plus right:render:open` (offset=2717, exp=65755, act=12223)
  ```
  FAIL recapture-raw:Item+Format+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2717 (byte offset 2717): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Format+*type plus right+*help:render:closed` (offset=1237, exp=3393, act=3396)
  ```
  FAIL recapture-raw:Item+Format+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1237 (byte offset 1237): expected "." but got "s"
    expected excerpt: ...format, physical medium, or dimensions of the re...</div>
  ```
- `recapture-raw:Item+Format+*type plus right+*help:render:open` (offset=1219, exp=3496, act=3499)
  ```
  FAIL recapture-raw:Item+Format+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1219 (byte offset 1219): expected "." but got "s"
    expected excerpt: ...format, physical medium, or dimensions of the re...</div>
  ```
- `recapture-raw:Item+Identifier+*type plus right:render:content` (offset=2291, exp=63895, act=10116)
  ```
  FAIL recapture-raw:Item+Identifier+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2291 (byte offset 2291): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Identifier+*type plus right:render:open` (offset=2773, exp=66847, act=12387)
  ```
  FAIL recapture-raw:Item+Identifier+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2773 (byte offset 2773): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Identifier+*type plus right+*help:render:closed` (offset=1269, exp=3453, act=3456)
  ```
  FAIL recapture-raw:Item+Identifier+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1269 (byte offset 1269): expected "." but got "o"
    expected excerpt: ...guous reference to the resource within a given c...</div>
  ```
- `recapture-raw:Item+Identifier+*type plus right+*help:render:open` (offset=1251, exp=3514, act=3517)
  ```
  FAIL recapture-raw:Item+Identifier+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1251 (byte offset 1251): expected "." but got "o"
    expected excerpt: ...guous reference to the resource within a given c...</div>
  ```
- `recapture-raw:Item+Publisher+*type plus right:render:content` (offset=2284, exp=63636, act=10085)
  ```
  FAIL recapture-raw:Item+Publisher+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2284 (byte offset 2284): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Publisher+*type plus right:render:open` (offset=2759, exp=66574, act=12346)
  ```
  FAIL recapture-raw:Item+Publisher+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2759 (byte offset 2759): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Publisher+*type plus right+*help:render:closed` (offset=1261, exp=3438, act=3441)
  ```
  FAIL recapture-raw:Item+Publisher+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1261 (byte offset 1261): expected "." but got "E"
    expected excerpt: ... responsible for making the resource available. ...</div>
  ```
- `recapture-raw:Item+Publisher+*type plus right+*help:render:open` (offset=1243, exp=3518, act=3521)
  ```
  FAIL recapture-raw:Item+Publisher+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1243 (byte offset 1243): expected "." but got "E"
    expected excerpt: ... responsible for making the resource available. ...</div>
  ```
- `recapture-raw:Item+Relation+*type plus right:render:content` (offset=2277, exp=63377, act=10054)
  ```
  FAIL recapture-raw:Item+Relation+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2277 (byte offset 2277): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Relation+*type plus right:render:open` (offset=2745, exp=66301, act=12305)
  ```
  FAIL recapture-raw:Item+Relation+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2745 (byte offset 2745): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Relation+*type plus right+*help:render:closed` (offset=1253, exp=3423, act=3426)
  ```
  FAIL recapture-raw:Item+Relation+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1253 (byte offset 1253): expected "." but got "i"
    expected excerpt: ... resource. Recommended best practice is to ident...</div>
  ```
- `recapture-raw:Item+Relation+*type plus right+*help:render:open` (offset=1235, exp=3449, act=3452)
  ```
  FAIL recapture-raw:Item+Relation+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1235 (byte offset 1235): expected "." but got "i"
    expected excerpt: ... resource. Recommended best practice is to ident...</div>
  ```
- `recapture-raw:Item+Rights+*type plus right:render:content` (offset=2259, exp=62823, act=9975)
  ```
  FAIL recapture-raw:Item+Rights+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2259 (byte offset 2259): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Rights+*type plus right+*help:render:closed` (offset=1233, exp=3388, act=3391)
  ```
  FAIL recapture-raw:Item+Rights+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1233 (byte offset 1233): expected "." but got "y"
    expected excerpt: ...on about rights held in and over the resource. T...</div>
  ```
- `recapture-raw:Item+Rights+*type plus right+*help:render:open` (offset=1215, exp=3474, act=3477)
  ```
  FAIL recapture-raw:Item+Rights+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1215 (byte offset 1215): expected "." but got "y"
    expected excerpt: ...on about rights held in and over the resource. T...</div>
  ```
- `recapture-raw:Item+Source+*type plus right:render:content` (offset=2263, exp=62859, act=9992)
  ```
  FAIL recapture-raw:Item+Source+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2263 (byte offset 2263): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Source+*type plus right:render:open` (offset=2717, exp=65755, act=12223)
  ```
  FAIL recapture-raw:Item+Source+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2717 (byte offset 2717): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Source+*type plus right+*help:render:closed` (offset=1237, exp=3393, act=3396)
  ```
  FAIL recapture-raw:Item+Source+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1237 (byte offset 1237): expected "." but got "e"
    expected excerpt: ... resource from which the described resource is d...</div>
  ```
- `recapture-raw:Item+Source+*type plus right+*help:render:open` (offset=1219, exp=3551, act=3554)
  ```
  FAIL recapture-raw:Item+Source+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1219 (byte offset 1219): expected "." but got "e"
    expected excerpt: ... resource from which the described resource is d...</div>
  ```
- `recapture-raw:Item+Subject+*type plus right:render:content` (offset=2270, exp=63118, act=10023)
  ```
  FAIL recapture-raw:Item+Subject+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2270 (byte offset 2270): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Subject+*type plus right:render:open` (offset=2731, exp=66028, act=12264)
  ```
  FAIL recapture-raw:Item+Subject+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2731 (byte offset 2731): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+Subject+*type plus right+*help:render:closed` (offset=1245, exp=3408, act=3411)
  ```
  FAIL recapture-raw:Item+Subject+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1245 (byte offset 1245): expected "." but got " "
    expected excerpt: ... of the resource. Typically, the subject will be...</div>
  ```
- `recapture-raw:Item+Subject+*type plus right+*help:render:open` (offset=1227, exp=3556, act=3559)
  ```
  FAIL recapture-raw:Item+Subject+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1227 (byte offset 1227): expected "." but got " "
    expected excerpt: ... of the resource. Typically, the subject will be...</div>
  ```
- `recapture-raw:Item+Title+*type plus right:render:content` (offset=2256, exp=62600, act=9961)
  ```
  FAIL recapture-raw:Item+Title+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2256 (byte offset 2256): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Title+*type plus right+*help:render:closed` (offset=1229, exp=3378, act=3381)
  ```
  FAIL recapture-raw:Item+Title+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1229 (byte offset 1229): expected "." but got "a"
    expected excerpt: ...ven to the resource. Typically, a Title will be ...</div>
  ```
- `recapture-raw:Item+Title+*type plus right+*help:render:open` (offset=1211, exp=3363, act=3366)
  ```
  FAIL recapture-raw:Item+Title+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1211 (byte offset 1211): expected "." but got "a"
    expected excerpt: ...ven to the resource. Typically, a Title will be ...</div>
  ```
- `recapture-raw:Item+Type+*type plus right:render:content` (offset=2249, exp=62341, act=9930)
  ```
  FAIL recapture-raw:Item+Type+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2249 (byte offset 2249): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+Type+*type plus right+*help:render:closed` (offset=1221, exp=3363, act=3366)
  ```
  FAIL recapture-raw:Item+Type+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1221 (byte offset 1221): expected "." but got "c"
    expected excerpt: ...e or genre of the resource. Recommended best pra...</div>
  ```
- `recapture-raw:Item+Type+*type plus right+*help:render:open` (offset=1203, exp=3487, act=3490)
  ```
  FAIL recapture-raw:Item+Type+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1203 (byte offset 1203): expected "." but got "c"
    expected excerpt: ...e or genre of the resource. Recommended best pra...</div>
  ```
- `recapture-raw:Item+description+*type plus right:render:content` (offset=2298, exp=64154, act=10147)
  ```
  FAIL recapture-raw:Item+description+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2298 (byte offset 2298): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+description+*type plus right:render:open` (offset=2787, exp=67120, act=12428)
  ```
  FAIL recapture-raw:Item+description+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2787 (byte offset 2787): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+description+*type plus right+*help:render:closed` (offset=1277, exp=3468, act=3471)
  ```
  FAIL recapture-raw:Item+description+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1277 (byte offset 1277): expected "." but got "s"
    expected excerpt: ...t of the resource. Description may include but i...</div>
  ```
- `recapture-raw:Item+description+*type plus right+*help:render:open` (offset=1259, exp=3519, act=3522)
  ```
  FAIL recapture-raw:Item+description+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1259 (byte offset 1259): expected "." but got "s"
    expected excerpt: ...t of the resource. Description may include but i...</div>
  ```
- `recapture-raw:Item+language+*type plus right:render:content` (offset=2277, exp=63377, act=10054)
  ```
  FAIL recapture-raw:Item+language+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2277 (byte offset 2277): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+language+*type plus right:render:open` (offset=2745, exp=66301, act=12305)
  ```
  FAIL recapture-raw:Item+language+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2745 (byte offset 2745): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Item+language+*type plus right+*help:render:closed` (offset=1253, exp=3423, act=3426)
  ```
  FAIL recapture-raw:Item+language+*type plus right+*help:render:closed (render-engine)
    first difference at code-unit offset 1253 (byte offset 1253): expected "." but got "t"
    expected excerpt: ...e of the resource. Recommended best practice is ...</div>
  ```
- `recapture-raw:Item+language+*type plus right+*help:render:open` (offset=1235, exp=3416, act=3419)
  ```
  FAIL recapture-raw:Item+language+*type plus right+*help:render:open (render-engine)
    first difference at code-unit offset 1235 (byte offset 1235): expected "." but got "t"
    expected excerpt: ...e of the resource. Recommended best practice is ...</div>
  ```
- `recapture-raw:Item+long+*type plus right:render:content` (offset=2249, exp=62162, act=7120)
  ```
  FAIL recapture-raw:Item+long+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2249 (byte offset 2249): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Item+short+*type plus right:render:content` (offset=2256, exp=62746, act=7137)
  ```
  FAIL recapture-raw:Item+short+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2256 (byte offset 2256): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Person+items_edited+*type plus right:render:content` (offset=2316, exp=64699, act=7277)
  ```
  FAIL recapture-raw:Person+items_edited+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2316 (byte offset 2316): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Person+items_edited+*type plus right:render:open` (offset=2826, exp=67704, act=9586)
  ```
  FAIL recapture-raw:Person+items_edited+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2826 (byte offset 2826): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Proto Item+*type:render:content` (offset=2162, exp=59886, act=6943)
  ```
  FAIL recapture-raw:Proto Item+*type:render:content (render-engine)
    first difference at code-unit offset 2162 (byte offset 2162): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Proto Item+*type:render:open` (offset=4746, exp=62498, act=9555)
  ```
  FAIL recapture-raw:Proto Item+*type:render:open (render-engine)
    first difference at code-unit offset 4746 (byte offset 4746): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Search+large image+*type plus right:render:content` (offset=2307, exp=64470, act=7268)
  ```
  FAIL recapture-raw:Search+large image+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2307 (byte offset 2307): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Search+large image+*type plus right:render:open` (offset=2805, exp=67454, act=9564)
  ```
  FAIL recapture-raw:Search+large image+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2805 (byte offset 2805): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Taylor - Krampus: Saint Nicholas' Dark Companion+Associates:render:open` (offset=301, exp=6320, act=5563)
  ```
  FAIL recapture-raw:Taylor - Krampus: Saint Nicholas' Dark Companion+Associates:render:open (render-engine)
    first difference at code-unit offset 301 (byte offset 301): expected "#" but got "a"
    expected excerpt: ...ata-card-name="Taylor - Krampus: Saint Nicholas&#39; Dark Companion+Associates" data-card-type-i...
  ```
- `recapture-raw:Taylor - Krampus: Saint Nicholas' Dark Companion+discussion:render:open` (offset=310, exp=3878, act=3889)
  ```
  FAIL recapture-raw:Taylor - Krampus: Saint Nicholas' Dark Companion+discussion:render:open (render-engine)
    first difference at code-unit offset 310 (byte offset 310): expected "#" but got "a"
    expected excerpt: ...ata-card-name="Taylor - Krampus: Saint Nicholas&#39; Dark Companion+discussion" data-card-type-i...
  ```
- `recapture-raw:slideshow+*type:render:content` (offset=2155, exp=59629, act=6926)
  ```
  FAIL recapture-raw:slideshow+*type:render:content (render-engine)
    first difference at code-unit offset 2155 (byte offset 2155): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:slideshow+*type:render:open` (offset=4725, exp=62227, act=9524)
  ```
  FAIL recapture-raw:slideshow+*type:render:open (render-engine)
    first difference at code-unit offset 4725 (byte offset 4725): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:watermark+*type:render:content` (offset=2155, exp=59629, act=6926)
  ```
  FAIL recapture-raw:watermark+*type:render:content (render-engine)
    first difference at code-unit offset 2155 (byte offset 2155): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:watermark+*type:render:open` (offset=4725, exp=62227, act=9524)
  ```
  FAIL recapture-raw:watermark+*type:render:open (render-engine)
    first difference at code-unit offset 4725 (byte offset 4725): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:20140202+BW+RVW+Narrative+*self:render:content` (offset=2268, exp=64512, act=10192)
  ```
  FAIL recapture-raw:20140202+BW+RVW+Narrative+*self:render:content (render-engine)
    first difference at code-unit offset 2268 (byte offset 2268): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Date+kombucha+*type plus right:render:content` (offset=2277, exp=63190, act=7188)
  ```
  FAIL recapture-raw:Date+kombucha+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2277 (byte offset 2277): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Date+kombucha+*type plus right:render:open` (offset=2745, exp=66114, act=9439)
  ```
  FAIL recapture-raw:Date+kombucha+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2745 (byte offset 2745): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:LWblog+*type:render:content` (offset=2138, exp=58892, act=6889)
  ```
  FAIL recapture-raw:LWblog+*type:render:content (render-engine)
    first difference at code-unit offset 2138 (byte offset 2138): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:LWblog+*type:render:open` (offset=4671, exp=61453, act=9450)
  ```
  FAIL recapture-raw:LWblog+*type:render:open (render-engine)
    first difference at code-unit offset 4671 (byte offset 4671): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Roundtable+Globalization and Sourcing+Follow up+articles:render:open` (offset=3122, exp=11689, act=10962)
  ```
  FAIL recapture-raw:Roundtable+Globalization and Sourcing+Follow up+articles:render:open (render-engine)
    first difference at code-unit offset 3122 (byte offset 3122): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:*all+*script:render:closed` (offset=973, exp=2724, act=5596)
  ```
  FAIL recapture-raw:*all+*script:render:closed (render-engine)
    first difference at code-unit offset 973 (byte offset 973): expected "1" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*all+*script:render:open` (offset=955, exp=44389, act=47261)
  ```
  FAIL recapture-raw:*all+*script:render:open (render-engine)
    first difference at code-unit offset 955 (byte offset 955): expected "1" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*script+*right:render:content` (offset=2375, exp=65273, act=12519)
  ```
  FAIL recapture-raw:*script+*right:render:content (render-engine)
    first difference at code-unit offset 2375 (byte offset 2375): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="20598" da...
  ```
- `recapture-raw:*script+*right:render:open` (offset=4933, exp=67859, act=15105)
  ```
  FAIL recapture-raw:*script+*right:render:open (render-engine)
    first difference at code-unit offset 4933 (byte offset 4933): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="20598" da...
  ```
- `recapture-raw:*script+*right+*content options:render:content` (offset=523, exp=576, act=8049)
  ```
  FAIL recapture-raw:*script+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 523 (byte offset 523): expected " " but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"> {"type":["in", "JavaScript", "CoffeeScript"] }<...
  ```
- `recapture-raw:*script+*right+*content options:render:open` (offset=3646, exp=3721, act=11194)
  ```
  FAIL recapture-raw:*script+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3646 (byte offset 3646): expected " " but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:*script+*right+*input type:render:closed` (offset=1114, exp=3013, act=3172)
  ```
  FAIL recapture-raw:*script+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1114 (byte offset 1114): expected "l" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*signin:render:closed` (offset=725, exp=2073, act=2073)
  ```
  FAIL recapture-raw:*signin:render:closed (render-engine)
    first difference at code-unit offset 725 (byte offset 725): expected "S" but got "*"
    expected excerpt: ...ar-left col-9'>
  ```
- `recapture-raw:*signin:render:title` (offset=32, exp=55, act=55)
  ```
  FAIL recapture-raw:*signin:render:title (render-engine)
    first difference at code-unit offset 32 (byte offset 32): expected "S" but got "*"
    expected excerpt: <span class="card-title" title="Sign In">Sign In</span>
  ```
- `recapture-raw:Anonymous+*account+*email:record` (offset=61, exp=197, act=196)
  ```
  FAIL recapture-raw:Anonymous+*account+*email:record (card-engine)
    first difference at code-unit offset 61 (byte offset 61): expected "s" but got "+"
    expected excerpt: ...ull,"content":"noreply@wagn.org","key":"anonymous+*account+*email","left":"Anonymous+*account","...
  ```
- `recapture-raw:CoffeeScript+*type:render:content` (offset=2180, exp=60659, act=15646)
  ```
  FAIL recapture-raw:CoffeeScript+*type:render:content (render-engine)
    first difference at code-unit offset 2180 (byte offset 2180): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:CoffeeScript+*type:render:open` (offset=4797, exp=63304, act=18291)
  ```
  FAIL recapture-raw:CoffeeScript+*type:render:open (render-engine)
    first difference at code-unit offset 4797 (byte offset 4797): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Don't Send Your Kid to the Ivy League+Associates:render:open` (offset=262, exp=6188, act=5459)
  ```
  FAIL recapture-raw:Don't Send Your Kid to the Ivy League+Associates:render:open (render-engine)
    first difference at code-unit offset 262 (byte offset 262): expected "#" but got "a"
    expected excerpt: ...ciate" data-card-id="19933" data-card-name="Don&#39;t Send Your Kid to the Ivy League+Associates...
  ```
- `recapture-raw:Don't Send Your Kid to the Ivy League+discussion:render:open` (offset=271, exp=3757, act=3768)
  ```
  FAIL recapture-raw:Don't Send Your Kid to the Ivy League+discussion:render:open (render-engine)
    first difference at code-unit offset 271 (byte offset 271): expected "#" but got "a"
    expected excerpt: ...ssion" data-card-id="19935" data-card-name="Don&#39;t Send Your Kid to the Ivy League+discussion...
  ```
- `recapture-raw:I'd be more inclined to support the pro side...:render:open` (offset=201, exp=10754, act=10830)
  ```
  FAIL recapture-raw:I'd be more inclined to support the pro side...:render:open (render-engine)
    first difference at code-unit offset 201 (byte offset 201): expected "#" but got "a"
    expected excerpt: ...ro_side" data-card-id="19707" data-card-name="I&#39;d be more inclined to support the pro side.....
  ```
- `recapture-raw:I'd be more inclined to support the pro side...+discussion:render:open` (offset=286, exp=10307, act=10318)
  ```
  FAIL recapture-raw:I'd be more inclined to support the pro side...+discussion:render:open (render-engine)
    first difference at code-unit offset 286 (byte offset 286): expected "#" but got "a"
    expected excerpt: ...cussion" data-card-id="19716" data-card-name="I&#39;d be more inclined to support the pro side.....
  ```
- `recapture-raw:JavaScript+*type:render:content` (offset=2166, exp=60133, act=15528)
  ```
  FAIL recapture-raw:JavaScript+*type:render:content (render-engine)
    first difference at code-unit offset 2166 (byte offset 2166): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:JavaScript+*type:render:open` (offset=4755, exp=62750, act=18145)
  ```
  FAIL recapture-raw:JavaScript+*type:render:open (render-engine)
    first difference at code-unit offset 4755 (byte offset 4755): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Plans+*right:render:content` (offset=2358, exp=58595, act=12351)
  ```
  FAIL recapture-raw:Plans+*right:render:content (render-engine)
    first difference at code-unit offset 2358 (byte offset 2358): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21391" da...
  ```
- `recapture-raw:Plans+*right:render:open` (offset=4887, exp=61152, act=14908)
  ```
  FAIL recapture-raw:Plans+*right:render:open (render-engine)
    first difference at code-unit offset 4887 (byte offset 4887): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21391" da...
  ```
- `recapture-raw:*following+*right:render:content` (offset=2399, exp=65800, act=15451)
  ```
  FAIL recapture-raw:*following+*right:render:content (render-engine)
    first difference at code-unit offset 2399 (byte offset 2399): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21808" da...
  ```
- `recapture-raw:*following+*right:render:open` (offset=4993, exp=68422, act=18073)
  ```
  FAIL recapture-raw:*following+*right:render:open (render-engine)
    first difference at code-unit offset 4993 (byte offset 4993): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21808" da...
  ```
- `recapture-raw:*on create+*right:render:content` (offset=2402, exp=65819, act=9718)
  ```
  FAIL recapture-raw:*on create+*right:render:content (render-engine)
    first difference at code-unit offset 2402 (byte offset 2402): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21760" da...
  ```
- `recapture-raw:*on create+*right:render:open` (offset=5002, exp=68447, act=12346)
  ```
  FAIL recapture-raw:*on create+*right:render:open (render-engine)
    first difference at code-unit offset 5002 (byte offset 5002): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21760" da...
  ```
- `recapture-raw:*on delete+*right:render:content` (offset=2402, exp=65819, act=9718)
  ```
  FAIL recapture-raw:*on delete+*right:render:content (render-engine)
    first difference at code-unit offset 2402 (byte offset 2402): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21768" da...
  ```
- `recapture-raw:*on delete+*right:render:open` (offset=5002, exp=68447, act=12346)
  ```
  FAIL recapture-raw:*on delete+*right:render:open (render-engine)
    first difference at code-unit offset 5002 (byte offset 5002): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21768" da...
  ```
- `recapture-raw:*on update+*right:render:content` (offset=2402, exp=65819, act=9718)
  ```
  FAIL recapture-raw:*on update+*right:render:content (render-engine)
    first difference at code-unit offset 2402 (byte offset 2402): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21764" da...
  ```
- `recapture-raw:*on update+*right:render:open` (offset=5002, exp=68447, act=12346)
  ```
  FAIL recapture-raw:*on update+*right:render:open (render-engine)
    first difference at code-unit offset 5002 (byte offset 5002): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21764" da...
  ```
- `recapture-raw:Email template+*type:render:content` (offset=2190, exp=60914, act=7011)
  ```
  FAIL recapture-raw:Email template+*type:render:content (render-engine)
    first difference at code-unit offset 2190 (byte offset 2190): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Email template+*type:render:open` (offset=4830, exp=63582, act=9679)
  ```
  FAIL recapture-raw:Email template+*type:render:open (render-engine)
    first difference at code-unit offset 4830 (byte offset 4830): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Group+*right:render:content` (offset=2358, exp=64271, act=9564)
  ```
  FAIL recapture-raw:Group+*right:render:content (render-engine)
    first difference at code-unit offset 2358 (byte offset 2358): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21918" da...
  ```
- `recapture-raw:Group+*right:render:open` (offset=4890, exp=66831, act=12124)
  ```
  FAIL recapture-raw:Group+*right:render:open (render-engine)
    first difference at code-unit offset 4890 (byte offset 4890): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21918" da...
  ```
- `recapture-raw:Group+*right+*content options:render:content` (offset=515, exp=551, act=558)
  ```
  FAIL recapture-raw:Group+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 515 (byte offset 515): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type":"Group","sort":"name"}</div>
  ```
- `recapture-raw:Group+*right+*content options:render:open` (offset=3601, exp=3659, act=3666)
  ```
  FAIL recapture-raw:Group+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3601 (byte offset 3601): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:Group+*type:render:content` (offset=2127, exp=58601, act=6858)
  ```
  FAIL recapture-raw:Group+*type:render:content (render-engine)
    first difference at code-unit offset 2127 (byte offset 2127): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Group+*type:render:open` (offset=4641, exp=61143, act=9400)
  ```
  FAIL recapture-raw:Group+*type:render:open (render-engine)
    first difference at code-unit offset 4641 (byte offset 4641): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Guns:render:open` (offset=2734, exp=31170, act=25730)
  ```
  FAIL recapture-raw:Guns:render:open (render-engine)
    first difference at code-unit offset 2734 (byte offset 2734): expected "+" but got "G"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+tags&quot;,&quot;nest_syntax&quot;:&quot;+tags|...
  ```
- `recapture-raw:Log Entry+*type:render:content` (offset=2155, exp=59629, act=6926)
  ```
  FAIL recapture-raw:Log Entry+*type:render:content (render-engine)
    first difference at code-unit offset 2155 (byte offset 2155): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Log Entry+*type:render:open` (offset=4725, exp=62227, act=9524)
  ```
  FAIL recapture-raw:Log Entry+*type:render:open (render-engine)
    first difference at code-unit offset 4725 (byte offset 4725): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Exercise+*type:render:content` (offset=2180, exp=60697, act=10068)
  ```
  FAIL recapture-raw:MNv Exercise+*type:render:content (render-engine)
    first difference at code-unit offset 2180 (byte offset 2180): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:MNv Exercise+*type:render:open` (offset=4797, exp=63342, act=12713)
  ```
  FAIL recapture-raw:MNv Exercise+*type:render:open (render-engine)
    first difference at code-unit offset 4797 (byte offset 4797): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Person+discussion:render:open` (offset=3218, exp=4618, act=5953)
  ```
  FAIL recapture-raw:Person+discussion:render:open (render-engine)
    first difference at code-unit offset 3218 (byte offset 3219): expected "T" but got "S"
    expected excerpt: ...ni_bar-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="user design" data-...
  ```
- `recapture-raw:Project+*right:render:content` (offset=2376, exp=64933, act=12520)
  ```
  FAIL recapture-raw:Project+*right:render:content (render-engine)
    first difference at code-unit offset 2376 (byte offset 2376): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21913" da...
  ```
- `recapture-raw:Project+*right:render:open` (offset=4936, exp=67521, act=15108)
  ```
  FAIL recapture-raw:Project+*right:render:open (render-engine)
    first difference at code-unit offset 4936 (byte offset 4936): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21913" da...
  ```
- `recapture-raw:Project+*right+*content options:render:content` (offset=523, exp=562, act=162631)
  ```
  FAIL recapture-raw:Project+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 523 (byte offset 523): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type":"Project", "sort":"name"}</div>
  ```
- `recapture-raw:Project+*right+*content options:render:open` (offset=3632, exp=3693, act=165762)
  ```
  FAIL recapture-raw:Project+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3632 (byte offset 3632): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:Project+*right+*input type:render:closed` (offset=1114, exp=3013, act=3172)
  ```
  FAIL recapture-raw:Project+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1114 (byte offset 1114): expected "l" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Project+Task+*type plus right:render:content` (offset=2265, exp=69042, act=7166)
  ```
  FAIL recapture-raw:Project+Task+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2265 (byte offset 2265): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Project+Task+*type plus right:render:open` (offset=2721, exp=71942, act=9402)
  ```
  FAIL recapture-raw:Project+Task+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2721 (byte offset 2721): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Project+management+*self:render:content` (offset=2219, exp=61602, act=7080)
  ```
  FAIL recapture-raw:Project+management+*self:render:content (render-engine)
    first difference at code-unit offset 2219 (byte offset 2219): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Project+management+*self:render:open` (offset=2626, exp=64407, act=9254)
  ```
  FAIL recapture-raw:Project+management+*self:render:open (render-engine)
    first difference at code-unit offset 2626 (byte offset 2626): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Sign up+*type+*on create:render:closed` (offset=1094, exp=3014, act=3149)
  ```
  FAIL recapture-raw:Sign up+*type+*on create:render:closed (render-engine)
    first difference at code-unit offset 1094 (byte offset 1094): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Sign up+*type+*on create:render:open` (offset=1076, exp=5462, act=5597)
  ```
  FAIL recapture-raw:Sign up+*type+*on create:render:open (render-engine)
    first difference at code-unit offset 1076 (byte offset 1076): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Task+*right:render:content` (offset=2349, exp=63795, act=9533)
  ```
  FAIL recapture-raw:Task+*right:render:content (render-engine)
    first difference at code-unit offset 2349 (byte offset 2349): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21892" da...
  ```
- `recapture-raw:Task+*right:render:open` (offset=4867, exp=66341, act=12079)
  ```
  FAIL recapture-raw:Task+*right:render:open (render-engine)
    first difference at code-unit offset 4867 (byte offset 4867): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="21892" da...
  ```
- `recapture-raw:Task+*type:render:content` (offset=2120, exp=58892, act=10046)
  ```
  FAIL recapture-raw:Task+*type:render:content (render-engine)
    first difference at code-unit offset 2120 (byte offset 2120): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Task+*type:render:open` (offset=4620, exp=61420, act=12574)
  ```
  FAIL recapture-raw:Task+*type:render:open (render-engine)
    first difference at code-unit offset 4620 (byte offset 4620): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Task+Log Entry+*type plus right:render:open` (offset=2759, exp=72681, act=12357)
  ```
  FAIL recapture-raw:Task+Log Entry+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2759 (byte offset 2759): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Wishlist+Brandon+*self:render:content` (offset=2205, exp=61322, act=9887)
  ```
  FAIL recapture-raw:Wishlist+Brandon+*self:render:content (render-engine)
    first difference at code-unit offset 2205 (byte offset 2205): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Wishlist+Brandon+*self:render:open` (offset=2598, exp=64099, act=12041)
  ```
  FAIL recapture-raw:Wishlist+Brandon+*self:render:open (render-engine)
    first difference at code-unit offset 2598 (byte offset 2598): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:*all+*all+*follow:render:closed` (offset=1038, exp=3310, act=3321)
  ```
  FAIL recapture-raw:*all+*all+*follow:render:closed (render-engine)
    first difference at code-unit offset 1038 (byte offset 1038): expected "*" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*all+*all+*follow:render:open` (offset=1020, exp=3381, act=3392)
  ```
  FAIL recapture-raw:*all+*all+*follow:render:open (render-engine)
    first difference at code-unit offset 1020 (byte offset 1020): expected "*" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*all+*follow fields:render:closed` (offset=1049, exp=2811, act=2974)
  ```
  FAIL recapture-raw:*all+*follow fields:render:closed (render-engine)
    first difference at code-unit offset 1049 (byte offset 1049): expected "*" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*all+*follow fields:render:open` (offset=1031, exp=2880, act=3043)
  ```
  FAIL recapture-raw:*all+*follow fields:render:open (render-engine)
    first difference at code-unit offset 1031 (byte offset 1031): expected "*" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*default html view+*right:render:content` (offset=2476, exp=62095, act=9976)
  ```
  FAIL recapture-raw:*default html view+*right:render:content (render-engine)
    first difference at code-unit offset 2476 (byte offset 2476): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="22768" da...
  ```
- `recapture-raw:*default html view+*right:render:open` (offset=5188, exp=64835, act=12716)
  ```
  FAIL recapture-raw:*default html view+*right:render:open (render-engine)
    first difference at code-unit offset 5188 (byte offset 5188): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="22768" da...
  ```
- `recapture-raw:*follow fields+*right:render:content` (offset=2432, exp=66913, act=9825)
  ```
  FAIL recapture-raw:*follow fields+*right:render:content (render-engine)
    first difference at code-unit offset 2432 (byte offset 2432): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="22729" da...
  ```
- `recapture-raw:*follow fields+*right:render:open` (offset=5083, exp=69592, act=12504)
  ```
  FAIL recapture-raw:*follow fields+*right:render:open (render-engine)
    first difference at code-unit offset 5083 (byte offset 5083): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="22729" da...
  ```
- `recapture-raw:*follow+*right:render:content` (offset=2375, exp=65178, act=15188)
  ```
  FAIL recapture-raw:*follow+*right:render:content (render-engine)
    first difference at code-unit offset 2375 (byte offset 2375): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="22722" da...
  ```
- `recapture-raw:*follow+*right:render:open` (offset=4933, exp=67764, act=17774)
  ```
  FAIL recapture-raw:*follow+*right:render:open (render-engine)
    first difference at code-unit offset 4933 (byte offset 4933): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="22722" da...
  ```
- `recapture-raw:*follow+*right+*input type:render:closed` (offset=1114, exp=3014, act=3175)
  ```
  FAIL recapture-raw:*follow+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1114 (byte offset 1114): expected "r" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:BHG 1948 Ch 7 p 22 Old Fashioned Sugar Cookies and Fig Bars+tags:render:open` (offset=3041, exp=4709, act=3966)
  ```
  FAIL recapture-raw:BHG 1948 Ch 7 p 22 Old Fashioned Sugar Cookies and Fig Bars+tags:render:open (render-engine)
    first difference at code-unit offset 3041 (byte offset 3041): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:BasicCs+*type:render:content` (offset=2141, exp=59234, act=9701)
  ```
  FAIL recapture-raw:BasicCs+*type:render:content (render-engine)
    first difference at code-unit offset 2141 (byte offset 2141): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:BasicCs+*type:render:open` (offset=4683, exp=61804, act=12271)
  ```
  FAIL recapture-raw:BasicCs+*type:render:open (render-engine)
    first difference at code-unit offset 4683 (byte offset 4683): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Message+Conversation+*type plus right:render:open` (offset=2839, exp=21752, act=12578)
  ```
  FAIL recapture-raw:Message+Conversation+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2839 (byte offset 2839): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Old Project+*type:render:content` (offset=2169, exp=60143, act=6960)
  ```
  FAIL recapture-raw:Old Project+*type:render:content (render-engine)
    first difference at code-unit offset 2169 (byte offset 2169): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Old Project+*type:render:open` (offset=4767, exp=62769, act=9586)
  ```
  FAIL recapture-raw:Old Project+*type:render:open (render-engine)
    first difference at code-unit offset 4767 (byte offset 4767): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Person+*following+*type plus right:render:content` (offset=2300, exp=70827, act=10287)
  ```
  FAIL recapture-raw:Person+*following+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2300 (byte offset 2300): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Person+*following+*type plus right:render:open` (offset=2791, exp=73797, act=12573)
  ```
  FAIL recapture-raw:Person+*following+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2791 (byte offset 2791): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Project+legacy+*type plus right:render:content` (offset=2284, exp=63447, act=7205)
  ```
  FAIL recapture-raw:Project+legacy+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2284 (byte offset 2284): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Project+legacy+*type plus right:render:open` (offset=2759, exp=66385, act=9466)
  ```
  FAIL recapture-raw:Project+legacy+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2759 (byte offset 2759): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Seeley inquiry+overview+*self:render:content` (offset=2254, exp=63135, act=10104)
  ```
  FAIL recapture-raw:Seeley inquiry+overview+*self:render:content (render-engine)
    first difference at code-unit offset 2254 (byte offset 2254): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Seeley inquiry+overview+*self:render:open` (offset=2696, exp=66010, act=12328)
  ```
  FAIL recapture-raw:Seeley inquiry+overview+*self:render:open (render-engine)
    first difference at code-unit offset 2696 (byte offset 2696): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Social Media Schedule+Dr Myth+20141220+*self:render:content` (offset=2363, exp=67316, act=10599)
  ```
  FAIL recapture-raw:Social Media Schedule+Dr Myth+20141220+*self:render:content (render-engine)
    first difference at code-unit offset 2363 (byte offset 2363): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:bootstrap default skin:render:content` (offset=410, exp=4220, act=458)
  ```
  FAIL recapture-raw:bootstrap default skin:render:content (render-engine)
    first difference at code-unit offset 410 (byte offset 410): expected "<" but got "t"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:bootstrap default skin:render:open` (offset=2653, exp=6491, act=2729)
  ```
  FAIL recapture-raw:bootstrap default skin:render:open (render-engine)
    first difference at code-unit offset 2653 (byte offset 2653): expected "<" but got "t"
    expected excerpt: ...t;],&quot;home_view&quot;:&quot;content&quot;}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:cerulean skin:render:open` (offset=725, exp=9360, act=2661)
  ```
  FAIL recapture-raw:cerulean skin:render:open (render-engine)
    first difference at code-unit offset 725 (byte offset 725): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:cosmo skin:render:open` (offset=707, exp=9207, act=2610)
  ```
  FAIL recapture-raw:cosmo skin:render:open (render-engine)
    first difference at code-unit offset 707 (byte offset 707): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:cyborg skin:render:open` (offset=713, exp=9258, act=2627)
  ```
  FAIL recapture-raw:cyborg skin:render:open (render-engine)
    first difference at code-unit offset 713 (byte offset 713): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:darkly skin:render:open` (offset=713, exp=9258, act=2627)
  ```
  FAIL recapture-raw:darkly skin:render:open (render-engine)
    first difference at code-unit offset 713 (byte offset 713): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:flatly skin:render:open` (offset=713, exp=9258, act=2627)
  ```
  FAIL recapture-raw:flatly skin:render:open (render-engine)
    first difference at code-unit offset 713 (byte offset 713): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:journal skin:render:open` (offset=719, exp=9313, act=2644)
  ```
  FAIL recapture-raw:journal skin:render:open (render-engine)
    first difference at code-unit offset 719 (byte offset 719): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:lumen skin:render:open` (offset=707, exp=9207, act=2610)
  ```
  FAIL recapture-raw:lumen skin:render:open (render-engine)
    first difference at code-unit offset 707 (byte offset 707): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:sabrina mejias:render:content` (offset=385, exp=10762, act=8407)
  ```
  FAIL recapture-raw:sabrina mejias:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:sabrina mejias:render:open` (offset=2536, exp=12941, act=10586)
  ```
  FAIL recapture-raw:sabrina mejias:render:open (render-engine)
    first difference at code-unit offset 2536 (byte offset 2536): expected " " but got ">"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><div class='invite-links'>
  ```
- `recapture-raw:sandstone skin:render:open` (offset=731, exp=9411, act=2678)
  ```
  FAIL recapture-raw:sandstone skin:render:open (render-engine)
    first difference at code-unit offset 731 (byte offset 731): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:simplex skin:render:open` (offset=719, exp=9309, act=2644)
  ```
  FAIL recapture-raw:simplex skin:render:open (render-engine)
    first difference at code-unit offset 719 (byte offset 719): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:slate skin:render:open` (offset=707, exp=9211, act=2610)
  ```
  FAIL recapture-raw:slate skin:render:open (render-engine)
    first difference at code-unit offset 707 (byte offset 707): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:spacelab skin:render:open` (offset=725, exp=9360, act=2661)
  ```
  FAIL recapture-raw:spacelab skin:render:open (render-engine)
    first difference at code-unit offset 725 (byte offset 725): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:superhero skin:render:open` (offset=731, exp=9411, act=2678)
  ```
  FAIL recapture-raw:superhero skin:render:open (render-engine)
    first difference at code-unit offset 731 (byte offset 731): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:tetragrammatonium+*self:render:content` (offset=2212, exp=61868, act=7063)
  ```
  FAIL recapture-raw:tetragrammatonium+*self:render:content (render-engine)
    first difference at code-unit offset 2212 (byte offset 2212): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:tetragrammatonium+*self:render:open` (offset=4896, exp=64580, act=9775)
  ```
  FAIL recapture-raw:tetragrammatonium+*self:render:open (render-engine)
    first difference at code-unit offset 4896 (byte offset 4896): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:united skin:render:open` (offset=713, exp=9258, act=2627)
  ```
  FAIL recapture-raw:united skin:render:open (render-engine)
    first difference at code-unit offset 713 (byte offset 713): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:yeti skin:render:open` (offset=701, exp=9156, act=2593)
  ```
  FAIL recapture-raw:yeti skin:render:open (render-engine)
    first difference at code-unit offset 701 (byte offset 701): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:*debugger+*self+*content options:render:content` (offset=527, exp=539, act=570)
  ```
  FAIL recapture-raw:*debugger+*self+*content options:render:content (render-engine)
    first difference at code-unit offset 527 (byte offset 527): expected "[" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">[[on]]</div>
  ```
- `recapture-raw:*debugger+*self+*content options:render:open` (offset=3619, exp=3653, act=3684)
  ```
  FAIL recapture-raw:*debugger+*self+*content options:render:open (render-engine)
    first difference at code-unit offset 3619 (byte offset 3619): expected "[" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:*debugger+*self+*input type:render:closed` (offset=1122, exp=3032, act=3199)
  ```
  FAIL recapture-raw:*debugger+*self+*input type:render:closed (render-engine)
    first difference at code-unit offset 1122 (byte offset 1122): expected "c" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*debugger+*self+*input type:render:open` (offset=1104, exp=3027, act=3994)
  ```
  FAIL recapture-raw:*debugger+*self+*input type:render:open (render-engine)
    first difference at code-unit offset 1104 (byte offset 1104): expected "c" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*recent settings:render:content` (offset=906, exp=48959, act=48324)
  ```
  FAIL recapture-raw:*recent settings:render:content (render-engine)
    first difference at code-unit offset 906 (byte offset 906): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Setting&quot;}"><div cla...
  ```
- `recapture-raw:*recent settings+*self+*content options:render:content` (offset=553, exp=577, act=62731)
  ```
  FAIL recapture-raw:*recent settings+*self+*content options:render:content (render-engine)
    first difference at code-unit offset 553 (byte offset 553): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type":"setting"}</div>
  ```
- `recapture-raw:*recent settings+*self+*content options:render:open` (offset=3724, exp=3770, act=65924)
  ```
  FAIL recapture-raw:*recent settings+*self+*content options:render:open (render-engine)
    first difference at code-unit offset 3724 (byte offset 3724): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:Alex Freeman - Tricky Question Can Teach Lessons to More Than College Classes+tags:render:open` (offset=3273, exp=7621, act=6812)
  ```
  FAIL recapture-raw:Alex Freeman - Tricky Question Can Teach Lessons to More Than College Classes+tags:render:open (render-engine)
    first difference at code-unit offset 3273 (byte offset 3273): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Brandon feedback+discussion+*self:render:content` (offset=2282, exp=64439, act=13259)
  ```
  FAIL recapture-raw:Brandon feedback+discussion+*self:render:content (render-engine)
    first difference at code-unit offset 2282 (byte offset 2282): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Brandon feedback+discussion+*self:render:open` (offset=2752, exp=67370, act=15523)
  ```
  FAIL recapture-raw:Brandon feedback+discussion+*self:render:open (render-engine)
    first difference at code-unit offset 2752 (byte offset 2752): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Dan Williams:render:content` (offset=375, exp=10723, act=8368)
  ```
  FAIL recapture-raw:Dan Williams:render:content (render-engine)
    first difference at code-unit offset 375 (byte offset 375): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Dan Williams:render:open` (offset=2495, exp=12871, act=10516)
  ```
  FAIL recapture-raw:Dan Williams:render:open (render-engine)
    first difference at code-unit offset 2495 (byte offset 2495): expected " " but got ">"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><div class='invite-links'>
  ```
- `recapture-raw:Giovanni Sanchez:render:content` (offset=393, exp=10793, act=8441)
  ```
  FAIL recapture-raw:Giovanni Sanchez:render:content (render-engine)
    first difference at code-unit offset 393 (byte offset 393): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Giovanni Sanchez:render:open` (offset=2570, exp=12998, act=10646)
  ```
  FAIL recapture-raw:Giovanni Sanchez:render:open (render-engine)
    first difference at code-unit offset 2570 (byte offset 2570): expected " " but got ">"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><div class='invite-links'>
  ```
- `recapture-raw:A Taste of Your Own Medicine The Problematic Nature of Revenge+discussion+*self:render:content` (offset=2604, exp=76097, act=11690)
  ```
  FAIL recapture-raw:A Taste of Your Own Medicine The Problematic Nature of Revenge+discussion+*self:render:content (render-engine)
    first difference at code-unit offset 2604 (byte offset 2604): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:A Taste of Your Own Medicine The Problematic Nature of Revenge+discussion+*self:render:open` (offset=3396, exp=79672, act=14414)
  ```
  FAIL recapture-raw:A Taste of Your Own Medicine The Problematic Nature of Revenge+discussion+*self:render:open (render-engine)
    first difference at code-unit offset 3396 (byte offset 3396): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Aikido and Practicing Peace Like A Martial Art+*self:render:content` (offset=2413, exp=69304, act=10879)
  ```
  FAIL recapture-raw:Aikido and Practicing Peace Like A Martial Art+*self:render:content (render-engine)
    first difference at code-unit offset 2413 (byte offset 2413): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Charles Duhigg-What Google Learned From Its Quest to Build the Perfect Team+tags:render:open` (offset=3270, exp=8229, act=7420)
  ```
  FAIL recapture-raw:Charles Duhigg-What Google Learned From Its Quest to Build the Perfect Team+tags:render:open (render-engine)
    first difference at code-unit offset 3270 (byte offset 3270): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Jo Marchant - How Meditation Placebos And Virtual Reality Help Power Mind Over Body+tags:render:open` (offset=3367, exp=7838, act=7001)
  ```
  FAIL recapture-raw:Jo Marchant - How Meditation Placebos And Virtual Reality Help Power Mind Over Body+tags:render:open (render-engine)
    first difference at code-unit offset 3367 (byte offset 3367): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Marc Sacks:render:content` (offset=367, exp=10691, act=8334)
  ```
  FAIL recapture-raw:Marc Sacks:render:content (render-engine)
    first difference at code-unit offset 367 (byte offset 367): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Marc Sacks:render:open` (offset=2461, exp=12813, act=10456)
  ```
  FAIL recapture-raw:Marc Sacks:render:open (render-engine)
    first difference at code-unit offset 2461 (byte offset 2461): expected " " but got ">"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><div class='invite-links'>
  ```
- `recapture-raw:Psychology on the Outside and Mythology On The Inside+*self:render:content` (offset=2462, exp=71117, act=11096)
  ```
  FAIL recapture-raw:Psychology on the Outside and Mythology On The Inside+*self:render:content (render-engine)
    first difference at code-unit offset 2462 (byte offset 2462): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Tesfaye Tekelu:render:content` (offset=385, exp=10764, act=8407)
  ```
  FAIL recapture-raw:Tesfaye Tekelu:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Tesfaye Tekelu:render:open` (offset=2536, exp=12943, act=10586)
  ```
  FAIL recapture-raw:Tesfaye Tekelu:render:open (render-engine)
    first difference at code-unit offset 2536 (byte offset 2536): expected " " but got ">"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><div class='invite-links'>
  ```
- `recapture-raw:Anthony Gonzales:render:content` (offset=391, exp=10790, act=8436)
  ```
  FAIL recapture-raw:Anthony Gonzales:render:content (render-engine)
    first difference at code-unit offset 391 (byte offset 391): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Anthony Gonzales:render:open` (offset=2563, exp=12990, act=10636)
  ```
  FAIL recapture-raw:Anthony Gonzales:render:open (render-engine)
    first difference at code-unit offset 2563 (byte offset 2563): expected " " but got ">"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><div class='invite-links'>
  ```
- `recapture-raw:Excerpt from Mid-Life Covenant Healing Ritual after Hysterectomy+tags:render:open` (offset=3126, exp=6530, act=5761)
  ```
  FAIL recapture-raw:Excerpt from Mid-Life Covenant Healing Ritual after Hysterectomy+tags:render:open (render-engine)
    first difference at code-unit offset 3126 (byte offset 3126): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Paul Simon - The Werewolf:render:open` (offset=3754, exp=7593, act=7618)
  ```
  FAIL recapture-raw:Paul Simon - The Werewolf:render:open (render-engine)
    first difference at code-unit offset 3754 (byte offset 3754): expected "+" but got "P"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+YouTube&quot;,&quot;nest_syntax&quot;:&quot;+Yo...
  ```
- `recapture-raw:Bessel van der Kolk Here and Now New Ways Of Treating Trauma Try Some Yoga+tags:render:open` (offset=3261, exp=6465, act=5668)
  ```
  FAIL recapture-raw:Bessel van der Kolk Here and Now New Ways Of Treating Trauma Try Some Yoga+tags:render:open (render-engine)
    first difference at code-unit offset 3261 (byte offset 3261): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Carl Jung interview with H.R. Knickerbocker 1938 Cosmopolitan+tags:render:open` (offset=3074, exp=11003, act=10259)
  ```
  FAIL recapture-raw:Carl Jung interview with H.R. Knickerbocker 1938 Cosmopolitan+tags:render:open (render-engine)
    first difference at code-unit offset 3074 (byte offset 3074): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:David Berceli - Conflict resolution and Post Traumatic Stress Disorder A dialectic TRE 2009+discussion:render:open` (offset=4586, exp=4859, act=4682)
  ```
  FAIL recapture-raw:David Berceli - Conflict resolution and Post Traumatic Stress Disorder A dialectic TRE 2009+discussion:render:open (render-engine)
    first difference at code-unit offset 4586 (byte offset 4587): expected "<" but got "["
    expected excerpt: ...t;home_view&quot;:&quot;content&quot;}"><p> see <a class="known-card" href="/Ryan_Nichols_Trauma...
  ```
- `recapture-raw:David Berceli - Conflict resolution and Post Traumatic Stress Disorder A dialectic TRE 2009+tags:render:open` (offset=3484, exp=13874, act=13033)
  ```
  FAIL recapture-raw:David Berceli - Conflict resolution and Post Traumatic Stress Disorder A dialectic TRE 2009+tags:render:open (render-engine)
    first difference at code-unit offset 3484 (byte offset 3484): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Derek Thompson - The Four-Letter Code to Selling Just About Anything+tags:render:open` (offset=3162, exp=4890, act=4111)
  ```
  FAIL recapture-raw:Derek Thompson - The Four-Letter Code to Selling Just About Anything+tags:render:open (render-engine)
    first difference at code-unit offset 3162 (byte offset 3162): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Don't Wait For The Study+*self:render:content` (offset=254, exp=69097, act=7194)
  ```
  FAIL recapture-raw:Don't Wait For The Study+*self:render:content (render-engine)
    first difference at code-unit offset 254 (byte offset 254): expected "#" but got "a"
    expected excerpt: ...ntent" data-card-id="26849" data-card-name="Don&#39;t Wait For The Study+*self" data-card-type-i...
  ```
- `recapture-raw:Don't Wait For The Study+*self:render:open` (offset=232, exp=71931, act=10036)
  ```
  FAIL recapture-raw:Don't Wait For The Study+*self:render:open (render-engine)
    first difference at code-unit offset 232 (byte offset 232): expected "#" but got "a"
    expected excerpt: ...Xself" data-card-id="26849" data-card-name="Don&#39;t Wait For The Study+*self" data-card-type-i...
  ```
- `recapture-raw:Don't Wait For The Study+*self+Brandon WilliamsCraig+*follow:render:closed` (offset=302, exp=4051, act=4072)
  ```
  FAIL recapture-raw:Don't Wait For The Study+*self+Brandon WilliamsCraig+*follow:render:closed (render-engine)
    first difference at code-unit offset 302 (byte offset 302): expected "#" but got "a"
    expected excerpt: ...ollow" data-card-id="26851" data-card-name="Don&#39;t Wait For The Study+*self+Brandon WilliamsC...
  ```
- `recapture-raw:Don't Wait For The Study+*self+Brandon WilliamsCraig+*follow:render:open` (offset=298, exp=4079, act=4100)
  ```
  FAIL recapture-raw:Don't Wait For The Study+*self+Brandon WilliamsCraig+*follow:render:open (render-engine)
    first difference at code-unit offset 298 (byte offset 298): expected "#" but got "a"
    expected excerpt: ...ollow" data-card-id="26851" data-card-name="Don&#39;t Wait For The Study+*self+Brandon WilliamsC...
  ```
- `recapture-raw:Don't Wait For The Study+discussion:render:open` (offset=252, exp=3494, act=3505)
  ```
  FAIL recapture-raw:Don't Wait For The Study+discussion:render:open (render-engine)
    first difference at code-unit offset 252 (byte offset 252): expected "#" but got "a"
    expected excerpt: ...ssion" data-card-id="26847" data-card-name="Don&#39;t Wait For The Study+discussion" data-card-t...
  ```
- `recapture-raw:Henry Corbin Mundus Imaginalis or the Imaginary and the Imaginal+tags:render:open` (offset=3116, exp=11512, act=10747)
  ```
  FAIL recapture-raw:Henry Corbin Mundus Imaginalis or the Imaginary and the Imaginal+tags:render:open (render-engine)
    first difference at code-unit offset 3116 (byte offset 3116): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Jeneen Interlandi on Bessel van der Kolk NY Times A Revolutionary Approach To Treating PTSD+tags:render:open` (offset=3499, exp=9075, act=8220)
  ```
  FAIL recapture-raw:Jeneen Interlandi on Bessel van der Kolk NY Times A Revolutionary Approach To Treating PTSD+tags:render:open (render-engine)
    first difference at code-unit offset 3499 (byte offset 3499): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Martha Eddy - Access to Somatic Theory and Applications - Socio-political Concerns+tags:render:open` (offset=3328, exp=6550, act=5735)
  ```
  FAIL recapture-raw:Martha Eddy - Access to Somatic Theory and Applications - Socio-political Concerns+tags:render:open (render-engine)
    first difference at code-unit offset 3328 (byte offset 3328): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Pasta Faggioli:render:open` (offset=3034, exp=11927, act=11968)
  ```
  FAIL recapture-raw:Pasta Faggioli:render:open (render-engine)
    first difference at code-unit offset 3034 (byte offset 3034): expected "+" but got "P"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+ingredients&quot;,&quot;nest_syntax&quot;:&quot...
  ```
- `recapture-raw:Steve Usdin - When a Foreign Government Interfered in a US Election to Reelect FDR+tags:render:open` (offset=3353, exp=6745, act=5922)
  ```
  FAIL recapture-raw:Steve Usdin - When a Foreign Government Interfered in a US Election to Reelect FDR+tags:render:open (render-engine)
    first difference at code-unit offset 3353 (byte offset 3353): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:DAVID LEONHARDT - From Michael Lewis, the Story of Two Friends Who Changed How We Think About the Way We Think+tags:render:open` (offset=3730, exp=23419, act=22559)
  ```
  FAIL recapture-raw:DAVID LEONHARDT - From Michael Lewis, the Story of Two Friends Who Changed How We Think About the Way We Think+tags:render:open (render-engine)
    first difference at code-unit offset 3730 (byte offset 3730): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Hannes Grassegger and Mikael Krogerus - The Data That Turned the World Upside Down:render:open` (offset=4388, exp=36376, act=74913)
  ```
  FAIL recapture-raw:Hannes Grassegger and Mikael Krogerus - The Data That Turned the World Upside Down:render:open (render-engine)
    first difference at code-unit offset 4388 (byte offset 4388): expected "+" but got "H"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Hannes Grassegger and Mikael Krogerus - The Data That Turned the World Upside Down+discussion:render:open` (offset=4606, exp=6237, act=5769)
  ```
  FAIL recapture-raw:Hannes Grassegger and Mikael Krogerus - The Data That Turned the World Upside Down+discussion:render:open (render-engine)
    first difference at code-unit offset 4606 (byte offset 4608): expected "<" but got "P"
    expected excerpt: ...0 AM</p>
  ```
- `recapture-raw:Hannes Grassegger and Mikael Krogerus - The Data That Turned the World Upside Down+tags:render:open` (offset=3353, exp=13837, act=13014)
  ```
  FAIL recapture-raw:Hannes Grassegger and Mikael Krogerus - The Data That Turned the World Upside Down+tags:render:open (render-engine)
    first difference at code-unit offset 3353 (byte offset 3353): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Jamie McHugh - Embodying Nature, Becoming Ourselves: An Eco-Somatic Journey+tags:render:open` (offset=3235, exp=8810, act=8021)
  ```
  FAIL recapture-raw:Jamie McHugh - Embodying Nature, Becoming Ourselves: An Eco-Somatic Journey+tags:render:open (render-engine)
    first difference at code-unit offset 3235 (byte offset 3235): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Jim Gilliam - The Global Transition to Community - CMX Summit West 2015+tags:render:open` (offset=3180, exp=11120, act=10357)
  ```
  FAIL recapture-raw:Jim Gilliam - The Global Transition to Community - CMX Summit West 2015+tags:render:open (render-engine)
    first difference at code-unit offset 3180 (byte offset 3180): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Philip Gorski - What kind of freedom does a republic promise?+tags:render:open` (offset=3044, exp=9080, act=8336)
  ```
  FAIL recapture-raw:Philip Gorski - What kind of freedom does a republic promise?+tags:render:open (render-engine)
    first difference at code-unit offset 3044 (byte offset 3044): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Gregory Warner - Remembering Michael Sharp - He Risked His Life To Make Peace:render:open` (offset=4253, exp=33981, act=44252)
  ```
  FAIL recapture-raw:Gregory Warner - Remembering Michael Sharp - He Risked His Life To Make Peace:render:open (render-engine)
    first difference at code-unit offset 4253 (byte offset 4253): expected "+" but got "G"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Gregory Warner - Remembering Michael Sharp - He Risked His Life To Make Peace+tags:render:open` (offset=3263, exp=14503, act=13726)
  ```
  FAIL recapture-raw:Gregory Warner - Remembering Michael Sharp - He Risked His Life To Make Peace+tags:render:open (render-engine)
    first difference at code-unit offset 3263 (byte offset 3263): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Lulu Garcia-Navarro NPR talks to Bishop Karen Oliveto - Openly Gay Bishop At Center Of Controversy In United Methodist Church+tags:render:open` (offset=3960, exp=8488, act=7481)
  ```
  FAIL recapture-raw:Lulu Garcia-Navarro NPR talks to Bishop Karen Oliveto - Openly Gay Bishop At Center Of Controversy In United Methodist Church+tags:render:open (render-engine)
    first difference at code-unit offset 3960 (byte offset 3960): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:RWE TFD Communications+job description+Duties+*self:render:content` (offset=2396, exp=68985, act=10748)
  ```
  FAIL recapture-raw:RWE TFD Communications+job description+Duties+*self:render:content (render-engine)
    first difference at code-unit offset 2396 (byte offset 2396): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Why Do People Who Need Help From the Government Hate It So Much?+tags:render:open` (offset=3116, exp=8595, act=7839)
  ```
  FAIL recapture-raw:Why Do People Who Need Help From the Government Hate It So Much?+tags:render:open (render-engine)
    first difference at code-unit offset 3116 (byte offset 3116): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:A Relational-Existential Psychology - Ethics and Embodiment+tags:render:open` (offset=3031, exp=8647, act=7926)
  ```
  FAIL recapture-raw:A Relational-Existential Psychology - Ethics and Embodiment+tags:render:open (render-engine)
    first difference at code-unit offset 3031 (byte offset 3031): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Anna Shneiderman:render:open` (offset=2930, exp=5667, act=3255)
  ```
  FAIL recapture-raw:Anna Shneiderman:render:open (render-engine)
    first difference at code-unit offset 2930 (byte offset 2937): expected "d" but got "/"
    expected excerpt: ...trong>Relationships</strong></h1>
  ```
- `recapture-raw:Black Mothers Keep Dying After Giving Birth Shalon Irvings Story Explains Why+tags:render:open` (offset=3293, exp=15181, act=14396)
  ```
  FAIL recapture-raw:Black Mothers Keep Dying After Giving Birth Shalon Irvings Story Explains Why+tags:render:open (render-engine)
    first difference at code-unit offset 3293 (byte offset 3293): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Ragged Wing Flight Deck Ensemble Communications Manager+Owner:render:open` (offset=3018, exp=6372, act=5597)
  ```
  FAIL recapture-raw:Ragged Wing Flight Deck Ensemble Communications Manager+Owner:render:open (render-engine)
    first difference at code-unit offset 3018 (byte offset 3018): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Ron Huggins:render:content` (offset=371, exp=2580, act=388)
  ```
  FAIL recapture-raw:Ron Huggins:render:content (render-engine)
    first difference at code-unit offset 371 (byte offset 371): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Roundtable+How To Connect+discussion:render:open` (offset=4076, exp=4464, act=4389)
  ```
  FAIL recapture-raw:Roundtable+How To Connect+discussion:render:open (render-engine)
    first difference at code-unit offset 4076 (byte offset 4078): expected "<" but got "a"
    expected excerpt: ...sp;</p>
  ```
- `recapture-raw:Conflict Done Well for the Cadets of the UC Berkeley ROTC program+*self:render:content` (offset=2542, exp=74189, act=11451)
  ```
  FAIL recapture-raw:Conflict Done Well for the Cadets of the UC Berkeley ROTC program+*self:render:content (render-engine)
    first difference at code-unit offset 2542 (byte offset 2542): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Denise Corbett:render:content` (offset=385, exp=2630, act=402)
  ```
  FAIL recapture-raw:Denise Corbett:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Depth Psychology and Somatics--Learning Frontiers+discussion:render:open` (offset=4444, exp=6712, act=6660)
  ```
  FAIL recapture-raw:Depth Psychology and Somatics--Learning Frontiers+discussion:render:open (render-engine)
    first difference at code-unit offset 4444 (byte offset 4446): expected "f" but got "F"
    expected excerpt: ...pth Psychology and Somatics--Learning Frontiers+file&quot;,&quot;nest_syntax&quot;:&quot;Depth P...
  ```
- `recapture-raw:FAUXS - Fake Human Influencers - Artificial Yes - Intelligence No+articles:render:open` (offset=3141, exp=7265, act=6490)
  ```
  FAIL recapture-raw:FAUXS - Fake Human Influencers - Artificial Yes - Intelligence No+articles:render:open (render-engine)
    first difference at code-unit offset 3141 (byte offset 3141): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:FAUXS - Fake Human Influencers - Artificial Yes - Intelligence No+tags:render:open` (offset=3069, exp=8085, act=7334)
  ```
  FAIL recapture-raw:FAUXS - Fake Human Influencers - Artificial Yes - Intelligence No+tags:render:open (render-engine)
    first difference at code-unit offset 3069 (byte offset 3069): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:MIRANDA KATZ - CGI INFLUENCERS LIKE LIL MIQUELA ARE ABOUT TO FLOOD YOUR FEEDS+tags:render:content` (offset=835, exp=4929, act=4929)
  ```
  FAIL recapture-raw:MIRANDA KATZ - CGI INFLUENCERS LIKE LIL MIQUELA ARE ABOUT TO FLOOD YOUR FEEDS+tags:render:content (render-engine)
    first difference at code-unit offset 835 (byte offset 835): expected "b" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="fauxs" data-card-type-i...
  ```
- `recapture-raw:MIRANDA KATZ - CGI INFLUENCERS LIKE LIL MIQUELA ARE ABOUT TO FLOOD YOUR FEEDS+tags:render:open` (offset=3278, exp=8354, act=7543)
  ```
  FAIL recapture-raw:MIRANDA KATZ - CGI INFLUENCERS LIKE LIL MIQUELA ARE ABOUT TO FLOOD YOUR FEEDS+tags:render:open (render-engine)
    first difference at code-unit offset 3278 (byte offset 3278): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Person+Task+*type plus right:render:content` (offset=2258, exp=62994, act=7149)
  ```
  FAIL recapture-raw:Person+Task+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2258 (byte offset 2258): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Person+Task+*type plus right:render:open` (offset=2707, exp=65880, act=9375)
  ```
  FAIL recapture-raw:Person+Task+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2707 (byte offset 2707): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Serenity 2001 Ford E-350 Super Duty Diesel Extended Van+Documents:render:open` (offset=3092, exp=4171, act=3407)
  ```
  FAIL recapture-raw:Serenity 2001 Ford E-350 Super Duty Diesel Extended Van+Documents:render:open (render-engine)
    first difference at code-unit offset 3092 (byte offset 3092): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Thomas Berry - Renewing Earth--From Anthropocentrism to Ecocentrism+tags:render:open` (offset=3139, exp=18320, act=17587)
  ```
  FAIL recapture-raw:Thomas Berry - Renewing Earth--From Anthropocentrism to Ecocentrism+tags:render:open (render-engine)
    first difference at code-unit offset 3139 (byte offset 3139): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:USABP Presentation 20181102+discussion:render:open` (offset=5967, exp=13047, act=12591)
  ```
  FAIL recapture-raw:USABP Presentation 20181102+discussion:render:open (render-engine)
    first difference at code-unit offset 5967 (byte offset 5967): expected "<" but got "["
    expected excerpt: ...nce held at Pacifica Graduate Institute</p>
  ```
- `recapture-raw:children:render:open` (offset=2421, exp=10926, act=2458)
  ```
  FAIL recapture-raw:children:render:open (render-engine)
    first difference at code-unit offset 2421 (byte offset 2421): expected "d" but got "/"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><p><div id="child-Xreferred_to_by-titled-view" class...
  ```
- `recapture-raw:Barbara Holmes - Joy Unspeakable: Contemplative Practices of the Black Church excerpt:render:open` (offset=4427, exp=34637, act=43258)
  ```
  FAIL recapture-raw:Barbara Holmes - Joy Unspeakable: Contemplative Practices of the Black Church excerpt:render:open (render-engine)
    first difference at code-unit offset 4427 (byte offset 4427): expected "+" but got "B"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Barbara Holmes - Joy Unspeakable: Contemplative Practices of the Black Church excerpt+tags:render:open` (offset=3380, exp=11513, act=10693)
  ```
  FAIL recapture-raw:Barbara Holmes - Joy Unspeakable: Contemplative Practices of the Black Church excerpt+tags:render:open (render-engine)
    first difference at code-unit offset 3380 (byte offset 3380): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:PGI+DP+Soma+Classes 2017-18+*self:render:content` (offset=2274, exp=70163, act=10220)
  ```
  FAIL recapture-raw:PGI+DP+Soma+Classes 2017-18+*self:render:content (render-engine)
    first difference at code-unit offset 2274 (byte offset 2274): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Petrice Kam:render:content` (offset=373, exp=2581, act=390)
  ```
  FAIL recapture-raw:Petrice Kam:render:content (render-engine)
    first difference at code-unit offset 373 (byte offset 373): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Rachel Aviv - The Trauma of Facing Deportation+discussion:render:open` (offset=4356, exp=6533, act=6170)
  ```
  FAIL recapture-raw:Rachel Aviv - The Trauma of Facing Deportation+discussion:render:open (render-engine)
    first difference at code-unit offset 4356 (byte offset 4357): expected "<" but got "["
    expected excerpt: ..._view&quot;:&quot;content&quot;}"><p> Thanks to <a class="known-card" href="/Rachel_Aviv_The_Tra...
  ```
- `recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA:record` (offset=651, exp=836, act=835)
  ```
  FAIL recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA:record (card-engine)
    first difference at code-unit offset 651 (byte offset 653): expected "s" but got "_"
    expected excerpt: ...y":"rebecca_solnit_whose_story_and_country_i_this_on_the_myth_of_a_real_america","left":null,"na...
  ```
- `recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA+Associates:render:open` (offset=53, exp=6943, act=6051)
  ```
  FAIL recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA+Associates:render:open (render-engine)
    first difference at code-unit offset 53 (byte offset 53): expected "s" but got "_"
    expected excerpt: ...id="rebecca_solnit_whose_story_and_country_i_this_on_the_myth_of_a_real_america-associate-open-v...
  ```
- `recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA+discussion:render:open` (offset=53, exp=4462, act=4478)
  ```
  FAIL recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA+discussion:render:open (render-engine)
    first difference at code-unit offset 53 (byte offset 53): expected "s" but got "_"
    expected excerpt: ...id="rebecca_solnit_whose_story_and_country_i_this_on_the_myth_of_a_real_america-discussion-open-...
  ```
- `recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA+tags:render:open` (offset=53, exp=16009, act=15229)
  ```
  FAIL recapture-raw:Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A "REAL" AMERICA+tags:render:open (render-engine)
    first difference at code-unit offset 53 (byte offset 53): expected "s" but got "_"
    expected excerpt: ...id="rebecca_solnit_whose_story_and_country_i_this_on_the_myth_of_a_real_america-tag-open-view" c...
  ```
- `recapture-raw:Rich A Lee:render:content` (offset=369, exp=2566, act=386)
  ```
  FAIL recapture-raw:Rich A Lee:render:content (render-engine)
    first difference at code-unit offset 369 (byte offset 369): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Bill Stynetski:render:content` (offset=385, exp=2631, act=402)
  ```
  FAIL recapture-raw:Bill Stynetski:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Conversations With A Remarkable Man - Honoring The Late James Hillman - The Sun+tags:render:open` (offset=3286, exp=9077, act=8264)
  ```
  FAIL recapture-raw:Conversations With A Remarkable Man - Honoring The Late James Hillman - The Sun+tags:render:open (render-engine)
    first difference at code-unit offset 3286 (byte offset 3286): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:David R Brockman - The Radical Theology That Could Make Religious Freedom a Thing of the Past+tags:render:open` (offset=3507, exp=12026, act=11159)
  ```
  FAIL recapture-raw:David R Brockman - The Radical Theology That Could Make Religious Freedom a Thing of the Past+tags:render:open (render-engine)
    first difference at code-unit offset 3507 (byte offset 3507): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Perennial Wisdom Tradition:render:open` (offset=3205, exp=23676, act=20552)
  ```
  FAIL recapture-raw:Perennial Wisdom Tradition:render:open (render-engine)
    first difference at code-unit offset 3205 (byte offset 3205): expected "+" but got "P"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+tags&quot;,&quot;nest_syntax&quot;:&quot;+tags|...
  ```
- `recapture-raw:The Kind of Corruption That Matters - Making Americanism Great Again+tags:render:open` (offset=3163, exp=25332, act=24592)
  ```
  FAIL recapture-raw:The Kind of Corruption That Matters - Making Americanism Great Again+tags:render:open (render-engine)
    first difference at code-unit offset 3163 (byte offset 3163): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:White Rock Montessori Academy+tags:render:content` (offset=3187, exp=3913, act=3913)
  ```
  FAIL recapture-raw:White Rock Montessori Academy+tags:render:content (render-engine)
    first difference at code-unit offset 3187 (byte offset 3187): expected "b" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="TX" data-card-type-id="...
  ```
- `recapture-raw:Conflict Done Well method+*self:render:content` (offset=2268, exp=63855, act=10230)
  ```
  FAIL recapture-raw:Conflict Done Well method+*self:render:content (render-engine)
    first difference at code-unit offset 2268 (byte offset 2268): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Nikketa:render:content` (offset=359, exp=2523, act=376)
  ```
  FAIL recapture-raw:Nikketa:render:content (render-engine)
    first difference at code-unit offset 359 (byte offset 359): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:USABP Presentation 20181102+discussion+*self:render:content` (offset=2359, exp=67028, act=10569)
  ```
  FAIL recapture-raw:USABP Presentation 20181102+discussion+*self:render:content (render-engine)
    first difference at code-unit offset 2359 (byte offset 2359): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:USABP Presentation 20181102+discussion+*self:render:open` (offset=2906, exp=70113, act=12943)
  ```
  FAIL recapture-raw:USABP Presentation 20181102+discussion+*self:render:open (render-engine)
    first difference at code-unit offset 2906 (byte offset 2906): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:classic bootstrap skin+*stylesheets:render:content` (offset=537, exp=1519, act=563)
  ```
  FAIL recapture-raw:classic bootstrap skin+*stylesheets:render:content (render-engine)
    first difference at code-unit offset 537 (byte offset 537): expected "<" but got "s"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:classic bootstrap skin+*stylesheets:render:open` (offset=3371, exp=4381, act=3425)
  ```
  FAIL recapture-raw:classic bootstrap skin+*stylesheets:render:open (render-engine)
    first difference at code-unit offset 3371 (byte offset 3371): expected "<" but got "s"
    expected excerpt: ...t;],&quot;home_view&quot;:&quot;content&quot;}"><div class="card-list card-list-bar pointer-list...
  ```
- `recapture-raw:death+discussion:render:open` (offset=3162, exp=5506, act=5256)
  ```
  FAIL recapture-raw:death+discussion:render:open (render-engine)
    first difference at code-unit offset 3162 (byte offset 3164): expected "<" but got "0"
    expected excerpt: ...--------<br>From: Daniel Rancour-Laferriere &lt;<a class="email-link" href="mailto:000000bf072b2...
  ```
- `recapture-raw:journal skin customized:record` (offset=261035, exp=496142, act=262193)
  ```
  FAIL recapture-raw:journal skin customized:record (card-engine)
    first difference at code-unit offset 261035 (byte offset 261035): expected "f" but got "/"
    expected excerpt: ...tility($utility, \"-print\");\n    }\n  }\n}\n\nform {\n  margin: 0;\n  padding: 0;\n}\n\na, a:v...
  ```
- `recapture-raw:journal skin customized:render:content` (offset=436, exp=9994, act=252612)
  ```
  FAIL recapture-raw:journal skin customized:render:content (render-engine)
    first difference at code-unit offset 436 (byte offset 436): expected "<" but got "/"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><a class="btn btn-sm btn-outline-primary me-2 kn...
  ```
- `recapture-raw:journal skin customized:render:open` (offset=785, exp=12010, act=254951)
  ```
  FAIL recapture-raw:journal skin customized:render:open (render-engine)
    first difference at code-unit offset 785 (byte offset 785): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:journal skin customized+*variables:render:closed` (offset=1467, exp=3020, act=2836)
  ```
  FAIL recapture-raw:journal skin customized+*variables:render:closed (render-engine)
    first difference at code-unit offset 1467 (byte offset 1467): expected " " but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="    Override bootstrap &lt;a target=&quot;_blank...
  ```
- `recapture-raw:lux skin:render:open` (offset=695, exp=9105, act=2576)
  ```
  FAIL recapture-raw:lux skin:render:open (render-engine)
    first difference at code-unit offset 695 (byte offset 695): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:materia skin:render:open` (offset=723, exp=9322, act=2651)
  ```
  FAIL recapture-raw:materia skin:render:open (render-engine)
    first difference at code-unit offset 723 (byte offset 723): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:minty skin:render:open` (offset=707, exp=9207, act=2610)
  ```
  FAIL recapture-raw:minty skin:render:open (render-engine)
    first difference at code-unit offset 707 (byte offset 707): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:neil farbstein:render:content` (offset=385, exp=2630, act=402)
  ```
  FAIL recapture-raw:neil farbstein:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:pulse skin:render:open` (offset=707, exp=9207, act=2610)
  ```
  FAIL recapture-raw:pulse skin:render:open (render-engine)
    first difference at code-unit offset 707 (byte offset 707): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:sketchy skin:render:open` (offset=719, exp=9309, act=2644)
  ```
  FAIL recapture-raw:sketchy skin:render:open (render-engine)
    first difference at code-unit offset 719 (byte offset 719): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:solar skin:render:open` (offset=707, exp=9207, act=2610)
  ```
  FAIL recapture-raw:solar skin:render:open (render-engine)
    first difference at code-unit offset 707 (byte offset 707): expected "d" but got "s"
    expected excerpt: ...ar-body row g-0'>
  ```
- `recapture-raw:*account settings+*right:render:content` (offset=2217, exp=61697, act=7068)
  ```
  FAIL recapture-raw:*account settings+*right:render:content (render-engine)
    first difference at code-unit offset 2217 (byte offset 2217): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:*account settings+*right:render:open` (offset=4914, exp=64422, act=9793)
  ```
  FAIL recapture-raw:*account settings+*right:render:open (render-engine)
    first difference at code-unit offset 4914 (byte offset 4914): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:*head+*right:render:content` (offset=2357, exp=58718, act=9563)
  ```
  FAIL recapture-raw:*head+*right:render:content (render-engine)
    first difference at code-unit offset 2357 (byte offset 2357): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="34757" da...
  ```
- `recapture-raw:*head+*right:render:open` (offset=4887, exp=61276, act=12121)
  ```
  FAIL recapture-raw:*head+*right:render:open (render-engine)
    first difference at code-unit offset 4887 (byte offset 4887): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="34757" da...
  ```
- `recapture-raw:Administrator+*members+*self:render:content` (offset=2238, exp=69202, act=10108)
  ```
  FAIL recapture-raw:Administrator+*members+*self:render:content (render-engine)
    first difference at code-unit offset 2238 (byte offset 2238): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Administrator+*members+*self:render:open` (offset=2667, exp=72048, act=12314)
  ```
  FAIL recapture-raw:Administrator+*members+*self:render:open (render-engine)
    first difference at code-unit offset 2667 (byte offset 2667): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Anna Cruickshank:render:content` (offset=393, exp=2660, act=410)
  ```
  FAIL recapture-raw:Anna Cruickshank:render:content (render-engine)
    first difference at code-unit offset 393 (byte offset 393): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Autumn Crona:render:content` (offset=377, exp=2597, act=394)
  ```
  FAIL recapture-raw:Autumn Crona:render:content (render-engine)
    first difference at code-unit offset 377 (byte offset 377): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Carissa Halvorson:render:content` (offset=397, exp=2672, act=414)
  ```
  FAIL recapture-raw:Carissa Halvorson:render:content (render-engine)
    first difference at code-unit offset 397 (byte offset 397): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Clarissa Ryan:render:content` (offset=381, exp=2615, act=398)
  ```
  FAIL recapture-raw:Clarissa Ryan:render:content (render-engine)
    first difference at code-unit offset 381 (byte offset 381): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Donnie Harvey:render:content` (offset=381, exp=2615, act=398)
  ```
  FAIL recapture-raw:Donnie Harvey:render:content (render-engine)
    first difference at code-unit offset 381 (byte offset 381): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Elzanne Roos:render:content` (offset=375, exp=2597, act=392)
  ```
  FAIL recapture-raw:Elzanne Roos:render:content (render-engine)
    first difference at code-unit offset 375 (byte offset 375): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Frederique Kilback:render:content` (offset=401, exp=2687, act=418)
  ```
  FAIL recapture-raw:Frederique Kilback:render:content (render-engine)
    first difference at code-unit offset 401 (byte offset 401): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Help Desk+*members+*self:render:content` (offset=2210, exp=68070, act=9984)
  ```
  FAIL recapture-raw:Help Desk+*members+*self:render:content (render-engine)
    first difference at code-unit offset 2210 (byte offset 2210): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Help Desk+*members+*self:render:open` (offset=2611, exp=70860, act=12150)
  ```
  FAIL recapture-raw:Help Desk+*members+*self:render:open (render-engine)
    first difference at code-unit offset 2611 (byte offset 2611): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Hillard Barrows:render:content` (offset=387, exp=2642, act=404)
  ```
  FAIL recapture-raw:Hillard Barrows:render:content (render-engine)
    first difference at code-unit offset 387 (byte offset 387): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Jamel Schmeler:render:content` (offset=385, exp=2630, act=402)
  ```
  FAIL recapture-raw:Jamel Schmeler:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Jean Stark:render:content` (offset=369, exp=2570, act=386)
  ```
  FAIL recapture-raw:Jean Stark:render:content (render-engine)
    first difference at code-unit offset 369 (byte offset 369): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Jeffrey Toobin - Its the End of My Presidency - Movie Stars Channel Mueller+tags:render:open` (offset=3230, exp=7430, act=6633)
  ```
  FAIL recapture-raw:Jeffrey Toobin - Its the End of My Presidency - Movie Stars Channel Mueller+tags:render:open (render-engine)
    first difference at code-unit offset 3230 (byte offset 3230): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Kate Hooper:render:content` (offset=373, exp=2582, act=390)
  ```
  FAIL recapture-raw:Kate Hooper:render:content (render-engine)
    first difference at code-unit offset 373 (byte offset 373): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Lee Gunn:render:content` (offset=361, exp=2537, act=378)
  ```
  FAIL recapture-raw:Lee Gunn:render:content (render-engine)
    first difference at code-unit offset 361 (byte offset 361): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:List+*input type+*type plus right:render:content` (offset=2293, exp=70655, act=7234)
  ```
  FAIL recapture-raw:List+*input type+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2293 (byte offset 2293): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:List+*input type+*type plus right:render:open` (offset=2777, exp=73611, act=9510)
  ```
  FAIL recapture-raw:List+*input type+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2777 (byte offset 2777): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:List+*input type+*type plus right+*content options:render:closed` (offset=1327, exp=4100, act=4712)
  ```
  FAIL recapture-raw:List+*input type+*type plus right+*content options:render:closed (render-engine)
    first difference at code-unit offset 1327 (byte offset 1327): expected "4" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:List+*input type+*type plus right+*content options:render:open` (offset=1309, exp=8892, act=9504)
  ```
  FAIL recapture-raw:List+*input type+*type plus right+*content options:render:open (render-engine)
    first difference at code-unit offset 1309 (byte offset 1309): expected "4" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Madaline Daugherty:render:content` (offset=401, exp=2690, act=418)
  ```
  FAIL recapture-raw:Madaline Daugherty:render:content (render-engine)
    first difference at code-unit offset 401 (byte offset 401): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Magnolia Langosh:render:content` (offset=395, exp=2660, act=412)
  ```
  FAIL recapture-raw:Magnolia Langosh:render:content (render-engine)
    first difference at code-unit offset 395 (byte offset 395): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Make Contact+*self+Brandon WilliamsCraig+*follow:render:closed` (offset=1299, exp=3855, act=3868)
  ```
  FAIL recapture-raw:Make Contact+*self+Brandon WilliamsCraig+*follow:render:closed (render-engine)
    first difference at code-unit offset 1299 (byte offset 1299): expected "*" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Make Contact+*self+Brandon WilliamsCraig+*follow:render:open` (offset=1281, exp=3895, act=3908)
  ```
  FAIL recapture-raw:Make Contact+*self+Brandon WilliamsCraig+*follow:render:open (render-engine)
    first difference at code-unit offset 1281 (byte offset 1281): expected "*" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Miss Kenya Champlin:render:content` (offset=405, exp=2702, act=422)
  ```
  FAIL recapture-raw:Miss Kenya Champlin:render:content (render-engine)
    first difference at code-unit offset 405 (byte offset 405): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Ms. Larue Cronin:render:content` (offset=388, exp=2647, act=405)
  ```
  FAIL recapture-raw:Ms. Larue Cronin:render:content (render-engine)
    first difference at code-unit offset 388 (byte offset 388): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Nannie Zieme:render:content` (offset=377, exp=2597, act=394)
  ```
  FAIL recapture-raw:Nannie Zieme:render:content (render-engine)
    first difference at code-unit offset 377 (byte offset 377): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Penelope Beatty:render:content` (offset=389, exp=2645, act=406)
  ```
  FAIL recapture-raw:Penelope Beatty:render:content (render-engine)
    first difference at code-unit offset 389 (byte offset 389): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Pointer+*input type+*type plus right:render:content` (offset=2314, exp=71504, act=7285)
  ```
  FAIL recapture-raw:Pointer+*input type+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2314 (byte offset 2314): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Pointer+*input type+*type plus right:render:open` (offset=2819, exp=74502, act=9591)
  ```
  FAIL recapture-raw:Pointer+*input type+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2819 (byte offset 2819): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Pointer+*input type+*type plus right+*content options:render:closed` (offset=1351, exp=4145, act=4442)
  ```
  FAIL recapture-raw:Pointer+*input type+*type plus right+*content options:render:closed (render-engine)
    first difference at code-unit offset 1351 (byte offset 1351): expected "2" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Pointer+*input type+*type plus right+*content options:render:open` (offset=1333, exp=5736, act=6033)
  ```
  FAIL recapture-raw:Pointer+*input type+*type plus right+*content options:render:open (render-engine)
    first difference at code-unit offset 1333 (byte offset 1333): expected "2" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Professional Materials+Linkedin 20190924+*self:render:content` (offset=2369, exp=67375, act=10611)
  ```
  FAIL recapture-raw:Professional Materials+Linkedin 20190924+*self:render:content (render-engine)
    first difference at code-unit offset 2369 (byte offset 2369): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Professional Materials+Linkedin 20190924+*self:render:open` (offset=2929, exp=70483, act=13002)
  ```
  FAIL recapture-raw:Professional Materials+Linkedin 20190924+*self:render:open (render-engine)
    first difference at code-unit offset 2929 (byte offset 2929): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Ria Valdez:render:content` (offset=371, exp=2570, act=388)
  ```
  FAIL recapture-raw:Ria Valdez:render:content (render-engine)
    first difference at code-unit offset 371 (byte offset 371): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Shark+*members+*self:render:open` (offset=2555, exp=69672, act=11986)
  ```
  FAIL recapture-raw:Shark+*members+*self:render:open (render-engine)
    first difference at code-unit offset 2555 (byte offset 2555): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Source+Source Content+*type plus right:render:content` (offset=2333, exp=65537, act=10416)
  ```
  FAIL recapture-raw:Source+Source Content+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2333 (byte offset 2333): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Source+Source Content+*type plus right:render:open` (offset=2857, exp=68573, act=12747)
  ```
  FAIL recapture-raw:Source+Source Content+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2857 (byte offset 2857): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:St Stephen UMC+Sunday School+Sanctuary Class+Tactics:render:open` (offset=3076, exp=6562, act=5804)
  ```
  FAIL recapture-raw:St Stephen UMC+Sunday School+Sanctuary Class+Tactics:render:open (render-engine)
    first difference at code-unit offset 3076 (byte offset 3076): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Three of a Crime game rules+*self:render:content` (offset=2276, exp=64347, act=10273)
  ```
  FAIL recapture-raw:Three of a Crime game rules+*self:render:content (render-engine)
    first difference at code-unit offset 2276 (byte offset 2276): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Tina m Shedd:render:content` (offset=377, exp=2597, act=394)
  ```
  FAIL recapture-raw:Tina m Shedd:render:content (render-engine)
    first difference at code-unit offset 377 (byte offset 377): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:leo:render:content` (offset=341, exp=2465, act=358)
  ```
  FAIL recapture-raw:leo:render:content (render-engine)
    first difference at code-unit offset 341 (byte offset 341): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:litera skin customized+*variables:render:closed` (offset=1458, exp=3005, act=2821)
  ```
  FAIL recapture-raw:litera skin customized+*variables:render:closed (render-engine)
    first difference at code-unit offset 1458 (byte offset 1458): expected " " but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="    Override bootstrap &lt;a target=&quot;_blank...
  ```
- `recapture-raw:Carrie Arnold - What we'll need to find the true COVID-19 death toll+Associates:render:open` (offset=340, exp=6720, act=5873)
  ```
  FAIL recapture-raw:Carrie Arnold - What we'll need to find the true COVID-19 death toll+Associates:render:open (render-engine)
    first difference at code-unit offset 340 (byte offset 340): expected "#" but got "a"
    expected excerpt: ..."36053" data-card-name="Carrie Arnold - What we&#39;ll need to find the true COVID-19 death toll...
  ```
- `recapture-raw:Carrie Arnold - What we'll need to find the true COVID-19 death toll+discussion:render:open` (offset=349, exp=4239, act=4250)
  ```
  FAIL recapture-raw:Carrie Arnold - What we'll need to find the true COVID-19 death toll+discussion:render:open (render-engine)
    first difference at code-unit offset 349 (byte offset 349): expected "#" but got "a"
    expected excerpt: ..."36055" data-card-name="Carrie Arnold - What we&#39;ll need to find the true COVID-19 death toll...
  ```
- `recapture-raw:Dena B:render:content` (offset=353, exp=2507, act=370)
  ```
  FAIL recapture-raw:Dena B:render:content (render-engine)
    first difference at code-unit offset 353 (byte offset 353): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Eladio Turcotte:render:content` (offset=389, exp=2642, act=406)
  ```
  FAIL recapture-raw:Eladio Turcotte:render:content (render-engine)
    first difference at code-unit offset 389 (byte offset 389): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Emilie Spencer:render:content` (offset=385, exp=2627, act=402)
  ```
  FAIL recapture-raw:Emilie Spencer:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Francisco Walsh:render:content` (offset=389, exp=2642, act=406)
  ```
  FAIL recapture-raw:Francisco Walsh:render:content (render-engine)
    first difference at code-unit offset 389 (byte offset 389): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Haven Schimmel:render:content` (offset=385, exp=2627, act=402)
  ```
  FAIL recapture-raw:Haven Schimmel:render:content (render-engine)
    first difference at code-unit offset 385 (byte offset 385): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Hesther Bate:render:content` (offset=377, exp=2595, act=394)
  ```
  FAIL recapture-raw:Hesther Bate:render:content (render-engine)
    first difference at code-unit offset 377 (byte offset 377): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Milan R Milenkovich:render:content` (offset=405, exp=2700, act=422)
  ```
  FAIL recapture-raw:Milan R Milenkovich:render:content (render-engine)
    first difference at code-unit offset 405 (byte offset 405): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Omprakash chalka:render:content` (offset=393, exp=2656, act=410)
  ```
  FAIL recapture-raw:Omprakash chalka:render:content (render-engine)
    first difference at code-unit offset 393 (byte offset 393): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Sally Hanreck:render:content` (offset=381, exp=2610, act=398)
  ```
  FAIL recapture-raw:Sally Hanreck:render:content (render-engine)
    first difference at code-unit offset 381 (byte offset 381): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:USABP Presentation 20181102+abstract+*self:render:content` (offset=2345, exp=66502, act=10507)
  ```
  FAIL recapture-raw:USABP Presentation 20181102+abstract+*self:render:content (render-engine)
    first difference at code-unit offset 2345 (byte offset 2345): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:USABP Presentation 20181102+abstract+*self:render:open` (offset=2878, exp=69559, act=12861)
  ```
  FAIL recapture-raw:USABP Presentation 20181102+abstract+*self:render:open (render-engine)
    first difference at code-unit offset 2878 (byte offset 2878): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Walking Distance Neighbors+*self:render:content` (offset=2269, exp=63972, act=7200)
  ```
  FAIL recapture-raw:Walking Distance Neighbors+*self:render:content (render-engine)
    first difference at code-unit offset 2269 (byte offset 2269): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Conflict Done Well+*self:render:content` (offset=2217, exp=61950, act=7078)
  ```
  FAIL recapture-raw:Conflict Done Well+*self:render:content (render-engine)
    first difference at code-unit offset 2217 (byte offset 2217): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Conflict Done Well+*self:render:open` (offset=4911, exp=64672, act=9800)
  ```
  FAIL recapture-raw:Conflict Done Well+*self:render:open (render-engine)
    first difference at code-unit offset 4911 (byte offset 4911): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Elise Adeyemo:render:content` (offset=381, exp=2615, act=398)
  ```
  FAIL recapture-raw:Elise Adeyemo:render:content (render-engine)
    first difference at code-unit offset 381 (byte offset 381): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Jackie Wade:render:content` (offset=373, exp=2584, act=390)
  ```
  FAIL recapture-raw:Jackie Wade:render:content (render-engine)
    first difference at code-unit offset 373 (byte offset 373): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Princess Scones:render:open` (offset=2672, exp=11500, act=11404)
  ```
  FAIL recapture-raw:Princess Scones:render:open (render-engine)
    first difference at code-unit offset 2672 (byte offset 2672): expected "T" but got "R"
    expected excerpt: ...ew" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-ingredient TYPE_PLUS_RIGHT-...
  ```
- `recapture-raw:Rhonda R Rutledge:render:content` (offset=397, exp=2675, act=414)
  ```
  FAIL recapture-raw:Rhonda R Rutledge:render:content (render-engine)
    first difference at code-unit offset 397 (byte offset 397): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Rhonda Rutledge:render:content` (offset=389, exp=2644, act=406)
  ```
  FAIL recapture-raw:Rhonda Rutledge:render:content (render-engine)
    first difference at code-unit offset 389 (byte offset 389): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Richard Strozzi-Heckler - Through the Breath and Body Aikido+tags:render:open` (offset=3050, exp=11814, act=11097)
  ```
  FAIL recapture-raw:Richard Strozzi-Heckler - Through the Breath and Body Aikido+tags:render:open (render-engine)
    first difference at code-unit offset 3050 (byte offset 3050): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:*structure+*right+*guide:render:closed` (offset=1093, exp=3050, act=3006)
  ```
  FAIL recapture-raw:*structure+*right+*guide:render:closed (render-engine)
    first difference at code-unit offset 1093 (byte offset 1093): expected "*" but got "["
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*structure+*right+*guide:render:open` (offset=1075, exp=4015, act=3858)
  ```
  FAIL recapture-raw:*structure+*right+*guide:render:open (render-engine)
    first difference at code-unit offset 1075 (byte offset 1075): expected "*" but got "["
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Aikido 2+Introductory Class+20210128 Burwell:render:open` (offset=4187, exp=12907, act=12875)
  ```
  FAIL recapture-raw:Aikido 2+Introductory Class+20210128 Burwell:render:open (render-engine)
    first difference at code-unit offset 4187 (byte offset 4187): expected "+" but got "A"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+draft&quot;,&quot;nest_syntax&quot;:&quot;+draf...
  ```
- `recapture-raw:Aikido 2+Introductory Class+20210128 Burwell+draft+tags:render:open` (offset=3173, exp=4558, act=3842)
  ```
  FAIL recapture-raw:Aikido 2+Introductory Class+20210128 Burwell+draft+tags:render:open (render-engine)
    first difference at code-unit offset 3173 (byte offset 3173): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Archived Project+*type:render:content` (offset=2204, exp=61428, act=7045)
  ```
  FAIL recapture-raw:Archived Project+*type:render:content (render-engine)
    first difference at code-unit offset 2204 (byte offset 2204): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Archived Project+*type:render:open` (offset=4872, exp=64124, act=9741)
  ```
  FAIL recapture-raw:Archived Project+*type:render:open (render-engine)
    first difference at code-unit offset 4872 (byte offset 4872): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Cardtype+*type+*guide:render:closed` (offset=1107, exp=3005, act=2961)
  ```
  FAIL recapture-raw:Cardtype+*type+*guide:render:closed (render-engine)
    first difference at code-unit offset 1107 (byte offset 1107): expected "t" but got "_"
    expected excerpt: ...one-line">Every Decko card has one and only one type.
  ```
- `recapture-raw:Cardtype+*type+*guide:render:content` (offset=474, exp=2758, act=1692)
  ```
  FAIL recapture-raw:Cardtype+*type+*guide:render:content (render-engine)
    first difference at code-unit offset 474 (byte offset 474): expected "<" but got "E"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><p>Every Decko card has one and only one <strong...
  ```
- `recapture-raw:Cardtype+*type+*guide:render:open` (offset=1089, exp=5176, act=4066)
  ```
  FAIL recapture-raw:Cardtype+*type+*guide:render:open (render-engine)
    first difference at code-unit offset 1089 (byte offset 1089): expected "t" but got "_"
    expected excerpt: ...one-line">Every Decko card has one and only one type.
  ```
- `recapture-raw:How Practising Aikido Prepares Us For Life - Aikido 24x7 - Quentin Cooke+tags:render:open` (offset=3188, exp=11171, act=10396)
  ```
  FAIL recapture-raw:How Practising Aikido Prepares Us For Life - Aikido 24x7 - Quentin Cooke+tags:render:open (render-engine)
    first difference at code-unit offset 3188 (byte offset 3188): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:News Item+*type+*help:render:closed` (offset=1063, exp=3118, act=3121)
  ```
  FAIL recapture-raw:News Item+*type+*help:render:closed (render-engine)
    first difference at code-unit offset 1063 (byte offset 1063): expected "M" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:News Item+*type+*help:render:open` (offset=1045, exp=3130, act=3133)
  ```
  FAIL recapture-raw:News Item+*type+*help:render:open (render-engine)
    first difference at code-unit offset 1045 (byte offset 1045): expected "M" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Tracked Item+*type+*help:render:closed` (offset=1087, exp=3163, act=3166)
  ```
  FAIL recapture-raw:Tracked Item+*type+*help:render:closed (render-engine)
    first difference at code-unit offset 1087 (byte offset 1087): expected "M" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Tracked Item+*type+*help:render:open` (offset=1069, exp=3171, act=3174)
  ```
  FAIL recapture-raw:Tracked Item+*type+*help:render:open (render-engine)
    first difference at code-unit offset 1069 (byte offset 1069): expected "M" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:slate skin customized+*variables:render:closed` (offset=1449, exp=2990, act=2806)
  ```
  FAIL recapture-raw:slate skin customized+*variables:render:closed (render-engine)
    first difference at code-unit offset 1449 (byte offset 1449): expected " " but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="    Override bootstrap &lt;a target=&quot;_blank...
  ```
- `recapture-raw:thing+you need+*self:render:open` (offset=2570, exp=63553, act=11959)
  ```
  FAIL recapture-raw:thing+you need+*self:render:open (render-engine)
    first difference at code-unit offset 2570 (byte offset 2570): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Ted Hanulak:render:content` (offset=373, exp=2584, act=390)
  ```
  FAIL recapture-raw:Ted Hanulak:render:content (render-engine)
    first difference at code-unit offset 373 (byte offset 373): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Intellectual Property+Unsecured:render:open` (offset=3421, exp=9056, act=17468)
  ```
  FAIL recapture-raw:Intellectual Property+Unsecured:render:open (render-engine)
    first difference at code-unit offset 3421 (byte offset 3421): expected "T" but got "S"
    expected excerpt: ...ni_bar-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="Analogical System ...
  ```
- `recapture-raw:Intellectual Property+Unsecured+*self:render:open` (offset=2808, exp=21985, act=12842)
  ```
  FAIL recapture-raw:Intellectual Property+Unsecured+*self:render:open (render-engine)
    first difference at code-unit offset 2808 (byte offset 2808): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Learning Pool+Slack Channel naming conventions most in use+*self:render:open` (offset=3181, exp=23983, act=13764)
  ```
  FAIL recapture-raw:Learning Pool+Slack Channel naming conventions most in use+*self:render:open (render-engine)
    first difference at code-unit offset 3181 (byte offset 3181): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Learning Pool+Writing+20220310+*self:render:content` (offset=2301, exp=65206, act=10332)
  ```
  FAIL recapture-raw:Learning Pool+Writing+20220310+*self:render:content (render-engine)
    first difference at code-unit offset 2301 (byte offset 2301): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Learning Pool+Writing+haiku+20220310+*self:render:content` (offset=2343, exp=67020, act=10531)
  ```
  FAIL recapture-raw:Learning Pool+Writing+haiku+20220310+*self:render:content (render-engine)
    first difference at code-unit offset 2343 (byte offset 2343): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Learning Pool+training+Notes:render:content` (offset=2896, exp=3692, act=6913)
  ```
  FAIL recapture-raw:Learning Pool+training+Notes:render:content (render-engine)
    first difference at code-unit offset 2896 (byte offset 2896): expected "<" but got "\n"
    expected excerpt: ...ou don't have permission (read) --></span></div></div>
  ```
- `recapture-raw:Name4141:render:content` (offset=361, exp=2537, act=378)
  ```
  FAIL recapture-raw:Name4141:render:content (render-engine)
    first difference at code-unit offset 361 (byte offset 361): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Conflict Done Well+dojo:render:open` (offset=3580, exp=20332, act=20285)
  ```
  FAIL recapture-raw:Conflict Done Well+dojo:render:open (render-engine)
    first difference at code-unit offset 3580 (byte offset 3580): expected "+" but got "C"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Dojocho&quot;,&quot;nest_syntax&quot;:&quot;+Do...
  ```
- `recapture-raw:Aikido Oak Cliff+*self:render:content` (offset=2201, exp=61434, act=7042)
  ```
  FAIL recapture-raw:Aikido Oak Cliff+*self:render:content (render-engine)
    first difference at code-unit offset 2201 (byte offset 2201): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Aikido Oak Cliff+*self:render:open` (offset=4863, exp=64124, act=9732)
  ```
  FAIL recapture-raw:Aikido Oak Cliff+*self:render:open (render-engine)
    first difference at code-unit offset 4863 (byte offset 4863): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Artificial Intelligence+Replacement+Documents:render:content` (offset=48159, exp=54642, act=54984)
  ```
  FAIL recapture-raw:Artificial Intelligence+Replacement+Documents:render:content (render-engine)
    first difference at code-unit offset 48159 (byte offset 48159): expected "A" but got "T"
    expected excerpt: ...ni_bar-view" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-anon_exchange_16 T...
  ```
- `recapture-raw:Artificial Intelligence+anon_exchange_02+*self:render:open` (offset=2934, exp=22559, act=13055)
  ```
  FAIL recapture-raw:Artificial Intelligence+anon_exchange_02+*self:render:open (render-engine)
    first difference at code-unit offset 2934 (byte offset 2934): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Artificial Intelligence+anon_exchange_03+*self:render:open` (offset=2934, exp=22559, act=13055)
  ```
  FAIL recapture-raw:Artificial Intelligence+anon_exchange_03+*self:render:open (render-engine)
    first difference at code-unit offset 2934 (byte offset 2934): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Artificial Intelligence+anon_exchange_04+*self:render:open` (offset=2934, exp=22559, act=13055)
  ```
  FAIL recapture-raw:Artificial Intelligence+anon_exchange_04+*self:render:open (render-engine)
    first difference at code-unit offset 2934 (byte offset 2934): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Ms AI Replacement Resignation Tom Warren 20230207 letter+tags:render:open` (offset=3007, exp=4754, act=4020)
  ```
  FAIL recapture-raw:Ms AI Replacement Resignation Tom Warren 20230207 letter+tags:render:open (render-engine)
    first difference at code-unit offset 3007 (byte offset 3007): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Work Week:render:open` (offset=2541, exp=22039, act=18994)
  ```
  FAIL recapture-raw:Work Week:render:open (render-engine)
    first difference at code-unit offset 2541 (byte offset 2541): expected "T" but got "R"
    expected excerpt: ...ew" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-list RIGHT-tag TYPE_PLUS_RIGHT-research-tag...
  ```
- `recapture-raw:Technomancers-ai-AI Act To Target US Open Source Software:render:open` (offset=3884, exp=28679, act=43003)
  ```
  FAIL recapture-raw:Technomancers-ai-AI Act To Target US Open Source Software:render:open (render-engine)
    first difference at code-unit offset 3884 (byte offset 3884): expected "+" but got "T"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:*all+*guide:render:closed` (offset=976, exp=2776, act=2732)
  ```
  FAIL recapture-raw:*all+*guide:render:closed (render-engine)
    first difference at code-unit offset 976 (byte offset 976): expected "E" but got "#"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*all+*guide:render:content` (offset=434, exp=884, act=764)
  ```
  FAIL recapture-raw:*all+*guide:render:content (render-engine)
    first difference at code-unit offset 434 (byte offset 434): expected "<" but got "#"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}"><h4 id="editing-guide">Editing Guide</h4>
  ```
- `recapture-raw:*all+*guide:render:open` (offset=958, exp=3123, act=2959)
  ```
  FAIL recapture-raw:*all+*guide:render:open (render-engine)
    first difference at code-unit offset 958 (byte offset 958): expected "E" but got "#"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:*layout+*right+*input type:render:closed` (offset=1126, exp=3033, act=3196)
  ```
  FAIL recapture-raw:*layout+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1126 (byte offset 1126): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Aikido Shusekai+Writing+*self:render:open` (offset=2696, exp=21346, act=12523)
  ```
  FAIL recapture-raw:Aikido Shusekai+Writing+*self:render:open (render-engine)
    first difference at code-unit offset 2696 (byte offset 2696): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Kayla Feder 20230902+*self:render:content` (offset=2231, exp=62659, act=13070)
  ```
  FAIL recapture-raw:Kayla Feder 20230902+*self:render:content (render-engine)
    first difference at code-unit offset 2231 (byte offset 2231): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Kayla Feder 20230902+*self:render:open` (offset=4953, exp=65409, act=15820)
  ```
  FAIL recapture-raw:Kayla Feder 20230902+*self:render:open (render-engine)
    first difference at code-unit offset 4953 (byte offset 4953): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Role+*members+*type plus right:render:content` (offset=2273, exp=69758, act=10166)
  ```
  FAIL recapture-raw:Role+*members+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2273 (byte offset 2273): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Role+*members+*type plus right:render:open` (offset=2740, exp=72677, act=12414)
  ```
  FAIL recapture-raw:Role+*members+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2740 (byte offset 2740): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:Siizz:render:content` (offset=349, exp=2496, act=366)
  ```
  FAIL recapture-raw:Siizz:render:content (render-engine)
    first difference at code-unit offset 349 (byte offset 349): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Topic+*right:render:content` (offset=2358, exp=64369, act=12469)
  ```
  FAIL recapture-raw:Topic+*right:render:content (render-engine)
    first difference at code-unit offset 2358 (byte offset 2358): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="45648" da...
  ```
- `recapture-raw:Topic+*right:render:open` (offset=4890, exp=66929, act=15029)
  ```
  FAIL recapture-raw:Topic+*right:render:open (render-engine)
    first difference at code-unit offset 4890 (byte offset 4890): expected "r" but got "c"
    expected excerpt: ...le-item _category-all _category-field _category-recent _category-common" data-card-id="45648" da...
  ```
- `recapture-raw:Topic+*right+*content options:render:content` (offset=515, exp=539, act=7952)
  ```
  FAIL recapture-raw:Topic+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 515 (byte offset 515): expected "{" but got "<"
    expected excerpt: ...&quot;,&quot;show&quot;:[&quot;content&quot;]}">{"type":"topic"}
  ```
- `recapture-raw:Topic+*right+*content options:render:open` (offset=3589, exp=3635, act=11048)
  ```
  FAIL recapture-raw:Topic+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 3589 (byte offset 3589): expected "{" but got "<"
    expected excerpt: .../div>
  ```
- `recapture-raw:Topic+*right+*input type:render:closed` (offset=1110, exp=3008, act=3181)
  ```
  FAIL recapture-raw:Topic+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1110 (byte offset 1110): expected "m" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Topic+*type:render:content` (offset=2127, exp=58601, act=6858)
  ```
  FAIL recapture-raw:Topic+*type:render:content (render-engine)
    first difference at code-unit offset 2127 (byte offset 2127): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Topic+*type:render:open` (offset=4641, exp=61143, act=9400)
  ```
  FAIL recapture-raw:Topic+*type:render:open (render-engine)
    first difference at code-unit offset 4641 (byte offset 4641): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Topic+Search+*type plus right:render:content` (offset=2270, exp=62933, act=7171)
  ```
  FAIL recapture-raw:Topic+Search+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2270 (byte offset 2270): expected "d" but got "s"
    expected excerpt: ...on (read) --></span></li>
  ```
- `recapture-raw:Topic+Search+*type plus right:render:open` (offset=2731, exp=65843, act=9412)
  ```
  FAIL recapture-raw:Topic+Search+*type plus right:render:open (render-engine)
    first difference at code-unit offset 2731 (byte offset 2731): expected "d" but got "h"
    expected excerpt: ...div>
  ```
- `recapture-raw:mod: account+*style:render:closed` (offset=1292, exp=2731, act=2566)
  ```
  FAIL recapture-raw:mod: account+*style:render:closed (render-engine)
    first difference at code-unit offset 1292 (byte offset 1292): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: ace editor+*script:render:closed` (offset=1332, exp=2669, act=2630)
  ```
  FAIL recapture-raw:mod: ace editor+*script:render:closed (render-engine)
    first difference at code-unit offset 1332 (byte offset 1332): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: api key+*style:render:closed` (offset=1292, exp=2731, act=2566)
  ```
  FAIL recapture-raw:mod: api key+*style:render:closed (render-engine)
    first difference at code-unit offset 1292 (byte offset 1292): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: bar and box+*script:render:closed` (offset=1341, exp=2684, act=2645)
  ```
  FAIL recapture-raw:mod: bar and box+*script:render:closed (render-engine)
    first difference at code-unit offset 1341 (byte offset 1341): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: bar and box+*style:render:closed` (offset=1328, exp=2791, act=2626)
  ```
  FAIL recapture-raw:mod: bar and box+*style:render:closed (render-engine)
    first difference at code-unit offset 1328 (byte offset 1328): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: bootstrap+*script:render:closed` (offset=1323, exp=2654, act=2615)
  ```
  FAIL recapture-raw:mod: bootstrap+*script:render:closed (render-engine)
    first difference at code-unit offset 1323 (byte offset 1323): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: bootstrap+*style:render:closed` (offset=1310, exp=2761, act=2596)
  ```
  FAIL recapture-raw:mod: bootstrap+*style:render:closed (render-engine)
    first difference at code-unit offset 1310 (byte offset 1310): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: carrierwave+*script:render:closed` (offset=1341, exp=2684, act=2645)
  ```
  FAIL recapture-raw:mod: carrierwave+*script:render:closed (render-engine)
    first difference at code-unit offset 1341 (byte offset 1341): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: carrierwave+*style:render:closed` (offset=1328, exp=2791, act=2626)
  ```
  FAIL recapture-raw:mod: carrierwave+*style:render:closed (render-engine)
    first difference at code-unit offset 1328 (byte offset 1328): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: comment+*style:render:closed` (offset=1292, exp=2731, act=2566)
  ```
  FAIL recapture-raw:mod: comment+*style:render:closed (render-engine)
    first difference at code-unit offset 1292 (byte offset 1292): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: edit+*script:render:closed` (offset=1278, exp=2579, act=2540)
  ```
  FAIL recapture-raw:mod: edit+*script:render:closed (render-engine)
    first difference at code-unit offset 1278 (byte offset 1278): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: edit+*style:render:closed` (offset=1265, exp=2686, act=2521)
  ```
  FAIL recapture-raw:mod: edit+*style:render:closed (render-engine)
    first difference at code-unit offset 1265 (byte offset 1265): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: follow+*script:render:closed` (offset=1296, exp=2609, act=2570)
  ```
  FAIL recapture-raw:mod: follow+*script:render:closed (render-engine)
    first difference at code-unit offset 1296 (byte offset 1296): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: follow+*style:render:closed` (offset=1283, exp=2716, act=2551)
  ```
  FAIL recapture-raw:mod: follow+*style:render:closed (render-engine)
    first difference at code-unit offset 1283 (byte offset 1283): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: format+*script:render:closed` (offset=1296, exp=2609, act=2570)
  ```
  FAIL recapture-raw:mod: format+*script:render:closed (render-engine)
    first difference at code-unit offset 1296 (byte offset 1296): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: format+*style:render:closed` (offset=1283, exp=2716, act=2551)
  ```
  FAIL recapture-raw:mod: format+*style:render:closed (render-engine)
    first difference at code-unit offset 1283 (byte offset 1283): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: help+*style:render:closed` (offset=1265, exp=2686, act=2521)
  ```
  FAIL recapture-raw:mod: help+*style:render:closed (render-engine)
    first difference at code-unit offset 1265 (byte offset 1265): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: history+*style:render:closed` (offset=1292, exp=2731, act=2566)
  ```
  FAIL recapture-raw:mod: history+*style:render:closed (render-engine)
    first difference at code-unit offset 1292 (byte offset 1292): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: layout+*script:render:closed` (offset=1296, exp=2609, act=2570)
  ```
  FAIL recapture-raw:mod: layout+*script:render:closed (render-engine)
    first difference at code-unit offset 1296 (byte offset 1296): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: layout+*style:render:closed` (offset=1283, exp=2716, act=2551)
  ```
  FAIL recapture-raw:mod: layout+*style:render:closed (render-engine)
    first difference at code-unit offset 1283 (byte offset 1283): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: list+*script:render:closed` (offset=1278, exp=2579, act=2540)
  ```
  FAIL recapture-raw:mod: list+*script:render:closed (render-engine)
    first difference at code-unit offset 1278 (byte offset 1278): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: list+*style:render:closed` (offset=1265, exp=2686, act=2521)
  ```
  FAIL recapture-raw:mod: list+*style:render:closed (render-engine)
    first difference at code-unit offset 1265 (byte offset 1265): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: permissions+*style:render:closed` (offset=1323, exp=2786, act=2621)
  ```
  FAIL recapture-raw:mod: permissions+*style:render:closed (render-engine)
    first difference at code-unit offset 1323 (byte offset 1323): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: recaptcha+*script:render:closed` (offset=1323, exp=2654, act=2615)
  ```
  FAIL recapture-raw:mod: recaptcha+*script:render:closed (render-engine)
    first difference at code-unit offset 1323 (byte offset 1323): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: rules+*script:render:closed` (offset=1282, exp=2589, act=2550)
  ```
  FAIL recapture-raw:mod: rules+*script:render:closed (render-engine)
    first difference at code-unit offset 1282 (byte offset 1282): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: rules+*style:render:closed` (offset=1269, exp=2696, act=2531)
  ```
  FAIL recapture-raw:mod: rules+*style:render:closed (render-engine)
    first difference at code-unit offset 1269 (byte offset 1269): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: search+*script:render:closed` (offset=1296, exp=2609, act=2570)
  ```
  FAIL recapture-raw:mod: search+*script:render:closed (render-engine)
    first difference at code-unit offset 1296 (byte offset 1296): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: search+*style:render:closed` (offset=1283, exp=2716, act=2551)
  ```
  FAIL recapture-raw:mod: search+*style:render:closed (render-engine)
    first difference at code-unit offset 1283 (byte offset 1283): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: style+*style:render:closed` (offset=1274, exp=2701, act=2536)
  ```
  FAIL recapture-raw:mod: style+*style:render:closed (render-engine)
    first difference at code-unit offset 1274 (byte offset 1274): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:mod: tabs+*script:render:closed` (offset=1273, exp=2574, act=2535)
  ```
  FAIL recapture-raw:mod: tabs+*script:render:closed (render-engine)
    first difference at code-unit offset 1273 (byte offset 1273): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: tinymce editor+*script:render:closed` (offset=1368, exp=2729, act=2690)
  ```
  FAIL recapture-raw:mod: tinymce editor+*script:render:closed (render-engine)
    first difference at code-unit offset 1368 (byte offset 1368): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: tinymce editor+*style:render:closed` (offset=1355, exp=2836, act=2671)
  ```
  FAIL recapture-raw:mod: tinymce editor+*style:render:closed (render-engine)
    first difference at code-unit offset 1355 (byte offset 1355): expected "S" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="Skin (collection of stylesheets) for card&#39;s ...
  ```
- `recapture-raw:ronald joseph:render:content` (offset=381, exp=2615, act=398)
  ```
  FAIL recapture-raw:ronald joseph:render:content (render-engine)
    first difference at code-unit offset 381 (byte offset 381): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:ronald nance:render:open` (offset=2862, exp=5559, act=3187)
  ```
  FAIL recapture-raw:ronald nance:render:open (render-engine)
    first difference at code-unit offset 2862 (byte offset 2869): expected "d" but got "/"
    expected excerpt: ...trong>Relationships</strong></h1>
  ```
- `recapture-raw:ConocoPhillips+*self:render:content` (offset=3225, exp=17651, act=9918)
  ```
  FAIL recapture-raw:ConocoPhillips+*self:render:content (render-engine)
    first difference at code-unit offset 3225 (byte offset 3225): expected "r" but got "c"
    expected excerpt: ...-Xself-Xread _rule-item _category-all _category-recent _category-common" data-card-id="47451" da...
  ```
- `recapture-raw:ConocoPhillips+*self:render:open` (offset=5865, exp=20319, act=12586)
  ```
  FAIL recapture-raw:ConocoPhillips+*self:render:open (render-engine)
    first difference at code-unit offset 5865 (byte offset 5865): expected "r" but got "c"
    expected excerpt: ...-Xself-Xread _rule-item _category-all _category-recent _category-common" data-card-id="47451" da...
  ```
- `recapture-raw:Catherine Balla-Boudreau:render:content` (offset=425, exp=2776, act=442)
  ```
  FAIL recapture-raw:Catherine Balla-Boudreau:render:content (render-engine)
    first difference at code-unit offset 425 (byte offset 425): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Conflict Done Well Aikido Training at SSUMC+*self:render:content` (offset=3545, exp=19595, act=10818)
  ```
  FAIL recapture-raw:Conflict Done Well Aikido Training at SSUMC+*self:render:content (render-engine)
    first difference at code-unit offset 3545 (byte offset 3545): expected "r" but got "c"
    expected excerpt: ...-Xself-Xread _rule-item _category-all _category-recent _category-common" data-card-id="48719" da...
  ```
- `recapture-raw:Conflict Done Well Aikido Training at SSUMC+*self:render:open` (offset=6593, exp=22671, act=13894)
  ```
  FAIL recapture-raw:Conflict Done Well Aikido Training at SSUMC+*self:render:open (render-engine)
    first difference at code-unit offset 6593 (byte offset 6593): expected "r" but got "c"
    expected excerpt: ...-Xself-Xread _rule-item _category-all _category-recent _category-common" data-card-id="48719" da...
  ```
- `recapture-raw:Julia Napoles:render:content` (offset=381, exp=2611, act=398)
  ```
  FAIL recapture-raw:Julia Napoles:render:content (render-engine)
    first difference at code-unit offset 381 (byte offset 381): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Process Arts Radical Inclusivity and the Guardians of Peace+tags:render:open` (offset=3052, exp=9818, act=9070)
  ```
  FAIL recapture-raw:Process Arts Radical Inclusivity and the Guardians of Peace+tags:render:open (render-engine)
    first difference at code-unit offset 3052 (byte offset 3052): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:mod: account+*script:render:closed` (offset=1305, exp=2624, act=2585)
  ```
  FAIL recapture-raw:mod: account+*script:render:closed (render-engine)
    first difference at code-unit offset 1305 (byte offset 1305): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:mod: shades+*script:render:closed` (offset=1291, exp=2604, act=2565)
  ```
  FAIL recapture-raw:mod: shades+*script:render:closed (render-engine)
    first difference at code-unit offset 1291 (byte offset 1291): expected "J" but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="JavaScript (or CoffeeScript) for card&#39;s page...
  ```
- `recapture-raw:Aikido Oak Cliff+discussion:render:open` (offset=3299, exp=3727, act=3502)
  ```
  FAIL recapture-raw:Aikido Oak Cliff+discussion:render:open (render-engine)
    first difference at code-unit offset 3299 (byte offset 3301): expected "<" but got "["
    expected excerpt: ...<p> </p>
  ```
- `recapture-raw:Amy Dineen:render:content` (offset=369, exp=2567, act=386)
  ```
  FAIL recapture-raw:Amy Dineen:render:content (render-engine)
    first difference at code-unit offset 369 (byte offset 369): expected " " but got ">"
    expected excerpt: ...t;,&quot;show&quot;:[&quot;content&quot;]}"><div class='invite-links'>
  ```
- `recapture-raw:Conflict Done Well+WE Greiner+video:render:open` (offset=6225, exp=9039, act=9074)
  ```
  FAIL recapture-raw:Conflict Done Well+WE Greiner+video:render:open (render-engine)
    first difference at code-unit offset 6225 (byte offset 6226): expected "+" but got "C"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+discussion&quot;,&quot;nest_syntax&quot;:&quot;...
  ```
- `recapture-raw:Conflict Done Well+class schedule+discussion:render:open` (offset=3696, exp=4124, act=3899)
  ```
  FAIL recapture-raw:Conflict Done Well+class schedule+discussion:render:open (render-engine)
    first difference at code-unit offset 3696 (byte offset 3698): expected "<" but got "["
    expected excerpt: ...<p> </p>
  ```
- `recapture-raw:RVW+File Storage Area:render:open` (offset=5962, exp=26449, act=25801)
  ```
  FAIL recapture-raw:RVW+File Storage Area:render:open (render-engine)
    first difference at code-unit offset 5962 (byte offset 5962): expected "T" but got "R"
    expected excerpt: ...ew" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-working_doc_02 TYPE_PLUS_RI...
  ```

## Cross-reference: per-class-mechanisms baseline

The full-run baseline (per-class-mechanisms.json, modified later than the verify aggregate on this disk) gives these high-level divisions:

- **card-engine:byte-diff (structured-content gap)** = 2573
- **render-engine:byte-diff (engine renders more bytes than Ruby)** = 3409

The clusters above are a finer-grained decomposition of those two buckets. The engine's render-engine byte-diff cluster (`render-engine:byte-diff` in baseline, 3,409 in the older full run) splits into ~10 mechanism clusters in this map (C2, C3, C4, C5, C6, C7, C9, C10, C11, C13). The card-engine byte-diff cluster (2,573 in the older full run) splits into the name-key normalization cluster (C1, C12) plus the structured-content gap, which the engine source already documents at `src/card/rules/structure.ts:38-50` (the recursive CTE fix closes the depth-3 set rows that miss the *type plus right composition).

## Reconciliation to task's stated population

- Task claims 3,692 byte-diff failures across 10,274 entries.
- On-disk aggregate (shard 0 only) shows 122 byte-diff / 341 entries.
- per-class-mechanisms.json (full-run baseline, ~2h45m old at generation time) shows 5,982 byte-diff / 10,274 entries.
- The gap (5,982 - 3,692 = 2,290) is unaccounted for by the on-disk evidence. Two possibilities:
  1. The verification re-ran between the per-class-mechanisms write and the verify-aggregate write; the task numbers reflect a NEW aggregate that has not been re-traced through `trace-failures.cjs` to produce a fresh per-class-mechanisms.json. In that case the on-disk 122-entry shard-0 detail is the latest per-entry signature evidence we have, and the per-class-mechanisms.json is the latest full-set baseline.
  2. The task numbers are an estimate that does not correspond to either on-disk file. The work in this map is anchored to the on-disk evidence and explicitly notes the discrepancy.

This map is the work order for the ENGINE fixes; the per-class-mechanisms.json is the authoritative baseline until a fresh full trace is run.

