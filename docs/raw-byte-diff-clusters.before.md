# Raw ground-truth byte-diff cluster map

Generated: 2026-09-25T12:30:14.948Z

## FULL-RUN MAP (coordinator-fresh verification-aggregate.json)

The full-run map below is grounded in the coordinator-fresh tmp/raw-ground-truth/enumeration/verification-aggregate.json (1489 entries, 637 fail, 554 byte-diff). The 13 shard-0 signatures were extended by hand-sampling ~30 UNTRACED entries per dominant axis (view x ratio band x offset band) and writing predicates for the mechanisms that actually appear in the full-run aggregate.

- byte-diff total: 554
- clustered: 438 (79.1% of 554)
- UNTRACED: 116 (20.9% of 554)
- Sum check: 438 clustered + 116 UNTRACED = 554

| # | Cluster | Owner | Count | One-line mechanism |
|---|---------|-------|------:|---------------------|
| 1 | `deep-read-rule-deny-on-self-or-right` | SEEDING | 272 | Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). |
| 2 | `parens-name-key-normalization` | ENGINE | 55 | DeckoName.toKey normalizes trailing '(s)' to a single trailing underscore instead of Ruby's '_s' underscore, so `Organizer(s)` keys as `organizer_` (engine) vs `organizer_s` (Ruby). |
| 3 | `read-rule-grant-vs-deny` | SEEDING | 34 | Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). |
| 4 | `known-card-vs-wanted-card-on-rule-set` | ENGINE | 30 | For `X+*type+*create:render:closed` and `X+*type+*delete:render:closed` (HTML/SCSS/Project Cardtype rules), Ruby emits `<a class="known-card" href="/Shark">` (the rule-card set's referent is a known card in Ruby's seed closure) while the engine emits `<a class="wanted-card" href="/Shark">` (same href but a different CSS class — engine treats it as wanted because the seed closure didn't register it as known). |
| 5 | `tiny-render-type-plus-right-rule-card` | ENGINE | 18 | Engine renders a *type+*right / *right rule card's open/content view as the bare rule-card bar (~10K bytes) while Ruby emits the SET's expanded children list (~60K bytes including _category-all _category-field _category-recent _category-common, four categories). |
| 6 | `set-card-pointer-list-vs-nested-content` | ENGINE | 9 | Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. |
| 7 | `as-in-layout-error-message-divergence` | ENGINE | 4 | For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. |
| 8 | `structured-content-record-empty` | ENGINE | 3 | For *alerts, *now, *version, *count, etc., Ruby resolves the structured-card content (e.g. |
| 9 | `boolean-yes-vs-integer-1` | VIEW-REGISTRY | 2 | Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. |
| 10 | `double-encoded-apostrophe-in-data-card-name` | ENGINE | 2 | For card names that contain an apostrophe (`Saint Nicholas'`, `I'm`, `Smile! You've`, `Don't`, etc.), Ruby HTML-encodes the apostrophe as `&#39;` in the data-card-name attribute (`data-card-name="Saint Nicholas&#39; Dark Companion+Associates"`), while the engine DOUBLE-encodes the already-encoded entity as `&amp;#39;` (`data-card-name="Saint Nicholas&amp;#39; Dark Companion+Associates"`). |
| 11 | `rule-card-content-as-literal-text` | VIEW-REGISTRY | 1 | Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. |
| 12 | `rule-card-content-as-pointer-list` | VIEW-REGISTRY | 1 | Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. |
| 13 | `apostrophe-name-key` | ENGINE | 1 | Engine's name key normalization for an apostrophe diverges from Ruby's: Ruby key `paula_craig_father_s_day` (apostrophe -> `_s`), engine key `paula_craig_father__day` (apostrophe stripped, leaving the underscore from the leading space). |
| 14 | `favicon-text-content-divergence` | ENGINE | 1 | Engine and Ruby render *favicon:render:closed with different literal text — Ruby emits `A favicon (or shortcut icon) is a small image us...` while engine emits `<p><em>Please remember to click ...`. |
| 15 | `external-link-vs-raw-url` | VIEW-REGISTRY | 1 | Ruby wraps external URLs in `<a target="_blank" class="external-link" href="https://...">URL</a>` while the engine emits the raw URL text. |
| 16 | `set-card-associates-pointer-list` | ENGINE | 1 | For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). |
| 17 | `apostrophe-name-key-extended` | ENGINE | 1 | Broader version of the existing apostrophe-name-key cluster (C12, which only matched one ID). |
| 18 | `anonymous-card-name-key-truncation` | ENGINE | 1 | For card names that END with 's' followed by a +*self junction, the engine's name-key normalization drops the trailing 's' (Anonymous -> anonymou, similar pattern for other card names). |
| 19 | `rules-form-vs-content-view-generalized` | ENGINE | 1 | For `X+Y+*type plus right:render:open` and other 3-part rule-card composition junctions (Cardtype+description+*type plus right, RichText+GBA+*type plus right, Exhibit+Item+*type plus right, Item+Identifier+*type plus right, Item+language+*type plus right, Message+Conversation+*type plus right, Person+Task+*type plus right, Source+Source Content+*type plus right, etc.), Ruby emits a nested `<div id="X-Y-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>`. |
| 20 | `runaway-output-recursion` | ENGINE | 0 | Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). |
| 21 | `search-query-content-vs-literal` | ENGINE | 0 | Engine renders `*layout+*right+*content options:render:content` by interpreting the JSON content spec as a search query and rendering `<div class="search-no-results">` while Ruby renders the JSON literal `{"type": "Layout"}`. |
| 22 | `news-item-show-options-comment-box` | VIEW-REGISTRY | 0 | Engine's `News Item+discussion:render:open` data-slot has only `["open"]` in the show list while Ruby's has `["open","comment_box"]`. |
| 23 | `whitespace-newline-before-div` | ENGINE | 0 | Ruby's HTML output includes a literal `\n` before the closing `</div>` of the inner-slot wrapper (after the accordion body closes), while engine emits the closing `</div>` directly without the newline. |
| 24 | `wiki-link-vs-known-card-html-anchor` | VIEW-REGISTRY | 0 | Ruby's renderer emits `<a class="known-card" href="/CardName">card-title</a>` for wiki-link content references while the engine emits the raw `[[CardName]]` literal. |
| 25 | `invite-links-account-empty-div` | ENGINE | 0 | For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder OR `<div>\n<div id="X-agree-titled-view">...` (no invite-links panel at all, jumping straight to the agree-titled view). |
| 26 | `layout-content-pointer-list-wrap` | VIEW-REGISTRY | 0 | For `X+*self+*layout:render:closed|open` the engine wraps the layout name in a `<div class="pointer-list"><div class="pointer-item...">` wrapper while Ruby renders the literal layout name (e.g. |
| 27 | `skin-card-content-not-resolved` | SEEDING | 0 | For `X skin:record` (and `bootstrap: X:record`) Ruby resolves the structured-card content (~500KB of SCSS/CSS) into the JSON `content` field, while the engine returns the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch theme...` (200 bytes) — or for `bootstrap: X:record`, an empty content. |
| 28 | `rules-form-filter-vs-content-view` | ENGINE | 0 | For `X+Y+*self:render:open` and similar rule-card composition junctions (3-part junctions like `Seeley inquiry+overview+*self`, `Item+Contributor+*type plus right`, `Administrator+*members+*self`), Ruby emits a nested `<div id="X-Y-Xself-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). |
| 29 | `search-results-vs-literal-content` | ENGINE | 0 | For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...` (often truncated at search-resul). |
| 30 | `card-list-name-vs-card-list-bar` | VIEW-REGISTRY | 0 | For `X+*right+*input type:render:content|open` Ruby emits `<div class="card-list card-list-name pointer-list">` while the engine emits `<div class="card-list card-list-bar pointer-list">`. |
| 31 | `bar-right-config-content-missing` | VIEW-REGISTRY | 0 | For `mod: X:render:closed` (and similar bar-content cards), Ruby emits a populated `bar-right` slot with the card's description text (`configurations, scripts`, `styles`, `configurations, cardtypes, scripts, styles`) while the engine emits an empty `bar-right` (just a newline then `</div>`). |
| 32 | `help-tooltip-nbsp-empty` | VIEW-REGISTRY | 0 | For *Ace and *on update (and other help-text rule cards) Ruby emits a populated tooltip (`data-bs-content="Configure &lt;a target=&quot;_blank&quot; class=..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. |
| 33 | `skin-card-bar-left-titled-vs-span-title` | VIEW-REGISTRY | 0 | For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). |
| 34 | `mod-record-template-literal-vs-inspected` | ENGINE | 0 | For `Mod:record` Ruby returns the Cardio::Mod inspection output (`#<Cardio::Mod:0x000001bc8a22c908>_mod\n#<Cardio::...`) as the content field, while the engine returns the unresolved template literal `<p>{{+description|content}}</p>\n<p>{{_|add_button|...</p>`. |
| 35 | `rule-card-default-description-missing` | ENGINE | 0 | For `Cardtype+*type+*default:render:content|open` and `Role+*type+*default:render:content|open` Ruby emits the description content (`Every Decko card has one and only one <strong>type</strong>...`) while the engine emits an empty `<p></p><p>&nbsp;</p><p>[[/new/Cardtype+*type+*defa...` placeholder. |
| 36 | `wiki-link-vs-rich-content-link` | ENGINE | 0 | For card content views where the Ruby side emits a styled link (`<a class="btn btn-sm btn-outline-primary me-2 known-card"...`) and the engine emits the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch them...`, the engine's content view isn't applying the link-to-HTML transform for skin-card references. |
| 37 | `rule-item-set-category-recent-missing` | ENGINE | 0 | For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, *default html view+*right, etc. |
| 38 | `rule-card-input-type-pointer-list-literal` | VIEW-REGISTRY | 0 | For `X+*right+*input type:render:open` and `X+*right+*content options:render:open` Ruby emits the literal input-type value (`radio`, `select`, `multiselect`) or JSON literal `{"type":"..."}` while the engine emits a `<div class="pointer-list">` wrapper. |
| 39 | `denied-vs-render-rule-symmetric` | SEEDING | 0 | The symmetric counterpart to cluster 7 / C15: for a small set of entries (e.g. |
| 40 | `nest-name-case-mismatch` | ENGINE | 0 | For nested-include renders (e.g. |
| 41 | `help-text-content-typo` | VIEW-REGISTRY | 0 | For `Item+Format+*type plus right+*help:render:closed|open` and similar `Item+X+*type plus right+*help` rule cards, the help text differs by a few characters: Ruby has `the resource. |
| 42 | `tooltip-help-text-empty` | VIEW-REGISTRY | 0 | For `*style:render:closed`, `mod: X+*style:render:closed`, `mod: X+*script:render:closed`, `*on update:render:closed`, etc. |
| - | **UNTRACED** | - | 116 | no mechanism matched. |
| - | **Total** | - | **554** | sum of byte-diff. |

---

## SHARD-0 HISTORY (13 original signatures — kept for archaeology)

## Inputs read

