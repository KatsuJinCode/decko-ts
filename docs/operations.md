# Operations

How to run the engine locally, how to read what it is doing, and what to do
when something is wrong.

Deployment is covered separately: [deploy-bunny.md](deploy-bunny.md) and
[deploy-cloudflare.md](deploy-cloudflare.md).

---

## Local development

```bash
npm install
npm run typecheck
npm test
```

`npm test` runs the engine suite. The full tree runs with `npx vitest run`.
See [TESTING.md](TESTING.md) for what the suite needs and how skips behave.

The engine talks to storage only through its driver interfaces, so the same
code runs against a local SQLite file, D1 and libSQL. Nothing branches on the
provider.

**A native dependency.** The test harness uses a SQLite driver that ships
prebuilt binaries for common platforms. Where none matches, installation
compiles it and needs a C++ toolchain; installing with scripts skipped and
copying a prebuilt binary works too.

### The staging server

`vm-staging-server.mjs` at the repository root serves the engine over HTTP from a deck on
disk, so a page can be opened in a browser and clicked through. It serves
read-only browse plus a slice of the write path: the sign-in surface, the
session it issues, sign-out, the password-reset flow, and the account edit
route those flows land on. It does not serve card editing or search.

Routes mirror the edge surface: the home page, a card page by name, a card
record as JSON, file bytes for a card's attachments, the status endpoint, and
the sign-in and reset routes.

It reads its configuration from environment variables. Names only, no values:

| Variable | What it does |
| --- | --- |
| `DECKO_WRITE_PATH` | Arms the write path. |
| `DECKO_FIRST_RUN` | Arms the first-run setup surface. |
| `DECKO_SETUP_TOKEN` | An operator-chosen token `/setup` accepts. When unset, the Node server generates one at start and prints it to its console. A deploy-issued token (`npm run setup-token`) is accepted as well. |
| `DECKO_COOKIE_SECURE` | `auto` (default: `Secure` on the session cookie when the client used https), `always`, or `never` for local http development. |
| `DECKO_SIGNIN_THROTTLE`, `DECKO_SIGNIN_*`, `DECKO_SESSION_REVOCATION` | Sign-in hardening; see `docs/SECURITY.md`, divergence 4. |
| `DECKO_ORIGIN` | Public origin used when building absolute links, for example reset tokens. |
| `DECKO_TOKEN_SECRET` | Secret for signing session and reset tokens. A random one is generated when unset, which invalidates existing sessions on restart. |
| `DECKO_CSRF_SECRET` | Secret for form CSRF tokens. |
| `DECKO_FILES_DIR` | Directory the file routes read from. |
| `COMPILED_ASSETS_DIR` | Directory compiled assets are read from. |
| `DECKO_MAIL_CAPTURE` | Captures outgoing mail in-process instead of sending it, and exposes a route to read the capture. |
| `DECKO_SHADOW_VIEW_LANE` | Selects a shadow view lane for comparative rendering. |
| `DECKO_RECAPTCHA_SITE_KEY`, `DECKO_RECAPTCHA_*` | Captcha configuration. |

### The fresh-deck profile

`DECKO_WRITE_PATH=1` together with `DECKO_FIRST_RUN=1` is the fresh-deck
profile. Neither is useful alone: the setup surface without the write path
renders a form whose submission cannot succeed, and the write path without
the setup surface enables writes on a deck with no way to create its first
account.

The profile does not seed an account system, and it changes no rendered byte
when the first-run variable is unset — there is no route, no view, no card.
The setup surface needs the account card shape to create into; a deck without
it answers that it has no account system, which is the correct answer rather
than a failure. The staging server is the host that can reach the journey end
to end today, because it is the host that carries the write path, the session
store and the auth layer.

The setup window closes by itself once the deck has a user account, so it
cannot be re-armed on a deck that already has owners.

---

## Reading what a request did

### Server-Timing

Every edge response carries a `Server-Timing` header, always on and not
switchable. Standard tooling reads it without configuration.

| Field | Meaning |
| --- | --- |
| `auth` | Session resolution: the cookie scan, plus the session lookup query when a cookie was presented. Near zero without a cookie. |
| `seat` | The prepared-page cache layer outside the render: the script-side cache lookup, the global render-cache lookup, and their write-through stores. Computed as serve-layer wall minus render wall, which is sound in a single-threaded isolate. |
| `db` | Aggregate wall across the request's database round trips, with `stmt` counting the statements that reached the wire. |
| `render` | The render closure, including every database hop inside it. |
| `total` | The whole request. |

