# Typed new-card form database round trips

The signed-in new-card route rendered its chrome through `liveRenderPage`,
then booted a separate engine directly over the HTTP database driver for
the typed form. On the approved local 21,676-card source, that second path
issued thousands of serial name lookups and exceeded the request budget.
It also did not receive the request's cancellation signal.

`liveRenderView` uses the existing collect/final complete-answer rule for a
bare view. Every pass has a fresh engine, the request's viewer and session,
and the actual new-card type/name/content options. The final form still
comes from the shared mods; File/Image chooser and structured subcard
editors remain intact. The request store is never kept across form requests.
The signal stops further database trips after cancellation. The page key
distinguishes bare views from layout-wrapped pages.

## Bounded local measurements

Baseline source: clean `62b263383e0ae99d89b1e344b4bee912b9692bb0`, merging
the release lead's preset and font fixes. The actual edge bundle ran on the
owned Node SDK shim over owned loopback Hrana and storage emulators. No
hosted runtime, live provider, or external mail was used. The existing
approved source was copied using the harness's engine-schema builder, then
throwaway accounts were seeded only in that copy. The protected source's
SHA-256 remained unchanged before and after every probe.

| Request | Baseline | Batched form | Database HTTP trips |
|---|---:|---:|---:|
| `/new/Basic` | 503 at 20.081s | 200 at 2.657s | 1378 -> 15 |
| RichText name/content preset | 503 at 20.099s | 200 at 3.585s | 1405 -> 15 |

Basic's baseline recorded 1,414 SQL statements but only 673ms of SQLite
execution; 1,350 statements were identical lexicon-by-ID lookups. The
batched request used 86 statements. RichText used 119 statements after the
repair. These are bounded single observations, not median/p95 claims.
The local profile uses `DECKO_LIVE_RENDER=1` and local default render
settings, rather than copying any live credentials or fetching live config.

A separate bounded preset probe parsed the rendered form's actual inputs
and RichText textarea, then submitted them unchanged. The form returned
200 in 4.744s; final create returned 200 in 1.215s. The committed card had
type 3 and exact content `<p>Actual preset content</p>`, with `trash=0`.
The form timing still exceeds a three-second acceptance target; this
repair removes the serial-query regression, not every performance limit.

Private raw evidence is retained under
`tmp/newform-profile-62b26338`: baseline `report.json`, repaired
`report-batched.json`, `report-preset-save.json`, actual HTML, SQL shapes,
source/bundle hashes, and probe scripts. The copy and generated account
credentials remain private ignored artifacts. Baseline 503 HTML is retained.
The stale-looking nest-index warnings were not treated as proof of a bad
index: schema marker version and deck data version have different meanings.

## Checks and limits

The real-handler HTTP regression retains typed File/Image/Topic editors,
submits a Phrase form's actual query-provided content unchanged, checks no
form-render persistence mutations, bounds database HTTP requests, and checks
the final committed junction content. Existing upload HTTP coverage proves
draft preview, final create, and exact downloaded bytes. TypeScript
validation and the actual handler tests passed.

The focused form test passes with fewer than 20 HTTP database requests.
Restoring only the old direct-driver form implementation makes this same
test fail with 73 requests (exit 1). The broader six-test handler/cancellation
run passed in 41.65s; the strengthened focused form regression passed in
18.01s including process setup. An initial loose 80-request bound did not
detect the old implementation and was tightened before committing.

This does not establish full browser, hosted Bunny, PostgreSQL, MySQL, or
Ruby byte parity. The immutable supplemental capture at `7bac96cd` completed
six journeys but remains strictly red: external script 403s, account error
text differences, mail differences, and three signup updater stamps differ.
Those records were not normalized or reclassified by this performance fix.

## Saved-slot response follows the same batched path

A separate bounded Date write probe on the same owned copy isolated the
write from response rendering. The JSON update returned 200 in 0.817s
(54 database HTTP trips, 69 SQL statements, 23ms SQLite execution). An HTML
XHR soft update returned 200 in 20.789s (1470 trips, 1554 statements, 703ms
SQLite execution). Its 1413 serial lexicon queries came from the shared
write surface's direct `renderSlot` callback after the write committed.