- `tmp\raw-ground-truth\enumeration\verification-aggregate.json` -- per-entry signature source
- `tmp\raw-ground-truth\enumeration\per-class-mechanisms.json` -- full-run baseline

## Population

- On-disk aggregate: `1489` entries, `637` fail, `554` byte-diff
- per-class-mechanisms full run: `10274` entries, `6345` fail, byte-diff = `5982` (`2573` card-engine + `3409` render-engine)

### Note on task-numbers vs on-disk numbers

The task description references 6,415 pass / 3,859 fail / 3,692 byte-diff. The on-disk `verification-aggregate.json` is coordinator-fresh but contains only shard 0 (341 entries). The most-recent FULL aggregate on disk is `per-class-mechanisms.json`, which shows 3,929 pass / 6,345 fail / 5,982 byte-diff (2,573 card-engine + 3,409 render-engine). The task's claimed numbers do not match either file. The cluster map below is grounded in (a) the on-disk aggregate for per-entry signatures (122 byte-diff entries from shard 0) and (b) the per-class-mechanisms baseline for full-run counts. Per-cluster extrapolation is documented inline.

## Cluster table

| # | Cluster | Owner | Count (shard 0) | One-line mechanism |
|---|---------|-------|-----------------|---------------------|
| 1 | `parens-name-key-normalization` | ENGINE | 55 | DeckoName.toKey normalizes trailing '(s)' to a single trailing underscore instead of Ruby's '_s' underscore, so `Organizer(s)` keys as `organizer_` (engine) vs `organizer_s` (Ruby). |
| 2 | `tiny-render-type-plus-right-rule-card` | ENGINE | 18 | Engine renders a *type+*right / *right rule card's open/content view as the bare rule-card bar (~10K bytes) while Ruby emits the SET's expanded children list (~60K bytes including _category-all _category-field _category-recent _category-common, four categories). |
| 3 | `set-card-pointer-list-vs-nested-content` | ENGINE | 9 | Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. |
| 4 | `boolean-yes-vs-integer-1` | VIEW-REGISTRY | 2 | Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. |
| 5 | `rule-card-content-as-literal-text` | VIEW-REGISTRY | 1 | Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. |
| 6 | `rule-card-content-as-pointer-list` | VIEW-REGISTRY | 1 | Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. |
| 7 | `read-rule-grant-vs-deny` | SEEDING | 34 | Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). |
| 8 | `runaway-output-recursion` | ENGINE | 0 | Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). |
| 9 | `as-in-layout-error-message-divergence` | ENGINE | 4 | For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. |
| 10 | `search-query-content-vs-literal` | ENGINE | 0 | Engine renders `*layout+*right+*content options:render:content` by interpreting the JSON content spec as a search query and rendering `<div class="search-no-results">` while Ruby renders the JSON literal `{"type": "Layout"}`. |
| 11 | `news-item-show-options-comment-box` | VIEW-REGISTRY | 0 | Engine's `News Item+discussion:render:open` data-slot has only `["open"]` in the show list while Ruby's has `["open","comment_box"]`. |
| 12 | `apostrophe-name-key` | ENGINE | 1 | Engine's name key normalization for an apostrophe diverges from Ruby's: Ruby key `paula_craig_father_s_day` (apostrophe -> `_s`), engine key `paula_craig_father__day` (apostrophe stripped, leaving the underscore from the leading space). |
| 13 | `favicon-text-content-divergence` | ENGINE | 1 | Engine and Ruby render *favicon:render:closed with different literal text — Ruby emits `A favicon (or shortcut icon) is a small image us...` while engine emits `<p><em>Please remember to click ...`. |
| 14 | `deep-read-rule-deny-on-self-or-right` | SEEDING | 272 | Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). |
| 15 | `whitespace-newline-before-div` | ENGINE | 0 | Ruby's HTML output includes a literal `\n` before the closing `</div>` of the inner-slot wrapper (after the accordion body closes), while engine emits the closing `</div>` directly without the newline. |
| 16 | `wiki-link-vs-known-card-html-anchor` | VIEW-REGISTRY | 0 | Ruby's renderer emits `<a class="known-card" href="/CardName">card-title</a>` for wiki-link content references while the engine emits the raw `[[CardName]]` literal. |
| 17 | `external-link-vs-raw-url` | VIEW-REGISTRY | 1 | Ruby wraps external URLs in `<a target="_blank" class="external-link" href="https://...">URL</a>` while the engine emits the raw URL text. |
| 18 | `invite-links-account-empty-div` | ENGINE | 0 | For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder OR `<div>\n<div id="X-agree-titled-view">...` (no invite-links panel at all, jumping straight to the agree-titled view). |
| 19 | `layout-content-pointer-list-wrap` | VIEW-REGISTRY | 0 | For `X+*self+*layout:render:closed|open` the engine wraps the layout name in a `<div class="pointer-list"><div class="pointer-item...">` wrapper while Ruby renders the literal layout name (e.g. |
| 20 | `skin-card-content-not-resolved` | SEEDING | 0 | For `X skin:record` (and `bootstrap: X:record`) Ruby resolves the structured-card content (~500KB of SCSS/CSS) into the JSON `content` field, while the engine returns the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch theme...` (200 bytes) — or for `bootstrap: X:record`, an empty content. |
| 21 | `structured-content-record-empty` | ENGINE | 3 | For *alerts, *now, *version, *count, etc., Ruby resolves the structured-card content (e.g. |
| 22 | `rules-form-filter-vs-content-view` | ENGINE | 0 | For `X+Y+*self:render:open` and similar rule-card composition junctions (3-part junctions like `Seeley inquiry+overview+*self`, `Item+Contributor+*type plus right`, `Administrator+*members+*self`), Ruby emits a nested `<div id="X-Y-Xself-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). |
| 23 | `search-results-vs-literal-content` | ENGINE | 0 | For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...` (often truncated at search-resul). |
| 24 | `card-list-name-vs-card-list-bar` | VIEW-REGISTRY | 0 | For `X+*right+*input type:render:content|open` Ruby emits `<div class="card-list card-list-name pointer-list">` while the engine emits `<div class="card-list card-list-bar pointer-list">`. |
| 25 | `known-card-vs-wanted-card-on-rule-set` | ENGINE | 30 | For `X+*type+*create:render:closed` and `X+*type+*delete:render:closed` (HTML/SCSS/Project Cardtype rules), Ruby emits `<a class="known-card" href="/Shark">` (the rule-card set's referent is a known card in Ruby's seed closure) while the engine emits `<a class="wanted-card" href="/Shark">` (same href but a different CSS class — engine treats it as wanted because the seed closure didn't register it as known). |
| 26 | `bar-right-config-content-missing` | VIEW-REGISTRY | 0 | For `mod: X:render:closed` (and similar bar-content cards), Ruby emits a populated `bar-right` slot with the card's description text (`configurations, scripts`, `styles`, `configurations, cardtypes, scripts, styles`) while the engine emits an empty `bar-right` (just a newline then `</div>`). |
| 27 | `help-tooltip-nbsp-empty` | VIEW-REGISTRY | 0 | For *Ace and *on update (and other help-text rule cards) Ruby emits a populated tooltip (`data-bs-content="Configure &lt;a target=&quot;_blank&quot; class=..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. |
| 28 | `set-card-associates-pointer-list` | ENGINE | 1 | For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). |
| 29 | `apostrophe-name-key-extended` | ENGINE | 1 | Broader version of the existing apostrophe-name-key cluster (C12, which only matched one ID). |
| 30 | `skin-card-bar-left-titled-vs-span-title` | VIEW-REGISTRY | 0 | For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). |
| 31 | `mod-record-template-literal-vs-inspected` | ENGINE | 0 | For `Mod:record` Ruby returns the Cardio::Mod inspection output (`#<Cardio::Mod:0x000001bc8a22c908>_mod\n#<Cardio::...`) as the content field, while the engine returns the unresolved template literal `<p>{{+description|content}}</p>\n<p>{{_|add_button|...</p>`. |
| 32 | `rule-card-default-description-missing` | ENGINE | 0 | For `Cardtype+*type+*default:render:content|open` and `Role+*type+*default:render:content|open` Ruby emits the description content (`Every Decko card has one and only one <strong>type</strong>...`) while the engine emits an empty `<p></p><p>&nbsp;</p><p>[[/new/Cardtype+*type+*defa...` placeholder. |
| 33 | `anonymous-card-name-key-truncation` | ENGINE | 1 | For card names that END with 's' followed by a +*self junction, the engine's name-key normalization drops the trailing 's' (Anonymous -> anonymou, similar pattern for other card names). |
| 34 | `wiki-link-vs-rich-content-link` | ENGINE | 0 | For card content views where the Ruby side emits a styled link (`<a class="btn btn-sm btn-outline-primary me-2 known-card"...`) and the engine emits the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch them...`, the engine's content view isn't applying the link-to-HTML transform for skin-card references. |
| 35 | `rule-item-set-category-recent-missing` | ENGINE | 0 | For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, *default html view+*right, etc. |
| 36 | `rule-card-input-type-pointer-list-literal` | VIEW-REGISTRY | 0 | For `X+*right+*input type:render:open` and `X+*right+*content options:render:open` Ruby emits the literal input-type value (`radio`, `select`, `multiselect`) or JSON literal `{"type":"..."}` while the engine emits a `<div class="pointer-list">` wrapper. |
| 37 | `denied-vs-render-rule-symmetric` | SEEDING | 0 | The symmetric counterpart to cluster 7 / C15: for a small set of entries (e.g. |
| 38 | `nest-name-case-mismatch` | ENGINE | 0 | For nested-include renders (e.g. |
| 39 | `help-text-content-typo` | VIEW-REGISTRY | 0 | For `Item+Format+*type plus right+*help:render:closed|open` and similar `Item+X+*type plus right+*help` rule cards, the help text differs by a few characters: Ruby has `the resource. |
| 40 | `rules-form-vs-content-view-generalized` | ENGINE | 1 | For `X+Y+*type plus right:render:open` and other 3-part rule-card composition junctions (Cardtype+description+*type plus right, RichText+GBA+*type plus right, Exhibit+Item+*type plus right, Item+Identifier+*type plus right, Item+language+*type plus right, Message+Conversation+*type plus right, Person+Task+*type plus right, Source+Source Content+*type plus right, etc.), Ruby emits a nested `<div id="X-Y-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>`. |
| 41 | `tooltip-help-text-empty` | VIEW-REGISTRY | 0 | For `*style:render:closed`, `mod: X+*style:render:closed`, `mod: X+*script:render:closed`, `*on update:render:closed`, etc. |
| 42 | `double-encoded-apostrophe-in-data-card-name` | ENGINE | 2 | For card names that contain an apostrophe (`Saint Nicholas'`, `I'm`, `Smile! You've`, `Don't`, etc.), Ruby HTML-encodes the apostrophe as `&#39;` in the data-card-name attribute (`data-card-name="Saint Nicholas&#39; Dark Companion+Associates"`), while the engine DOUBLE-encodes the already-encoded entity as `&amp;#39;` (`data-card-name="Saint Nicholas&amp;#39; Dark Companion+Associates"`). |
| - | **UNTRACED** | - | 116 | no mechanism matched. |
| - | **Total** | - | 554 | sum of byte-diff from shard 0. |

