# reg-redteam-cfg-allow_irreversible_admin_tasks

- Roster row: family `register-redteam`, label `allow_irreversible_admin_tasks
  config key`, verdict PORTED, bucket DONE.
- The row's sourceParent: `allow_irreversible_admin_tasks (railtie config
  key) -> PORTED (missed)`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1098): `allow_irreversible_admin_tasks
  | PORTED (missed) | src/card/mod-loader/mods/core-mod.ts /
  core-admin-runtime.ts references`.

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

The config key is read in TWO port files:

- `src/card/mod-loader/mods/core-admin-runtime.ts`: the key's port-side
  seat. The interface field `allowIrreversibleAdminTasks` (lines 72-73, doc
  naming `Cardio.config.allow_irreversible_admin_tasks (self/admin.rb:55)`)
  with the engine default FALSE at line 78 (the header comment at 37-38
  records the probe that pinned the default:
  `config_allow_irreversible_admin_tasks: false`); the reader
  `adminRuntimeConfig()` (lines 86-87) and the deck-boot/test write seam
  `setAdminRuntimeConfig` (lines 91-96).
- `src/card/mod-loader/mods/core-mod.ts`: the key's consumers. The admin
  task's disabled message names the key (line 1385, "You can enable it with
  the config option 'allow_irreversible_admin_tasks'"), the Ruby
  predicate's port `irreversiblesTasksAllowed` reads the engine config
  (lines 1389-1391, `self/admin.rb:54-56 irreversibles_tasks_allowed?`),
  and the task gate applies it at lines 1408-1416 (an irreversible task
  without the key raises instead of running).

The register's file cite (`core-mod.ts / core-admin-runtime.ts`) is exact.
The row's claim is unchanged.

## The original side, read and recorded

- The key's own assignment:
  `card-1.110.0/lib/cardio/railtie.rb:37`
  `config.allow_irreversible_admin_tasks = false`.
- The key's readers: `card-1.110.0/mod/core/set/self/admin.rb:51` (the
  task's own disabled message, which the port's line 1385 mirrors) and
  `card-1.110.0/mod/core/set/self/admin.rb:55`
  (`Cardio.config.allow_irreversible_admin_tasks`, the predicate).

## The prior receipt for this row

None in the repo: the register B table (line 1098) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
