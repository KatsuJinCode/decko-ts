# Commit and publication gates

The gates below govern how this repository is written and what a publication
package may contain. They are stated once here and referenced from the README.

## Commit gate

Inspect the exact staged diff. Include only intended changes with known
provenance; exclude secrets, raw production data and unexplained
generated/compiled artifacts. Preserve other workers' edits. Verify bytes
persisted. Run checks appropriate to the change and record limitations. Keep
commits coherent; label experimental checkpoints rather than presenting them as
accepted work. Do not delete caches without understanding their provenance.

Every change to the engine's rendering, semantics, persistence or side-effect
surface is checked against the byte-parity grade before it is committed
(`reference-harness/`); a performance change is not accepted on the argument
that it "should" be equivalent.

## Publication gate

Publishing this repository — or any derivative package of it — is a reviewed
operation, not a side effect of finishing the work. Before a package is
published:

- audit every commit and file in the proposed surface, including history,
  fixtures, logs, source licenses and attribution, generated content and any
  identifier that narrows down a real deployment;
- re-run the reproducible checks (`npm run typecheck`, `npm test`, the
  reference-harness grade) and record what failed, including what
  `KNOWN_FAILURES.md` already records;
- confirm that every count, figure and claim in the documentation is
  re-measurable from the published tree, or is labelled with where it came
  from and what it does not cover;
- confirm no real-deck content — card names, people, addresses, account names
  or the private application's schema — is present anywhere in the surface.

A clean tip is not sufficient: if the history contains private material, the
history is part of the surface.

## Acceptance gate

Publication, availability, maintainer review and end-to-end acceptance are
separate statuses. Publish no completion claim unsupported by the four-category
parity evidence and the supported-deck migration tests. Do not impose a Ruby
retirement date; first-class support scope is part of the architecture work.