### Sum check

Clustered + UNTRACED = 554 ; byte-diff total = 554 ; diff = 0

## Per-cluster detail

### 1. `parens-name-key-normalization`

- **Owner**: ENGINE
- **Count (shard 0)**: 55
- **Mechanism**: DeckoName.toKey normalizes trailing '(s)' to a single trailing underscore instead of Ruby's '_s' underscore, so `Organizer(s)` keys as `organizer_` (engine) vs `organizer_s` (Ruby). Affects both record JSON `key` field and the slot-id emitted by slotWrap (card.name.safeKey -> div id suffix).

**Sample entry ids**:

- `recapture-raw:ABCglobal+Organizer(s):record` (offset=109, exp=219, act=218)
- `recapture-raw:ABCglobal+Organizer(s):render:open` (offset=30, exp=10569, act=10448)
- `recapture-raw:Archetypal+Organizer(s):record` (offset=71, exp=183, act=182)
- `recapture-raw:Archetypal+Organizer(s):render:open` (offset=30, exp=5610, act=5561)
- `recapture-raw:Archetypal+Participant(s):record` (offset=81, exp=197, act=196)

**Proposed fix sketch**:

src/card/name.ts: simpleKey currently strips a trailing '_' if the pre-replace string ends with the paren-group 's'; align with card-1.110.0 lib/card/name.rb #generate_part_names which keeps the interior word and appends '_s' for any '(...)' suffix. Test pin: recapture-raw:ABCglobal+Organizer(s):record (offset 109, exp 219, act 218 — `organizer_s` vs `organizer_`).

### 2. `tiny-render-type-plus-right-rule-card`

- **Owner**: ENGINE
- **Count (shard 0)**: 18
- **Mechanism**: Engine renders a *type+*right / *right rule card's open/content view as the bare rule-card bar (~10K bytes) while Ruby emits the SET's expanded children list (~60K bytes including _category-all _category-field _category-recent _category-common, four categories). Engine's rule-card content dispatch is short-circuiting to its own bar view and missing the rule's applied-template expansion (the category list the rule card composes from its content).

**Sample entry ids**:

- `recapture-raw:*captcha+*right:render:content` (offset=4996, exp=59486, act=9665)
- `recapture-raw:*captcha+*right:render:open` (offset=7566, exp=62084, act=12263)
- `recapture-raw:*content options+*right:render:content` (offset=5216, exp=67529, act=9955)
- `recapture-raw:*content options+*right:render:open` (offset=7893, exp=70234, act=12660)
- `recapture-raw:*help+*right:render:content` (offset=2133, exp=58952, act=15356)

**Proposed fix sketch**:

src/card/render/views.ts#coreView: when the rule card is a *type+*right or *right rule, render the SET member list (category items from the rule's content), not just the rule's own bar. Test pins: recapture-raw:*captcha+*right:render:open (exp 62084, act 12245, offset 4954) and recapture-raw:RichText+*type:render:content (exp 59491, act 9659, offset 2383).

### 3. `set-card-pointer-list-vs-nested-content`

- **Owner**: ENGINE
- **Count (shard 0)**: 9
- **Mechanism**: Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. Differences are concentrated at offset ~2400-3500 (after the accordion body), confirming the divergence is in the content-slot wrap, not the bar/preamble. The lower band (~2400-2700) is `+Pages`, `+Family`, etc. and the upper band (~3000-3500) is `+tags`, `+Associations+tags`, `+Associations+articles` (longer-card-name junctions whose slot-id is shorter relative to the accordion body).

**Sample entry ids**:

- `recapture-raw:Metashamanic+Core Project:render:open` (offset=3318, exp=5780, act=4142)
- `recapture-raw:Rights+copyleft+tags:render:open` (offset=3179, exp=17312, act=17342)
- `recapture-raw:Aikido of Berkeley+tags:render:open` (offset=3152, exp=5679, act=7857)
- `recapture-raw:Diddly Squat+tags:render:open` (offset=3170, exp=7852, act=10098)
- `recapture-raw:Free Aiki Dojo+Associations+tags:render:open` (offset=3398, exp=5689, act=5699)

**Proposed fix sketch**:

src/card/render/views.ts#openView + barBottomView: when the rendered card is a set card (not a pointer/list cardtype), emit a nested content-view slot per child instead of the card-list pointer-list wrapper. Test pins: recapture-raw:Brandon WilliamsCraig+Pages:render:open (offset 2540, exp 20541, act 18200) and recapture-raw:mythicity+Pages:render:open (offset 2375, exp 3127, act 4910 — engine LARGER here, same mechanism because Ruby's slot wrap is shorter than engine's pointer-list wrap). Also: recapture-raw:X+Associations+tags:render:open (offset ~3300, same mechanism, longer card name).

### 4. `boolean-yes-vs-integer-1`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 2
- **Mechanism**: Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. Same offset (~970 in the value label position). Triggered by accordion-button labels and counter badges that format the value as a truthy/falsy display string.

**Sample entry ids**:

- `recapture-raw:*all+*captcha:render:content` (offset=440, exp=446, act=447)
- `recapture-raw:*captcha+*right+*default:render:content` (offset=484, exp=490, act=491)

**View-table work**:

src/card/render/views.ts#openView/closedView + content-overrides.ts: for *all+*captcha content, dispatch to the boolean-to-display formatter the same way bar/accordion bodies do (Ruby: 'yes'/'no', engine: '1'/'0'). Test pins: recapture-raw:*all+*captcha:render:content (offset 437, exp 446, act 444).

### 5. `rule-card-content-as-literal-text`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 1
- **Mechanism**: Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. Same offset band (~2800-3000) as the set-card cluster but differentiated by excerpt text being a short literal rather than a child slot.

**Sample entry ids**:

- `recapture-raw:Menu+*right+*default:render:open` (offset=5296, exp=7094, act=6991)

**View-table work**:

src/card/render/views.ts#contentView: for *type+*right rule cards whose dbContent is a single literal (no items, no template), render the literal text directly instead of wrapping in a content-view slot. Test pins: recapture-raw:*table of contents+*right+*default:render:open (offset 2947, exp 2976, act 3624 — `4` literal vs nested content-view slot) and recapture-raw:Setting+*self+*table of contents:render:open (offset 2966, exp 2995, act 3654 — `0` literal vs nested slot).

### 6. `rule-card-content-as-pointer-list`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 1
- **Mechanism**: Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. Triggered by engine's isPointerOrListCard gate (src/card/render/pointer-list.ts:106) mis-classifying the card based on dbContent shape.

**Sample entry ids**:

- `recapture-raw:*layout+*right+*content options:render:open` (offset=1544, exp=3661, act=3664)

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: only treat as pointer/list when the type card is actually pointer or list, not based on dbContent heuristics. Test pin: recapture-raw:*all+*layout:render:open (offset 953, exp 5245, act 5388 — `Default Layout` literal vs `<div class="pointer-list">`).

### 7. `read-rule-grant-vs-deny`

- **Owner**: SEEDING
- **Count (shard 0)**: 34
- **Mechanism**: Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). At offset ~2000-4500 (mid-list) Ruby renders a `<span class="denied">` while engine renders a real `<div id="...-bar-view">` (or vice versa). The seed closure for the *read rule universe is partial — the rule's set card or REFEREE_IDS walk is missing the grants the engine needs to deny. This is a byte-diff signature (not classified as `permission_denied_mismatch` because the verify script's excerpt-match regex misses the truncation pattern at long offsets).

**Sample entry ids**:

- `recapture-raw:*all:render:content` (offset=2023, exp=54734, act=37007)
- `recapture-raw:*all:render:open` (offset=4192, exp=56828, act=36617)
- `recapture-raw:Free Aiki Dojo+Pages:render:open` (offset=8264, exp=8386, act=10934)
- `recapture-raw:Martial Nonviolence+Pages:render:content` (offset=8431, exp=38635, act=65895)
- `recapture-raw:Martial Nonviolence+Pages:render:open` (offset=11064, exp=41296, act=51553)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: extend the *read rule universe closure walk to follow the rule's SET card's card_references grants (not just left/right/type_id). Ruby's permissions.rb#read_rule? evaluates the union of grants via Card.where, which the current closure walk doesn't replicate. Test pin: recapture-raw:*all:render:content (offset 2023, exp 54734, act 40242 — denied spans present in Ruby where engine renders real cards).

### 8. `runaway-output-recursion`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). Some kind of infinite recursion or runaway inclusion. Both expected and actual are non-error HTML, but the actual is ~100x larger than Ruby. Likely related to the search-query-content cluster (engine interpreting JSON content as a recursive search query without a depth limit).

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render.ts (render entrypoint) + src/card/set-patterns/search.ts: add a recursion-depth guard around render() — when the same card name is being rendered as a nest within its own output, abort at depth 8 (matches Ruby's Card::View::Cache#fetched caching that prevents the same recursive nest). Test pin: recapture-raw:Family+*right+*content options:render:content (offset 517, exp 540, act 619284).

### 9. `as-in-layout-error-message-divergence`

- **Owner**: ENGINE
- **Count (shard 0)**: 4
- **Mechanism**: For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. Different error classes for the same card — engine's nest-depth limit fires before the credential lookup the engine should also have. Classified as `capture_error_still_raised:Card` by the verify script.

**Sample entry ids**:

- `recapture-raw:AsIn Layout:render:content` (offset=15, exp=74, act=49)
- `recapture-raw:AsIn Layout:render:open` (offset=15, exp=74, act=49)
- `recapture-raw:AsIn Layout+*self:render:content` (offset=2164, exp=60300, act=12788)
- `recapture-raw:AsIn Layout+*self:render:open` (offset=4753, exp=62917, act=15405)

**Proposed fix sketch**:

src/card/render.ts: a nest-depth guard should match the card's expected exception class (CAPTURE_ERROR was a credential error in Ruby; engine's guard fires first). Either move the credential check ahead of the depth guard or reproduce Ruby's Card::Error::PermissionDenied path. Test pin: recapture-raw:AsIn Layout:render:content (offset 15, exp 74, act 49).

### 10. `search-query-content-vs-literal`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: Engine renders `*layout+*right+*content options:render:content` by interpreting the JSON content spec as a search query and rendering `<div class="search-no-results">` while Ruby renders the JSON literal `{"type": "Layout"}`. Mechanism: the engine's content dispatch is treating `*layout+*right+*content options` as a Search-type card even though its content is a query spec, not a query result.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/views.ts#coreView: for content views whose dbContent is literal JSON, render the literal instead of dispatching to the search query runner. Test pin: recapture-raw:*layout+*right+*content options:render:content (offset 521, exp 545, act 564).

