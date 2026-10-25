# smell-verify-hosted-widget-views

- The row's own label: `smell/probe script verify-hosted-widget-views.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-views.mjs`
- What this lane did: ran the row's own instrument against the hosted edge, from a
  copy in this lane's own scratch directory so that the receipt of record was not
  overwritten, and read the receipt the instrument wrote.
- Commands:
  - `NODE_PATH=C:/localProjects/decko-ts-smell-test-round3-20261024/node_modules node verify-hosted-widget-views.mjs`,
    run from `tmp/smell-r5/probe/` in this lane's tree, with
    `remote-widget-cas/` created beside the copy so the instrument's own output
    path was free. Exit code 0.
  - `node tools/smell-row-r5/distill-hosted-widget-views.mjs tmp/smell-r5/probe/remote-widget-cas/hosted-content-view-readback.json fixtures/captured/smell-row-r5-2026-10-24/verify-hosted-widget-views.json`
    (`rows 12, 200s 12, pass 12, instrument verdict true`)
- Evidence: `fixtures/captured/smell-row-r5-2026-10-24/verify-hosted-widget-views.json`
  (the instrument's own receipt, copied field for field), and the twelve card
  pages the instrument wrote, at
  `fixtures/captured/smell-row-r5-2026-10-24/hosted-card-<id>.html`.
- Pin: `tests/server/smell-verify-hosted-widget-views-parity.test.ts`.

## Verdict: DONE

The row's own verification ran and its own verdict holds: all twelve named content
views answered 200, each carried exactly one main content slot for its own card id,
each carried the expected anchor, and none carried the legacy widget loader.

| card | route | status | main slots | expected anchor | legacy loader |
|---|---|---|---|---|---|
| 613 | `/Free_Aiki_Dojo%2Btwitterfeed?view=content` | 200 | 1 | present | 0 |
| 1513 | `/Golden_Bears_Aikido_at_UC_Berkeley%2Btwitterfeed?view=content` | 200 | 1 | present | 0 |
| 1514 | `/GBAtwitterfeed?view=content` | 200 | 1 | present | 0 |
| 2670 | `/Brandon_WilliamsCraig%2Bdescription%2Btwitterfeed?view=content` | 200 | 1 | present | 0 |
| the remaining eight cards | their own named view routes | 200 | 1 | present | 0 |

## What the earlier rounds recorded about this row, and what this lane found

The 2026-10-22 family fold left the row open with the gap "a re-verification would
issue twelve live named-view fetches to the hosted edge, so the standing passing
receipt remains the record", and the 2026-10-23 round read the instrument and left it
open with the gap "the instrument opens the twelve card addresses in a local browser,
which is a page walk of the live hosted edge". The second gap is not what the instrument
does. The instrument fetches each address with `fetch`, writes the body to disk, and
then parses that body with `page.setContent` in owned headless Chromium with
JavaScript disabled and every subresource request aborted. The browser never navigates
to the live host: the only requests that leave this machine are the twelve anonymous
GETs of the card addresses, the same twelve the sibling row
`smell-verify-hosted-widget-content` makes.

So the verification this row was waiting for is runnable, and this lane ran it. The
receipt of record was not overwritten: the instrument was run from a copy in this
lane's own scratch directory, and its receipt carries a fresh exclusive-create write of
its own. The credential that the sibling credential-retirement row reads out of the
receipt of record is untouched, and this lane did not touch the credential file.

## The limit of this verdict

The instrument's own scope line says what the receipt is: "Anonymous read-only named
content-view HTTP responses, parsed in owned headless Chromium with JavaScript disabled
and all subresource requests aborted. Exact #main card identity and expected anchor
asserted. No live browser interaction, .com request or full asset acceptance." So this
row closes on the twelve named content views. It does not assert that the live host
behaves like the port, that the assets are right, or that the deployment is accepted.

## The live calls this lane made, and what it did not do

Twelve anonymous GETs of the card addresses on the Bunny-hosted edge, one per card,
and nothing else: no loop, no repeat, no page walk, no write, no deployment and no
request to any `.com` address.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
