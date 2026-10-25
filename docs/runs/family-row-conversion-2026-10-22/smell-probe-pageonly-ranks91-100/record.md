# Row smell-probe-pageonly-ranks91-100

Family row conversion, 2026-10-22. The row's own verification ran on the pinned candidate and
passed; the row IS closed.

- Roster row: `smell-probe-pageonly-ranks91-100`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/probe-pageonly-ranks91-100.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceCommit`
  `e8b70ad3...` and `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash), and
  the probe's own report records `engineIsPureTip` true.
- Command: `node reference-harness/browser/probe-pageonly-ranks91-100.mjs --out
  .runtime/lane-smell-test-convert/probe-pageonly-ranks91-100` (exit 0).
- Evidence in this directory: `probe-ranks91-100-result.json` (the probe's own per-leg verdicts,
  22 legs), `probe-console.log` (the run's console), `server.log`.

## What the run measured

Twenty-two legs, twenty-two green, zero red. The leg the row was red on is green, and it is
green against the Ruby oracle's own key algebra:

```
[ranks91-100] ACT-185 the all-caps digit+capital spelling keys exactly as the Ruby oracle does - a DIFFERENT name, so the unknown-card page is the faithful answer: GREEN {"name":"Harness Plurality Digit 9c mvk0o8ya","canonicalUrl":"/Harness_Plurality_Digit_9c_mvk0o8ya","canonicalStatus":200,"canonicalCardId":"916","shoutedUrl":"/HARNESS_PLURALITY_DIGIT_9C_MVK0O8YA","shoutedStatus":200,"shoutedCardId":null,"shoutedCardName":"HARNESS PLURALITY DIGIT 9C MVK0O8YA","shoutedIsUnknownName":true,"deckRows":[{"id":916,"name":"Harness Plurality Digit 9c mvk0o8ya","trash":0}],"liveRowCount":1,"keyAlgebra":{"exactKey":"harness_plurality_digit_9c_mvk0o8ya","shoutedKey":"harness_plurality_digit_9_c_mvk0_o8_ya","keysMatch":false,...}}
[ranks91-100] legs 22, failures 0
```

The row's recorded red was the opposite reading of the same fact: it called the digit+capital
key split a defect ("DeckoName key algebra injects a spurious '_' into uppercase tokens ending
digit+C"). The fix lane's commit `fd70d474` ("ACT-185: the digit+capital key split is Ruby
behaviour; the probe leg was wrong") established that the split IS Ruby's behaviour, changed the
probe (129 lines) and no `src/` file, and added the Ruby oracle parity capture. The port was
already right; the leg was wrong.

## Pin

This row carries the oracle-matched pin:

- `tests/card/name/ruby-oracle-key-algebra-parity.test.ts` (5 tests) - the port's key algebra
  measured against the Ruby oracle's captured answers.
- `fixtures/captured/card-name-key-algebra-inputs.json` - the captured oracle inputs the pin
  reads.
- `tools/oracle/capture-card-name-key-algebra-parity.rb` - the Ruby-side capture instrument that
  produced those inputs.

Run on this branch: `npx vitest run tests/card/name/ruby-oracle-key-algebra-parity.test.ts` -
1 file passed, 5 tests passed.

## Reproduction from this branch's own tip

The same probe was re-run from this branch's own tip, with this branch's corrected instrument and this branch's own engine build: twenty-two legs, zero failures, so the family branch reproduces the candidate's answer for this row.

Evidence in `family-branch-reproduction/`: the probe's own result JSON and the run's console log.
## Disposition

`DONE`. The row's verification ran on the pinned candidate, all twenty-two legs are green, the
red leg is green on the Ruby oracle's own key algebra, and the behaviour is pinned on this branch
by a test that compares the port against the oracle's captured answers. The receipt is the
measurement and the pin is the durable part.
