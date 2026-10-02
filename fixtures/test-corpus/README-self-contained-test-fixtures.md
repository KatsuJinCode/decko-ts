# fixtures/test-corpus — the committed miniature test corpus

What this is: the self-contained test fixtures the suite reads instead of the
machine-local anonymized corpus. Everything in this directory is COMMITTED;
a scratch clone with none of the machine's private data runs the full
`npm test` scope from these bytes alone.

## Contents

- `test-corpus-shard-000000.jsonl` — 98 captured oracle entries extracted
  verbatim from the anonymized `fixtures/corpus/shard-000000.jsonl` (the
  private 5MB shard): every entry the corpus-pinning render tests replay
  (permission denial/readable picks, help-popover proof entries, set-card
  view targets, unknown-nest entries, Date/Image/File byte pins, the
  pointer/list pins *home/*all+*layout/*star+*create/792, mini-bar corpus:67,
  the closed-view bench card, every Date-typed entry, the 14-entry
  structure-template sample, the denial-span census sample) — plus
  CONTENT-NEST POINTER LINES: `{id, name}`-only lines for every card a
  kept entry's content nests (`{{name}}` / `{{name|view}}`), transitively.
  A nest target the shard subset omits leaves the replay with a rendered
  gap where the oracle pins nested bytes (round-7: junction-depth 19334 →
  19350; permission-replay 581 → 958). Pointer lines carry no oracle bytes
  and no record — they exist so the test-side seed sets
  (which seed the shard-line ids, then walk sides+type only) include the
  targets; the verbatim row (content kept) lives in the sqlite.
- `test-corpus-shard-000014.jsonl` — junction-depth entry 19334, extracted
  from the private `fixtures/corpus/shard-000014.jsonl`, plus the same
  nest-target pointer lines for 19334's content nests (19350, 18887).
- `test-corpus.sqlite3` — the miniature seed database (verbatim anonymized
  rows of the full closure those entries need: side/type/reference closure,
  the complete *read and *structure rule universes, every setting's rule rows
  whose setting appears on a shipped entry, the FULL rule universe (every
  stored rule row of the deck — right part is a Setting — so the engine's
  pattern-precedence rule lookups resolve identical winners; rule rows keep
  content: bars render values) and Setting-type catalog, the
  set-card-views closure (the consumer test's own self+children+sides walk
  over its 7 selector ids plus the set-type *help rule universe, replicated
  verbatim), the nest-target rows with content kept, the role/members
  read-party structure, holder-583's account subtree, and the layout
  chrome). Column
  convention matches bench-corpus-v2 (`cards.content`) so every consumer
  query is unchanged. Credential rows (+*password/+*salt/+*status) are
  re-issued with deterministic generated values in the pinned salted-SHA-1
  shape (the corpus anonymizer scrambles them; the auth pins assert the
  shape). Side-closure-only rows have `content` nulled — the permission and
  shape math reads none of it, and the byte-parity replays name any entry
  that ever needed it.
- `build-self-contained-test-fixtures.mjs` — the builder that produced the
  three artifacts from the machine-local corpus. Dev-time only: never runs
  at test time. Rebuild with
  `node fixtures/test-corpus/build-self-contained-test-fixtures.mjs --corpus <bench-corpus-v2.sqlite3> --shard-dir <fixtures/corpus>`.

## Privacy posture

The source corpus is the sanitize_corpus.py output (random-string names,
scrambled content) — the same shape already shipped tracked under
`fixtures/corpus-v2/recapture/`. The builder additionally scans every shipped
byte for the standing scrub triggers (email addresses, 8-digit-dates with
BD/BW initials) and refuses to write on a hit. Community and structural card
names (`*all+*default`, `*home`, …) are intentionally NOT scrubbed per the
operator's explicit ruling. The raw (unsanitized) ground-truth corpus and its
page captures are a different dataset — nothing in this directory derives
from `tmp/raw-ground-truth/`.

## Path resolution at test time

Shared helper `src/testing/test-corpus-paths.ts`:

- default: these committed miniatures (every machine, every clone);
- `DECKO_TS_CORPUS_V2=<path>`: explicit opt-in — the richer machine-local
  corpus + the private shard pair (richer local runs; never assumed).
