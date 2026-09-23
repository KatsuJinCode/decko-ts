# Final rounds: from port-complete to Ethan-ready publication

The round plan after the port itself is done. Everything here is downstream of
the decko-commons#1282 conversation — Ethan's review thread and the adversarial
review he commissioned from Astra (his ChatGPT model), preserved verbatim in
`docs/upstream-1282-external-critical-review-fulltext.md` (16-row claim table,
21 section theses, 7 gates, lines 128-139).

## The gate that shapes everything

Ethan's first move on receiving the fork will be what he did last time: ask
Astra for a critical review. So before he ever sees it, the fork is pre-vetted
by Astra itself — Julian runs the actual Astra review against the packaged
repo (ChatGPT), we patch every finding, and the review Ethan commissions
finds little purchase. Sequence:

1. **Internal adversarial pre-review** — our own reviewers run the same shape
   of attack the #1282 review used (the 7 gates + the claim-table method),
   find and fix what they can. This is preparation, not the gate.
2. **The real Astra review** — Julian runs it against the cleaned, packaged
   fork. Findings patched until the ground is clear.
3. **Only then** the link goes to Ethan (Julian's send; no public action
   without his exact-package approval — standing rule).

## Round P — publication readiness (before either review)

The repo must be presentable, followable, and fully auditable by a stranger:

- **Hygiene sweep** — nothing in the published tree but port work:
  - no corpus fixtures or Culturesmith/Brandon content (the corpus DB and
    benchmarks/results stay out of the published tree; the audit docs cite
    numbers, not data),
  - no secrets, keys, machine paths (C:/Users/..., C:/localProjects/...),
    session ids, agent transcripts, memory/skill references, or internal
    comms; grep-driven sweep with every hit triaged,
  - git history audit: the publish ref's history gets the same sweep
    (a clean tree over a contaminated history is not clean).
- **Audit walkthrough** — the "here's how to vet it yourself" document:
  the four parity domains (persistence / semantics / rendering / side
  effects), how each is evidenced (PROVEN table in
  `docs/parity-ledger-2026-09-22.md`, the corpus replay method, the oracle
  byte-capture suite), how to run every suite, and what each gate number
  means.
- **Fork migration assessment CLI** — one command an upstream maintainer
  runs after cloning: executes the test suites, prints the four-parity
  scorecard and gate status, and (where a Decko database is supplied)
  renders sample cards from their deck through the TS engine so they can
  diff output against their live deployment. The point: Ethan verifies by
  running, not by trusting.
- **README + repo surface** — install/run/test quickstart, layout map,
  honest status (what is byte-proven, what is partial, what is deferred).

## Current in-flight rounds (context for the above)

- Activation round (superView migrations + surface wiring) — running.
- Registration wiring (manifest content-override field + SetLoader
  population + 30-mod order-constrained registration + mod events surface).
- Capstone: 48-shard corpus replay, 4 slices grinding; on completion every
  realFail reconciles against the ledger's failure classes and the capstone
  proof is recorded with its commit hash.
- Oracle byte-capture round (per-mod view bytes vs live Ruby).
- CF worker redeploy + live smoke (Gate 6 numbers).

Gates 1/3/4/5 evidence is in the ledger; Gate 2 (live PostgreSQL rung) and
Gate 7 (migration promise) are explicitly out of scope until Julian calls
them.
