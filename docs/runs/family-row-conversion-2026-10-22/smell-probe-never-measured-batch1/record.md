# Row smell-probe-never-measured-batch1

Family row conversion, 2026-10-22. The row's own verification ran on the pinned candidate and
passed; the row IS closed.

- Roster row: `smell-probe-never-measured-batch1`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/probe-never-measured-batch1.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceCommit`
  `e8b70ad3...` and `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash), and
  the probe's own report records `engineIsPureTip` true.
- Command: `node reference-harness/browser/probe-never-measured-batch1.mjs --out
  .runtime/lane-smell-test-convert/probe-never-measured-batch1` (exit 0).
- Evidence in this directory: `probe-batch1-result.json` (the probe's own per-leg verdicts, 15
  legs), `probe-console.log` (the run's console), `server.log`.

## What the run measured

Fifteen legs, fifteen green, zero red. The leg the row was red on is green:

```
[batch1] ACT-155 W4 the followers list names the follower and the all-followed-cards view lists each actor's follow: GREEN {"adminScratch":"HarnessW4AdminFollows_mvk0uf1919e","memberScratch":"HarnessW4MemberFollows_mvk0uf193zs","storedAdmin":{"found":true,"option":"*always"},"resolvedMember":{"found":true,"option":"*always","options":["*always"],"viaKey":"*all","viaUser":"Mira Member","viaUserId":617,"viaDefault":false},"followersRead":{"status":200,"url":"http://127.0.0.1:56313/HarnessW4MemberFollows_mvk0uf193zs+*followers"}...
```

The full leg list, all green: `ACT-131`, `ACT-132`, `ACT-133`, `ACT-141`, `ACT-142`, `ACT-146`,
`ACT-149`, `ACT-151`, `ACT-152`, `ACT-153`, `ACT-154` (W2 unfollow round trip), `ACT-155` (W4
followers list and the all-followed view), `ACT-156` (W5 watcher mail), `ACT-157` (W6 the email's
unfollow link), `ACT-159` (A4 anonymous sign-up, mailed verification, then sign-in).

## Why this row could be measured now

The row's recorded blocker was that the followers-route lane held the surface and re-porting the
probe here would collide with it. That lane has since landed: the candidate carries
`port/oracle-followers-address-settle-20261022` (merge `d6b4219f`), which is where the
followers view and the all-followed view live, and the corrected instrument
(`reference-harness/browser/probe-never-measured-batch1.mjs`, 131 lines changed against the
family tip) is carried into this branch with this row.

## Pin

The candidate carries the pins for this behaviour:
`tests/card/follow/act155-w4-follow-overview-assembly.test.ts` (4 tests),
`tests/card/follow/act155-w4-followers-view-content.test.ts` (5 tests) and
`tests/card/follow/act155-w4-following-junction-core.test.ts` (5 tests). Run at the candidate:
`npx vitest run tests/card/follow/act155-w4-follow-overview-assembly.test.ts
tests/card/follow/act155-w4-followers-view-content.test.ts
tests/card/follow/act155-w4-following-junction-core.test.ts` - 3 files passed, 14 tests passed.

They are cited here and not copied into this branch, because they import
`src/card/render/virtual-card-registry.js`, a module that arrived with the followers port change
in the candidate and is not in this family branch. Copying them here would leave a red test on
this branch, which would be a worse record than a cited pin.

## Reproduction from this branch's own tip

The same probe was re-run from this branch's own tip and ONE leg is red there: ACT-155 W4, the followers list and the all-followed-cards view. The other fourteen legs are green. The reason is the port, not the instrument: the followers port change (port/oracle-followers-address-settle-20261022, merged into the candidate as d6b4219f) is not in this family branch, so this branch's engine still answers the old way. The row's measurement is therefore on the candidate, which is the tree that carries the change.

Evidence in `family-branch-reproduction/`: the probe's own result JSON and the run's console log.
## Disposition

`DONE`. The row's verification ran on the pinned candidate, all fifteen legs are green including
the ACT-155 leg the row was red on, and the behaviour is pinned by the candidate's own tests.
The receipt is the measurement.
