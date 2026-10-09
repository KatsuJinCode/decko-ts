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

## 3. Runner

```
node runner/run.mjs --adapter adapters/<engine>/adapter.json \
     --fixture fixtures/<name> --out <resultsDir> [--kinds render,semantics,scenarios] [--filter <regex>] [--limit <n>]
node runner/grade.mjs --fixture fixtures/<name> --actual <resultsDir> [--report report.json]
```

`run.mjs` copies the built deck per session, runs the operations, and writes
`render.jsonl`, `semantics.jsonl` and `scenarios.jsonl` plus `run-meta.json`.
For every scenario step it snapshots Decko's card tables before and after and
records the normalised row delta. For read sessions it records any row the
session changed (`*_session_row_changes` in `run-meta.json`): reads must not
write.

`grade.mjs` compares an engine's results with `expected/` item by item and
prints a pass rate per kind and per group (page or view and actor; question
type; write action). Scenario steps are graded on every kind they exercise: a
write's answer is a side-effect item, its row delta a persistence item, a
render or question after a write a rendering or semantics item. An item whose
oracle answer was an adapter error is reported as an oracle error and not
graded.

Any results file may be stored gzipped (`render.jsonl.gz`); the fixture's
large reference renders are. `node runner/causes.mjs report.json [kind]`
groups a report's failures by the shape of their first difference, so one
root cause reads as one line.

The runner needs Node 22.5 or later and nothing else (`node:sqlite`).

## 4. Normalisation

Applied to both sides before comparison, and nothing else:

1. **N1.** `data-slot-id="<hex>"` becomes `data-slot-id="SLOT"`: slot ids are
   random per render in every engine.
2. **N2.** `0x` followed by 8 to 16 hex digits becomes `0xADDR`: a
   host-language object address printed into an error message.
3. **N3.** In a write result, the new card is compared by name (its id is a
   row id, compared by persistence), and mail text loses trailing spaces per
   line, CRLF line ends and surrounding blank lines.
4. **N4.** In a row delta, rows the step created get symbolic ids (a card by
   its full name, any other row by table and creation order) and every column
   pointing at them is rewritten the same way; timestamps are compared as
   instants. Rows that existed before the step keep their ids, because both
   engines start from the same deck file.
5. **N5.** JSON object key order never counts; array order always does.
6. **N6.** `127.0.0.1:<port>` becomes `127.0.0.1:PORT`: each engine server
   answers on a fresh per-journey port, so an absolute URL the deck itself
   builds (a mail body's card link) carries a port that is random per run on
   both engines. The host and scheme stay exact.

Everything else is compared exactly: every byte of HTML, every row column,
every error message.

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

Run natively (Ruby 3.3 with `bundle install` in `oracle/app`) through
`adapters/ruby/adapter.json`, or in Docker:

```
docker build -t decko-reference-oracle:0.20.0 reference-harness/oracle
docker run --rm -v "$PWD/reference-harness/fixtures/synthetic-v1:/fixture" \
  decko-reference-oracle:0.20.0 bash /oracle/build-deck.sh /fixture
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ruby-docker/adapter.json \
  --fixture reference-harness/fixtures/synthetic-v1 --out reference-harness/fixtures/synthetic-v1/expected
```

## 6. Versioning

- **Protocol** (`"protocol": 1` in the ready line): bumped when a request or
  answer shape changes incompatibly. A runner refuses an adapter on another
  protocol.
- **Deck format** (`"format": "decko-reference-deck/1"`): bumped when
  deck.json's meaning changes.
- **Fixture**: a fixture is immutable once its expected outputs are
  published. A changed generator or operation list makes a new fixture name
  (`synthetic-v2`), so a pass rate always names exactly what it was measured
  on.
- **Oracle**: expected outputs record the oracle's versions in
  `expected/run-meta.json`. Capturing against another Decko release makes a
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
