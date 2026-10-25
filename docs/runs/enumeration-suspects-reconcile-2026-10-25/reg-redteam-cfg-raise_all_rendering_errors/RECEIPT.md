# reg-redteam-cfg-raise_all_rendering_errors

- Roster row: family `register-redteam`, label `raise_all_rendering_errors
  config key`, verdict PORTED, bucket DONE.
- The row's sourceParent: `raise_all_rendering_errors (railtie config key)
  -> PORTED (missed)`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1095): `raise_all_rendering_errors |
  PORTED (missed) | src/card/render/format.ts:677-691 (loud_error? =
  focal? || raise_all_rendering_errors, railtie cite; TS default true
  documented)`.

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

The config key is read in ONE port file, with one serving-boot writer:

- `src/card/render/format.ts:697-733`. The key's doc comment (697-721)
  names the railtie line and spells the port's posture: the module default
  is TRUE (`let raiseAllRenderingErrors = true;` at line 722) for processes
  that never boot as a server, while the serving boot sets it FALSE the way
  Ruby production does. The setter `setRaiseAllRenderingErrors` (724-728)
  is the key's write seam; the getter `allRenderingErrorsRaise` (730-733)
  is error.rb:65-67's config half. The key's consumer is the loud-error
  predicate at format.ts:2266-2285 (`focal? || raise_all_rendering_errors`).
- WHO WRITES IT FALSE: `deploy/bunny-worker-src/bunny-edge-engine-entry.ts:101`
  (`setRaiseAllRenderingErrors(false)` at module scope, the serving truth)
  and the four reference-harness adapters
  (`reference-harness/adapters/ts/adapter.ts:107`, ts-composed:93,
  ts-mysql:98, ts-postgres:91), whose fixtures were captured with the
  config explicitly false.

The register's line cite (format.ts:677-691) has moved: the same constant,
setter and getter sit at 697-733 at this tree. The row's claim is
unchanged; the register's "TS default true documented" note is still true
and is now qualified by the serving-boot writer named above (the source's
own header comment, lines 707-716, records exactly this history).

## The original side, read and recorded

- The key's own assignment:
  `card-1.110.0/lib/cardio/railtie.rb:38`
  `config.raise_all_rendering_errors = false` (stock default), turned ON by
  the development and test environments
  (`card-1.110.0/config/environments/development.rb:39`,
  `card-1.110.0/config/environments/test.rb:61`) and by the decko carrier's
  cucumber environment (`decko-0.20.0/config/environments/cucumber.rb:40`).
- The key's reader: `card-1.110.0/lib/card/format/error.rb:66`
  (`focal? || Card.config.raise_all_rendering_errors`), the predicate the
  port's 2266-2285 block ports.

## The prior receipt for this row

None in the repo: the register B table (line 1095) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