`db` **overlaps** the other phases by design: the session lookup, the cache
lookups and the render ladder all hit the same database. `db` answers "how
much of this request was database"; the other phases answer "where in the
pipeline it went".

`stmt` counts real wire statements only. Reads answered from a replayed plan
are zero-round-trip by design and are honestly absent from the count.

Response serialization is inside the render closure rather than a separate
phase: giving it its own boundary would need a body read that costs real
milliseconds on every response.

The header is best-effort. A runtime that refuses to set an immutable header
gets the response anyway rather than an error — a profiling label must never
turn a served page into a failure.

### The isolate probe

`DECKO_EDGE_ISOLATE_PROBE` arms measurement-only routes that report
module-ready and per-request timing, and tag responses with an isolate header.
They answer nothing while the variable is unset. Use them to tell "the script
is loading" apart from "the request is slow".

### Metrics

The Cloudflare deployment records per-request and isolate-aggregate counters
with wall-time histograms, exposed at `GET /__metrics` and summarized on each
response in a compact metrics header. Four honest limits shape what those
numbers mean:

- **CPU equals wall.** The Workers runtime exposes no in-process CPU clock, so
  the CPU figure is the wall figure and is labelled as equivalent rather than
  presented as a measurement.
- **Rows read are unknowable from outside.** Where the runtime surfaces them
  they are used; where it does not, a `SELECT` reports zero and an estimate
  is flagged as inexact. The engine never invents a number silently.
- **Memory is unavailable.** The available heap cannot be measured on this
  runtime, so the field reports unavailability with a reason rather than a
  fabricated figure.
- **Isolates are ephemeral.** A warm isolate can serve many requests; a cold
  one starts over. The aggregate carries a start timestamp so a reader knows
  what window it covers.

---

## Freshness

`deck_data_version` is a counter the storage layer maintains. Triggers on the
card and reference tables bump it on every insert, update and delete, so any
committed write moves it regardless of which process, connection or code path
issued that write.

The engine reads it and uses it in two places. The boot cache holds the
result sets every render needs; an engine whose version matches the bundle's
installs those rows through the same parsers a live result would go through
and issues none of the statements. The one-trip payload reads it in the same
round trip as the payload and recomputes when it has moved.

**This is a content version, not a time window.** Cache validity is a fact
about the storage layer's write history rather than a guess about elapsed
time, and there is no time-based expiry anywhere in that path. That is what
makes a stale render impossible rather than merely unlikely.

Two deliberate loud failures back it up. A database with no data-version table
raises rather than rendering, because a skipped check is a silent staleness
window and the whole safety argument rests on the check running. And a version
without its originating connection cannot be trusted, because two databases in
one process can both start at a small integer — so a boot bundle records which
connection read it.

