# Private development and public contribution gates

Status: approved by Julian 2026-09-21. No public publication authorized by this document.

## Private board

Verify repository privacy before writing issues or pushing. Record scope, owner/assignment when known, dependencies, acceptance criteria and evidence on each item. Use linked successors for new acceptance work; preserve closed issue history. A private issue may contain work notes but never credentials or unnecessary production data.

## Commit gate

Inspect the exact staged diff. Include only intended changes with known provenance; exclude secrets, raw production data and unexplained generated/compiled artifacts. Preserve other workers' edits. Verify bytes persisted. Run checks appropriate to the change and record limitations. Keep commits coherent; label experimental checkpoints rather than presenting them as accepted work. Do not delete caches without understanding their provenance.

## Private push gate

Verify remote identity, private visibility, branch and the complete outgoing commit range. Push reviewed work only. Do not push unrelated unreviewed commits from a shared checkout. Use an isolated branch/worktree when needed. Verify the pushed commit on the remote. Record any legacy-hook bypass and the replacement checks; never silently bypass validation.

## Upstream preparation gate

Prepare a separately reviewed publication surface. Do not flip the private work board public. Audit every commit and file that would be exposed, including history, fixtures, logs, source licenses/attribution, generated content and private identifiers. A clean tip is insufficient if history contains private material.

Prepare an ordered series with:

1. Architecture overview and supported runtime/backend matrix.
2. Ruby source/version to implementation component mapping.
3. Explanation of preserved, abstracted, replaced and deferred behavior.
4. Four-category parity results, known failures/deviations and reproduction instructions.
5. DSL/mod guide with representative Ruby/TS examples and compatibility inventory.
6. Migration, installation, upgrade, recovery and support documentation.
7. Measured claims tied to exact workloads and revisions.

Each contribution must answer: What Ruby behavior is implemented? Where is its reference? What changed architecturally? What proves compatibility?

## Public action gate

Show Julian the exact destination, repository/history or commit range, files/artifacts, visibility, and proposed public text. Obtain explicit approval for that package before public pushes, issue changes, comments, releases, packages, deployment or visibility changes. Approval of a private task is not publication approval. A material change to the approved package requires renewed review.

Existing public claims remain untouched until Julian approves measured replacement wording. The upstream issue receives only approved updates. Private GitHub board changes are authorized within approved scope after visibility verification.

## Acceptance gate

Private push, public availability, issue closure, maintainer review, and end-to-end acceptance are separate statuses. Publish no completion claim unsupported by the four-category evidence and the supported-deck migration tests. Do not impose a Ruby retirement date; first-class support scope is part of the architecture work.
