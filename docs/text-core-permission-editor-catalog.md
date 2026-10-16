# Text core and permission editor catalog repairs

The stock Ruby source establishes both missing paths:

- card-mod-format0.20.0 set/all/text.rb:22-25 declares TextFormat core as
  `to_text super()`. The manifest omitted it even though format dispatch existed.
  d98941bd registers it, makes superView follow the current format, and restores
  EmailTextFormat < TextFormat from card-mod-email's actual class declaration.
- card-mod-permissions0.20.0 set/abstract/permission.rb:64-68 deliberately queries
  all Role cards under Auth.as_bot, sorted by name. b690e52a prepares the catalog
  for permission/editor requests rather than requiring loader.installInto's boot
  warm. Concrete engines always supply their own freshly queried roles/options;
  a different concrete engine never reads the legacy explicit stub-warm catalog.

The real role query selects full rows in one batch and composes them through the
existing host ladder, including junction names. It does not perform a fetchById
loop for each role. A52-role fixture takes at most2roundtrips/3statements including
bounded type metadata resolution. Unrelated plain inputs do not prepare roles.
The stock Bot query is limited to the form catalog: form read/update gates remain
in place; the denied-form control renders no role names or checkboxes.

## Measured checks

Six text tests cover plain/email text inheritance, unchanged HTML, actual parent
core override, content nesting, and denied text. Eight live-role tests cover
no-install composition, selection/Individuals consumption, separate engines,
added/renamed/trashed roles, Bot enumeration of a private role, junction names,
unrelated input, denied forms and bounded catalog composition. Together with
permission/rule regressions, five suites pass66tests; typecheck passes. The
super/format/census suites previously passed31tests after recording the new stock
text registration. New tests initially reproduced text/email markup leakage;
the original clean canonical capture separately reproduces all six empty Groups.

Clean d98941bd capture proves358 matches Ruby33 raw and the nine preceding HTML4
repairs remain equal. Clean b690e52a recapture selects16operations: those ten are
raw-equal, and six permission editor renders455/461/466/469/470/471 are equal using
only the preexisting N1 random slot-ID attribute mask. Full approved normalization
also agrees; no normalizer, canonical input or Ruby record changed. The capture
completed in2.981seconds with20ms/op in runner metadata. This filtered proof is
not a full synthetic grade, actual browser journey or deployed acceptance.

Raw captures, original expected/actual HTML excerpts, comparison producer/result,
clean-source runner metadata and source/reference hashes are preserved outside
the worktree under the private release evidence directory
merge-review-worktree-preservation/cf-local/text-core-permission-groups-b690e52a/.
Its preservation.json SHA256 is b49a0d25e42adfd73e61568f68df5d5147394aabf35f622c19e6a5c6cf4f68cc.

Gateway research was consulted before source changes, but its generic suggestion
to decode before strip_tags contradicted the actual installed Ruby method.
The implementation follows `HTMLEntities.new.decode strip_tags(html).to_s` and
actual captured outputs. The public Decko Auth::Proxy documentation corroborates
Bot context; the installed permission.rb is authoritative for this exact query.

Reproduce the focused capture with the standard TS adapter and canonical fixture,
using this filter (a selected capture is deliberately not accepted as fullgrade):

```powershell
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json --fixture reference-harness/fixtures/synthetic-v3-mod-probes-ruby33 --out .runtime/text-role-local --kinds render --filter '^probe-view:(209|232|233|238|313|316|358|423|433|455|461|466|469|470|471|510):'
```

The existing CF provider's six HTML parser dependency paths now back root's
read-only new-module junctions. They remain protected active dependencies and
must not be removed or replaced during future evidence runs.
