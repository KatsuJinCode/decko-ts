# Provisioning the private corpus shard pair for the coderay byte-identity gate

**What this is:** the provisioning command and provenance record for
`fixtures/corpus/shard-000000.jsonl` + `shard-000001.jsonl` — the machine-local
private shards consumed by
`tests/card/render/code-highlighting/coderay-byte-identity.test.ts`
(12 shard-dependent tests). The shards are **gitignored, machine-local, and
never committed** (`.gitignore`: `fixtures/corpus/`; the `46a05a64` contract
treats them as the private leg, resolved repo-relative via
`src/testing/test-corpus-paths.ts` `PRIVATE_SHARD_DIR_PATH`).

**The command:**

```
python benchmarks/corpus-v2/reconstruct-coderay-byte-identity-shard-pair.py
```

then the gate:

```
npx vitest run tests/card/render/code-highlighting/coderay-byte-identity.test.ts
```

## History and provenance

- The original shard pair came from the private corpus-v2 capture pipeline
  (`build_corpus_v2.py` over the production dump). It was **untracked** and
  was lost with the 2026-10-02 deletion of the root checkout
  `C:/localProjects/decko-ts`. Machine-wide hunt 2026-10-06 (this lane;
  locations the adjudication had not covered): no `fixtures/corpus/` in any
  of the 27 `decko-ts-*` worktrees; `C:/backups/` holds only the deck DB;
  no `bench-corpus-v2.sqlite3` anywhere. The original shards are gone.
- What survived, **git-tracked** in this repo: the six Ruby oracle captures
  the gate byte-compares against
  (`fixtures/captured/coderay/{json-tinymce-corpus-53,css-corpus-198,
  html-layout-corpus-314,html-layout-shard1-2339,html-layout-shard1-2347,
  html-layout-shard1-2575}.html`), the committed deterministic pipeline
  (`benchmarks/corpus-v2/build_corpus_v2.py` +
  `benchmarks/sanitize_corpus.py`), and the committed miniature shard
  (`fixtures/test-corpus/test-corpus-shard-000000.jsonl`) that fixes the
  JSONL line shape.
- Reconstruction source: `C:/backups/decko-db-2026-10-03/dump-postscrub.sqlite3`
  (sha256 `623f5fcbfdbdde6e38d6a5b179e33a23c04cd1f4ec35c85779f2ee5ee6c66afd`),
  the scrubbed serving deck (21,670 cards / 48,525 references) copied
  2026-10-03 — AFTER the deletion — by operator order ("sacred data gets a
  copy somewhere safe"; see that directory's PROVENANCE.txt and sha256.txt).
  It holds all six cards. Override with
  `DECKO_TS_CODERAY_SHARD_SOURCE_DB=<path>`.

## Why the bytes are faithful

The lost shards carried the pipeline's SANITIZED deck content (text runs ->
deterministic same-byte-length filler, tag skeleton kept, inclusions resolved
to sanitized names). That transform is committed and deterministic, so the
provisioning script drives the actual committed functions
(`v2.reconstruct_names`, `v2.fit_tokens`, `sanitize_content`) over the backup
deck and writes the six sanitized records. Verification is not assumed:

- Byte proof, 2026-10-06, this lane: for every one of the six cards,
  `highlight(sanitized-content, lang)` reproduces the tracked Ruby oracle
  capture **verbatim** (probe over the esbuild-bundled
  `src/card/render/code-highlighting` module; then the vitest gate itself:
  23/23 in one file). Two of the six captured contents contain non-structural
  atom tokens, so the backup subset deck's atom vocabulary demonstrably
  reproduces the original token assignment for this pair.
- Length proof: `sanitize_content` preserves byte length exactly — every
  card: raw == sanitized byte count (618/743/1358/457/446/191).

## What is NOT reproduced (named)

- Minimal entry sets: only the six entries the gate reads; the lost originals
  held the full per-shard entry sets.
- The per-entry captured `views` objects from the Ruby render sweep (no
  backup holds them). Any future consumer needing captured views needs the
  full corpus-v2 pipeline, not this pair.
- The record fields beyond content (`name`, `key`, `type`, ...) are
  regenerated through the same committed sanitizers; the gate reads only `id`
  and `record.content`.

## Known sharp edge (found by this lane, not fixed here)

The port's JSON scanner (`src/card/render/code-highlighting/scanners/json.ts`)
**hangs at 100% CPU on the raw deck content of card 53** (the real tinyMCE
config, 618 bytes of valid JSON). The corpus's sanitized filler never
exercises that input shape, so the gate stayed green while the latency bug
sat latent. Diagnosed 2026-10-06 during shard reconstruction; fix belongs to
its own adjudication in the code-highlighting suite.

## Scope relative to the 46a05a64 contract

This pair provisions the private leg for the coderay gate ONLY. The contract's
rich-corpus opt-in (`DECKO_TS_CORPUS_V2`, which additionally requires
`shard-000014.jsonl` and a corpus DB) is a separate mechanism this test does
not use; this script does not satisfy or touch it. The gate fails loudly when
the pair is absent — skipping on missing data was explicitly overruled for
this suite.

## Lane record

Provisioned 2026-10-06 by the coderay-corpus-provisioning lane; receipt:
`brandonDojoTech/tmp/wrong-goal-hunt/coderay-corpus-provisioning-lane.md`;
run logs: `tests/card/render/run-logs/coderay-corpus-provisioning/`.
