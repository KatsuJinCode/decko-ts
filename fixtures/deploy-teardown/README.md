# Cloudflare API response shapes for the one-click teardown

What these files are: **the response shapes the one-click teardown parses**,
recorded so `tests/deploy/one-click-teardown.test.ts` can drive the whole
plan/destroy path with **zero network and zero subprocesses**.

Where they came from, per file (see each file's `_provenance` key):

- **Cloudflare API reference pages**, fetched 2026-10-01. Every field name,
  type and envelope below is transcribed from the reference's own schema block.
  This is where the shapes are authoritative.
- **The installed wrangler 4.135.0** for the *endpoint paths* (which request a
  given response comes from), not for the field names.

What they are NOT: **captures from a live Cloudflare account.** No live account
call was made to produce them — this lane holds no account credential, and the
lane's binding constraint is zero Cloudflare writes of any kind. The
*identifiers* inside (uuids, service ids, timestamps, the account id) are
**synthetic**: plausible-shaped values that exercise the parsers, not values
read off anyone's account. A fixture that claimed to be a real capture would be
a lie the next reader would act on.

`scriptName`/`accountId` placeholders used across the fixtures:
`0a1b2c3d4e5f60718293a4b5c6d7e8f9` is a syntactically valid account id and
belongs to nobody; `decko-one-click-demo` / `decko-one-click-db` are the names
this repo's own one-click config declares
(`scripts/deploy/one-click-deck/wrangler.oneclick.toml:17,20`).

## The endpoints, and where each shape is cited from

| fixture file | endpoint | shape cited from |
| --- | --- | --- |
| `cloudflare-d1-database-list-response.json` | `GET /accounts/{account_id}/d1/database` | Cloudflare API reference, D1 `database` → list: `result: [{ created_at, jurisdiction, name, uuid, version }]`, envelope `success` + `result_info { count, page, per_page, total_count }` |
| `cloudflare-d1-database-list-name-mismatch-response.json` | same | same, one item whose `name` is a near-miss (`decko-one-click-db-2`) — the refusal fixture |
| `cloudflare-d1-database-list-duplicate-name-response.json` | same | same, two items sharing one exact `name` — the ambiguity fixture |
| `cloudflare-workers-service-get-response.json` | `GET /accounts/{account_id}/workers/services/{service_name}` | path + `default_environment` from the installed wrangler (`wrangler-dist/cli.js`, `resolveOwnerWorkerTag` reads `default_environment` off this exact path); envelope/fields from the Cloudflare Workers services reference |
| `cloudflare-workers-service-not-found-response.json` | same, HTTP 404 | Cloudflare's standard error envelope (`success: false`, `errors[].code/message`) |
| `cloudflare-workers-script-deployments-list-response.json` | `GET /accounts/{account_id}/workers/scripts/{script_name}/deployments` | Cloudflare API reference: `result: { deployments: [{ id, created_on, source, strategy, versions, annotations, author_email }] }`, envelope `success` + `result_info` |
| `cloudflare-d1-query-sqlite-master-response.json` | `POST /accounts/{account_id}/d1/database/{database_id}/query` | Cloudflare API reference: `result: [{ success, results: [...], meta: { rows_read, rows_written, ... } }]`. **Read-only in use**: the teardown only ever sends `SELECT ... FROM sqlite_master`. |
| `cloudflare-d1-query-error-response.json` | same, failing statement | same; the shape a `success: false` inner statement returns |

## Regenerating / re-checking a shape

If a fixture and the reference ever disagree, the **reference wins** and the
fixture is the bug. Re-check by fetching the reference page named in the table
above and diffing the field list against the file's `result` keys. There is no
capture script here on purpose: the honest way to refresh these is to re-read
the reference, not to re-run against an account.
