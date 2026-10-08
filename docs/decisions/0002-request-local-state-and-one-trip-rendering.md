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

**Nothing that depends on deck content is kept between requests.** Within one
request, a row store holds what that request has fetched. It answers a later
statement from those rows only when it can prove they are the complete result;
otherwise the statement goes to storage. The guarantee is tested directly:
permission verdicts, rule resolutions and search results must not carry over
from one request to the next.

Warm performance therefore comes from *within* a request rather than across
them. The engine computes the rows a page needs — its closure — before
rendering, and fetches them in a few batched statements. That is the
performance path, and it is explicitly not a semantic one: the page must be
byte-identical with and without it, and the tests compare both.

The closure payload is optional and off by default. When armed it is an
optimization layered on the unchanged path, and every failure mode falls back
to that path rather than failing the request. It is computed ahead of time into
a derived store, never during a render.

**Freshness is keyed on content, not on time.** A counter maintained by
database triggers on the card and reference tables is read at boot and
compared; a version that has moved re-reads. There is no time window anywhere
in that path, so cache validity is a fact about the storage layer's write
history rather than a guess about elapsed time.

## Consequences

A warm engine re-renders a page at zero round trips within a request, and a
cold isolate pays the closure fetch once. Cross-request warmth is possible only
for content that does not depend on deck state — compiled assets, for example.

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