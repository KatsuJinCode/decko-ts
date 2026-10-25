# smell-retire-owned-migration-credential: an operator decision, named

- The row's own label: "smell/probe script retire-owned-migration-credential.mjs"
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/retire-owned-migration-credential.mjs`
- The prior receipts for this row:
  `docs/runs/smell-row-conversion-r5b-2026-10-24/smell-retire-owned-migration-credential/`
  and the round six summary `docs/runs/smell-row-conversion-r6-2026-10-25/README.md`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`.

## Verdict: named, not closed. The action is an operator decision.

## The mechanism, in one sentence

The instrument's own custody guard refuses before it can delete anything,
because the path its constant names no longer holds the credential while the
prepared-access record of record names a different path, and re-pointing the
constant would arm a deletion of a live account credential.

## What this lane measured (paths only, the file's contents were not read)

    the instrument's constant path
      C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env
      -> absent (that checkout's whole runtime tree is gone)

    the prepared-access record's path
      C:/localProjects/decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env
      -> present (458 bytes, written 2026-10-18)

The instrument's guard is one line (its line 4): it refuses unless the
applied migration passed, the hosted check passed, the credential path equals
the constant AND the credential is git ignored. Three of the four hold; the
path equality is the one that fails, and the guard is one line before the
unlink the instrument performs. The round five-b lane recorded that refusal
with its error text.

## What would close it

One of two operator decisions, and this lane made neither:

- the constant is re-pointed at the path the prepared-access record names,
  which is a code change in the probes tree, and it ARMS the deletion;
- an operator decides that the credential at the other path is the one to
  retire.

A second refusal sits behind the first: the instrument writes its receipt
with the exclusive-create flag into a directory where the receipt of record
already exists, so even a successful run could not write a fresh receipt
there.

## What this lane did not do

It did not remove any file, did not read the credential's contents, did not
re-point the constant, and made no request to any hosted edge.
