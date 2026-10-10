# Parity method

This engine is a port. Its acceptance criterion is not "it works" but "it
produces the same bytes Ruby Decko produces". That criterion is only worth
anything if the measurement behind it is trustworthy, so this document
describes how parity is measured, what each instrument can and cannot prove,
and where the numbers that get quoted come from. Per-domain coverage — what
is measured where, with counts, and what the public package does not measure
at all — is inventoried in [coverage-inventory.md](coverage-inventory.md).

The oracle is card 1.110.0 and decko 0.20.0 on Ruby 3.3. Everything below
that says "Ruby" means that version.

---

## The four layers

Parity is claimed across four kinds of behaviour, and each kind has its own
instrument. A single figure is only meaningful once you know which layer it
covers.

| Layer | What parity means | Instrument |
| --- | --- | --- |
| **Rendering** | The HTML, JSON and other format output is byte-identical to what Ruby emitted for the same card and view. | Oracle replay and corpus replay, both byte comparison. |
| **Semantics** | Names, keys, types, sets, rules, permissions and CQL produce the answers Ruby would produce. | Oracle replay of names, rules and CQL fixtures; the CQL `match` battery. |
| **Persistence** | Save, delete, rename and reference state reproduce Ruby's act, action, change and reference chain. | Write-conformance scenarios replayed against the engine. |
| **Side effects** | Events, notifications and permission denials produce the observable effects Ruby produced. | Captured notification mail bytes; captured permission-denial bytes. |

Rendering and semantics are covered directly by byte comparison against
captured output. Persistence and side effects are covered by scenario
replay: a fixture records what Ruby did, and the engine's effect on the same
starting state must match.

---

## The Ruby oracle

`tools/oracle/` holds a running copy of Ruby Decko and the scripts that
record its behaviour. The app itself is a disposable scaffold: it is not
committed, and it is rebuilt from `decko new` plus two Gemfile additions
when it is missing. The additions are required and neither is optional —
`tzinfo-data`, because the platform has no zoneinfo directory and the boot
aborts without it, and a pin on `json` 2.x, because the newer major version
removed a keyword argument the Rails 7.2 stack still passes.

Capture scripts run inside that app and write JSON with deeply sorted keys and
a stable formatting, so the same deck always produces the same bytes. The
contract is verified by hashing the captured files before and after a re-run:
two consecutive captures must produce identical digests. Seeding is
create-if-missing, so a re-run converges rather than duplicating cards.

### What is captured, and what is deliberately not

Two fixture sets are committed under `fixtures/captured/`:

- **`smoke.json`** — a small seeded deck plus captures of its card records,
  four rendered views per card, a read-rule result and an unknown-view error
  sentinel. This is the miniature specification a clean clone can replay.
- **`cql-basic.json`** — a read-only battery of CQL queries, each recorded with
  its canonical query form and its name-only result, covering name
  conditions, left/right/plus conditions, sorting with limit and direction,
  negation, exact content, creator conditions, an empty result and the
  `match` failure sentinel.
- **`cql-mysql-match.json`** — a separate battery for `match`, recorded
  against a MySQL-protocol server. It exists because `match` cannot execute
  on SQLite at all (see below), and is described with the CQL decision record
  in [decisions/README.md](decisions/README.md).

Three things are not captured, and their absence is deliberate:

1. **Timestamps and creator identifiers** are real times and real rows. They
   are excluded from the fixtures rather than normalized, because a
   normalization there would hide real divergence.
2. **Card identifiers** are database-local. They depend on the history of the
   database the capture ran against, so a freshly rebuilt app assigns
   different ones. The replay strips the `id` field from both sides before
   comparing; name-keyed values are the parity target.
3. **Seed-log output** describes whether a card was created, updated or
   already present, which legitimately differs between runs. It goes to
   stdout, never into the fixture.

### The one normalisation

Every wrapped slot render embeds a random DOM identifier, generated from
`SecureRandom.hex(10)`. It cannot be captured as a literal value, so the
recording layer rewrites `data-slot-id` to a fixed placeholder for both quote
styles. The attribute's presence remains part of the fixture: a view that
should carry a slot id and does not still fails.

The replay applies the same rule to both sides and matches the placeholder
strictly — exactly twenty lowercase hexadecimal characters. Ruby emits
`SecureRandom.hex(10)`, so a wrong-length identifier from the engine survives
normalization and fails the diff, which is the point; uppercase hex survives
too, because Ruby's output is lowercase and uppercase would be a real
divergence. The rule is idempotent, so the placeholder is never rematched.

This is the only normalization. Everything else is compared as exact bytes:
no whitespace tolerance, no case folding, no attribute reordering.

### `match` needs a second oracle

CQL's `match` compiles to a regular-expression predicate, and the regular
expression executes in the database server, not in the application. The
Ruby query compiler routes it through the database adapter's `match` method,
which is implemented for MySQL and PostgreSQL and raises on any other
database. SQLite therefore has no oracle for the only part of `match` that
does the work — it can only record the raise.

The `match` battery therefore runs the same oracle app against a portable
MySQL-protocol server. That capture records the server's version and
collation, the source location of the `match` implementation actually applied
at runtime, the generated SQL shape, thirty queries covering the default
literal-substring path, case behavior, exact-name matching, field-restricted
forms, NULL handling and raw-regex forms, and a rendered search view.

The capture pins behavior that is specific to one server family. Different
server engines implement different regular-expression dialects and will
disagree on the exotic raw-regex forms. The port's contract is therefore
"behave like the captured server, and fail loudly rather than quietly return
the wrong rows where it cannot" — not "behave identically on every engine".

### Shared state

The SQLite oracle's deck is shared state, so a capture is only trustworthy
when nothing else is writing to it. Check for recently created non-seed cards
before trusting a run. The MySQL rung has a private server, private data
directory and private database, so it is immune.

