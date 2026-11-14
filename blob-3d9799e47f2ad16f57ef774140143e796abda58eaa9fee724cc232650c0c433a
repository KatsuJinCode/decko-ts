# Cold autocomplete preparation

The shared edge JSON route rendered `search_box_complete` directly on its
retained engine. A fresh request therefore walked 1,605–2,398 SQLite
statements before returning suggestions. A warm retry did not demonstrate
acceptable first-request behavior.

`c0649cab` uses the existing request-local bare renderer for this JSON view.
Each pass boots a fresh engine over the request's batched facts; a response
is returned only when no speculative answer or missing render demand remains.
The actor, search parameters, JSON format, original URL, compression option,
cancellation signal and existing context/lock lifecycle remain in force.
`liveRenderView` keeps no suggestion facts or responses between requests.
Other JSON views and the explicit live-render off switch retain their route.
The normal fallback installs its own name environment before rendering,
which the mixed normal/live actor controls showed was necessary.

`7aae57f6` also omits the unrelated help-rule preparation only when
`liveRequest`, JSON format and `search_box_complete` all apply. Stock
`card-mod-search/set/self/search.rb` and `set/all/autocomplete.rb` compose
search/add/goto labels and optional image icons; they do not render help
fields. Default HTML and unbatched/corpus preparation remain unchanged.

## Actual local measurements

The approved existing engine-schema mirror derives from the protected
21,676-card deck and contains prior owned probe rows. Each actor/term below
used an independently started local host and its first suggestion request.
The original protected database SHA was checked before and after each run.
The unmodified production bundle ran through the local Hrana/storage host;
this is not a hosted Bunny runtime measurement.

| Actor / term | Original cold | Final cold | Statements, original → final | Same-origin raw bytes |
|---|---:|---:|---:|---|
| Admin / `202` | 21.549s | 2.136s | 1605 → 61 | Equal |
| Admin / `Home` | 21.577s | 1.443s | 1646 → 61 | Equal |
| Anonymous / `202` | 27.073s | 1.657s | 2398 → 64 | Equal |
| Anonymous / `Home` | 24.030s | 1.582s | 2142 → 64 | Equal |

The final candidate first answered each cold request through the batched
path, then rendered the same request through the unbatched path on the same
origin. Every status and complete JSON string matched exactly. No address,
slot, label or result normalization was used. All four satisfy the existing
three-second request gate. **All four still exceed the owner's one-second
budget.** These bounded observations are not a median, p95, universal
performance guarantee or release acceptance.

The intermediate batching-only run preserved bytes but exceeded three
seconds in three cases (1.775–3.848s); those failures remain preserved.
Final SQLite execution alone cost 0.622–1.135s, leaving meaningful work
before the one-second goal is met.

## Controls and preserved attempts

Focused HTTP controls compare complete JSON strings for anonymous, member
and administrator views, ordinary/exact/restricted/virtual names, and a
real permission-reference mutation between requests. They also assert no
card-row mutation. The JSON format/unsupported-route controls pass; the
final narrow controls passed in 13.91s and TypeScript compilation passed.

An initial measurement helper incorrectly treated the Hrana aggregate
ledger as an array; its failed report and raw responses are preserved.
The corrected baseline captured all four timings and statement counts.
A proposed synthetic query-count ceiling also passed when batching was
deliberately omitted, so that ceiling was removed and is not claimed as a
performance regression test. A bounded CROSS JOIN experiment was slower
and changed result order; it was rejected without a source change.

Private evidence-bundle ID: `cold-autocomplete-9b-c064`. It contains the
separate source/build/configuration receipts, unchanged raw responses,
measurement errors, intermediate failures, tests and research records.
The bundle includes the private measurement tool and its invocation receipt.
It requires explicit approved local source, mirror and configuration inputs
and a new output directory; it never reads provider credentials. Normal build:

```powershell
node tools/bundle-bunny-edge-engine.mjs
```
