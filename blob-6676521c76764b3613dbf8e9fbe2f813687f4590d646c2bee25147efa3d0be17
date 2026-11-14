# Known divergences from Ruby in the mod-loader test suite

None. Every mechanism that used to be recorded here has since landed, and
every test site named below now runs unmarked against the behaviour Ruby
has. The file stays so a future divergence has a home with the same
shape: one row per divergence, the Ruby mechanism beside the port's, the
test site that pins it, and what would close it.

Read a divergence as a bug, not a note. If a mechanism below is hard to
close, that is a reason to build it, never a reason to leave the row.

| Divergence | Mechanism (why TS dispatches differently) | Test sites | What would close it |
| --- | --- | --- | --- |

## Retired rows

Each row recorded a mechanism that no longer differs. They are listed
with what closed each, so the next reader can check the claim instead of
re-deriving it.

| Retired divergence | What closed it |
| --- | --- |
| Nested set-file registration (shortname shape) — `set/type/<X>/html_views.rb` registered as `Type::<X>::HtmlViews` while the TYPE token names `Type::<X>` (mod-registrar.ts#setModuleShortname joined every path segment). | The viewChain's nested-set-file expansion (mod-loader.ts `tokenEntries`, `nonbaseUnderPath`) reaches a nested module from the parent anchor token. It is token-shape agnostic, not starred-token only: the carrierwave `:full_width` test renders unmarked and asserts its bytes. `Type::Image` html arms are disjoint from `Type::Image` in `set/type/image.rb`, and the one parent/nested same-view pair in the gem tree (`Type::BootswatchSkin` `:one_line_content`) has identical `""` bodies on both sides, so no byte moved. |
| Codename-key chain walk — the SELF token carried the NAME key (`SELF-Xfollow_default`) while the module shortname carried the gem path literal (`Self::FollowDefaults`). | `set-keys-to-modules.ts#rubySelfToken` resolves a SELF token to the anchor's codename and `anchoredModuleCandidates` does the same for anchored TYPE / RIGHT / TYPE_PLUS_RIGHT tokens, exactly as `Pattern::Base#module_key` and `#anchor_codenames` do (card-1.110.0 lib/card/set/pattern/base.rb:21-29, :40-44 + lib/card/set/pattern/class_methods.rb:45-50). The layout test renders the four account link views on the card the Self set anchors on and asserts that an outside card raises unknown-view. |
| compound_only not enforced — the right set pattern is compound_only (card-1.110.0 mod/core/set_pattern/07_right.rb:2-5), so a SIMPLE card raises unknown-view, but the engine answered `Right::Help`'s `:popover`. | `defaultApplies` (set-patterns/registry.ts) applies `compound_only` when building the card's safe set keys, so a simple card has no RIGHT token, its chain never reaches `Right::Help`, and `Card::Format::Render#view_method` raises (lib/card/format/render.rb:69-71 → mod/format/set/all/error.rb:52-53 → mod/format/config/locales/en.yml:24). The help test pins that exact message. |
| include_set seam — the `All::Item` base-bucket chain entry won chain[0] and shadowed `Abstract::Search`'s flat `:count` registration. | `includedAbstractEntries` (mod-loader.ts) expands a type token with the abstract sets its module includes (set-include-graph.ts), so the search module's `:count` reaches Search-typed cards while every other card still gets `All::Item`'s. The search test loads both mods and pins both answers. |