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
