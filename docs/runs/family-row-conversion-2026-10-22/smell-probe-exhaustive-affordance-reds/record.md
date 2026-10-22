# Row smell-probe-exhaustive-affordance-reds

Family row conversion, 2026-10-22. The row's own verification ran on the pinned candidate and
passed; the row IS closed.

- Roster row: `smell-probe-exhaustive-affordance-reds`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/probe-exhaustive-affordance-reds.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceCommit`
  `e8b70ad3...` and `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash), and
  the probe's own report records `engineIsPureTip` true.
- Command: `node reference-harness/browser/probe-exhaustive-affordance-reds.mjs --out
  .runtime/lane-smell-test-convert/probe-exhaustive-affordance-reds` (exit 0).
- Evidence in this directory: `probe-results.json` (the probe's own per-leg verdicts),
  `act077-account-tab.html` (the account tab the E19 leg reads), `probe-console.log` (the run's
  console), `server.log`.

## What the run measured

Ten legs, ten green, zero red. The leg the row was red on is green:

```
[probe] PASS ACT-077-e19-account-tab-fields {"boardStatus":200,"boardUrl":"http://127.0.0.1:65518/Ada_Admin/board",...}
[probe] verdicts: {"leg1-runner-signin-admin":true,"leg1-home-chrome-after-runner-signin":true,"leg2-named-signin-admin":true,"leg2-home-chrome-named-signin":true,"ACT-018-richtext-edit-modal":true,"ACT-044-account-tab":true,"ACT-077-e19-account-tab-fields":true,"ACT-100-p3-member-denied-edit":true,"ACT-126-a5-password-reset":true,"ACT-147-f6-file-upload-update-resubmit":true}
```

The full leg list, all green: `leg1-runner-signin-admin`, `leg1-home-chrome-after-runner-signin`,
`leg2-named-signin-admin`, `leg2-home-chrome-named-signin`, `ACT-018-richtext-edit-modal`,
`ACT-044-account-tab`, `ACT-077-e19-account-tab-fields`, `ACT-100-p3-member-denied-edit`,
`ACT-126-a5-password-reset`, `ACT-147-f6-file-upload-update-resubmit`.

## Why the instrument changed, and what that means for the closure

As with the sibling account-row row, the red leg was an instrument defect, not a port defect:
the fix lane's commit `16e78bf2` changed this probe (and no `src/` file) because the two
instruments sampled the page mid-flight. This branch carries that corrected instrument, so the
leg now samples the settled account tab.

## Pin

`tests/card/render/account-password-editor-closed-modal-container-pins.test.ts` (3 tests) pins
the account tab's password editor, the surface this leg reads. It is added to this branch with
this row. Run on this branch: `npx vitest run
tests/card/render/account-password-editor-closed-modal-container-pins.test.ts` - 1 file passed,
3 tests passed.

## Disposition

`DONE`. The row's verification ran on the pinned candidate, all ten legs are green, and the leg
the row was red on now passes with the account tab's fields served. The receipt is the
measurement and the pin is the durable part.
