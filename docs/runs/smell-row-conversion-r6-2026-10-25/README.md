# Row conversion, round six, 2026-10-25

Lane: lane-smell-test-round4-fixes-1-1. Question asked: take the two rows the
brief named, the final a253 manifest row and the found-by integration manifest
row, close each one with its own instrument, and then take any further named
row whose blocking mechanism a lane can legitimately satisfy, never with live
cs-edge database traffic and never by narrowing the session-mark carve-out.

Base: `c9ab5b3356e7ee1db1f8444967dd6cc09efc6157`, the newest pushed tip of the
canonical roll `deploy/full-candidate-20261029`. That tip carries both newest
pushed smell-test tips as ancestors, `2389d8e7` (round three, the six rows
under `smell-row-conversion-r5-2026-10-24/`) and `d7a7c652` (round three-b, the
six rows under `smell-row-conversion-r5b-2026-10-24/`), so this tree holds both
rounds' receipts and both slices' row pins.

## The rows

| row | what its own verification produced | disposition |
|---|---|---|
| `smell-write-found-by-integration-manifest` | the pinned bundle was rebuilt byte-exact at `6f960810`, so the instrument read all four of its inputs, passed all ten of its evidence gates and wrote the manifest of record, whose content is the manifest that stood there before apart from the moment it carries | DONE |
| `smell-write-final-a253-manifest` | the pinned checkout was restored at `a25329a8` and clean, the pinned bundle was rebuilt byte-exact at that source twice, and five of the six custody clauses hold; the instrument refuses in place because the deck at the receipt's recorded baseline path has moved on, and over a copy whose one changed field points at the hash-verified pre-apply backup it writes the manifest, which reproduces the manifest of record | DONE |
| `smell-widget-single-statement-cas-test` | the suite, run as it stands over the deck it reads, fails three of its four cases because that deck admits none of the twelve ids; run over the hash-verified pre-apply backup of the same deck, with one line repointed at the file it reads, it passes four of four | DONE |

Three rows close, and every other named row stays open with the reason it
stays open, named below.

## The one mechanism three of them share

Two build outputs of a pushed source were missing from this machine, and the
decks that carry the widget migration had moved on since the a253 era:

- the pinned bundle at `6f960810` and the pinned bundle at `a25329a8` are
  build outputs, and both rebuild byte-exact from the pushed source they name,
  which is what the 2026-10-20 dependency-restoration lane recorded and what
  this lane reproduced;
- the deck at `C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`
  is the applied deck: all twelve of the migration's cards are present and not
  trashed, all twelve carry the content the proposal describes as the after
  content, and none of them carries the before content the receipt of record
  records, so every admission written against the before content matches
  nothing;
- the hash-verified pre-apply backup of that same deck,
  `deck.sqlite3.pre-widget-fallback-20261019`, still carries the receipt's
  baseline hash `15545aa7...`, and every one of the twelve ids admits against
  it.

So the same two facts opened all three rows: the build outputs are
regenerable from pushed source, and the pre-apply deck is on this machine.

## What this lane restored

| what | where | how |
|---|---|---|
| the pinned checkout at `a25329a8` | `C:/localProjects/decko-edge-verification-53c86269` | a lane copy of the release checkout at that commit, with the runtime tree that holds the authorized-widget-content deck put back where the instrument hashes it |
| the pinned bundle at `a25329a8` | `.runtime/private-final-f044d5af-bundle/` and `.runtime/qualification-a25329a8-byte-rebuild/` | `node tools/bundle-bunny-edge-engine.mjs --out-dir`, twice, both copies hashing to `a498c160...` |
| the pinned bundle at `6f960810` | `C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/` | `node tools/bundle-bunny-edge-engine.mjs --out-dir` in a lane copy at that commit, hashing to `ea2e31d4...`, the hash the scoped run measured |

## What this lane did not do

It did not overwrite the live deck at the receipt's recorded baseline path,
did not re-point the receipt of record, did not write the manifest of record
of the a253 row (the instrument that would have written it refuses there, and
this lane left it alone), did not change any port source, did not touch a
hosted edge, did not send live cs-edge database traffic, and did not narrow
the session-mark carve-out.

## The rows that stay open, and why

