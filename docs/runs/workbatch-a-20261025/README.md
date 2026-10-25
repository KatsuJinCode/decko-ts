# workbatch-a: eight register rows, seven closed and one named, at the canonical tip

Lane: `port/workbatch-a-20261025` in the exclusive lane checkout
`C:/localProjects/decko-ts-workbatch-a-20261025`, made through the sanctioned
worktree admission (create_worktree.py, lease 53acaee9f0b8) from the newest
pushed roll tip `deploy/full-candidate-20261101` at `c17906db`, read back
with `git ls-remote` before the checkout. Every commit is pushed forward-only
to origin (KatsuJinCode/decko-ts, private). Nothing deploys; the culturesmith
host was not touched.

The assignment: the completeness roster's eight working rows in the
register-routes and register-dsl families. For each: close it with
oracle-matched or named-instrument evidence and one commit with an explicit
pathspec, or name the exact mechanism that blocks it. Never a fake close.

## The base tree's state

The base carries the routes family's rounds three to ten and the dsl lane's
branch (both fully merged into the roll line), and the roll v22 candidate's
own receipt (docs/runs/full-candidate-v22-lanes-roll-2026-10-25.md) records
the canonical tree's failure set. Every evidence commit the eight roster
rows name is an ancestor of this lane's base and of this lane's final tip,
each decided with `git merge-base --is-ancestor` (exit 0): 82327dd9,
95e2672e, 3eccd5f7, 8c2f8a96, dc5e8780, 3ed35555, 8b7fabf5, e8d240bd,
38d498d6, cdf09aa6, ee812fdf.

## The rows

| Row | Disposition | Receipt |
| --- | --- | --- |
| reg-routes-A17 | CLOSED: the canonical-tree unblock is met; the six-file battery passes at the tip; the create/delete GET halves stay the recorded hardening divergence (the destructive class the 2026-10-24 ruling permits an exception for) | reg-routes-A17/RECEIPT.md |
| reg-routes-A22 | CLOSED: the canonical-tree unblock is met; the three-file battery passes at the tip; the may-create new-form arm stays named as row C10's dependency | reg-routes-A22/RECEIPT.md |
| reg-routes-A23 | CLOSED: the measured skip's guard passes at the tip over both committed captures | reg-routes-A23/RECEIPT.md |
| reg-routes-B6 | NAMED: the row's 13-test instrument passes, including the three legs that pin the edge gap, so the gap is still real; the exact mechanism, price and flip signal are named (the edge read path builds none of the refresh's collaborators; the wiring must pass the engine bundle's boot-safe budget guard) | reg-routes-B6/RECEIPT.md |
| reg-dsl-A10 | CLOSED: the dsl lane's landing (ee812fdf) is an ancestor of the tip and the bridge instrument's 10 pins pass there | reg-dsl-A10/RECEIPT.md |
| reg-dsl-A22 | CLOSED: the port reproduces clean.rb's attribute rebuild and stores Ruby's exact bytes wherever they pass the safety verifier; the withheld parity suite plus the public clean suites read 249 tests, 0 failed; the safety exception is the required one | reg-dsl-A22/RECEIPT.md |
| reg-dsl-B21 | CLOSED on the declared surface: decision record 0010 restores the declaration the 2026-10-07 docs set lost, repairs the dangling citation in src/cql/sql.ts, and the new pin test enforces the declared surface; literals are never inlined | reg-dsl-B21/RECEIPT.md |
| reg-dsl-B22 | CLOSED on the reproduced quirk: a bare null name value now renders the pinned broken `c0.key is ()`, the name-field Array.wrap collapse ported into the parser with its four oracle shapes pinned | reg-dsl-B22/RECEIPT.md |

## The lane's own landings

1. `35c4d554` dsl B22: the collapsed name-nil SQL reproduced
   (src/cql/parser.ts, tests/cql/sql-generation.test.ts, receipt).
2. `a91bf6ea` dsl B21: decision 0010, the sql.ts citation repair, the
   parity-surface pin (docs/decisions/0010-cql-sql-text-parity-surface.md,
   docs/decisions/README.md, src/cql/sql.ts,
   tests/cql/sql-text-parity-surface.test.ts, receipt).
