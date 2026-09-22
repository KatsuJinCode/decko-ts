# Shadow router notes — T5 of #1282

## What this is

The skeleton for [issue #1282's T5][t5]: a Node HTTP proxy that fronts the
Ruby Decko upstream and the decko-ts upstream side-by-side, returns the
Ruby response to the client (shadow mode never affects users), and
records a per-request comparison in a JSONL log so the parity work can
graduate from controlled corpus runs to live-traffic evidence.

The skeleton ships as three files in `tools/shadow/`:

- `shadow-router.mjs` — the proxy + JSONL appender.
- `shadow-report.mjs` — JSONL aggregator + text summary.
- `routes.shadow.json` — the policy file the router loads at start.

Plus `tests/tools/shadow/shadow-router.test.ts` — the harness proof (two
in-process http stubs in place of Ruby / TS, end-to-end assertions on
the proxy's contract).

[t5]: https://github.com/KatsuJinCode/decko-ts/issues/

## How this becomes the cutover evidence (#10 / #11)

The work board ([#10 delivery verification][10], [#11 measured metrics][11])
needs two things this skeleton is meant to provide:

1. **A reproducible run against real traffic.** Point
   `RUBY_UPSTREAM` at the production Ruby Decko server and `TS_UPSTREAM`
   at the decko-ts deployment, choose a low `sampleRate` (1–10), and
   let the proxy run for a representative window. The router returns
   Ruby bytes unchanged, so production users see no behavior change.
2. **A report that shows where the two engines diverge.** Run
   `shadow-report.mjs shadow.log.jsonl` and read off:
   - the global `same%` (parity bar),
   - the path-pattern clusters (`/cards/<id>`, `/cards/<name>`,
     `/admin/<segment>`, etc.) and which differ most,
   - the first-diff-offset histogram — where in the rendered body the
     TS engine first diverges (template header vs layout footer vs
     per-card body — very different remediation paths).

The transition path is: **corpus parity (today) → shadow-1% on live
traffic (this router, narrow policy) → shadow-100% (broader policy) →
cutover**. Each rung is gated on the same-pct metric from the report.

[10]: https://github.com/KatsuJinCode/decko-ts/issues/10
[11]: https://github.com/KatsuJinCode/decko-ts/issues/11

## How the router is wired

```
   client ──> shadow-router ──> Ruby (primary, awaited, returned to client)
                │
                └──────────> TypeScript (shadow, awaited only for logging)
                                   │
                                   └──> JSONL log (per request)
```

The router buffers the request body **once** and forwards the same
`Buffer` to both upstreams. That is the only safe way to replay a POST:
the `IncomingMessage` stream is single-pass; if the proxy handed the
live stream to Ruby and a buffered copy to TS, the two upstreams would
see different bodies on a slow connection.

## Policy modes

`routes.shadow.json` accepts four shapes:

```jsonc
// Everything, every request — useful for staging.
{ "mode": "shadow-everything", "sampleRate": 100 }

// Allowlist only — useful for canarying one controller.
{ "mode": "shadow-allowlist", "allowlist": ["/cards/*", "/admin/dashboard"],
  "sampleRate": 100 }

// Blocklist only — useful for excluding a known-noisy path.
{ "mode": "shadow-blocklist", "blocklist": ["/admin/health"],
  "sampleRate": 100 }

// Mixed: allowlist the routes that matter, sample at 1%.
{ "mode": "shadow-allowlist", "allowlist": ["/cards/*"], "sampleRate": 1 }
```

Patterns are simple globs: `*` matches any run, `?` matches one char,
everything else is literal. The match is anchored at both ends so
`/cards/*` matches `/cards/42/edit` but not `/admin/cards/42`.

Percent sampling uses an FNV-1a hash of `method + " " + path` modulo
10000. The decision for any given `(method, path)` is fixed for a given
rate; raising the rate can only add requests to the shadowed set, never
remove them. The unit test `percent sampling monotonicity` proves this
property directly.

## Log record shape

One JSONL record per request, in append order:

```json
{
  "timestamp": "2026-09-21T12:34:56.789Z",
  "method": "GET",
  "path": "/cards/42?x=1",
  "rubyStatus": 200,
  "tsStatus": 200,
  "rubyBytes": 12,
  "tsBytes": 12,
  "verdict": "same | diff | skipped | ts-error | ruby-error",
  "firstDiffOffset": 6,
  "contentTypeMatch": true,
  "diffKinds": ["body"],
  "tsError": "ECONNREFUSED"
}
```

`firstDiffOffset` is `-1` when bodies match exactly and the truncation
point (`min(len)`) when one body is a strict prefix of the other. The
report's offset histogram clusters these into `[0,1) [1,10) [10,100)
[100,1000) [1000,10000) [10000,∞)` so a "diff at byte 2" looks very
different from a "diff at byte 8000" (the latter is usually a layout
footer mismatch).

## What production hardening it still needs

This is a skeleton. The following are honest gaps — they are NOT
silently handled; each is listed so the next reviewer knows what to
fund before this faces live traffic.

### Timeouts

The skeleton has **no timeouts**. A hung upstream will hold the proxy
socket open indefinitely. Needs:

- `req.setTimeout(N)` on the proxy's incoming socket (default ~2 min
  in Node 24, should be tightened to a per-route budget).
- A timeout on the upstream `http.request` (via `req.setTimeout(N)` +
  `req.on("timeout", ...)`), with the same per-route budget. On
  timeout, the shadow side is logged as `ts-error` and the Ruby side is
  abandoned (the user sees a 502). The current code resolves the Ruby
  promise only on natural completion; that needs an `AbortController`
  racing the timeout.

### Error pages / 5xx handling

Today, a Ruby 5xx is forwarded verbatim to the user and the log records
`rubyStatus: 500, verdict: "skipped"` (no shadow if policy is 0; with a
shadow policy, the diff against TS is recorded but the user still sees
the Ruby 5xx). There is no retry, no circuit breaker, and no fallback to
TS when Ruby fails. The skeleton returns the literal upstream body for
all status codes; production should at minimum set a sane
`Retry-After` and consider a "fail-over to TS" mode toggleable per
route.

### Authentication headers

The skeleton forwards the client's headers as-is, including `Cookie`,
`Authorization`, `X-CSRF-Token`, etc. That is correct for the live-
traffic shadow case (you want to compare the two engines on the SAME
authenticated request). What is **not** correct:

- The skeleton sets `Host` from the upstream URL, not the original
  request. Production must preserve `X-Forwarded-For` /
  `X-Forwarded-Proto` for apps that gate on them, and must strip
  `Cookie` headers when shadowing against an env that cannot be
  trusted with production credentials (e.g. shadowing a staging TS
  against prod Ruby).
- The `Authorization` header is forwarded to BOTH upstreams. If TS is
  a deployment under a different auth realm (it usually is during
  canary), this leaks prod credentials. The router needs a
  header-rewrite hook keyed off the upstream.

### POST body replay caveats (already partly handled, partly not)

- ✅ **Buffered once, replayed as the same `Buffer`** — covered.
- ✅ **content-length reset to the buffered length** — covered.
- ⚠️ **Streaming uploads** — the skeleton reads the whole body into
  memory. A 200 MB upload will buffer 200 MB. The proxy needs an
  upper bound (e.g. 10 MB) and a 413 response past it, OR a true
  TeeStream that pipes the request body to both upstreams in parallel
  (Node 18+ has `stream.passThrough` + manual fan-out; this is the
  production answer).
- ⚠️ **Replayed body integrity** — if the upstream signs the body
  (HMAC, AWS-style), both signatures must be valid. The skeleton
  doesn't sign; it just forwards.
- ⚠️ **Idempotency keys** — a POST that triggers an action in both
  upstreams will trigger TWO actions (one Ruby, one TS). The skeleton's
  policy is to forward to TS anyway. For non-idempotent endpoints
  (signup, charge, send-mail), the router MUST blocklist them
  (`shadow-blocklist`) until TS is known-safe.

### HTTPS upstreams

The skeleton uses `node:http`. If `RUBY_UPSTREAM` or `TS_UPSTREAM` is
`https://`, the request will currently go to the right hostname over
HTTP (because `new URL(...).port` is used and `http.request` ignores the
scheme). Production must switch on `url.protocol === "https:"` and use
`node:https`, including the `rejectUnauthorized` decision (verify the
chain against the right CA bundle — staging CAs are not the same as
prod CAs).

### Other production-readiness gaps

- **Concurrency / back-pressure.** The skeleton has no per-upstream
  concurrency cap. A burst that fills Ruby's pool will also fill TS's.
  Add a semaphore or use Node's `Agent` with a `maxSockets` cap.
- **Keep-alive.** A new `http.Agent` is created per upstream request.
  Production wants a persistent agent per upstream so connection
  setup isn't paid on every shadow.
- **Log rotation.** `appendFileSync` with no rotation will fill the
  disk. Need a daily-rotate or a size-based ring.
- **Schema versioning.** The JSONL record shape will change as we
  learn what to compare. The router should write a `schemaVersion`
  field so old logs stay parseable.
- **Body truncation in the log.** Bodies that differ at byte 0 with a
  500 KB total still record `firstDiffOffset: 0`. The log itself
  doesn't store bodies (no PII leakage), but the report can't show
  side-by-side previews without them. A future option could log
  first-N-bytes of each body to a separate, redacted file.
- **Sampling bias.** Hash-based sampling is uniform across paths but
  ignores volume. A `/health` endpoint and a `/cards/42` endpoint that
  hash into the same bucket will both be shadowed at the same rate. If
  the report needs per-route sample rates, the policy file needs to
  grow.

## Files

- `tools/shadow/shadow-router.mjs` — proxy, JSONL appender, library API
  (`loadPolicy`, `shouldShadow`, `compareResponses`, `forwardOnce`,
  `appendLogEntry`, `createProxyServer`).
- `tools/shadow/shadow-report.mjs` — `aggregateLog(jsonlText)` + CLI
  text/JSON rendering.
- `tools/shadow/routes.shadow.json` — policy file (default:
  `shadow-everything` at 100%).
- `tests/tools/shadow/shadow-router.test.ts` — unit + end-to-end
  harness; runs under `vitest`.

## Quick start

```bash
# Run the unit tests.
npx vitest run tests/tools/shadow/

# Manual smoke test against two local servers.
RUBY_UPSTREAM=http://127.0.0.1:3000 \
TS_UPSTREAM=http://127.0.0.1:3001 \
SHADOW_POLICY=tools/shadow/routes.shadow.json \
SHADOW_LOG=tools/shadow/shadow.log.jsonl \
node tools/shadow/shadow-router.mjs

# Roll up the report.
node tools/shadow/shadow-report.mjs tools/shadow/shadow.log.jsonl
```

The skeleton's gate is: tests pass under `vitest`, no new npm deps, the
rest of the repo is untouched. Verified at the time of writing.
