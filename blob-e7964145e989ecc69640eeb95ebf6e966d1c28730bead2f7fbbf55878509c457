# CPU per page: Ruby Decko vs the port

Measured 2026-10-14 on Windows x64 (Ruby 3.4.11 x64-mingw-ucrt, Node 24.19),
synthetic-v1 deck, the 292 anonymous full-page renders in
`reference-harness/fixtures/synthetic-v1/ops/render.jsonl`.

| Engine | CPU ms per page (warm) | Wall ms per page |
| --- | --- | --- |
| Ruby Decko 0.20.0 / card 1.110.0 (oracle adapter) | 401.1 | 449.5 |
| decko-ts (ts adapter, Node + SQLite) | 6.07 | 5.82 |

Ratio: Ruby spends 66 times the CPU per page. 584 renders each (2 rounds).

## Method

`node benchmarks/energy/measure-cpu-ratio.mjs --rounds 2 --json <out>`, with
the oracle bundle's gems on `BUNDLE_PATH=<ruby-gems-dir>`.

Both engines are driven through their reference-harness adapters with the
same protocol requests. Each adapter renders every page once to warm up, then
the script reads the CPU time (user + kernel) of the adapter's whole process
tree, renders the page list again `--rounds` times, and reads it again. Boot
is excluded.

## Caveats

- The Ruby oracle adapter boots Rails in development mode and switches
  `Rails.env` to `production` around each render (`reference-harness/oracle/adapter.rb`
  `with_production_render`). Classes are not eager-loaded and Rails'
  development settings stay in effect, so a production-booted Ruby server
  would likely be somewhat faster. A production-booted measurement has not
  been made.
- The port side is the Node engine over SQLite, not workerd; workerd figures
  for the edge are in `docs/cost-model.md`.
- Both run in-process with a local SQLite deck, so neither includes network
  or database-server time. CPU time stands in for energy; it is not a power
  measurement.
- The Windows CPU counter ticks every 15.6 ms; with 584 renders that is
  under 0.03 ms per page of resolution.
