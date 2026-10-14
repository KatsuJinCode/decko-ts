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

This harness is one instrument among several. What it measures, what the
other instruments cover, and what nothing in the public package measures
(browser journeys, the default PBKDF2 password path in the graded fixture,
hosted database writes) is inventoried in
[../docs/coverage-inventory.md](../docs/coverage-inventory.md).

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
    withheld/                operations and answers kept out of the package (section 6), when present
  oracle/                    the Ruby oracle: stock Decko app, deck builder, adapter, Dockerfile
  adapters/<engine>/adapter.json   how to start an engine's adapter
  runner/                    run.mjs (drive an adapter), grade.mjs (compare), normalisation
  browser/                   browser scenarios: journeys, engine servers, runner, comparison (section 8)
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
disagreement between the fixture and its manifest (`fixture_problems`). The
ready line is where the environment a capture ran in is recorded: the Ruby
oracle names `ruby`, `ruby_platform` and `ruby_engine` there, so a set of
recorded bytes always carries the interpreter and platform that produced it
(section 4, N3). A read
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
rendering or semantics item.

An item whose oracle answer is itself a failure is graded on what kind of
thing the oracle recorded. A capture-side fault (the `CAPTURE_ERROR` sentinel
the capture scripts record when their own machinery threw) says nothing about
the site: it is reported as an oracle capture fault and not graded. A recorded
upstream failure - the oracle raised while serving, and its capture holds the
error record - is the upstream behavior the port must reproduce: the engine's
answer must be the same failure under N8 (the class's host naming
canonicalized) with the message byte-exact, and a match is counted as a
**reproduced upstream failure**, its own success category: where the original
is broken and the copy breaks the same way, that is the port succeeding. Any
other answer on such an item - a different
failure, or a render where the oracle failed - fails it.

**Reads write only what the oracle's reads wrote.** Each read session's
`session_writes`, and each non-write scenario step's `rows` and
`other_tables` (renders, questions, sign-ins), must equal the oracle's for the
same session or step, which on `synthetic-v1` is nothing. These are reported
as their own line, `read writes`, and any failure fails the grade even when
every answer matches.

**A write changes only the tables the oracle's write changed.** Each write
step's `other_tables` (every table outside Decko's card tables the step
changed) must equal the oracle's for the same step; they are recorded truths
like the `rows`. A difference fails the grade unless it is declared:
`--declared-other-tables` names a JSON map keyed on step id then table name,
`{"create-then-render#1": {"sessions": "why"}}`, of differences an engine is
known to make (its own bookkeeping tables, say). A declared difference is
graded as declared, recorded in the report (`other_tables`, with its why),
and does not fail; an undeclared one fails the grade even when every answer
matches. Every write step whose non-card tables changed is listed in the
report (`other_table_writes`), with its verdict: pass, declared, or fail.

The comparison covers every table that exists in the oracle's schema, read
from the fixture's built deck (`deck/deck.sqlite3`). A table only the
engine's schema has holds no row the oracle reads or writes; its changes are
not compared, matched or declared, and are listed in the report's
`engine_only_tables` field (`tables`, and `writes` with each step's id, table
and row delta).

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

Two instruments normalise, and each has its own namespace so that one
instrument's rule names never read as another's:

- **`N1`-`N8`** — the **corpus instrument**: `runner/normalize.mjs`, which
  grades this harness's op results and is the instrument every figure in a
  grade report names. These are the rules the committed expected outputs are
  compared under, and `normalize.mjs:1-18` is their prose form.
- **`B1`-`B5`** — the **browser-journeys instrument**: `browser/lib/observe.mjs`,
  which normalises what a user sees when a journey runs against a live page,
  plus the two forms `browser/compare-journeys.mjs` applies at compare time.
  It is a different instrument on a different recording shape (a page
  observation rather than an op result), so its rules carry the `B` prefix.

A `B` rule and an `N` rule that look alike are not the same rule. Where the
journeys comparator borrows one of the harness's forms it names the borrowed
rule at the call site rather than renumbering it.

### 4.1 The browser-journeys instrument's rules (`B1`-`B5`, plus two at compare time)

`observe.mjs` normalises each observation as it is captured, so both engines'
observations are in the same canonical form before anything is compared:

1. **B1.** Text is the page's rendered text (`innerText`), whitespace collapsed.
2. **B2.** Relative times ("3 minutes ago") and calendar dates become `<time>`:
   one engine may run on a pinned clock and the other on the wall clock.
