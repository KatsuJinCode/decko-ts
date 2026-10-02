# Staged-corpus provenance: the between-runs swap window

## The failure class this closes

The photographed corpus
(`tmp/raw-ground-truth/deck-recapture/corpus-v2.sqlite3`) and its
byte-variants can coexist as same-size copies across worktrees. A copy
that preserves mtimes (Node's `copyFileSync` does on Windows, via
`CopyFileW`) can silently replace a worktree's staged corpus in place.
Nothing in the capture/grade pipeline checks the window BETWEEN runs:
`stageFile` guards destinations during a capture-and-grade run, and
`verifyManifestForGrading` runs at grade start. A swap landing in the
between-runs window stays undetected until the next grade refuses it.

## The guard

`tools/verify-staged-corpus-provenance.mjs` makes that window checkable
in seconds at any time — no capture, no grade, no Ruby, no server; one
sha256 over the staged corpus per repo, read-only:

    node tools/verify-staged-corpus-provenance.mjs --repo <dir> [--repo <dir> ...]
    node tools/verify-staged-corpus-provenance.mjs --repo <dir> --photograph <dir>

Per `--repo` it hashes the staged corpus and compares the hash against
the sha256 the photograph's capture manifest binds (the manifest beside
the corpus, or inside the `--photograph` directory for a content
addressed photograph). A refusal names the FULL expected sha256 and the
FULL live sha256, so the photograph a corpus was swapped with — and any
same-size sibling copies — can be located by grep across worktrees. A
prefix-only refusal cannot be chased that way.

## Outcomes per repo

| outcome  | meaning |
|----------|---------|
| verified | manifest present; live corpus sha256 equals the sha it binds |
| REFUSAL  | corpus bytes differ from the bound sha (the swap signature); or before != after (void photograph); or the manifest is unparseable/wrong-schema while a corpus sits staged; or the corpus is missing while a manifest still binds it |
| unbound  | corpus present, no manifest (never photographed here) — reported, NOT a refusal: nothing recorded can be contradicted |
| absent   | neither corpus nor manifest (worktree never set up) — a note |

Exit codes: 0 = every staged corpus verified or merely unbound/absent;
4 = any provenance refusal (the capture-and-grade family convention);
1 = usage error (bad arguments, nonexistent `--repo`/`--photograph`).

## The primitives it shares with the runner

`tools/capture-manifest-provenance.mjs` supplies the semantics — one
implementation, two invocation windows (staging-time here, grade-time in
the runner):

- `sha256File` — content identity, never mtime.
- `sqliteHeaderChangeCounter` — the SQLite header change counter at
  byte offset 24 (big-endian uint32; the file-format specification has
  it increment on every transaction), recorded alongside the sha256 in
  the manifest.
- `stageFile` — a copy that fails loudly when a pre-existing
  destination's bytes differ from the source; presence alone is never
  trusted.
- `verifyManifestForGrading` — the refusal gate: no manifest, no grade;
  before != after, no grade.

## Programmatic use

Corpus-scale vitest seeding imports `verifyStagedCorpus` from the tool
and refuses on `!ok` before seeding, so a verification run cannot start
on swapped bytes. Importing the module is side-effect free; only running
it as a program executes the multi-repo scan.
