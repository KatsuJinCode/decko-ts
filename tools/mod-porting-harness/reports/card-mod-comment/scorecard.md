# card-mod-comment — harness scorecard

Behaviors validated: **1 / 9** (standing-net: 8, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 30 passed / 0 failed (tests/card/mod-loader/card-mod-comment-harness-probe.test.ts, tests/card/mod-loader/card-mod-comment.test.ts, tests/card/mod-loader/card-mod-comment-save-event.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:comment_box` | view | registered-standing-net | yes | - | card-mod-comment.ts registers view "comment_box" |
| `event:add_comment` | event | green | yes | static-ruby | card-mod-comment.ts registers event "add_comment" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:input` | view | registered-standing-net | yes | - | card-mod-comment.ts registers view "input" |
| `view:open` | view | registered-standing-net | yes | - | view "open" registered (engine HTML_VIEWS + manifest) |
| `view:open_content` | view | registered-standing-net | yes | - | view "open_content" registered (engine HTML_VIEWS + manifest) |
| `view:titled` | view | registered-standing-net | yes | - | view "titled" registered (engine HTML_VIEWS + manifest) |
| `view:titled_content` | view | registered-standing-net | yes | - | view "titled_content" registered (engine HTML_VIEWS + manifest) |
| `seed:discussion` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-comment.ts |
