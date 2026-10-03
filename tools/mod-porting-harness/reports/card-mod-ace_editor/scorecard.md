# card-mod-ace_editor — harness scorecard

Behaviors validated: **0 / 4** (standing-net: 4, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 10 passed / 0 failed (tests/card/mod-loader/card-mod-ace_editor.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `basket:basket[:list_input_options] << "ace editor"` | basket-op | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-ace_editor.ts |
| `basket:basket[:script_calls]["setAceConfig"] = :ace_config` | basket-op | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-ace_editor.ts |
| `seed:ace` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/core-admin-runtime.ts |
| `config:configurations` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-ace_editor.ts |