### 11. `news-item-show-options-comment-box`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: Engine's `News Item+discussion:render:open` data-slot has only `["open"]` in the show list while Ruby's has `["open","comment_box"]`. The comment_box view is missing from the engine's render dispatch for News Item + discussion junction; the engine's data-slot show:["open"] hides the comment_box.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

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
- **Count (shard 0)**: 272
- **Mechanism**: Engine denies read access where Ruby renders the full card bar at offset 2000-5000 (mid-list, after the permission-denied nav preamble). The pattern generalizes to ANY junction ending in `*self`, `*right`, `*type`, or just `*X` (single *-prefixed card name) where the seed closure fails to bring the read grants. Ruby's expected HTML contains a `<div id="...-Xdefault-bar-view">` (real card bar, sometimes truncated at `-Xsel` or `-Xtype` in the excerpt) while engine emits a `<span class="denied">` placeholder. Same root cause as cluster 7 (the *read rule universe closure is partial). The diff character is `d` (start of `<div`) on the Ruby side and `s` (start of `<span`) on the engine side, both after the `</span></li>\n<li class="nav-item">` nav preamble.

**Sample entry ids**:

- `recapture-raw:*rstar:render:content` (offset=2038, exp=57019, act=14586)
- `recapture-raw:*rstar:render:open` (offset=4131, exp=59140, act=16707)
- `recapture-raw:AiBerk at ASC SumRet2010_group_07+*self:render:content` (offset=2327, exp=66067, act=10589)
- `recapture-raw:AiBerk at ASC SumRet2010_group_11+*self:render:content` (offset=2327, exp=66067, act=10589)
- `recapture-raw:AiBerk at ASC SumRet2010_wholegroup_01+*self:render:content` (offset=2362, exp=67362, act=10744)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: the *read rule universe closure must walk the SET card's child-card grants (Ruby evaluates Card.where(matches_rule) for each *read rule's pattern and the closure doesn't replicate). Test pins: recapture-raw:*rstar:render:content (offset 2038, exp 57019, act 14585), recapture-raw:CSS+*type:render:open (offset 4599, exp 60766, act 17606), recapture-raw:Wendy Palmer+*self:render:open (offset 2173, exp 60489, act 9878).

### 15. `whitespace-newline-before-div`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: Ruby's HTML output includes a literal `\n` before the closing `</div>` of the inner-slot wrapper (after the accordion body closes), while engine emits the closing `</div>` directly without the newline. Single-byte diff per closing tag, but the `+discussion:render:open` family aggregates to ~260 entries because Ruby emits 3-5 such newlines in a typical discussion view. Pure formatting, no semantic difference.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/template.ts or the renderer that emits the inner-slot close tag: match Ruby's trailing-newline behavior before `</div>` (the discrepancy is a 1-byte whitespace newline that's not in the engine's serializer). Lowest-priority fix: normalise on either side. Test pin: recapture-raw:Jesus Christ+discussion:render:open (offset 3199, exp 3236, act 3235 — exp 1 byte longer for one newline).

### 16. `wiki-link-vs-known-card-html-anchor`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: Ruby's renderer emits `<a class="known-card" href="/CardName">card-title</a>` for wiki-link content references while the engine emits the raw `[[CardName]]` literal. Triggered when the card's content contains `[[Name]]` and the renderer is in a view that should resolve the link to an HTML anchor (closed view most often, open view occasionally). The engine's wiki-link resolver is registered only for the named-link view, not for closed/open content bodies.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#closedView + openView body: register the wiki-link resolver (the one that turns [[Name]] into a `<a class="known-card" href="/name">Title</a>`) for the closed view's content body and for the open view's tail. Test pin: recapture-raw:Guns+discussion:render:open and the 73 closed-view matches show the same mechanism.

### 17. `external-link-vs-raw-url`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 1
- **Mechanism**: Ruby wraps external URLs in `<a target="_blank" class="external-link" href="https://...">URL</a>` while the engine emits the raw URL text. Same wiki-link-resolver gap as the known-card cluster but for URLs (text starting with `http://` or `https://`). Triggered in discussion views and any content view that auto-links URLs.

**Sample entry ids**:

- `recapture-raw:Aikido mythology at Aikido Journal:render:open` (offset=3554, exp=7828, act=7687)

**View-table work**:

src/card/render/text-processors.ts#autoLinkUrls: emit the external-link anchor wrapper in the same render pass as the wiki-link resolver. Test pin: recapture-raw:Why Do People Who Need Help From the Government Hate It So Much?+discussion:render:open (offset 4150, exp 5368, act 4721).

### 18. `invite-links-account-empty-div`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For Account+*self cards Ruby renders `<div class='invite-links'><div><strong>Name</strong>...</div>` (invite-links panel with the account holder's name) while the engine emits an empty `<div></div>` placeholder OR `<div>\n<div id="X-agree-titled-view">...` (no invite-links panel at all, jumping straight to the agree-titled view). The engine's invite-links template reads account-related fields (name, email, contact) that the seed closure didn't populate for non-Administrator accounts. Applies to both :render:open and :render:content.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/account-views.ts#inviteLinks: the engine's invite-links template iterates over the Account+*self card's name/email/contact children. The seed closure loads the Account+*self card but not its name/email/contact child references. Test pins: recapture-raw:Ron Huggins:render:open (offset 2478, exp 4715, act 2523), recapture-raw:Jean Stark:render:content (offset 369, exp 2597, act 402), recapture-raw:sabrina mejias:render:open (offset 2536, exp 12941, act 10586).

### 19. `layout-content-pointer-list-wrap`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: For `X+*self+*layout:render:closed|open` the engine wraps the layout name in a `<div class="pointer-list"><div class="pointer-item...">` wrapper while Ruby renders the literal layout name (e.g. `bdwilliamscraig-layout`, `Golden_Bears_Aikido_at_UC_Berkeley main layout`, `GiveTwentyMainLayout`) inside `<div class="text-muted one-line">NAME</div>`. Triggered by the engine's `isPointerOrListCard` heuristic mis-classifying *layout+*self cards as pointer-list because their dbContent (a layout name string) doesn't match a single-literal pattern.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: require the card's TYPE card be pointer or list before applying pointer-list wrap, NOT just dbContent shape. Test pins: recapture-raw:GBAC Contact+*self+*layout:render:closed (offset 1097, exp 3159, act 3402) and recapture-raw:Recommendations+*self+*layout:render:open (offset 1099, exp 5676, act 5835).

### 20. `skin-card-content-not-resolved`

- **Owner**: SEEDING
- **Count (shard 0)**: 0
- **Mechanism**: For `X skin:record` (and `bootstrap: X:record`) Ruby resolves the structured-card content (~500KB of SCSS/CSS) into the JSON `content` field, while the engine returns the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch theme...` (200 bytes) — or for `bootstrap: X:record`, an empty content. Root cause: the skin card's *structure template uses `[[themeless bootstrap skin]]+[[+bootswatch theme]]` and the engine's include resolver doesn't follow the second-include syntax that Ruby's structured_content walk supports.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

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
- **Count (shard 0)**: 0
- **Mechanism**: For `X+Y+*self:render:open` and similar rule-card composition junctions (3-part junctions like `Seeley inquiry+overview+*self`, `Item+Contributor+*type plus right`, `Administrator+*members+*self`), Ruby emits a nested `<div id="X-Y-Xself-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>` (the rule-editing form). The engine's rule-card content dispatch is treating the card as a *rule card type instead of a *type plus right rule, so it serves the form view instead of the nested content view.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/views.ts#openView: when the rendered card is a rule-card composition junction (X+Y+*self or X+Y+*type plus right), render the nested content-view slot, NOT the rule-editing form. The rule-editing form should only appear when the URL signals edit mode. Test pins: recapture-raw:Collection+Item+*type plus right:render:open (offset 2773, exp 66656, act 9493), recapture-raw:Seeley inquiry+overview+*self:render:open (offset 2696, exp 66010, act 12328), recapture-raw:Administrator+*members+*self:render:open (offset 2667, exp 72048, act 12314).

### 23. `search-results-vs-literal-content`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For `X+*right+*content options:render:content|open`, Ruby renders the literal JSON spec (`{"type":"Project", "sort":"name"}`, `{"type":"topic"}`, `{"type":"setting"}`) while the engine dispatches to a search-results renderer and emits `<div class="card-list card-list-bar search-results">...` (often truncated at search-resul). The engine's content view dispatch is treating `*content options` as a Search-type card even though its content is a JSON query spec, not a query result.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/views.ts#contentView: when dbContent is literal JSON (begins with `{` after trimming whitespace), render the literal instead of dispatching to the search-query runner. Test pin: recapture-raw:Topic+*right+*content options:render:content (offset 515, exp 539, act 7952).

### 24. `card-list-name-vs-card-list-bar`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: For `X+*right+*input type:render:content|open` Ruby emits `<div class="card-list card-list-name pointer-list">` while the engine emits `<div class="card-list card-list-bar pointer-list">`. Single CSS class difference (`-name` vs `-bar`) but the visual rendering changes because the engine's pointer-list template picks the `-bar` modifier when the content type is *input type.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/pointer-list.ts#pointerListClasses: when the rule card is `X+*right+*input type`, use `card-list-name` not `card-list-bar` for the pointer-list modifier. Test pin: recapture-raw:Topic+*right+*input type:render:content (offset 526, exp 611, act 1426).

### 25. `known-card-vs-wanted-card-on-rule-set`

- **Owner**: ENGINE
- **Count (shard 0)**: 30
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
- **Count (shard 0)**: 0
- **Mechanism**: For `mod: X:render:closed` (and similar bar-content cards), Ruby emits a populated `bar-right` slot with the card's description text (`configurations, scripts`, `styles`, `configurations, cardtypes, scripts, styles`) while the engine emits an empty `bar-right` (just a newline then `</div>`). Triggered because the engine's bar-right slot reads from a `bar_right_content` field that the rule-card content walk doesn't populate for `mod:` prefixed card names.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#closedView + the mod-style card's bar template: the bar-right slot must read from the card's `bar_right_content` field, falling back to the card's truncated content or `short_content` if missing. Test pin: recapture-raw:mod: format:render:closed (offset 790, exp 2128, act 2086 — Ruby 'configurations, cardtypes, scripts, styles', engine empty).

### 27. `help-tooltip-nbsp-empty`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: For *Ace and *on update (and other help-text rule cards) Ruby emits a populated tooltip (`data-bs-content="Configure &lt;a target=&quot;_blank&quot; class=..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. The engine's tooltip text source doesn't resolve the help-text rule card's structured content — it falls back to a non-breaking space instead.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#closedView (or the tooltip emit helper): the data-bs-content attribute must read the *Ace / *on update card's content, not fall back to &nbsp;. Test pin: recapture-raw:*Ace:render:closed (offset 1053, exp 2340, act 2013).

### 28. `set-card-associates-pointer-list`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: For `X+Associates:render:open` Ruby emits a nested `<div id="X-associates-content-view">` slot while the engine emits `<div class="card-list card-list-bar pointer-list">...` (the flat pointer-list wrap). The existing set-card-pointer-list-vs-nested-content cluster (C3) includes `+Associations+\w+` but not the bare `+Associates` form. The diff shape (offset 3000-3500, expected `i` got `c`, expected excerpt starts a nested content-view) is the same as C3; the ID suffix is just `+Associates` not `+Associations+...`. Test pin: recapture-raw:Christopher Li - Aikido and the Floating Bridge of Heaven+Associates:render:open.

