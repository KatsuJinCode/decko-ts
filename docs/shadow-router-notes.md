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

## Live upstream proof — 2026-09-21 / M5

The skeleton landed with 28 unit tests (proxy + stub upstreams); the
remaining gap before cutover evidence is the live run against REAL
upstreams. This section documents the M5 manual run that closes the
gap.

### What was spun up

Three Node processes plus one Ruby process, all on loopback:

| Role | Port | PID (transient) | Command |
|---|---|---|---|
| Ruby oracle | 3055 | 17624 (Thin) | `RAILS_ENV=development PORT=3055 bundle exec decko server -p 3055 -b 127.0.0.1` (in `tools/oracle/decko-oracle-app/`) |
| TS upstream dev server | 65237 | 43024 | `PORT=65237 node tools/shadow/ts-upstream-dev-server.mjs` |
| shadow-router (proxy) | 65238 | 69248 | `RUBY_UPSTREAM=http://127.0.0.1:3055 TS_UPSTREAM=http://127.0.0.1:65237 SHADOW_PORT=65238 SHADOW_POLICY=tools/shadow/routes.shadow.json SHADOW_LOG=tools/shadow/m5-live-log.jsonl node tools/shadow/shadow-router.mjs` |

The TS upstream dev server (`tools/shadow/ts-upstream-dev-server.mjs`,
new file) is the piece that did not exist: the decko-ts engine has no
HTTP surface yet, so the live proof needs a tiny .mjs that wraps the
programmatic renderer in Decko's URL conventions. It boots an
in-memory SQLite database, seeds the SAME 10 cards the smoke fixture
records (`fixtures/captured/smoke.json`), and serves HTML on the same
`/<name>` (with `/<name>/view/<view>` and `.<format>` variants) that
Ruby Decko's `engine_routes.rb` defines.

The seed uses the engine's own `DeckoName.parse(name).key` to compute
the canonical key column — without that, the plural-stem-collapse
("Basics" → "basic") makes the engine's `WHERE key = ?` query miss
the row. Live-verified: without that fix, every render errors with
"card not found"; with it, simple cards (Oracle Basics, Oracle Rich,
Oracle Junction, Oracle Restricted, Oracle Search) all render.

The TS engine is compiled into `dist-ts/` first (`npx tsc -p
tsconfig.engine.json --noCheck` — a tiny standalone tsconfig with
`typeRoots` pointed at `tests/schema` so the
`better-sqlite3.d.ts` shim is on the path). The repo's main
`tsconfig.json` builds the test artefacts, not the engine; the new
`tsconfig.engine.json` adds the engine-specific include set. Build is
cached in `dist-ts/` after the first invocation.

### Real requests sent, verdicts recorded

```
$ curl http://127.0.0.1:65238/Oracle%20Basics   # 17499b
$ curl http://127.0.0.1:65238/Oracle%20Rich     # 19753b
$ curl http://127.0.0.1:65238/Oracle%20Junction # 17509b
$ curl http://127.0.0.1:65238/Oracle%20Restricted # 403 16770b
$ curl http://127.0.0.1:65238/Oracle%20Search   # 23013b
$ curl http://127.0.0.1:65238/Oracle%20Basics/view/closed  # 18027b
# (repeats for diff histogram)
```

URL convention: Decko uses `%20` for spaces in paths (Rails does NOT
apply form-encoding '+'-to-space to PATH components — only to query
strings / POST bodies). Live-verified: `/Oracle+Basics` returns 404
on the Ruby oracle (the literal name `Oracle+Basics` is not a card);
`/Oracle%20Basics` returns the card. The dev server's decoder mirrors
that exactly (`tools/shadow/ts-upstream-dev-server.mjs#decodeMark`).

The JSONL log written by the shadow-router is
`tools/shadow/m5-live-log.jsonl`. The first five records (one line per
request):

