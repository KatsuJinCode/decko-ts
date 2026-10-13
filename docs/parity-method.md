# Parity method

This engine is a port. Its acceptance criterion is not "it works" but "it
produces the same bytes Ruby Decko produces". That criterion is only worth
anything if the measurement behind it is trustworthy, so this document
describes how parity is measured, what each instrument can and cannot prove,
and where the numbers that get quoted come from. Per-domain coverage — what
is measured where, with counts, and what the public package does not measure
at all — is inventoried in [coverage-inventory.md](coverage-inventory.md).

The oracle is card 1.110.0 and decko 0.20.0 on Ruby 3.3. Everything below
that says "Ruby" means that version. It also means that **environment**: the
committed expected outputs were captured on Windows (`ruby 3.3.12
[x64-mingw-ucrt]`), and Ruby's own operating system decides some output bytes
— the class-token order inside a `class` attribute is the one that moves.
Three normalisations absorb what an environment legitimately changes, and
nothing else does ([reference-harness/SPEC.md](../reference-harness/SPEC.md)
§4, [tools/ruby-version-variance/README.md](../tools/ruby-version-variance/README.md)). A Ruby
patch-version range measured on one operating system says nothing about a
capture on another.

That correction is measured, not assumed, and the number is the same one the
variance README quotes. Capturing `synthetic-v1` with stock Linux Ruby of
the same version and comparing answer by answer: **678 of the 1,752 render
operations differ, every one of them class-token order and nothing else;
all 2,388 semantics operations and all 16 scenarios are equal after N1; the
classifier reports 0 UNCLASSIFIED**
(`tools/ruby-version-variance/evidence/class-order-linux-vs-committed.json`).
The patch-version axis is a separate measurement and a null result: Ruby
3.2.11 against 3.3.12 on Windows is byte-identical after N1
(`evidence/variance-3.3.12-vs-3.2.11.json`), which is why the operating
system, not the version, is the axis this document has to account for.

---

## The four layers

Parity is claimed across four kinds of behaviour, and each kind has its own
instrument. A single figure is only meaningful once you know which layer it
covers.

| Layer | What parity means | Instrument |
| --- | --- | --- |
| **Rendering** | The HTML, JSON and other format output is byte-identical to what Ruby emitted for the same card and view. | Oracle replay, corpus replay and the reference harness (`../reference-harness/SPEC.md`), all byte comparison. |
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

Three fixture sets live under `fixtures/captured/`. **None of them is in the
public package**: `fixtures/captured/` is on the exclusion list
(`tools/public-candidate/exclusions.txt`), because these are captured oracles
rather than from-scratch synthetic material. They are development evidence —
they record what Ruby produced, and the suites that read them run in the
private repository. The public package's replayable evidence is the
reference-harness fixture (`reference-harness/fixtures/synthetic-v1`), which
is deliberately kept.

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

### Every instrument's normalisations, in one table

**This table is authoritative.** Every other document that states how many
values are normalized points here rather than restating a count. A figure
takes its normalisations from the instrument that produced it, so the
instrument is named first and its rules second.

| Instrument | Rules | Where each is defined |
| --- | --- | --- |
| **Public reference harness** (N1/N2/N3) | **3**: N1 masks the `data-slot-id` attribute **value** (quote style kept); N2 is a canonical form — JSON object key order never counts, array order always does; N3 is a canonical form — inside a real `class` attribute the class tokens are compared as a **set** (both sides sorted; the token set, the count and the tokens themselves all still count, only the order is canonicalised). Nothing else. | `reference-harness/runner/normalize.mjs:26` (`SLOT_ID`), `:56` (`normalizeHtml`/N1+N3), `:205` (`sortClassTokens`/N3), `:225` (`stable`/N2). Spec: `reference-harness/SPEC.md` §4. |
| **Oracle-replay comparator** | **3** replay-legitimate normalizations, applied to **both** sides by `normalizeForReplay` in this order: (1) `data-slot-id` → `RANDOMIZED`; (2) accordion group hash → `HASH`; (3) `Cardio::Mod` object address → `ADDRESS`. | `src/testing/diff.ts:225` (`normalizeForReplay`, the compare seam); the three rules at `:1-20` (rule 1), `:90` (`ACCORDION_GROUP_HASH_PATTERN`), `:201` (`MOD_OBJECT_ADDRESS_PATTERN`). |
| **Historical corpus replay** | **4 normalizations** (the three above **plus** the Cloudflare `__CF$cv$params` challenge-script block, removed from both sides) **+ 2 expectation transforms applied once, upstream of the comparison** (the s3→DigitalOcean-Spaces asset-host prefix; the denied-seam blank-line re-anchor) **+ the 50 live-swapped expectations** from the subsection above (13 + 37, two disjoint swap sets). | Normalizations: `src/testing/diff.ts:165` (`CF_CHALLENGE_BLOCK_PATTERN`, the fourth; applied in `normalizeForReplay` at `:227`). Transforms: two one-shot instruments, run once, recorded in the private swap manifests (the asset-host prefix; the denied-seam blank-line re-anchor). Live swap: the "live-anchored expectations" subsection above; the swap manifests are committed in the private repository only. |

