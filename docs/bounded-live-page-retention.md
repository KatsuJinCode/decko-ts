# Bounded live-page retention

Completed collect-mode pages may retain proven rows and query answers for a
later request. Every use still reads the actual deck version, boots fresh
render engines, and renders under the request's viewer. The existing driver,
viewer, page, view and parameter key is unchanged. This is retained input
data, never a saved response or a shared permission verdict.

The per-driver idle cache now admits at most **eight pages** and **8 MiB of
estimated aggregate payload**, across **all viewer scopes combined** for that
driver; signed-in accounts do not each receive another budget. Each return removes all idle entries with an
obsolete version, even if the returning page is too large to admit. An older
concurrent completion is dropped when a newer snapshot is already idle. Taking
an entry transfers exclusive ownership to the request; eviction cannot close
an active owner's store. Rejected, replaced and evicted idle stores close
their own memos, never the underlying database driver.

Before idle admission, the completed store discards duplicate row/index
witnesses and **all** key/id/full/present/left-complete and discovery claims.
Only its existing exact and certified complete query answers survive, under
the same checked database version. An unseen query cannot infer an empty
answer from the removed indexes: it must fetch and prove completeness again.
Active/pending reads cannot be compacted. No new answer cache is introduced.

This budget is a conservative accounting policy, **not an RSS or V8 heap
guarantee**. Admission traverses all remaining owned data, including certified
and exact answer arrays, metadata, seeds and references. It counts UTF-16
string storage at every occurrence, object/property and collection slots,
arrays and supported binary buffers. Shared object cycles are visited once;
shared strings may be charged repeatedly. Work stops at the byte budget,
100,000 visits or depth 64. Large arrays/buffers are charged before reflecting
their indexes. Unsupported prototypes, opaque promises, functions, symbols or
accessors refuse retention instead of estimating hidden ownership. No rows are
serialized to JSON and no getters are invoked to inspect the payload.

Known store containers expose shallow ownership descriptions that include all
their own fields, so future fields are examined too. The sole external owner
excluded is the shared base database driver. The completed request's abort
signal is detached before admission; a later request installs its own signal.
Unknown new container types make an entry ineligible. Request-local rendering,
`keep: false` and the existing `DECKO_LIVE_KEEP=0` controls remain available.

The count-only `keptLivePageDiagnostics(driver)` accessor reports entry count
and estimated bytes. It exposes no row, SQL, URL, viewer or credential values;
unused diagnostics can be removed from serving bundles. It does not measure
allocations retained elsewhere in the engine, coordinator or runtime.

## Evidence and validation scope

The private `heap-causal-e8f9b2e7-keep` bundle records the original bounded
diagnostic on the same compiled engine, two fresh identical local mirrors,
explicit keeping on/off and twelve pages with one real create. Post-GC heap
ended at 308.1 MiB on versus 49.7 MiB off. Both completed below the 400 MiB
diagnostic guard; the slow-query argument ledger was empty and each request
ledger had fourteen entries. This isolates a substantial effect of retaining
page inputs, without claiming every heap owner was measured.

All pages returned 200 under the admin actor, with matching response lengths.
Raw hashes differ: every differing character was inside existing volatile
`data-slot-id` attributes. Original bodies remain unchanged. This attribution
is not a new normalization or a passing exact-byte gate. Explicit GC makes
these memory observations unsuitable for performance claims.

The separate private `bounded-live-retention-e8-20261016` bundle preserves all
iterations. The first size-only implementation bounded heap but rejected the
real Home payload: repeat stayed at 55 SQL statements. It is not accepted as
the completed repair. Count-only diagnostics found 9,674 full witness rows,
36 exact answers and 1,441 certified answers. A prototype experiment identified
the duplicate witnesses; that experiment is separate from the actual shipped
code capture.

The final compiled code ran the unchanged twelve-page workload with keeping
on: peak retained post-GC heap was **31.8 MiB**, final **31.6 MiB**, all twelve
pages returned 200, and the actual create returned 303. Compared with original
raw bodies, all differences remain confined to volatile slot IDs. A separate
consecutive real Home repeat went from 55 SQL statements to **3**, approximately
1,216 ms to **96 ms**; post-GC heap was 27.7 to 28.4 MiB. These explicit-GC,
bounded diagnostics demonstrate useful reuse and lower retention, not a hard
process-memory limit or full browser/performance acceptance.

Twenty-four controls in five files pass, including unchanged real warm reuse,
permission/content freshness and actor isolation; actual SQLite proves that an
unseen projection refetches after witness removal. Typechecking passes. The
engine bundle is **9,998,912 bytes**, leaving **1,088 bytes** below its existing
limit. Full side effects and complete browser journeys on the integrated
candidate remain separate release requirements.

The accounting approach follows the distinction between reachability and
process memory in [MDN's memory-management guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management)
and [Node's memory diagnostics](https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory).
