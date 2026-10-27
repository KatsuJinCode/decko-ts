# reg-routes-B6 closed: the edge serving host wires the asset-input refresh seam

Lane: `port/edge-refresh-seam-20261027` in the exclusive worktree
`C:/localProjects/decko-ts-edge-seam-20261027` (created through the
sanctioned worktree admission, lease `27427e622236`), from the newest pushed
tip of `deploy/full-candidate-20261104`, read back with `git ls-remote`
first: `a1b8a215f74468ae4e90ca0adf5a95a7acb7dd95`. Nothing deploys; the
wiring lands on the branch and no host was touched, and no live-host traffic
was sent.

## What landed

The row's unblock sentence ("the edge serving host still wires no
asset-input refresh seam ... Unblocks when: the edge host wires the
asset-input refresh seam") is met on this branch.

1. `deploy/bunny-worker-src/bunny-edge-engine-handler.ts`: the seam. The
   edge handler builds `createReadAssetRefresh` (the port's
   `Card::Assets.refresh`, `src/card/actions/asset-read-refresh.ts`) once
   per isolate and runs `beforeRead` at the point every remaining GET is a
   card-surface request, before the render and before the content cache.
   The refresh itself is the receipt's named mechanism:
   `new CardActionEngine(deck.fetcher, ...).refreshReadAssetInputs()`, the
   staging host's exact shape (vm-staging-server.mjs:684, :4582).
   - Gate shape: GET only, and the dispatch order already excludes what
     Ruby's `except: [:asset]` and staging's `/_` and `/files/` exclusions
     cover (the /_status, /_signout, vendor asset, TinyMCE and /files arms
     answer first). `explicitFile` rides the request params, Ruby's
     `params[:explicit_file]` truthiness (present is true), one step more
     faithful than staging's constant false.
   - Mode: `DECKO_ASSET_REFRESH`, default `cautious`, Ruby's production
     default (cardio/railtie.rb:34). A malformed value fails loud with the
     named 500 JSON, the mis-armed-guard rule.
   - Collaborators: the same set the edge write surface builds
     (`edgeScssCompiler`, `edgeCoffeeCompiler`, now exported from
     `src/server/cloudflare-write-routes.ts` so one lazy instance serves
     both), the static uglify validator, and the storage-zone attachment
     store when configured. compress_assets stays off, the write surface's
     documented posture on this host.
   - Failure posture, deliberately the staging host's opposite: staging
     answers a throwing refresh with a 500 (vm-staging-server.mjs:4584);
     the edge logs the refresh failure with its path and serves. The edge
     is the stateless serving tier of a deck whose asset inputs are
     maintained upstream, an isolate has no recovery loop, and the host's
     established posture for boot-adjacent machinery is degrade-and-log
     (the error page's stub fallback, the unresolvable session's degrade to
     Anonymous, the location history's swallow). The port's
     marker-before-work semantics make a throwing refresh a
     once-per-isolate event in cautious mode either way.
2. `tests/server/setup-before-action-parity.test.ts`: the three gap legs
   are rewritten as the wired state's pins, the flip the workbatch-A
   receipt named. The deploy-wide scan now expects exactly
   `bunny-edge-engine-handler.ts` to reach the seam (with the build-output
   skip the inventory pin states), the staging pin stands unchanged, and
   the named remainder becomes the wiring's shape pin (the edge builds the
   refresh engine directly; `createCardActionEngineForSession` stays the
   write path's construction).
3. `tests/server/workbatch-a-register-rows-inventory.test.ts`: the B6 row
   spec reads `closed` (was `named`), the named-row set is empty, and the
   final leg pins the wiring's exact extent (exactly the handler reaches
   the seam) where it asserted the gap. Updated on purpose in the same
   landing; the reason is in the row's receipt appendix and here.
4. `tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts` (new): the
   proof the wiring RUNS. A real handler request over the real boot
   (schema + deploy seed + the refresh's own rows, the transport the
   sibling handler suites use) materializes the `style: mods` input row in
   `card_virtuals` through the seam; then, with the bot's codename
   removed, the next GET still answers 200 with the served page, pinning
   the degrade posture.

## Proof (run in this lane, at the tip, after the landing)

- `npx vitest run tests/server/setup-before-action-parity.test.ts`:
  13 tests, 0 failed (the pinned oracle legs plus the wired-state pins).
- `npx vitest run tests/server/workbatch-a-register-rows-inventory.test.ts`:
  10 tests, 0 failed (the eight receipts whole, B6 closed, the seam's
  extent pinned).
- `npx vitest run tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts`:
  2 tests, 0 failed (the refresh writes through the handler; the refresh
  failure degrades to the served page).
- The 16 suites that drive `handleBunnyEngineRequest`:
  97 of 98 tests passed. The one failure is PRE-EXISTING at the tip and
  outside this row:
  `tests/server/port-only-vendor-font-assets-parity.test.ts` expects the
  vendored bootstrap icon font's `cache-control` to be
  `public, max-age=86400`, while the tip's own source serves
  `public, max-age=31536000, immutable` (src/server/bootstrap-font-assets.ts:28,
  whose header comment records the deliberate change; src/server/font-awesome-assets.ts:20
  carries the same value). Neither file is in this lane's diff.
- `npx tsc --noEmit`: clean (one narrowing error found and fixed during
  the lane; final run silent).
- The boot-safe budget guard, in-build
  (`node tools/bundle-bunny-edge-engine.mjs`, which runs
  `assertBunnyScriptBudget` from `tools/vendor/edge-bundle-budget.mjs`):
  `bundle validated: .../bunny-edge-engine.bundle.js (7483155 bytes ...,
  limit 7600000 bytes)`. The wiring costs 1,107 bytes over this lane's
  measured pre-wiring build of the same tip (7,482,048 bytes), leaving
  116,845 bytes of headroom. The read bundle is byte-identical
  (2,191,816). The standing over-80-percent WARN line is unchanged from
  the tip's own posture.

## The row's new grade

CLOSED. The completeness roster carried reg-routes-B6 PARTIAL on exactly
one unblock, and that unblock is met and proven above; in the roster
registry's vocabulary (docs/registry/completeness-roster.json), verdict
`PORTED`, bucket `DONE`, with the round-eight named remainders still named
as round eight named them: the port's refresh marker lives in the host
process rather than the shared cache (one refresh per isolate rather than
per shared-cache lifetime), and the port's cache-renew half is the
per-request scope, not the shared-cache renew. Neither is a gap in the
wiring; both are recorded in the row's instrument.

The row's receipt appendix (docs/runs/workbatch-a-20261025/reg-routes-B6/RECEIPT.md)
carries the closure; the roster registry itself is the roster-refresh
flow's to update.
