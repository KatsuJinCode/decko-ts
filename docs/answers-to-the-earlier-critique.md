# Answers to the earlier critique

This document answers the third-party critique linked from
[`decko-commons/decko#1282`](https://github.com/decko-commons/decko/issues/1282).

The critique is external commentary on the original port proposal. It is not
binding direction: binding direction comes from the upstream thread itself. The
answers below follow the critique's own numbering (1-21, plus its closing
request) and are written from what this repository actually measures, so each one
can be checked against the instrument it names.

Three verdicts are used, and they are not interchangeable:

- **Accepted, and already corrected in this repository.** The critique was
  right, the claim was withdrawn or replaced, and the correction is on disk
  with a citation.
- **Answered by a declared limitation.** The repository does not do the thing,
  says so in the place a reader will hit, and names where the gap is.
- **Not met in this release.** The claim is unmet, and a roadmap item is named.

Where the answer is a number, the instrument and its scope are named, because a
parity figure is only meaningful with them
([parity-method.md](parity-method.md), "Reading a parity figure"). The single
page that says what is measured and what is not, per domain, is
[coverage-inventory.md](coverage-inventory.md); this document defers to it
rather than restating counts, and cites it where a figure appears.

---

## 1. "The proposal seriously understates what Decko actually is"

> "This proposal ports the card engine to TypeScript" sounds much smaller than
> the actual undertaking.

