# card-mod-style — harness scorecard

Behaviors validated: **5 / 34** (standing-net: 21, named-remainder: 8, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 23 passed / 0 failed (tests/card/mod-loader/card-mod-style-harness-probe.test.ts, tests/card/mod-loader/card-mod-style.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:import` | view | named-remainder | no | - | no view "import" registration in card-mod-style.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:compiled` | view | named-remainder | no | - | no view "compiled" registration in card-mod-style.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:compressed` | view | named-remainder | no | - | no view "compressed" registration in card-mod-style.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:compiled` | view | named-remainder | no | - | no view "compiled" registration in card-mod-style.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:labeled` | view | registered-standing-net | yes | - | view "labeled" registered (engine HTML_VIEWS) |
| `view:box` | view | registered-standing-net | yes | - | view "box" registered (engine HTML_VIEWS) |
| `view:box_bottom` | view | registered-standing-net | yes | - | view "box_bottom" registered (engine HTML_VIEWS + manifest) |
| `view:customize_button` | view | registered-standing-net | yes | - | card-mod-style.ts registers view "customize_button" |
| `view:box_middle` | view | registered-standing-net | yes | - | view "box_middle" registered (engine HTML_VIEWS + manifest) |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:stylesheet_include_tag` | view | green | yes | static-ruby | card-mod-style.ts registers view "stylesheet_include_tag" |
| `view:remote_style_tags` | view | green | yes | static-ruby | card-mod-style.ts registers view "remote_style_tags" |
| `event:validate_css` | event | registered-standing-net | yes | - | card-mod-style.ts registers event "validate_css" |
| `basket:basket[:non_createable_types] << :local_style_folder_group` | basket-op | named-remainder | no | - | no TS literal "basket[:non_createable_types] << :local_style_folder_group" (no consumer seam yet) |
| `basket:basket[:non_createable_types] << :local_style_manifest_group` | basket-op | named-remainder | no | - | no TS literal "basket[:non_createable_types] << :local_style_manifest_group" (no consumer seam yet) |
| `event:validate_scss_syntax` | event | registered-standing-net | yes | - | card-mod-style.ts registers event "validate_scss_syntax" |
| `view:concat` | view | named-remainder | no | - | no view "concat" registration in card-mod-style.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `event:no_deletion_if_used` | event | registered-standing-net | yes | - | card-mod-style.ts registers event "no_deletion_if_used" |
| `view:stylesheet_include_tag` | view | green | yes | static-ruby | card-mod-style.ts registers view "stylesheet_include_tag" |
| `view:remote_include_tags` | view | green | yes | static-ruby | card-mod-style.ts registers view "remote_include_tags" |
| `view:stylesheet_path` | view | green | yes | static-ruby | card-mod-style.ts registers view "stylesheet_path" |
| `seed:style_mods` | seed | named-remainder | no | - | no TS registration naming "style_mods" |
| `seed:local_style_folder_group` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-style.ts |
| `seed:local_style_manifest_group` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-style.ts |
| `seed:css` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-style.ts |
| `seed:scss` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-bootstrap.ts |
| `seed:skin` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-style.ts |
| `seed:style` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `config:settings` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:cardtypes` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-carrierwave.ts |
| `config:de` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:en` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
