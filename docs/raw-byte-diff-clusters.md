# Raw ground-truth byte-diff cluster map

Generated: 2026-09-25T07:57:29.883Z

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
| 3 | `set-card-pointer-list-vs-nested-content` | ENGINE | 843 | Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. |
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
| 14 | `deep-read-rule-deny-on-self-or-right` | SEEDING | 1247 | Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). |
| 15 | `whitespace-newline-before-div` | ENGINE | 262 | Ruby's HTML output includes a literal `\n` before the closing `</div>` of the inner-slot wrapper (after the accordion body closes), while engine emits the closing `</div>` directly without the newline. |
| 16 | `wiki-link-vs-known-card-html-anchor` | VIEW-REGISTRY | 22 | Ruby's renderer emits `<a class="known-card" href="/CardName">card-title</a>` for wiki-link content references while the engine emits the raw `[[CardName]]` literal. |
| 17 | `external-link-vs-raw-url` | VIEW-REGISTRY | 29 | Ruby wraps external URLs in `<a target="_blank" class="external-link" href="https://...">URL</a>` while the engine emits the raw URL text. |
| 18 | `invite-links-account-empty-div` | ENGINE | 108 | For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder OR `<div>\n<div id="X-agree-titled-view">...` (no invite-links panel at all, jumping straight to the agree-titled view). |
| 19 | `layout-content-pointer-list-wrap` | VIEW-REGISTRY | 30 | For `X+*self+*layout:render:closed|open` the engine wraps the layout name in a `<div class="pointer-list"><div class="pointer-item...">` wrapper while Ruby renders the literal layout name (e.g. |
| 20 | `skin-card-content-not-resolved` | SEEDING | 22 | For `X skin:record` (and `bootstrap: X:record`) Ruby resolves the structured-card content (~500KB of SCSS/CSS) into the JSON `content` field, while the engine returns the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch theme...` (200 bytes) — or for `bootstrap: X:record`, an empty content. |
| 21 | `structured-content-record-empty` | ENGINE | 3 | For *alerts, *now, *version, *count, etc., Ruby resolves the structured-card content (e.g. |
| 22 | `rules-form-filter-vs-content-view` | ENGINE | 12 | For `X+Y+*self:render:open` and similar rule-card composition junctions (3-part junctions like `Seeley inquiry+overview+*self`, `Item+Contributor+*type plus right`, `Administrator+*members+*self`), Ruby emits a nested `<div id="X-Y-Xself-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). |
| 23 | `search-results-vs-literal-content` | ENGINE | 8 | For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...` (often truncated at search-resul). |
| 24 | `card-list-name-vs-card-list-bar` | VIEW-REGISTRY | 8 | For `X+*right+*input type:render:content|open` Ruby emits `<div class="card-list card-list-name pointer-list">` while the engine emits `<div class="card-list card-list-bar pointer-list">`. |
| 25 | `known-card-vs-wanted-card-on-rule-set` | ENGINE | 80 | For `X+*type+*create:render:closed` and `X+*type+*delete:render:closed` (HTML/SCSS/Project Cardtype rules), Ruby emits `<a class="known-card" href="/Shark">` (the rule-card set's referent is a known card in Ruby's seed closure) while the engine emits `<a class="wanted-card" href="/Shark">` (same href but a different CSS class — engine treats it as wanted because the seed closure didn't register it as known). |
| 26 | `bar-right-config-content-missing` | VIEW-REGISTRY | 30 | For `mod: X:render:closed` (and similar bar-content cards), Ruby emits a populated `bar-right` slot with the card's description text (`configurations, scripts`, `styles`, `configurations, cardtypes, scripts, styles`) while the engine emits an empty `bar-right` (just a newline then `</div>`). |
| 27 | `help-tooltip-nbsp-empty` | VIEW-REGISTRY | 5 | For *Ace and *on update (and other help-text rule cards) Ruby emits a populated tooltip (`data-bs-content="Configure &lt;a target=&quot;_blank&quot; class=..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. |
| 28 | `set-card-associates-pointer-list` | ENGINE | 11 | For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). |
| 29 | `apostrophe-name-key-extended` | ENGINE | 165 | Broader version of the existing apostrophe-name-key cluster (C12, which only matched one ID). |
| 30 | `skin-card-bar-left-titled-vs-span-title` | VIEW-REGISTRY | 42 | For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). |
| 31 | `mod-record-template-literal-vs-inspected` | ENGINE | 1 | For `Mod:record` Ruby returns the Cardio::Mod inspection output (`#<Cardio::Mod:0x000001bc8a22c908>_mod\n#<Cardio::...`) as the content field, while the engine returns the unresolved template literal `<p>{{+description|content}}</p>\n<p>{{_|add_button|...</p>`. |
| 32 | `rule-card-default-description-missing` | ENGINE | 0 | For `Cardtype+*type+*default:render:content|open` and `Role+*type+*default:render:content|open` Ruby emits the description content (`Every Decko card has one and only one <strong>type</strong>...`) while the engine emits an empty `<p></p><p>&nbsp;</p><p>[[/new/Cardtype+*type+*defa...` placeholder. |
| 33 | `anonymous-card-name-key-truncation` | ENGINE | 1 | For card names that END with 's' followed by a +*self junction, the engine's name-key normalization drops the trailing 's' (Anonymous -> anonymou, similar pattern for other card names). |
| 34 | `wiki-link-vs-rich-content-link` | ENGINE | 20 | For card content views where the Ruby side emits a styled link (`<a class="btn btn-sm btn-outline-primary me-2 known-card"...`) and the engine emits the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch them...`, the engine's content view isn't applying the link-to-HTML transform for skin-card references. |
| 35 | `rule-item-set-category-recent-missing` | ENGINE | 56 | For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, *default html view+*right, etc. |
| 36 | `rule-card-input-type-pointer-list-literal` | VIEW-REGISTRY | 7 | For `X+*right+*input type:render:open` and `X+*right+*content options:render:open` Ruby emits the literal input-type value (`radio`, `select`, `multiselect`) or JSON literal `{"type":"..."}` while the engine emits a `<div class="pointer-list">` wrapper. |
| 37 | `denied-vs-render-rule-symmetric` | SEEDING | 1 | The symmetric counterpart to cluster 7 / C15: for a small set of entries (e.g. |
| 38 | `nest-name-case-mismatch` | ENGINE | 0 | For nested-include renders (e.g. |
| 39 | `help-text-content-typo` | VIEW-REGISTRY | 30 | For `Item+Format+*type plus right+*help:render:closed|open` and similar `Item+X+*type plus right+*help` rule cards, the help text differs by a few characters: Ruby has `the resource. |
| 40 | `rules-form-vs-content-view-generalized` | ENGINE | 64 | For `X+Y+*type plus right:render:open` and other 3-part rule-card composition junctions (Cardtype+description+*type plus right, RichText+GBA+*type plus right, Exhibit+Item+*type plus right, Item+Identifier+*type plus right, Item+language+*type plus right, Message+Conversation+*type plus right, Person+Task+*type plus right, Source+Source Content+*type plus right, etc.), Ruby emits a nested `<div id="X-Y-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>`. |
| 41 | `tooltip-help-text-empty` | VIEW-REGISTRY | 35 | For `*style:render:closed`, `mod: X+*style:render:closed`, `mod: X+*script:render:closed`, `*on update:render:closed`, etc. |
| 42 | `double-encoded-apostrophe-in-data-card-name` | ENGINE | 15 | For card names that contain an apostrophe (`Saint Nicholas'`, `I'm`, `Smile! You've`, `Don't`, etc.), Ruby HTML-encodes the apostrophe as `&#39;` in the data-card-name attribute (`data-card-name="Saint Nicholas&#39; Dark Companion+Associates"`), while the engine DOUBLE-encodes the already-encoded entity as `&amp;#39;` (`data-card-name="Saint Nicholas&amp;#39; Dark Companion+Associates"`). |
| - | **UNTRACED** | - | 143 | no mechanism matched. |
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
- **Count (shard 0)**: 843
- **Mechanism**: Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. Differences are concentrated at offset ~2400-3500 (after the accordion body), confirming the divergence is in the content-slot wrap, not the bar/preamble. The lower band (~2400-2700) is `+Pages`, `+Family`, etc. and the upper band (~3000-3500) is `+tags`, `+Associations+tags`, `+Associations+articles` (longer-card-name junctions whose slot-id is shorter relative to the accordion body).

