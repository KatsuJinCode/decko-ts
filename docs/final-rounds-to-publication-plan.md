# Final rounds: from port-complete to Ethan-ready publication

The round plan after the port itself is done. Everything here is downstream of
the decko-commons#1282 conversation — Ethan's review thread and the adversarial
review he commissioned from Astra (his ChatGPT model), preserved verbatim in
`docs/upstream-1282-external-critical-review-fulltext.md` (16-row claim table,
21 section theses, 7 gates, lines 128-139).

## What the product is (operator steering, 2026-09-23)

The deliverable is the **migration path**. The population that matters is the
small number of teams running existing Decko decks, and the win is minimum
friction in three dimensions at once:

- **Data** — an existing Decko database lands in D1 without hand-rebuilding
  content (importer path, prototype already exists: the corpus extraction
  machinery reads real deck databases; `deploy/seed` is the landing zone).
- **Launch** — one command from "my deck's database" to "my deck running on
  Workers" (milestone M2's one-click deploy, made the acceptance).
- **Experience** — the deck renders and behaves as the migrating user knows
  it; every visible difference is enumerated and labeled rather than
  discovered.

Byte-for-byte render parity is the **trust mechanism** for the experience
dimension, not an end in itself: it is claimed where it is corpus-proven
(content rendering) and labeled honestly everywhere else. The Rails-generated
admin chrome is a potential later port — never the priority. The fork ships a
functional, honestly-labeled native admin, and Gate 5's
tested/unchanged/porting/impossible inventory is the mod headline. Decision
rule for every remaining mod thread: does this reduce migration friction?

**OPEN DECISION (operator flagged 2026-09-23): the published headline's
byte-parity scope.** The framing above is the migration-first position, but
the operator has not ruled the headline scope — and flagged exactly that gap.
Two clean options: **(A)** headline = byte parity on content rendering
(corpus-proven), admin UI functional and labeled — the migration-first
position; **(B)** headline extends byte parity to the admin surface, which
requires porting the Rails HTML output layer before publication (weeks of
additional work against a framework-internals oracle). Until the operator
rules, nothing public claims either, and the engine keeps byte-matching
every surface it can reach — no test was or will be downgraded in the
meantime.

**CF data rule (refined by the operator 2026-09-23, recorded verbatim in
memory):** raw Brandon content never uploads to Cloudflare without a
per-deployment safety assurance; **shape-preserving anonymized data is
operator-approved for scale testing** — same card count, same connections,
same sizes, words replaced with meaningless ones — gated by a verification
that zero original text survives in the deployed artifact.

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

- Sensible test: static-deck prewarm driver landed and validated
  classification-identical on shard-0; perf round (dwfrun-c08a9577) is
  fixing the two measured hot spots, then all 48 shards relaunch.
- Oracle byte-capture round landed (dwfrun-1965a3e7) — per-mod view bytes
  pinned against live Ruby; two engine parity bugs found and fixed.
- **Round M — migration path** (bumped ahead of deep mod work): deck
  importer → D1, one-command launch, migrating-user change inventory,
  PostgreSQL read path for the importer (Gate 2's rung).
- CF worker redeploy with the metrics recorder + measured smoke
  (the live numbers: p50/p95/cold start/CPU/D1 rows/cost).
- Event execution seams and mod deepening continue in batches behind the
  above, ordered by the migration-friction decision rule.

Gates 1/3/4/5 evidence is in the ledger; Gate 2 (live PostgreSQL rung) and
Gate 7 (migration promise) are explicitly out of scope until Julian calls
them.
