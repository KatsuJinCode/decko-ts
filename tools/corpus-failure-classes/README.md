# tools/corpus-failure-classes

Classification of engine-vs-Ruby render failures over the anonymized
corpus: which structural shapes produce a mismatch, how many cards each
shape covers, and one representative per shape.

## What is in here

- `failure-buckets.json` — the canonical bucket census. One JSON object:
  - `targetPopulation` — cards the classification covers
  - `sampleSize` — sampled rows the counts were measured on
  - `shardSum` — population total across shards
  - `bucketCount` — number of distinct structural buckets
  - `buckets` — keyed by bucket index; each carries `signature`
    (normalized failure signature), `count` (scaled to the population),
    `sampleCount` (raw sampled count), `representative` (one
    corpus:shard:render pointer), and `mechanism` (one-line cause)
  - `method` — how excerpts were normalized and matched to buckets
- `classify-render-realfails.mjs` — produces the census above (its
  default output path is `failure-buckets.json` in this directory).
- `classify-structure-pending.mjs`,
  `classify-structure-pending-fields.mjs`,
  `simulate-structure-walk.mjs`, `trace-shard-0.mjs` — structure-rule
  classification and trace helpers used while closing the buckets.

## Reproduce

    node tools/corpus-failure-classes/classify-render-realfails.mjs

(see the script header for its arguments and corpus path).

Earlier per-run variants of the census (named for the fix round they
measured) were removed as duplicates of this canonical file; their
content remains in git history if a comparison is ever needed.