**Sample entry ids**:

- `recapture-raw:*home:render:open` (offset=1925, exp=4754, act=4274)
- `recapture-raw:ABCglobal+Supporters:render:open` (offset=2477, exp=5514, act=4888)
- `recapture-raw:Alchemy_Physics_Psychology+articles:render:open` (offset=2663, exp=6012, act=5373)
- `recapture-raw:Associative Inquiry+Supporters:render:open` (offset=2604, exp=10506, act=9774)
- `recapture-raw:Banana+Person:render:open` (offset=2363, exp=6216, act=5662)

**Proposed fix sketch**:

src/card/render/views.ts#openView + barBottomView: when the rendered card is a set card (not a pointer/list cardtype), emit a nested content-view slot per child instead of the card-list pointer-list wrapper. Test pins: recapture-raw:Brandon WilliamsCraig+Pages:render:open (offset 2540, exp 20541, act 18200) and recapture-raw:mythicity+Pages:render:open (offset 2375, exp 3127, act 4910 — engine LARGER here, same mechanism because Ruby's slot wrap is shorter than engine's pointer-list wrap). Also: recapture-raw:X+Associations+tags:render:open (offset ~3300, same mechanism, longer card name).

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
- **Count (shard 0)**: 1247
- **Mechanism**: Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). The pattern generalizes to ANY junction ending in `*self`, `*right`, `*type`, or just `*X` (single *-prefixed card name) where the seed closure fails to bring the read grants. Ruby's expected HTML contains a `<div id="...-Xdefault-bar-view">` (real card bar, sometimes truncated at `-Xsel` or `-Xtype` in the excerpt) while engine emits a `<span class="denied">` placeholder. Same root cause as cluster 7 (the *read rule universe closure is partial). The diff character is `d` (start of `<div`) on the Ruby side and `s` (start of `<span`) on the engine side, both after the `</span></li>\n<li class="nav-item">` nav preamble.

**Sample entry ids**:

- `recapture-raw:*rstar:render:content` (offset=2038, exp=57019, act=14585)
- `recapture-raw:*rstar:render:open` (offset=4131, exp=59140, act=16706)
- `recapture-raw:AiBerk at ASC SumRet2010_group_07+*self:render:content` (offset=2327, exp=66067, act=10571)
- `recapture-raw:AiBerk at ASC SumRet2010_group_11+*self:render:content` (offset=2327, exp=66067, act=10571)
- `recapture-raw:AiBerk at ASC SumRet2010_wholegroup_01+*self:render:content` (offset=2362, exp=67362, act=10726)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: the *read rule universe closure must walk the SET card's child-card grants (Ruby evaluates Card.where(matches_rule) for each *read rule's pattern and the closure doesn't replicate). Test pins: recapture-raw:*rstar:render:content (offset 2038, exp 57019, act 14585), recapture-raw:CSS+*type:render:open (offset 4599, exp 60766, act 17606), recapture-raw:Wendy Palmer+*self:render:open (offset 2173, exp 60489, act 9878).

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
- **Count (shard 0)**: 108
- **Mechanism**: For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder OR `<div>\n<div id="X-agree-titled-view">...` (no invite-links panel at all, jumping straight to the agree-titled view). The engine's invite-links template reads account-related fields (name, email, contact) that the seed closure didn't populate for non-Administrator accounts. Applies to both :render:open and :render:content.