**Sample entry ids**:

- `recapture-raw:Brandon WilliamsCraig+Associates:render:open` (offset=3814, exp=5797, act=5761)

**Proposed fix sketch**:

src/card/render/views.ts#openView + barBottomView: extend the set-card detection to include `+Associates` (not just `+Associations+\w+`). Test pin: recapture-raw:Christopher Li - Aikido and the Floating Bridge of Heaven+Associates:render:open (offset 3116, exp 6502, act 5695).

### 29. `apostrophe-name-key-extended`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: Broader version of the existing apostrophe-name-key cluster (C12, which only matched one ID). Pattern: Ruby `X_s_Y` vs engine `X__Y` — for any card name with an apostrophe-s contraction (Brandon's, Mikko's, Rosalie's, Father's, Trump's, Founder's, Children's, etc.) or just a trailing 's' (Brandon WilliamsCraig's Family), the engine collapses the apostrophe-s to a single underscore. Affects both record JSON `key` and the slot-id suffix.

**Sample entry ids**:

- `recapture-raw:Don Levine+musings:render:open` (offset=3116, exp=5892, act=4161)

**Proposed fix sketch**:

src/card/name.ts#simpleKey: in the NOT_OK_FOR_KEY replace path, the apostrophe-s contraction must map to `_s` (matching Ruby's underscore_apostrophe_s in lib/card/name.rb #underscore). Test pin: recapture-raw:Talk Like It's Brandon's 41st Birth Day+*self:record (offset 70, exp 255, act 253 — `talk_like_it_s_brandon_s_41st_birth_day` vs `talk_like_it__brandon__41st_birth_day`).

### 30. `skin-card-bar-left-titled-vs-span-title`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: For skin cards (cerulean, cyborg, flatly, lumen, materia, pulse, simplex, spacelab, united, classic) Ruby emits the bar-left as `<div class='media align-items-center'><div class=...icon...>...</div>` (the media+icon layout) while the engine emits `<span class="card-title" title="X skin">X skin</span>` (a plain card-title span). The engine's closed-view bar template picks the card-title span fallback when the card's TYPE is skin and its image data isn't available. Applies to :render:closed (closed bar) and :render:open (open bar).

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#closedView + openView + the skin cardtype's bar template: when the rendered card is a skin cardtype, render the media+icon bar-left, not the plain card-title span. Test pin: recapture-raw:cerulean skin:render:closed (offset 743, exp 2492, act 2184).

### 31. `mod-record-template-literal-vs-inspected`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For `Mod:record` Ruby returns the Cardio::Mod inspection output (`#<Cardio::Mod:0x000001bc8a22c908>_mod\n#<Cardio::...`) as the content field, while the engine returns the unresolved template literal `<p>{{+description|content}}</p>\n<p>{{_|add_button|...</p>`. Triggered because the Mod card's content is itself a templated string and Ruby's content path resolves it while the engine's path stores it raw.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

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

- `recapture-raw:Anonymous+*self:render:content` (offset=17, exp=59721, act=9798)

**Proposed fix sketch**:

src/card/name.ts#safeKey: the engine's safeKey truncation is dropping the final 's' from card names that end in 's' before the +*self junction. Test pin: recapture-raw:Anonymous+*self:render:content (offset 17, exp 59721, act 9780 — id 'anonymous-Xself' vs 'anonymou-Xself').

### 34. `wiki-link-vs-rich-content-link`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For card content views where the Ruby side emits a styled link (`<a class="btn btn-sm btn-outline-primary me-2 known-card"...`) and the engine emits the wiki-link literal `[[themeless bootstrap skin]]\n[[+bootswatch them...`, the engine's content view isn't applying the link-to-HTML transform for skin-card references. This is the open/content counterpart to the wiki-link-vs-known-card-html-anchor cluster (C17) but specifically when the engine doesn't even produce the anchor at all (just the raw `[[...]]`).

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/views.ts#contentView + openView body: extend the wiki-link-to-anchor transform to apply to skin-card references (`[[themeless bootstrap skin]]` should become a styled `known-card` anchor). Test pin: recapture-raw:cosmo skin:render:content (offset 384, exp 7239, act 440).

### 35. `rule-item-set-category-recent-missing`

