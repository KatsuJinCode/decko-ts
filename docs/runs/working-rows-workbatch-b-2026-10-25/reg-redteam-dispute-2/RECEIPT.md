# reg-redteam-dispute-2

- Family: register-redteam.
- Row: "disputed PORTED verdict: rules" (card-mod-rules / write-routes stub census).
- Verdict at the time of this lane: PARTIAL, bucket WORKING ON IT, blocker REAL-GAP: "31/32
  set paths, 32 port view names against 35 Ruby view declarations, 3 Ruby view names with no
  port registration, and its single event registered engine-owned with no body. Fix: register
  the 3 missing view names and the save_recently_edited_settings body."

## Verdict: DONE - all four blocker claims are stale or bookkeeping at the base this receipt measures

Base: `deploy/full-candidate-20261101` tip `c17906db`. The in-tree verification
(`docs/reports/reg-redteam-dispute-2-rules-view-names-verification-2026-10-20.md`) reached
this conclusion at d8050251; this lane re-ran every measurement at the current base and it
holds unchanged.

1. Set paths: the gem (`card-mod-rules-0.20.0/set`) carries 32 `.rb` files under `set/`
   (counted this session), and `set/rule/rule_form/rule_set_radio.rb:1` reads
   `#! no set module` - it defines the RuleSetRadio helper, not a set. 31 of 31; the helper
   itself is ported (`ruleSetRadioHtml`, the mod's own copy and the shared substrate).
2. View names: `grep -o` census this session - the gem declares 35 `view :x` names, the mod
   file registers 32 `view: "x"` names, and `comm -23` between them returns exactly
   `bar_bottom`, `bar_right`, `core`. All three are engine-owned in the compiled view table,
   which is why no mod registration exists: `src/card/render/views.ts:7052` maps
   `bar_bottom: barBottomView` (the rule arm renders `fmt.renderView("core")` inside the
   accordion body, Ruby's nest shape from `bar_view.rb:31-37`), `ruleBarRightHtml` (Ruby's
   `rule_short_content`, `bar_view.rb:43-53`) is imported at `views.ts:88` and dispatched at
   `:5189`, and `core` on a rule rides the search-type arm of the core dispatch gated on
   Ruby's `standard_rule?` (`rule/all.rb:33-46`).
3. The event body: `save_recently_edited_settings` is declared `engineOwnedEvent` at
   `src/card/mod-loader/mods/card-mod-rules.ts:2803` with the Ruby citation in the comment
   above it, and the body EXISTS: `CardActionEngine#saveRecentlyEditedSettings` at
   `src/card/actions/card-action-engine.ts:7610` (the `recent.insert_item 0, name.right`
   behavior with the recent-settings subcard), invoked on the create path at `:3024` and the
   update path at `:4089` - Ruby's `:integrate` stage placement. The claim "no body" is
   false.
4. The one named skip, unchanged: `bar_view.rb:32-33`'s edit-mode arm
   (`nest_mode == :edit then current_rule_form`) has no port dispatch to hook - edit-mode
   nests go through `modalNestView`, which never returns the requested view name - and no
   graded surface reaches it.

Checks run at the base of this receipt (this lane, this tree):

- `npx vitest run tests/card/render/fabricated-search-rule-core-raw-one-line.test.ts
  tests/card/render/bar-bottom-rule-shape-type-refutation-pins.test.ts
  tests/card/render/nest-item-and-one-line-limit.test.ts` - 3 files, 14 tests passed.
- The counts in items 1 and 2 are this session's greps over the pinned gem and this tree.

The row's fix instruction ("register the 3 missing view names and the body") is answered on
the evidence: the three names are engine-owned registrations in the compiled view table and
the body is in the engine at the cited lines. The residue is the one unreachable edit-mode
arm, named, which the verification report already carries. The row can be re-opened only
against a concrete byte divergence; none was found at this base.
