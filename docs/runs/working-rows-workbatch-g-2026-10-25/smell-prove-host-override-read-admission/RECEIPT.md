# smell-prove-host-override-read-admission

- The row's own label: `smell/probe script prove-host-override-read-admission.mjs`
- Instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prove-host-override-read-admission.mjs`
- Roster verdict at the time of this lane: FAIL, bucket WORKING ON IT, blocker
  WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The remaining red is the
  harness's write backstop, and the fix that would turn it green narrows the
  port's session-mark carve-out, a contract decision about the port's own
  account flows.

## Where the row stands, from the receipts this lane read

- The 2026-10-24 round-three-b receipt
  (`docs/runs/smell-row-conversion-r5b-2026-10-24/smell-prove-host-override-read-admission/RECEIPT.md`)
  restored the instrument's inputs, ran it twice, landed the harness fix the
  first run measured (the admit route now registered after the policy routes
  so the override target's own document and fetch requests are admitted), and
  measured the second run's state: three of six probes pass, the three write
  probes that should have been refused still reach the owned server.
- That round's capture and pin are in this tree:
  `fixtures/captured/smell-row-r5b-2026-10-24/smell-prove-host-override-read-admission.json`
  (this session's read: exit 1, refusal carrying the three-false check array)
  and `tests/server/smell-prove-host-override-read-admission-parity.test.ts`.
- The round-six run record
  (`docs/runs/smell-row-conversion-r6-2026-10-25/README.md`) names the same
  remainder: the write backstop, with the carve-out narrowing named, not
  taken.

## The mechanism this lane re-verified in the port's own source, at base `c17906db`

- The session-mark carve-out is decided from the card name alone:
  `reference-harness/browser/lib/live-walk-profile.mjs:74`
  (`SESSION_MARKS = *signin, signin, *account, account`) and
  `:256-261` (`decideWrite` admits any request whose card name is a session
  mark "permitted in every mode").
- A GET that names a card on a mutation route is not a write to the port
  either: `src/server/write-routes.ts:999-1007` matches the explicit
  create/update/delete routes only through the matching method (a GET on the
  update route returns null at `:1006`, a GET on the delete route at
  `:1007`), so the harness gate mirrors the port's own route table when it
  lets `GET /delete/OwnedCard` through.

## The mechanism that blocks the close

Turning the three red probes green needs the write gate to decide from the
request BODY (a card write posted to a session-mark route) and to treat a GET
on a mutation route as a write. Both changes make the harness stricter than
the port's own account flows: the carve-out is what lets signed-in read
journeys change the account card's own content, and the GET-on-mutation-route
behaviour is the port's own routing table. Narrowing either is a contract
decision about the port's own flows, which belongs above a lane; the
round-three-b and round-six records both named it and did not take it, and
neither does this lane.

## What this lane did not do

It did not change the write gate's policy, the harness, or the instrument;
made no `.com` request, no public network request and no production write;
and read no credential.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
