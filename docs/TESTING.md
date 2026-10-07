# Testing

What the test suite guards, what it needs, and how to run it.

The short version: **this suite tests behaviour, not snapshots.** There are no
`toMatchSnapshot` or `toMatchInlineSnapshot` assertions anywhere in it. Every
assertion either compares rendered bytes against real Ruby Decko output, or
checks that the engine applied a rule it is supposed to apply.

---

## Running the tests

```bash
npm install
npm run typecheck
npm test
```

`npm test` runs `vitest run tests/card/` — the engine suite.

> **Native dependency note.** `better-sqlite3` is used by the test harness. It
> ships prebuilt binaries for common platforms. If yours has none, `npm
> install` tries to compile and needs a C++ toolchain. `npm install
> --ignore-scripts` plus a copied prebuild also works.

---

## The two corpus tiers

The parity claim is verified by replaying captured Ruby output. There are two
tiers of corpus, and the difference matters when you read a test result.

### 1. The miniature corpus (committed, always available)

`fixtures/test-corpus/` holds a self-contained sqlite database and captured
shards, small enough to commit. **Every clone can run the full committed
test scope from these bytes alone.** This is what `npm test` uses by default.

### 2. The rich corpus (NOT committed)

The rich corpus is captured from the deck this engine was ported from. It
carries that deck's real content — real card names, real people, real
addresses — which is personal data belonging to someone who did not
authorise its redistribution here.

**It is therefore not part of this fork.** If you have a copy, it belongs
outside the repository.

---

## How skipped suites behave

Suites needing the rich corpus skip themselves. The important part is that
they **never skip silently**.

The idiom is:

```ts
import { describeWithCorpus } from "../../support/describe-with-corpus.js";

const describeIfCorpus = describeWithCorpus(
  REPLAY_REQUESTED,
  "the suite name",
  "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)",
);
```

When the data is absent, `describeWithCorpus` **prints a warning naming the
suite, the reason, and how to enable it**, then returns `describe.skip`.

This exists because the previous idiom did the opposite. It read:

```ts
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;
```

A suite could vanish from the run, a green result would be reported, and
nothing would say the suite had never executed. A test run that hides what it
did not run is a false claim about what the code is guarded against. The
replacement makes every skip visible.

**When you see `[corpus-gated] NOT RUN` in the output, that suite did not
execute.** It is not a pass.

Three more helpers in the same file cover the other shapes of gate:
`describeOrSkipLoud(skip, file, gate)` and `itOrSkipLoud(skip, file, gate)`
replace `describe.skipIf` / `describe.runIf` and their `it` forms, and
`skipLoud(ctx, file, gate)` replaces a bare `ctx.skip()` inside a test.

Vitest's default reporter hides console output from skipped tests, so the
config adds a second reporter (`tests/support/skip-summary-reporter.ts`)
that ends every run with a "Not run" list: one line per suite or test that
skipped, naming the file and the gate it needed.

---

## Supplying the rich corpus

To run the full parity replay you need, outside the repository:

| What | Where the code looks for it |
|---|---|
| The corpus sqlite | `$DECKO_TS_CORPUS_V2`, or `fixtures/corpus/` by default |
| Captured shards | beside it, `shard-000000.jsonl`, `shard-000014.jsonl` |
| The email oracle bytes | `fixtures/captured/email-templates-raw-oracle.json` |

Point the engine at them with environment variables:

```bash
export DECKO_TS_CORPUS_V2=/absolute/path/to/bench-corpus-v2.sqlite3
export DECKO_TS_CORPUS_REPLAY=1
npm test
```

If you request the rich corpus and the files are missing, the run **fails
loudly at import** with the exact paths it wanted. That is deliberate: a
requested-but-absent corpus is a setup error, and it should stop you rather
than quietly degrade.

---

## The full grade

The parity figures in the README come from grading the engine against a full
capture of one production deck: every page and every recorded view, rendered
by the engine and compared byte for byte with Ruby's output. The harness is
in `tools/oracle/` (see [oracle-harness.md](oracle-harness.md)); the corpus
is not redistributed, so the grade can only be re-run where that corpus is
available.

`npm run replay` runs the replay suites against whatever corpus is supplied.
Whenever you quote a parity figure, give the date it was measured, the corpus
it was measured on, and the command that reproduces it.

---

## Known failures

Some suites fail for reasons unrelated to the code under test — typically
ordering assumptions between suites that share global view state. These are
recorded rather than hidden. See `KNOWN_FAILURES.md` for the current list.

---

## Writing new tests

- Assert on rendered bytes or on rule outcomes, not on snapshots.
- If a test needs data that is not in the repository, use
  `describeWithCorpus` rather than a bare `describe.skip`, so the skip is
  visible in the output.
- If a test is expected to fail, say so explicitly (`it.fails`) and document
  why, rather than leaving a red test that gets ignored.
