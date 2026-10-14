# card-mod-account — harness scorecard

Behaviors validated: **6 / 96** (standing-net: 71, named-remainder: 19, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Event hooks are counted, not listed: this scorecard measures whether the port REGISTERS what the gem declares, not what a hook does when it fires, so the 30 declared hook(s) appear as one aggregate row rather than an inventory of upstream hook names. The totals above count every hook individually.

Probe suite: 23 passed / 0 failed (tests/card/mod-loader/card-mod-account-harness-probe.test.ts, tests/card/mod-loader/card-mod-account.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:closed_account` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "closed_account" |
| `view:account_tab` | view | green | yes | static-ruby | card-mod-account.ts registers view "account_tab" |
| `view:verify_url` | view | registered-standing-net | yes | - | view "verify_url" registered (engine HTML_VIEWS + manifest) |
| `view:reset_password_url` | view | registered-standing-net | yes | - | view "reset_password_url" registered (engine HTML_VIEWS + manifest) |
| `view:token_expiry` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "token_expiry" |
| `view:token_days` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "token_days" |
| `view:verify_days` | view | registered-standing-net | yes | - | view "verify_days" registered (engine HTML_VIEWS + manifest) |
| `view:reset_password_days` | view | registered-standing-net | yes | - | view "reset_password_days" registered (engine HTML_VIEWS + manifest) |
| `view:closure` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "closure" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "raw" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "raw" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:open` | view | registered-standing-net | yes | - | view "open" registered (engine HTML_VIEWS) |
| `view:title` | view | registered-standing-net | yes | - | view "title" registered (engine HTML_VIEWS) |
| `view:open_content` | view | registered-standing-net | yes | - | view "open_content" registered (engine HTML_VIEWS + manifest) |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "one_line_content" |
| `view:reset_password_success` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "reset_password_success" |
| `view:edit` | view | green | yes | static-ruby | view "edit" registered (engine HTML_VIEWS + manifest) |
| `view:edit_buttons` | view | registered-standing-net | yes | - | view "edit_buttons" registered (engine HTML_VIEWS + manifest) |
| `view:link_with_checkbox` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "link_with_checkbox" |
| `view:configs` | view | registered-standing-net | yes | - | view "configs" registered (engine HTML_VIEWS + manifest) |
| `basket:basket[:non_createable_types] << :signup` | basket-op | named-remainder | no | - | no TS literal "basket[:non_createable_types] << :signup" (no consumer seam yet) |
| `view:new` | view | green | yes | static-ruby | view "new" registered (engine HTML_VIEWS + manifest) |
| `view:content_formgroups` | view | green | yes | static-ruby | view "content_formgroups" registered (engine HTML_VIEWS + manifest) |
| `view:new_buttons` | view | green | yes | static-ruby | view "new_buttons" registered (engine HTML_VIEWS + manifest) |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:setup` | view | green | yes | static-ruby | card-mod-account.ts registers view "setup" |
| `basket:basket[:roles_for_first_user] = %i[help_desk shark administrator]` | basket-op | named-remainder | no | - | no TS literal "basket[:roles_for_first_user] = %i[help_desk shark administrator]" (no consumer seam yet) |
| `basket:basket[:roles_for_first_user].map(&:cardname).each do |role|` | basket-op | named-remainder | no | - | no TS literal "basket[:roles_for_first_user].map(&:cardname).each do \|role\|" (no consumer seam yet) |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "raw" |
| `seed:role` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:members` | seed | named-remainder | no | - | no TS registration naming "members" |
| `seed:anyone` | seed | named-remainder | no | - | no TS registration naming "anyone" |
| `seed:anyone_signed_in` | seed | named-remainder | no | - | no TS registration naming "anyone_signed_in" |
| `seed:administrator` | seed | named-remainder | no | - | no TS registration naming "administrator" |
| `seed:eagle` | seed | named-remainder | no | - | no TS registration naming "eagle" |
| `seed:shark` | seed | named-remainder | no | - | no TS registration naming "shark" |
| `seed:help_desk` | seed | named-remainder | no | - | no TS registration naming "help_desk" |
| `seed:anonymous` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-script.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:account` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:email` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:password` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:salt` | seed | named-remainder | no | - | no TS registration naming "salt" |
| `seed:status` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-follow.ts |
| `seed:account_settings` | seed | named-remainder | no | - | no TS registration naming "account_settings" |
| `seed:signup` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:welcome_email` | seed | named-remainder | no | - | no TS registration naming "welcome_email" |
| `seed:verification_email` | seed | named-remainder | no | - | no TS registration naming "verification_email" |
| `seed:password_reset_email` | seed | named-remainder | no | - | no TS registration naming "password_reset_email" |
| `seed:signup_alert_email` | seed | named-remainder | no | - | no TS registration naming "signup_alert_email" |
| `seed:signin` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:roles` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/core-mod.ts |
| `seed:enabled_roles` | seed | named-remainder | no | - | no TS registration naming "enabled_roles" |
| `seed:account_links` | seed | named-remainder | no | - | no TS registration naming "account_links" |
| `seed:cards_with_account` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-permissions.ts |
| `seed:thanks` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:signup_success` | seed | named-remainder | no | - | no TS registration naming "signup_success" |
| `config:cardtypes` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-carrierwave.ts |
| `config:de` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:en` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `event:<declared hooks, not listed>` | event |  |  | - | 30 event hook(s) declared by the gem: 30 registered-standing-net |
