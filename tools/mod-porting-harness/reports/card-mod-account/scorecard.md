# card-mod-account — harness scorecard

Behaviors validated: **6 / 99** (standing-net: 40, named-remainder: 53, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 23 passed / 0 failed (tests/card/mod-loader/card-mod-account-harness-probe.test.ts, tests/card/mod-loader/card-mod-account.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:closed_account` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "closed_account" |
| `view:account_tab` | view | green | yes | static-ruby | card-mod-account.ts registers view "account_tab" |
| `event:validate_account_holder_name_change` | event | named-remainder | no | - | no event "validate_account_holder_name_change" registration in card-mod-account.ts |
| `event:generate_token` | event | named-remainder | no | - | no event "generate_token" registration in card-mod-account.ts |
| `event:set_stamper` | event | named-remainder | no | - | no event "set_stamper" registration in card-mod-account.ts |
| `view:password_reset_email` | view | named-remainder | no | - | no view "password_reset_email" registration in card-mod-account.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:verification_email` | view | named-remainder | no | - | no view "verification_email" registration in card-mod-account.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:welcome_email` | view | named-remainder | no | - | no view "welcome_email" registration in card-mod-account.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `event:set_default_salt` | event | named-remainder | no | - | no event "set_default_salt" registration in card-mod-account.ts |
| `event:set_default_status` | event | named-remainder | no | - | no event "set_default_status" registration in card-mod-account.ts |
| `event:reset_password` | event | named-remainder | no | - | no event "reset_password" registration in card-mod-account.ts |
| `event:verify_and_activate` | event | named-remainder | no | - | no event "verify_and_activate" registration in card-mod-account.ts |
| `event:password_redirect` | event | named-remainder | no | - | no event "password_redirect" registration in card-mod-account.ts |
| `event:activate_account` | event | named-remainder | no | - | no event "activate_account" registration in card-mod-account.ts |
| `event:delete_account` | event | named-remainder | no | - | no event "delete_account" registration in card-mod-account.ts |
| `event:signout_upon_delete` | event | named-remainder | no | - | no event "signout_upon_delete" registration in card-mod-account.ts |
| `view:verify_url` | view | registered-standing-net | yes | - | view "verify_url" registered (engine HTML_VIEWS) |
| `view:reset_password_url` | view | registered-standing-net | yes | - | view "reset_password_url" registered (engine HTML_VIEWS) |
| `view:token_expiry` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "token_expiry" |
| `view:token_days` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "token_days" |
| `view:verify_days` | view | registered-standing-net | yes | - | view "verify_days" registered (engine HTML_VIEWS + manifest) |
| `view:reset_password_days` | view | registered-standing-net | yes | - | view "reset_password_days" registered (engine HTML_VIEWS + manifest) |
| `view:closure` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "closure" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `event:validate_email` | event | named-remainder | no | - | no event "validate_email" registration in card-mod-account.ts |
| `event:validate_unique_email` | event | named-remainder | no | - | no event "validate_unique_email" registration in card-mod-account.ts |
| `event:downcase_email` | event | named-remainder | no | - | no event "downcase_email" registration in card-mod-account.ts |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "raw" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `event:encrypt_password` | event | named-remainder | no | - | no event "encrypt_password" registration in card-mod-account.ts |
| `event:validate_password_length` | event | named-remainder | no | - | no event "validate_password_length" registration in card-mod-account.ts |
| `event:validate_password_chars` | event | named-remainder | no | - | no event "validate_password_chars" registration in card-mod-account.ts |
| `event:validate_password_present` | event | named-remainder | no | - | no event "validate_password_present" registration in card-mod-account.ts |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "raw" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:open` | view | registered-standing-net | yes | - | view "open" registered (engine HTML_VIEWS) |
| `view:title` | view | registered-standing-net | yes | - | view "title" registered (engine HTML_VIEWS) |
| `view:open_content` | view | registered-standing-net | yes | - | view "open_content" registered (engine HTML_VIEWS + manifest) |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "one_line_content" |
| `view:reset_password_success` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "reset_password_success" |
| `view:edit` | view | green | yes | static-ruby | card-mod-account.ts registers view "edit" |
| `view:edit_buttons` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "edit_buttons" |
| `event:signin` | event | named-remainder | no | - | no event "signin" registration in card-mod-account.ts |
| `event:signin_success` | event | named-remainder | no | - | no event "signin_success" registration in card-mod-account.ts |
| `event:signout` | event | named-remainder | no | - | no event "signout" registration in card-mod-account.ts |
| `event:send_reset_password_token` | event | named-remainder | no | - | no event "send_reset_password_token" registration in card-mod-account.ts |
| `view:link_with_checkbox` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "link_with_checkbox" |
| `view:configs` | view | registered-standing-net | yes | - | view "configs" registered (engine HTML_VIEWS + manifest) |
| `event:auto_approve_with_verification` | event | named-remainder | no | - | no event "auto_approve_with_verification" registration in card-mod-account.ts |
| `event:approve_with_verification` | event | named-remainder | no | - | no event "approve_with_verification" registration in card-mod-account.ts |
| `event:approve_without_verification` | event | named-remainder | no | - | no event "approve_without_verification" registration in card-mod-account.ts |
| `event:act_as_current_for_integrate_stage` | event | named-remainder | no | - | no event "act_as_current_for_integrate_stage" registration in card-mod-account.ts |
| `basket:basket[:non_createable_types] << :signup` | basket-op | named-remainder | no | - | no TS literal "basket[:non_createable_types] << :signup" (no consumer seam yet) |
| `view:new` | view | green | yes | static-ruby | card-mod-account.ts registers view "new" |
| `view:content_formgroups` | view | green | yes | static-ruby | card-mod-account.ts registers view "content_formgroups" |
| `view:new_buttons` | view | green | yes | static-ruby | card-mod-account.ts registers view "new_buttons" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:setup` | view | green | yes | static-ruby | card-mod-account.ts registers view "setup" |
| `event:check_setup` | event | named-remainder | no | - | no event "check_setup" registration in card-mod-account.ts |
| `event:setup_first_user` | event | named-remainder | no | - | no event "setup_first_user" registration in card-mod-account.ts |
| `event:signin_after_setup` | event | named-remainder | no | - | no event "signin_after_setup" registration in card-mod-account.ts |
| `basket:basket[:roles_for_first_user] = %i[help_desk shark administrator]` | basket-op | named-remainder | no | - | no TS literal "basket[:roles_for_first_user] = %i[help_desk shark administrator]" (no consumer seam yet) |
| `basket:basket[:roles_for_first_user].map(&:cardname).each do |role|` | basket-op | named-remainder | no | - | no TS literal "basket[:roles_for_first_user].map(&:cardname).each do \|role\|" (no consumer seam yet) |
| `event:update_role_cache` | event | named-remainder | no | - | no event "update_role_cache" registration in card-mod-account.ts |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-account.ts registers view "raw" |
| `seed:role` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:members` | seed | named-remainder | no | - | no TS registration naming "members" |
| `seed:anyone` | seed | named-remainder | no | - | no TS registration naming "anyone" |
| `seed:anyone_signed_in` | seed | named-remainder | no | - | no TS registration naming "anyone_signed_in" |
| `seed:administrator` | seed | named-remainder | no | - | no TS registration naming "administrator" |
| `seed:eagle` | seed | named-remainder | no | - | no TS registration naming "eagle" |
| `seed:shark` | seed | named-remainder | no | - | no TS registration naming "shark" |
| `seed:help_desk` | seed | named-remainder | no | - | no TS registration naming "help_desk" |
| `seed:anonymous` | seed | named-remainder | no | - | no TS registration naming "anonymous" |
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
| `seed:signin` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-layout.ts |
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
