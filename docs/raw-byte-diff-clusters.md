# Raw ground-truth byte-diff cluster map

Generated: 2026-09-25T04:47:38.930Z

## Inputs read

- `tmp\raw-ground-truth\enumeration\verification-aggregate.json` -- per-entry signature source
- `tmp\raw-ground-truth\enumeration\per-class-mechanisms.json` -- full-run baseline

## Population

- On-disk aggregate: `341` entries, `126` fail, `122` byte-diff
- per-class-mechanisms full run: `10274` entries, `6345` fail, byte-diff = `5982` (`2573` card-engine + `3409` render-engine)

### Note on task-numbers vs on-disk numbers

The task description references 6,415 pass / 3,859 fail / 3,692 byte-diff. The on-disk `verification-aggregate.json` is coordinator-fresh but contains only shard 0 (341 entries). The most-recent FULL aggregate on disk is `per-class-mechanisms.json`, which shows 3,929 pass / 6,345 fail / 5,982 byte-diff (2,573 card-engine + 3,409 render-engine). The task's claimed numbers do not match either file. The cluster map below is grounded in (a) the on-disk aggregate for per-entry signatures (122 byte-diff entries from shard 0) and (b) the per-class-mechanisms baseline for full-run counts. Per-cluster extrapolation is documented inline.

## Cluster table

| # | Cluster | Owner | Count (shard 0) | One-line mechanism |
|---|---------|-------|-----------------|---------------------|
| 1 | `parens-name-key-normalization` | ENGINE | 30 | DeckoName.toKey normalizes trailing '(s)' to a single trailing underscore instead of Ruby's '_s' underscore, so `Organizer(s)` keys as `organizer_` (engine) vs `organizer_s` (Ruby). |
| 2 | `tiny-render-type-plus-right-rule-card` | ENGINE | 18 | Engine renders a *type+*right / *right rule card's open/content view as the bare rule-card bar (~10K bytes) while Ruby emits the SET's expanded children list (~60K bytes including _category-all _category-field _category-recent _category-common, four categories). |
| 3 | `set-card-pointer-list-vs-nested-content` | ENGINE | 48 | Engine renders set cards (left+right where right is a TYPE member slot — `+Pages`, `+Family`, `+Core Project`, `+tags`, etc.) using `<div class="card-list card-list-bar pointer-list">` flat list while Ruby emits each child as a nested `<div id="${name}-${slot}-content-view">` slot. |
| 4 | `boolean-yes-vs-integer-1` | VIEW-REGISTRY | 4 | Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. |
| 5 | `rule-card-content-as-literal-text` | VIEW-REGISTRY | 8 | Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. |
| 6 | `rule-card-content-as-pointer-list` | VIEW-REGISTRY | 3 | Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. |
| 7 | `read-rule-grant-vs-deny` | SEEDING | 3 | Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). |
| 8 | `runaway-output-recursion` | ENGINE | 2 | Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). |
| 9 | `as-in-layout-error-message-divergence` | ENGINE | 2 | For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. |
| 10 | `search-query-content-vs-literal` | ENGINE | 1 | Engine renders `*layout+*right+*content options:render:content` by interpreting the JSON content spec as a search query and rendering `<div class="search-no-results">` while Ruby renders the JSON literal `{"type": "Layout"}`. |
| 11 | `news-item-show-options-comment-box` | VIEW-REGISTRY | 1 | Engine's `News Item+discussion:render:open` data-slot has only `["open"]` in the show list while Ruby's has `["open","comment_box"]`. |
| 12 | `apostrophe-name-key` | ENGINE | 1 | Engine's name key normalization for an apostrophe diverges from Ruby's: Ruby key `paula_craig_father_s_day` (apostrophe -> `_s`), engine key `paula_craig_father__day` (apostrophe stripped, leaving the underscore from the leading space). |
| 13 | `favicon-text-content-divergence` | ENGINE | 1 | Engine and Ruby render *favicon:render:closed with different literal text — Ruby emits `A favicon (or shortcut icon) is a small image us...` while engine emits `<p><em>Please remember to click ...`. |
| - | **UNTRACED** | - | 0 | no mechanism matched. |
| - | **Total** | - | 122 | sum of byte-diff from shard 0. |

