# Edge-native SQL and blob driver interfaces

## Context

The engine has to run on at least three storages: a local SQLite file for
development and tests, Cloudflare D1 for one edge platform, and a libSQL
server reached over HTTP for another. Each has its own client library, its own
error shapes and its own quirks.

The obvious shape — import the vendor client where you need it — puts a
provider SDK into the engine's module graph. That has three costs: the engine
can no longer run anywhere the SDK does not exist (which is most edge
runtimes, where a Node-oriented package may not load at all), any provider
quirk becomes an `if` in engine code, and the set of behaviours the engine
actually depends on stops being written down anywhere.

There is a second cost specific to this port. The acceptance criterion is byte
parity, so "the same query behaves the same on every provider" is not a
convenience — it is the measurement being valid only if the providers agree.

## Decision

The engine talks to storage through two interfaces and never imports a vendor
SDK.

**SQL.** `query` and `batch`, plus a result shape carrying rows, rows affected
and an optional last-inserted identifier. Adapters exist for D1, libSQL over
HTTP and local SQLite. The interface is small and frozen; other code in the
engine is written against it.

**Blob storage.** Put, get, streamed bytes, head, delete and list, over
POSIX-style keys validated in one place — so path traversal is impossible by
construction rather than by each adapter remembering to check. Adapters exist
for memory, the filesystem, object storage and Bunny Storage. The filesystem
adapter uses the layout the Ruby deck itself writes, so an existing deck's
files directory is readable without conversion.

Provider differences are written down rather than smoothed away. The table of
them is part of the SQL adapter's documentation and includes the ones that
matter: how each provider binds an integer, whether a batch is transactional,
what a blob comes back as, and what happens when a parameter is rejected.
Every adapter passes one shared conformance suite, and a second suite pins the
adapters to *each other* over a fixed transcript — so two adapters cannot
drift apart while each still passes its own suite.

The engine-layer rule that follows: rely on values, never on storage classes
or `typeof`, and normalise the last-inserted identifier before comparing it.

## Consequences

Adding a provider means writing one adapter and running it through the shared
suite. It does not mean touching the engine, and it cannot introduce a
provider branch into render code.

Some provider capabilities genuinely differ and cannot be abstracted away.
libSQL's HTTP batch is not transactional — the protocol executes each statement
with autocommit — while the local and D1 batches are. Where the engine ever
needs atomic multi-statement writes over that provider, atomicity belongs at
the engine layer as explicit statements, and the difference is a documented
decision rather than an accident.

Where a provider refuses something the engine would otherwise do — a parameter
type, a statement shape, a function — the refusal is surfaced as an error, not
worked around silently in engine code. The one exception is where a workaround
can be shown to preserve meaning exactly, as with D1's limits (see
[deploy-cloudflare.md](../deploy-cloudflare.md)); those workarounds live in the
adapter and are tested for equivalence against the form they replace.