Two consequences worth stating plainly, because they are where the older
prose went wrong:

- **"Exactly one value is normalized" was never true of the comparator.** It
  described the *recording layer*: what the capture script rewrote before
  writing a fixture. The current smoke capture rewrites nothing —
  `tools/oracle/capture.rb:52-54` defines `normalize` as the identity,
  because the slot id's quote style is part of Ruby's output and an earlier
  rig that rewrote the value to `data-slot-id="RANDOMIZED"` erased it
  (`tools/oracle/capture-stores-raw-slot-ids.test.mjs` is the standing guard
  against that class of rewrite returning). Masking now happens at the
  **compare seam**, on both sides, and both harnesses do it: the replay
  comparator through `normalizeForReplay`, the reference harness through N1.
  Older fixtures captured before that change still carry the erased form;
  `src/testing/diff.ts:134` (`referenceErasedSlotQuotes`) detects them and
  compares them under the quote-erasing rule rather than the quote-keeping
  one, so both generations of fixture stay gradable.
- **The corpus row is not one number.** Four normalizations, two transforms
  and a 50-entry live swap (two disjoint swap sets) are three different
  mechanisms at three different points in the pipeline. A figure that quotes
  the corpus must say which of them it depends on.

### What the oracle-replay comparator normalises

Every instrument defines its own normalisations, and a figure takes its
normalisations from the instrument that produced it; the table above is the
single place that says which is which. The prose below describes the
oracle-replay comparator's three rules in full.

First, every wrapped slot render embeds a random DOM identifier, generated
from `SecureRandom.hex(10)`. It cannot be captured as a literal value, so the
recording layer rewrites `data-slot-id` to a fixed placeholder for both quote
styles. The attribute's presence remains part of the fixture: a view that
should carry a slot id and does not still fails.

The replay applies the same rule to both sides and matches the placeholder
strictly — exactly twenty lowercase hexadecimal characters. Ruby emits
`SecureRandom.hex(10)`, so a wrong-length identifier from the engine survives
normalization and fails the diff, which is the point; uppercase hex survives
too, because Ruby's output is lowercase and uppercase would be a real
divergence. The rule is idempotent, so the placeholder is never rematched.

The other two rules cover the same class of capture-process artifact: the
per-process accordion group hash (Ruby 3.3 seeds `String#hash` per process,
so a collapse id carries a value no deterministic engine can reproduce) and
the `Cardio::Mod` object address that one mod's output interpolates (the
object defines no `to_s`, so Ruby prints its heap address). Both are
normalised to fixed placeholders on both sides.

Everything else is compared as exact bytes: no whitespace tolerance, no case
folding, no attribute reordering.

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
disagree on the exotic raw-regex forms. This engine's contract is therefore
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

### The live-anchored expectations

**The corpus grade is not purely oracle-against-oracle. Fifty of its
expectations are bytes fetched from the live site, not from the 0.20.0
oracle.** Stating this is the point of the subsection; a figure that carries
them must not be quoted as a pure Ruby-parity figure. **50 is the sum of two
disjoint sets, 13 and 37** — neither a sample of the live-anchored set nor an
upper bound on it.

