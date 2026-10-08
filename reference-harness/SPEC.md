# Decko reference harness

A language-neutral way to prove that a Decko engine behaves like Ruby Decko.
Any engine, in any language, implements one small adapter; the harness drives
it with the same operations it drove stock Ruby Decko with, and grades the
answers on four kinds of parity:

| kind | what is compared |
|---|---|
| rendering | the HTML of a full page (`GET /<card>`) and of a card view, per actor |
| semantics | answers that are data, not HTML: card identity, set membership, rule lookup, permission verdicts, search results, name algebra |
| persistence | the rows a write leaves in Decko's card tables |
| side effects | what a write or sign-in causes beyond the rows: saved or refused, the errors shown, the mail sent, the identity signed in |

Ruby Decko is the oracle. Its answers are recorded once per fixture under
`fixtures/<name>/expected/` and committed, so grading an engine needs Node
and the engine, not Ruby.

## Layout

```
reference-harness/
  SPEC.md                    this document
  corpus/                    fixture generators (deck.json, operation lists)
  fixtures/<name>/
    deck.json                the deck, as plain data
    files/                   files the deck uploads
    deck/deck.sqlite3        the built deck (Decko's schema), and deck/files/
    ops/                     render.jsonl, semantics.jsonl, scenarios.json
    expected/                the oracle's answers, one JSON line per operation
  oracle/                    the Ruby oracle: stock Decko app, deck builder, adapter, Dockerfile
  adapters/<engine>/adapter.json   how to start an engine's adapter
  runner/                    run.mjs (drive an adapter), grade.mjs (compare), normalisation
```

## 1. Fixtures

A fixture is plain data. Nothing in it is specific to one engine.

### deck.json

```json
{
  "format": "decko-reference-deck/1",
  "name": "synthetic-v1",
  "base": { "seed": "decko setup", "decko": "0.20.0", "card": "1.110.0" },
  "clock": "2026-09-19T12:00:00Z",
  "environment": { "origin": "http://deck.example", "default_html_view": "titled" },
  "actors": {
    "anonymous": { "card": "Anonymous" },
    "member": { "card": "Mira Member", "email": "...", "password": "..." },
    "admin": { "card": "Ada Admin", "email": "...", "password": "..." }
  },
  "cards": [
    { "name": "Topic", "type": "Cardtype" },
    { "name": "Topic+*type+*structure", "type": "RichText", "content": "{{+summary}}" },
    { "name": "Mira Member", "type": "User", "fields": { "+*account": { "fields": { "+*email": "..." } } } },
    { "name": "Report 1", "type": "File", "file": "files/report-1.txt" }
  ]
}
```

- `base` is the stock seed the cards are applied to (`decko setup` at the
  named versions).