| row | why it stays open |
|---|---|
| `smell-verify-hosted-widget-content` | the instrument's own verdict is false: all twelve card JSON addresses answer 404 on the hosted edge. A lane cannot change what the hosted edge serves, and nothing here deploys. |
| `smell-verify-staging-probe-restoration` | the instrument states no pass condition of its own, so its reading cannot be judged without an operator naming the flag values the restored staging state must carry. The 2026-10-24 round already took the reading: all six flags on both scripts are unchanged, and one script's release id moved. |
| `smell-prepare-remote-widget-cas` | the instrument's first act is live traffic to the cs-edge database, which this lane must not make. |
| `smell-prove-host-override-read-admission` | what remains is the write backstop, and the fix would narrow the session-mark carve-out, which changes the port's own account flows. Named, not taken. |
| `smell-read-private-index-progress` | the built clone that carried the `decko_nest_edges` cache was swept with the checkout. Re-running the index experiment would produce a new artifact, not the recorded one. |
| `smell-read-staging-isolate-probe` | the instrument refuses at its own admission gate because the staging script carries `DECKO_EDGE_ISOLATE_PROBE=0` and `DECKO_EDGE_CACHE=1` where it needs `1` and `0`. Changing them is a deployment. |
| `smell-retire-owned-migration-credential` | the instrument deletes a live credential, and re-pointing its stale custody constant would arm that deletion. A credential's retirement is an operator decision. |
| `smell-run-private-index-render-comparison` | the instrument's own exclusive create refuses one line before the four runs and before the write that would overwrite the completed output of record, and two of its inputs are gone with the pinned checkout's runtime tree: the built clone and the `nest-cache-hidden-children-v2.cjs` preload the runs need. |
| `smell-verify-hosted-widget-views` | already DONE, closed by the 2026-10-24 round on `port/smell-test-round3-20261024`. |

## The receipts

One per row, under this directory's row-id directory, each with the command
that produced it and the observed output.

- The captures are under `fixtures/captured/smell-row-r6-2026-10-25/`, one per
  row.
- The builders and distillers are under `tools/smell-row-r6/`.
- The reader is `tests/server/smell-row-r6-captures.ts`, this round's own
  module, named for this round's capture directory, so a lane working another
  slice never edits it.
- The pins are the three rows' own pins under `tests/server/`:
  `smell-write-found-by-integration-manifest-parity.test.ts`,
  `smell-write-final-a253-manifest-parity.test.ts` and
  `smell-widget-single-statement-cas-test-parity.test.ts`.

## The battery

    npx vitest run tests/server/smell-act082-new-cardtype-form-fields-parity.test.ts \
      tests/server/smell-act082-save-post-body-parity.test.ts \
      tests/server/smell-act082-select-owner-form-parity.test.ts \
      tests/server/smell-act082-type-select-all-options-parity.test.ts \
      tests/server/smell-act082-type-select-refresh-after-create-parity.test.ts \
      tests/server/smell-compare-journeys-provenance.test.ts \
      tests/server/smell-evaluate-follow-operations-parity.test.ts \
      tests/server/smell-run-all-parity.test.ts \
      tests/server/smell-check-chain-join-plan-parity.test.ts \
      tests/server/smell-apply-remote-widget-cas-parity.test.ts \
      tests/server/smell-audit-candidate-production-flags-parity.test.ts \
      tests/server/smell-discover-hosted-account-entry-parity.test.ts \
      tests/server/smell-verify-hosted-widget-content-parity.test.ts \
      tests/server/smell-verify-hosted-widget-views-parity.test.ts \
      tests/server/smell-verify-staging-probe-restoration-parity.test.ts \
      tests/server/smell-widget-single-statement-cas-test-parity.test.ts \
      tests/server/smell-write-final-a253-manifest-parity.test.ts \
      tests/server/smell-write-found-by-integration-manifest-parity.test.ts \
      tests/server/smell-row-r5-rig-applicability.test.ts \
      tests/server/smell-prepare-remote-widget-cas-parity.test.ts \
      tests/server/smell-prove-host-override-read-admission-parity.test.ts \
      tests/server/smell-read-private-index-progress-parity.test.ts \
      tests/server/smell-read-staging-isolate-probe-parity.test.ts \
      tests/server/smell-retire-owned-migration-credential-parity.test.ts \
      tests/server/smell-run-private-index-render-comparison-parity.test.ts

    -> 25 files, 125 tests, 125 passed, 0 failed.

The typecheck (`npx tsc --noEmit`) reports no errors at this commit.

Branch: `port/smell-test-round4-20261025` in KatsuJinCode/decko-ts.
