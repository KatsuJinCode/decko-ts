# reg-routes-E8

- Roster row: family `register-routes`, label `GET /_mail-log`, verdict PORTED,
  bucket DONE.
- The row's sourceParent: `port-only route (no Ruby counterpart) -> GET /_mail-log / staging`.
- The row's blocker: verified, port-only surface: the register names the
  host(s) and the file:line in the port that serves it, so there is no Ruby
  behaviour it could fail to match.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  section E (port-only routes), the row `GET /_mail-log | staging |
  vm-staging-server.mjs:4187-4188, 1316` (line 776 of that document).

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

The row's promise was a file:line in the port that serves this route. The
source exists, it is named here, and the host it is served on is named.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

- `vm-staging-server.mjs:4799-4800`: the request arm.
  `} else if (req.method === "GET" && pathname === "/_mail-log") {`
  then `response = handleMailLog();`
- `vm-staging-server.mjs:1376-1382`: the handler `handleMailLog()`. It
  answers 404 with `mail capture is off (boot with DECKO_MAIL_CAPTURE=1)`
  (line 1380) when the mail transport is not the capture transport, and 200
  with the drained envelopes otherwise (line 1382).
- `vm-staging-server.mjs:783-786`: the transport selection that makes the
  surface 404 by default. `const mailTransport = process.env.DECKO_MAIL_CAPTURE
  === "1" ? new CaptureTransport("capture") : new NoopTransport();`

The register's line numbers (4187-4188, 1316) are from the 2026-10-18
register build. The same bytes sit at 4799-4800 and 1376-1382 in this tree.
The row's own subject, the route and the host, is unchanged.

## The original side, searched and recorded

- No Ruby route, handler or string names a mail log. The search that
  returned nothing: `timeout 5 grep -rn "mail-log|mail_log" --glob '!*.gem' .`
  run in `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` on
  2026-10-25. Zero hits across the whole pinned gem set.
- The pinned router's own answer for the path is recorded in the committed
  oracle capture `fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json`
  (written by `tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb`):
  the `routerAnswers` E8 entry records that GET /_mail-log matches the route
  `/:mark(.:format)` with action `read` and mark `_mail-log`.
- No deck carries a card named `_mail-log`, so the pinned deck's answer
  there is its own not-found view at 404. That view and its status are the
  committed capture `fixtures/captured/not-found-404-view-ruby-oracle.json`
  (`notFoundView` is `not_found`, `notFoundStatusCode` is 404).
- The port's own surface was measured against that pinned answer in
  `tests/server/port-only-mail-log-route-parity.test.ts:47-116`: the staging
  server answers the path, the edge engine and the minimal reader do not
  (lines 66-73), and the capture transport drains, so the surface answers
  once (lines 84-104).

## The row's claim, checked

The row says port-only, no Ruby counterpart. That holds of the route: the
pinned deck has no mail-log route and no mail-log handler, and the search
above found no such string anywhere in the pinned gem set. One refinement
is on the record: the pinned route table does route the PATH, but to
`card#read` with mark `_mail-log`, where the pinned deck answers its own
not-found view at 404. The port's surface is a debug drain that answers 404
while the capture transport is off and 200 with the drained envelopes while
it is on. The row's verdict (PORTED) and bucket (DONE) stand.

## The prior receipt for this row

`docs/reports/routes-tranche9-2026-10-22.md:65`, the routes tranche 9 row
table, entry `E8 GET /_mail-log`, commit `dfd04a28c`.