The shared surface now accepts a host-owned `renderSavedSlot` callback,
after expiring the saved name as before. Bunny supplies its actual serving
boot over `liveRenderView`, with a fresh session lookup, fresh viewer-bound
engine per pass, request context (or the existing isolate lock), no kept
rows, and the inbound request's abort signal. The card write, transaction,
integration callbacks, success selection, and expiry sequence are unchanged.
Other hosts retain their existing default callback; this is not a claim of
Cloudflare performance improvement.

The repaired HTML Date update returned 200 in 1.682s (58 trips, 101 SQL
statements, 431ms SQLite execution); JSON control remained 0.873s. Its actual
HTML displayed March 3, 2028, and the committed Date content was exactly
`2028-03-03`, type 17, trash 0. The protected source hash remained unchanged.
Raw baseline and repaired evidence is `report-date-write.json` and
`report-date-write-batched.json`, with the actual response bodies and scripts
in the same private evidence directory. The profiler's existing
`render;dur=0` on writes does not measure response rendering separately;
these timings are measured from the actual complete HTTP responses.

An actual HTTP regression creates a Date, performs an HTML XHR soft update,
requires the committed leap-day text and edit link in the returned slot,
checks exact stored content/type and exactly one new act, and bounds the
database requests. The focused regression passed in 7.40s including setup;
TypeScript validation passed. These are local measurements, not hosted or
complete-journey acceptance.

## XHR editor reads

The signed-in read handler explicitly selected its direct-driver branch
for every XHR request, even when the ordinary page qualified for live
rendering. On the same owned copy, actual GET `/Local_Profile_Preset/edit`
with `X-Requested-With: XMLHttpRequest` returned 503 at 20.309s: 1420
database trips, 1445 statements, 749ms SQLite execution, no edit modal.

Eligible XHR requests now use `liveRenderView` with their actual view and
params, no kept form store, and the existing cancellation signal. A focal
`slot[main]=true` refresh instead uses the existing page prepare with its
bare-main options, preserving the slot's `_main` syntax/home view while
omitting the layout. Ineligible histories and the explicit live-render
off switch retain their existing dispatch. Kept-page keys bind bare-main
options as well as bare/full view identity.

The repaired actual XHR returned 200 in 1.215s with 7 trips and 45 SQL
statements, including the real modal, TinyMCE textarea, and existing rich
content. Raw controls are retained in `report-xhr-edit.json` and
`report-xhr-edit-batched.json`, with response HTML and scripts. The focused
real-handler HTTP regression checks both the RichText modal and focal slot,
requires the actual content and slot syntax, rejects a full-page response,
checks no stored-row changes, and bounds modal requests. It passed in 7.12s
including process setup; TypeScript validation passed.

### Measurement provenance limits

The ad-hoc raw reports' `sourceCommit` field was inherited from the first
control script and identifies the clean control lineage, not the exact
later dirty builds. Every report records its actual bundle SHA; the initial
control is clean 62b26338, the form patch became 60c1c030, the saved-slot
patch became 751a1d7b, and the XHR patch is this change. Later probes were
executed with the stated source patch before its commit. Their raw records
are retained unchanged; they are bounded diagnostic evidence, not strict
clean-candidate provenance receipts or cross-runtime parity grades.

## Slotter main context must not disable batching

The remaining slow ID-based slot refresh and `name_form` requests used the
same dispatch branch. Their `main` query parameter became
`historyParams.search.main`, and the live-render admission guard rejected
every nonempty params object. It therefore sent these requests back through
the direct driver. The guard now admits a main-only search context, carrying
it unchanged into rendering; actual history selectors and keyword/paging
contexts retain their prior gate until separately proven.