- `cards` are applied in order, as Decko Bot, through the engine's own create
  path. An entry whose card the seed already holds updates it. `type` is a
  type name and may be omitted (the deck's rules then decide). `fields` are
  subcards (`"+name": "content"` or `"+name": {"fields": {...}}`). `file`
  uploads a file from the fixture directory.
- `clock` is the instant every reference output was produced at. Engines
  run with their clock pinned to it.
- `environment` holds the deck's process configuration: `origin` is
  `Cardio.config.deck_origin`, `default_html_view` is
  `Cardio.config.default_html_view`. No other configuration is allowed.
- `actors` name the cards operations act as. `anonymous` is the signed-out
  visitor. Passwords are fixture values for a throwaway deck.

### The built deck

`oracle/build-deck.sh <fixture>` seeds a stock deck, restamps the seed's
timestamps to `clock`, applies `deck.json` under the frozen clock, compiles
the script and style asset outputs, and writes `deck/deck.sqlite3` and
`deck/files/`. The built deck is committed: it is the exact starting state
every engine and every expected output refers to. An engine reads Decko's
SQLite schema directly; that schema is the persistence contract.

### Operations

Every operation has an `id`, unique within its file, and an `op`:

| op | fields | result |
|---|---|---|
| `render` | `actor`, `card`, optional `view` | `{ "html": "..." }`. Without `view`: the page `GET /<card>` serves (layout included); a card that does not exist renders as Decko renders an unknown card. With `view`: that view of the card, as a fragment. |
| `ask` | `actor`, `q`, and the question's fields | see below |
| `write` | `actor`, `action` (`create`, `update`, `delete`), `card`, `fields` | `{ "saved": bool, "errors": [{"field","message"}], "card": {"name","id"} or null, "mail": [{"to": [..sorted], "subject", "text"}] }` |
| `signin` | `email`, `password` | `{ "signed_in": bool, "actor": "<card name of the current user afterwards>" }` |

`write` fields: `type` (type name), `content`, `name` (a rename, on update),
`fields` (subcards, `{"+name": "content"}`).

`ask` questions:

| `q` | fields | answer |
|---|---|---|
| `card` | `card` | `{exists:false}` or `{exists, id, name, key, type, codename, left, right, read_rule}` (`read_rule`: the name of the card's stored read rule) |
| `permissions` | `card` | `{read, create, update, delete}`: the actor's verdict for each task on the card (a new card if it does not exist) |
| `set_names` | `card` | `{sets: [...]}`: the card's sets, most specific first |
| `rule` | `card`, `setting` | `{rule: "<rule card name>" or null}`: the rule that governs `setting` for the card |
| `search` | `query` (CQL) | `{names: [...]}`, or `{count: n}` when `query.return` is `"count"`; filtered by what the actor may read |
| `name` | `name` | `{s, key, url_key, parts, simple, left, right, trunk, tag}` |

Files: `ops/render.jsonl` and `ops/semantics.jsonl` (one operation per
line, all run in one session on one deck copy), and `ops/scenarios.json`
(`{"scenarios": [{"id", "steps": [operation, ...]}]}`: each scenario runs in a
fresh session on a fresh deck copy, steps in order; steps carry no `id`).

## 2. Adapter protocol

An adapter is a process the runner starts once per session. It is described
by `adapters/<engine>/adapter.json`:

```json
{ "name": "decko-ts", "command": ["node", "adapter.mjs"] }
```

`command` runs in the manifest's directory. The runner sets:

| variable | meaning |
|---|---|
| `HARNESS_DECK` | the session's private copy of `deck.sqlite3`; the adapter may write it |
| `HARNESS_FILES` | the session's copy of the deck's files directory |
| `HARNESS_DECK_JSON` | the fixture's `deck.json` (clock, environment, actors) |
| `HARNESS_WORK` | an empty directory the adapter may use for caches |

Paths use forward slashes.

Transport: one JSON object per line. stdout carries protocol lines only
(lines that do not start with `{` are ignored and logged); diagnostics go to
stderr.

1. On start, after loading the deck, the adapter writes
   `{"ready": true, "protocol": 1, "engine": "<name>", "version": {...}}`.
2. The runner writes requests `{"id": n, "op": ..., ...}`, one at a time, and
   waits for the answer.
3. The adapter answers `{"id": n, "ok": true, "result": {...}}`, or
   `{"id": n, "ok": false, "error": {"class", "message"}}` when it could not
   answer at all. A refused write is not an error: it is a result with
   `saved: false`.
4. `{"op": "quit"}` ends the session; the adapter flushes its writes and
   exits.

Each request is a request boundary: per-request state is reset and the
actor is signed in before the operation runs, exactly as a new HTTP request
would. A write must be committed to `HARNESS_DECK` before its answer is sent,
because the runner reads the deck file between steps.

Every answer must come from the engine's own entry points. An adapter routes
requests and shapes results; it must not compute an answer itself.

## 3. Runner and grading

```
node runner/run.mjs --adapter adapters/<engine>/adapter.json \
     --fixture fixtures/<name> --out <resultsDir> [--kinds render,semantics,scenarios] [--filter <regex>] [--limit <n>]
node runner/grade.mjs --fixture fixtures/<name> --actual <resultsDir> \
     [--expected <expectedDir>] [--report report.json] [--allow-partial]
```

### What a run records

`run.mjs` copies the built deck per session, runs the operations, and writes
`render.jsonl`, `semantics.jsonl` and `scenarios.jsonl` plus `run-meta.json`
(results format 2).

`run-meta.json` holds one record per kind under `runs`, written when the kind
starts (`complete: false`) and again when it ends, so an interrupted run never
claims completion. Each record names: `started`, `finished`, `complete`,
`selection` (the `--filter`/`--limit` used, or null), `ops_total` (the
fixture's count) and `ops_run`, the adapter's name, its ready line
(`engine`), its source checkout (`adapter_checkout`: commit and whether it had
uncommitted changes), and the fixture digest the run used with any
disagreement between the fixture and its manifest (`fixture_problems`). A read
kind also records `session_writes`: every row of every table the session
changed, raw. A run that ends because the adapter exited is incomplete.

For every scenario step the runner snapshots the deck before and after and
records the raw row delta: `rows` for Decko's card tables (`cards`,
`card_acts`, `card_actions`, `card_changes`, `card_references`,
`card_virtuals`), and `other_tables` for any other table the step changed.
Raw means ids, timestamps and every other column exactly as stored.

### What the grader refuses

`grade.mjs` first checks that the results are a grade at all. Any of these
makes the verdict **not a grade** (exit 2), and no pass rate is printed:

1. `run-meta.json` missing, unreadable, in another results format, or naming
   another fixture; a kind's record missing a field listed above.
2. A kind not run, not complete, run with a selection, or with a different
   operation count from the fixture's.
3. An operation with no result line, a result line twice, a result id the
   fixture does not have, or a scenario with fewer steps than the fixture's.
4. The fixture tree not matching its `MANIFEST.json`; results recorded on
   another fixture digest, or on a fixture that did not match its manifest.
5. The expected outputs without a `MANIFEST.json`, captured on another
   fixture digest, holding a file that differs from or is missing from their
   manifest, or naming an oracle variant inconsistent with their directory
   (section 5).
6. Kinds answered by different adapters, engine versions or commits.

`--allow-partial` grades a filtered or partial run on what it holds, for
development; its verdict is `partial` and it still exits 2. A run from a
checkout with uncommitted changes, or from outside git, is graded with a
warning that it is not a release grade.

### What the grader compares

Each item is compared with the expected outputs after normalisation
(section 4) and passes only if equal. Results are tallied per kind and per
group (page or view and actor; question type; write action). Scenario steps
are graded on every kind they exercise: a write's answer is a side-effect
item, its `rows` a persistence item, a render or question after a write a
rendering or semantics item. An item whose oracle answer was an adapter error
is reported as an oracle error and not graded.

**Reads write only what the oracle's reads wrote.** Each read session's
`session_writes`, and each non-write scenario step's `rows` and
`other_tables` (renders, questions, sign-ins), must equal the oracle's for the
same session or step, which on `synthetic-v1` is nothing. These are reported
as their own line, `read writes`, and any failure fails the grade even when
every answer matches. Changes a write step makes outside the card tables are
listed in the report (`other_table_writes`) and not graded.

Exit status: 0 every item passes; 1 a valid grade with failures; 2 not a
grade.

Any results file may be stored gzipped (`render.jsonl.gz`); the fixture's
large reference renders are. `node runner/causes.mjs report.json [kind]`
groups a report's failures by the shape of their first difference, so one
root cause reads as one line. Persistence and read-write failures also list
every differing value (`differences`).

The runner and grader need Node 22.5 or later and nothing else
(`node:sqlite`). Their tests, including a negative control for every refusal
above, run with `node --test "reference-harness/runner/test/*.test.mjs"`.

## 4. Normalisation

Two kinds of rule, applied to both sides before comparison, and nothing else:

- A **mask** erases a value. It is allowed only for a field shown to vary
  between two complete runs of the same oracle on the same fixture, and only
  in that field's exact shape.
- A **canonical form** compares the same value in another encoding and
  erases nothing.

1. **N1 (mask).** In rendered HTML, a `data-slot-id` attribute in attribute
   position holding exactly 20 lowercase hex digits has its value replaced by
   `SLOT`; the quote character is kept. Ruby Decko draws slot ids at random
   per render.
2. **N2 (canonical form).** JSON object key order never counts; array order
   always does.

Everything else is compared exactly: every byte of HTML, every field of a
write answer (the new card's id and every byte of mail text included), every
column of every row (ids and timestamps as stored).

**Evidence.** `node runner/compare-runs.mjs <runA> <runB>` compares two runs
item by item, raw, and reports every difference no mask explains and, per
mask, how many of the values it matched actually differed. For `synthetic-v1`
two complete stock-oracle runs differ in 1,351 of 4,156 items, all in slot
ids: 9,061 of 9,061 slot ids differ, and nothing else does. The result is in
the expected outputs' manifest (`provenance.nondeterminism`), and a test
checks that it covers exactly the masks `normalize.mjs` applies. A new mask
needs the same evidence on the fixture that needs it.

Rules the first version applied and no longer does, because no oracle run
varies in them: hexadecimal object addresses (never present in any recorded
output), dropping a write answer's card id and trimming mail whitespace (no
verdict depended on them), and rewriting new rows' ids symbolically and
comparing timestamps as instants (the oracle's ids and timestamp text are
identical between runs; an engine that stores another text form, or assigns
other ids, differs from Ruby).

## 5. The Ruby oracle

`oracle/` is a stock Decko application (`decko` 0.20.0, `card` 1.110.0, the
versions in `app/Gemfile.lock`, no local patches) plus three scripts:

- `build-deck.sh` / `build-deck.rb`: builds a fixture's deck (section 1).
- `run-adapter.sh` / `adapter.rb`: the reference adapter, under `decko runner`.
- `lib/harness_env.rb`: the frozen clock (`travel_to` the fixture clock), the
  fixture environment, local file storage, recaptcha off, no network, and the
  request boundary (`Card::Env.reset`, cache renewal, mail store cleared,
  `Card::Auth.signin`).

Renders run with `Rails.env` reporting production, as a served page does
(inline render errors without debug detail); asset outputs are never
recompiled during a session.

### The oracle contract

`oracle/contract.json` lists every way the oracle's process differs from a
stock deck served through Decko's controller, each with where it is set and a
class: `determinism` (pins a value that would vary between runs),
`configuration` (a value a deck operator sets), `request` (makes the runner
behave as one served request), `capture` (records mail instead of sending
it), `platform` (a host workaround that reaches no recorded byte), `fixture`
(a fixture data choice applied through Decko's own write path), and `patch`
(changes what Decko does). The stock oracle has no `patch` entry.

### Stock and patched expectations

`fixtures/<name>/expected/` holds the stock oracle's outputs, always. An
oracle that changes what Decko does (a gem patch, a changed mod
configuration, a monkey patch) is a **patched variant**: its outputs go in
`fixtures/<name>/expected-patched/<variant>/`, with every patch listed, and
are graded only by naming that directory (`--expected`). The grader labels
such a grade `PATCHED ORACLE "<variant>"` and records the variant in the
report; a stock grade is always available beside it.

Each expected directory has a `MANIFEST.json`
(`node runner/manifest.mjs expected <fixtureDir> <expectedDir> [--variant <name> --patches <file>]`):
the fixture digest it was captured on; the oracle's variant, patches and
contract (with its sha256); the engine's ready line and the per-kind run
records; the sha256 of every stored file and of its uncompressed content; and
its provenance (when and how it was captured, the hashes of any files it
supersedes, and the nondeterminism evidence of section 4). The grader
refuses expected outputs whose files do not match it.

Run natively (Ruby 3.3 with `bundle install` in `oracle/app`) through
`adapters/ruby/adapter.json`, or in Docker:

```
docker build -t decko-reference-oracle:0.20.0 reference-harness/oracle
docker run --rm -v "$PWD/reference-harness/fixtures/synthetic-v1:/fixture" \
  decko-reference-oracle:0.20.0 bash /oracle/build-deck.sh /fixture
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ruby-docker/adapter.json \
  --fixture reference-harness/fixtures/synthetic-v1 --out reference-harness/fixtures/synthetic-v1/expected
node reference-harness/runner/manifest.mjs expected reference-harness/fixtures/synthetic-v1 \
  reference-harness/fixtures/synthetic-v1/expected
```

## 6. Versioning

- **Protocol** (`"protocol": 1` in the ready line): bumped when a request or
  answer shape changes incompatibly. A runner refuses an adapter on another
  protocol.
- **Deck format** (`"format": "decko-reference-deck/1"`): bumped when
  deck.json's meaning changes.
- **Results format** (`"results_format": 2` in `run-meta.json`): bumped when
  what the runner records changes. The grader reads one format.
- **Fixture**: a fixture is immutable once its expected outputs are
  published. Its `MANIFEST.json`
  (`node runner/manifest.mjs fixture <fixtureDir>`, checked with `check`)
  lists the sha256 of every input file (deck.json, the built deck and its
  files, the upload sources, the operation lists) and one digest over them;
  results and expected outputs record that digest. A changed generator or
  operation list makes a new fixture name (`synthetic-v2`), so a pass rate
  always names exactly what it was measured on.
- **Oracle**: expected outputs record the oracle's versions, variant and
  contract in their manifest. Capturing against another Decko release makes a
  new fixture name.

## 7. Writing an adapter for another engine

1. Read `HARNESS_DECK_JSON`; pin the engine's clock to `clock` and apply
   `environment`.
2. Open `HARNESS_DECK` (Decko's SQLite schema) and serve files from
   `HARNESS_FILES`.
3. Print the ready line, then answer requests until `quit`.
4. Run `run.mjs` with your manifest, then `grade.mjs`.

Python and Go need only a JSON library, a line reader, and the engine.