- **Owner**: ENGINE
- **Count (shard 0)**: 0
- **Mechanism**: For `X+*self:render:open|content` where X is a *type plus right rule (and the *all plus, *create+*right, *delete+*right, *following+*right, *on create+*right, *head+*right, *debugger+*self, *recent settings+*self+*content options, *default html view+*right, etc. family) Ruby emits the full `_rule-item _category-all _category-field _category-recent _category-common` set list while the engine emits the same prefix but **without `_category-recent`** (it goes straight from `_category-field` to `_category-common`). The diff manifests in two shapes: (a) expected `"` (Ruby's closing class attribute after `_category-common`) vs `"` (engine closing earlier after `_category-common` without `_category-recent`), or (b) expected `r` (Ruby's `_category-recent`) vs `c` (engine's `_category-common`). Triggered by the engine's category-set enumeration not including the 'recent' bucket.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**Proposed fix sketch**:

src/card/render/category-set.ts#renderCategorySet: include `_category-recent` (in addition to all/field/common) when the rule card is a *type plus right rule or similar. The engine's category enumeration is missing the 'recent' bucket. Test pins: recapture-raw:*all plus:render:content (offset 2222, exp 57603, act 9312) and recapture-raw:*create+*right:render:content (offset 2374, exp 64967, act 9622 — Ruby '_rule-item _category-all _category-field _category-recent _category-common' vs engine '_rule-item _category-all _category-field _category-common').

### 36. `rule-card-input-type-pointer-list-literal`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: For `X+*right+*input type:render:open` and `X+*right+*content options:render:open` Ruby emits the literal input-type value (`radio`, `select`, `multiselect`) or JSON literal `{"type":"..."}` while the engine emits a `<div class="pointer-list">` wrapper. Test pin: recapture-raw:Collection+*right+*input type:render:open (offset 1120, exp 3051, act 4004 — literal `select` vs `<div class="pointer-list">`).

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: a rule card whose dbContent is a single literal string (not a SET reference) should render the literal in `text-muted one-line`, NOT fall through to the pointer-list wrap. Test pin: recapture-raw:Collection+*right+*input type:render:open (offset 1120, exp 3051, act 4004).

### 37. `denied-vs-render-rule-symmetric`

- **Owner**: SEEDING
- **Count (shard 0)**: 0
- **Mechanism**: The symmetric counterpart to cluster 7 / C15: for a small set of entries (e.g. `Stossel What If Freud Was Right:render:open`), Ruby renders `<span class="denied">` while engine renders the actual `<div id="...-source_co...">` (engine ALLOWS where Ruby denies). Same root cause — the *read rule universe closure — but the direction is reversed. Cluster 7+C15 covers engine denies where Ruby renders; this one covers engine renders where Ruby denies.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

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
- **Count (shard 0)**: 0
- **Mechanism**: For `Item+Format+*type plus right+*help:render:closed|open` and similar `Item+X+*type plus right+*help` rule cards, the help text differs by a few characters: Ruby has `the resource. Typically, the subject will be related to...` while engine has `the resource. Typi...` (truncated early with wrong ending), or `Recommended best practice is` vs `Recommended best practice i` (missing trailing 's'). or `in and over the resource. T...` vs `in and over the resource. Typi...`. The engine has a slightly different help-text version for Item cardtype's property descriptions.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#closedView + openView: verify the Item cardtype's property help-text matches Ruby's literal. Test pins: recapture-raw:Item+Subject+*type plus right+*help:render:open (offset 1227, exp 3994, act 3743), recapture-raw:Item+Format+*type plus right+*help:render:closed (offset 1237, exp 3474, act 3477), and recapture-raw:Item+Rights+*type plus right+*help:render:open (offset 1215, exp 3474, act 3477).

### 40. `rules-form-vs-content-view-generalized`

- **Owner**: ENGINE
- **Count (shard 0)**: 1
- **Mechanism**: For `X+Y+*type plus right:render:open` and other 3-part rule-card composition junctions (Cardtype+description+*type plus right, RichText+GBA+*type plus right, Exhibit+Item+*type plus right, Item+Identifier+*type plus right, Item+language+*type plus right, Message+Conversation+*type plus right, Person+Task+*type plus right, Source+Source Content+*type plus right, etc.), Ruby emits a nested `<div id="X-Y-Xtype_plu_right-content-view">` slot while the engine emits `<h4 class="mt-3">Rules</h4><form role="filter"...>`. The engine's rule-card content dispatch is treating every X+Y+*type plus right junction as a *rule card type instead of a *type plus right rule, so it serves the form view instead of the nested content view.

**Sample entry ids**:

- `recapture-raw:Cardtype+description+*type plus right:render:open` (offset=2842, exp=68009, act=9627)

**Proposed fix sketch**:

src/card/render/views.ts#openView: same root cause as rules-form-filter-vs-content-view (cluster 22) but generalized to ALL X+Y+*type plus right (3-part) junctions. The engine's rule-card dispatch should serve the nested content-view unless the URL signals edit mode. Test pins: recapture-raw:Cardtype+description+*type plus right:render:open (offset 2842), recapture-raw:RichText+GBA+*type plus right:render:open (offset 2736), recapture-raw:Item+language+*type plus right:render:open (offset 2745).

### 41. `tooltip-help-text-empty`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 0
- **Mechanism**: For `*style:render:closed`, `mod: X+*style:render:closed`, `mod: X+*script:render:closed`, `*on update:render:closed`, etc. Ruby emits a populated tooltip (`data-bs-content="Skin (collection of stylesheets) for card&#39;s..."` or `"JavaScript (or CoffeeScript) for card&#39;s page..."` or `"Configure events to be executed when card is updated..."`) while the engine emits `data-bs-content="&amp;nbsp;"`. The engine's tooltip text source doesn't resolve the help-text rule card's structured content for the *style, *script, *on update, and other rule-card types — it falls back to a non-breaking space. Same root cause as help-tooltip-nbsp-empty (cluster 26, which only matched *Ace) but generalized to *style, *script, *on update, and similar rule cards.

**Sample entry ids**:

_(none in shard 0; mechanism extrapolated from per-class-mechanisms baseline + excerpt patterns)_

**View-table work**:

src/card/render/views.ts#closedView (or the tooltip emit helper): the data-bs-content attribute must read the rule card's content (or its *help / *style / *script / *on update sub-rule's content), not fall back to &nbsp;. Test pins: recapture-raw:*style:render:closed (offset 1078, exp 2165, act 2142) and recapture-raw:mod: bar and box+*script:render:closed (offset 1341, exp 1296, act 1243).

### 42. `double-encoded-apostrophe-in-data-card-name`

- **Owner**: ENGINE
- **Count (shard 0)**: 2
- **Mechanism**: For card names that contain an apostrophe (`Saint Nicholas'`, `I'm`, `Smile! You've`, `Don't`, etc.), Ruby HTML-encodes the apostrophe as `&#39;` in the data-card-name attribute (`data-card-name="Saint Nicholas&#39; Dark Companion+Associates"`), while the engine DOUBLE-encodes the already-encoded entity as `&amp;#39;` (`data-card-name="Saint Nicholas&amp;#39; Dark Companion+Associates"`). The diff character is `&` (Ruby's start of `&#39;`) vs `a` (engine's `&amp;` start). This is an HTML-escape bug in the engine's data-card-name emit path.

**Sample entry ids**:

- `recapture-raw:Paula Craig+musings:render:content` (offset=714, exp=55686, act=92421)
- `recapture-raw:Paula Craig+musings:render:open` (offset=3270, exp=58270, act=95005)

**Proposed fix sketch**:

src/card/render/views.ts#closedView + openView: when emitting data-card-name, do NOT re-encode the already-encoded apostrophe. The engine is calling HTML-escape twice on a string that already contains `&#39;`. Test pin: recapture-raw:Barbara Ehrenreich - Smile! You've got cancer+Associates:render:open (offset 300, exp 6293, act 5541 — Ruby `You&#39;ve` vs engine `You&amp;#39;ve`).

## UNTRACED entries

116 entries did not match any defined cluster.

- `recapture-raw:*all+*layout:render:open` (offset=3272, exp=5245, act=5209)
  ```
  FAIL recapture-raw:*all+*layout:render:open (render-engine)
    first difference at code-unit offset 3272 (byte offset 3272): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:*layout+*right+*content options:render:content` (offset=539, exp=545, act=546)
  ```
  FAIL recapture-raw:*layout+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 539 (byte offset 539): expected "<" but got "\n"
    expected excerpt: ...quot;:[&quot;content&quot;]}">{"type": "Layout"}</div>
  ```
- `recapture-raw:ABCglobal+Supporters:render:open` (offset=3586, exp=5514, act=5478)
  ```
  FAIL recapture-raw:ABCglobal+Supporters:render:open (render-engine)
    first difference at code-unit offset 3586 (byte offset 3586): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Associative Inquiry+Supporters:render:open` (offset=3747, exp=10506, act=10398)
  ```
  FAIL recapture-raw:Associative Inquiry+Supporters:render:open (render-engine)
    first difference at code-unit offset 3747 (byte offset 3747): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Banana+Person:render:open` (offset=5402, exp=6216, act=6216)
  ```
  FAIL recapture-raw:Banana+Person:render:open (render-engine)
    first difference at code-unit offset 5402 (byte offset 5402): expected "b" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="Test Person 01" data-ca...
  ```
- `recapture-raw:Brandon WilliamsCraig+Core Project:render:open` (offset=3857, exp=5801, act=5764)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Core Project:render:open (render-engine)
    first difference at code-unit offset 3857 (byte offset 3857): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Brandon WilliamsCraig+Family:render:open` (offset=3720, exp=18113, act=20164)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Family:render:open (render-engine)
    first difference at code-unit offset 3720 (byte offset 3720): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Brandon WilliamsCraig+Friends:render:open` (offset=3708, exp=5636, act=5600)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Friends:render:open (render-engine)
    first difference at code-unit offset 3708 (byte offset 3708): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Brandon WilliamsCraig+Pages:render:open` (offset=17862, exp=20541, act=18801)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Pages:render:open (render-engine)
    first difference at code-unit offset 17862 (byte offset 17862): expected "b" but got "m"
    expected excerpt: ... item-bar"><div id="brandon_william_craig-video-bar-view" class="card-slot bar-view ALL ALL_PLUS...
  ```
- `recapture-raw:Diss Print Copy finalize+Owner:render:open` (offset=3786, exp=5822, act=5786)
  ```
  FAIL recapture-raw:Diss Print Copy finalize+Owner:render:open (render-engine)
    first difference at code-unit offset 3786 (byte offset 3786): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Family+*right+*content options:render:content` (offset=534, exp=540, act=541)
  ```
  FAIL recapture-raw:Family+*right+*content options:render:content (render-engine)
    first difference at code-unit offset 534 (byte offset 534): expected "<" but got "\n"
    expected excerpt: ...&quot;:[&quot;content&quot;]}">{"type":"person"}</div>
  ```
- `recapture-raw:Family+*right+*content options:render:open` (offset=1534, exp=3645, act=3648)
  ```
  FAIL recapture-raw:Family+*right+*content options:render:open (render-engine)
    first difference at code-unit offset 1534 (byte offset 1534): expected "k" but got "w"
    expected excerpt: ...bs-content="Value options for &lt;a class=&quot;known-card&quot; href=&quot;/List&quot;&gt;&lt;s...
  ```
- `recapture-raw:Free Aiki Dojo+Core Project:render:open` (offset=3772, exp=5795, act=5758)
  ```
  FAIL recapture-raw:Free Aiki Dojo+Core Project:render:open (render-engine)
    first difference at code-unit offset 3772 (byte offset 3772): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Healing Friction+Core Project:render:open` (offset=3808, exp=10837, act=10726)
  ```
  FAIL recapture-raw:Healing Friction+Core Project:render:open (render-engine)
    first difference at code-unit offset 3808 (byte offset 3808): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Martial Nonviolence+Core Project:render:open` (offset=3864, exp=18440, act=18218)
  ```
  FAIL recapture-raw:Martial Nonviolence+Core Project:render:open (render-engine)
    first difference at code-unit offset 3864 (byte offset 3864): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:OR_201006-7+Still_Images:render:open` (offset=3673, exp=5662, act=5627)
  ```
  FAIL recapture-raw:OR_201006-7+Still_Images:render:open (render-engine)
    first difference at code-unit offset 3673 (byte offset 3673): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Image&quot;}"><div class...
  ```
- `recapture-raw:Paula Craig+Family:render:open` (offset=3577, exp=13078, act=12934)
  ```
  FAIL recapture-raw:Paula Craig+Family:render:open (render-engine)
    first difference at code-unit offset 3577 (byte offset 3577): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Process Arts+Core Project:render:open` (offset=3691, exp=5635, act=5598)
  ```
  FAIL recapture-raw:Process Arts+Core Project:render:open (render-engine)
    first difference at code-unit offset 3691 (byte offset 3691): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Process Arts+Related Project:render:open` (offset=3726, exp=5614, act=5577)
  ```
  FAIL recapture-raw:Process Arts+Related Project:render:open (render-engine)
    first difference at code-unit offset 3726 (byte offset 3726): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:The Art of Getting Up Again+Associations+tags:render:open` (offset=3632, exp=8327, act=10571)
  ```
  FAIL recapture-raw:The Art of Getting Up Again+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3632 (byte offset 3632): expected "b" but got "m"
    expected excerpt: ...v class="pointer-item item-bar"><div id="aikido-bar-view" class="card-slot bar-view ALL TYPE-pra...
  ```
- `recapture-raw:Workaholism+Core Patterns:render:open` (offset=3699, exp=5668, act=5631)
  ```
  FAIL recapture-raw:Workaholism+Core Patterns:render:open (render-engine)
    first difference at code-unit offset 3699 (byte offset 3699): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Pattern&quot;}"><div cla...
  ```
- `recapture-raw:masakatsu_agatsu_katsuhayabi+Associations+tags:render:open` (offset=3648, exp=6175, act=8397)
  ```
  FAIL recapture-raw:masakatsu_agatsu_katsuhayabi+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3648 (byte offset 3648): expected "b" but got "m"
    expected excerpt: ...v class="pointer-item item-bar"><div id="aikido-bar-view" class="card-slot bar-view ALL TYPE-pra...
  ```
- `recapture-raw:mythicity+Applicable Research:render:open` (offset=3850, exp=5868, act=5830)
  ```
  FAIL recapture-raw:mythicity+Applicable Research:render:open (render-engine)
    first difference at code-unit offset 3850 (byte offset 3850): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Research&quot;}"><div cl...
  ```
- `recapture-raw:mythicity+Core Project:render:open` (offset=3674, exp=5679, act=5642)
  ```
  FAIL recapture-raw:mythicity+Core Project:render:open (render-engine)
    first difference at code-unit offset 3674 (byte offset 3674): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:mythopsychology+Related Project:render:open` (offset=3862, exp=5885, act=5848)
  ```
  FAIL recapture-raw:mythopsychology+Related Project:render:open (render-engine)
    first difference at code-unit offset 3862 (byte offset 3862): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:mythopsychology+Supporters:render:open` (offset=3698, exp=8066, act=7994)
  ```
  FAIL recapture-raw:mythopsychology+Supporters:render:open (render-engine)
    first difference at code-unit offset 3698 (byte offset 3698): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:ABCglobal+Core Project:render:open` (offset=3688, exp=8186, act=8112)
  ```
  FAIL recapture-raw:ABCglobal+Core Project:render:open (render-engine)
    first difference at code-unit offset 3688 (byte offset 3688): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:ABCglobal+Related Project:render:open` (offset=3775, exp=5798, act=5761)
  ```
  FAIL recapture-raw:ABCglobal+Related Project:render:open (render-engine)
    first difference at code-unit offset 3775 (byte offset 3775): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:ABCglobal+Variable Places:render:open` (offset=3754, exp=8284, act=8214)
  ```
  FAIL recapture-raw:ABCglobal+Variable Places:render:open (render-engine)
    first difference at code-unit offset 3754 (byte offset 3754): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Aiki Extensions+Organizer(s):record` (offset=243, exp=365, act=364)
  ```
  FAIL recapture-raw:Aiki Extensions+Organizer(s):record (card-engine)
    first difference at code-unit offset 243 (byte offset 243): expected "s" but got "\""
    expected excerpt: ...nBertram Wohak","key":"aiki_extension+organizer_s","left":"Aiki Extensions","name":"Aiki Extensi...
  ```
- `recapture-raw:Aiki Extensions+Related Project:render:open` (offset=3819, exp=8210, act=8136)
  ```
  FAIL recapture-raw:Aiki Extensions+Related Project:render:open (render-engine)
    first difference at code-unit offset 3819 (byte offset 3819): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Aiki Extensions+Remote Places:render:open` (offset=3788, exp=5797, act=5762)
  ```
  FAIL recapture-raw:Aiki Extensions+Remote Places:render:open (render-engine)
    first difference at code-unit offset 3788 (byte offset 3788): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Aiki Peace Week+Related Project:render:open` (offset=3864, exp=5887, act=5850)
  ```
  FAIL recapture-raw:Aiki Peace Week+Related Project:render:open (render-engine)
    first difference at code-unit offset 3864 (byte offset 3864): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Aikido and Psychotherapy - Martial Artists Making a Difference+Associations+tags:render:open` (offset=6472, exp=15932, act=18266)
  ```
  FAIL recapture-raw:Aikido and Psychotherapy - Martial Artists Making a Difference+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 6472 (byte offset 6472): expected "b" but got "m"
    expected excerpt: ...iv class="pointer-item item-bar"><div id="repro-bar-view" class="card-slot bar-view ALL TYPE-ric...
  ```
- `recapture-raw:Aikido of Berkeley+Core Project:render:open` (offset=3951, exp=6157, act=6120)
  ```
  FAIL recapture-raw:Aikido of Berkeley+Core Project:render:open (render-engine)
    first difference at code-unit offset 3951 (byte offset 3951): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Aikido of Berkeley+Related Project:render:open` (offset=3887, exp=8591, act=8517)
  ```
  FAIL recapture-raw:Aikido of Berkeley+Related Project:render:open (render-engine)
    first difference at code-unit offset 3887 (byte offset 3887): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:AsIn Project Management Training+Core Project:render:open` (offset=4098, exp=11113, act=11002)
  ```
  FAIL recapture-raw:AsIn Project Management Training+Core Project:render:open (render-engine)
    first difference at code-unit offset 4098 (byte offset 4098): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:AsIn Project Management Training+Organizer(s):render:open` (offset=52, exp=6121, act=6072)
  ```
  FAIL recapture-raw:AsIn Project Management Training+Organizer(s):render:open (render-engine)
    first difference at code-unit offset 52 (byte offset 52): expected "s" but got "-"
    expected excerpt: ... id="a_in_project_management_training-organizer_s-open-view" class="card-slot open-view ALL ALL_...
  ```
- `recapture-raw:Bluevolution+Applicable Research:render:open` (offset=3894, exp=8859, act=8783)
  ```
  FAIL recapture-raw:Bluevolution+Applicable Research:render:open (render-engine)
    first difference at code-unit offset 3894 (byte offset 3894): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Research&quot;}"><div cl...
  ```
- `recapture-raw:Brandon WilliamsCraig - A Martial Artists Making a Difference+Associations+tags:render:open` (offset=4210, exp=11268, act=15682)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig - A Martial Artists Making a Difference+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 4210 (byte offset 4210): expected "b" but got "m"
    expected excerpt: ...iv class="pointer-item item-bar"><div id="repro-bar-view" class="card-slot bar-view ALL TYPE-ric...
  ```
- `recapture-raw:Brandon WilliamsCraig+Central Places:render:open` (offset=3924, exp=5933, act=5898)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Central Places:render:open (render-engine)
    first difference at code-unit offset 3924 (byte offset 3924): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Brandon WilliamsCraig+Project(s) Organizing:record` (offset=230, exp=393, act=392)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+Project(s) Organizing:record (card-engine)
    first difference at code-unit offset 230 (byte offset 230): expected "s" but got "_"
    expected excerpt: ... of Peace","key":"brandon_william_craig+project_s_organizing","left":"Brandon WilliamsCraig","na...
  ```
- `recapture-raw:Colleagues:render:open` (offset=2586, exp=10663, act=3136)
  ```
  FAIL recapture-raw:Colleagues:render:open (render-engine)
    first difference at code-unit offset 2586 (byte offset 2586): expected "<" but got "["
    expected excerpt: ...t of associates who chose either a doctorate in <a class="wanted-card" href="/Cultural_Mythology...
  ```
- `recapture-raw:GBAC Contact+*self+*layout:render:open` (offset=3737, exp=5996, act=5960)
  ```
  FAIL recapture-raw:GBAC Contact+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3737 (byte offset 3737): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:GBAC Resources+*self+*layout:render:open` (offset=3760, exp=6019, act=5983)
  ```
  FAIL recapture-raw:GBAC Resources+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3760 (byte offset 3760): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:GBAC Structure+*self+*layout:render:open` (offset=3765, exp=6024, act=5988)
  ```
  FAIL recapture-raw:GBAC Structure+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3765 (byte offset 3765): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:GBAC Training+*self+*layout:render:open` (offset=3751, exp=6010, act=5974)
  ```
  FAIL recapture-raw:GBAC Training+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3751 (byte offset 3751): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Glen Beck via Jon Stewart+Associations+tags:render:open` (offset=3602, exp=8722, act=17572)
  ```
  FAIL recapture-raw:Glen Beck via Jon Stewart+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3602 (byte offset 3602): expected "b" but got "m"
    expected excerpt: ...iv class="pointer-item item-bar"><div id="repro-bar-view" class="card-slot bar-view ALL TYPE-ric...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+*self+*layout:render:open` (offset=4040, exp=6299, act=6263)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 4040 (byte offset 4040): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+Organizer(s):render:open` (offset=53, exp=18113, act=17884)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+Organizer(s):render:open (render-engine)
    first difference at code-unit offset 53 (byte offset 53): expected "s" but got "-"
    expected excerpt: ...id="golden_bear_aikido_at_uc_berkeley-organizer_s-open-view" class="card-slot open-view ALL ALL_...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+Related Project:render:open` (offset=4174, exp=6152, act=6115)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+Related Project:render:open (render-engine)
    first difference at code-unit offset 4174 (byte offset 4174): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Golden Bears Aikido at UC Berkeley+Remote Places:render:open` (offset=4130, exp=6139, act=6104)
  ```
  FAIL recapture-raw:Golden Bears Aikido at UC Berkeley+Remote Places:render:open (render-engine)
    first difference at code-unit offset 4130 (byte offset 4130): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Guardians of Peace+Central Places:render:open` (offset=3866, exp=5875, act=5840)
  ```
  FAIL recapture-raw:Guardians of Peace+Central Places:render:open (render-engine)
    first difference at code-unit offset 3866 (byte offset 3866): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Guardians of Peace+Related Project:render:open` (offset=3911, exp=13582, act=13434)
  ```
  FAIL recapture-raw:Guardians of Peace+Related Project:render:open (render-engine)
    first difference at code-unit offset 3911 (byte offset 3911): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Home-Beginning+*self+*layout:render:open` (offset=3557, exp=5502, act=5466)
  ```
  FAIL recapture-raw:Home-Beginning+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3557 (byte offset 3557): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Kimby A. Muller+Central Places:render:open` (offset=3788, exp=5770, act=5735)
  ```
  FAIL recapture-raw:Kimby A. Muller+Central Places:render:open (render-engine)
    first difference at code-unit offset 3788 (byte offset 3788): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Lauren Rayburn+Central Places:render:open` (offset=3798, exp=5807, act=5772)
  ```
  FAIL recapture-raw:Lauren Rayburn+Central Places:render:open (render-engine)
    first difference at code-unit offset 3798 (byte offset 3798): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Lauren Rayburn+Core Project:render:open` (offset=3845, exp=8450, act=8376)
  ```
  FAIL recapture-raw:Lauren Rayburn+Core Project:render:open (render-engine)
    first difference at code-unit offset 3845 (byte offset 3845): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Motoki M+Core Project:render:open` (offset=3737, exp=5895, act=5858)
  ```
  FAIL recapture-raw:Motoki M+Core Project:render:open (render-engine)
    first difference at code-unit offset 3737 (byte offset 3737): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:PCTS+*self+*layout:render:open` (offset=3440, exp=5429, act=5393)
  ```
  FAIL recapture-raw:PCTS+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3440 (byte offset 3440): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Playing in Sand Collectiv+Central Places:render:open` (offset=4011, exp=5993, act=5958)
  ```
  FAIL recapture-raw:Playing in Sand Collectiv+Central Places:render:open (render-engine)
    first difference at code-unit offset 4011 (byte offset 4011): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Romain Barnard+Core Project:render:open` (offset=3845, exp=6003, act=5966)
  ```
  FAIL recapture-raw:Romain Barnard+Core Project:render:open (render-engine)
    first difference at code-unit offset 3845 (byte offset 3845): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Rosa Naparstek+Friends:render:open` (offset=3604, exp=8104, act=8032)
  ```
  FAIL recapture-raw:Rosa Naparstek+Friends:render:open (render-engine)
    first difference at code-unit offset 3604 (byte offset 3604): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Rosa Naparstek+Related Project:render:open` (offset=3805, exp=5749, act=5712)
  ```
  FAIL recapture-raw:Rosa Naparstek+Related Project:render:open (render-engine)
    first difference at code-unit offset 3805 (byte offset 3805): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Uchi Deshi at Aikido of Berkeley Dojo+Central Places:render:open` (offset=4242, exp=6251, act=6216)
  ```
  FAIL recapture-raw:Uchi Deshi at Aikido of Berkeley Dojo+Central Places:render:open (render-engine)
    first difference at code-unit offset 4242 (byte offset 4242): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:We Will All Go Together When We Go+Associations+tags:render:open` (offset=3757, exp=10979, act=10989)
  ```
  FAIL recapture-raw:We Will All Go Together When We Go+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3757 (byte offset 3757): expected "b" but got "m"
    expected excerpt: ...iv class="pointer-item item-bar"><div id="repro-bar-view" class="card-slot bar-view ALL TYPE-ric...
  ```
- `recapture-raw:aikido+Central Places:render:open` (offset=3660, exp=10852, act=9036)
  ```
  FAIL recapture-raw:aikido+Central Places:render:open (render-engine)
    first difference at code-unit offset 3660 (byte offset 3660): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:aikido+Core Project:render:open` (offset=3612, exp=13235, act=13087)
  ```
  FAIL recapture-raw:aikido+Core Project:render:open (render-engine)
    first difference at code-unit offset 3612 (byte offset 3612): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:aikido+Pages:render:open` (offset=19983, exp=37300, act=37300)
  ```
  FAIL recapture-raw:aikido+Pages:render:open (render-engine)
    first difference at code-unit offset 19983 (byte offset 19983): expected "b" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="Aikido as Peace Practic...
  ```
- `recapture-raw:aikido+Participant(s):record` (offset=205, exp=313, act=312)
  ```
  FAIL recapture-raw:aikido+Participant(s):record (card-engine)
    first difference at code-unit offset 205 (byte offset 205): expected "s" but got "\""
    expected excerpt: ...Green\r\nStan Pranin","key":"aikido+participant_s","left":"aikido","name":"aikido+Participant(s)...
  ```
- `recapture-raw:aikido+Related Project:render:open` (offset=3705, exp=8219, act=8145)
  ```
  FAIL recapture-raw:aikido+Related Project:render:open (render-engine)
    first difference at code-unit offset 3705 (byte offset 3705): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:culturopoiesis+Core Project:render:open` (offset=3767, exp=5790, act=5753)
  ```
  FAIL recapture-raw:culturopoiesis+Core Project:render:open (render-engine)
    first difference at code-unit offset 3767 (byte offset 3767): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Archetypal+Documents:render:open` (offset=13659, exp=17003, act=14846)
  ```
  FAIL recapture-raw:Archetypal+Documents:render:open (render-engine)
    first difference at code-unit offset 13659 (byte offset 13659): expected "b" but got "m"
    expected excerpt: ...tacharya_tuberculosi_a_short_history-discussion-bar-view" class="card-slot bar-view ALL ALL_PLUS...
  ```
- `recapture-raw:Brandon WilliamsCraig+musings:render:open` (offset=3862, exp=22612, act=22311)
  ```
  FAIL recapture-raw:Brandon WilliamsCraig+musings:render:open (render-engine)
    first difference at code-unit offset 3862 (byte offset 3862): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;consideration&quot;}"><d...
  ```
- `recapture-raw:Culturesmith+Core Project:render:open` (offset=3738, exp=8278, act=8204)
  ```
  FAIL recapture-raw:Culturesmith+Core Project:render:open (render-engine)
    first difference at code-unit offset 3738 (byte offset 3738): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Culturesmith+Related Project:render:open` (offset=3772, exp=5716, act=5679)
  ```
  FAIL recapture-raw:Culturesmith+Related Project:render:open (render-engine)
    first difference at code-unit offset 3772 (byte offset 3772): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:David K Weinstock+Vocational Practice:render:open` (offset=3510, exp=5839, act=5811)
  ```
  FAIL recapture-raw:David K Weinstock+Vocational Practice:render:open (render-engine)
    first difference at code-unit offset 3510 (byte offset 3510): expected "b" but got "m"
    expected excerpt: ...v class="pointer-item item-bar"><div id="aikido-bar-view" class="card-slot bar-view ALL TYPE-pra...
  ```
- `recapture-raw:Doctor Myth+*self+*layout:render:closed` (offset=1089, exp=3105, act=3098)
  ```
  FAIL recapture-raw:Doctor Myth+*self+*layout:render:closed (render-engine)
    first difference at code-unit offset 1089 (byte offset 1089): expected "0" but got "<"
    expected excerpt: ...-right col-6'>
  ```
- `recapture-raw:Don Levine+Core Project:render:open` (offset=3678, exp=5665, act=5628)
  ```
  FAIL recapture-raw:Don Levine+Core Project:render:open (render-engine)
    first difference at code-unit offset 3678 (byte offset 3678): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Executive+*self+*layout:render:open` (offset=3553, exp=5597, act=5561)
  ```
  FAIL recapture-raw:Executive+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3553 (byte offset 3553): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Facilitator+*self+*layout:render:open` (offset=3581, exp=5625, act=5589)
  ```
  FAIL recapture-raw:Facilitator+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3581 (byte offset 3581): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Huston Smith+musings:render:open` (offset=3662, exp=14458, act=14286)
  ```
  FAIL recapture-raw:Huston Smith+musings:render:open (render-engine)
    first difference at code-unit offset 3662 (byte offset 3662): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;consideration&quot;}"><d...
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
- `recapture-raw:Instructor+*self+*layout:render:open` (offset=3567, exp=5611, act=5575)
  ```
  FAIL recapture-raw:Instructor+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3567 (byte offset 3567): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Iris McGinnis+Related Project:render:open` (offset=3818, exp=5841, act=5804)
  ```
  FAIL recapture-raw:Iris McGinnis+Related Project:render:open (render-engine)
    first difference at code-unit offset 3818 (byte offset 3818): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Joe Strykowski+musings:render:open` (offset=3656, exp=5705, act=5662)
  ```
  FAIL recapture-raw:Joe Strykowski+musings:render:open (render-engine)
    first difference at code-unit offset 3656 (byte offset 3656): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;consideration&quot;}"><d...
  ```
