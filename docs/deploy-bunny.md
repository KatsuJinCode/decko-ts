# Deploying on Bunny

Bunny Edge Scripting runs a script per request on cache miss; the script talks
to Bunny Database (libSQL) over its HTTP interface. This document covers the
bundles, the configuration the script reads, the caching switches, the
write-surface gate and the status endpoints.

The deployment footprint is two things: an Edge Scripting script and a
Bunny Database database. No object storage, no queues, no cron triggers. An
origin server is optional and is used when the deployment needs writes or a
signed-in session.

---

## The two bundles

`tools/bundle-bunny-edge-engine.mjs` builds both scripts in one pass. Each
entry produces a bundle and a request payload wrapping that bundle's text.

| Entry point | Bundle | What it is |
| --- | --- | --- |
| `deploy/bunny-worker-src/bunny-edge-engine-entry.ts` | `deploy/dist/bunny-edge-engine.bundle.js` | The full engine: render and fetch engines over the libSQL driver, the layout shell, and the write surface when it is armed. |
| `deploy/bunny-worker-src/bunny-edge-read-entry.ts` | `deploy/dist/bunny-edge-read.bundle.js` | The read-only engine: anonymous `GET` and `HEAD` only. |

The bundler targets a neutral platform and emits ESM at an ES2022 target with
minification. External dependencies are the platform's own scripting SDK and
the Node built-ins. After the build it fails if the SDK's bare import has
disappeared, refuses any surviving bare package import, and prints the set of
`node:` built-ins the bundle still retains — that list is the boot-risk
inventory, since a retained Node built-in is a module the edge runtime cannot
load.

**Why two bundles.** The platform runs a script only when the cache misses,
so a fresh isolate pays the whole bundle load. The read-only bundle carries
none of the write-path code, which anonymous reads cannot reach, so a read-only
traffic pattern loads roughly a third less code on every cold isolate. The two
bundles share the same engine and the same driver; they differ in the surface
they mount.

### Read-only routing

The read-only script serves anonymous `GET` and `HEAD` and forwards
everything else to the full script. Specifically it forwards:

- every method other than `GET` and `HEAD`;
- any request carrying a session cookie;
- the sign-in, sign-out and first-run setup routes, at any method.

It also rewrites a redirect that names the full script's host back to the host
the request arrived on, so the two scripts are indistinguishable to a browser
sitting in front of them.

---

## Configuration

Configuration is by environment variable name on the script. Values are set
on the script; nothing here is a secret in the repository.

### Database credentials

`deploy/bunny-worker-src/bunny-edge-deck-config.ts` defines the credential
variable names and the order they are tried in. The first pair where both
members are present and non-empty wins; a pair where only one member is set
is an error rather than a silent fallback. A `libsql://` scheme is rewritten
to `https://`.

| First | Second |
| --- | --- |
| `DECKO_DB_URL` | `DECKO_DB_TOKEN` |
| `BUNNY_DATABASE_URL` | `BUNNY_DATABASE_AUTH_TOKEN` |
| `BUNNY_DB_URL` | `BUNNY_DB_TOKEN` |

Where the script runs on a binding rather than plain variables, the status
endpoint reports a binding instead of variable names.

### Gates and switches

| Variable | Effect |
| --- | --- |
| `DECKO_WRITE_PATH` | Arms the write surface. See below. |
| `DECKO_FIRST_RUN` | Arms the first-run setup surface. |
| `DECKO_EDGE_CACHE` | Arms the response cache headers. |
| `DECKO_EDGE_CACHE_TTL` | Shared-cache lifetime in seconds. Overrides the default when a positive integer. |
| `DECKO_EDGE_CACHE_EPOCH` | The cache epoch value. Changing it invalidates both script-side and global cache tiers. |
| `DECKO_EDGE_GLOBAL_CACHE` | Arms the third cache tier, which stores rendered HTML in the database. |
| `DECKO_EDGE_FULL_URL` | Where the read-only script forwards the requests it does not serve. |
| `DECKO_EDGE_ISOLATE_PROBE` | Arms the measurement probe routes. |
| `DECKO_EDGE_NAME_SCAN` | Primes the lexicon across the whole deck at boot rather than on demand. |
| `DECKO_EDGE_RENDER_BUDGET_MS` | Per-render budget in milliseconds. |
| `DECKO_EDGE_PIPELINE_TIMEOUT_MS` | Per-pipeline database request timeout. |
| `DECKO_LIVE_RENDER` | Arms the live render path. |
| `DECKO_ONE_TRIP` | Arms the one-trip payload. See below. |
| `DECKO_ONE_TRIP_STORE` | Path to the derived store, or the inline sentinel. |
| `SPACES_ASSET_HOST` | Host for compiled assets. |

The origin server has its own set, including the files directory, the token
secret, and a mail capture switch. See
[operations.md](operations.md) for what each of those does.

---

## The write surface gate

`DECKO_WRITE_PATH` set to exactly `1` arms writes; any other value, including
unset, leaves the deployment read-only. The check is a single environment read
and a boolean, so an unarmed script does not boot the deck and issues no
query.

