# card-mod-tinymce_editor — harness scorecard

Behaviors validated: **7 / 16** (standing-net: 9, named-remainder: 0, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 42 passed / 0 failed (tests/card/mod-loader/card-mod-tinymce_editor.test.ts, tests/card/mod-loader/card-mod-tinymce-editor-views.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:link_editor` | view | registered-standing-net | yes | - | card-mod-tinymce_editor.ts registers view "link_editor" |
| `view:modal_link_editor` | view | registered-standing-net | yes | - | card-mod-tinymce_editor.ts registers view "modal_link_editor" |
| `view:nest_editor` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "nest_editor" |
| `view:modal_nest_editor` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "modal_nest_editor" |
| `view:nest_content` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "nest_content" |
| `view:nest_image` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "nest_image" |
| `view:modal_nest_image` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "modal_nest_image" |
| `view:new_image` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "new_image" |
| `view:new_image_buttons` | view | green | yes | static-ruby | card-mod-tinymce_editor.ts registers view "new_image_buttons" |
| `view:change_create_to_update` | view | registered-standing-net | yes | - | card-mod-tinymce_editor.ts registers view "change_create_to_update" |
| `view:open_nest_editor` | view | registered-standing-net | yes | - | card-mod-tinymce_editor.ts registers view "open_nest_editor" |
| `basket:basket[:script_calls]["setTinyMCEConfig"] = :tinymce_config` | basket-op | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-script.ts |
| `basket:basket[:list_input_options] << "tinymce editor"` | basket-op | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:tiny_mce` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-tinymce_editor.ts |
| `config:configurations` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-ace_editor.ts |
| `config:en` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