| Swap set | Entries | Split | Live fetch window (one host) | Manifest (private repo only) |
| --- | ---: | --- | --- | --- |
| The 13-entry view/page swap | 13 | 6 view-level, 7 page-level | one fetch window | private repository only |
| The 37-entry show-key swap | 37 recorded: 33 byte changes, 4 already byte-equal to live | view-level only — `open` 18, `closed` 16, `content` 3 | one fetch window | private repository only |

- **Why the two counts are what they are.** The 13 is the number the swap
  instrument for that set refuses to run without: it fails unless the verdicts
  file holds exactly 13 `LIVE-DIFFERS` rows, and its manifest records those
  same 13. The 37 is a separately-recorded set, named in that instrument's own
  header:
  "every W3 view-lane entry whose residual is the conditional data-slot show
  key gets TODAY'S live response body as its expectation". Its manifest records
  37 entries, of which 4 were already byte-equal to the live body when the
  swap ran — provenance recorded, no line changed — so 46 of the 50 entries
  had their expectation bytes written from a live capture.
- **The two sets are disjoint, and that was checked rather than assumed.**
  Both manifests record the entry key per entry — `name` plus `view` — and
  comparing those keys across the two manifests returns an **empty
  intersection**: none of the W5 set's six view-scope keys appears among the
  37. Shard identity is not decisive here (both sets stage into separate
  directories whose shard filenames collide by number, and three shard numbers
  appear in both sets), so the key comparison is the one that settles it.
  13 + 37 therefore counts 50 distinct entries, none of them twice.
- **Source: live GETs against the one host, captured whole-body and stored
  verbatim** (37 entries in one fetch window, 13 in another),
  including the documented per-response noise (Cloudflare `__CF$cv$params`
  tokens, per-render `data-slot-id` hashes).
- **Era: the live 0.19.1 serializer, which is an *older* engine era than the
  0.20.0 oracle.** The live deployment renders `Decko v0.19.1` in its footer
  credit — `src/card/render/deployment-follow-live-config.ts:40-41` for the
  note, `:108` for the value `footerDeckoVersion: "0.19.1"` — against the card
  gem's `"0.20.0"`. Those 50 entries are therefore measured against an
  **older engine era's output, recorded from a site, not from a 0.20.0 Ruby
  process**: the live deployment runs behind the version this engine targets.
  The direction is the part that matters, and it is not the flattering one —
  the live bytes are not a newer engine's promise, they are an older
  deployment's.
