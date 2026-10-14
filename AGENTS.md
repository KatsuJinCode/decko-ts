# Decko Core agent rules

This repository is the Decko Core implementation workspace. Read
the project contract and publication gates (not part of this package) before changing scope or
publishing anything.

- The project covers a runtime-independent Decko behavioral contract, first-class Ruby and TypeScript implementations, DSL and nonlegacy mods. PostgreSQL is parallel work; applicable optimizations must be evaluated for both runtimes.
- Acceptance covers persistence, semantics, rendering, and side effects. A passing subset, skipped cases, issue closure, a private push, or a deployed prototype is not complete compatibility.
- Link older work instead of erasing its history. Do not treat earlier demo-mod closures as TS DSL compatibility evidence.
- Stage only intended files. Inspect the staged diff for scope, secrets, private data, source provenance, and generated artifacts. Verify edits persisted using hashes or line counts. Preserve other workers' changes.
- Commit coherent changes with relevant checks and limitations recorded. Verify repository privacy and remote identity before pushing. Do not publish unrelated local commits merely to push your own change; inspect the outgoing range first.
- Public issue edits, comments, pushes, releases, packages, deployments, and repository visibility changes require the project owner's explicit approval of the exact publication package. Internal-board authorization is not public-publication authorization. Never flip this working repository public as a shortcut.
- Public preparation requires a full-history/provenance review of the proposed publication surface, reproducible validation, and a documented Ruby-to-implementation mapping. See governance for the evidence requirements.
- Existing public performance/cost/energy claims remain pending measurement. Do not withdraw or edit them without the project owner's approval. Do not repeat unverified claims as measured facts. Prepare measured replacement wording for approval.
- Behavioral redesign, including singularization changes, requires a separate decision. Keep experimental checkpoints distinct from accepted implementations.

These rules supplement any machine-level agent instructions and the user's
current instructions. They do not grant permission to send external messages.