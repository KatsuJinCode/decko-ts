# admin-compose — the core-mod composition line (lane receipt)

Lane `lane-admincompose` (worktree `REPO_ROOT/`).
Carries the composition that docs/admin-surface.md's merge note scoped: the
core mod manifest, landed by lane-admin for its admin surface, wired into the
composed default deck. Base for every number below: **pristine pass13-int
d6b1957**, run in this same worktree before the edit.

## The change

`src/card/mod-loader/default-mod-deck.ts`, 2 insertions, nothing else in src:

- line 42: `import coreMod from "./mods/core-mod.js";`
- line 123: `core: coreMod,` — first MANIFESTS entry (core is
  ORACLE_BUNDLE_ORDER index 0, so `portedBundleOrder()` picks it up first,
  exactly as the admin-surface.md merge note predicted).

Comments and test pins that the line falsifies are NOT touched here —
see "Falsified statements" below.

## Lineage — the merge step was already contained

The named merge step (fold the admin-surface branch work, 69115a3, first)
could not run as a command (the merge tooling gates `git merge` without
operator scope) and is provably a no-op:

- `git merge-base --is-ancestor 69115a3 HEAD` → exit 0 ("IS ancestor");
  `git merge-base HEAD 69115a3` → `69115a3` itself.
- lane-admin entered this lineage at b79e0bf "Merge branch 'lane-admin' into
  pass13-int"; pass13-int tip d6b1957 carried it forward.
- Tree identity: `git rev-parse HEAD^{tree}` == `git rev-parse
  pass13-int^{tree}` == `05bb3e2aa2583957f154f8e50b558011a20309e4` — the
  branch starts byte-identical to pass13-int, so the baseline runs below ARE
  the pristine pass13-int numbers.

## Gates (run to completion this session)

- `npx tsc --noEmit` → EXIT=0.
- `node scripts/check-scoped.mjs` → "[check-scoped] tsc: 0 active error(s),
  0 suppressed (strict=false, quiet=30s, running=[])" then "[check-scoped]
  PASS", EXIT=0. (A first attempt was cut off by a session restart and is
  discarded; the PASS above is the completed re-run.)

## Suites: base (pristine pass13-int) vs lane (composition line)

Commands (both sides, in this worktree):
`npx vitest run tests/card/ --reporter=default --reporter=json
--outputFile.json=<report>` and the same for `tests/card/render/`.
Failure sets extracted from the JSON reports with
`tmp/lane-admincompose-suite-runs/failure-set-from-vitest-json.mjs` (failed
fullNames + whole-file collection failures).

| suite | base | lane | diff |
|---|---|---|---|
| tests/card/ (full) | 2492 total, 2371P, 90F, 31 skip | 2492 total, 2369P, 92F, 31 skip | NEW=2, FIXED=0 |
| tests/card/render/ | 489 total, 461P, 28F | 489 total, 461P, 28F | failure sets byte-IDENTICAL |

The 90 pre-existing base failures are unchanged on the lane (the full-set
diff is additions only).

## Every flip, named with its mechanism

Both flips are in `tests/card/mod-loader/default-mod-deck.test.ts` and share
one mechanism: a hand-written pre-composition count pin meeting the 31-entry
deck. Neither is a registration failure — the deck with core loads, resolves,
and dispatches (the sibling tests that exercise loading all pass; see below).

1. `default-mod-deck: oracle bundle order > restricts to exactly the 30
   ported mods, preserving capture order` — line 58:
   `expect(order).toHaveLength(30)` where `order = portedBundleOrder()`; the
   assertion failed with `expected [ 'core', 'collection', …(29) ] to have a
   length of 30 but got 31`. Mechanism: with `core: coreMod` in MANIFESTS,
   ORACLE_BUNDLE_ORDER index 0 passes the MANIFESTS filter, so the ported
   list grows 30 → 31 with core first — the intended change in a hand-written
   pin. (The test's later assertions — the head slice and the unaccounted-name
   list — sit behind this pin and are now also stale; see Falsified
   statements.)