- **Policy: the rule the capture tooling applies, quoted as written.**
  The 37-entry instrument states it in its header:
  "Per the standing ruling (live is the only benchmark) the expectation
  becomes today's live bytes." That is the policy this subsection documents,
  and the W5 tool adopted the same one ("live truth wins where the live
  capture holds the page"). The ruling is the substance; the framing this
  bullet used to carry around it — that a ruling is what made the policy — is
  process, not a measurement claim, and the policy stands without it. It is
  not a claim that live outranks the oracle everywhere — each tool is a
  one-direction overlay that refuses on state drift and records an inverse
  manifest, so the frozen originals stay recoverable as history.
- **The live-*derived* transforms beside them carry no live page bytes.** Two
  further reversible overlays move live-derived truth into the corpus without
  fetching a body: the asset-host prefix transform (6,552 lines changed over
  32,948 occurrences) and the denied-seam re-anchor (6,535 page-scope entries,
  one byte range each). A fifth swap instrument rewrites
  5 entries' `record.content` from the **local mirror rows**
  (the private corpus staging deck), not from live — so it is not one of the 50.
- **What it means for the historical figure.** A share of the historical
  corpus's expected bytes — the 50 entries listed above — comes from the live
  0.19.1 site rather than from the 0.20.0 oracle. For those entries a replay
  is measuring agreement with a 0.19.1-era deployment rather than with the
  Ruby process the rest of the corpus was captured from, so **the historical
  corpus figure is not a pure Ruby-oracle grade.** The correct reading of
  such a figure is: *50 expectations are live-anchored; the remaining corpus
  is oracle-anchored.* It is not a weaker claim in the direction of being
  flattering — live bytes are a real rendering of a real Decko deck — but it
  is a **different** claim, and the corpus figure must say which 50. Both
  manifests name their entries per-entry (`id` or `name` + `view`, `lane`,
  `shard`, `line`, `liveUrl`, `liveFetchedAt`, and the before/after sha256
  pair), so any quoted figure can be recomputed with and without them.
- **Where the manifests live, said precisely.** All four swap manifests are
  committed in the private repository (a `git ls-files` of that manifest
  directory lists 112 files, these among them), so every count on this page is
  checkable there. **They are not in the public package**: the manifest
  directory is on
  the exclusion list, because 50 of the entries those manifests record are
  whole-body bytes fetched from the live site. In the public package these
  counts are not recomputable from the tree — they are quoted measurements
  whose instrument is described here. The corpus staging they operate on is
  likewise not committed —
  the repository ignores it outright — because it carries the deck's real content.
- **What was deliberately not swapped, and why.** The W5 tool records its
  exclusions in its header: the 2 `LIVE-CONFIRMS` entries keep their oracle
  expectation (the entry fails for engine reasons, so live truth does not
  clear it), and the 5 `record` entries keep theirs because the live site has
  no record view surface to capture (422/403 responses, not renderings).
- **One figure cited here cannot be checked in this repository.** The
  13-entry instrument's header also refers to an earlier set of 77 swaps whose
  bytes came from live responses. No
  manifest for that earlier set of 77 swaps is committed in this repository,
  and
  none was found in any local checkout of it, so those entries cannot be
  enumerated or tested for overlap with the 50 above. **50 is therefore the
  proven total, and if those swaps landed in the same staging the
  live-anchored set is larger by an unquantified amount.**

---

## Performance measurement

Parity is the acceptance criterion; performance is the reason this engine
exists on an edge runtime. The two are measured separately and never traded.

The comparison renders identically-named synthetic fixture decks through both
engines: chains up to the twenty-level render cap (past it both engines
refuse, and the rejection cost is bounded and depth-independent on both
sides), fans of one to two hundred children, and whole inclusion trees. The
shape of the result is what matters: Ruby's query cost grows linearly with
every axis — roughly one query per included card — while this engine's cost
tracks the shape of the inclusion tree rather than the size of the deck,
because one batched statement fetches a whole inclusion level. A warm render
on a long-lived engine costs one round trip: the freshness-stamp read that
opens every request. Zero round trips holds only within a single request,
where the request-local store answers.

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

The **public grade** — the reference-harness run and grade against the
committed `synthetic-v1` expected outputs — was last measured on
**2026-10-10**:

```bash
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v1 --out <resultsDir>
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
     --actual <resultsDir>
```

It needs only Node and the engine — no Ruby, no private deck. The
per-domain figures it produces are inventoried in
[coverage-inventory.md](coverage-inventory.md), and the standing engine suite
has its own commands:

```bash
npx vitest run tests/testing   # the replay machinery on its own
npm run replay                 # machinery plus every area's replay suite
npm test                       # the engine suite against the miniature corpus
```

**Provenance of the expected outputs, and why the tree is the artifact.** The
`MANIFEST.json` beside them records the oracle checkout they were captured
against: commit `28f0278139c373237fafb1cd04a35bd7a41d12e3` (the
results-format-2 capture of 2026-10-08), which supersedes the 2026-10-07
capture taken at `7826664f`
(`reference-harness/fixtures/synthetic-v1/expected/MANIFEST.json`, under
`provenance.supersedes`). Those are **development-tree commits, not published
history**: the published history is squashed, and neither hash is reachable
from the default branch (verified — `git merge-base --is-ancestor` against
`origin/main` exits 1 for both, while both sit on this integration line). A
reader who clones the repository will not find them as ancestors of anything
they check out, so `git show 28f0278` is not a route to the expected bytes.
**The committed tree is the artifact.** The manifest's own guard is the
operative one: the grader refuses expected outputs whose files do not match
their manifest (`reference-harness/SPEC.md` §3, refusal 5), so what is
verifiable from a clean clone is the tree against its manifest — not the tree
against a commit identifier the squashed history does not contain.

The oracle itself needs a Ruby install with the target gems, so re-capturing
is a separate exercise from replaying a committed fixture. The capture and
grade tools print their own commands, and the capture scripts carry the
exact invocation in their run headers.