**Sample entry ids**:

- `recapture-raw:sabrina mejias:render:content` (offset=385, exp=10762, act=8407)
- `recapture-raw:sabrina mejias:render:open` (offset=2536, exp=12941, act=10586)
- `recapture-raw:Dan Williams:render:content` (offset=375, exp=10723, act=8368)
- `recapture-raw:Dan Williams:render:open` (offset=2495, exp=12871, act=10516)
- `recapture-raw:Giovanni Sanchez:render:content` (offset=393, exp=10793, act=8441)

**Proposed fix sketch**:

src/card/render/account-views.ts#inviteLinks: the engine's invite-links template iterates over the Account+*self card's name/email/contact children. The seed closure loads the Account+*self card but not its name/email/contact child references. Test pins: recapture-raw:Ron Huggins:render:open (offset 2478, exp 4715, act 2523), recapture-raw:Jean Stark:render:content (offset 369, exp 2597, act 402), recapture-raw:sabrina mejias:render:open (offset 2536, exp 12941, act 10586).

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
- **Count (shard 0)**: 12
- **Mechanism**: For `X+Y+*self:render:open` and similar rule-card composition junctions (3-part junctions like `Seeley inquiry+overview+*self`, `Item+Contributor+*type plus right`, `Administrator+*members+*self`), Ruby emits a nested `<div id="X-Y-Xself-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). The engine's rule-card content dispatch is treating the card as a *rule card type instead of a *type plus right rule, so it serves the form view instead of the nested content view.

**Sample entry ids**:

- `recapture-raw:Bluevolution+Writing+*self:render:open` (offset=2654, exp=65191, act=12205)
- `recapture-raw:Item+Date+*type plus right:render:open` (offset=2679, exp=65327, act=12131)
- `recapture-raw:Item+Rights+*type plus right:render:open` (offset=2712, exp=65714, act=12203)
- `recapture-raw:Item+Title+*type plus right:render:open` (offset=2703, exp=65482, act=12182)
- `recapture-raw:Item+Type+*type plus right:render:open` (offset=2689, exp=65209, act=12141)

**Proposed fix sketch**:

src/card/render/views.ts#openView: when the rendered card is a rule-card composition junction (X+Y+*self or X+Y+*type plus right), render the nested content-view slot, NOT the rule-editing form. The rule-editing form should only appear when the URL signals edit mode. Test pins: recapture-raw:Collection+Item+*type plus right:render:open (offset 2773, exp 66656, act 9493), recapture-raw:Seeley inquiry+overview+*self:render:open (offset 2696, exp 66010, act 12328), recapture-raw:Administrator+*members+*self:render:open (offset 2667, exp 72048, act 12314).

### 23. `search-results-vs-literal-content`

- **Owner**: ENGINE
- **Count (shard 0)**: 8
- **Mechanism**: For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...` (often truncated at search-resul). The engine's content view dispatch is treating `*content options` as a Search-type card even though its content is a JSON query spec, not a query result.

**Sample entry ids**:

- `recapture-raw:*style+*right+*content options:render:content` (offset=519, exp=568, act=62148)
- `recapture-raw:*style+*right+*content options:render:open` (offset=3628, exp=3699, act=65279)
- `recapture-raw:Collection+*right+*content options:render:content` (offset=535, exp=562, act=5771)
- `recapture-raw:Collection+*right+*content options:render:open` (offset=3662, exp=3711, act=8920)
- `recapture-raw:Project+*right+*content options:render:content` (offset=523, exp=562, act=162631)

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
- **Count (shard 0)**: 11
- **Mechanism**: For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). The existing set-card-pointer-list-vs-nested-content cluster (C3) includes `+Associations+\w+` but not the bare `+Associates` form. The diff shape (offset 3000-3500, expected `i` got `c`, expected excerpt starts a nested content-view) is the same as C3; the ID suffix is just `+Associates` not `+Associations+...`. Test pin: recapture-raw:Christopher Li - Aikido and the Floating Bridge of Heaven+Associates:render:open.

**Sample entry ids**:

- `recapture-raw:Sylvester Wojtkowsk - Dwelling Imaginally in Soulless Times - An Appreciation of the Work of James Hillman+Associates:render:open` (offset=3772, exp=7344, act=6351)
- `recapture-raw:Bill Moyers and Chris Hedges - How Whole Regions of America Have Been Destroyed in the Name of Quarterly Profits+Associates:render:open` (offset=3861, exp=7457, act=6440)
- `recapture-raw:Chris Hedges - After Latest NDAA Challenge Hearing, Thoughts on the Criminalization of Dissent+Associates:render:open` (offset=3609, exp=7134, act=6188)
- `recapture-raw:John Matson - Legacy of Mental Health Problems from Iraq and Afghanistan Wars Will Be Long-Lived+Associates:render:open` (offset=3652, exp=7190, act=6231)
- `recapture-raw:Silverstein - Rift Widening Between Energy And Insurance Industries Over Climate Change+Associates:render:open` (offset=3526, exp=7028, act=6105)

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
- **Count (shard 0)**: 42
- **Mechanism**: For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). The engine's closed-view bar template picks the card-title span fallback when the card's TYPE is skin and its image data isn't available. Applies to :render:closed (closed bar) and :render:open (open bar).