```
{"timestamp":"2026-09-22T07:59:17.583Z","method":"GET","path":"/Oracle%20Basics","rubyStatus":200,"tsStatus":200,"rubyBytes":17499,"tsBytes":2604,"verdict":"diff","firstDiffOffset":0,"contentTypeMatch":true,"diffKinds":["body"]}
{"timestamp":"2026-09-22T07:59:18.844Z","method":"GET","path":"/Oracle%20Rich","rubyStatus":200,"tsStatus":200,"rubyBytes":19753,"tsBytes":4804,"verdict":"diff","firstDiffOffset":0,"contentTypeMatch":true,"diffKinds":["body"]}
{"timestamp":"2026-09-22T07:59:20.085Z","method":"GET","path":"/Oracle%20Junction","rubyStatus":200,"tsStatus":200,"rubyBytes":17509,"tsBytes":2628,"verdict":"diff","firstDiffOffset":0,"contentTypeMatch":true,"diffKinds":["body"]}
{"timestamp":"2026-09-22T07:59:21.424Z","method":"GET","path":"/Oracle%20Restricted","rubyStatus":403,"tsStatus":200,"rubyBytes":16770,"tsBytes":76,"verdict":"diff","firstDiffOffset":0,"contentTypeMatch":true,"diffKinds":["status","body"]}
{"timestamp":"2026-09-22T07:59:22.863Z","method":"GET","path":"/Oracle%20Search","rubyStatus":200,"tsStatus":200,"rubyBytes":23013,"tsBytes":8118,"verdict":"diff","firstDiffOffset":0,"contentTypeMatch":true,"diffKinds":["body"]}
```

The shadow-router script's `shadow-report.mjs` aggregator on the same
log:

```
$ node tools/shadow/shadow-report.mjs tools/shadow/m5-live-log.jsonl
Shadow log summary: tools/shadow/m5-live-log.jsonl
Total: 9   same: 0%   diff: 9   skipped: 0   errors: 0

By path pattern:
  /Oracle%20Basics             total=    2 same=     0% diff=   2 err=  0
  /Oracle%20Junction           total=    2 same=     0% diff=   2 err=  0
  /Oracle%20Restricted         total=    2 same=     0% diff=   2 err=  0
  /Oracle%20Rich               total=    1 same=     0% diff=   1 err=  0
  /Oracle%20Search             total=    1 same=     0% diff=   1 err=  0
  /Oracle%20Basics/<segment>   total=    1 same=     0% diff=   1 err=  0

First-diff offset histogram (bytes into body):
  [     0 ..      1): 9
```

### What the verdicts say (and what they don't)

Every request records `verdict: "diff"` with `firstDiffOffset: 0` and
`diffKinds: ["body"]` (or `["status", "body"]` for Oracle Restricted,
where Ruby's read-rule blocks 403 and TS returns 200 with a 76-byte
denial span). This is the EXPECTED shape for an early-parity run:

- Ruby's response is the full page template — the `<!doctype>` /
  `<head>` / navigation chrome wrapping the card slot. TS's response
  is the card slot itself (the open view body, raw). They diverge at
  byte 0 because they were never going to match at this layer.
- The Oracle Restricted entry's `diffKinds: ["status","body"]` is
  the live parity signal: the engine's read-rule stack IS detecting
  the Administrator-only rule (the 76-byte body is the denial span,
  not an empty page), but Ruby returns 403 at the HTTP layer while TS
  returns 200. That is a real, named divergence — neither engine is
  failing; they're disagreeing about how a denied read is surfaced.

What this run is NOT a proof of: that the engines produce
byte-identical HTML. That is the render-wave corpus-replay work, and
it is out of scope here. What this run IS a proof of:

1. The shadow-router's JSONL contract works against REAL upstreams
   (not the unit-test stubs).
2. `verdict` and `firstDiffOffset` are populated for every request;
   `ts-error` and `ruby-error` would surface in the same shape if
   they happened.
3. The TS dev server can serve the engine's output over HTTP in a
   shape the proxy can forward.
4. `shadow-report.mjs` aggregates a real log file cleanly.

### Files added / touched

- `tools/shadow/ts-upstream-dev-server.mjs` (new) — the tiny TS
  upstream. Library exports `bootEngine`, `makeHandler`,
  `decodeMark`, `CODENAME_SEED`, `SMOKE_SEED`; CLI usage spins up an
  HTTP server on `PORT` (default 0 = ephemeral).
- `tsconfig.engine.json` (new) — minimal tsconfig that builds the
  engine to `dist-ts/`. Includes the engine files explicitly (the
  main tsconfig only includes `tests/` + `benchmarks/`); adds
  `tests/schema` to `typeRoots` so the better-sqlite3 shim is on
  the path. Builds with `--noCheck`; the engine files carry
  pre-existing strict-mode errors on the main config, so this
  build path does not gate on them.
- `docs/shadow-router-notes.md` (this section) — the run report.
- `tools/shadow/m5-live-log.jsonl` (new) — the live proof's
  JSONL. 9 records, 2326 bytes.

The 28 unit tests in `tests/tools/shadow/shadow-router.test.ts`
are green on the current tree (re-run: 28/28 passed).