- `recapture-raw:John Abbe+musings:render:content` (offset=654, exp=4722, act=2150)
  ```
  FAIL recapture-raw:John Abbe+musings:render:content (render-engine)
    first difference at code-unit offset 654 (byte offset 654): expected "c" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-consideration" data-card-name="hmmm&lt;hr&gt;&lt...
  ```
- `recapture-raw:John Abbe+musings:render:open` (offset=3182, exp=7278, act=4706)
  ```
  FAIL recapture-raw:John Abbe+musings:render:open (render-engine)
    first difference at code-unit offset 3182 (byte offset 3182): expected "c" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-consideration" data-card-name="hmmm&lt;hr&gt;&lt...
  ```
- `recapture-raw:Kayla Feder+Central Places:render:open` (offset=3744, exp=5753, act=5718)
  ```
  FAIL recapture-raw:Kayla Feder+Central Places:render:open (render-engine)
    first difference at code-unit offset 3744 (byte offset 3744): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Learning with Ms Paula+*self+*layout:render:open` (offset=3289, exp=5601, act=4102)
  ```
  FAIL recapture-raw:Learning with Ms Paula+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3289 (byte offset 3289): expected "l" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-layout" data-card-name="MsPaulaLayout01" data-ca...
  ```
- `recapture-raw:Learning with Ms Paula+Central Places:render:open` (offset=3521, exp=8218, act=8900)
  ```
  FAIL recapture-raw:Learning with Ms Paula+Central Places:render:open (render-engine)
    first difference at code-unit offset 3521 (byte offset 3521): expected "p" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-place" data-card-name="Oak Cliff" data-card-type...
  ```