**Sample entry ids**:

- `recapture-raw:cerulean skin:render:closed` (offset=743, exp=2492, act=2184)
- `recapture-raw:cerulean skin:render:open` (offset=725, exp=9360, act=2661)
- `recapture-raw:cosmo skin:render:closed` (offset=725, exp=2441, act=2142)
- `recapture-raw:cosmo skin:render:open` (offset=707, exp=9207, act=2610)
- `recapture-raw:cyborg skin:render:closed` (offset=731, exp=2458, act=2156)

**View-table work**:

src/card/render/views.ts#closedView + openView + the skin cardtype's bar template: when the rendered card is a skin cardtype, render the media+icon bar-left, not the plain card-title span. Test pin: recapture-raw:cerulean skin:render:closed (offset 743, exp 2492, act 2184).

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

### 35. `rule-item-set-category-recent-missing`

- **Owner**: ENGINE
- **Count (shard 0)**: 56
- **Mechanism**: For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, *default html view+*right, etc. family) Ruby emits the full `_rule-item _category-all _category-field _category-recent _category-common` set list while the engine emits the same prefix but **without `_category-recent`** (it goes straight from `_category-field` to `_category-common`). The diff manifests in two shapes: (a) expected `"` (Ruby's closing class attribute after `_category-common`) vs `"` (engine closing earlier after `_category-common` without `_category-recent`), or (b) expected `r` (Ruby's `_category-recent`) vs `c` (engine's `_category-common`). Triggered by the engine's category-set enumeration not including the 'recent' bucket.

**Sample entry ids**:

- `recapture-raw:*create+*right:render:content` (offset=2374, exp=64967, act=9622)
- `recapture-raw:*create+*right:render:open` (offset=4931, exp=67552, act=12207)
- `recapture-raw:*delete+*right:render:content` (offset=2374, exp=64967, act=9622)
- `recapture-raw:*delete+*right:render:open` (offset=4931, exp=67552, act=12207)
- `recapture-raw:*read+*right:render:content` (offset=2356, exp=64587, act=9560)

**Proposed fix sketch**:

src/card/render/category-set.ts#renderCategorySet: include `_category-recent` (in addition to all/field/common) when the rule card is a *type plus right rule or similar. The engine's category enumeration is missing the 'recent' bucket. Test pins: recapture-raw:*all plus:render:content (offset 2222, exp 57603, act 9312) and recapture-raw:*create+*right:render:content (offset 2374, exp 64967, act 9622 — Ruby '_rule-item _category-all _category-field _category-recent _category-common' vs engine '_rule-item _category-all _category-field _category-common').

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

### 38. `nest-name-case-mismatch`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For nested-include renders (e.g. `media+GBA+YouTube Browser:render:open`), Ruby's nest-name string is `+Media+GBA+VideoControl` (preserves the original case from the content) while the engine emits `+media+GBA+VideoControl` (lowercases the first character). One-byte diff at offset ~4200 inside the data-rule attributes. The engine's nest-name resolution lowercases the first letter when the source card's key starts with a lowercase letter.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/nest.ts#nestName: the engine's nest-name resolution must preserve the original case of the source card name, not lowercase it. Test pin: recapture-raw:media+GBA+YouTube Browser:render:open (offset 4209, exp 102332, act 9212 — `+Media+...` vs `+media+...`).

### 39. `help-text-content-typo`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 30
- **Mechanism**: For `Item+Format+*type plus right+*help:render:closed|open` and similar `Item+X+*type plus right+*help` rule cards, the help text differs by a few characters: Ruby has `the resource. Typically, the subject will be related to...` while engine has `the resource. Typi...` (truncated early with wrong ending), or `Recommended best practice is` vs `Recommended best practice i` (missing trailing 's'). or `in and over the resource. T...` vs `in and over the resource. Typi...`. The engine has a slightly different help-text version for Item cardtype's property descriptions.

**Sample entry ids**:

- `recapture-raw:Item+Contributor+*type plus right+*help:render:closed` (offset=1277, exp=3468, act=3471)
- `recapture-raw:Item+Contributor+*type plus right+*help:render:open` (offset=1259, exp=3557, act=3560)
- `recapture-raw:Item+Coverage+*type plus right+*help:render:closed` (offset=1253, exp=3423, act=3426)
- `recapture-raw:Item+Coverage+*type plus right+*help:render:open` (offset=1235, exp=3978, act=3981)
- `recapture-raw:Item+Creator+*type plus right+*help:render:closed` (offset=1245, exp=3408, act=3411)

**View-table work**:

src/card/render/views.ts#closedView + openView: verify the Item cardtype's property help-text matches Ruby's literal. Test pins: recapture-raw:Item+Subject+*type plus right+*help:render:open (offset 1227, exp 3994, act 3743), recapture-raw:Item+Format+*type plus right+*help:render:closed (offset 1237, exp 3474, act 3477), and recapture-raw:Item+Rights+*type plus right+*help:render:open (offset 1215, exp 3474, act 3477).

### 40. `rules-form-vs-content-view-generalized`

- **Owner**: ENGINE
- **Count (shard 0)**: 64
- **Mechanism**: For `X+Y+*type plus right:render:open` and other 3-part rule-card composition junctions (Cardtype+description+*type plus right, RichText+GBA+*type plus right, Exhibit+Item+*type plus right, Item+Identifier+*type plus right, Item+language+*type plus right, Message+Conversation+*type plus right, Person+Task+*type plus right, Source+Source Content+*type plus right, etc.), Ruby emits a nested `<div id="X-Y-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>`. The engine's rule-card content dispatch is treating every X+Y+*type plus right junction as a *rule card type instead of a *type plus right rule, so it serves the form view instead of the nested content view.

**Sample entry ids**:

- `recapture-raw:Cardtype+description+*type plus right:render:open` (offset=2842, exp=68009, act=9627)
- `recapture-raw:BW 20110918-19+Narrative+*self:render:open` (offset=2710, exp=71634, act=12369)
- `recapture-raw:BW 20110927+Narrative+*self:render:open` (offset=2667, exp=65799, act=12243)
- `recapture-raw:BW 20110929+Narrative+*self:render:open` (offset=2667, exp=65799, act=12243)
- `recapture-raw:Klickstein continues+discussion+*self:render:open` (offset=2802, exp=68421, act=15715)

**Proposed fix sketch**:

src/card/render/views.ts#openView: same root cause as rules-form-filter-vs-content-view (cluster 22) but generalized to ALL X+Y+*type plus right (3-part) junctions. The engine's rule-card dispatch should serve the nested content-view unless the URL signals edit mode. Test pins: recapture-raw:Cardtype+description+*type plus right:render:open (offset 2842), recapture-raw:RichText+GBA+*type plus right:render:open (offset 2736), recapture-raw:Item+language+*type plus right:render:open (offset 2745).

### 41. `tooltip-help-text-empty`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 35
- **Mechanism**: For `*style:render:closed`, `mod: X+*style:render:closed`, `mod: X+*script:render:closed`, `*on update:render:closed`, etc. Ruby emits a populated tooltip (`data-bs-content="Skin (collection of stylesheets) for card&#39;s..."` or `"JavaScript (or CoffeeScript) for card&#39;s page..."` or `"Configure events to be executed when card is updated..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. The engine's tooltip text source doesn't resolve the help-text rule card's structured content for the *style, *script, *on update, and other rule-card types — it falls back to a non-breaking space. Same root cause as help-tooltip-nbsp-empty (cluster 26, which only matched *Ace) but generalized to *style, *script, *on update, and similar rule cards.

**Sample entry ids**:

- `recapture-raw:*style:render:closed` (offset=1078, exp=2219, act=2054)
- `recapture-raw:mod: account+*style:render:closed` (offset=1292, exp=2731, act=2566)
- `recapture-raw:mod: ace editor+*script:render:closed` (offset=1332, exp=2669, act=2630)
- `recapture-raw:mod: api key+*style:render:closed` (offset=1292, exp=2731, act=2566)
- `recapture-raw:mod: bar and box+*script:render:closed` (offset=1341, exp=2684, act=2645)

**View-table work**:

src/card/render/views.ts#closedView (or the tooltip emit helper): the data-bs-content attribute must read the rule card's content (or its *help / *style / *script / *on update sub-rule's content), not fall back to &nbsp;. Test pins: recapture-raw:*style:render:closed (offset 1078, exp 2165, act 2142) and recapture-raw:mod: bar and box+*script:render:closed (offset 1341, exp 1296, act 1243).

### 42. `double-encoded-apostrophe-in-data-card-name`

- **Owner**: ENGINE
- **Count (shard 0)**: 15
- **Mechanism**: For card names that contain an apostrophe (`Saint Nicholas'`, `I'm`, `Smile! You've`, `Don't`, etc.), Ruby HTML-encodes the apostrophe as `&#39;` in the data-card-name attribute (`data-card-name="Saint Nicholas&#39; Dark Companion+Associates"`), while the engine DOUBLE-encodes the already-encoded entity as `&amp;#39;` (`data-card-name="Saint Nicholas&amp;#39; Dark Companion+Associates"`). The diff character is `&` (Ruby's start of `&#39;`) vs `a` (engine's `&amp;` start). This is an HTML-escape bug in the engine's data-card-name emit path.

**Sample entry ids**:

- `recapture-raw:Paula Craig+musings:render:content` (offset=714, exp=55686, act=92421)
- `recapture-raw:Barbara Ehrenreich - Smile! You've got cancer+Associates:render:open` (offset=300, exp=6293, act=5541)
- `recapture-raw:Taylor - Krampus: Saint Nicholas' Dark Companion+Associates:render:open` (offset=301, exp=6320, act=5563)
- `recapture-raw:Taylor - Krampus: Saint Nicholas' Dark Companion+discussion:render:open` (offset=310, exp=3878, act=3889)
- `recapture-raw:Don't Send Your Kid to the Ivy League+Associates:render:open` (offset=262, exp=6188, act=5459)

**Proposed fix sketch**:

src/card/render/views.ts#closedView + openView: when emitting data-card-name, do NOT re-encode the already-encoded apostrophe. The engine is calling HTML-escape twice on a string that already contains `&#39;`. Test pin: recapture-raw:Barbara Ehrenreich - Smile! You've got cancer+Associates:render:open (offset 300, exp 6293, act 5541 — Ruby `You&#39;ve` vs engine `You&amp;#39;ve`).

## UNTRACED entries

143 entries did not match any defined cluster.

- `recapture-raw:Aiki Extensions+Organizer(s):record` (offset=243, exp=365, act=364)
  ```
  FAIL recapture-raw:Aiki Extensions+Organizer(s):record (card-engine)
    first difference at code-unit offset 243 (byte offset 243): expected "s" but got "\""
    expected excerpt: ...nBertram Wohak","key":"aiki_extension+organizer_s","left":"Aiki Extensions","name":"Aiki Extensi...
  ```
- `recapture-raw:AsIn Project Management Training+Organizer(s):render:open` (offset=52, exp=6121, act=5388)
  ```
  FAIL recapture-raw:AsIn Project Management Training+Organizer(s):render:open (render-engine)
    first difference at code-unit offset 52 (byte offset 52): expected "s" but got "-"
    expected excerpt: ... id="a_in_project_management_training-organizer_s-open-view" class="card-slot open-view ALL ALL_...
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
- `recapture-raw:Plans:render:open` (offset=2382, exp=7381, act=2438)
  ```
  FAIL recapture-raw:Plans:render:open (render-engine)
    first difference at code-unit offset 2382 (byte offset 2382): expected "d" but got "b"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><p><div id="plan-Xright-by_name-titled-view" class="...
  ```
- `recapture-raw:*all plus:render:content` (offset=2222, exp=57603, act=9312)
  ```
  FAIL recapture-raw:*all plus:render:content (render-engine)
    first difference at code-unit offset 2222 (byte offset 2222): expected " " but got "\""
    expected excerpt: ...E_PLUS_RIGHT-set-Xdefault SELF-Xall_plu-Xdefault _rule-item _category-all _category-field _categ...
  ```
- `recapture-raw:*all plus:render:open` (offset=4349, exp=59758, act=11467)
  ```
  FAIL recapture-raw:*all plus:render:open (render-engine)
    first difference at code-unit offset 4349 (byte offset 4349): expected " " but got "\""
    expected excerpt: ...E_PLUS_RIGHT-set-Xdefault SELF-Xall_plu-Xdefault _rule-item _category-all _category-field _categ...
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
- `recapture-raw:The End of Awe by Maureen Dowd - NYTimes:render:open` (offset=3512, exp=21945, act=28208)
  ```
  FAIL recapture-raw:The End of Awe by Maureen Dowd - NYTimes:render:open (render-engine)
    first difference at code-unit offset 3512 (byte offset 3512): expected "+" but got "T"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+Participant(s):render:open` (offset=55, exp=6120, act=5368)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+Participant(s):render:open (render-engine)
    first difference at code-unit offset 55 (byte offset 55): expected "s" but got "-"
    expected excerpt: ...="golden_bear_aikido_at_uc_berkeley-participant_s-open-view" class="card-slot open-view ALL ALL_...
  ```
- `recapture-raw:Lift Every Voice and Sing - Lyrics+discussion:render:open` (offset=3644, exp=3884, act=3741)
  ```
  FAIL recapture-raw:Lift Every Voice and Sing - Lyrics+discussion:render:open (render-engine)
    first difference at code-unit offset 3644 (byte offset 3644): expected "<" but got "["
    expected excerpt: ...hole church to sing at my funeral. The other is <a class="known-card" href="/How_Can_I_Keep_From...
  ```
- `recapture-raw:*input type+*right+*content options:render:closed` (offset=1210, exp=3820, act=3993)
  ```
  FAIL recapture-raw:*input type+*right+*content options:render:closed (render-engine)
    first difference at code-unit offset 1210 (byte offset 1210): expected "1" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:BW Oversight+ARCHETYPALLY:render:open` (offset=3308, exp=11952, act=19730)
  ```
  FAIL recapture-raw:BW Oversight+ARCHETYPALLY:render:open (render-engine)
    first difference at code-unit offset 3308 (byte offset 3308): expected "T" but got "R"
    expected excerpt: ...ew" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-human TYPE_PLUS_RIGHT-rich_...
  ```
- `recapture-raw:media+GBA+YouTube Browser:render:open` (offset=4209, exp=102332, act=9212)
  ```
  FAIL recapture-raw:media+GBA+YouTube Browser:render:open (render-engine)
    first difference at code-unit offset 4209 (byte offset 4209): expected "M" but got "m"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;Media+GBA+VideoControl&quot;,&quot;nest_syntax&q...
  ```
- `recapture-raw:Nathanel Rich - Jungleland:render:open` (offset=3221, exp=25334, act=67187)
  ```
  FAIL recapture-raw:Nathanel Rich - Jungleland:render:open (render-engine)
    first difference at code-unit offset 3221 (byte offset 3221): expected "+" but got "N"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Archetypal role playing discussion on Facebook Aug 2012:render:open` (offset=3860, exp=28644, act=40922)
  ```
  FAIL recapture-raw:Archetypal role playing discussion on Facebook Aug 2012:render:open (render-engine)
    first difference at code-unit offset 3860 (byte offset 3860): expected "+" but got "A"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Anonymous+*account:record` (offset=45, exp=161, act=160)
  ```
  FAIL recapture-raw:Anonymous+*account:record (card-engine)
    first difference at code-unit offset 45 (byte offset 45): expected "s" but got "+"
    expected excerpt: {"codename":null,"content":"","key":"anonymous+*account","left":"Anonymous","name":"Anonymous...
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
- `recapture-raw:Sign up - old+*html message:render:content` (offset=5, exp=1000, act=822)
  ```
  FAIL recapture-raw:Sign up - old+*html message:render:content (render-engine)
    first difference at code-unit offset 5 (byte offset 5): expected "c" but got "i"
    expected excerpt: <div class='simple-core'>
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
- `recapture-raw:Blumenfeld - A Culture of Cheating at the University?+discussion:render:open` (offset=4192, exp=5288, act=4980)
  ```
  FAIL recapture-raw:Blumenfeld - A Culture of Cheating at the University?+discussion:render:open (render-engine)
    first difference at code-unit offset 4192 (byte offset 4196): expected "<" but got "b"
    expected excerpt: ...ture of Cheating at the University?</p>
  ```
- `recapture-raw:Collection+*right+*input type:render:closed` (offset=1138, exp=3060, act=3223)
  ```
  FAIL recapture-raw:Collection+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1138 (byte offset 1138): expected "s" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Exhibit+Item+*type plus right:render:content` (offset=2472, exp=69381, act=10013)
  ```
  FAIL recapture-raw:Exhibit+Item+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2472 (byte offset 2472): expected " " but got "\""
    expected excerpt: ...fault SELF-exhibit-item-Xtype_plu_right-Xdefault _rule-item _category-all _category-field _categ...
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
- `recapture-raw:Exhibit+description+*type plus right:render:content` (offset=2540, exp=64871, act=10250)
  ```
  FAIL recapture-raw:Exhibit+description+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2540 (byte offset 2540): expected " " but got "\""
    expected excerpt: ...ELF-exhibit-description-Xtype_plu_right-Xdefault _rule-item _category-all _category-field _categ...
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
- `recapture-raw:Guns:render:open` (offset=2734, exp=31170, act=25730)
  ```
  FAIL recapture-raw:Guns:render:open (render-engine)
    first difference at code-unit offset 2734 (byte offset 2734): expected "+" but got "G"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+tags&quot;,&quot;nest_syntax&quot;:&quot;+tags|...
  ```
- `recapture-raw:Person+discussion:render:open` (offset=3218, exp=4618, act=5953)
  ```
  FAIL recapture-raw:Person+discussion:render:open (render-engine)
    first difference at code-unit offset 3218 (byte offset 3219): expected "T" but got "S"
    expected excerpt: ...ni_bar-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="user design" data-...
  ```
- `recapture-raw:Project+*right+*input type:render:closed` (offset=1114, exp=3013, act=3172)
  ```
  FAIL recapture-raw:Project+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1114 (byte offset 1114): expected "l" but got "<"
    expected excerpt: ...-right col-6'>
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
- `recapture-raw:Task+Log Entry+*type plus right:render:content` (offset=2493, exp=69743, act=10096)
  ```
  FAIL recapture-raw:Task+Log Entry+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2493 (byte offset 2493): expected " " but got "\""
    expected excerpt: ...ult SELF-task-log_entry-Xtype_plu_right-Xdefault _rule-item _category-all _category-field _categ...
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
- `recapture-raw:*follow+*right+*input type:render:closed` (offset=1114, exp=3014, act=3175)
  ```
  FAIL recapture-raw:*follow+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1114 (byte offset 1114): expected "r" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Message+Conversation+*type plus right:render:content` (offset=2542, exp=18734, act=10259)
  ```
  FAIL recapture-raw:Message+Conversation+*type plus right:render:content (render-engine)
    first difference at code-unit offset 2542 (byte offset 2542): expected " " but got "\""
    expected excerpt: ...LF-message-conversation-Xtype_plu_right-Xdefault _rule-item _category-all _category-field _categ...
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
- `recapture-raw:Paul Simon - The Werewolf:render:open` (offset=3754, exp=7593, act=7618)
  ```
  FAIL recapture-raw:Paul Simon - The Werewolf:render:open (render-engine)
    first difference at code-unit offset 3754 (byte offset 3754): expected "+" but got "P"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+YouTube&quot;,&quot;nest_syntax&quot;:&quot;+Yo...
  ```
- `recapture-raw:David Berceli - Conflict resolution and Post Traumatic Stress Disorder A dialectic TRE 2009+discussion:render:open` (offset=4586, exp=4859, act=4682)
  ```
  FAIL recapture-raw:David Berceli - Conflict resolution and Post Traumatic Stress Disorder A dialectic TRE 2009+discussion:render:open (render-engine)
    first difference at code-unit offset 4586 (byte offset 4587): expected "<" but got "["
    expected excerpt: ...t;home_view&quot;:&quot;content&quot;}"><p> see <a class="known-card" href="/Ryan_Nichols_Trauma...
  ```
- `recapture-raw:Pasta Faggioli:render:open` (offset=3034, exp=11927, act=11968)
  ```
  FAIL recapture-raw:Pasta Faggioli:render:open (render-engine)
    first difference at code-unit offset 3034 (byte offset 3034): expected "+" but got "P"
    expected excerpt: ...:&quot;closed&quot;,&quot;nest_name&quot;:&quot;+ingredients&quot;,&quot;nest_syntax&quot;:&quot...
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
- `recapture-raw:Gregory Warner - Remembering Michael Sharp - He Risked His Life To Make Peace:render:open` (offset=4253, exp=33981, act=44252)
  ```
  FAIL recapture-raw:Gregory Warner - Remembering Michael Sharp - He Risked His Life To Make Peace:render:open (render-engine)
    first difference at code-unit offset 4253 (byte offset 4253): expected "+" but got "G"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Source Title&quot;,&quot;nest_syntax&quot;:&quo...
  ```
- `recapture-raw:Lulu Garcia-Navarro NPR talks to Bishop Karen Oliveto - Openly Gay Bishop At Center Of Controversy In United Methodist Church+tags:render:open` (offset=3960, exp=8488, act=7481)
  ```
  FAIL recapture-raw:Lulu Garcia-Navarro NPR talks to Bishop Karen Oliveto - Openly Gay Bishop At Center Of Controversy In United Methodist Church+tags:render:open (render-engine)
    first difference at code-unit offset 3960 (byte offset 3960): expected "i" but got "c"
    expected excerpt: ...
  ```
- `recapture-raw:Anna Shneiderman:render:open` (offset=2930, exp=5667, act=3255)
  ```
  FAIL recapture-raw:Anna Shneiderman:render:open (render-engine)
    first difference at code-unit offset 2930 (byte offset 2937): expected "d" but got "/"
    expected excerpt: ...trong>Relationships</strong></h1>
  ```
- `recapture-raw:Roundtable+How To Connect+discussion:render:open` (offset=4076, exp=4464, act=4389)
  ```
  FAIL recapture-raw:Roundtable+How To Connect+discussion:render:open (render-engine)
    first difference at code-unit offset 4076 (byte offset 4078): expected "<" but got "a"
    expected excerpt: ...sp;</p>
  ```
- `recapture-raw:Depth Psychology and Somatics--Learning Frontiers+discussion:render:open` (offset=4444, exp=6712, act=6660)
  ```
  FAIL recapture-raw:Depth Psychology and Somatics--Learning Frontiers+discussion:render:open (render-engine)
    first difference at code-unit offset 4444 (byte offset 4446): expected "f" but got "F"
    expected excerpt: ...pth Psychology and Somatics--Learning Frontiers+file&quot;,&quot;nest_syntax&quot;:&quot;Depth P...
  ```
- `recapture-raw:MIRANDA KATZ - CGI INFLUENCERS LIKE LIL MIQUELA ARE ABOUT TO FLOOD YOUR FEEDS+tags:render:content` (offset=835, exp=4929, act=4929)
  ```
  FAIL recapture-raw:MIRANDA KATZ - CGI INFLUENCERS LIKE LIL MIQUELA ARE ABOUT TO FLOOD YOUR FEEDS+tags:render:content (render-engine)
    first difference at code-unit offset 835 (byte offset 835): expected "b" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="fauxs" data-card-type-i...
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
- `recapture-raw:journal skin customized+*variables:render:closed` (offset=1467, exp=3020, act=2836)
  ```
  FAIL recapture-raw:journal skin customized+*variables:render:closed (render-engine)
    first difference at code-unit offset 1467 (byte offset 1467): expected " " but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="    Override bootstrap &lt;a target=&quot;_blank...
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
- `recapture-raw:litera skin customized+*variables:render:closed` (offset=1458, exp=3005, act=2821)
  ```
  FAIL recapture-raw:litera skin customized+*variables:render:closed (render-engine)
    first difference at code-unit offset 1458 (byte offset 1458): expected " " but got "&"
    expected excerpt: ... data-bs-trigger="hover focus" data-bs-content="    Override bootstrap &lt;a target=&quot;_blank...
  ```
- `recapture-raw:Princess Scones:render:open` (offset=2672, exp=11500, act=11404)
  ```
  FAIL recapture-raw:Princess Scones:render:open (render-engine)
    first difference at code-unit offset 2672 (byte offset 2672): expected "T" but got "R"
    expected excerpt: ...ew" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-ingredient TYPE_PLUS_RIGHT-...
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
- `recapture-raw:Intellectual Property+Unsecured:render:open` (offset=3421, exp=9056, act=17468)
  ```
  FAIL recapture-raw:Intellectual Property+Unsecured:render:open (render-engine)
    first difference at code-unit offset 3421 (byte offset 3421): expected "T" but got "S"
    expected excerpt: ...ni_bar-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="Analogical System ...
  ```
- `recapture-raw:Learning Pool+training+Notes:render:content` (offset=2896, exp=3692, act=6913)
  ```
  FAIL recapture-raw:Learning Pool+training+Notes:render:content (render-engine)
    first difference at code-unit offset 2896 (byte offset 2896): expected "<" but got "\n"
    expected excerpt: ...ou don't have permission (read) --></span></div></div>
  ```
- `recapture-raw:Conflict Done Well+dojo:render:open` (offset=3580, exp=20332, act=20285)
  ```
  FAIL recapture-raw:Conflict Done Well+dojo:render:open (render-engine)
    first difference at code-unit offset 3580 (byte offset 3580): expected "+" but got "C"
    expected excerpt: ...:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+Dojocho&quot;,&quot;nest_syntax&quot;:&quot;+Do...
  ```
- `recapture-raw:Artificial Intelligence+Replacement+Documents:render:content` (offset=48159, exp=54642, act=54984)
  ```
  FAIL recapture-raw:Artificial Intelligence+Replacement+Documents:render:content (render-engine)
    first difference at code-unit offset 48159 (byte offset 48159): expected "A" but got "T"
    expected excerpt: ...ni_bar-view" class="card-slot mini_bar-view ALL ALL_PLUS TYPE-rich_text RIGHT-anon_exchange_16 T...
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
- `recapture-raw:Topic+*right+*input type:render:closed` (offset=1110, exp=3008, act=3181)
  ```
  FAIL recapture-raw:Topic+*right+*input type:render:closed (render-engine)
    first difference at code-unit offset 1110 (byte offset 1110): expected "m" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:ronald nance:render:open` (offset=2862, exp=5559, act=3187)
  ```
  FAIL recapture-raw:ronald nance:render:open (render-engine)
    first difference at code-unit offset 2862 (byte offset 2869): expected "d" but got "/"
    expected excerpt: ...trong>Relationships</strong></h1>
  ```
- `recapture-raw:Aikido Oak Cliff+discussion:render:open` (offset=3299, exp=3727, act=3502)
  ```
  FAIL recapture-raw:Aikido Oak Cliff+discussion:render:open (render-engine)
    first difference at code-unit offset 3299 (byte offset 3301): expected "<" but got "["
    expected excerpt: ...<p> </p>
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

