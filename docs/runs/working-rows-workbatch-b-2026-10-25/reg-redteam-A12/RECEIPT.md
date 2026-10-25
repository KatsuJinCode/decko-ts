# reg-redteam-A12

- Family: register-redteam.
- Row: "A-R12 Unclaimed with NO port counterpart found: Set::AdvancedApi, Set::RequiredField,
  Set::I18nScanner/I18nScope, ..." (nine grep-absence surfaces).
- Verdict at the time of this lane: UNPORTED, bucket WORKING ON IT. The blocker's
  instruction: "Audit the nine still grep-absence UNPORTED surfaces one at a time, recording
  port counterpart or confirmed absence for each."

## Verdict: DONE - closed on the row's own instruction, the nine-surface audit, with one correction recorded

The audit exists in the tree this receipt was measured on (`deploy/full-candidate-20261101`
tip `c17906db`): `docs/reports/reg-redteam-a12-unclaimed-ruby-surfaces-audit-2026-10-20.md`.
Its result: two surfaces ported under other names (RequiredField, Classy), one live
mechanism the port deliberately does not have (I18nScope, a Ruby-backtrace parser), one
inert Ruby file (I18nScanner, entirely commented out), one inert library API (SaveHelper),
two Rails-side plumbing pieces (the CacheAction knob, the Utils tmp sweep), one dev tooling
entry (empty_trash). Nothing is a live behavioral gap.

Every claim re-verified at this base, this lane, this tree (pinned gems at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`):

- RequiredField: `src/card/actions/card-action-engine.ts:3463` throws the `field-required`
  error kind, `:7905` the "email required" arm; `src/card/actions/types.ts:55` declares the
  error kind citing `card-mod-account set/right/account.rb:8`; `applyAccountFieldEvents` at
  `card-action-engine.ts:1858`, invoked at `:2916`, carries the account-field requirement.
- I18nScanner: `card-1.110.0/lib/card/set/i18n_scanner.rb` is 24 lines, all comment.
- I18nScope: extended at `card-1.110.0/lib/card/set.rb:130`.
- Classy: the gem caller `card-mod-history-0.20.0/lib/card/action/action_renderer.rb:30`;
  the port's same class-string builder `voo.classy(...)` at
  `src/card/render/views.ts:256` and `:279`.
- CacheAction: the option declared at `src/card/mod-loader/mod-manifest.ts:86`; grep for
  `viewCache|cacheKey|cachedView` in `src/card/render/` returns nothing (no view-level
  render cache exists to disable).
- SaveHelper: zero `Card.create_card` / `Card.update_card` callers across
  `card-1.110.0/lib` and `decko-0.20.0/lib`.
- Cardio::Utils: one caller, `card-1.110.0/lib/card/cache/class_methods.rb:88`
  (`delete_tmp_files!`).

THE CORRECTION this lane adds to the audit's table: row 3 (Set::Inheritance) records
"`include_set` has zero callers in the pinned gemset; only `include_set_modules` hits."
That is not exact at this pin. `grep -rn "include_set" card-1.110.0/lib decko-0.20.0/lib`
returns, beside the `include_set_modules` family (`format.rb:53,62` is
`include_set_format_modules`, same family), one LIVE internal call:
`card-1.110.0/lib/card/set/advanced_api.rb:35`, inside the `attachment` DSL method, which
calls `include_set Abstract::Attachment` before adding the attachment attributes; plus one
template-string occurrence (`set/helpers.rb:97`, an eval body) and one comment
(`set/inheritance.rb:14`). The disposition stands on the corrected facts: the one caller is
Ruby's own attachment DSL, whose effect on a deck (attachment sets carrying
Abstract::Attachment) the port covers through its static mod composition and its attachment
substrate, so `include_set` remains no port surface and porting it would be unreachable
code. The audit's caller count was wrong in the letter; the ruling survives the correction,
and this receipt is where the corrected count is recorded.

No production code changed; the row's product is the per-surface disposition, re-measured
here at the current base.
