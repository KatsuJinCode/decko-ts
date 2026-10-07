# Known failures

Tests that fail on a clean checkout, and why. A red run should never be
mistaken for a broken release, and a failing test should never be quietly
ignored. **If you fix one of these, delete its entry in the same change.**

---

## Measurement

Measured 2026-10-07 on a fresh clone of this release (`npm ci`, then
`npm test`, which runs the `tests/card/` suite), with no external data:

```
Test Files  15 failed | 389 passed | 51 skipped (455)
Tests       23 failed | 3792 passed | 4 expected fail | 239 skipped (4058)
```

The run ends with a "Not run" list naming every suite or test that skipped
because its data is not in this checkout (124 entries).

---

## 1. Shared global view state (13 files, order-dependent)

- `tests/card/mod-loader/mod-registration.test.ts`
- `tests/card/mod-loader/card-mod-{ace-editor-input,comment,content,edit-forms,edit-views,follow-views,format-toggle-raises,layout,list,permissions,rules}.test.ts`
- `tests/card/content/mod-object-address-shape-parity.test.ts`

**Symptom:** a baseline assertion such as "this view is not registered before
the mod loads" fails with `expected true to be false`, or a view that should be
unsupported without its mod renders instead of raising.

**Cause:** the mod loader registers views into a process-global table. When
another suite in the same worker has already loaded the mod, the view is
present before the asserting suite looks. Each suite passes when run on its
own.

**Fix:** reset the global view table between suites. Do not delete the
baseline assertions: they check that a view really comes from its mod.

## 2. Query-count pins that predate the request-speed work (2 files)

- `tests/card/rules/structure-templates.test.ts`: pins 25 statements for a
  cold structured render; the engine now issues 29.
- `tests/card/render/deep-nesting-fixture-sweep.test.ts`: pins 45 round trips
  for a rejected over-deep chain; the engine now pays 53.

**Cause:** these tests pin exact statement and round-trip counts. The
request-speed changes in this release changed how rows are batched, and the
pinned numbers were not re-measured. Both fail identically at the development
commit this release was built from; the output bytes are not in question,
only the counts.

**Fix:** re-derive each count from the statement log and update the pin with
its new composition, or loosen the pin to the property it guards (bounded and
depth-independent cost).

---

## What this file is not

It is not a list of things that may fail forever. Every entry is either a
harness problem to fix or a pin to re-measure.
