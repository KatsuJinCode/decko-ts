# Decko Core

Decko Core is the working name for the runtime-independent Decko project. TypeScript and Ruby are implementations of a shared behavioral contract. This is an architectural direction and work program, not a claim that dual-runtime abstraction is complete or an upstream naming decision.

This directory describes the engine's own architectural direction and the gates
that govern how it is published. It is not a dispatch board: the outstanding
work is stated where a reader will meet it — in `KNOWN_FAILURES.md` and in
`docs/README.md`'s decision list.

## Authoritative documents

- [Architecture and acceptance](architecture.md)
- [Commit and publication gates](governance.md)

The existing `docs/port-tracker.md` and stream notes are implementation history. Their completion statements must be checked against current evidence. This contract supersedes conflicting TS-only/support-tail direction for future work; it does not erase earlier decisions or retroactively accept deliverables.

## Direction sources

- [Upstream proposal](https://github.com/decko-commons/decko/issues/1282)
- [Ethan's response](https://github.com/decko-commons/decko/issues/1282#issuecomment-5767310016): welcomes mainline, TypeScript-first, advisory participation; legacy mods may be excluded; defer redesign.
- [The project owner's posted direction](https://github.com/decko-commons/decko/issues/1282#issuecomment-5768459870): DSL/mods are core; runtime abstraction; four parity categories; first-class Ruby; measured hosting goals.

## Scope and evidence boundaries

Engine and cross-runtime work belong here. the site owner-specific content, integrations and demo operations remain in their existing projects, linked when needed. Private production content and raw dumps must not be included in public audit fixtures. Sanitized fixtures require a documented privacy review before publication.

Every upstream-facing component must explain its Ruby reference, what behavior is preserved, what was abstracted or replaced, intentional deviations, and reproducible verification. The public contribution should be an ordered reviewable series, not an unexplained repository dump.
