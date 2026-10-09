# One-key provisioning: a deck on Bunny with one pasted API key

For hosts that have no deploy-button flow, Bunny first. You make your choices
in a browser page, the page writes them into a provisioning payload, and one
command with one Bunny API key creates the deck on Bunny Edge Scripting and
Bunny Database. The payload and the result file the run writes are the deck's
recovery record.

## The pieces

| File | What it is |
|---|---|
| `one-key-provisioning-page.html` | The page. One file, no build step, no network calls. It collects the deck file, names, regions and edge options, hashes the deck in the browser, shows the validated payload, downloads it, and prints the run lines. It has no API-key field: the key never touches the browser. |
| `provision-bunny-deck.mjs` | The runner. Plan by default (no network); `--verify` (read-only); `--execute` (the real run, gated by `--i-understand-this-writes-to-my-bunny-account`); `--teardown` (gated by `--yes` and the exact `--name`). |
| `provision-bunny-deck.d.mts` | Type declarations for the tests. |
| `provision-bunny-deck-help.txt` | The runner's `--help` text. |

Tests: `tests/deploy/one-key-provisioning-payload.test.ts`, with synthetic
API-shape fixtures under `tests/deploy/fixtures/one-key-provisioning/`. None of
them contacts Bunny. They cover the payload schema and every refusal, the plan,
the API client against a local server, and the database half of a run: the
same code `--execute` uses builds a deck on a local libSQL-protocol server, and
the engine renders it.

## The flow

```
browser: open one-key-provisioning-page.html
         -> pick the deck sqlite file (name, size and sha256 recorded)
         -> choose names, regions and edge options (validated as you type)
         -> download the payload JSON (for example my-decko-payload.json)

terminal, from the repository root:
  node deploy/provisioning/provision-bunny-deck.mjs \
       --payload my-decko-payload.json --source <deck.sqlite3>
  # PLAN: validates and prints every step. No network, no key.

  node deploy/provisioning/provision-bunny-deck.mjs \
       --payload my-decko-payload.json --source <deck.sqlite3> \
       --creds bunny-creds.txt \
       --execute --i-understand-this-writes-to-my-bunny-account
  # The real run. bunny-creds.txt is a KEY=VALUE file holding
  # BUNNY_API_KEY=... (a Bunny account API key). Prints the deck's URL and
  # writes my-decko-payload.result.json.

  node deploy/provisioning/provision-bunny-deck.mjs \
       --payload my-decko-payload.json --creds bunny-creds.txt --verify
  # any time later: read-only check that the deck is live

  node deploy/provisioning/provision-bunny-deck.mjs \
       --payload my-decko-payload.json --creds bunny-creds.txt \
       --teardown --yes --name my-decko
  # deletes exactly what the run created (ids from the result file)
```

## What a run does

1. Lists the account's scripts and databases and stops if a name is taken.
2. Creates the database group, the database and a database token (generated
   by the API, never printed or stored by the runner).
3. Builds the schema from `deploy/migrations`, leaving out the demo-content
   migrations (their names contain `-demo-`): first every table and index,
   then the seed from the deck file through `scripts/import-to-bunny-db.mjs
   --data-only`, then the data-version triggers and stamp row the render path
   requires. The triggers come last so they do not fire once per seeded row.
   Session rows in the source are not copied.
4. Builds the engine bundle (or takes `--bundle`), creates the edge script
   with its linked pull zone, stores the database credentials as script
   secrets and the edge options as script variables, turns SmartCache off
   when caching is on, and publishes.
5. Polls `/_status` until the deck answers, then writes the result file.

Until the edge script exists, a failure deletes the group and database the
run created, so a failed run leaves the account as it found it.

## The payload is the recovery record

`decko-one-key-provisioning-payload/1` records the provider, the deck's
identity (name, sha256, size), every resource name, regions, the token shape
and every edge option, and no secrets. `--execute` writes
`<payload>.result.json` beside it with the script, zone, database and group
ids, the hostname, and the bundle and source hashes. Together they
re-provision the deck with a fresh API key.

## Refusals (exit 2, with a `--`-marked reason)

- A name that already exists on the account (script or database).
- A protected name: any name in `DECKO_PROTECTED_RESOURCE_NAMES`
  (comma-separated) or given with `--protect`, in any mode, teardown
  included. Use it to keep existing decks out of the runner's reach.
- A database slug over 16 characters: Bunny's create endpoint answers HTTP 500
  past that length.
- `--execute` without the written confirmation flag, which exits before any
  network call; `--teardown` without `--yes` and the exact name.
- A payload that arms the write path without `--allow-write-path`: the
  one-key path provisions a read-only deck.

## The API calls

| Call | Use |
|---|---|
| `GET /compute/script`, `GET /database/v1/databases` | name checks (the v2 database list requires a `page` parameter) |
| `POST /database/v1/groups` | the database group (the response nests the group under `group`) |
| `POST /database/v1/databases` | the database, retried three times on HTTP 500 |
| `PUT /database/v2/databases/{id}/auth/generate` | the database token |
| `POST https://<database>/v2/pipeline` | schema, seed and triggers (Hrana v2 over HTTP) |
| `POST /compute/script` | the edge script with a linked pull zone (`ScriptType` 1) |
| `POST /compute/script/{id}/secrets`, `.../variables/add` | credentials and edge options |
| `POST /pullzone/{id}` | SmartCache off (it rewrites responses as no-cache) |
| `POST /compute/script/{id}/publish` | publish |
| `DELETE /compute/script/{id}`, `/database/v1/databases/{id}`, `/database/v1/groups/{id}` | teardown |

## Known caveats, measured during development

- `DefaultHostname` sometimes arrives with its scheme; the runner normalizes it.
- A deleted pull zone's name stays reserved for a while, so creating a script
  under the same name soon after a teardown fails.
- Bunny's SQL API does not accept `ANALYZE`.
- Databases created through the API answered single queries in 350–680 ms,
  against 34–81 ms for a database created in the dashboard on the same plan.
  The cause is unknown. A page render makes many queries, so on a slow
  database a cold render can exceed the edge's time budget. The deck is live
  and `/_status` answers either way.
