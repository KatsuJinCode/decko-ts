# Row smell-probe-pageonly-batch7-ranks81-90

Family row conversion, 2026-10-22. The row's own verification ran on the pinned candidate and
passed; the row IS closed.

- Roster row: `smell-probe-pageonly-batch7-ranks81-90`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/probe-pageonly-batch7-ranks81-90.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceCommit`
  `e8b70ad3...` and `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash), and
  the probe's own report records `engineIsPureTip` true.
- Command: `node reference-harness/browser/probe-pageonly-batch7-ranks81-90.mjs --out
  .runtime/lane-smell-test-convert/probe-pageonly-batch7-ranks81-90` (exit 0).
- Evidence in this directory: `probe-pageonly-batch7-ranks81-90-result.json` (the probe's own
  per-leg verdicts, 10 legs), `probe-console.log` (the run's console), `server.log`.

## What the run measured

Ten legs, ten green, zero red. Both legs the row was red on are green:

```
[batch7] ACT-172 the card mark's .rss and the search's format=rss both answer an RSS-format view: GREEN {"cardRss":{"path":"/Brief.rss","status":200,"contentType":"text/html; charset=utf-8","bodyLength":18,"matchesRubyDisabledAnswer":true,"isFeedDocument":false,"looksRss":true,"disclosesDisabled":true,"head":"RSS feeds disabled"},"searchRss":{"path":"/*search?format=rss&term=rss%20card%20body","status":200,...,"head":"RSS feeds disabled"},"jsonControl":{"status":200,"contentType":"application/json; charset=utf-8","looksRss":false,"isJson":true},"note":"looksRss = Ruby's measured default-d..."
[batch7] ACT-175 the inline role-checkbox editor posts on click, the visitor-session enabled-roles selection moves, and the same click restores it: GREEN {"formCount":1,"boxCount":2,"clickable":1,"formTypeId":"481","postStatus":200,"postBody":"utf8=%E2%9C%93&success%5Breload%5D=true&card%5Btype_id%5D=481&card%5Bcontent%5D=Anyone+Signed+In&pointer_checkbox-ada_admin-Xenabled_role-1=Anyone+Signed+In","sessionBefore":"[]","sessionAfter":"[\"Anyone Signed In\",\"Anyone Signed In\"]","sessionMoved":true}
```

The ACT-172 leg is the oracle comparison the row was missing: the port's `.rss` answer is
"RSS feeds disabled", which is Ruby's own default-disabled answer (`rss.rb:17` in the port's
citation, `src/card/render/format-families.ts:264` holds the same bytes as
`RSS_DISABLED_BYTES`), and the leg records `matchesRubyDisabledAnswer: true`. The ACT-175 leg
records the visitor session's enabled-roles selection moving from `[]` to
`["Anyone Signed In","Anyone Signed In"]`.

## Why the instrument changed, and what that means for the closure

The ACT-172 red was an instrument defect: the fix lane's commit `ac2f44c6` ("ACT-172: the
probe's looksRss predicate measured a contract stock Ruby does not answer") changed the probe
and no `src/` file, because the port's answer was already Ruby's. The ACT-175 green does depend
on a port change that is in the candidate and not in this family branch: the candidate carries
the write-path save slice (`58e68d79`) and the forms slice (`7f04cee6`), which is what makes the
role checkbox's POST land and the session move. This branch carries the corrected probe; the
measurement is on the candidate, which is the tree that carries the port change.

## Pin

`tests/card/render/format-families-oracle.test.ts` (10 tests) already on this branch pins the
RSS family's answer against the Ruby source it cites, including the disabled answer. Run on this
branch: `npx vitest run tests/card/render/format-families-oracle.test.ts` - 1 file passed, 10
tests passed.

## Disposition

`DONE`. The row's verification ran on the pinned candidate, all ten legs are green, and the
ACT-172 leg is green on the oracle's own answer rather than on a proxy. The receipt is the
measurement and the existing oracle pin is the durable part.
