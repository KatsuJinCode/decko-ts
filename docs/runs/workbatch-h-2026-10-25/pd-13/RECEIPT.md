# pd-13: the ACT-165 probe legs, named at what is left of them

- The row's own label: "operator/Brandon scope ruling on ACT-165 comment
  edit/remove"
- The row's own blocker: "Run the two green ACT-165 probe legs against the
  booted Ruby oracle so the parity half is measured rather than the CM2
  contract merely asserted, then land the comparison receipt."
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip
  of `deploy/full-candidate-20261101`.

## Verdict: named, not closed. The probe legs' own artifacts are gone, and the
## row's other half is an operator ruling.

## The two halves of the row

1. The measurement: the two ACT-165 probe legs run against the booted Ruby
   oracle, so the parity half is measured rather than asserted.
2. The ruling: the scope question on ACT-165's comment edit and remove
   surfaces, which is Brandon's call, not a lane's.

## What this lane measured about the first half

The checkout that held the probes was pruned to the oracle app alone:

    $ ls C:/localProjects/decko-ts-wt-probe-act165-173/
    reference-harness/

    $ ls C:/localProjects/decko-ts-wt-probe-act165-173/reference-harness/
    oracle/

    $ ls C:/localProjects/decko-ts-wt-probe-act165-173/.runtime/exhaustive/probe-ACT-165/runA/
    ls: cannot access '...': No such file or directory

The receipts of the two green legs (the `probe-ACT-165-result.json` the
blocked-bucket audit of 2026-10-19 read) and the probe scripts that produced
them are not on this machine, and the probe driver is not committed in this
repository either: a search of the tree for a probe driver naming
`probe-ACT` finds the browser probe tooling and the docs that cite the
activity, and nothing that would produce that receipt.

The Ruby oracle itself is present and bootable on this machine (Ruby 3.4.11
with the pinned gem tree at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`, and the oracle app
under `reference-harness/oracle/`). What is missing is the probe half: the
scripts and the recorded answers to compare against.

## What would close it

- the measurement half needs the two ACT-165 probe legs' scripts to exist as
  an instrument in a tree (they were a lane's scratch, not a committed
  driver), and then the booted Ruby oracle's answers for the same legs, so
  the comparison receipt can be landed;
- the ruling half is Brandon's: the scope question on ACT-165's comment edit
  and remove surfaces is not a lane's call, and this lane did not make it.

## What this lane did not do

It did not boot the Ruby oracle, did not run a probe leg, did not make the
scope ruling, and did not change any source.