2. `default-mod-deck: one loader, oracle order, live registrations > resolves
   the full order and loads every manifest` — line 93:
   `expect(sources).toHaveLength(30)`; failed with `expected
   [ { manifest: { …(5) } }, …(30) ] to have a length of 30 but got 31`.
   Mechanism: `defaultDeckSources()` maps the 31-entry MANIFESTS. The test
   aborted at this pin before its loader block; loading is proven by the
   sibling tests that passed on the lane: "is idempotent" (constructs
   ModLoader(defaultDeckSources()), resolves, loads twice, reports equal),
   ":count dispatches to the search-family registration…" (runs
   `defaultDeckLoader()` and walks the chain), and "binds the loader + both
   registries" (the deck-boot seam).

`mod-load-order.test.ts` — the file admin-surface.md warned "asserts deck
shape" — did NOT flip: it builds its own ModSources from
fixtures/captured/help-mod-loader.json and never imports the composed deck.
The two other `defaultDeckLoader()` consumers (card-mod-cwwrite-output-seam,
layout-template-nest-mode) show no new failures.

## Positive proof of the intended change (not just absence of breakage)

Probe: `npx vitest run
tmp/lane-admincompose-suite-runs/composed-deck-registration-proof.test.ts`
→ 1 passed, printing:

- `defaultDeckSources().length` = 31
- `report.modNames[0]` = "core", `modNames.length` = 31
- `registeredViews` contains "warning" AND "roles" — view names unique to
  the core manifest's admin surface; the seed layer carries no admin surface
  (core-mod.ts header), so their presence proves the composed deck itself
  now registers the admin views deck-wide
- `registeredEvents.length` = 64 (the deck-wide total including core's 31
  declarations), `contentOverrideRegistry().size()` = 3

## Falsified statements inventory (for the integration pass; NOT updated here)

Scope discipline: the lane makes the one functional line; admin-surface.md's
merge note explicitly reserves the whole-suite surface for the merge pass.
These statements are now false and need their updates in one deliberate pass:

- `src/card/mod-loader/default-mod-deck.ts` file comment: "Four captured
  names carry no manifest here, deliberately" lists core (bar_and_box,
  delayed_job, defaults remain true).
- `COMPILED_IN_OR_ABSENT_MODS` (default-mod-deck.ts:75-80) still lists
  "core" while its doc comment says "no manifest entry in the composed
  deck"; the "carries the captured resolve order" test pins its length at 4
  and still PASSES — the constant compiles and tests green while meaning
  one name too many.
- `tests/card/mod-loader/default-mod-deck.test.ts`: the two 30-pins that
  fail (above), the `slice(0, 7)` head expectation, the unaccounted-name
  list `["core", "bar_and_box", "delayed_job", "defaults"]`, and the
  "30 ported mods"/"4 without manifests" doc lines in the file header.
- `src/card/mod-loader/mods/core-mod.ts` header: "The manifest is NOT wired
  into defaultDeckSources(): composition … is the merge pass's one-line
  decision. Tests load it standalone."
- `docs/admin-surface.md` "## Merge notes for the next pass" first bullet
  (the composition line is now done; this receipt is its proof).

## Environment and side-effect disclosures

- Fresh worktree; `npm ci` failed at better-sqlite3's node-gyp fallback (no
  Visual Studio on this machine); reinstalled with `npm ci --ignore-scripts`
  → complete lockfile install (vitest 5.0.1, tsc 7.0.2). better-sqlite3
  resolves through its shipped `prebuilds/` (identical layout to lane-admin's
  known-working install, whose `build/Release` is absent too — the suites
  run on prebuilds here).
- `tests/card/render/depth-sweep.test.ts` rewrites
  `benchmarks/results/depth-sweep-ts.json` (timestamp + measurements) on
  every suite run — a run side effect, not a lane change. The file is left
  modified and UNSTAGED (not reverted; checkout requires scoped permission);
  it holds the last (lane) run's numbers.
- Suite artifacts (logs, JSON reports, failure sets, diff helper, probe)
  live in gitignored `tmp/lane-admincompose-suite-runs/`.
- NO push, NO deploy, NO staging touch.
