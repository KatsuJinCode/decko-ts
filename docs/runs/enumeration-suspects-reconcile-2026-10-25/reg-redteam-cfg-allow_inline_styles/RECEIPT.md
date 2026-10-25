# reg-redteam-cfg-allow_inline_styles

- Roster row: family `register-redteam`, label `allow_inline_styles config
  key`, verdict PORTED, bucket DONE.
- The row's sourceParent: `allow_inline_styles (railtie config key) ->
  PORTED (missed)`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1094): `allow_inline_styles | PORTED
  (missed) | src/card/actions/content-clean.ts:47-70
  (allowedTags(allowInlineStyles), the td/th/table arms)`.

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

The config key is read in ONE port file:

- `src/card/actions/content-clean.ts`. The key's port-side posture is
  stated at line 34 ("Configuration: allow_inline_styles and
  space_last_in_multispace are on"), the key becomes the allowlist
  builder's parameter at line 47 (`function allowedTags(allowInlineStyles:
  boolean)`), its two arms are lines 63-67 (the table/td/th style-carrying
  attributes) and lines 68-71 (`class` always, `style` when the key is on),
  and the module ships the key ON as its only configuration at line 77
  (`export const ALLOWED_TAGS = allowedTags(true);`). The cleaner runs on
  every save whose card has `clean_html?` true (header comment, lines 1-3).

The register's line cite (47-70) still covers the same code at this tree
(the arms now end at 71 and the pinned-on export at 77). The row's claim is
unchanged.

## The original side, read and recorded

- The key's own assignment:
  `card-1.110.0/lib/cardio/railtie.rb:11`
  `config.allow_inline_styles = true` (with the railtie's own comment:
  disabling it breaks TinyMCE's formatting options).
- The key's reader:
  `card-1.110.0/lib/card/content/clean.rb:21` (the per-tag attribute table
  gains the style attribute when the key is on) and `:29` (`style` pushed
  onto every allowed tag's attribute list when the key is on).
- The port's pinned-on posture matches the pinned assignment's value
  (true), the same match the register's A22 row recorded for the cleaner
  itself.

## The prior receipt for this row

None in the repo: the register B table (line 1094) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
