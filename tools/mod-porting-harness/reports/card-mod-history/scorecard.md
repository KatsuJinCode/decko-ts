# card-mod-history — harness scorecard

Behaviors validated: **1 / 26** (standing-net: 21, named-remainder: 4, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 59 passed / 0 failed (the card-mod-history-harness-probe suite (not in the public package), tests/card/mod-loader/card-mod-history.test.ts, the card-mod-history-views suite (not in the public package))

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `event:update_ancestor_timestamps` | event | registered-standing-net | yes | - | card-mod-history.ts registers event "update_ancestor_timestamps" |
| `event:assign_action` | event | registered-standing-net | yes | - | card-mod-history.ts registers event "assign_action" |
| `event:detect_conflict` | event | registered-standing-net | yes | - | card-mod-history.ts registers event "detect_conflict" |
| `event:finalize_action` | event | registered-standing-net | yes | - | card-mod-history.ts registers event "finalize_action" |
| `event:rollback_actions` | event | registered-standing-net | yes | - | card-mod-history.ts registers event "rollback_actions" |
| `event:finalize_act` | event | registered-standing-net | yes | - | card-mod-history.ts registers event "finalize_act" |
| `view:history` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "history" |
| `view:actions` | view | named-remainder | no | - | no view "actions" registration in card-mod-history.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:history` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "history" |
| `view:act` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "act" |
| `view:act_legend` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "act_legend" |
| `view:draft_legend` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "draft_legend" |
| `view:action_summary` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "action_summary" |
| `view:action_expanded` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "action_expanded" |
| `view:change` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "change" |
| `view:last_action` | view | registered-standing-net | yes | - | card-mod-history.ts registers view "last_action" |
| `view:last_action_verb` | view | registered-standing-net | yes | - | view "last_action_verb" registered (engine HTML_VIEWS + manifest) |
| `view:creator_credit` | view | registered-standing-net | yes | - | view "creator_credit" registered (engine HTML_VIEWS) |
| `view:updated_by` | view | registered-standing-net | yes | - | view "updated_by" registered (engine HTML_VIEWS) |
| `view:board_act` | view | green | yes | static-ruby | card-mod-history.ts registers view "board_act" |
| `seed:First` | seed | named-remainder | no | - | no TS registration naming "First" |
| `seed:First` | seed | named-remainder | no | - | no TS registration naming "First" |
| `seed:First` | seed | named-remainder | no | - | no TS registration naming "First" |
| `config:views` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:de` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:en` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
