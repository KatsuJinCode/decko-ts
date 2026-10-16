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
