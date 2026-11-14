# Prospective browser network timing

The frozen `eb1fb666` checkbox journey took43.968s. Its recorded steps sum
to33.697s, its engine-ready measurement is3.371s, and6.900s remains in
unsegmented setup/closeout. The first Submit step took12.289s; corresponding
first submits in radio and multiselect took13.051s and11.369s. Phrase and
Ace editor fills took0.516s and0.460s, so the earlier fixed thirty-second
editor predicate is not this recorded delay.

The immutable network records show the first Submit's POST followed by a
full document GET and its assets. They contain no request duration,
Server-Timing or step start stamp, so they cannot establish whether the
12.289s belongs to the POST, redirected document, assets or subsequent
settling. The captured local mail transport simply appends messages; there
is no external SMTP wait in this configuration. Mail preparation and
database work still require actual measurement.

One confirmed repeated cost is asset traffic:99 recorded requests include
61 external requests. jQuery, Ace, jquery-ujs, Select2 and OpenSans each
appear eight times; Google Fonts CSS appears sixteen times. The existing
browser `context.route` privacy filter is enabled, and Playwright documents
that enabling routing disables HTTP cache. This establishes repeated work,
not its share of the twelve-second step. No cache or network-policy change
is made from this observation.

## Additional capture fields

`recordJourneyNetwork` preserves `network`'s response/failure observations
and existing fields. Future captures also record:

- `networkRequests`: one trace per observed request, stable request and
  capture IDs, redirect links, terminal state and monotonic observer stamps.
- Each response's actual `Server-Timing` header, and the whitelisted numeric
  fields from Playwright `Request.timing()`.
- `networkUnfinished`: requests without an observed finish/failure when the
  context closes. They do not acquire an invented successful HTTP outcome.
- `networkTiming`: format, observer clock, context start/close stamps and
  explicit timing-read errors. Fresh contexts use distinct capture IDs.
- Step `startedAtMs` and `finishedAtMs` on the same Node monotonic clock as
  observer stamps, retaining the original wall-clock `ms` field.

Clock domains remain separate. Observer stamps use Node `performance.now()`;
Playwright `startTime` is epoch milliseconds, while its remaining fields
are milliseconds relative to `startTime`. A raw `-1` remains unavailable;
it is never replaced with zero. `responseEnd` is refreshed on
`requestfinished`, after the response body completes. HTTP503 is an ordinary
HTTP response/finish, not a fabricated transport failure. A body failure
after headers retains both original network observations and one failed
request trace.

Only origin hostname and pathname are stored from URLs. Query values, URL
credentials, request/response bodies and unrelated headers remain excluded.
The existing route allowlist, browser cache behavior, fixture, journey
definitions, product assertions and historical raw captures are unchanged.

Ten lightweight event controls cover lifecycle timing, redirects, failed
and unfinished requests, HTTP errors, missing events, repeated contexts,
partial-body failures and the privacy boundary:

```powershell
node --test reference-harness/browser/test/network-recording.test.mjs reference-harness/browser/test/network-timing.test.mjs
```

These controls validate the recorder, not the actual critical path. A new,
bounded pointer capture is still required after the active full run closes;
none of these fields is retroactively claimed for the frozen capture.
The implementation follows the official
[Request timing and redirect API](https://playwright.dev/docs/api/class-request)
and [BrowserContext network events](https://playwright.dev/docs/api/class-browsercontext).
