# smell-verify-hosted-widget-content: a live hosted answer, named

- The row's own label: "smell/probe script verify-hosted-widget-content.mjs"
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs`
- The prior receipts for this row:
  `docs/runs/smell-row-conversion-r5-2026-10-24/smell-verify-hosted-widget-content/`
  and the round six summary `docs/runs/smell-row-conversion-r6-2026-10-25/README.md`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`.

## Verdict: named, not closed. The row's own answer is a live hosted answer.

## The mechanism, in one sentence

The instrument fetches twelve card JSON addresses on the hosted edge and
reports pass false, because the live host answers 404 for every one of them,
and a lane cannot change what a deployed host serves.

## What the receipts of record say

The round five lane spent its one batched confirmation fetch here: twelve
URLs, one fetch each, one round at the end of the lane, against the
Bunny-hosted edge and not the dot-com domain. Every one of the twelve
answered 404, the instrument's own verdict is pass false, and the receipt of
record records the same twelve answers. The round six summary names the same
reason: "A lane cannot change what the hosted edge serves, and nothing here
deploys."

## What this lane did not do

It made no request to any hosted edge, deployed nothing, and did not
re-fetch the twelve URLs: the answer of record is a live host's answer, and
a second fetch would buy nothing that is not a live host's answer again. It
also did not touch the dot-com domain.
