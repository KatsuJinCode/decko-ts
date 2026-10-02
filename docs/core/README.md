# Decko Core

Decko Core is the working name for the runtime-independent Decko project. TypeScript and Ruby are implementations of a shared behavioral contract. This is an architectural direction and work program, not a claim that dual-runtime abstraction is complete or an upstream naming decision.

The private repository remains `KatsuJinCode/decko-ts` to avoid disrupting active checkouts and links. Renaming or publishing a repository is a separate reviewed operation.

## Authoritative documents

- [Architecture and acceptance](architecture.md)
- [Commit, push and publication gates](governance.md)
- [Work board](work-board.md)

The existing `docs/port-tracker.md` and stream notes are implementation history. Their completion statements must be checked against current evidence. This contract supersedes conflicting TS-only/support-tail direction for future work; it does not erase earlier decisions or retroactively accept deliverables.

## Direction sources

- [Upstream proposal](https://github.com/decko-commons/decko/issues/1282)
- [Ethan's response](https://github.com/decko-commons/decko/issues/1282#issuecomment-5767310016): welcomes mainline, TypeScript-first, advisory participation; legacy mods may be excluded; defer redesign.
- [Julian's posted direction](https://github.com/decko-commons/decko/issues/1282#issuecomment-5768459870): DSL/mods are core; runtime abstraction; four parity categories; first-class Ruby; measured hosting goals.
- [Critical review](../upstream-1282-external-critical-review-fulltext.md) (third-party AI commentary, full text recorded with its provenance), adopted selectively, not as binding instructions.

## Scope and evidence boundaries

Engine and cross-runtime work belong here. the site owner-specific content, integrations and demo operations remain in their existing projects, linked when needed. Private production content and raw dumps must not be included in public audit fixtures. Sanitized fixtures require a documented privacy review before publication.

Every upstream-facing component must explain its Ruby reference, what behavior is preserved, what was abstracted or replaced, intentional deviations, and reproducible verification. The public contribution should be an ordered reviewable series, not an unexplained repository dump.
