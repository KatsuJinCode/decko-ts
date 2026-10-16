# Callback applicability belongs to the target's invocation

Checked on lead `ef84203962ac10de232620e21167271331550ce2`, 2026-10-15.
The dispatcher flattened relative callbacks into independently gated stage
entries. Consequently `validate_key` ran on an unchanged-name update even
though its `validate_name` target (changed: name) did not run.
`rename_in_trash` similarly escaped `expire_old_name`'s changed-name gate.

Stock `card-1.110.0/lib/card/set/event/callbacks.rb:14-19` attaches the
callback to the target with `set_callback … prepend: true`. The target's
method encloses `run_callbacks` in its integration rescue
(`lib/card/set/event.rb:147-157`). Its stage applicability therefore gates
the whole invocation, including its before/after callbacks.

The dispatcher now traverses that callback tree only from applicable stage
targets. A skipped target reports descendants as `parent-skipped` without
evaluating their conditions or invoking their bodies. Each applicable
callback still evaluates its own gates. Before callbacks run in reverse
registration order; after callbacks run in registration order. Nested
callbacks remain inside their target's invocation and failure handling.

The graph check rejects cycles and unknown target names even without a
stage root, using iterative traversal rather than recursive graph expansion.
`select_action`, `show_page` and `act` are explicit valid external chains
defined by stock `Card` (`lib/card.rb:181`), not orphan save events. The
composed default registry has 162 entries, no duplicate names, and two
external-target declarations (`save_current_location` and
`select_file_revision`). When disjoint sets define the same event name,
callbacks attach once to the applicable definition. Multiple simultaneously
applicable definitions fail loudly: Ruby module precedence for that case is
not established here. This limitation is preferable to firing both bodies.

A small installed-Ruby ActiveSupport control (absolute Ruby33 executable,
no Decko/Rails boot, 7.94s) independently returned:

```
["second", "first", "target", "after_first", "after_second"]
["second", "first", "target", "after_first", "after_second", "rescued:callback failed"]
```

This corrects an earlier unit test's mistaken claim that a relative callback
could not be caught by its enclosing integration target. The relative
method has no rescue of its own; the surrounding target does.

Validation commands in `C:/localProjects/decko-ts-event-order-repair`:

```
C:/Ruby33-x64/bin/ruby.exe tmp/callback-chain-control.rb
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/card/mod-loader/mod-event-dispatch.test.ts tests/card/mod-loader/card-mod-account-events.test.ts tests/card/mod-loader/card-mod-carrierwave-events.test.ts tests/card/mod-loader/card-mod-recaptcha-validate-event.test.ts --maxWorkers 1
node tools/parity-side-effects/build-changed.mjs
node tools/parity-side-effects/ts-drive.mjs reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 tmp/side-effects-battery-after/ts-work
node tools/parity-side-effects/compare.mjs reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json tmp/side-effects-battery-after/ts.json tmp/side-effects-battery-after/compare-report.json
node tools/test-gates.mjs check
git diff --check
```

The driver stdout was saved as `tmp/side-effects-battery-after/ts.json`.
The initial 65 focused tests passed in 8.15s. After the graph audit, 70
focused tests passed in 5.77s; TypeScript passed again. Whitespace checks
passed; all 734 test files classified. Tests include negative controls for
all seven parent gates, nested callback order and a failed before callback
preventing the target and later callbacks.

The existing 87-step battery improved from **75 pass / 7 declared / 5 open**
to **78 pass / 7 declared / 2 open**. Only the three SCSS update event-order
failures were removed; no non-event mismatch appeared. Deterministic event
order agrees on 79/81 steps. The battery remains red: `admin-create-skin`
needs subtree validation before parent storage, and `admin-use-skin` needs
the skin's own no-op save/finalize before updating the style rule. Neither
expectations nor normalizations were changed. Missing named virtual asset
callbacks remain a coverage gap; shared-event order is not full event
execution parity.

Evidence SHA256:

| Artifact | SHA256 |
| --- | --- |
| Committed Ruby trace | `f194712c1faef03211cbca08264bc4cb151841b770e6b022ead74108b80c0efd` |
| Before TS trace | `c88f366f5324d9e485b0c8fc5f4faad38938a6de77993b60b8258d7d0f3f2944` |
| Before comparison | `e71049e1bcfab7610aedb1c69ac0d95a1d67af847ef016a13919f201330b837c` |
| After TS trace | `beb11689778b886366652991f3e555d5f21c28130e612ed03f57dda932c0f7f0` |
| After comparison | `5e3615f3ffa6f9b7377a9c6c49c005aaf41b050899a2c65fa0e3446bcc0414ce` |
