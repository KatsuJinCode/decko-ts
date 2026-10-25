# smell-verify-staging-probe-restoration: two live account reads, named

- The row's own label: "smell/probe script verify-staging-probe-restoration.mjs"
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs`
- The prior receipts for this row:
  `docs/runs/smell-row-conversion-r5-2026-10-24/smell-verify-staging-probe-restoration/`
  and the round six summary `docs/runs/smell-row-conversion-r6-2026-10-25/README.md`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`.

## Verdict: named, not closed. The row's verification is two live account reads.

## The mechanism, in one sentence

The instrument reads the account key from the account secrets file and then
issues two live account API metadata reads, and what those reads are expected
to answer has moved on the live scripts, so neither the call nor a fresh
receipt belongs to a lane that does not own the live scripts.

## What the receipts of record say

The round five lane took the reading: all six flags on both scripts are
unchanged, and one script's release id moved. The round six summary names
the same reason and adds the part that stays open: "the instrument states no
pass condition of its own, so its reading cannot be judged without an
operator naming the flag values the restored staging state must carry."

## What would close it

Two things, and the second is the operator's:

1. the live scripts' current expectations are the ones the instrument's two
   reads are checked against, which is the scripts owner's work;
2. an operator names the flag values the restored staging state must carry,
   because the instrument states no pass condition of its own.

## What this lane did not do

It issued no live account API call, read no account secret's contents, and
changed nothing on any hosted environment.