### Sum check

Clustered + UNTRACED = 122 ; byte-diff total = 122 ; diff = 0

## Per-cluster detail

### 1. `parens-name-key-normalization`

- **Owner**: ENGINE
- **Count (shard 0)**: 30
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
- **Count (shard 0)**: 18
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
- **Count (shard 0)**: 48
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
- **Count (shard 0)**: 4
- **Mechanism**: Engine renders the boolean-as-display-value for *all+*captcha content/closed as the integer `1` while Ruby renders the localized string `yes`. Same offset (~970 in the value label position). Triggered by accordion-button labels and counter badges that format the value as a truthy/falsy display string.

**Sample entry ids**:

- `recapture-raw:*all+*captcha:render:closed` (offset=989, exp=2938, act=2936)
- `recapture-raw:*all+*captcha:render:content` (offset=437, exp=446, act=444)
- `recapture-raw:*all+*captcha:render:open` (offset=971, exp=2842, act=3405)
- `recapture-raw:*captcha+*right+*default:render:content` (offset=481, exp=490, act=488)

**View-table work**:

src/card/render/views.ts#openView/closedView + content-overrides.ts: for *all+*captcha content, dispatch to the boolean-to-display formatter the same way bar/accordion bodies do (Ruby: 'yes'/'no', engine: '1'/'0'). Test pins: recapture-raw:*all+*captcha:render:content (offset 437, exp 446, act 444).

### 5. `rule-card-content-as-literal-text`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 8
- **Mechanism**: Engine wraps a rule card's stored content (a literal string/number like `Default Layout`, `4`, `0`, `signup_success`) in a content-view slot while Ruby renders the literal text directly after the accordion body. Same offset band (~2800-3000) as the set-card cluster but differentiated by excerpt text being a short literal rather than a child slot.

**Sample entry ids**:

- `recapture-raw:*all+*content option view:render:open` (offset=2992, exp=3031, act=3670)
- `recapture-raw:*all+*table of contents:render:open` (offset=2762, exp=2792, act=3415)
- `recapture-raw:*captcha+*right+*default:render:open` (offset=2813, exp=2844, act=3453)
- `recapture-raw:*input type+*right+*input type:render:open` (offset=2938, exp=2971, act=3612)
- `recapture-raw:*table of contents+*right+*default:render:open` (offset=2947, exp=2976, act=3624)

**View-table work**:

src/card/render/views.ts#contentView: for *type+*right rule cards whose dbContent is a single literal (no items, no template), render the literal text directly instead of wrapping in a content-view slot. Test pins: recapture-raw:*table of contents+*right+*default:render:open (offset 2947, exp 2976, act 3624 — `4` literal vs nested content-view slot) and recapture-raw:Setting+*self+*table of contents:render:open (offset 2966, exp 2995, act 3654 — `0` literal vs nested slot).

### 6. `rule-card-content-as-pointer-list`

- **Owner**: VIEW-REGISTRY
- **Count (shard 0)**: 3
- **Mechanism**: Engine treats *all+*layout (and similar rule cards with non-trivial content) as a pointer/list cardtype and wraps the content in `<div class="pointer-list">...` while Ruby renders the literal string `Default Layout` after the accordion body. Triggered by engine's isPointerOrListCard gate (src/card/render/pointer-list.ts:106) mis-classifying the card based on dbContent shape.

**Sample entry ids**:

- `recapture-raw:*all+*layout:render:closed` (offset=971, exp=2837, act=3016)
- `recapture-raw:*all+*layout:render:open` (offset=953, exp=5245, act=5388)
- `recapture-raw:*layout+*right+*content options:render:open` (offset=1544, exp=3661, act=4334)

