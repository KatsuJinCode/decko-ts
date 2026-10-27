# edge-seam-vendor-assets: the vendored theme images serve the way the pinned Ruby serves them

The assignment (tmp/fleet-standing-queue/briefs/edge-seam-vendor-assets.md, in
the operator's queue checkout): the edge asset-input refresh seam came back
from the v26 roll with the measurement attached - wired in, the whole-family
signed-in exercise's browser asset audit reads one 404 for
`/mod/style/jquery-ui-smoothness/ui-bg_glass_65_ffffff_1x400.png`, and the
family reads 331 of 332 (the v26 roll receipt, section 4). This lane makes
the vendored jQuery UI theme images serve the way the pinned Ruby serves
them, and proves 332 of 332 with the seam wired. Nothing deploys;
culturesmith.com is never touched.

## 1. The baseline, reproduced in this lane

Branch `port/edge-refresh-seam-20261027` (tip `6dedb7d59`), the lane's own
checkout, with the engine bundle rebuilt from that tip
(`node tools/dist/build-engine.mjs`, then `node tools/bundle-bunny-edge-engine.mjs`;
engine bundle 7,483,155 bytes, SHA-256 `cd9138402c7573ce5275d8bb671fa0891161df621084c09ccc886585207be25f`).
The whole-family exercise over a copy of the pinned deck:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/edge-seam-vendor-assets-20261027/baseline/report.md

Result: 331 of 332 checks passed, the one failure the asset audit, with the
roll's exact URL and status:
`/mod/style/jquery-ui-smoothness/ui-bg_glass_65_ffffff_1x400.png`, GET, 404,
resourceType image, outcome deployment-failure. (Section 5 records the run
record.)

## 2. What the pinned Ruby actually does (read, not inferred)

The URL lives in the vendored stylesheet the refresh publishes:
`fixtures/vendor/mod-style-assets/card-mod-style/assets/style/
jquery_ui_smoothness.css` (byte-identical to the pinned gem's own file,
SHA-256 `131b8d9d6753c6e1bb703b80333986e4656ddbf68cc89be0a773a70e0059cf8b`
on both) references 11 distinct images through `url([[/mod/style/
jquery-ui-smoothness/<name>]])` chunks. The css format's link chunk renders
`[[/path]]` to the deck path (card-mod-content lib/card/content/chunk/
link.rb, the `[[...]]` full_re; card-mod-format set/all/links.rb:74-81
clean_resource/contextualize_path), so the browser requests
`/mod/style/jquery-ui-smoothness/<name>`.

The pinned Ruby's answer comes from the mod public-files surface, not from a
router route and not from an attachment store:

- card-1.110.0 lib/cardio/mod.rb:30 documents the mod `public/` directory as
  "accessible via the web at DECK_URL_ROOT/mod/MOD_NAME/".
- The pinned oracle app on the juc VM (`/opt/deck-demo`, read over the
  documented SSH recipe) serves them as static files:
  `/opt/deck-demo/public/mod/style/jquery-ui-smoothness/` holds the same 11
  PNGs, and `sha256sum` over them matches the pinned gem
  `card-mod-style-0.20.0`'s `public/jquery-ui-smoothness/` byte for byte
  (all 11 hashes equal; the VM's copy was read directly over SSH).
- The pinned router's own answer for a `/mod/*` path when the static layer
  has nothing is the bad_address wildcard (the committed capture
  `fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json`, the E10/E11
  router answers), and the E11 receipt already records the same mechanism
  for the vendor font assets: the deployment serves mod public files before
  the router ever sees them.

So the fix is the mod public-files surface for the style mod: serve the gem's
own PNG bytes at the exact referenced paths, the same way the existing
vendor-asset arm serves the FontAwesome and bootstrap-font paths
(docs/runs/enumeration-suspects-reconcile-2026-10-25/reg-routes-E11/RECEIPT.md).

## 3. The implementation

Branch `port/edge-seam-vendor-assets-20261027`, cut from the candidate tip
`54ccac033` with the seam merged in (one merge commit, first parent the
candidate tip, second parent the seam tip `6dedb7d59`; `git merge-tree
--write-tree` computed the merge clean, exit 0, and the merged tree carries
both the seam's `refreshReadAssetInputs` wiring and the 404 arm's handler
changes).

- `tools/assets/vendor-mod-style-images.mjs`: packages every PNG in an
  absolute card-mod-style-0.20.0 gem directory into
  `vendor/decko-mod-style-images/` (assets.js, assets.d.ts, provenance.json,
  PROVENANCE.md), the same packaging pattern as
  tools/assets/vendor-bootstrap-fonts.mjs. Run against the pinned gemset
  copy at `C:/localProjects/decko-oracle-gems-vm/gemset/card-mod-style-0.20.0`
  (read-only; the files were copied to C: before this session, no Ruby and
  no installs). Output: 11 files, 25,621 bytes.
- `vendor/decko-mod-style-images/`: the exact pinned bytes, each pinned by
  SHA-256 in provenance.json; the hashes equal both the pinned gem's and the
  VM's served copies. The gem carries no separate license file for these
  images: the MIT grant is the theme file's own header, and provenance.json
  records that file as licenseSource rather than inventing an upstream URL.
- `src/server/mod-style-assets.ts`: `serveModStyleAsset`, the
  `/mod/style/jquery-ui-smoothness/` surface, the same posture as
  font-awesome-assets.ts: exact paths only, 405 with `allow: GET, HEAD` for
  non-read verbs, 404 for unknown names, `content-type: image/png`,
  `cache-control: public, max-age=31536000, immutable`, `nosniff`, an ETag
  built from the payload's sha256 honoured with a 304 through the shared
  conditional-asset seam (the 304 answer comes before the base64 decode).
- Both hosts' vendor arms chained it in, the two surfaces the E11 row
  registers for the vendor-asset arm:
  `deploy/bunny-worker-src/bunny-edge-engine-handler.ts` (the edge engine)
  and `vm-staging-server.mjs` (the staging host), each
  `serveFontAwesomeAsset ?? serveBootstrapFontAsset ?? serveModStyleAsset`.
  The read bundle has no vendor arm of its own (it forwards to the full
  engine) and gained none.
- `tests/server/mod-style-assets.test.ts`: five pins - every image path the
  vendored stylesheet references is served (the paths read off the file, not
  restated, and the vendored map covers exactly that list); the audit's
  failing URL serves the exact pinned bytes with the hash-built ETag; 304 on
  a matching If-None-Match with no body; HEAD headers with no body and a
  full body on an unmatched validator; 405 non-read verbs, 404 unknown
  names, undefined off-prefix.
- `NOTICE`: a `vendor/decko-mod-style-images/` row beside the other vendor
  packages.

## 4. The proof (all run in this lane, at the landed tip)

The source lands first (the exercise tool's own source-custody gate refuses a
capture over an uncommitted tree, tools/edge-signed-in-exercise/lib/
source-custody.mjs); this receipt's proof numbers land in the commit that
follows the run they record. Every command and its deciding output:

- The seam's own new test: tests/server/mod-style-assets.test.ts, 5 of 5,
  with tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts (the seam's
  behavior pins), 2 of 2: `npx vitest run tests/server/mod-style-assets.test.ts
  tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts` read
  `Test Files 2 passed (2)`, `Tests 7 passed (7)`.
- Typecheck: `npx tsc --noEmit`, exit 0, zero output lines.
- The bundle stays inside its boot-safe budget: `node tools/dist/
  build-engine.mjs` then `node tools/bundle-bunny-edge-engine.mjs` (which runs
  the tree's own budget guard) read `bundle validated ... (7520484 bytes ...
  limit 7600000 bytes)`, 79,516 bytes under the limit, SHA-256
  `701f61d9cf38fad337f91ce4ebd9b5fc5d2edf3d05431e09d4b815f161588b00`; +37,329
  bytes on the baseline rebuild, the 11 images' base64 and their imports. The
  images are inside the artifact: the audit's failing name and its pinned
  sha256 both appear in deploy/dist/bunny-edge-engine.bundle.js.
- The whole-family signed-in exercise at the landed tip: 332 of 332, the
  browser asset audit green (section 5's wired run record).

## 5. The run records

Baseline (the seam wired, the fix out), this lane, before the landing: 331 of
332 passed, 1 failed, the failure the final browser asset audit with the
roll's exact evidence - `{"url":"https://127.0.0.1:63037/mod/style/
jquery-ui-smoothness/ui-bg_glass_65_ffffff_1x400.png","status":404,"method":
"GET","resourceType":"image","navigation":false,"contextIndex":0,"outcome":
"deployment-failure"}` over 38 contexts. Run record:
`.runtime/edge-seam-vendor-assets-20261027/baseline/report.md` (source
`6dedb7d59`, bundle SHA-256 `cd9138402c7573ce5275d8bb671fa0891161df621084c09ccc886585207be25f`).

With the fix wired (the run's recorded source `d05e7b058`, the tip this
receipt's first landing pushed; the follow-up commit carries only this
receipt's measured numbers and the NOTICE heading's hyphen): **332 of 332
checks passed**, 0 failed, 0 skipped by write mode. The final browser asset
audit reads PASS with `{"contexts":38,"failures":[]}` - zero 404s, no
script, stylesheet, font or image failed across the exercised browser
contexts (the one notDeploymentAssets entry is the harness's own
harness-policy abort of a third-party s3.amazonaws.com image, blocked by
the client, never a deployment failure). Capability coverage reads 95
covered, 1 partial, 0 not covered, 1 disabled upstream of 98 - the same
shape the v26 roll's green baseline records. The process exit code is 1 by
the tool's own rule (exit 0 requires the coverage complete; the partial M1
leg predates this lane), the same reading the v26 roll receipt records.
Run record: `.runtime/edge-seam-vendor-assets-20261027/wired/report.md`;
log `tmp/edge-seam-vendor-assets-20261027/wired-exercise.log`.

