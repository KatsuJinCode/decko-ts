# Known divergences from Ruby in the mod-loader test suite

The `it.fails(...)` tests in this directory are inverted ON PURPOSE: each
pins a view whose bytes/shape assertions are correct but whose DISPATCH
the engine does not reach yet, so the test fails until the closing
mechanism lands. One row per divergence; each test site carries a
one-line pointer here instead of its own rationale.

| Divergence | Mechanism (why TS dispatches differently) | Test sites | What would close it |
| --- | --- | --- | --- |
| Nested set-file registration (shortname shape) | A view declared in a NESTED set file (`set/type/<X>/html_views.rb`) registers as `Type::<X>::HtmlViews` (mod-registrar.ts#setModuleShortname joins every path segment) while the card's TYPE token names the parent anchor `Type::<X>`. Ruby's SetTemplate nests the file's contents INTO the parent set (`card-1.110.0 lib/cardio/mod/loader/set_template.rb:11-19`). | card-mod-carrierwave.test.ts (`:full_width`, set/type/image/html_views.rb) | A dispatch that reaches a nested set-file module from the parent anchor token (the viewChain nested expansion covers the starred-token case only). |
| Codename-key chain walk | The engine's `safe_set_keys` SELF token carries the NAME key, which singularizes (`SELF-Xfollow_default`), while the module shortname carries the gem path literal (`Self::FollowDefaults`). Ruby's Pattern::Base#module_key (`card-1.110.0 lib/card/set/pattern/base.rb:21-29` + `lib/card/set/pattern/class_methods.rb:45-50`) builds the key from the anchor card's CODENAME and matches. | card-mod-layout.test.ts (the four account link views, self/account_links.rb:33-54) | Supplying anchor codenames render-side so the chain walker keys modules the way Pattern::Base does. |
| compound_only not enforced | Ruby's right set pattern is compound_only (`card-1.110.0 mod/core/set_pattern/07_right.rb:1-4`): a SIMPLE card raises unknown-view. The TS engine answers `Right::Help`'s `:popover` for simple cards because it registers the view without the compound gate. | card-mod-help.test.ts (`:popover` on a simple probe) | A set-scoped dispatch that enforces the pattern's compound_only flag. The inverted test keeps the shape assertions for that day. |
| include_set seam | With both mods loaded, the `All::Item` base-bucket chain entry wins chain[0] and shadows the `Abstract::Search` flat `:count` registration. Ruby reaches the search module's `:count` for Search-typed cards THROUGH include_set, and Ruby's MRO (`card-mod-search-0.20.0 set/format.rb:146-150`) gives the included module priority over the chain entry. The engine keeps abstract sets flat (no include_set seam) and chain beats flat. | card-mod-search.test.ts (`:count` with collection + search both loaded) | An include_set seam (or an abstract-set chain priority) in the loader's view resolution. |

Sites that once carried this marker and now run unmarked: card-mod-follow's
`:confirm_update_all` (SELF tokens resolve by the anchor's codename when the
deck's name environment is warm, set-keys-to-modules.ts rubySelfToken, and
anchored TYPE, RIGHT and TYPE_PLUS_RIGHT tokens by their parts' codenames,
anchoredModuleCandidates; the
layout test's marker stays, since its probe asks for the account link views
on a card outside the Self set); and, since the viewChain nested-set-file expansion landed, card-mod-bootstrap's `:one_line_content`
and card-mod-rules' `:set_label` / `:grouped_list`-family views.