**View-table work**:

src/card/render/pointer-list.ts#isPointerOrListCard: only treat as pointer/list when the type card is actually pointer or list, not based on dbContent heuristics. Test pin: recapture-raw:*all+*layout:render:open (offset 953, exp 5245, act 5388 — `Default Layout` literal vs `<div class="pointer-list">`).

### 7. `read-rule-grant-vs-deny`

- **Owner**: SEEDING
- **Count (shard 0)**: 3
- **Mechanism**: Engine's read-rule evaluation diverges from Ruby's for a few specific rule cards (`*all+*default`, `*all+*content option view`, `*help+*right+*default`, `*sidebar+*self+*default`). At offset ~2000-4500 (mid-list) Ruby renders a `<span class="denied">` while engine renders a real `<div id="...-bar-view">` (or vice versa). The seed closure for the *read rule universe is partial — the rule's set card or REFEREE_IDS walk is missing the grants the engine needs to deny. This is a byte-diff signature (not classified as `permission_denied_mismatch` because the verify script's excerpt-match regex misses the truncation pattern at long offsets).

**Sample entry ids**:

- `recapture-raw:*all:render:content` (offset=2023, exp=54734, act=40242)
- `recapture-raw:*all:render:open` (offset=4192, exp=56828, act=39852)
- `recapture-raw:Martial Nonviolence+Pages:render:content` (offset=8431, exp=38635, act=65895)

**Seed-side work**:

tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts#createRawStructureSeededStorage: extend the *read rule universe closure walk to follow the rule's SET card's card_references grants (not just left/right/type_id). Ruby's permissions.rb#read_rule? evaluates the union of grants via Card.where, which the current closure walk doesn't replicate. Test pin: recapture-raw:*all:render:content (offset 2023, exp 54734, act 40242 — denied spans present in Ruby where engine renders real cards).

### 8. `runaway-output-recursion`

- **Owner**: ENGINE
- **Count (shard 0)**: 2
- **Mechanism**: Engine render of `Family+*right+*content options` produces 600K+ bytes (vs Ruby's 540-3.6K). Some kind of infinite recursion or runaway inclusion. Both expected and actual are non-error HTML, but the actual is ~100x larger than Ruby. Likely related to the search-query-content cluster (engine interpreting JSON content as a recursive search query without a depth limit).

**Sample entry ids**:

- `recapture-raw:Family+*right+*content options:render:content` (offset=517, exp=540, act=619284)
- `recapture-raw:Family+*right+*content options:render:open` (offset=1534, exp=3645, act=607040)

**Proposed fix sketch**:

src/card/render.ts (render entrypoint) + src/card/set-patterns/search.ts: add a recursion-depth guard around render() — when the same card name is being rendered as a nest within its own output, abort at depth 8 (matches Ruby's Card::View::Cache#fetched caching that prevents the same recursive nest). Test pin: recapture-raw:Family+*right+*content options:render:content (offset 517, exp 540, act 619284).

### 9. `as-in-layout-error-message-divergence`

- **Owner**: ENGINE
- **Count (shard 0)**: 2
- **Mechanism**: For `AsIn Layout` both Ruby and engine raised (CAPTURE_ERROR sentinel), but Ruby raised `Card::Error: couldn't find credentials for bucket` while engine raised `Error: nest depth exceeded (*head)`. Different error classes for the same card — engine's nest-depth limit fires before the credential lookup the engine should also have. Classified as `capture_error_still_raised:Card` by the verify script.

**Sample entry ids**:

- `recapture-raw:AsIn Layout:render:content` (offset=15, exp=74, act=49)
- `recapture-raw:AsIn Layout:render:open` (offset=15, exp=74, act=49)

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

- `recapture-raw:News Item+discussion:render:open` (offset=435, exp=3222, act=3173)

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

## UNTRACED entries

None in shard 0.

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

