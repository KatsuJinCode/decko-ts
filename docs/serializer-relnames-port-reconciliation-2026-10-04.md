# serializer + relnames PORT onto the fold line — the reconciliation record

Branch `lane-serializer-port-2026-10-04`, based on `9b56eca5`
(`lane-fold13-rehearsal-2026-10-04`, the fold-13 rehearsal union tip).
Ported from `lane-serializer-followup2-2026-10-03` (`f8080d12`) and
`lane-relnames-2026-10-04` (`ff9df73c`).

This file is the record the ask requires: every port decision, what it was
resolved in favour of, and the measurement that decided it.

---

## 1. The C4 blocker is REFUTED — there is one implementation, not two

The fold-13 rehearsal recorded C4 as a SEMANTIC conflict: "the fold line already
carries its own `deployment-follow-live-config` module (`deckRootUrl`/
`scriptIntegrityFor` imports at page.ts:62-63) while the serializer line writes a
different shape of the same follow-live concept," and concluded the serializer
line "must be PORTED, not picked."

Measured on this branch's base, that is not what the tree says:

| what | how measured | result |
|---|---|---|
| the config module | `git rev-parse 9b56eca5:src/card/render/deployment-follow-live-config.ts` and `f8080d12:…` | **identical blob `20312f9d1fcbf3a42fe1a611ef2a14b112d8ba54`** |
| the probe the rehearsal named | `git rev-parse 9b56eca5:tools/oracle/first-diff-named-entries-probe.mjs` and `f8080d12:…` | **identical blob `68696f65b09a0343c0afdf9fd06ed60399512895`** |
| the `page.ts` import pair | `git show <tip>:src/card/render/page.ts` lines 45-80, both tips | same two lines, same line numbers (62-63) |
| the engine API the patch adds | `grep -c setDeploymentCloudAssetHost` on `src/card/render/views.ts` | fold 2, serializer 2 |
| the graded runner's binding | `grep -n setDeploymentCloudAssetHost tools/oracle/dual-lane-direct-runner-core.ts` | fold **555/560**, serializer **539/544** — the same `setDeploymentCloudAssetHost(DEPLOYMENT_CLOUD_ASSET_HOST)` call; the ask's "core.ts:539-544" is the serializer line's numbering, the fold line carries it 16 lines lower because the set-module override block grew above it |
| the corpus artifacts | `git cat-file -e` on all four of `apply-asset-host-follow-live-close-71.mjs`, `swap-37-view-expectations-live-check-close-71.mjs`, `asset-host-transform-manifest.json`, `cloud-asset-host-deployment-config.test.ts` | **fold = YES on all four** |
| is the patch already contained? | `git cherry -v 9b56eca5 f8080d12 ea2e2e06` | **`8df69968` marked `-`** — the fold line's carrier is `79101219`, identical subject, located by `git log -S setDeploymentCloudAssetHost 9b56eca5 -- src/card/render/views.ts` |

**Decision: the fold line's copy is kept, and the serializer's `8df69968` is
dropped from the port set entirely.** There is no divergence to adjudicate —
the two trees hold the same bytes, so the canonical expected-v2 corroborates
both equally. The rehearsal's "two independent implementations" is the one
claim in C4 that does not survive measurement.

**Why the pick still aborted, mechanically.** A three-way cherry-pick diffs
against the merge base `ea2e2e06`, not against the fold tip. `page.ts` and
`views.ts` were both edited on the fold line AFTER `79101219` (the M8 port
`c3be96d0`, the `deck-origin` module, the set-override seam), so the patch's
context no longer matches and git reports a textual conflict on a change the
tree already contains. The conflict is a duplicate-content artifact.

## 2. `git cherry` is NOT a sufficient absence test in this repo

`git cherry` reported 32 of the 38 serializer commits absent. One of them —
`2ef25d6d` "GREEN: the root-drop reads viewLaneRoot; nav dropdown drops
non-rendering items" — is **already fully on the fold line**:

- `Voo.viewLaneRoot` exists at `src/card/render/format.ts:172,178,183`
- the root-drop arm reads it at `format.ts:397-411`
- `rootEnrolledInherited` reads `parent.viewLaneRoot` at `format.ts:287-290`

Picking it produced a conflict on `src/card/render/code.ts` alone: the commit
also flipped line endings in that file, which changes its patch-id while
changing no content. It was skipped as empty after content verification.

**Rule for the fold window: every "absent" commit must be content-verified
before it is ported, because `render.ts` and `views.ts` carry deliberate CRLF
carriers (61 and 527) and any commit that touches them churns the patch-id.**

## 3. The port set, and what each conflict was resolved in favour of

