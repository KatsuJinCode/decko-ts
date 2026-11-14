# Request-local state and one-trip rendering

## Context

Ruby Decko renders a page by asking the database for each card as it needs it.
On a local database that is fine. On an edge database, where a query is a
network round trip to a provider several hundred milliseconds away, a page
with fifty nested cards issues fifty round trips and stops being a page.

Two things were tempting to fix that together. The first is caching state
across requests, which is what makes a warm engine fast. The second is
batching the fetches a single render needs.

The first is a correctness hazard rather than only a performance one. Ruby's
permission verdicts, rule resolutions and search results are all functions of
deck content. Anything cached across requests can be stale the moment a write
lands, and a stale permission verdict is a data leak, not a slow page.

## Decision

**A long-lived engine keeps state between requests, and a stamp is what makes
that safe.** This decision originally said two incompatible things — first that
what a request may serve is decided inside that request, then that a warm
engine keeps fetched rows between requests. Both describe the same engine; only
the second is what it does, and the stamp is what makes it correct. The
honest statement has three parts.

**1. What a request may serve is decided inside that request, for anything
derived from the deck.** Within one request, a row store holds what that
request has fetched. It answers a later statement from those rows only when it
can prove they are the complete result; otherwise the statement goes to
storage.

**2. The engines that serve `/:card/:view` paths and signed-in actors are
long-lived, and they do keep state across requests**: fetched card rows, the
name lexicon, and resolved rules. That retained state is what makes a warm
render cheap, and it is the reason the guarantee cannot be stated as "nothing
outlives the request".

**3. Freshness is keyed on content, not on time.** A counter maintained by
database triggers on the card and reference tables is read once per render
request; when it has moved, the engine drops everything it retained. There is
no time window anywhere in that path, so cache validity is a fact about the
storage layer's write history rather than a guess about elapsed time.

**This is a tested claim, not an intended one.**
`tests/deploy/no-caching-synthetic.test.ts` makes each change through a
separate database connection, as another process's committed write would, and
renders again in the same process, so the engine is told nothing and whatever
it kept must notice by itself. It passes with the triggers installed, and it
carries its own **negative control**: with the stamp triggers dropped
(`DECKO_FRESHNESS_CONTROL=stamp-frozen`), the stamp stops moving and three of
its six cases fail — "a permission rule changed between two renders is followed
by the second, on every path", "a structure rule changed between two renders
is followed by the second, on every path", and "a search result added, then
removed, between renders is followed on every path". That the suite goes red
when the mechanism is removed is what makes its green result evidence.

**Separately from all of that, the page's fetches are batched.** The engine
computes the rows a page needs — its closure — before rendering, and fetches
them in a few batched statements, so a warm render costs its within-request
round trips and a cold one pays the closure fetch once. That is the
performance path, and it is explicitly not a semantic one: the page must be
byte-identical with and without it, and the tests compare both. The closure
payload is optional and off by default; when armed it is an optimization
layered on the unchanged path, every failure mode falls back to that path
rather than failing the request, and it is computed ahead of time into a
derived store, never during a render.

## What the stamp does not cover

The stamp is a mechanism with edges, and a reader deciding what a passing grade
covers needs them. These are the unguarded surfaces, named rather than
implied:

1. **The triggers cover `cards` and `card_references` only.** A write to any
   other table does not move the counter. Most such writes ride inside a save
   that also writes one of the covered tables, so the counter moves with them;
   the residual gap is a `card_actions`-only mutation that is a save's last
   write, which leaves the conflict tracker's retained state stale. The
   migration enumerates the uncovered writes
   (`deploy/migrations/0003-deck-data-version-stamp.sql`, "SCOPE, AND WHAT A
   card_actions-ONLY WRITE DOES NOT BUMP").
2. **A deck imported without the triggers is silently unguarded.** The engine
   reads the stamp per render, and a database that has the `deck_data_version`
   table but not the six triggers that advance it returns a value no write ever
   changes. Nothing in the read path can tell that apart from a quiet deck, and
   nothing in the committed suite can tell either: the freshness test applies
   the stamp migration to its own copy before it starts, so a deployment
   missing the triggers is green in every check this repository ships.
3. **The platform response caches are outside the stamp entirely.**
   `DECKO_EDGE_CACHE` and `DECKO_EDGE_GLOBAL_CACHE` cache rendered responses,
   and the global one stores rendered HTML in the database. They are off by
   default and nothing in the engine's correctness argument rests on them, but
   arming either is a statement the operator makes about invalidation that this
   decision does not cover.

**Planned remedy: the engine should refuse to boot when the stamp's triggers
are missing**, rather than run with a freshness mechanism that cannot fire. A
boot-time check that the six triggers exist in `sqlite_master` turns surface 2
from a silent gap into a loud one, and it belongs here rather than in a comment
because the alternative is an engine that reports itself fresh while serving
pre-mutation bytes. Until it lands, the honest statement about any deployment
is: the guarantee holds on a deck whose migration chain has been applied in
full.

## Consequences

A warm engine re-renders a page at zero round trips within a request, and a
cold isolate pays the closure fetch once. Across requests, warmth is not
limited to deck-independent content — the long-lived engines deliberately keep
fetched rows, the lexicon and resolved rules, and the stamp is what decides
whether keeping them was allowed. What the stamp buys is the ability to keep
them without serving pre-mutation bytes; what it does not buy is a guarantee on
a deck whose triggers are missing, or on content the triggers do not cover.

A deployment that accepts writes needs a write-time invalidation protocol for
the derived store, because content changes make it stale for the affected
pages. That protocol is designed and tested but is not wired into the write
path. The interim behaviour is benign: a stale seated row costs a re-fetch,
not wrong bytes, because the render's own execution stays authoritative. That
is a deliberate, bounded gap rather than a hidden one.

Every armed feature has a boot requirement. The closure payload raises the
temporary row-cache cap at boot when it is armed, because seating a page
writes thousands of keys and a mid-session reset would evict primed state. An
unarmed boot is unchanged.