3. `df10ddc2` dsl A10 receipt. 4. `67bd5600` dsl A22 receipt.
5. `9336a8ce` routes A17 receipt. 6. `295fd91a` routes A22 receipt.
7. `08b938a8` routes A23 receipt. 8. `62fbbf15` routes B6 named receipt.
9. This run doc and the lane inventory test
   (tests/server/workbatch-a-register-rows-inventory.test.ts), which pins
   the eight receipts, their instruments, and the edge seam's continued
   absence under deploy/.

## Verification run in this lane

Per row, at the tip, with the exact commands:

- A17: `npx vitest run tests/server/get-action-routes-parity.test.ts
  tests/deploy/bunny-edge-action-read-route.test.ts
  tests/deploy/staging-action-read-asset-endpoint.test.ts
  tests/deploy/bunny-edge-deprecated-asset-stub.test.ts
  tests/deploy/staging-deprecated-asset-stub-endpoint.test.ts` -> 5 files,
  36 tests, 0 failed; plus `npx vitest run
  tests/server/deprecated-asset-routes-parity.test.ts` -> 6 tests, 0 failed.
- A22: `npx vitest run tests/server/wildcard-bad-address-parity.test.ts
  tests/deploy/bunny-edge-bad-address-wildcard.test.ts
  tests/deploy/staging-bad-address-wildcard-endpoint.test.ts` -> 3 files,
  18 tests, 0 failed.
- A23: `npx vitest run tests/deploy/jasmine-mount-inertness.test.ts` ->
  5 tests, 0 failed.
- B6: `npx vitest run tests/server/setup-before-action-parity.test.ts` ->
  13 tests, 0 failed (the gap legs pass, so the gap is still real).
- dsl A10: `npx vitest run
  tests/card/render/nest-option-bridge-voo-parity.test.ts` -> 10 tests,
  0 failed.
- dsl A22: `npx vitest run tests/withheld/content-clean-extra.test.ts
  tests/card/actions/content-clean.test.ts
  tests/card/actions/content-clean-security.test.ts
  tests/card/actions/content-clean-spaces.test.ts
  tests/card/actions/content-clean-spaces-parity.test.ts` -> 5 files, 249
  tests, 0 failed.
- dsl B21 and B22: `npx vitest run tests/cql/` -> 19 files, 319 tests,
  0 failed (the two landed changes' own suites inside it), plus the pin
  file alone: 4 tests, 0 failed.
- The lane inventory test: `npx vitest run
  tests/server/workbatch-a-register-rows-inventory.test.ts` -> 10 tests,
  0 failed.

## The battery at the final commit

Run in this lane on the tree whose test content is the final commit's (the
run predates this paragraph and the inventory test only by documentation
bytes; no source or test file moved after it):

- `npx tsc --noEmit`: exit 0, zero output lines.
- `node tools/test-gates.mjs run correctness`: gate exit 1, the known set:
  1 test file failed of 766 (711 passed, 54 skipped), the file being
  tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts, the machine's
  own `decko-ts-lane-archives` depth-2 size floor, the same single failing
  file the v22 roll's receipt records for its base and merged trees; 1 test
  failed of 7589 (7361 passed, 227 skipped); the node:test leg reads 3
  files, 15 passed, 0 failed. The failure set is the v22 line's known set,
  file for file, and no failure is new.
- Bucketing note: the new tests/cql/sql-text-parity-surface.test.ts
  classifies into the parity gate (its name matches the harness's "parity"
  rule; cadence "at merge"), so the correctness run above counts only the
  new inventory file (+1 file, and +13 tests: the inventory's 10 plus the
  sql-generation net 3). The parity bucket runs at every candidate roll's
  merge gate, where the declared-surface pin is exercised.
- The two files this lane landed outside the correctness bucket were run
  directly: tests/cql/sql-text-parity-surface.test.ts (4 tests, 0 failed)
  and the withheld clean suite leg recorded under dsl A22 above.

## What this lane did not do

- Nothing deployed; no URL fetched; no live D1 write; the cs-edge database
  untouched; the culturesmith host untouched.
- The routes family's own receipts and the family count in
  docs/reports/routes-round10-2026-10-24.md were not edited; this lane's
  closures are recorded here and in the roster the fold owns.
- The roster itself
  (C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json)
  was not edited: its buckets are the fold's to move, and the fold reads
  these receipts.
