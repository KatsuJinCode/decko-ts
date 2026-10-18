# Live-host transport design for the owner save — what is packable, measured (2026-10-18)

Extends `docs/reports/save-server-time-budget-2026-10-18.md` §2 ("the live
leg: diagnosed to per-save round trips; needs an operator decision"). That
report established the shape of the problem and stopped: its own conclusion
was that "batching the save path's read ladder the way the render path
already batches, or a live-host transport improvement" are both
deploy-scale work. This document is the design half — measured on a captured
statement ladder, with the honest floor stated, and **nothing deployed**.

Design only. No engine source was changed. The two new/extended tools are
diagnostics; the receipts are JSON captures of a local run.

---

## 0. Receipts — what was run, and what it produced

| # | command | artifact | sha256 |
|---|---------|----------|--------|
| R1 | `node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-diagnosis-transport-design-20261018.json` | ladder, no result capture | `tmp/` (gitignored); `e071ad965dc6b4a1d42fa6f46b5fbd09f7c8767ba31be4acec14aa7c28a9512b` |
| R2 | `node tools/diagnose-owner-save-statement-ladder.mjs --capture-results --out tmp/save-ladder-value-flow-20261018.json` | ladder + per-statement results + event-loop tick | `docs/reports/receipts/save-ladder-value-flow-capture-20261018.json`, `71d5bc478c1473ab6d3efa54901f46783ff169352337c8221ee443df8f6305cd` |
| R3 | `node tools/simulate-save-transport-packing.mjs --capture tmp/save-ladder-value-flow-20261018.json --out tmp/save-transport-packing-simulation-20261018.json` | packing simulation over R2 | `docs/reports/receipts/save-transport-packing-simulation-20261018.json`, `cfdb0c2ed4f3d70411f0c68f6b9fc5c8b1ebd54e1789650b7856436f148143ce` |
| R4 | `node tools/diagnose-owner-save-statement-ladder.mjs --out tmp/save-ladder-plainpath-recheck-20261018.json` | plain-path regression re-run of R1's shape | `tmp/` (gitignored) |

R2's capture, verbatim from the receipt: source commit `108783f8`, engine
bundle SHA256 `1387e384f4ebb0f6…`, save segment **526 pipeline POSTs, 593
statements, 526 distinct event-loop ticks, statement-execution wall 603 ms,
db wall 1,070 ms** (534 reads, 59 writes, 54 distinct SQL shapes).

**Two provenance facts, both load-bearing.**

*Read R2 with its tree attached.* The ladder is a property of a tree, not a
constant: R1 (commit `c677c1dc`, nine minutes earlier) captured **691 POSTs /
758 statements** for the same save, the difference concentrated in reads
(`SELECT * FROM cards WHERE id = ?` 259 → 161, `SELECT codename FROM cards
WHERE id = ?` 92 → 32). Between them a sibling lane landed commit `108783f8`
and the working tree carried another lane's then-uncommitted
`src/card/drivers/bunny-db.ts` (since committed as `cff0c8d9`) at
bundle-build time. Every number below is a property of **bundle
`1387e384f4ebb0f6`**, and the design's conclusions are stated so they survive
a ladder of a different size.

*R4 proves the capture changed nothing.* R4 runs the plain path (no
`--capture-results`) on a **different** tree — commit `cff0c8d9`, bundle
`ef919abc16a34935…` — and answers **526 POSTs / 593 statements / 526 ticks**,
identical to R2, while R1 on the earlier tree answered 691/758. So the
instrument's new flag and its always-on tick recorder do not move the ladder,
and the ladder held steady across two different bundles while it had moved
22% across the two commits before them. (Statement-execution wall differs
between runs — 496 ms (R4) vs 603 ms (R2) — because sibling lanes were
running the same instrument against the same machine during both; wall is a
load-sensitive measurement here, round-trip counts are not.)

*One cross-check worth recording.* `cff0c8d9` — the commit R4 ran on — is the
sibling lane's **"round 1 of the save path's read ladder: memoize
constant-id reads inside one save transaction"**. R4 therefore measures that
memo as it stands: the save is still **526 POSTs / 593 statements**, i.e. the
memo, on this deck and this save, has moved the round-trip count by **zero**.
That is consistent with §4's finding that most of the 496 read barriers are
hot-id re-reads a transaction-wide memo is expected to catch — and equally
consistent with the memo's own invalidation being wide enough to drop them
all. Which of those it is was not determined here, because reading and
evaluating that implementation is the sibling lane's work, not this design's
(§5).

---

## 1. Mechanism: what the live wall is actually made of

The save's cost on a remote host is `round_trips x round_trip_cost +
statement_execution`, and this tree already says so in the driver's own
header (`src/card/drivers/bunny-db.ts:47-49, 316-318`): "on the live host
every POST is a real network round trip, so wall = hops x hop latency".

Two corrections to the premise this design inherits, both measured:

**(a) The ~13 ms/hop figure is not a measured hop latency.** The number the
time-budget report multiplies by round trips comes from the live run's own
`Server-Timing` header: `db;dur=4,809;stmt=367`
(`decko-ts-turn-on-editing/docs/runs/edge-signed-in-exercise-live-4f2c817d-2026-10-16.md:97`).
4,809 / 367 = **13.10 ms per statement** — an average that contains SQLite
execution, not only transport. The other 13-15 ms in the corpus is a
different measurement entirely: one 1-statement pipeline POST through
Node's global `fetch` dispatcher on loopback, which the transport shim's own
header calls out as a nondeterministic local-instrument artifact, ~0.4 ms
with a keep-alive agent on the same box
(`tools/edge-signed-in-exercise/lib/deterministic-loopback-fetch.mjs:12-21`).
Projecting `round_trips x 13 ms` therefore charges the transport for work the
database does. This design separates the two terms and adds the **measured**
statement-execution wall (603 ms on R2's capture) instead of assuming it
away.

**(b) "The live host" is not one shape; this repo has three, and they batch
differently.**

| shape | driver | one statement costs | a batch costs | where it runs |
|-------|--------|----------------------|---------------|---------------|
| Bunny Database over HTTP | `BunnyDbDriver` (`src/card/drivers/bunny-db.ts`) | one `POST /v2/pipeline` | **one POST** with N executes (`:557`), stream baton across batches | the live edge deck (`deploy/bunny-worker-src/bunny-edge-deck-config.ts:115`) |
| libSQL/Turso over HTTP | `LibSqlHttpAdapter` (`src/server/drivers/libsql-http.ts`) | one POST | **one POST** with N executes (`:127-138`) | the local harness (`local-hrana`) |
| Cloudflare D1 binding | `CloudflareD1Adapter` (`src/server/drivers/d1.ts`) | one `env.DB.batch([stmt])` | one `env.DB.batch([…])`, sequential (`:308-322`) | the Workers+D1 deploy (`wrangler.toml`, `src/server/cloudflare-write-routes.ts:691`) |

All three already have a batch that puts N statements on one round trip
(`bunny-db.ts:557`, `libsql-http.ts:127`, `d1.ts:308`; the Bunny and libSQL
drivers run a save's batch on the transaction's open stream, baton carried
between POSTs — `bunny-db.ts:389-398`, `libsql-http.ts:140-180`). The save
pays N round trips because **the engine asks for one statement at a time** —
not because any transport lacks a batch. That reframes the ask: the work is
in the engine's *issue pattern*, and the transport difference is in what a
batch is *allowed to contain*.

---

## 2. Question 1 — can the 691 (here: 526) pipeline POSTs be packed into fewer round trips on the Workers/D1 shape?

### 2.1 What the documented limits allow (cited)

Cloudflare's published limits, read through the search gateway
(2026-10-18; the Workers limits page reports itself last updated 2026-10-12):

| documented limit | Free | Paid | source |
|---|---|---|---|
| Subrequests per Worker invocation | 50 | 10,000 default (configurable to 10,000,000) | developers.cloudflare.com/workers/platform/limits/ |
| Subrequests to internal Cloudflare services | 1,000 | 10,000 default | same |
| CPU time per HTTP request | 10 ms | 30 s (max 5 min) | same |
| D1 "queries per Worker invocation" | 50 | 1,000 | developers.cloudflare.com/d1/platform/limits/ |
| Max bound parameters per query | 100 | 100 | same |
| Max SQL statement length | 100,000 bytes | 100,000 bytes | same |
| Max SQL query duration (applies to the whole batch call) | 30 s | 30 s | same |

`batch()` semantics as documented: statements execute **sequentially, not
concurrently**; "Batched statements are SQL transactions"; the per-statement
parameter and length limits apply per statement inside the batch.

Two readings the pages leave open, stated as open rather than resolved:
whether N statements in one `batch()` count as N against the "queries per
Worker invocation" row (the D1 FAQ's own framing — "use `batch()` to send
multiple statements in a single request, so that the per-request overhead is
paid once for the whole batch" — implies per-request accounting, but the
limits page does not say so in those words), and that **no documented
numeric maximum exists for the length of a batch**.

What the limits mean for the save, measured against R2:

- **On a Free-plan Workers host, the save cannot run as it stands.** 526
  POSTs is 10.5x the 50-subrequest free ceiling (and the whole run's 568
  POSTs is worse). This is not a performance ceiling, it is a hard refusal.
- On Paid, 526 POSTs consumes 5.3% of the 10,000 subrequest budget; the
  D1-shaped design's 207 batch calls would consume 2.1%.
- Payload size is a non-issue: the largest packed batch in the simulation is
  **2,722 bytes** (hrana) / 2,294 bytes (D1 shape), against a 100 KB
  per-statement limit that the largest single statement here never approaches.
- The one hard per-statement constraint the ladder could hit is the 100
  bound-parameter limit; the widest statement in the capture binds **16**
  (`INSERT INTO card_references (referer_id, referee_key, referee_id,
  ref_type) VALUES (?, ?, ?, ?)`), i.e. 16% of the limit.

### 2.2 What the D1 driver itself says a batch may contain

The port's own D1 adapter states the constraint in its own words
(`src/server/drivers/d1.ts:191-194`):

> "D1 has no interactive transaction (BEGIN is refused; only a batch is
> atomic, and **a batch cannot read its own writes and branch**). A save
> reads between writes, so transaction() is compensating…"

That sentence is the whole D1 answer. The save's ladder is precisely
"read between writes": each `INSERT INTO cards` is followed by statements
that consume the new rowid. On D1, a write and the read-back that consumes
its result **cannot share a batch**; on the Bunny/libSQL shapes they can,
because a batch runs in order on the save's open stream
(`src/server/drivers/libsql-http.ts:36-45, 379-420`).

### 2.3 The measured packing (R3 over R2)

Packing rule: greedy, in order, never violating the value dependency (§4) and
never exceeding the cap. `hrana`/`bunny` shape = order-preserving batches
allowed to straddle writes; `d1` shape = additionally breaks before any read
that would observe a write already in the batch, and before a write-back.

| option | statements | round trips | max batch | wall @5 ms/hop | wall @13 ms/hop |
|---|---|---|---|---|---|
| **today** (one statement per POST) | 593 | **526** | 1 | 3,233 ms | 7,441 ms |
| **A. hrana/bunny batch, cap 32** | 593 | **175** | 25 | 1,478 ms | 2,878 ms |
| **B. D1 batch, cap 32** | 593 | **207** | 25 | 1,638 ms | 3,294 ms |
| **C. A + table-scoped read memo** | 540 | 155 | — | 1,378 ms | 2,618 ms |
| **D. A + row-scoped read memo** | 480 | **142** | — | 1,313 ms | 2,449 ms |
| **E. B + row-scoped read memo** | 480 | 173 | — | 1,468 ms | 2,852 ms |
| **F. C on the D1 shape** (table-scoped memo) | 540 | 186 | — | 1,533 ms | 3,021 ms |

Every wall column is `round_trips x hop + the measured 603 ms
statement-execution wall` from R2. The memo rows are an independent
simulation of a lever a sibling lane is implementing concurrently (§5).

Two facts from the cap sweep (`--caps 8,16,32,64,100,128,256,100000`):
**the cap stops mattering above 32** (round trips are 175 at every cap from 32
to unbounded), and the median batch is 2 statements. Packing is not
size-limited; it is dependency-limited.

So the answer to question 1: **yes, the POSTs pack — 526 → 175 (Bunny/libSQL
shape) or → 207 (D1 shape), a 3.0x / 2.5x reduction, with no documented
limit anywhere near binding** — and the packable unit is not "a batch of N",
it is "a maximal run of statements no one of which binds a value produced
inside it" (median 2, longest 25).

---

## 3. Question 2 — can the read ladder ride one batched endpoint the way the render path's ring store does?

**No — not by the mechanism the ring store actually uses.** This is the
sharpest measured finding in the document.

`LiveStoreDriver` gets 102 statements onto 12 POSTs with two mechanisms
(`src/card/live/live-store-driver.ts:1-20, 508-525`):

1. **tick coalescing** — "every read that misses within the same macrotask
   (concurrent branches of the render) joins ONE round trip", flushed on
   `setImmediate`;
2. **speculative ring prefetch** — statements the render cannot yet name are
   answered from a ring of rows already read.

The save's ladder has **nothing for mechanism 1 to coalesce**. R2 records the
event-loop turn of every pipeline POST: the save's 526 POSTs land on **526
distinct ticks, maximum 1 POST per turn**. The engine awaits every single
statement's answer before issuing the next. A DataLoader-style endpoint
placed on the save path would coalesce exactly **zero** statements — not
"few", zero — because no two statements are ever in flight together.

That is also why the save cannot borrow the ring store directly: the store
is read-only by construction (`live-store-driver.ts:481-485` — "Writes never
reach this driver: the request path that uses it serves anonymous GET pages
only" — it throws on a non-read statement).

**What does transfer is mechanism 2, speculation**, and the measured basis
for it is the ladder's shape: the save walks N subcards through an
*identical* ~25-statement block, each block re-reading the same constant ids
before it touches the card it is about. The longest run the simulation finds
is exactly **25 statements** — one subcard's block — and its members are the
ones whose arguments were already known before the previous block resolved.
That is a ring, in the render path's sense: block k+1's constant reads are
computable from rows block k already returned.

### The endpoint contract, sketched against the captured sequence

The wire already exists on two of the three shapes; what is missing is an
engine-side admission rule. On the Bunny/libSQL shapes it is the hrana
pipeline POST the drivers already speak (`libsql-http.ts:11-33, 240-260`):

    POST {db}/v2/pipeline
    Authorization: Bearer <token>
    {"baton": "<from the previous POST>",            // only while a stream is open
     "requests": [
       {"type": "execute", "stmt": {"sql": "SELECT * FROM cards WHERE id = ?",
                                     "args": [{"type":"integer","value":"4"}],
                                     "want_rows": true}},
       ... up to N executes, in ladder order ...
     ]}

    200 {"baton": "<next>",
         "results": [ {"type":"ok","response":{"type":"execute","result":{
                        "cols":[…], "rows":[[…]], "affected_row_count":0}}}, … ]}

On the D1 shape the same contract is expressed in-process, not over HTTP
(`src/server/drivers/d1.ts:308-322`): one `env.DB.batch([fence, …stmts,
clearLeaseAssertStatement()])`, results index-aligned to the input, plus the
rule from §2.2 — a write and a read that consumes its result are in
different batches.

Admission rule the driver must implement (this is the design's core):

    a statement joins the open batch iff
      1. it binds no value produced inside the open batch (the §4 test), and
      2. (D1 shape) it neither reads a table written in the open batch nor
         consumes a write's result, and
      3. the batch is within the cap (statements and bytes).

Speculation source: when a card block's write completes, the driver queues
that block's *constant-id* read run (the ids are a property of the deck, not
of the previous result) as the next batch, so it rides one round trip instead
of 25. On a speculative miss the driver falls back to the blocking path —
the same "spec"/"block" fallback the ring store already implements
(`live-store-driver.ts:443-450`).

---

## 4. Question 3 — the honest floor

Measured over R2's 593 statements, using **value flow, not SQL shape**: a
statement is a barrier iff one of its bound arguments is a value some earlier
statement produced (a row cell, or an insert's rowid).

| barrier class | count | irreducible? |
|---|---|---|
| consumes a **write**'s result (a new rowid) | **26** | yes — the id does not exist before the insert |
| consumes a **read**'s result | **496** | partly — see below |
| statements that observe their own write **inside their SQL** (`INSERT … VALUES ((SELECT MAX(id) …))`, `SELECT last_insert_rowid()`) | 17 | no on hrana/bunny (ordered batch computes it in place); **yes on D1** |
| statements with no value dependency | 71 | packable |

The 496 read barriers are not all real dependencies, and the capture says so:
what they bind is a short list of hot ids — `4` ×33, `393` ×30, `439` ×18,
`26026` ×16, `2259` ×16, `3` ×14, `274` ×13, `53055` ×9. Read against the
deck (`deck.sqlite3`, ids resolved by query this session), those are the
Person type card (`id=4`, codename `user`), the owner's actor card
(`id=393`, `Brandon WilliamsCraig`), the RichText type card (`id=3`), the
`*all` card (`id=274`), and four saved subcards (`439`, `2259`, `26026`,
`53055`): values a save can hold without asking. The value-flow test cannot
tell "learned from that row" from "already knew it, and it also appeared in
that row", so **496 is an upper bound on the barrier set and 175 a lower
bound on the round trips** — the truth is between, and the exact number needs
the engine's call graph, not a better capture.

What is honestly irreducible on the Bunny/libSQL shape:

1. **26 write-result barriers.** Each new card's rowid must exist before the
   statements that bind it can be sent. (A `WITH ins AS (INSERT … RETURNING
   id)` rewrite would move several of these inside SQL — the simulation does
   not claim that; it is engine work, not transport work.)
2. **One round trip per genuinely needed read dependency.** If every one of
   the 496 read barriers were real, the floor would be ~522 round trips and
   transport packing would buy almost nothing. If none were (every hot id was
   already known), the floor would be ~26. The measured truth is 175 — the
   packing result — and it sits well inside that band because most read
   dependencies are real but cluster: a handful of *runs* of statements share
   one producer, and each run collapses into one batch. **The floor is
   "one round trip per real dependency run", and the capture bounds that run
   count between 26 and 522 with a measured 175.**

And the floor that no transport change moves at all: **the ladder's 593
statements each cost their execution time** — 603 ms measured here, ~557-787 ms
across the three captures of this date. At 175 round trips even a free hop
leaves the save above half a second; at 526 it is the hop count that decides.

---

## 5. What this design therefore recommends (and what it does not)

**Recommended, in order of cost-to-benefit:**

1. **Do not build a new endpoint.** All three drivers already batch
   (`bunny-db.ts:557`, `libsql-http.ts:127`, `d1.ts:308`). The missing piece is
   an engine-side admission rule (§3), not wire.
2. **Ship the admission rule with speculation, not coalescing.** Coalescing is
   measured worthless on this path (0 statements); speculation is what turns
   the 25-statement block from 25 round trips into 1. Expected: **526 → ~175
   round trips (hrana/bunny shape), ~207 on the D1 shape**, wall at 5 ms/hop
   from 3,233 ms to 1,478 ms, at 13 ms/hop from 7,441 ms to 2,878 ms — with
   the statement-execution wall (603 ms, unchanged) as the new floor.
3. **On a D1 deployment, size the save against the documented per-invocation
   query budget before shipping.** 593 statements per save sits under the
   Paid row (1,000) with little room for a busier card, and over the Free row
   (50) by an order of magnitude. If D1's query accounting turns out to be
   per-statement rather than per-batch, this option is dead on arrival and the
   answer is the Bunny-shaped path instead — **that question is unresolved
   and is the first thing to settle.**

**Explicitly out of scope here:** the transaction-scoped read memo (options
C-F: 526 → 142 round trips on the hrana shape / 173 on the D1 shape, −113
statements under a row-scoped invalidation rule). A sibling lane is building
it — commit `cff0c8d9`, "round 1 of the save path's read ladder: memoize
constant-id reads inside one save transaction" — and this document takes no
credit for it and no position on its correctness; options C-F are an
independent simulation, not an evaluation of that implementation. The one
thing measured about it is in §0: as of `cff0c8d9` the save still costs 526
round trips, so whatever ships next has to do better than "round 1" did to
move the number this design is about.

## 6. What was not done

- **Nothing was deployed and nothing was pushed.** No production host was
  contacted; no Cloudflare account was touched; the Free-vs-Paid subrequest
  refusal is derived from published limits, not observed.
- **No engine source changed.** The two tools are diagnostics
  (`tools/diagnose-owner-save-statement-ladder.mjs` gained an opt-in
  `--capture-results` flag and event-loop-tick recording; R4 re-ran the plain
  path and reproduced the capture's ladder exactly;
  `tools/simulate-save-transport-packing.mjs` is new and consumes a capture).
- **Sibling lanes were running the same instrument against the same machine
  throughout** (two other `diagnose-owner-save-statement-ladder.mjs`
  processes — PID 39216 writing `tmp/save-ladder-R1.json`, PID 6268 writing
  `tmp/save-ladder-R1b.json` — alongside a concurrent uncommitted
  `src/card/drivers/bunny-db.ts`). Nothing of theirs was touched or killed.
  The consequence is wall-time noise, not shape noise — R2 and R4 agree on
  526 POSTs / 593 statements across different bundles.
- **The production hop cost is still unmeasured.** Nothing in this repository
  measures a real Cloudflare-edge-to-database round trip. The 5 ms/13 ms
  columns are *projections at a stated multiplier*, not observations, and the
  13 ms column inherits the §1(a) error if used as a pure transport cost.
- **The exact barrier count between 26 and 522 is not resolved** (§4); that
  needs the engine's call graph.
- **Whether D1 counts a batch as one query or N is not resolved** (§2.1); the
  published pages do not say.
- **`last_insert_rowid()` inside a packed hrana/bunny batch is assumed, not
  verified**: the 17 SQL-internal write-backs are counted as free on that
  shape because a batch runs in order on one connection. A one-line probe
  (`BEGIN; INSERT …; SELECT last_insert_rowid()` in one pipeline, compared
  against the same three statements in three pipelines) would settle it, and
  the design should not ship without it.