# Working-rows batch h: the fifteen named rows

Lane: lane-workbatch-h-3-1. Question asked: take the fifteen rows the brief
named, close each one with its own instrument and evidence, or name the exact
mechanism that holds it.

Base: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip of the
canonical roll `deploy/full-candidate-20261101`, verified with `git ls-remote`
(`c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`). The lane's own checkout is a
worktree of this repository's object store, created with the disk steward's
own entry point (`create_worktree.py`, branch `port/workbatch-h-20261025`,
lease `b246b5f90fd8`).

## The rows and what each one is

| row | family | disposition |
|---|---|---|
| `pd-3` | promised-deliverable | closed: the coverage inventory's side-effects row reconciled with the battery that measures it, all seven declared steps named with their reasons |
| `pd-4` | promised-deliverable | closed: the mod-compatibility figure regenerated on the tree this branch ships, with the missing-by-construction caveat re-derived |
| `pd-5` | promised-deliverable | closed: the signed-in edit-link parity regression's status determined and stated in the ledger |
| `pd-15` | promised-deliverable | closed in part: the cardtype half of the named repair landed; the format-dispatch half named with its call sites |
| `mods-carrierwave-attachment-write-path-500-on-bytes` | mods | closed: the write path stores a multipart create end to end, and the 500 was the host's unarmed files area |
| `pd-1` | promised-deliverable | named: the scrub the row asks for is ruled out by the delivery pipeline's own recorded ruling; the contamination is measured and still in the engine tree |
| `pd-6` | promised-deliverable | closed: the browser capture terminates on a25329a8 with the bundle bytes the row names (242 of 242 checks passed, the capture of record landed) |
| `pd-12` | promised-deliverable | named: the live deployment is refused until an operator arms its files area |
| `pd-13` | promised-deliverable | named: the ACT-165 probe legs' scripts and receipts were pruned with their checkout; the row's other half is the operator's scope ruling |
| `save-ROW-4` | save-path | named: the population is measured, the lever that could pay is named, and the lever's own risk is why it is the family's to land |
| `smell-read-private-index-progress` | smell-test | named: the deck the instrument opens was swept with its checkout's runtime tree |
| `smell-retire-owned-migration-credential` | smell-test | named: the instrument's custody constant names a path that no longer holds the credential, and re-pointing it would arm a deletion of a live account credential |
| `smell-run-private-index-render-comparison` | smell-test | named: two of the instrument's inputs were swept with the pinned checkout |
| `smell-verify-hosted-widget-content` | smell-test | named: the row's answer is a live hosted answer, and every one of the twelve addresses answers 404 |
| `smell-verify-staging-probe-restoration` | smell-test | named: the verification is two live account reads whose expectations have moved on the live scripts |

## The receipts

One per row, under this directory's row-id directory, each with the command
that produced it and the observed output.

- the closed rows' receipts are under
  `docs/runs/promised-deliverable-workbatch-h-20261025/<row-id>/RECEIPT.md`,
  with their captures under
  `fixtures/captured/promised-deliverable-workbatch-h-20261025/`;
- the named rows' receipts are under this directory's row-id directory.

## The battery

    npm test

    -> Test Files  1 failed | 710 passed | 54 skipped (765)
       Tests       1 failed | 7350 passed | 227 skipped (7578)

The one failure is the machine's lane-worktree disk hygiene gate
(`tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts`), and it is the
same failure the base commit carries: the gate reports two violations, one
of them the `decko-ts-lane-archives` worktree that is neither tracked in
IN-FLIGHT.json nor in `tests/hygiene/keep-worktrees.json`, and the gate's own
message carries its remediation command. It is machine state, not this lane's
change.

The same run at the base commit `c17906db` reported 5 failed files and 9
failed tests: eight of those were the MySQL suites, which failed because the
machine's MySQL 8.4.11 server binary was absent at that moment (it landed in
the machine's cache during this lane's session, and those suites pass now:
14 files, 160 tests, all passed), and the ninth was this hygiene gate. So the
battery holds its known failure set at this lane's final commit and adds
none.

The typecheck (`npx tsc --noEmit`) reports no errors at this commit.

The battery ran at `c3bc97ee`, the last commit that changes the tree's
behaviour or its evidence; the only change after it is this paragraph.

## What this lane did not do

It did not deploy, did not contact a hosted edge, did not touch the dot-com
domain, did not publish anything, did not change any deployment's
configuration, did not read any credential's contents, and did not reset,
stash, clean or remove anything in git.
