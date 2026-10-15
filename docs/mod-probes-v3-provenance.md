# Canonical isolated mod probes

This fixture versions the isolated event plan and Ruby 3.3.12 reference capture.
It does not replace the published `synthetic-v2-mod-probes` fixture.
The published v2 tree is restored byte for byte from `e51125a9`. The isolated
Ruby 3.4.11 capture is retained unchanged under
`expected-historical-ruby34/`, with its original source manifest and metadata
hash. That directory is historical evidence, not canonical expectations for v3.

The original v2 input digest at commit `e51125a9` is
`54a00c175df798fcc274503e25bc26dab738d513896687b0fb57cac109443726`.
The corrected isolated input digest, including all operation lists and the built
deck, is `bf8e1fe991b18c1ec7e34baeb521be69c36fce3ac4c9eb8068ed6b0f7132ddbf`.
All 16 input files are pinned by this fixture's manifest. The unchanged
`deck.json` retains its historical dataset name; the manifest and directory name
identify this fixture version.

The canonical capture began against the corrected input bytes while they were
stored under the v2 directory name. Any imported capture must preserve the
original run metadata and source manifest as provenance, prove that every input
hash agrees, and leave every answer byte and interpreter record unchanged.
`tools/compat-report/import-probe-capture.mjs` enforces those conditions and
refuses partial captures, differing inputs and noncanonical oracle versions.
The resulting `capture_origin` explicitly distinguishes the recorded source
name from the storage name. It is not a new execution.

Expected output is accepted only after a full Ruby 3.3.12 capture, followed by a
full port grade. No match rate is claimed by the fixture's existence alone.

Verification of the versioning reconciliation: both fixture manifests match
their inputs, the v2 tree has no difference from `e51125a9`, and all 131 runner
tests passed in 77.960 seconds.