The exact recorded `~10857/titled` focal query (including duplicate main,
slot main/nest/layout args) returned 200 in 20.000s with 1389 database HTTP
trips on the owned approved copy. After repair it returned 200 in 1.199s
with 6 trips. A cold `name_form` request with the real slotter parameters
took 19.392s/1389 trips; after repair, 0.715s/7 trips. Both retained their
bare main-slot syntax and the name form retained its actual name input.
An earlier second request's 0.096s name form was cache-warmed by the raw
first request; that record is preserved and is not used as cold evidence.

The actual-handler modal/focal test now carries main context and the
recorded ID-slot argument shape. Its less-than-20-trip assertions and
stored-row nonmutation check pass (5.12s including setup). Eleven real
search/adapter controls pass separately. A broader keyword admission trial
was RED: missing REGEXP errors surfaced from speculative flush outside
the existing CQL fallback. Those 500 responses are preserved in
`report-main-search-batched.json`; this checkpoint does not enable that
keyword path. The main-only observations remain valid for the narrower
gate. Raw cold controls are `report-main-context.json` and
`report-name-context-cold.json` in the private evidence directory.

## Capability-sensitive CQL reads keep their call-site errors

The keyword trial exposed an existing speculative-read boundary problem:
CQL's real missing-REGEXP error was deferred until `flushSpeculative`, outside
`executeQuery`'s established no-UDF catch. That prevented decision 0005's
complete-candidate post-filter from running and returned 500.

The request store now executes REGEXP SELECTs at the actual query call site,
keeping successful answers as request-store facts. Original errors propagate
unchanged to the caller. CQL consequently executes its existing fallback
with every candidate, then filters and applies the requested limit/offset.
No missing-function error is treated as an empty result; unrelated errors,
malformed patterns, and read-only/abort boundaries remain failures.

Real SQLite with its registered UDF and real Bunny/Hrana HTTP without a UDF
both pass positive, second-window, exact count, empty-negative, and malformed
regex controls through speculative request stores. Restoring the old store
makes the no-UDF control fail (exit 1) when flush raises the missing-function
error. The fixed controls and cancellation test pass in 3.34s; TypeScript
validation passes. This change alone does not broaden route admission;
keyword/paging admission requires its separate actual HTTP/browser proof.

With that call-site behavior verified, route admission now permits the
supported search params object (vars/term/paging/main), while any actual
history selector still takes its established route. The actual approved-copy
negative keyword returned 200 in 2.575s/13 trips with zero result IDs. The
positive keyword returned 200 in 2.185s/14 trips and included the owned Date
and RichText cards; offset 1 returned 200 in 2.574s/14 trips and its first
19 IDs exactly matched the first page's final 19 IDs. This is a real result
window change, not a successful error page. The Date HTTP control also
checks a main-context focal refresh displays the committed leap day.

Twenty-one actual HTTP/search/native/no-UDF/cancellation tests pass in
42.85s, with TypeScript validation green. The earlier keyword 500 trial is
retained. `report-keyword-callsite.json`, complete response HTML, source
lineage and actual bundle hash retain the bounded diagnostic evidence.

## New-form phase profile

A separate ignored diagnostic bundle instrumented only the chrome/form
boundaries in memory through esbuild's onLoad hook. The original tracked
source and normal distribution remained unchanged. Its manifest pins clean
a72c3bac, original source hash, instrumented bundle hash and build-script
hash; it is explicitly diagnostic rather than the production artifact.

| Form | Page shell | Typed form | Total |
|---|---:|---:|---:|
| Basic | 1.211s / 7 trips / 44 SQL / 641ms SQLite | 0.782s / 4 trips / 38 SQL / 311ms SQLite | 2.053s |
| RichText preset | 2.058s / 7 trips / 78 SQL / 890ms SQLite | 0.811s / 4 trips / 37 SQL / 347ms SQLite | 2.925s |

