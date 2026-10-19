# Page-only witnessed actions, ranks 91-100 — batch report

Lane: `probe-pageonly-ranks91-100.mjs`, the 91-100 window of the canonical
witnessed-only list. Receipts: `.runtime/exhaustive/probe-pageonly-ranks91-100/`.

## The id list, verbatim

Ranks 91-100 (10 ids) of the 2026-10-18 re-grade's 101 page-only ids in id
order — `tmp/pageonly-101-ids.json`, positions 91..100:

```
ACT-178, ACT-179, ACT-180, ACT-181, ACT-184, ACT-185, ACT-186, ACT-187, ACT-188, ACT-189
```

Boundary: these ten ids and no others. Sibling windows are disjoint and are
recorded here as a dedup claim, not a re-claim — ranks 1-10 `bc81fbb5`, 11-20
`5bdda29f`, 21-30 `cacce253`, 31-40 `93771deb`, 41-50 `7deabd7e`, 51-60
`d69c2369`, 61-70 `47915f69`.

All ten ids were **exercised**. None was skipped. (The canonical list lives on
the coordination tree at `C:/localProjects/brandonDojoTech/tmp/pageonly-101-ids.json`,
not in this repo — the ask's path was off by one repo. The same set is
`.runtime/exhaustive/2026-10-18-regrade/actions/*.json` graded `page-only` in
this repo; both were read and compared, and they agree.)

## Engine provenance — a disposable pure-tip worktree

The shared checkout carries other lanes' uncommitted writes, so the engine was
built and booted from a **disposable clean detached worktree of the tip**, and
removed after the receipts were preserved.

- worktree: `C:/localProjects/decko-pageonly-ranks91-100-tip`, detached at
  `d69c2369ba8efdd29e2d58e933e8ab613e117755`
- build: `node tools/dist/build-engine.mjs --browser-hosts` — "Engine
  distribution built; static snapshot and compiler imports verified."
- `sourceCommit`: `d69c2369ba8efdd29e2d58e933e8ab613e117755`
- `sourceDiffSha256`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (sha256 of the empty string — the clean-tree value)
- `distSha256`: `e35ad4a29cf4bc2166e22d1a23a7d83403e6f95d91b1bf941c583ba5a024480b`,
  **recomputed by the probe** from the engine worktree's `dist` tree and
  asserted equal to the build record's own value (`engineDistSha256MatchesBuildRecord: true`)
- `engineIsPureTip: true` in both receipts — the worktree's own
  `git status --porcelain` was empty at run time
- fixture: `reference-harness/fixtures/synthetic-v1`,
  `fixtureSha256 066062bd09c25629d43691461a23bf37…`

Every receipt records `sourceDiffSha256` **and** `distSha256` under
`source.engineBuild`, plus the recomputed `source.engineDistSha256Recomputed`
and the clean-tree check. The engine build record is copied out of the worktree
to `engine-build-pure-tip-d69c2369.json` beside the receipts so the provenance
survives the worktree's removal.

A fresh worktree lacks the mods' public dir — a gitignored Ruby-setup artifact,
not engine code — and `ts-server.mjs:76` refuses to boot without it. The probe
builds the same wrapper manifest `probe-pageonly-batch6` builds, pointing
`DECKO_MOD_PUBLIC_DIR` at this repo's copy while the engine's own `dist` stays
the target checkout's build.

## Result: 21 of 22 legs GREEN, twice consecutively; ONE GENUINE RED

The batch proof bar is **all legs green twice consecutively**. That bar is
**not met**: 21 of 22 legs are green in both consecutive runs, and one leg —
pinned deliberately — is RED in both, with a measured cause. The RED is a real
product defect, not an instrument artifact; it is reported as `unfixed` rather
than weakened to reach a green bar.

| run | legs | green | red | exit |
|---|---|---|---|---|
| run1 | 22 | 21 | 1 (ACT-185) | 1 |
| run2 | 22 | 21 | 1 (ACT-185) | 1 |

### Fixed — 21 legs GREEN in both runs

| id | legs | evidence |
|---|---|---|
| ACT-178 | 2 | `run1/probe-ranks91-100-result.json` |
| ACT-179 | 1 | same |
| ACT-180 | 2 | same |
| ACT-181 | 2 | same |
| ACT-184 | 3 | same |
| ACT-185 | 2 of 3 | same |
| ACT-186 | 2 | same |
| ACT-187 | 3 | same |
| ACT-188 | 1 | same |
| ACT-189 | 3 | same |

### Unfixed — 1 leg RED in both runs

**ACT-185, "the all-caps spelling of a name ending digit+C resolves to that
same card."** RED in run1 and run2.

The exact failure: for a card named `Harness Plurality Digit 9c <stamp>`, the
canonical address `/Harness_Plurality_Digit_9c_<stamp>` serves the card
(`data-card-id 916`, 200). The all-caps address
`/HARNESS_PLURALITY_DIGIT_9C_<STAMP>` also answers **200** — but
`data-card-id` is **null** and `data-card-name` echoes the shouted spelling. The
page is not the card: it is the **create form** silently served at the unknown
card's address (`servedCreateFormInstead: true`).

The cause, measured with the engine's own code rather than inferred:

1. `DeckoName`'s key algebra injects a spurious `_` into an **uppercase** token
   ending in **digit+C**. In the receipt's own `keyAlgebra`:
   `exactKey harness_plurality_digit_9c_…` vs
   `shoutedKey harness_plurality_digit_9_c_…`, `keysMatch: false`.