3. **B3.** Structure is the element tree of the main area as tag plus sorted
   classes; ids, data attributes and inline styles are left out, and the
   classes Decko draws at random per render are masked to `RAND`.
4. **B4.** Fields are the visible form controls of the page by name and type.
5. **B5.** The URL is compared as path and query, decoded, without the host;
   the server's own address inside text becomes `<origin>`.

`compare-journeys.mjs` then applies exactly two more forms, both borrowed
rather than renumbered:

- **`stable`** from `runner/normalize.mjs` — the harness's **N2**: JSON object
  key order never counts and array order always does, and the per-journey
  server port in an absolute URL the deck itself builds is compared as
  `127.0.0.1:PORT`.
- **`canonicalizeDebugPage`** — the harness's **N6** at journey grade: a
  debug-exceptions page's backtrace frames collapse to one marker line, and
  the frame count is recorded rather than compared.

### 4.2 The corpus instrument's rules (`N1`-`N8`)

These are the rules a grade report names in its `normalization` field, and
they are the ones the committed expected outputs were captured under. A grade
over `synthetic-v1` applies **N1, N2 and N3** and reports exactly those three;
N4 through N8 exist because `synthetic-v2` carries values this fixture does not
(collapse ids, relative times, capture-host content in debug pages, and error
class names), and they are applied when a comparison reaches them. Nothing outside that list is normalised.

Two kinds of rule:

- A **mask** erases a value. It is allowed only for a field shown to vary
  between two complete runs of the same oracle on the same fixture, and only
  in that field's exact shape.
- A **canonical form** compares the same value in another encoding and
  erases nothing.

1. **N1 (mask).** In rendered HTML, a `data-slot-id` attribute in attribute
   position — between `<` and `>` of one tag, a whitespace-preceded name
   followed by `=` and a quoted value — holding exactly 20 lowercase hex
   digits has its value replaced by `SLOT`; the quote character is kept. The
   same text anywhere else (element content, comments, attribute values,
   script and style bodies) is compared exactly: the mask touches only real
   attribute tokens. Ruby Decko draws slot ids at random per render.
2. **N2 (canonical form).** JSON object key order never counts; array order
   always does.
3. **N3 (canonical form).** Inside a real `class` attribute — in attribute
   position, as for N1, so element text, comments, another attribute's value
   and raw text bodies are untouched — the class tokens are compared as a set:
   both sides are read as their whitespace-separated tokens and sorted. The
   token set, the token count and the tokens themselves all still count; a
   different set is a different attribute, and only the order is canonicalised.
   The whitespace between tokens is the attribute's separator rather than
   content, so runs of it collapse to one space, and the quote character is
   kept exactly as N1 keeps it.

   The rule exists because Ruby's own environment decides the order: stock
   Linux Ruby and stock Windows Ruby emit the same tokens in a different
   order (section 5, "The oracle's environment is part of the contract"). The
   committed expected outputs were captured on Windows, where the order is
   already the sorted order the engine emits, so N3 changes nothing about
   them; it is what lets a Linux capture be graded against the same fixture.

   `grade.mjs --no-class-token-order` grades with N3 off, which is how the raw
   class-token order counts on its own. Every report names the rules it ran
   under in `normalization`.

4. **N4 (canonical form over a volatile value).** In rendered HTML, the
   numeric context of a `card-<safe-key>-<n>-collapse-id` token — the
   accordion collapse id `admin.rb:96` seeds with Ruby's `title.hash` — is
   replaced per html string by `N4#k` in first-appearance order, so the
   accordion button's `data-bs-target` and its panel `id` must still agree.
   Ruby hashes strings with a per-process seed; the digits are process noise.
   The literal contexts (`files`, `depends_on`, view names) hold no digits
   and never match.
5. **N5 (canonical form over a capture-clock value).** In rendered HTML, a
   relative-time span — a Rails `time_ago_in_words` phrase
   (`date_helper.rb:95-165`, within its table's bounds: minutes 1-44, hours
   1-24, days 1-30, months 1-12, years 1+, singular and plural, with the
   `about`/`over`/`almost` qualifiers) — is replaced by the single
   placeholder `N5#elapsed`. The oracle's words are a pure function of the
   fixture clock the harness freezes (`oracle/lib/harness_env.rb`
   `freeze_clock!`, `travel_to` the fixture clock for the whole process), so
   a card built moments before the capture reads "less than a minute"
   forever; an engine's live clock reads "20 days" for the same stored
   timestamp, and no two engine runs agree either. The span's presence,
   position and every surrounding byte still count: anchors are compared
   exactly, so a real content change beside a span, a tail present on one
   side only, or a different sentence shape still fails. Absolute dates
   (`2026-09-19`) are NOT spans and stay exact — a date view is an encoding
   the engine must get right, not clock noise.
