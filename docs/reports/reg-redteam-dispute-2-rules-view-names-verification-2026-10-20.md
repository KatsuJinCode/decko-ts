# reg-redteam-dispute-2 (card-mod-rules) — verification against the canonical tree

Row: `reg-redteam-dispute-2` in `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`
("disputed PORTED verdict: rules", verdict PARTIAL, bucket WORKING ON IT).

The roster blocker claims four things about `src/card/mod-loader/mods/card-mod-rules.ts`:
"card-mod-rules at 31/32 set paths, 32 port view names against 35 Ruby view declarations,
3 Ruby view names with no port registration, and its single event registered engine-owned
with no body".

All four were re-checked first-hand against the canonical tree
(`decko-ts-release-lead` @ `d8050251`, the base this branch is cut from), Ruby side read from
the pinned gemset `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-rules-0.20.0`.
**Nothing was ported: three of the four claims are stale or bookkeeping, and the fourth is a
registration-name gap with the behaviour already ported.**

## 1. "31/32 set paths" — the 32nd file is not a set module

`set/rule/rule_form/rule_set_radio.rb:1` is literally `#! no set module`. The file defines the
`RuleSetRadio` helper class, not a set. The port registers 31 set paths and the gem has 31 set
files (`find set -name '*.rb'` = 32 files, one of which declares itself not a set).

The helper itself is ported: `ruleSetRadioHtml` in
`src/card/mod-loader/mod-form-substrate-rule-form.ts:175` and the mod's own copy at
`src/card/mod-loader/mods/card-mod-rules.ts:2191`, called from the rule-form set-selection walk
(`card-mod-rules.ts:2148`). **Arithmetic corrected: 31/31, not 31/32.**

## 2. The three "unregistered" view names — behaviour already ported, engine-owned

`comm -23` between the gem's `view :x` declarations and the mod's `view: "x"` registrations
names exactly three: `bar_bottom`, `bar_right`, `core`. Each one is dispatched by the render
layer on the RULE set, which is why no mod registration exists:

| Ruby (bar_view.rb / html_views.rb) | Port dispatch | Pin that runs green |
|---|---|---|
| `:core` — `if card.type_id == SearchTypeID then render_raw else super() end` (html_views.rb:2-12) | `src/card/render/views.ts:1109-1158`, inside the search-type arm of the core dispatch, gated on `cardIsRule ∪ cardMatchesRuleSet` (Ruby's `standard_rule?`, rule/all.rb:33-45, no part-count limit) | `tests/card/render/fabricated-search-rule-core-raw-one-line.test.ts` (1 passed) |
| `:bar_right` — `rule_short_content`, i.e. the existing rule's `:one_line_content` (bar_view.rb:43-53) | `src/card/render/rule-bar-right.ts` (`ruleBarRightHtml`, RULE-token gated), reached from `views.ts`'s `barRightView` | `tests/card/render/nest-item-and-one-line-limit.test.ts` (12 passed) |
| `:bar_bottom` — `nest existing_rule_card, view: :core` (bar_view.rb:31-37) | `src/card/render/views.ts` `barBottomView`'s rule branch: a RULE card renders `fmt.renderView("core")` directly inside the accordion body, no content-view slot — the byte shape the nest produces | `tests/card/render/bar-bottom-rule-shape-type-refutation-pins.test.ts` (1 passed) |

The mod file says this itself at `card-mod-rules.ts:2818-2823` ("The bar family is ALREADY COVERED
by the render layer … the compat report counts bar, bar_bottom, bar_middle, bar_right as
covered"). The register's arithmetic counts registration NAMES; the behaviours match.

### The one arm that is genuinely not ported (named skip)

`bar_view.rb:32-33`: `if nest_mode == :edit then current_rule_form`. In the port, edit-mode
nests go through `RenderFormat#modalNestView` (`src/card/render/format.ts:963-967`), which
substitutes `:edit_in_form` / `:blank` / `:template_nest` and never returns the requested view
name — so a rule card's `:bar_bottom` is unreachable under an edit-nest parent and the arm has
no dispatch to hook. **Skip-and-name:** no port surface exists for it without inventing an
edit-mode `:bar_bottom` dispatch that Ruby's own render graph does not exercise here.

## 3. "its single event registered engine-owned with no body" — the body is in the engine

`save_recently_edited_settings` (rules.rb:1-6) is declared with `engineOwnedEvent`
(`card-mod-rules.ts:2802-2807`), which is the repo's own idiom for "the behaviour lives in
engine code; the declaration records Ruby's set membership and metadata". The body IS
implemented: `CardActionEngine#saveRecentlyEditedSettings`
(`src/card/actions/card-action-engine.ts:5495`), running `recent.insert_item 0, name.right`
per rules.rb:3 and subcarding the recent-settings card, invoked on the create path
(`:1956`) and the update path (`:2851`) after the act's integrate events — Ruby's `:integrate`
stage. **The claim "no body" is false; the engine owner is cited at the declaration.**

## Checks run in this tree (worktree decko-ts-redteam-20261020, base d8050251)

- `npx vitest run tests/card/render/fabricated-search-rule-core-raw-one-line.test.ts tests/card/render/bar-bottom-rule-shape-type-refutation-pins.test.ts` → 2 files, 2 tests passed.
- `npx vitest run tests/card/render/nest-item-and-one-line-limit.test.ts` → 1 file, 12 tests passed.
- `grep -oE 'view: "[a-z_0-9]+"' src/card/mod-loader/mods/card-mod-rules.ts | sort -u` → 32 names; the gem's `view :x` declarations → 35; `comm -23` → `bar_bottom`, `bar_right`, `core`.
- `find set -name '*.rb'` in the gem → 32 files; `sed -n '1p' set/rule/rule_form/rule_set_radio.rb` → `#! no set module`.
- No source file changed in this lane's dispute-2 work; a redundant `views.ts` branch that was
  written before the existing `:core` exemption was found was reverted by hand (the machine's
  git rules forbid `git checkout --`), and `git status --porcelain` is empty for that file.

## What a reader should do with this row

The row's blocker is written against an older tree. On `d8050251` the mod is 31/31 set paths,
the three unnamed views are engine-owned with green pins, and the event body exists in the
engine. The residue is one registration-name count and one unreachable edit-nest arm. The row
can move on that evidence, or be re-opened only against a concrete byte divergence — none was
found here.