2. The fold lives in `simpleKeyUncached` (`src/card/name.ts:128-135`) — the
   `NOT_OK_FOR_KEY` replace applied after `stableKey` (`src/card/name.ts:97-101`).
3. The by-key lookup (`src/card/fetch/retrieve.ts:293`, `SELECT * FROM cards
   WHERE key = ?`) compares against the fixture's `cards.key` column, which is
   plain `varchar` with **no** `COLLATE NOCASE` (verified from the fixture's own
   `sqlite_master` DDL), so the differing keys miss.
4. The miss drops the request into the unknown-card `:new` branch
   (`src/card/render/page.ts:309-351` — "an unknown card whose actor may create
   renders the `:new` page at the requested address (status 200)"), which is why
   the wrong answer is a **200 create form** rather than a visible 404.

The trigger is narrow and is pinned by the receipt's own `triggerTable`, so the
report does not overclaim that case-insensitivity is broken:

| input | `.key` | |
|---|---|---|
| `AB1C` | `ab1_c` | DIFFERS |
| `AB99C` | `ab99_c` | DIFFERS |
| `MVEMONUT31C` | `mvemonut31_c` | DIFFERS |
| `ABC` | `abc` | same |
| `CARDC` | `cardc` | same |
| `STATUSC` | `statusc` | same |
| `mvemonut31c` | `mvemonut31c` | same (lowercase is fine) |
| `HOME` | `home` | same (case folding works) |
| `FOCUS` | `focu` | same (`focus`→`focu` is correct singularization) |

So: **uppercase AND a final digit+C**, not all-caps alone. ACT-184's own
case-insensitivity legs (lowercase name, percent-encoded slug, lower/upper
keyword search) are GREEN, and ACT-185's other variants — underscore slug,
lowercase slug, percent-encoded spaces, uppercase slug of a name ending in a
plain word — all pin to one card id. The defect is left unfixed: repairing
`DeckoName`'s key algebra is an engine change well outside this lane's boundary
("exercise ranks 91-100"), and it would need the whole correctness battery
re-run. It is reported here for the registry owner, with the reproduction
embedded in the probe.

## Selectors were pinned from bytes, not memory

Three discovery passes against this engine preceded the graded runs, because two
of the claims needed instruments that could not be assumed:

- the `not_found` error view renders `.card-slot.not_found-view`, an h1 "Not
  Found", "Could not find <em>name</em>", and the signin/signup line **only**
  when signed out (`src/card/render/format.ts:1584-1591` gates that line on
  `signedIn !== true`);
- a **signed-in actor with create rights** is answered the `:new` page at an
  unknown address with status 200. That is the oracle-pinned
  `page_view_for_unknown` branch (`src/card/render/page.ts:309-351`), **not** an
  error-page defect — `unknownCardCreatable` is `card.ok?(:create)`
  (`src/card/render/views.ts:5787-5792`), and both fixture actors hold create
  rights. ACT-178 is therefore graded on the branches that really are error
  pages (anonymous, and the `.json` error answer), and the signed-in
  create-form is recorded as a **witness** in `report.witnesses` with its
  source citation, not reported as a RED. Had this been graded naively it would
  have been a false positive;
- the `/*recent` act rows are `#main .card-slot .card-slot` inside
  `ul.action-list > li.create`, each carrying its act's identity as
  `action_id` inside its `data-slot` JSON. That is the dedup instrument for
  ACT-187. The feed's own `*recent` titled-view slot is excluded by
  `data-card-name`.

## Two probe defects found and corrected mid-lane (both recorded)

1. **ACT-181 feed reader read the wrong nodes.** The card-name sequence was
   collected by looking for a **descendant** `[data-card-name]`, but the act
   slot carries the attribute **on itself** (discovery pass 3). Run 1 read zero
   rows off a perfectly good feed and REDed with `indexA: -1, indexB: -1`.
   Corrected to read the attribute off the act slot; ACT-181 is GREEN in both
   final runs.
2. **Navbox-search legs were racing the render.** They read the result list after
   a fixed 800 ms sleep. In one run they returned `rows: []` on a correctly
   navigated `/*search` page whose URL carried the right query — the list had
   not rendered yet — while the same legs were green in the run before. The
   reader now **waits for `#main .search-result-list`** (bounded) and records
   `listAppeared`/`waitedMs`, so a zero-row result is a measurement, not a race.
   The same wait hardened ACT-189's empty-search leg — where the wait revealed
   that a **zero-match search renders no result-list container at all**
   (`resultListRendered: false`). That is the empty surface's own correct shape,
   so requiring the container there would have failed correct behaviour; it is
   recorded as evidence, not asserted.

The digit+C leg was itself reshaped by run 1: it first REDed because the card
name carried a random stamp suffix that happened to end in digit+C, making the
leg nondeterministic. The plurality leg now uses a fixed name
(`Harness Plurality Caseprobe 91`), and the digit+C case is pinned deliberately
in its own leg so the cause is attributable rather than random.

## Files

- `reference-harness/browser/probe-pageonly-ranks91-100.mjs` — the probe
- `.runtime/exhaustive/probe-pageonly-ranks91-100/run1/probe-ranks91-100-result.json`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/run2/probe-ranks91-100-result.json`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/engine-build-pure-tip-d69c2369.json`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/pageonly-ranks91-100-batch-report.md`
- `.runtime/exhaustive/probe-pageonly-ranks91-100/discovery-dom3.mjs` — the
  discovery pass whose findings the ACT-178/ACT-187 instruments rest on,
  preserved because the worktree it ran in was removed