6. **N6 (canonical form over the host VM's stack identity).** In rendered
   HTML, inside a render-error span's debug-page title, every backtrace
   frame line within the div that follows the message paragraph — the
   `<br>
`-separated lines Ruby's `exception.backtrace * "<br>
"` embeds —
   becomes the single placeholder `N6#frame`. The two sides run different
   languages: the oracle's frames are Ruby's (`path:line:in \`method'`,
   boot-inclusive — dozens of frames from the capture process's startup
   up), the engine's are V8's (`at fn (file:///path:line:col)`). A frame
   line's text is the host VM's identity — language, paths, boot history —
   in the same class as N7's capture-host content below; nothing in the
   oracle's semantics lives in it. The frame COUNT becomes the checkable
   invariant: the `<br>`-separated structure inside the div stays compared,
   so a side emitting a different number of its own frames still fails, as
   do the heading, the error message and every byte outside the div.
7. **N7 (canonical form over capture-host content).** In rendered HTML,
   inside a render-error span's `title` attribute that begins with the Ruby
   debug page marker (`&lt;h3&gt;Error message (visible to admin only)
   &lt;/h3&gt;`), absolute paths (drive-letter, forward or back slashes) and
   hexadecimal heap addresses become `N7#path` / `N7#addr`. The debug pages
   embed the capture host's backtrace frames — the Ruby install, gem home
   and harness checkout of the machine that recorded the capture — which
   are that machine's filesystem, not the oracle's semantics; a frame path
   token ends at its `:line:` separator. Every byte outside such a title,
   and the error message inside it, still count. (Written when the engine
   did not raise where the oracle raises; the raise posture has since made
   the engine emit the same debug page, and N6 above now carries the frame
   layer.)
8. **N8 (canonical form over the host language's class naming).** On an
   operation whose recorded result IS the failure (section 3, "What the
   grader compares"), the error record's class name canonicalizes to its
   name proper: the terminal `::` segment of the Ruby path
   (`Card::Error::CodenameNotFound` -> `CodenameNotFound`), with one
   trailing `Error` suffix — the JS subclass convention
   (`CodenameNotFoundError` -> `CodenameNotFound`) — dropped from either
   side. A class name is the host language's identity in the same class as
   N7's and N6's content: no port can emit the other language's naming.
   Everything else in the record counts: the message compares byte-exact,
   and a different name proper is a different failure, which fails the
   item.

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

The evidence for N4 through N8 on `synthetic-v2` is in
[NORMALIZATION-EVIDENCE.md](NORMALIZATION-EVIDENCE.md): for each rule, the
values it canonicalizes, the measured facts behind it, and the commands that
reproduce them from the shipped files. N4 (collapse ids) is evidenced by two
complete stock-oracle runs over the operations that carry the token. N5
through N8 are canonical forms over values that do not vary between two runs
of one oracle, so their evidence is oracle-versus-engine pairs on the fixture.
Two findings there bear on this section. The composed adapter freezes the
capture clock, so on the shipped capture N5 changes no grade outcome. The
debug-page operations that N6 and N7 act on are outside the public package,
so their figures are recorded there and cannot be re-measured from shipped
files.

N3 is not a mask and needs no nondeterminism evidence — it erases nothing,
and it canonicalises rather than hides. Its evidence is the environment
comparison of section 5 instead: the class-token order is what changes
between two Rubies of the same version on different operating systems, and
nothing else does.

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

### The oracle's environment is part of the contract

Ruby Decko is the oracle, and **the operating system it runs on is part of
what the oracle is**. The same Decko at the same version renders the same
answers on stock Windows and on stock Linux **except** for the order of the
tokens inside a `class` attribute. Measured on `synthetic-v1`: of the
fixture's 1,752 render operations, **678** differ that way and **nothing else
differs** — every semantics operation and every scenario is byte-identical
after N1. (`tools/ruby-version-variance/evidence/class-order-linux-vs-committed.json`.)

This is why a capture records its environment. `oracle/adapter.rb` puts
`ruby`, `ruby_platform` and `ruby_engine` in its ready line, which
`run.mjs` copies into `run-meta.json` under `runs.<kind>.engine`, so every set
of recorded answers names the interpreter and platform behind it.

The committed `synthetic-v1` expected outputs were captured on **Windows**
(`ruby 3.3.12 [x64-mingw-ucrt]`), which is why the TS engine matched them byte
for byte and why N3 changes nothing about them. A capture on Linux Ruby is the
same fixture with the class-token order in the other order; N3 is what lets
the two be compared.

Note what a Linux capture does **not** give you for free: the deck it builds
is a different fixture. Decko's compiled asset files concatenate their parts
in a different order on Linux, so `deck/deck.sqlite3` and `deck/files/*` hash
differently and the fixture digest changes. Under this section's versioning
rule that is a new fixture name (`synthetic-v2`) with its own capture, not a
recapture of `synthetic-v1` — so the Linux answers were compared answer by
answer with the classifier rather than graded. What the engine must reproduce
is the answers modulo the three named normalisations, not one operating
system's choice of token order.

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
  **Declared re-pin.** One exception exists to "immutable", and it is for a
  deck that must change for privacy or packaging reasons, not for a deck
  whose answers changed. A fixture's built deck may be modified after its
  expected outputs are published when, and only when, all five of the
  following hold:

  1. **The change is out of the graded surface.** It removes content nothing
     grades — a table the operation list never reads or writes, a row the
     scenario steps never touch. It never alters a card, a render input, or an
     operation list.
  2. **A committed script performs it**, and is the record of what was done.
     Re-running the script on a deck it has already processed is a no-op, so
     the change is auditable rather than asserted.
  3. **The manifest is re-pinned to the new fixture digest** in the same change,
     by `manifest.mjs fixture` as above, so the tree and its digest never
     disagree.
  4. **The expected directory's manifest carries a `provenance.repin` entry**
     naming the date, what changed, why, and the **previous fixture digest**,
     so a reader can tell a re-pinned fixture from a recaptured one. Re-pinning
     is not re-capture: the `captured` field still describes when the oracle's
     answers were captured, and the two dates are not the same event.
  5. **The grade is re-run against the re-pinned fixture**, and the passing
     result is what the public figure quotes. The grader's refusal 5 (this
     section) means a run recorded against the old digest is not a grade at
     all, so a re-pin without a re-run leaves the fixture ungraded rather than
     quietly graded.

  A re-pin that changes a graded input is not a re-pin; it is a new fixture
  (`synthetic-v2`) with its own capture. The one re-pin this repository has
  made is `synthetic-v1` on 2026-10-10
  (`reference-harness/corpus/drop-private-app-tables-from-fixture-decks.mjs`,
  described under `provenance.repin` in that fixture's `expected/MANIFEST.json`);
  it dropped eight empty `private_table_*` tables of another application that rode
  along in the deck file, and the grade re-run against the re-pinned fixture is
  the 1,754 / 1,754 renders and 2,388 semantics operations the
  [coverage inventory](../docs/coverage-inventory.md) quotes.

  **Declared withholding.** A recorded answer that cannot ship publicly (it
  carries the capturing machine's filesystem, say) is never rewritten. The
  whole operation and its whole recorded answer move, lines byte-identical,
  into the fixture's `withheld/` set: `withheld/ops/<kind>.jsonl`,
  `withheld/<expected dir>/<kind>.jsonl[.gz]` and `withheld/withheld.json`
  (`{label, why}`). `withheld/` is excluded from every release package. The
  fixture manifest pins the set under `withheld` (its label, operation counts
  and file hashes, which also enter the digest, so the fixture's identity is
  the same with the set or without it), and the move is re-pinned like a
  re-pin above, disclosed under `provenance.withheld` in the expected
  manifest. With the set present the runner runs its operations after the
  public ones and the grader grades them against its recorded answers;
  absent, the runner, the grader and `manifest.mjs check` print
  `[withheld: <label>] NOT RUN: <n> ops (<path>)`, and a run made
  with the set is refused by a grader without it, and the reverse. Re-pin with
  the set present (`manifest.mjs fixture` reads it from disk; without it the
  previous declaration is kept, unverified). `synthetic-v2` withholds eight
  admin error-view renders this way (`[withheld: machine-specific
  backtraces]`): card-mod-format's `set/all/html/error.rb` shows an admin
  the exception backtrace, so their recorded bytes carry machine paths.
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

## 8. Browser scenarios

The adapter protocol asks an engine questions directly. Browser scenarios ask
what a user sees: a hidden browser clicks through each engine's own pages,
served over HTTP, and the engines are compared on the result.

### Journeys

`browser/journeys/<fixture>.json` lists journeys as plain data:
`{"id", "covers": [...], "steps": [...]}`. Each journey runs on a fresh copy of
the built deck, a freshly started server and a fresh browser profile. A step
is one object with one key:

| step | meaning |
|---|---|
| `visit` | load a path |
| `signin` | sign in as an actor of `deck.json`, through the sign-in form |
| `click`, `fill`, `type`, `check`, `uncheck`, `select`, `upload` | act on a target: `{link}` or `{button}` (visible text), `{css}`, `{name}`, `{field}` (a Decko field by card name, found the way Decko's own steps find it), `{text}`; optional `within` (css). `fill` and `type` take `value`, `select` takes `option`, `upload` takes `file` (from `browser/files/`) |
| `editor` | set an editor's content by field name, as Decko's own steps do (ace, then TinyMCE, then the plain field) |
| `press` | press a key in the focused element |
| `wait` | wait for `{text}` or `{css}` |
| `window`, `close_window` | open or switch to a named second window (same cookies); close it |
| `mail_link` | follow a link from the latest mail whose subject matches |
| `observe` | record what the user sees, under a label |

After each action the runner waits until the page has loaded and jQuery has no
request in flight. A failing step ends the journey; the page at that moment is
recorded as an observation.

### Engine servers

`browser/engines/<engine>.json` names a command that serves a deck copy on
`127.0.0.1:$HARNESS_PORT` (environment as in section 2, plus `HARNESS_PORT`)
and answers `GET /__harness/ready` and `GET /__harness/mail` (the mail sent
since the last call, drained). The Ruby server is the stock oracle app behind
Decko's own controller, with the deck origin set to the server's own address
and a fixture secret for account tokens (a deployed deck's credentials). The
TS server is the port's own Node host (`vm-staging-server.mjs`) in its stock
deck profile (`DECKO_DECK_PROFILE=stock`): flat engine views with no bound mod
loader, as the edge hosts render; no production asset rewriting; Decko's
routes for new cards, the sign-in card's own form, ajax requests answered
without the layout, and the mods' public files served from
`DECKO_MOD_PUBLIC_DIR` (the oracle app's `public/`, the same files Ruby
serves). Both sign tokens with the same fixture secret.

### What is compared

Per journey: completion (every step ran); every observation on four aspects
(address: path, query and HTTP status; text; structure; form fields); the mail
sent; and the row delta in Decko's card tables (N4, with timestamps and
password digests masked, because a browser session cannot pin both engines'
clocks). Observations are normalised by B1-B5 (`browser/lib/observe.mjs`):
rendered text with whitespace collapsed and relative times and dates masked;
the main area's element tree as tags and sorted classes, with per-render random
classes masked; the visible form controls; the URL without its host.

A journey that fails on the reference is a broken journey: reported, never
graded.

### Running

Everything, one engine at a time (Ruby journeys, TS journeys, the comparison,
then Decko's own cucumber browser scenarios on stock Ruby):

```
node reference-harness/browser/run-all.mjs --out <dir> --decko <decko git checkout>
```

Or step by step:

```
node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ruby.json \
  --fixture reference-harness/fixtures/synthetic-v1 \
  --journeys reference-harness/browser/journeys/synthetic-v1.json --out <rubyDir>
node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ts.json ... --out <tsDir> [--signin direct]
node reference-harness/browser/compare-journeys.mjs --expected <rubyDir> --actual <tsDir> --report report.json
```

`--signin direct` sends Decko's sign-in request without the form, so the rest
of a journey still runs on an engine whose sign-in page differs. `--html 1`
also saves every observed page's DOM under `<out>/<journey>/`. The TS server
needs the port built into `dist/` (`tsc -p tsconfig.json`).

The browser is an installed Chrome, Edge or Chromium driven through
playwright-core (`HARNESS_CHROME`, `HARNESS_PLAYWRIGHT_CORE`), headless, with
a throwaway profile; nothing is downloaded. Requests to hosts other than this
machine are refused, except the public script and font CDNs a stock Decko
layout links (jQuery, jquery-ujs, ace, select2, icon fonts), without which
Decko's editors do not run on any engine; `HARNESS_OFFLINE=1` refuses those
too.

`browser/capybara/` holds a Capybara driver over the same browser, so Decko's
own cucumber features run without a WebDriver binary:
`cucumber -r <decko>/features -r reference-harness/browser/capybara/register.rb`.
`browser/cucumber/run-features.mjs --decko <checkout> --out <dir>` runs the
`@javascript` features of the release (`--ref`, default `v0.20.0`) on the
installed, unpatched gems: `browser/cucumber/app` is a stock deck in the
cucumber environment whose database, cache, files and mod public files live in
a work directory removed on exit. It records every scenario's result in
`<dir>/summary.json`.
