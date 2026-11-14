# Skin save lifecycle corrections

The existing `write-battery-v1` Ruby trace places generated SCSS field
validation after `copy_theme` and before the skin's `set_content`. TypeScript
instead stored the skin first and validated the fields while storing them.
It also implemented “Use as current” by updating `*all+*style` directly,
skipping the skin's own unchanged save and finalize phase.

Create validation now produces prepared attributes that storage reuses.
New posted descendants validate before their parent stores; fields generated
by `copy_theme` validate after their generating prepare-to-store event and
before the parent store body. Each validator executes once. A rejected child
prevents the parent store body from executing, rather than depending solely
on a later transaction rollback to undo it.

`useAsCurrentSkin` runs the skin's own unchanged update through storage and
finalization, then updates the rule using the same `ActWriter` and transaction.
The skin owns the single act, has no action of its own, and finalizes before
the rule stores. The route invokes this operation instead of its old shortcut.
Its post-commit integration is queued before the nested rule's integration.

Validation on 2026-10-15, existing shared release-lead checkout:

```
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/card/actions/save-lifecycle-order.test.ts tests/card/actions/style-asset-events-save-path.test.ts --maxWorkers 1
node node_modules/vitest/vitest.mjs run tests/tools/side-effects-scenario-battery.test.ts --maxWorkers 1
node tools/test-gates.mjs check
git diff --check -- src/card/actions/card-action-engine.ts src/server/write-routes.ts tests/card/actions/save-lifecycle-order.test.ts tests/card/actions/style-asset-events-save-path.test.ts
```

The two child-phase controls first failed in 2.14s: a child's real validation
body could already query the stored parent. After the repair, all six focused
tests passed in 3.42s. They check phase order, single validation, rejection
before parent storage, one act with the skin as act card, no skin action, and
a real LibSass-generated stylesheet containing `body{color:red}`.

The unchanged 87-step battery passed in 25.10s (20.423s test execution):
**80 pass / 7 previously declared differences / 0 mismatches**. Neither
fixtures, comparison rules nor normalizations changed. Its committed Ruby
trace SHA256 remains
`f194712c1faef03211cbca08264bc4cb151841b770e6b022ead74108b80c0efd`.
TypeScript and whitespace checks passed; all 742 test files classified.

No new Ruby process or worktree was created. The previous event-order
checkout was found missing despite its custody record; evidence was retained
in the private process repository, without attributing the disappearance.

These are the two measured lifecycle repairs, not a claim of complete mod
callback coverage. Existing-card update subtrees retain their existing
validation path. The independent canonical mod capture remains held at
100/115, and actual browser acceptance is separate from these local checks.
