# Architecture and acceptance contract

Status: approved direction, implementation incomplete. Recorded 2026-09-21.

## Model and runtimes

Define Decko independently of its host language through observable behavior: cards and names, relationships, CQL, sets/rules, permissions, views/formats/nests, history, events, files, jobs, authentication and the extension system. Keep adapters and runtime infrastructure outside that behavioral contract. Sharing a specification and tests does not require a single executable core or mechanical translation of arbitrary source.

TypeScript remains the active new implementation. Ruby is first-class, not merely a retiring reference. Work must define supported Ruby versions, integration strategy, regression execution and maintenance ownership. PostgreSQL support proceeds in parallel with SQLite/D1 and libSQL; PostgreSQL is not a prerequisite for continuing edge work. Additional languages are extension opportunities, not current implementation commitments.

The DSL and nonlegacy mods are core scope. Inventory syntax, registration, precedence, method/view overrides, event ordering and runtime dependencies. Port representative mods and verify behavior. Clearly distinguish unchanged source, translated code and unsupported dependencies. Identify legacy exclusions explicitly, using maintainer guidance.

## Four required parity categories

| Category | Evidence required |
|---|---|
| Persistence | Equivalent resulting state for create/update/rename/delete/revive, history, references, migrations and transaction failures; preserve identifiers and relationships required by the supported contract. |
| Semantics | Equivalent names, CQL, rules, permissions, sets, nesting, context, errors and extension dispatch across supported runtimes/backends. |
| Rendering | Equivalent supported formats and request behavior on versioned fixtures. Preserve strict byte comparisons for deterministic outputs. Normalize only documented nondeterminism, with both raw evidence and the normalization rules retained. |
| Side effects | Equivalent events, jobs, mail, notifications, file operations, cache invalidation and authentication transitions, tested through captured effects and isolated services. |

Report each category separately with total coverage, pass, fail, skipped and pending counts. State whether categories overlap. Pin code revisions, reference versions, fixture provenance, environment and reproduction steps. Distinguish source inspection, focused tests, differential tests and installed/end-to-end acceptance. No aggregate completion percentage without a defined denominator.

## Optimization and portability

Evaluate algorithmic improvements for Ruby and TypeScript under the same contract. Measure runtime-specific implementations separately. Optimizing Ruby is part of the shared program, not a prerequisite detour or a promise that identical code can run in both languages.

Distinguish compound-name junction structure from content inclusion/nesting before graph optimizations. Test dynamic references, context-dependent names, permissions, cycles and depth limits. Track round trips, statements, rows scanned, CPU, memory, cold/warm latency and concurrency. A constant statement count is not constant computational cost.

Provider adapters must declare transaction/isolation, rollback, search, collation, generated-ID, time and resource-limit behavior. Reject unsupported operations explicitly rather than silently weakening semantics.

## Migration and operations

Data import is one component of migration. Acceptance includes files, accounts, rules, mods, jobs, configuration, upgrade and recovery. Retain one authoritative writer during comparison. Replay writes into isolated state with external effects captured; do not execute duplicate production side effects. Cutover and rollback require explicit reconciliation of writes made after cutover.

Verify fresh-account deployment and existing-deck migration as separate user journeys. Hosting cost is workload-dependent. Existing public claims are replaced only by measured values with their instrument named; unmeasured values are hypotheses, not findings.

## Deliberate non-requirements

- No restart around PostgreSQL-first or a mandatory Ruby optimization prerequisite.
- No blanket normalization of HTML or relaxation of parity to make tests pass.
- No promise of unchanged arbitrary Ruby execution in a TS runtime.
- No mandatory implementation of every language or provider.
- No energy research project solely to withdraw an existing claim. Gather defensible measurements and distinguish CPU proxies from energy measurements.
- No singularization or other behavioral redesign hidden inside port work.
