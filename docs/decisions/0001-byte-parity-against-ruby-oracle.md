# Byte parity against a Ruby oracle is the acceptance test

## Context

This engine is a port of Ruby Decko. "Ported" and "behaving like the thing it
was ported from" are different claims, and the second one is the one users
depend on: a deck is migrated by pointing a browser at the new engine and
expecting nothing to change.

Testing an engine against its own recorded output proves only that it is
consistent with itself. It cannot detect a wrong decision that was recorded
once. The alternative to testing against Ruby is trusting that the port's
author read the Ruby correctly, which is exactly the assumption most likely to
be wrong.

Ruby itself is hard to compare against in the abstract, because rendering is
nondeterministic: every wrapped slot carries a randomly generated DOM
identifier, timestamps are real times, and card identifiers depend on the
history of the database rather than on the deck's content.

## Decision

Parity is measured by byte comparison against output captured from a running
Ruby Decko, and it is the acceptance criterion for the port.

Three consequences follow from taking byte comparison seriously:

- **A running oracle is part of the build.** `tools/oracle/` holds a Ruby
  app and the scripts that record its behaviour. The app is disposable and
  rebuildable; the fixtures it produces are committed.
- **Nondeterminism is removed at the comparison seam, not by a tolerant
  comparator.** Each instrument defines its own normalisations, and a figure
  takes the normalisations of the instrument that produced it — never a
  different instrument's. The authoritative per-instrument table is in
  [../parity-method.md](../parity-method.md), "Every instrument's
  normalisations, in one table": the public harness's N1/N2/N3, the oracle-replay
  comparator's three rules, and the historical corpus's four normalizations
  plus two transforms and its 50 live-swapped expectations (two disjoint
  swap sets of 13 and 37, from the live 0.19.1-era site). Timestamps and
  creator identifiers are excluded from capture rather than normalized, so a
  divergence there cannot hide. Card identifiers are stripped from both sides
  before comparison, because they are database-local rather than
  content-derived.
- **Everything else is exact bytes.** No whitespace tolerance, no case
  folding, no attribute reordering. A tolerant comparator would convert the
  measurement into a weaker claim than the one being made.

The corpus used at scale — a full capture of a real deck — is **not
committed**, because it contains that deck's real content, which is personal
data belonging to someone who did not authorise its redistribution. That
constrains who can re-run the full measurement, and the constraint is accepted
rather than worked around by sanitising the corpus.

## Consequences

Parity claims are reproducible only where the fixtures are. A clean clone can
replay every committed fixture and prove parity on the miniature corpus; the
corpus-scale figure can only be re-derived where that corpus is available.
Every quoted figure therefore names the corpus it was measured on.

The method measures what the capture recorded. A mod whose behaviour is
exercised by four views has byte-level proof for those four views and no
other; "a renderer exists" is not "the renderer matches". Where an area has
no oracle — CQL's regular-expression match on SQLite is the standing example,
where Ruby itself cannot execute the feature — the gap is stated rather than
papered over, and where a second oracle was feasible it was built.

The cost is that a parity failure is a byte diff, and byte diffs do not
explain themselves. That is accepted: a comparator that normalised more would
hide the class of bug this measurement exists to catch.