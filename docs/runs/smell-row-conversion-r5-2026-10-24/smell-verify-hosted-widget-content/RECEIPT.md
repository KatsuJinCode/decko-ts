# smell-verify-hosted-widget-content

- The row's own label: `smell/probe script verify-hosted-widget-content.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs`
- What this lane did: ran the row's own instrument against the hosted edge, from a
  copy in this lane's own scratch directory so that the receipt of record was not
  overwritten, and read the receipt the instrument wrote.
- Commands:
  - `node verify-hosted-widget-content.mjs`, run from
    `tmp/smell-r5/probe/` in this lane's tree, with
    `remote-widget-cas/` created beside the copy so the instrument's own output
    path was free. Exit code 1, which is the instrument's own verdict.
  - `node tools/smell-row-r5/distill-hosted-widget-content.mjs tmp/smell-r5/probe/remote-widget-cas/hosted-readback.json fixtures/captured/smell-row-r5-2026-10-24/verify-hosted-widget-content.json`
    (`rows 12, 200s 0, exact content 0, instrument verdict false`)
- Evidence: `fixtures/captured/smell-row-r5-2026-10-24/verify-hosted-widget-content.json`
  (the instrument's own receipt, copied field for field).
- Pin: `tests/server/smell-verify-hosted-widget-content-parity.test.ts`.

## Verdict: WORKING ON IT

The row's own verification ran and its own verdict is false: all twelve card JSON
addresses answered 404 and none of them carried the migrated content, so the
instrument's pass condition cannot hold.

| address | status | server-timing |
|---|---|---|
| `/~613.json` | 404 | `auth;dur=0, seat;dur=9, db;dur=246;stmt=26, render;dur=200, total;dur=308` |
| `/~1513.json` | 404 | `auth;dur=0, seat;dur=8, db;dur=226;stmt=26, render;dur=208, total;dur=316` |
| `/~1514.json` | 404 | `auth;dur=0, seat;dur=17, db;dur=237;stmt=26, render;dur=206, total;dur=326` |
| `/~2670.json` | 404 | `auth;dur=0, seat;dur=10, db;dur=231;stmt=28, render;dur=197, total;dur=310` |
| the remaining eight addresses | 404 | every row carries a server-timing header |

Every row carries a server-timing header, so the 404 is the edge's own answer after
it served the request, not a refused or timed-out call. The read was twelve anonymous
GETs of a public JSON address, one per card, and nothing else: no loop, no repeat, no
page walk, no write, no deployment and no request to any `.com` address.

## The gap, in one mechanism sentence

The live hosted edge answers 404 for every one of the twelve card JSON addresses the
authorized content migration targets, while the same migrated content is served on the
cards' own view route, which the sibling row `smell-verify-hosted-widget-views` measured
as twelve 200s in this same round, so the content is on the live host and the address
the instrument reads is the thing that is missing.

## What this lane did not do

This lane did not write to the live host, did not request any `.com` address, did not
overwrite the receipt of record, and did not touch the credential file. The instrument
reads no credential: it is an anonymous read.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