Request dispatch is, in order:

1. the status endpoint, answered ahead of everything else;
2. sign-out, mounted above the write surface and ungated — the route matcher
   would otherwise claim a bare `POST /_signout` as a card creation;
3. the write surface, when the gate is armed or the request is not a read
   verb;
4. for any other non-read request on a read-only deployment, a `403` naming
   the deployment as read-only;
5. the session-aware, cache-wrapped engine path.

`DECKO_FIRST_RUN` arms the setup surface separately. Both together form the
fresh-deck profile: the setup surface without the write path renders a form
whose submission cannot succeed, and the write path without the setup surface
enables writes on a deck with no way to create its first account. See
[operations.md](operations.md) for what that profile does and does not cover.

---

## Caching

Three tiers sit behind one flag.

**Response headers.** `DECKO_EDGE_CACHE` arms them. Responses are classified as
cacheable HTML, cacheable JSON, or uncacheable, and cacheable responses carry
`public, max-age=0, s-maxage=<ttl>`. The status endpoints and any non-200
response are uncacheable; card API responses are cacheable JSON.

**Script-side content cache.** Rendered content cached through the platform's
own cache API, keyed by the cache epoch from `DECKO_EDGE_CACHE_EPOCH`.

**Global render cache.** `DECKO_EDGE_GLOBAL_CACHE` arms a store of rendered
HTML in the database itself, using the same epoch value. Lookups are bounded
in time; writes are write-through, and clearing the previous epoch happens in
the same request. Any error degrades to a plain render rather than failing the
request.

Signed-in requests bypass every tier in both directions, so one viewer's
rendered HTML can never be served to another.

**Invalidating.** There is no invalidation endpoint. The primary mechanism is a
full-zone purge through the CDN provider's purge API; the shared-cache lifetime
is the backstop for content the purge does not cover. The cache epoch exists
for the script-side tiers, so bumping `DECKO_EDGE_CACHE_EPOCH` invalidates both
without a provider call. See [operations.md](operations.md) for the procedure.

---

## Status endpoints

| Route | Response |
| --- | --- |
| `GET /_status` | Engine, runtime, database health and card count, the credential **variable names** in use (never their values), and which of the credential pairs supplied them, or a binding name where the deployment uses one. `500` when credentials are missing, `503` when the database is unreachable. |
| `GET /api/status` | Lighter status: engine, runtime and a notes list. |
| `/_probe/cpu`, `/_probe/db` | Measurement probes. Answer only when `DECKO_EDGE_ISOLATE_PROBE` is armed. |

Every response carries a `Server-Timing` header; see
[operations.md](operations.md) for what its fields measure.

---

## The one-trip payload

`DECKO_ONE_TRIP` set to exactly `1` arms the payload, which computes the rows
a page needs and seats them so the render makes one round trip instead of one
per nest level. Any other value, including unset, is the default, and the
default path is unchanged.

`DECKO_ONE_TRIP_STORE` names the derived store. It is required when the gate
is armed; without it the payload is inert and logs one warning. It may also
be set to an inline sentinel, which means the derived tables have been
materialized into the serving database itself rather than attached from a
side file — the edge posture, since an edge isolate has no filesystem path to
attach.

**The boot requirement.** When the gate is armed, the deck boot must raise the
temporary-cache key threshold from its default to 200,000. Seating a page
writes roughly three and a half thousand keys; at the default cap a multi-page
session crosses the threshold mid-session and the wholesale reset evicts
primed state. The threshold is raised only when the gate is armed, so an
unarmed boot is unchanged.

**How it fails.** Every failure mode falls back to the unchanged path. A
missing store file, a store that cannot be attached, or a page whose closure
cannot be described produces no seating rather than an error. Seating is
memoized per fetcher per page key before the attempt, so a page that fails to
seat stays failed for that engine until the freshness stamp moves. The
payload is an optimization and never a correctness dependency.

**Freshness.** `deck_data_version` is read in the same round trip as the
payload and compared against the last seen value; a mismatch recomputes before
seating. On a read-only deployment the derived store stays valid
indefinitely. On a deck that accepts writes, content changes make the store
stale for the affected pages, which costs a re-fetch and not wrong bytes. The
write-time invalidation protocol that would clear staleness eagerly is designed
and separately tested but is not wired into the write path.

---

## Deploying

1. Build both bundles and their request payloads with
   `tools/bundle-bunny-edge-engine.mjs`, checking the reported sizes against
   the script size limit and reading the retained `node:` built-in list.
2. Create the Bunny Database and set its URL and token on each script as the
   credential pair of your choice.
3. Apply the schema and the deck you intend to serve. Migrations live under
   `deploy/migrations/`.
4. Create the scripts and upload each payload to its script endpoint.
5. Set the gates you want: the write path and first-run variables only for a
   deployment that serves writes, the cache variables only for a deployment
   that wants them.
6. Check `GET /_status` on the deployed host and confirm the card count is the
   one you seeded.

An origin server, if you need one, is under `deploy/bunny-origin/`: the
server script, an nginx configuration, a Caddy configuration and a systemd
unit.