# Row smell-probe-account-row-edit-slots

Family row conversion, 2026-10-22. The row's own verification ran on the pinned candidate and
passed; the row IS closed.

- Roster row: `smell-probe-account-row-edit-slots`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/probe-account-row-edit-slots.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceCommit`
  `e8b70ad3...` and `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash), and
  the probe's own report records `engineIsPureTip` true.
- Command: `node reference-harness/browser/probe-account-row-edit-slots.mjs --out
  .runtime/lane-smell-test-convert/probe-account-row-edit-slots` (exit 0).
- Evidence in this directory: `row-edit-results.json` (the probe's own verdicts),
  `row-email.html` and `row-password.html` (the two served account rows), `probe-console.log`
  (the run's console), `server.log`.

## What the run measured

All three legs are green, including the one the row was red on:

```
[act077-row] PASS signin {"leg":"signin","pass":true,"postStatus":200,"signedIn":true}
[act077-row] PASS ACT-077-row-edit-email {"route":"/Ada_Admin+*account+*email/edit","expectedType":"text","status":200,"rightContentInputs":[{"type":"text","visible":true,"value":"ada.admin@example.test","form":"/update/Ada_Admin+*account+*email"}]}
[act077-row] PASS ACT-077-row-edit-password {"route":"/Ada_Admin+*account+*password/edit","expectedType":"password","status":200,"rightContentInputs":[{"type":"password","visible":true,"value":"","form":"/update/Ada_Admin+*account+*password"}]}
[act077-row] verdicts: {"signin":true,"ACT-077-row-edit-email":true,"ACT-077-row-edit-password":true}
```

The password row's editor is served as `type="password"` and it is VISIBLE (`visible: true`),
which is the opposite of the row's recorded failure ("the served password input is type=password
but visible:false (hidden)"), and the served row is in the row's own form
`/update/Ada_Admin+*account+*password`.

## Why the instrument changed, and what that means for the closure

The row's failure was an instrument defect, not a port defect: the fix lane's commit
`16e78bf2` ("E19: the password field is never server-hidden - fix the two instruments that
sampled mid-flight") changed the probe and the sibling affordance probe and nothing in `src/`.
This branch carries that corrected instrument, so the leg now samples the settled page instead of
a mid-flight one, and the port's own answer is what the leg records.

## Pin

`tests/card/render/account-password-editor-closed-modal-container-pins.test.ts` (3 tests) pins
the account password editor's served container, and it is added to this branch with this row. Run
on this branch: `npx vitest run tests/card/render/account-password-editor-closed-modal-container-pins.test.ts`
- 1 file passed, 3 tests passed.

## Reproduction from this branch's own tip

The same probe was re-run from this branch's own tip, with this branch's corrected instrument and this branch's own engine build: the three verdicts are green again (signin true, ACT-077-row-edit-email true, ACT-077-row-edit-password true), so the family branch reproduces the candidate's answer for this row.

Evidence in `family-branch-reproduction/`: the probe's own result JSON and the run's console log.
## Disposition

`DONE`. The row's verification ran on the pinned candidate, every leg is green, the leg that was
red is green with the served password editor visible in the row's own form, and the behaviour is
pinned by a test on this branch. The receipt is the measurement and the pin is the durable part.