**Accepted, and the repository's own vocabulary now reflects it.** This
repository does not describe itself as porting a renderer. It describes four
parity domains — rendering, semantics, persistence, side effects — each with
its own instrument, its own counts and its own declared gaps
([coverage-inventory.md](coverage-inventory.md), "The four domains, and what is
measured in each"; [parity-method.md](parity-method.md), "The four layers"). The
acceptance criterion is byte parity with a running Ruby Decko including its
defects ([decisions/0001](decisions/0001-byte-parity-against-ruby-oracle.md)),
and the exception list is a list of *engineering* exceptions, each one a
security hole or a crash ([docs/SECURITY.md](SECURITY.md), "Approved
divergences").

The area map the critique asks for — what must be ported, what can be replaced,
what is a major unknown — is [ARCHITECTURE.md](../ARCHITECTURE.md), with the
behaviour-level decisions in the decision records under docs/decisions/. The honest summary of the
scope is in the coverage inventory's own account of what is *not* measured
(items 1-6): browser journeys, the default PBKDF2 path in the graded fixture,
hosted database writes, arbitrary mods, jobs, and everything a skipped probe
covers.

The subsystems the critique enumerates each have a named home in the tree:
queries ([decisions/0005](decisions/0005-cql-match-semantics.md)), rules and
sets ([decisions/0008](decisions/0008-view-registry-and-directory-layout.md)),
mod loading ([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md)),
persistence and atomic saves
([decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md)),
blob and SQL drivers
([decisions/0003](decisions/0003-edge-native-driver-interfaces.md)), and
authentication and permissions among the six approved divergences.

## 2. "Ruby is part of the extension model — the biggest missing architectural issue"

> You either abandon Ruby Mods, build a Ruby compatibility runtime, translate
> Mods, define a new TypeScript extension API, or support two extension systems
> indefinitely.

**Accepted. The repository chose the fourth option and states the boundary
sharply.** Mods are compiled into a view registry, not loaded at runtime
([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md)).
The decision record is explicit that this is the *whole* mod contract:

- **Supported:** the site's own `card-mod-*` gems, hand-ported into
  `src/card/mod-loader/mods/`, one module per mod.
- **Not supported:** executing an existing Ruby mod's code unchanged. "A
  `card-mod-*` gem's Ruby is never loaded, interpreted or translated at
  runtime; there is no Ruby runtime on any host this engine deploys to." Also
  not supported: loading mods at runtime, or a deck gaining a mod by dropping
  files into a folder.

The compatibility report quantifies what was ported — 33 mods scanned, 29
declared-complete, 2 partial, 0 missing, 2 ignored
([tools/compat-report/mod-compat-report.md](../tools/compat-report/mod-compat-report.md),
"Summary") — and states in the same place that these labels measure
**declarations only**: no event hook is exercised, no non-HTML format is
rendered, and every view beyond the handful the byte-pins render is unproven
against Ruby's output.

The critique's headline question — what percentage of existing mods work
unchanged — has the answer the repository gives in the only form it can honestly
give: **0%**, because no Ruby mod executes. That is stated in
[decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md) and
echoed in the proposal record's own words: the upstream promise of "mods
included" "means this repository includes hand-ports of the site's own mods,
not a general Ruby-mod execution capability."

## 3. "The nesting/N+1 argument is one of the strongest parts" — but "constant number of queries regardless of depth" is not automatic

> That's not automatically true. … You could implement the same optimization in
> Ruby. In fact, I'd strongly recommend doing exactly that before committing to
> a rewrite.

**Accepted, in full, and the claim was withdrawn.** "A constant number of
queries regardless of depth" is recorded as **not met** in the table of what
changed from the original proposal
([coverage-inventory.md](coverage-inventory.md), "What changed from the original
proposal"). The measured law, in the repository's words: "four fixed round trips
plus one per nesting level below the root, however many cards each level holds —
breadth is free, depth is not." Depth is *not* free.

The critique's structural objection is also empirically correct here. The
nesting graph is not a static foreign-key graph, and the measured data shows it:
the published comparison
([scaling-comparison-deep-nesting.md](scaling-comparison-deep-nesting.md))
renders chains, fans and trees through both engines and records where every
round trip goes. A `fan f200` (201 cards) costs the TypeScript engine 5 round
trips, while a `chain d20` (20 cards) costs 23 — breadth is flat, depth is
linear. The two tests that pin this are
`tests/card/render/deep-nesting-trip-attribution.test.ts` and
`tests/card/render/depth-sweep.test.ts`.

The recommendation to optimize nesting in Ruby first was effectively done: the
comparison table carries four Ruby columns — stock 0.20.0, Ruby main, Ruby main
+ nest prefetch, and Ruby main + machinery batching — so "Ruby optimized" is a
measured column, not a hypothetical. On `fan f200`, Ruby stock needs 204 queries
and Ruby with nest prefetch needs 5, which is the same figure the TypeScript
engine reaches. That is the honest reading of the critique's strongest point:
**the query win is available in Ruby too, and the repository measures both.**

## 4. "The proposal is wrong to imply that Ruby necessarily requires an always-on server"

> A Ruby process isn't physically required to run continuously.

**Accepted as a correction of framing.** This repository makes no claim that
Ruby requires an always-on server, and makes no claim that TypeScript removes
one. The published, reproducible comparison counts **round trips**, not
wall-clock, and says why: "Counts are comparable across engines; wall-clock is
not, because the two render against different storage backings"
([parity-method.md](parity-method.md), "Performance measurement"). The
deep-nesting document makes the same exclusion on its own figures
([scaling-comparison-deep-nesting.md](scaling-comparison-deep-nesting.md), "What
is compared").

## 5. "The energy claim is especially unsupported"

> "10×, plausibly 100×" doesn't follow from the architecture alone. That's a
> benchmark claim and needs measurements.

**Accepted. The claim is gone and the repository says so in both deploy
documents.** [docs/deploy-bunny.md](deploy-bunny.md) and
[docs/deploy-cloudflare.md](deploy-cloudflare.md) each carry the sentence: "This
repository contains no cost measurements and no energy measurements for any
deployment topology." The Cloudflare document adds that published, dated
provider rates "are the source for any bill estimate, and no estimate in this
repository should be read as a measurement."

[coverage-inventory.md](coverage-inventory.md) records the withdrawal in the
same table: hosting is effectively free "**Withdrawn as a total-cost claim**."

## 6. "Cloudflare economics: directionally correct, but the proposal oversells 'free'"

> D1 measures rows read/written, not simply SQL statement count.

**Accepted; the repository reasons in D1's own unit.** The trickle importer
plans work into daily slices against a row-write budget, and its budget is a
configured share of the daily cap, not a statement count
([docs/deploy-cloudflare.md](deploy-cloudflare.md), "The trickle importer"). The
cap is deliberately not restated in the repository — it "is Cloudflare's
figure, changes over time, and is read from Cloudflare's published D1 limits
page" — which is the correct way to write a number that moves. The withdrawal
is recorded as **not verified** that "Cloudflare's free plan does not fit a real
deck" ([coverage-inventory.md](coverage-inventory.md)).

## 7. "The Cloudflare 'one click' claim is real"

> The platform capability is real; the Decko-specific work is not automatically
> solved.

**Accepted, and the claim was narrowed to what the button actually does.**
[coverage-inventory.md](coverage-inventory.md) records it as **not verified**:
"the button deploys one Worker and one D1 database, applies the migrations and
ships a read-only four-card demo: every card write answers `403`, and
`POST /update/*signin` is the one verb that still dispatches while the write
path is unset, because a session row is not a card write. No KV, no R2, no
queues, no secrets in `wrangler.toml`." The README's own "Deploy to
Cloudflare" section describes the same five steps and then labels the result
"What you get: a browse-only demo deck" with the four cards enumerated.

## 8. "'Same data, no migration required' is probably the most misleading sentence"

> "No semantic/data-model migration is required if the new engine continues to
> use a compatible database backend." But D1 doesn't satisfy that automatically.

**Accepted. The sentence is withdrawn outright.** [coverage-inventory.md](coverage-inventory.md)
records: "**Withdrawn.** Import reads a SQLite deck file, a `mysqldump` text dump
or deck-INSERT SQL. PostgreSQL is unsupported — no adapter or dialect
translator exists in the tree."

The PostgreSQL half of the critique — "the first TypeScript implementation
should probably target PostgreSQL" — is answered with a decision, not a
promise: PostgreSQL support was **removed as unverified** rather than shipped
on assertion. The authoritative table is
[decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md), and
the migration matrix at the top of
[`tools/migrate/IMPORT_DECK_RECIPE.md`](../tools/migrate/IMPORT_DECK_RECIPE.md)
carries `PostgreSQL dump | **no** | no PostgreSQL adapter or dialect translator
exists in the tree`. It is not started, and it is not promised here.

Two further migration facts the critique's list did not anticipate are recorded
in [docs/SECURITY.md](SECURITY.md) "Migration compatibility at a glance": while
Ruby still serves the deck this engine must run `DECKO_PASSWORD_HASH=legacy-sha1`
because Ruby cannot verify PBKDF2, D1's transaction semantics differ from
Ruby's and plain SQLite's, and this engine adds schema Ruby has no counterpart
for — an `auth_sessions` table whose sessions do not carry across engines, and
the `deck_data_version` stamp with the six triggers that advance it.

## 9. "The provider abstraction is a good idea, but 'one adapter' is naïve"

> You need to abstract semantics such as: transactions, isolation, locking,
> generated IDs, … And then build a conformance test suite.

**Accepted and implemented as described.** The abstraction is explicitly
semantic rather than syntactic, and provider differences are written down rather
than smoothed away: "Every adapter passes one shared conformance suite, and a
second suite pins the adapters to *each other* over a fixed transcript — so two
adapters cannot drift apart while each still passes its own suite"
([decisions/0003](decisions/0003-edge-native-driver-interfaces.md)).

The critique's list of unabstractable semantics is answered item by item rather
than by assertion. Transactions are the clearest case: `SQLDatabaseDriver` gained
`transaction(work)` and a `transactionGuarantee` that states, property by
property, what each adapter actually provides, and
[decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md)
carries the per-adapter mechanism table — `BEGIN IMMEDIATE`/`COMMIT` on SQLite
and libSQL, a trigger-backed compensating journal on D1.

The honesty point matters here and is stated rather than buried: that same
record says "**Nothing here was run against a hosted service.**" D1 was
verified against workerd's local D1 under Miniflare, libSQL against a Hrana v2
test server backed by real SQLite. No committed evidence describes a production
write on any host ([coverage-inventory.md](coverage-inventory.md), item 3).

## 10. "The 'exact byte-for-byte parity' idea is good — but not sufficient"

> You need at least four layers. … D. Side-effect parity. This is where the
> proposal is weakest.

**Accepted structurally: the repository's own layer set is those four.**
[parity-method.md](parity-method.md) "The four layers" is rendering, semantics,
persistence and side effects, each with its own instrument and an explicit note
that a single figure is only meaningful once you know which layer it covers.
[coverage-inventory.md](coverage-inventory.md) carries the counts per layer
against the committed `synthetic-v1` fixture and accounts for every step of all
three public batteries — match, declared difference, or nothing.

On the critique's specific worry, that HTML can match while the engine silently
fails to send an email or create a revision: that is precisely what the side-effect
instrument grades. Every write step's answer carries `saved`, the `errors`, the
resulting card and the `mail` sent, and every sign-in's answer carries
`signed_in` and the resulting actor
([reference-harness/SPEC.md](../reference-harness/SPEC.md), "Operations").

Two honesty notes belong here, because the critique asked for the boundary and
the repository states it elsewhere:

- The side-effects battery on the committed clean deck is **84 of its 88 public
  steps matching**, 3 declared deliberate differences and 1 open, with 2 more
  steps withheld until disclosure ([docs/SECURITY.md](SECURITY.md)). It is not
  presented as a clean sweep.
- The corpus figure is not purely oracle-against-oracle: fifty of its
  expected entries are bytes fetched from a live site running an earlier Decko,
  not from the 0.20.0 oracle — two disjoint sets of 13
  and 37, whose entry keys were checked to be distinct — so the correct
  reading is "50 expectations are live-anchored; the remaining corpus is
  oracle-anchored"
  ([parity-method.md](parity-method.md), "The live-anchored expectations").

## 11. "Byte-for-byte HTML equality is actually problematic"

> The acceptance criterion should probably be deterministic canonical output
> rather than blindly byte-for-byte parity.

**Answered by a declared limitation, and a deliberate narrowing.** The criterion
is byte parity — it is what makes "an existing deck behaves the same on either
engine" checkable ([decisions/0001](decisions/0001-byte-parity-against-ruby-oracle.md))
— and this repository did **not** take the critique's suggestion to normalise the
comparison into a canonical form. It went the other way: it reduced normalisation
to the smallest set that survives evidence.

[parity-method.md](parity-method.md) holds the authoritative table, and it is
short. The public reference harness applies exactly **three** rules: N1 masks
the `data-slot-id` attribute *value* (quote style kept), N2 is a JSON canonical
form, and N3 compares the class tokens inside a `class` attribute as a set.
"Everything else is compared exactly: every byte of HTML, every field of
a write answer (the new card's id and every byte of mail text included), every
column of every row (ids and timestamps as stored)."

The critique's attribute-order example is therefore not normalised away — a
differently ordered attribute is a failure, which is the stricter reading.
Attribute order still counts; only the order of the tokens *inside* a `class`
attribute's value does not, because Ruby's own environment decides that one:
stock Linux Ruby and stock Windows Ruby emit the same tokens in a different
order, measured on the same fixture and the same Decko version. The token set,
the count and the tokens themselves still count under N3; only the order is
canonicalised. The evidence for the one mask that exists is recorded rather
than asserted: for `synthetic-v1`, two complete stock-oracle runs differ in
1,351 of 4,156 items, *all* in slot ids — 9,061 of 9,061 slot ids differ and
nothing else does — and a test checks that the recorded nondeterminism covers
exactly the masks the normaliser applies. A new mask needs the same evidence on
the fixture that needs it ([reference-harness/SPEC.md](../reference-harness/SPEC.md),
§4 "Evidence").

The same table records normalisations the first version applied and no longer
does, because no oracle run varies in them: hex object addresses, dropping a
write answer's card id, and trimming mail whitespace.

## 12. "The migration claim needs much more evidence"

> "already proven on a real 47,000-card deck" — I searched the public Decko
> repository/documentation and couldn't verify that claim.

**Accepted: the claim is withdrawn and replaced with a counted instrument.**
[coverage-inventory.md](coverage-inventory.md) records "Same data, no migration
required" as **Withdrawn** (see point 8), and the repository does not make a
47,000-card migration claim in its place.

What it publishes instead is countable and layered. The public write probe runs
70 operations against a committed synthetic deck and compares every operation's
row delta against the Ruby oracle's: of the 67 public operations, 65 are
identical and 2 are declared deliberate differences, and 3 more are withheld
until disclosure ([coverage-inventory.md](coverage-inventory.md), "The public
batteries, accounted"). The 90-step scenario battery does the same for
verdicts: of 88 public steps, 84 match, 3 are declared and 1 is open, with 2
withheld.

The deeper evidence is named but is explicitly **not** public: the production-deck
runs used a copy of a real deck that is not redistributed, and the pod round-trip tests skip unless
`PODS_SRC_DECK` / `PODS_BASE_DECK` name a private oracle deck. They "announce
their skip loudly; none of their results are in the public package."

The distinction the critique drew — a data import is not a compatibility
migration — is exactly the distinction this repository draws, and the
import recipe states its own limits in a compatibility matrix rather than in
prose. Migration delivery is incomplete, and what it does and does not cover is
stated in the recipe and in [docs/operations.md](operations.md).

## 13. "The live shadow comparison idea is excellent — but difficult"

> Ruby and TypeScript can't safely execute every request independently. …
> Therefore shadowing is easiest for GET, read-only CQL, rendering.

**Accepted and implemented with writes disabled by default.**
[docs/SECURITY.md](SECURITY.md) "Shadow routing never runs a write twice" is the
whole answer, and it begins from the critique's own mechanism: "The two engines
share the deck, so copying a write would run it twice: two sets of rows and
history, two emails, two uploads."

The default and the shipped policy (`tools/shadow/routes.shadow.json`): only
`GET` and `HEAD` are copied; every other method goes to Ruby alone and is logged
as `write-not-shadowed`. Comparing writes requires opting into an isolated
upstream that snapshots the deck into a scratch directory, applies replayed
writes to the snapshot only, drops mail, stores uploads in scratch, blocks
outbound network calls, and refuses to start if the isolated upstream is the
Ruby or the decko-ts read upstream. That is a stricter version of the
critique's suggested `Ruby authoritative transaction → event log → TS replay`
chain: this repository does not replay writes at all by default.

## 14. "The proposal completely underestimates Mods"

> What percentage of existing public/private Decko Mods will continue to work
> without modification? … This should be a headline number.

**Answered in points 2 and 3 of the critique — see point 2 above.** The headline
number is 33 mods scanned, 29 declared-complete, 2 partial, 0 missing, 2
ignored, with the declaration-level caveat stated in the same document
([tools/compat-report/mod-compat-report.md](../tools/compat-report/mod-compat-report.md))
and the "0% of Ruby mods run unchanged" boundary stated in
[decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md).

## 15. "'The same Decko system' is therefore not accurate"

> The proposal seems to call it A [hosting modernization] while actually
> proposing C [new implementation].

**Accepted. The repository consistently calls itself C and does not claim A.**
[docs/SECURITY.md](SECURITY.md) opens with the honest formulation: "a port of
Ruby Decko … Its acceptance criterion is exact parity with Ruby Decko in
rendering, persistence, semantics and side effects, **including Ruby's
defects**, so that an existing deck behaves the same on either engine — except
where a difference is declared below." Reproducing observable behaviour is the
claim; being the same system is not, and the six approved divergences are the
explicit list of where behaviour deliberately differs.

No hosting-modernization claim is made either: the performance evidence is
round trips per render ([scaling-comparison-deep-nesting.md](scaling-comparison-deep-nesting.md)),
not a claim about how a Ruby deck would be deployed better.

## 16. "TypeScript itself isn't the reason this becomes fast"

> If you rewrote the renderer in Ruby and implemented `prefetch_nests()`, you
> could potentially eliminate the same N+1 behavior.

**Accepted, and demonstrated rather than argued.** This is point 3 above: the
deep-nesting comparison runs Ruby with nest prefetch as a measured column, and
on a 201-card fan the Ruby-optimized engine reaches the same 5 round trips as the
TypeScript engine. The TypeScript engine's own claim is narrower: its cost
"tracks the shape of the inclusion tree rather than the size of the deck"
([parity-method.md](parity-method.md), "Performance measurement").

## 17. "There is another big Cloudflare problem: 10 ms CPU"

> A complicated operation involving CQL → permission evaluation → rule lookup →
> card loading → recursive nesting → view selection → rendering could exceed
> 10 ms CPU surprisingly easily. This should be benchmarked against realistic
> Decko pages.

**Not met in this release.** No CPU-time measurement against Cloudflare's
Workers Free limit is committed anywhere in this repository, and the repository
says so rather than implying one exists: "This repository contains no cost
measurements and no energy measurements for any deployment topology"
([docs/deploy-cloudflare.md](deploy-cloudflare.md)). The published,
reproducible performance evidence is round trips per render, and
[coverage-inventory.md](coverage-inventory.md) records "Faster responses at the
edge" as **not established**: "No speed run is recorded against a release
candidate, and no response-time comparison is committed evidence anywhere in this
repository."

The measurement work is not done, and the budgets that stand in for it are
named as unmeasured in the deploy docs. What the
repository does
publish on the measurement-infrastructure side is the budget harness — warm
per-entry render time, worst-case pathological content, statement count on a
warm render, and how many cards remain cold after prewarming — explicitly "not
part of the default test run and not a parity oracle."

## 18. "'Faster response at the edge' isn't automatic either"

> If the Worker runs in Frankfurt but the database is elsewhere … And dynamic
> Decko pages are not automatically cacheable because permissions and
> personalization matter.

**Accepted; the claim was withdrawn as stated in point 17.** No
response-time comparison is committed evidence anywhere in this repository, and
"the published, reproducible comparison is round trips per render"
([coverage-inventory.md](coverage-inventory.md)).

The permission/personalization half of the objection has a concrete answer in
the design: the engine's request-local state and sign-in-per-request model
([decisions/0002](decisions/0002-request-local-state-and-one-trip-rendering.md))
means a rendered page is a function of the actor, which is exactly why the
comparisons are per-actor rather than one cached page. The reference harness
specifies per-actor page and view renders as a distinct comparison class
([reference-harness/SPEC.md](../reference-harness/SPEC.md), the kinds table).

## 19. "The proposal's cost table needs to separate fixed and variable cost"

> "$0 provider invoice under certain usage limits" is not "$0 total cost of
> ownership."

**Accepted.** The repository publishes no cost table. It publishes the absence of
cost data as a fact, in both deploy documents, and points any bill estimate at
the provider's own dated published rates rather than at a number in the repo
([docs/deploy-cloudflare.md](deploy-cloudflare.md), "Costs and energy";
[docs/deploy-bunny.md](deploy-bunny.md)). The Bunny document is explicit that
its own dated walkthrough "is not included in this repository; what a real
deployment invoices depends on its request volume, CPU time per request and
database usage, and no per-request time figure in that walkthrough is a
measurement."

## 20. "What I think is genuinely compelling" — the eight items to keep

Answering each against what shipped:

1. **Separate semantic model from runtime** — shipped. The view registry is a
   flat name→function record built at module load, and the decision record is
   explicit that it is *not* Ruby's per-set dispatch and that `ARCHITECTURE.md`
   previously claimed otherwise ([decisions/0008](decisions/0008-view-registry-and-directory-layout.md)).
2. **TypeScript implementation behind the same behavioural contract** —
   shipped, and the contract is the acceptance criterion
   ([decisions/0001](decisions/0001-byte-parity-against-ruby-oracle.md)).
3. **Ruby as reference implementation initially** — shipped, and still the
   oracle: card 1.110.0, decko 0.20.0, Ruby 3.3 ([parity-method.md](parity-method.md),
   "The Ruby oracle").
4. **Differential testing** — shipped, and it is the whole instrument:
   1,752 render operations and 2,388 semantics operations in the committed
   `synthetic-v1` fixture's op files, plus 16 scenarios of 22
   steps, plus three committed batteries
   that account for every step they run. The grader's own tallies are one step
   higher in each of the first two (1,754 and 2,389) because it also grades
   the scenario steps whose op is `render` and `ask`; both numbers are right
   and the counting rule is in
   ([coverage-inventory.md](coverage-inventory.md), "Why two counts of the
   same fixture").
5. **Optimise nesting independently** — shipped, with Ruby optimized as a
   measured column (point 3).
6. **Database/blob interfaces designed around semantics** — shipped
   ([decisions/0003](decisions/0003-edge-native-driver-interfaces.md)).
7. **PostgreSQL first** — **not adopted.** The opposite decision was taken and
   is on the record: PostgreSQL support was removed as unverified rather than
   shipped on assertion ([decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md)),
   with the migration matrix marking the source **no**. The reasoning
   the critique offers — "the easiest existing-data-stays-put story" — is
   correct and is the reason it is queued rather than dismissed.
8. **Add D1 later, once the engine is PostgreSQL-independent** — partly adopted,
   with the caveat the critique did not anticipate: D1 arrived first, and it
   arrived with a transaction contract of its own (a compensating journal, not
   `BEGIN`/`COMMIT`) and an intermediate-visibility window that keeps
   write-enabled D1 at evaluation/single-user grade
   ([decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md);
   [docs/SECURITY.md](SECURITY.md), "Migration compatibility at a glance").

## 21. "What I'd demand before approving the proposal" — the seven gates

Gate by gate, against this repository:

- **Gate 1 — Inventory. Partial.** [coverage-inventory.md](coverage-inventory.md)
  classifies every parity domain by what is measured, names the instrument,
  names the headline figure, and then has a dedicated section titled "What the
  public package does NOT measure" with six numbered gaps and where each
  closes. Partial because that section's gaps sit inside the domains the
  inventory claims to classify: four of its six items are missing evidence for
  a domain the same document reports a figure for — browser journeys and jobs
  under rendering and semantics, hosted-database writes under persistence,
  arbitrary mods under side effects.
- **Gate 2 — PostgreSQL compatibility.** **Not met in this release.** There is no
  PostgreSQL adapter in the tree; the support was removed as unverified
  ([decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md)).
  Not started.
- **Gate 3 — Differential test suite. Partial.** Three kinds over one
  committed fixture, plus three public batteries that account for every step
  ([coverage-inventory.md](coverage-inventory.md)). Partial because the
  browser journeys the gate's "run the real user paths" half needs exist only
  as data: 51 journeys are defined and **no journey comparison run is
  committed** (item 1), so nothing in this repository has diffed what a
  browser session sees against Ruby's.
- **Gate 4 — Nesting benchmark.** Met, with the matrix the gate asks for —
  depth 1, 2, 4, 8, 10, 16, 20 and breadth 1-200, plus whole trees — and with
  Ruby's four arms including the optimized one
  ([scaling-comparison-deep-nesting.md](scaling-comparison-deep-nesting.md)).
- **Gate 5 — Mod compatibility. Partial.** The headline number is there (33
  mods scanned, 29 declared-complete, 2 partial, 0 missing, 2 ignored) with
  the declaration-level caveat attached to the number itself
  ([tools/compat-report/mod-compat-report.md](../tools/compat-report/mod-compat-report.md)).
  Partial because the number measures declarations only: no event hook is
  exercised, no non-HTML format is rendered, and **0% of existing Ruby mods
  run unchanged**, which is the figure the gate actually asked for and the
  only honest answer available ([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md)).
- **Gate 6 — Cloudflare prototype.** **Not met in this release.** No p50/p95,
  cold-start, CPU, D1-rows or cost measurement is committed
  ([docs/deploy-cloudflare.md](deploy-cloudflare.md), "Costs and energy").
  Not started.
- **Gate 7 — Migration promise after the above.** Met in the negative: the
  migration promise is withdrawn rather than made
  ([coverage-inventory.md](coverage-inventory.md)).

## The closing request: a repo-level architecture assessment mapping `card/`, `decko/`, `mod/`, `support/` into "must port / can replace / can leave behind / major unknown"

**Answered, in a different and more checkable form than the critique asked for.**
A one-time mapping is a snapshot; the repository's answer is an instrument that
regenerates the equivalent every time, plus an architecture map.

- [ARCHITECTURE.md](../ARCHITECTURE.md) is the area-level map, and
  the decision records under docs/decisions/ holds the behaviour-level records. Decision 0008 is
  precisely the kind of correction this request was reaching for: it retires two
  claims the repository used to make about itself (per-set view dispatch, and a
  source directory that mirrors Ruby's) after checking them, because "a reader
  forming an expectation from either one would draw a wrong conclusion about what
  a passing figure covers."
- [tools/compat-report/mod-compat-report.md](../tools/compat-report/mod-compat-report.md)
  is a generator over every installed mod's `set/` and `lib/` trees, producing a
  per-mod verdict. Its own Method section states the thresholds and, at the end,
  what no label measures.
- A working evidence table, maintained outside this repository, is a
  statement-level table where each contract ID maps to one row carrying Ruby
  truth (file and line), TypeScript evidence (test file and status), and a
  status of **proven**, **pinned-synthetic**, **divergent-documented** or
  **unported** — which is the "major unknown" category the critique raised,
  given a name and a definition.
- [KNOWN_FAILURES.md](../KNOWN_FAILURES.md) records the suites that fail on a
  clean clone, one row per suite with the failing assertion names and the
  prerequisite to green, so a red run is read correctly rather than excused.

---

## What is still open, in one list

So no reader has to infer it from the answers above:

| # | Unmet | Where it is recorded |
| --- | --- | --- |
| 1 | Browser journey comparisons — 51 defined, none run | `docs/coverage-inventory.md` item 1 |
| 2 | Hosted-database write evidence — nothing run against a hosted service | `docs/coverage-inventory.md` item 3; [0007](decisions/0007-atomic-saves-and-transaction-contract.md) |
| 3 | Arbitrary/existing Ruby mods — 0% execute unchanged | `docs/coverage-inventory.md` item 4; [0004](decisions/0004-mods-compiled-into-the-view-registry.md) |
| 4 | Jobs — delayed_job unported, nothing measured | `docs/coverage-inventory.md` item 5 |
| 5 | PostgreSQL adapter — removed as unverified | `tools/migrate/IMPORT_DECK_RECIPE.md`; [0007](decisions/0007-atomic-saves-and-transaction-contract.md) |
| 6 | Response-time and CPU/cost measurements | `docs/coverage-inventory.md`; `docs/deploy-cloudflare.md` |
| 7 | The suites that fail on a clean clone | `KNOWN_FAILURES.md`, each row names its prerequisite |

Each row says where the gap is recorded; none of them is scheduled work this
repository promises.

Every claim in this document is answerable against
[docs/coverage-inventory.md](coverage-inventory.md). Where a figure appears
here, its instrument and scope are named with it, because that is the standard
this repository holds itself to ([parity-method.md](parity-method.md)).