**What the stamp covers, and where not to over-read it.** The six triggers
fire on `cards` and `card_references` only (`db/schema.sqlite.sql`, the
`[ENGINE-FRESHNESS]` block), on any update to those rows and not only the
columns the caches are built from — so a content edit is covered, and
`tests/deploy/no-caching-synthetic.test.ts` proves it by writing `db_content`
between two renders and reading the change back (that suite: 6 of 6 passing).
Three surfaces sit outside the stamp, and
[decisions/0002](decisions/0002-request-local-state-and-one-trip-rendering.md)
("What the stamp does not cover") is the authoritative list: a write confined
to an uncovered table (the residual case is a `card_actions`-only mutation
that is a save's last write), a database imported without the triggers, which
is silently unguarded and green in every check this repository ships, and the
platform response caches `DECKO_EDGE_CACHE` / `DECKO_EDGE_GLOBAL_CACHE`. The
engine refusing to boot when the triggers are absent is a **planned** remedy,
recorded in that decision and not yet implemented, so today the guarantee holds
on a deck whose migration chain has been applied in full.

The render path is also not the only reader. The API routes call
`RenderEngine#ensureFreshness` themselves before fetching
(`deploy/worker.ts:519` for the card-record JSON, `:587` for csv/rss, `:644`
before the CQL query's permission filter; `deploy/bunny-worker-src/
bunny-edge-engine-request.ts:444`, `:466`, `:518` on the Bunny host), because
they judge permissions against the same memoized readable-rule state. That
call is the route's obligation, not the engine's: a route added without it
filters by the pre-revocation rule set.

---

## Caches and how to invalidate them

There are four caches, with different invalidation stories.

**Boot result-set cache.** In-process, keyed on the content version and the
connection. It invalidates itself: a version mismatch re-reads. There is
nothing to purge.

**Temporary row cache.** In-process, bounded by a key cap. Exceeding the cap
resets it wholesale. When the one-trip payload is armed the cap is raised at
boot, because seating a page writes thousands of keys and a mid-session reset
would evict primed state.

**Response cache headers.** Emitted by the edge when the cache flag is armed;
the shared-cache lifetime is set by a variable. Invalidation is a full-zone
purge through the CDN provider's purge API. The lifetime is the backstop for
anything a purge does not cover.

**Script-side and global render caches.** Keyed on a cache epoch variable.
Bumping the epoch invalidates both without a provider call, which is the
cheapest correct move when the content is known to have changed. Signed-in
requests bypass every tier in both directions, so one viewer's rendered HTML
can never be served to another.

The procedure for a content change on a read-only deployment: bump the cache
epoch. On a deployment with writes, the write moves the content version, which
the boot cache and the one-trip payload both observe.

---

## Rotating database credentials

The procedure, in order:

1. Provision the replacement credential pair in the database provider.
2. Set the replacement variables on each edge script — both members of the
   pair, since a half-set pair is an error rather than a fallback.
3. Confirm the new pair is accepted: the status endpoint reports which
   credential pair it is actually using, by name.
4. Retire the old credential in the provider.

Two properties make step 3 meaningful and step 4 safe to do last. The status
endpoint reports variable **names**, never values, so a verification step
cannot leak the credential it is verifying. And the read-only bundle and the
full bundle are separate scripts with separate configuration, so a
credential can be rolled to one before the other — do the full bundle first,
confirm, then the read-only bundle.

Credential values are read from a credentials store, never committed, and are
masked in every log line.

---

## Troubleshooting

**A page renders but slowly, and only for signed-in requests.** Signed-in
requests bypass the prepared-page caches and run the full statement ladder.
Read the `Server-Timing` header on a signed-in request and an anonymous one
and compare `seat` and `db`: the gap is the cache the signed-in path is
skipping.

**Many database trips on one page.** `X-Decko-Db-Trips` counts trips and
`Server-Timing`'s `stmt` counts statements. Divide `db` duration by trips for
cost per trip. A high trip count with a low statement count means the batching
is not firing.

**The one-trip payload seems inert.** Check that the gate variable is exactly
`1`, that the store variable is set, and that the store is reachable from the
host. A missing store logs one warning and disables the payload rather than
failing requests. On an edge host the store must be materialized into the
serving database; there is no filesystem to attach.

**`nest depth exceeded`.** This is parity, not a defect. Ruby refuses at the
same depth, and the refusal is intentional in both. The chain's root renders
at depth zero, so a page that reports an exceeded depth is nested deeper than
Ruby would render.

**`no such function: REGEXP` on a CQL `match` query.** `match` compiles to a
regular-expression predicate that executes in the database server. Edge drivers
cannot register functions, so the query fails loudly rather than returning
nothing. See the CQL decision record in [decisions/README.md](decisions/README.md) for the local
path, which does support it.

**A composite card fails to resolve during a content inclusion.** Deep
junction references have a known limit in the render prefetcher: a reference
whose sides are themselves compound may not be found by the batched walk. A
simple-name inclusion chain is unaffected at any depth the deck exercises, and
fetching a compound name by URL is unaffected.

**A suite silently did not run.** The test output ends with a "Not run" list
naming each skipped suite and the gate it needed. A line there means the suite
did not execute; it is not a pass. See [TESTING.md](TESTING.md).

**A key was seeded by hand and lookups miss.** Keys are normalised, and a
trailing plural stem is singularised: a name written as plural stores a
singular key. A hand-written seed that stores the display form rather than the
canonical key will not be found. The seed generator derives keys mechanically
and refuses plural-stem names rather than emitting a broken seed.

**Two SQLite databases are being confused in one process.** Boot bundles are
keyed on the content version *and* the connection it was read through, because
the version alone is a per-database counter and two databases can both start
at a small integer.