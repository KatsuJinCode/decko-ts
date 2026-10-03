# card-mod-follow — harness scorecard

Behaviors validated: **4 / 96** (standing-net: 57, named-remainder: 35, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 34 passed / 0 failed (tests/card/mod-loader/card-mod-follow-harness-probe.test.ts, tests/card/mod-loader/card-mod-follow.test.ts, tests/card/mod-loader/card-mod-follow-views.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:follow_status` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "follow_status" |
| `view:follow_button` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "follow_button" |
| `event:cache_expired_for_type_change` | event | named-remainder | no | - | no event "cache_expired_for_type_change" registration in card-mod-follow.ts |
| `event:expire_preferences_cache` | event | named-remainder | no | - | no event "expire_preferences_cache" registration in card-mod-follow.ts |
| `event:silence_notifications` | event | named-remainder | no | - | no event "silence_notifications" registration in card-mod-follow.ts |
| `event:notify_followers_after_save` | event | named-remainder | no | - | no event "notify_followers_after_save" registration in card-mod-follow.ts |
| `event:stash_followers` | event | named-remainder | no | - | no event "stash_followers" registration in card-mod-follow.ts |
| `event:notify_followers_after_delete` | event | named-remainder | no | - | no event "notify_followers_after_delete" registration in card-mod-follow.ts |
| `view:list_of_changes` | view | registered-standing-net | yes | - | view "list_of_changes" registered (engine HTML_VIEWS) |
| `view:subedits` | view | registered-standing-net | yes | - | view "subedits" registered (engine HTML_VIEWS) |
| `view:subedit_notice` | view | green | yes | static-ruby | card-mod-follow.ts registers view "subedit_notice" |
| `view:followed` | view | registered-standing-net | yes | - | view "followed" registered (engine HTML_VIEWS) |
| `view:follower` | view | green | yes | static-ruby | card-mod-follow.ts registers view "follower" |
| `view:last_action_verb` | view | registered-standing-net | yes | - | view "last_action_verb" registered (engine HTML_VIEWS + manifest) |
| `view:unfollow_url` | view | registered-standing-net | yes | - | view "unfollow_url" registered (engine HTML_VIEWS) |
| `view:follow_status` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "follow_status" |
| `view:follow_item` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "follow_item" |
| `event:cache_expired_for_new_preference` | event | named-remainder | no | - | no event "cache_expired_for_new_preference" registration in card-mod-follow.ts |
| `event:follow_fields_changed` | event | named-remainder | no | - | no event "follow_fields_changed" registration in card-mod-follow.ts |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:status` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "status" |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "one_line_content" |
| `view:rule_editor` | view | green | yes | static-ruby | card-mod-follow.ts registers view "rule_editor" |
| `view:edit_buttons` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "edit_buttons" |
| `view:confirm_update_all` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "confirm_update_all" |
| `event:update_follow_rules` | event | named-remainder | no | - | no event "update_follow_rules" registration in card-mod-follow.ts |
| `event:cache_expired_for_new_set` | event | named-remainder | no | - | no event "cache_expired_for_new_set" registration in card-mod-follow.ts |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "one_line_content" |
| `view:edit` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "edit" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:follow_tab` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "follow_tab" |
| `view:ignore_tab` | view | registered-standing-net | yes | - | card-mod-follow.ts registers view "ignore_tab" |
| `view:errors` | view | green | yes | static-ruby | card-mod-follow.ts registers view "errors" |
| `seed:notification_template` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/core-admin-runtime.ts |
| `seed:follow` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:following` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:followers` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:follow_fields` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:always` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:never` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:follow_defaults` | seed | named-remainder | no | - | no TS registration naming "follow_defaults" |
| `seed:follow_suggestions` | seed | named-remainder | no | - | no TS registration naming "follow_suggestions" |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:contextual_class` | seed | named-remainder | no | - | no TS registration naming "contextual_class" |
| `seed:message` | seed | named-remainder | no | - | no TS registration naming "message" |
| `seed:disappear` | seed | named-remainder | no | - | no TS registration naming "disappear" |
| `seed:follower_notification_email` | seed | named-remainder | no | - | no TS registration naming "follower_notification_email" |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:John` | seed | named-remainder | no | - | no TS registration naming "John" |
| `seed:Sara` | seed | named-remainder | no | - | no TS registration naming "Sara" |
| `seed:Big Brother` | seed | named-remainder | no | - | no TS registration naming "Big Brother" |
| `seed:Optic fan` | seed | named-remainder | no | - | no TS registration naming "Optic fan" |
| `seed:Sunglasses fan` | seed | named-remainder | no | - | no TS registration naming "Sunglasses fan" |
| `seed:Narcissist` | seed | named-remainder | no | - | no TS registration naming "Narcissist" |
| `seed:card with fields` | seed | named-remainder | no | - | no TS registration naming "card with fields" |
| `seed:card with fields and admin fields` | seed | named-remainder | no | - | no TS registration naming "card with fields and admin fields" |
| `seed:admin card with fields and admin fields` | seed | named-remainder | no | - | no TS registration naming "admin card with fields and admin fields" |
| `seed:admin card with admin fields` | seed | named-remainder | no | - | no TS registration naming "admin card with admin fields" |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:Optic` | seed | named-remainder | no | - | no TS registration naming "Optic" |
| `seed:All Eyes On Me` | seed | named-remainder | no | - | no TS registration naming "All Eyes On Me" |
| `seed:No One Sees Me` | seed | named-remainder | no | - | no TS registration naming "No One Sees Me" |
| `seed:Look At Me` | seed | named-remainder | no | - | no TS registration naming "Look At Me" |
| `seed:Sara Following` | seed | named-remainder | no | - | no TS registration naming "Sara Following" |
| `seed:John Following` | seed | named-remainder | no | - | no TS registration naming "John Following" |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:Sunglasses` | seed | named-remainder | no | - | no TS registration naming "Sunglasses" |
| `seed:Google glass` | seed | named-remainder | no | - | no TS registration naming "Google glass" |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:Created card` | seed | named-remainder | no | - | no TS registration naming "Created card" |
| `config:settings` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:cardtypes` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-carrierwave.ts |