---

## Oracle replay

`src/testing/` holds the consumption side: the fixture schema and its
load-time validation, the byte comparator, and the replay runner. It
references engine areas by interface only; it does not import them.

The runner works from a registry of per-area handlers. Each handler takes the
fixture's input for its area and returns one of three outcomes: raw bytes
compared as-is, a JSON value canonicalized by deep key-sorting and then
compared, or a raised error rebuilt into the exact sentinel string the capture
recorded and compared. Areas with no registered handler report as pending —
a missing stream is a status, never a failure. The full Ruby class name is
part of the compared bytes for errors, so a handler must supply the same class
name Ruby raised.

Each engine area registers its handler in its own test file. Registration is
per test file, and registering the same area twice in one file is an error.
`npm run replay` runs the machinery plus every suite named for the convention,
so an area that lands a handler is picked up by the aggregate command
automatically.

The replay only covers what the capture recorded. Views beyond the four the
smoke fixture captures, deeper CQL operators and mod-level behaviour need new
capture rungs. One recorded section — a CQL search result set — is validated
and typed but not replayable, because the capture recorded bare result arrays
without the canonical query; the query-bearing fixture supersedes it.

---

## Corpus replay

Oracle replay proves parity on a small seeded deck. Corpus replay proves it at
scale, against a capture of a real deck: every card record and every recorded
view, compared byte for byte against what Ruby actually rendered.

The corpus is a SQLite database plus JSONL shards, one line per captured card
or view. **It is not committed.** It contains the deck's real content, which
is personal data belonging to someone who did not authorise its
redistribution. It lives outside the repository, and suites that need it
gate themselves on it being present — loudly, never silently (see
[TESTING.md](TESTING.md)).

Replay shards are run in parallel by a runner that pairs shards into phases,
gives each phase a weight-aware deadline derived from a completed run's
recorded per-phase durations, and re-pairs the schedule heaviest-with-lightest
so no phase carries two heavyweight shards. Two behaviours in that runner are
worth stating because they are the ones that would quietly corrupt a
measurement if they broke:

- **Kill scoping.** A phase that breaches its deadline has only that phase's
  own recorded process and its descendants killed. The kill path snapshots
  descendants by walking the process table and sweeping by explicit process
  id, because killing a shell alone can leave its grandchildren running. A
  sibling phase is a sibling, not a descendant, and is unreachable by
  construction. The behaviour is tested against real process trees.
- **Instrument integrity.** The verifier specification is staged from the
  canonical copy, and a differing staged copy refuses the run rather than
  being overwritten. A silently replaced instrument makes measurements wrong
  in a way nothing downstream would detect.

### Corpus provenance

Two corpora can be the same size and differ in content, so a corpus can be
swapped for another between runs without anything noticing. Provenance is
checked by hashing the staged corpus and comparing it against the digest the
capture manifest binds. The manifest also records the SQLite header change
counter, which the file format increments on every transaction.

The check is available as a standalone read-only command that needs no
capture, no grade and no running server, and corpus-scale suites call it
before seeding so a verification run cannot start on swapped bytes. Outcomes
are: verified (the live bytes match what the manifest binds), refusal (they
differ, or the manifest is missing or unparseable while a corpus is staged),
unbound (a corpus is present that was never photographed here — reported, not
refused, because nothing recorded can be contradicted) and absent.

---

## Performance measurement

Parity is the acceptance criterion; performance is the reason the port exists
on an edge runtime. The two are measured separately and never traded.

The comparison renders identically-named synthetic fixture decks through both
engines: chains one to two hundred levels deep, fans of one to two hundred
children, and whole inclusion trees. The shape of the result is what matters:
Ruby's query cost grows linearly with every axis — roughly one query per
included card — while this engine's cost tracks the shape of the inclusion
tree rather than the size of the deck, because one batched statement fetches a
whole inclusion level. Warm renders are served from cache at zero round trips
at every renderable shape. Past the render cap both engines refuse, and the
rejection cost is bounded and depth-independent on both sides.

Counts are comparable across engines; wall-clock is not, because the two
render against different storage backings. Every quoted figure should cite the
committed artifact it came from. When quoting a parity figure, give the corpus
it was measured on and the command that reproduces it.

A budget harness runs as a tripwire on four measures: warm per-entry render
time, worst-case pathological content, statement count on a warm render, and
how many cards remain cold after prewarming. It is deliberately not part of the
default test run and not a parity oracle.

---

## Reading a parity figure

A parity figure is only as good as these answers:

- **Which layer?** Rendering figures say nothing about writes, and write
  figures say nothing about rendering.
- **Which corpus and which version?** A percentage against the miniature
  fixture proves much less than the same percentage against a full deck
  capture.
- **Which view set?** A figure over the views the corpus happens to contain
  is not a claim about views it does not.
- **Is it a point-in-time snapshot or a standing guard?** The full corpus
  replay is a proof run, not a development loop. Regression protection comes
  from the standing test net and the named suites of whatever changed, not
  from re-running the whole corpus.

And what no figure establishes: that a mod's behaviour matches beyond the
views the capture exercises. A view is "covered" when a renderer exists for
it, which is not the same as that renderer producing Ruby's bytes. The only
byte-level proof for a view is a capture that rendered it.

---

## Reproducing the numbers

```bash
npx vitest run tests/testing   # the replay machinery on its own
npm run replay                 # machinery plus every area's replay suite
npm test                       # the engine suite against the miniature corpus
```

The oracle itself needs a Ruby install with the target gems, so re-capturing
is a separate exercise from replaying a committed fixture. The capture and
grade tools print their own commands, and the capture scripts carry the
exact invocation in their run headers.