| port commit | source | resolution |
|---|---|---|
| `8c4fc491` | `e63d759f` M1 RED pin | clean. New env-gated file `view-lane-bar-slot-root-context-seat-pins.test.ts` |
| `3afa8750` | `fba95a17` M1 GREEN | **CONFLICT on `src/card/render.ts`.** The two sides are textually IDENTICAL except line endings (the serializer's own `f9d81361`/`7abebfce` exist to restore the CRLF the Edit tool normalized). Resolved by restoring the HEAD blob byte-exactly and applying ONLY the substantive hunk — `isViewLaneRoot: true` on the root `RenderFormat`. **Result 61 CR / 61 CRLF / 0 lone CR, the house baseline.** The CRLF churn in the pick is the serializer's artifact, not the fold line's, and taking it would have cost 35 carriers. |
| — | `2ef25d6d` | **SKIPPED as already contained** (section 2) |
| `8d30606a` | `74ecdfb7` p20 sweep | clean. Test-only; binds `setDeploymentCloudAssetHost(SPACES)` and folds the one counted `*Opportunities` join-slot shape |
| `1bc06719` | `7b8f1110` + `d14a8901` parity classifier | **CONFLICT on `set-card-views-corpus-parity.test.ts`.** Resolved to the serializer tip's blob `328a1719` verbatim — legitimate because `git diff 9b56eca5 f8080d12 -- <that file>` is a single 65-line hunk in the classifier, so the tip's state IS the union of all three commits. `d14a8901` then became empty and was skipped. Verified: the ported blob equals the serializer tip's blob. |
| `58a2340d` | `ac2d006d` M10b fit (views.ts:2649-2664) | applied by **byte splice, not pick**: views.ts carries 527 CRLF carriers and a whole-file rewrite collapses them. Prereqs verified in scope first: `ruleByCodename` at `views.ts:2636`, `GROUP_TO_SETTINGS` at `views.ts:3308`. The commit's other three files are NOT taken — the benchmark artifact is already on the fold line as `007ea5b3`, `scratch-m10b-bars.test.ts` was deleted by the serializer line itself in `1a8feabd` "per its own header", and the parity test landed in `1bc06719`. |
| `89faf7b3` | `510fd7a4` relnames shape gate | **CONFLICT on `views.ts`, two regions** (the known-item `bar` arm and the unknown/phantom arm). Each region disagreed on two independent things: (a) the `hide: ["bar_middle"]` opts key and (b) the `{ pointerListItem: true }` 4th `nestRecord` argument. **Resolved: HEAD wins on (a), 510fd7a4 wins on (b).** The fold line removed the `hide` in a LATER corpus-validated fix whose own comment cites the evidence (the capture reads body order `[one_line_content, bar_middle]`, `democracy+*referred_to_by` item slot, `recapture-raw-shard-000030`); reintroducing it would regress that. The marker argument IS the relnames delta. **Result 527 CR / 527 CRLF / 0 lone CR.** Resolver: `tmp/resolve-relnames-views-conflicts.cjs`, which asserts 527/527/0 before and after. |
| `99cf46ee` | `3867c81c` census probe skip | clean |
| `5ce416b8` | `33b84fe0` + `54079f5c` manifest | **CONFLICT on `tests/standing-net.json`** — the whole `provenance` block, because each lane's manifest carries its own 96-file base. Resolved by a JSON union, not a hand-merge (`tmp/union-standing-net-manifest-for-relnames-and-slotctx.cjs`): 112 → 117 files, `manifestFileCount` 117, and the `relnames-source` / `slotctx-source` provenance strings lifted VERBATIM from `33b84fe0` / `9b7750bb` so the manifest records the lanes' own wording. `54079f5c` then became redundant and was skipped; its three files and its `slotctx-source` key were verified present and byte-identical to the donor. |

## 4. What was deliberately NOT ported, and why

- **The scratch/WIP "adoption snapshot" commits** (`916005f4`, `eb099acd`,
  `18d55fd2`, `1a8feabd`, and the scratch halves of `ac2d006d`, `c3db7d85`,
  `b451ef83`, `5f4b3084`). These carry debug dumpers the serializer line itself
  deleted, several "per its own header" (`1a8feabd`). Porting them would
  re-land files the source branch retired.
- **The census engine commits M2 / M2-refit / M3 / M4 / M5 / M6 / M8 / M10**
  (`4afe794f`, `448f74f5`, `43d55e80`, `5f4b3084`, `42dba231`, `05b5d9b3`,
  `a639ee62`, `7e057e16`, `0377f4d3`, `612f238e`, `32fe3163`, `3de18c3b`,
  `c3db7d85`, `b451ef83`, `de7ed19f`, `b598b0ad`, `735e6a45`, and the RED pins
  beside them). Each is an engine change individually RED-then-GREEN verified on
  the SERIALIZER's base, and the fold line's `views.ts` / `render.ts` have since
  moved under the page42, view187, M8-port and set-override work. Porting them
  blind would land unverified engine changes into the exclusive window. M8 in
  particular is ALREADY ported — `c3be96d0` "view187 GREEN (M8 port)" carried
  `de7ed19f`/`b598b0ad`'s body onto the fold base. These remain the named
  per-item work for the window, under the view187 M8-port pattern.
- **`f8080d12`'s benchmark artifact** — already on the fold line as `007ea5b3`.

## 5. Gates at the port tip

Recorded in the lane receipt `tmp/wrong-goal-hunt/serializer-relnames-port-lane.md`
in brandonDojoTech, with job ids and raw numbers.
