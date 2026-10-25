# reg-redteam-cfg-deck_origin

- Roster row: family `register-redteam`, label `deck_origin config key`,
  verdict PORTED, bucket DONE.
- The row's sourceParent: `deck_origin (railtie config key) -> PORTED
  (missed)`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1097): `deck_origin | PORTED (missed)
  | src/card/render/deck-origin.ts (+ format/script mod references)`.

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

The config key is read in ONE port file, with two install channels:

- `src/card/render/deck-origin.ts`. The file's header (lines 3-18) quotes
  the key's Ruby value (`serializable.rb:20-22`, `Cardio.config.deck_origin
  || "#{protocol}#{request&.host_with_port}"`) and names the railtie
  default (line 12: "the railtie default is nil, cardio/railtie.rb:28
  `config.deck_origin = nil`"). The key's port-side seat is
  `deckEnvironment.origin`: the requestless default `NO_REQUEST_ORIGIN`
  (line 60), the reader `envOriginForSurface` (lines 70-73, which answers
  the configured origin when one is installed and "" otherwise), and the
  write seam `setDeckEnvironment` (lines 92-94).
- WHO INSTALLS IT: the edge boot
  (`deploy/bunny-worker-src/bunny-edge-deck-boot.ts:264`,
  `if (opts.deckOrigin !== undefined) setDeckEnvironment({ origin:
  opts.deckOrigin })`, fed from the served deltas' `DECKO_DECK_ORIGIN` read
  at `deploy/bunny-worker-src/bunny-edge-served-deltas.ts:374`) and the
  reference harness's deck spec
  (`reference-harness/adapters/ts/adapter.ts:100`). The file's own header
  (lines 20-47) records why the origin is configuration and never an engine
  constant.

The register's file cite (`src/card/render/deck-origin.ts`) is exact. The
row's claim is unchanged.

## The original side, read and recorded

- The key's own assignment:
  `card-1.110.0/lib/cardio/railtie.rb:28` `config.deck_origin = nil`.
- The key's reader:
  `card-1.110.0/lib/card/env/serializable.rb:21`
  (`Cardio.config.deck_origin || "#{protocol}#{request&.host_with_port}"`),
  which `card_url` (env/location.rb:19-21) consumes; the port's own
  consumers of `envOriginForSurface` are the same surfaces (the :url views
  and the page's decko.rootUrl, `src/card/render/views.ts:6623`,
  `src/card/render/page.ts:1407-1413`).

## The prior receipt for this row

None in the repo: the register B table (line 1097) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
