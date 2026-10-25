# reg-routes-E12

- Roster row: family `register-routes`, label `Server-Timing header,
  isolate-probe routes, render-budget 503 + Retry-After, edge caches`,
  verdict PORTED, bucket DONE.
- The row's sourceParent: `port-only route (no Ruby counterpart) ->
  Server-Timing header, isolate-probe routes, render-budget 503 +
  Retry-After, edge caches / edge`.
- The row's blocker: verified, port-only surface: the register names the
  host(s) and the file:line in the port that serves it, so there is no Ruby
  behaviour it could fail to match.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  section E (port-only routes), the row `Server-Timing header,
  isolate-probe routes, render-budget 503 + Retry-After, edge caches |
  edge | bunny-edge-server-timing.ts; bunny-edge-isolate-probe.ts;
  bunny-edge-engine-request.ts:207-382; bunny-edge-content-cache.ts`
  (line 780 of that document).

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

All four surfaces are edge-host only. None appears on the staging server or
the minimal reader.

- THE SERVER-TIMING HEADER. `deploy/bunny-worker-src/bunny-edge-server-timing.ts:87`
  declares `EDGE_SERVER_TIMING_HEADER = "Server-Timing"`; line 300 sets it on
  every profiled response. The header's phases are the handler's own
  pipeline, documented at lines 19-31: auth (session resolution wall), seat
  (the cache layers' wall outside the render closure), db (aggregate
  database wall, overlapping the wall phases by design), render, total.
- THE ISOLATE-PROBE ROUTES. `deploy/bunny-worker-src/bunny-edge-isolate-probe.ts:107-135`:
  `probeRoute` answers `GET /_probe/cpu` (line 112, a fixed pure-JS workload
  with wall and perf timings) and `GET /_probe/db` (line 126, sequential
  `SELECT 1` pipeline timings). The probe is ARMED, not inherent: line 42
  answers `env.DECKO_EDGE_ISOLATE_PROBE === "1"`, and unarmed it adds no
  header and answers no route. Call sites:
  `bunny-edge-engine-handler.ts:260` and `bunny-edge-read-handler.ts:138`.
- THE RENDER BUDGET. `deploy/bunny-worker-src/bunny-edge-engine-request.ts:246-255`:
  `DEFAULT_EDGE_RENDER_BUDGET_MS = 20_000` (line 246),
  `EDGE_BUDGET_RETRY_AFTER_SECONDS = 5` (line 251), the diagnostic header
  `EDGE_BUDGET_DIAGNOSTIC_HEADER = "X-Decko-Edge-Budget"` (line 255). The
  budget-exceeded answer is the 503 built at lines 317-342:
  `response.headers.set("Retry-After", ...)` (line 337) and the diagnostic
  `exceeded; budget_ms=<n>` (line 338), over the full-chrome error page with
  a bare stub fallback. The race is wired in `handleEngineRequest`
  (lines 435-449, `withBudget`).
- THE EDGE CACHES. `deploy/bunny-worker-src/bunny-edge-content-cache.ts`:
  the L2 script-side cache riding the runtime Cache API (`caches.default`),
  armed by `DECKO_EDGE_CACHE=1` (header comment, lines 1-13); the serving
  entry is `serveWithEdgeCache` (line 127), with the L1 header posture in
  `bunny-edge-cache-headers.ts`.

The register's range (`bunny-edge-engine-request.ts:207-382`) still covers
the budget constants and the 503 builder at this tree; the constants sit at
246-255 and the 503 at 317-342. The row's subject is unchanged.

## The original side, searched and recorded

The row says port-only, no Ruby counterpart. The searches, all run
2026-10-25 in `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`:

- `timeout 5 grep -rln "Retry-After" card-1.110.0 decko-0.20.0
  actionpack-7.2.4` returned nothing (grep exit 1).
- `timeout 5 grep -rln "render.budget\|render_budget" card-1.110.0
  decko-0.20.0` returned nothing (grep exit 1).
- `timeout 5 grep -rln "Server-Timing" card-1.110.0 decko-0.20.0
  actionpack-7.2.4 rack-3.2.7 rack-session-2.1.2` returned exactly one hit,
  `actionpack-7.2.4/lib/action_dispatch/constants.rb` - Rails' own registry
  of well-known header names, not a decko behaviour. No decko or card code
  emits the header.
- `timeout 5 grep -rn "_probe" --include=*.rb .` (the whole pinned gem set)
  completed with no hits: no Ruby code knows the probe paths.

The pinned router's own answer for the probe paths is recorded in the
committed oracle capture
`fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json`
(`routerAnswers.E12`): `GET /_probe/cpu` and `GET /_probe/db` match
`/:mark/:view(.:format)` as card reads of mark `_probe` with view `cpu`
(resp. `db`). No deck carries a `_probe` card, so the pinned deck's answer
there is its own not-found view at 404 (the committed capture
`fixtures/captured/not-found-404-view-ruby-oracle.json`, `notFoundView`
`not_found`, status 404). The port's probe answers its own JSON with
`cache-control: no-store` (isolate-probe.ts lines 124, 135). The row's
port-only verdict stands.

## The prior receipt for this row

`docs/reports/routes-tranche9-2026-10-22.md:69`, the routes tranche 9 row
table, entry `E12 the edge instrumentation`, commit `0dc6eeb4f`.