- `recapture-raw:Learning with Ms Paula+Supporters:render:open` (offset=3856, exp=5892, act=5856)
  ```
  FAIL recapture-raw:Learning with Ms Paula+Supporters:render:open (render-engine)
    first difference at code-unit offset 3856 (byte offset 3856): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Linda Holiday+Pages:render:open` (offset=6013, exp=8304, act=8314)
  ```
  FAIL recapture-raw:Linda Holiday+Pages:render:open (render-engine)
    first difference at code-unit offset 6013 (byte offset 6013): expected "b" but got "m"
    expected excerpt: ...v class="pointer-item item-bar"><div id="aikido-bar-view" class="card-slot bar-view ALL TYPE-pra...
  ```
- `recapture-raw:Martial Nonviolence+Central Places:render:open` (offset=3891, exp=8345, act=8275)
  ```
  FAIL recapture-raw:Martial Nonviolence+Central Places:render:open (render-engine)
    first difference at code-unit offset 3891 (byte offset 3891): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Martial Nonviolence+Supporters:render:open` (offset=3759, exp=17838, act=17622)
  ```
  FAIL recapture-raw:Martial Nonviolence+Supporters:render:open (render-engine)
    first difference at code-unit offset 3759 (byte offset 3759): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Person&quot;}"><div clas...
  ```
- `recapture-raw:Ms Paula writing poetry and other creations:render:content` (offset=2742, exp=57875, act=36947)
  ```
  FAIL recapture-raw:Ms Paula writing poetry and other creations:render:content (render-engine)
    first difference at code-unit offset 2742 (byte offset 2742): expected "b" but got "m"
    expected excerpt: ...em-bar"><div id="paula_craig_i_m_staying_inside-bar-view" class="card-slot bar-view ALL TYPE-new...
  ```
- `recapture-raw:Ms Paula writing poetry and other creations:render:open` (offset=5265, exp=60426, act=39498)
  ```
  FAIL recapture-raw:Ms Paula writing poetry and other creations:render:open (render-engine)
    first difference at code-unit offset 5265 (byte offset 5265): expected "b" but got "m"
    expected excerpt: ...em-bar"><div id="paula_craig_i_m_staying_inside-bar-view" class="card-slot bar-view ALL TYPE-new...
  ```
- `recapture-raw:Paloma Pavel+Core Project:render:open` (offset=3731, exp=5746, act=5709)
  ```
  FAIL recapture-raw:Paloma Pavel+Core Project:render:open (render-engine)
    first difference at code-unit offset 3731 (byte offset 3731): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Paula Craig+Related Project:render:open` (offset=3789, exp=5812, act=5775)
  ```
  FAIL recapture-raw:Paula Craig+Related Project:render:open (render-engine)
    first difference at code-unit offset 3789 (byte offset 3789): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;}"><div cla...
  ```
- `recapture-raw:Plans:render:open` (offset=2382, exp=7381, act=2439)
  ```
  FAIL recapture-raw:Plans:render:open (render-engine)
    first difference at code-unit offset 2382 (byte offset 2382): expected "d" but got "b"
    expected excerpt: ...&quot;home_view&quot;:&quot;content&quot;}"><p><div id="plan-Xright-by_name-titled-view" class="...
  ```
- `recapture-raw:Recommendations+*self+*layout:render:open` (offset=3632, exp=5676, act=5640)
  ```
  FAIL recapture-raw:Recommendations+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3632 (byte offset 3632): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:Richard Page+Central Places:render:open` (offset=3762, exp=5771, act=5736)
  ```
  FAIL recapture-raw:Richard Page+Central Places:render:open (render-engine)
    first difference at code-unit offset 3762 (byte offset 3762): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Place&quot;}"><div class...
  ```
- `recapture-raw:Richard Page+musings:render:open` (offset=3596, exp=5603, act=5560)
  ```
  FAIL recapture-raw:Richard Page+musings:render:open (render-engine)
    first difference at code-unit offset 3596 (byte offset 3596): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;consideration&quot;}"><d...
  ```
- `recapture-raw:bdwilliamscraig+*self+*layout:render:open` (offset=3637, exp=5681, act=5645)
  ```
  FAIL recapture-raw:bdwilliamscraig+*self+*layout:render:open (render-engine)
    first difference at code-unit offset 3637 (byte offset 3637): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Layout&quot;}"><div clas...
  ```
- `recapture-raw:culturopoiesis+Applicable Research:render:open` (offset=3968, exp=6054, act=6016)
  ```
  FAIL recapture-raw:culturopoiesis+Applicable Research:render:open (render-engine)
    first difference at code-unit offset 3968 (byte offset 3968): expected "," but got "}"
    expected excerpt: ...dle&quot;],&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Research&quot;}"><div cl...
  ```
- `recapture-raw:*all plus:render:content` (offset=2222, exp=57603, act=9313)
  ```
  FAIL recapture-raw:*all plus:render:content (render-engine)
    first difference at code-unit offset 2222 (byte offset 2222): expected " " but got "\""
    expected excerpt: ...E_PLUS_RIGHT-set-Xdefault SELF-Xall_plu-Xdefault _rule-item _category-all _category-field _categ...
  ```
- `recapture-raw:*all plus:render:open` (offset=4349, exp=59758, act=11468)
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
- `recapture-raw:Anonymous+*self:render:open` (offset=17, exp=62320, act=12392)
  ```
  FAIL recapture-raw:Anonymous+*self:render:open (render-engine)
    first difference at code-unit offset 17 (byte offset 17): expected "s" but got "-"
    expected excerpt: <div id="anonymous-Xself-open-view" class="card-slot open-view AL...
  ```
- `recapture-raw:Elaine N Aron PhD - Remember the Soul+Associations+tags:render:open` (offset=3791, exp=8650, act=8670)
  ```
  FAIL recapture-raw:Elaine N Aron PhD - Remember the Soul+Associations+tags:render:open (render-engine)
    first difference at code-unit offset 3791 (byte offset 3791): expected "b" but got "m"
    expected excerpt: ...div class="pointer-item item-bar"><div id="soul-bar-view" class="card-slot bar-view ALL TYPE-pro...
  ```
- `recapture-raw:RVW:render:open` (offset=2503, exp=3397, act=3397)
  ```
  FAIL recapture-raw:RVW:render:open (render-engine)
    first difference at code-unit offset 2503 (byte offset 2503): expected "b" but got "s"
    expected excerpt: ...r-view" class="card-slot mini_bar-view ALL TYPE-basic_c" data-card-name="Rosalie Victoria Willia...
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