Both independent stores fetch about 1930 full rows and 7560 identity rows.
The shell completes eight passes and the form five. Inclusive process CPU
and actual SQLite execution times are recorded per boundary; the existing
pass field named cpu_ms measures elapsed pass time and is not claimed as CPU.
This establishes duplicated request-local fetch work for future bounded
optimization. It does not turn the release lead's 3–4.5s failures into green
or establish a median/p95. Raw `phase-report.json`, `phase-build.json`, virtual
instrumentation build script, and unchanged HTML are preserved privately.

## One-request facts shared by the shell and typed form

The new-form helper now owns a sequential `LiveRenderScope` for its shell
and form. It retains only database answers. Every render pass still boots
fresh engines and prepares permissions for the same actor. The scope binds
the database driver, viewer key and abort signal, rejects overlapping use,
and closes in the helper's finally block. It disables the global kept-page
cache. No scope crosses an HTTP request or wraps a write transaction.

Before each view, the scope reads the real `deck_data_version` from the base
driver. A changed or unavailable stamp discards every retained answer; an
infrastructure error propagates. Prior result statistics are copied so the
next view cannot reset an earlier result's measurements.

The same approved 21,676-card source copy produced these bounded diagnostic
measurements. These are individual observations, not median/p95 or release
acceptance:

| Form | Independent stores total | Scoped total | Scoped form phase |
|---|---:|---:|---:|
| Basic | 2.053s | 1.514s | 0.217s / 4 trips / 16 SQL / 72ms SQLite / 15 fetched rows |
| RichText preset | 2.925s | 2.434s | 0.310s / 4 trips / 16 SQL / 125ms SQLite / 11 fetched rows |

The form previously fetched about 9,490 rows. Each scoped view adds a real
stamp read; this is a reduction in duplicate rows and execution work, not
a claim of fewer total round trips. `phase-scope-report.json` and
`phase-scope-build.json` pin the diagnostic bundle and source diff. The
artifact's commit identifies its base; the source was dirty with this
prototype and is not represented as a clean candidate run.

The freshness proof changes a real permission rule and its party references
in an independent committed SQLite transaction exactly between chrome and
form. An ordinary member first receives a real create form (200). With the
stamp moving 652→655 between phases, the same request then returns 403 and
no create form. Omitting only version invalidation in a separate negative
diagnostic bundle (664→667) returns a stale form with 200 and deliberately
fails acceptance/exit 1. The unsafe diagnostic is never installed in source.

This probe also exposed an existing status defect: a denied typed form
discarded the render's status and returned 200. The helper now prepares a
focal form and propagates its actual status. The earlier guarded-but-200
record remains RED. The actual HTTP regression checks member denial, admin
permission, and rejection of submission from the previously allowed form,
with exact cards/history/sequence snapshots unchanged after the refusals.

The real SQLite regression independently changes content and read-rule
references between scoped views, verifies version movement, 403, unchanged
prior statistics, and viewer/request isolation. Temporarily omitting the
version check makes this regression fail on stale content (exit 1).

Private raw evidence is under `tmp/newform-profile-62b26338/`:
`scope-permission-focal-report.json` is the guarded positive;
`scope-permission-no-version-report.json` is the failing omission control;
`scope-permission-report.json` preserves the earlier HTTP-200 defect.
Each has original response HTML, build metadata and logs. Source database
SHA-256 remains `edcc11bc32a8e0b1ec3529aeb9240c6201cc7c39191e0c2ebe618795838815bc`.
The probe's unrelated cold ID-mark rule update failed before measurements;
that failed setup is preserved in `console-scope-permission-fixed.log` and
is not claimed fixed. The subsequent permission probe uses the actual named
route to isolate this scope boundary. All requests use owned loopback
Hrana/storage emulators; no hosted runtime acceptance is asserted.

The final targeted run passed all 12 tests across the actual HTTP, request
scope, CQL capability and cancellation suites in 62.54s. TypeScript validation
also passed. Raw phase bundles, HTML, scripts, positive and negative records,
and test logs are preserved with a SHA-256 manifest outside the worktree at
the private evidence bundle `newform-request-scope-c3b06650`, withheld from the public package.
