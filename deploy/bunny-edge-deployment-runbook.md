# Bunny Edge deployment runbook — decko-ts on a fresh Bunny account

**Status:** a from-scratch deployment guide. Every step below runs against a
bunny.net account you create for the purpose; no step touches an existing
deployment. The account you need is Bunny's free trial (§2), and the only
secret involved is that account's own API key.

**Target architecture:** Bunny Database (libSQL over HTTP) + a Bunny Edge
Scripting **Standalone** script acting as the pull-zone origin. No VM, no
origin server, no container.

Every bunny.net docs page cited here is named with its URL at each use.

---

## 0. What already exists in this repo

| Path | What it is |
|---|---|
| `deploy/bunny-worker-src/bunny-worker.ts` | the request handler: routes + minimal HTML/JSON card views. No side effects — importable by a test. |
| `deploy/bunny-worker-src/bunny-edge-entry.ts` | the module that is deployed. Calls `BunnySDK.net.http.serve(...)`. Importing it starts a server. |
| `tools/bundle-bunny-worker.mjs` | builds the deployable bundle: `deploy/dist/bunny-worker.bundle.js` + `deploy/dist/bunny-worker.code.json`. |
| `scripts/import-to-bunny-db.mjs` | seeds a Bunny Database over the libSQL `/v2/pipeline` HTTP API, with `--limit` for a small-scale seed. |
| `src/server/drivers/libsql-http.ts` | the engine-side Hrana-v2 driver (Node side). Not used by the edge script, which uses `@libsql/client/web`; it is the same wire protocol and is covered by its own mock-server tests. |

---

## 1. Pre-flight (no account needed)

```bash
npm run bundle:bunny-worker        # -> deploy/dist/bunny-worker.bundle.js  (~71 KB)
npx vitest run tests/deploy/bunny-edge-worker.test.ts    # 16 tests, mock DB, no network
npx tsc --noEmit                  # 0 errors
```

The bundle is one file with exactly two unresolved imports:
`@bunny.net/edgescript-sdk` and `node:process`. Both are resolved by the Bunny
runtime, not by your machine — see §2 step 5.

---

## 2. Create the script (dashboard, trial account)

Trial sign-up: <https://dash.bunny.net/auth/register>
(free trial, per <https://bunny.net/docs/scripting/github-integration.md>, "What
you'll need").

1. **Edge Platform > Scripting > Add Script.**
   Source: <https://bunny.net/docs/scripting/quickstart.md>, step 1.
2. **Deploy and edit on Bunny.net** (not GitHub — the GitHub path is §6).
   Source: <https://bunny.net/docs/scripting/github-integration.md>, step 3.
3. **Script Name:** `decko-trial`.
4. **Script type: Standalone**, template **Default standalone**.
   Sources: quickstart.md step 2; standalone/overview.md.
   (The API equivalent is `ScriptType: 1` — enum `["DNS","CDN","Middleware"]`
   = `[0,1,2]` in <https://bunny.net/docs/api-reference/scripting/openapi.json>
   `EdgeScriptTypes`. "CDN" is the standalone type; "Middleware" is NOT what
   this entry is.)
5. **Add Script.** A pull zone is created for you and the script is reachable
   at a unique `<name>-<hash>.bunny.run` hostname (quickstart.md step 3). The
   field is `DefaultHostname` on `EdgeScriptModel` / `LinkedPullZone` in the
   openapi document above. **Write that hostname down — that is the URL to
   hit.**
6. Open the editor, replace the placeholder with the contents of
   `deploy/dist/bunny-worker.bundle.js`, then **Save** and **Publish**
   (quickstart.md step 5). Published changes take effect immediately.
7. Before publishing, you can use the **preview pane** (bottom-left) and the
   **logs pane** (bottom-right) to run the script without publishing
   (quickstart.md step 3). `console.log` output lands in the logs pane.

---

## 3. Create the trial database and seed it small

1. In the dashboard sidebar click **Add > Database**, name it `decko-trial`,
   and pick a region mode. **Single region** is the cheapest and the most
   predictable for a trial.
   Source: <https://bunny.net/docs/database/quickstart.md>, steps 1–4.
2. On the database's **Access** page, generate a token. Choose **Full Access**
   (read/write) — the import writes; the edge script only needs read, but
   Bunny issues one token and simplicity wins at trial scale.
   Source: database/quickstart.md step 5; database/connect/authorization.md.
3. On that same page click **Add Secrets to Edge Script** and select
   `decko-trial`. Bunny writes the credentials into the script as environment
   variables. Source: database/connect/scripting.md steps 3–5.
4. **Names only — never values — and do not put them in this repo:**

   | Variable | Value |
   |---|---|
   | `BUNNY_DATABASE_URL` | the database URL Bunny injects |
   | `BUNNY_DATABASE_AUTH_TOKEN` | the access token Bunny injects |

   These are the exact names in database/connect/scripting.md's code sample.
   They are **not** the `BUNNY_DB_URL` / `BUNNY_DB_TOKEN` names this repo
   historically used; the handler accepts both, documented pair first, and
   `/_status` reports which pair it used by name. A name cannot be used as both
   a variable and a secret on one script
   (<https://bunny.net/docs/scripting/secrets.md>), so set only one pair.

5. Seed a SMALL subset (cost-watch order: small first):

   ```bash
   BUNNY_DB_URL='libsql://<id>-<db-name>.lite.bunnydb.net/' \
   BUNNY_DB_TOKEN='<token>' \
   node scripts/import-to-bunny-db.mjs --source <deck.sqlite> --limit 200 --tables cards,card_references
   ```

   Flags (all verified by a local dry run, §7):
   `--limit N` caps rows **per table**; `--tables a,b` restricts the table set;
   `--source PATH` names the source sqlite (required — there is no default);
   `--creds PATH` reads a
   KEY=VALUE file; `--chunk-size N` (max 500) rows per pipeline POST;
   `--schema-only` / `--data-only` / `--dry-run`.
   The endpoint is `<url>/v2/pipeline` with `Authorization: Bearer <token>` —
   <https://bunny.net/docs/database/connect/sql-api.md>.

   **Source file:** the import needs an explicit `--source` sqlite file with
   the deck schema (`cards` plus `card_references`, `auth_sessions`,
   `auth_migrations`, `meta`); the script has no default source path.

   **Credentials caveat:** the script reads credentials only from the
   environment or `--creds`. If you get no credentials, it exits 2 and
   says so. That is deliberate — a trial import must not be able to silently
   write to an account it was not pointed at.

6. Check the row landed: the database dashboard, or
   `GET https://<script-hostname>/_status` once published (§4).

---

## 3b. Configure the deck's served identity (empty by default)

The shipped edge code carries **no deck's identity**. Everything a
deployment serves that differs from a stock 0.20.0 deck — its footer version
string, its asset host, its compiled-CSS revision, its SRI hashes, its error
chrome's card ids and asset URLs, its phantom (unknown-item) type, its
engine-side origin (`deckOrigin` — Ruby's `Cardio.config.deck_origin`, the
prefix `card_url` puts on `decko.rootUrl` and the `:url` views; unset, the
engine renders Ruby's requestless relative form) — is
deployment configuration, read from the environment at boot
(`deploy/bunny-worker-src/bunny-edge-served-deltas.ts`).

**With nothing configured the deployment serves a stock deck:** no version
rewrite, no corpus card ids, no private asset references, and the error pages
fall back to their minimal stubs (the documented "never 500 a second time"
contract). That is the correct posture for any deployment that is not the
original reference deck, and it is what a new operator gets for free.

**To serve a deck's real identity instead of the stock bytes**, set one
loose variable per value — `DECKO_TIME_ZONE`, `DECKO_DECK_ORIGIN`,
`DECKO_SERVED_ASSET_HOST`,
`DECKO_SERVED_FOOTER_VERSION_PIN`, `DECKO_SERVED_STYLESHEET_FROM` /
`_TO`, `DECKO_SERVED_SCRIPT_INTEGRITY`, `DECKO_SERVED_NOT_FOUND_TYPE_ID` /
`_NAME` / `_CLASS_TOKEN`, `DECKO_SERVED_FOOTER_CARD_ID` / `_TYPE_ID` /
`_TYPE_NAME`, `DECKO_SERVED_ALL_CARD_ID` / `_LAYOUT_POINTER_ID` /
`_POINTER_TYPE_ID`, `DECKO_SERVED_MAIN_CSS_URL` / `_MAIN_JS_URL`,
`DECKO_SERVED_ROOT_URL`, `DECKO_SERVED_HEAD_SCRIPTS`,
`DECKO_SERVED_LOGO_URL` / `_FAVICON_URL` / `_SITE_TITLE_DEFAULT`,
`DECKO_SERVED_PHANTOM_TYPE_ID` / `_NAME` / `_KEY`.

**The loose form is the one to use on Bunny.** Bunny stores at most 2 KB per
script variable value (<https://bunny.net/docs/scripting/limits>, read
2026-10-14). A whole deck's identity packed into the one
`DECKO_SERVED_DELTAS` blob is 3.6 KB on a real deck: on 2026-10-14 a 3.6 KB
`DECKO_SERVED_DELTAS` made both scripts of a live deck answer HTTP 400 on
every request until it was deleted, while the same values as loose variables
(the largest 1.6 KB) served correctly. The engine parses a blob of that size,
so the limit is the platform's. The one-key runner
(`deploy/provisioning/provision-bunny-deck.mjs --served <file.json>`) takes
the loose form, refuses any value over 2 KB in the plan before any account
write, and writes it to both scripts; it never packs the blob.

`DECKO_SERVED_DELTAS` (the JSON blob form) is still read by the engine, and
where both forms are present the JSON wins field-by-field — keep every value
under 2 KB when using it on Bunny. The JSON below is a filled-in example of
the loose variables' field names; the machine-readable copy the deploy suites
configure when they assert a configured deployment's served bytes is
`tests/deploy/fixtures/configured-deck-served-deltas.ts`.

```json
{
  "assetHost": "https://assets.example.org",
  "footerVersionPin": "0.19.1",
  "stylesheetRevisionFrom": "41001/9999999999.css",
  "stylesheetRevisionTo": "41001/0000000001.css",
  "scriptIntegrity": [
    {
      "src": "<script src=\"https://code.jquery.com/jquery-3.5.1.min.js\" crossorigin=\"anonymous\"></script>",
      "withIntegrity": "<script src=\"https://code.jquery.com/jquery-3.5.1.min.js\" crossorigin=\"anonymous\" integrity=\"sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=\"></script>"
    }
  ],
  "notFoundType": { "id": "41005", "name": "BasicCs", "classToken": "basic_c" },
  "footerCardId": "41006", "footerTypeId": "50", "footerTypeName": "HTML",
  "allCardId": 41007, "layoutPointerId": 41008, "pointerTypeId": 41009,
  "mainCssUrl": "https://assets.example.org/files/41001/0000000001.css",
  "mainJsUrl": "https://assets.example.org/files/41002/0000000002.js",
  "logoUrl": "https://assets.example.org/files/41003/0000000003-small.jpg",
  "faviconUrl": "https://assets.example.org/files/41004/0000000004-small.jpg",
  "siteTitleDefault": "Example Site",
  "rootUrl": "https://www.example.org/",
  "deckOrigin": "https://www.example.org",
  "headScripts": [
    "<script src=\"https://code.jquery.com/jquery-3.5.1.min.js\" crossorigin=\"anonymous\" integrity=\"sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=\"></script>",
    "<script src=\"https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js\" crossorigin=\"anonymous\" integrity=\"sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==\" referrerpolicy=\"no-referrer\"></script>",
    "<script src=\"https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js\" crossorigin=\"anonymous\" integrity=\"sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw==\"></script>",
    "<script src=\"https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js\" crossorigin=\"anonymous\" integrity=\"sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==\" referrerpolicy=\"no-referrer\"></script>",
    "<script src=\"https://kit.fontawesome.com/<your-kit-id>.js\" crossorigin=\"anonymous\"></script>"
  ],
  "phantomType": { "typeId": 41005, "typeName": "BasicCs", "typeKey": "basic_c" }
}
```

**Verifying it landed:** `GET /_status` reports
`served_identity.configured` (a boolean) and `served_identity.configured_fields`
(the field names it found — never values, since a value can be a private
URL). `configured: false` means the deployment is serving stock bytes.

---

## 4. Hit it

| Request | Expected |
|---|---|
| `GET https://<script-hostname>/_status` | `200` JSON: `ok`, `card_count`, and the env var **names** it used |
| `GET https://<script-hostname>/` | `200` HTML, the `Home` card's minimal record view |
| `GET https://<script-hostname>/Special%3AAll` | `200` HTML for that card |
| `GET https://<script-hostname>/Home.json` | `200` JSON, the card record |
| any non-GET | `405` |

The routes are the ones `deploy/bunny-worker-src/bunny-worker.ts` defines
(see its route comment) and are covered by
`tests/deploy/bunny-edge-worker.test.ts`.

**Caching:** a standalone script is the origin, so it runs **only on a cache
miss** by default; enable **Run script before cache** under Pull Zone >
General > Origin to run it on every request
(<https://bunny.net/docs/scripting/standalone/overview.md>, "Before cache
execution"; <https://bunny.net/docs/scripting/before-cache.md>). The entry
sends `cache-control: no-store` on every response, so nothing it returns is
cached and every hit re-runs the script. That is the right behaviour for a
trial (you see live data and the CPU cost is honest), and it is the main lever
on request volume.

---

## 5. Runtime facts this entry depends on

| Fact | Source |
|---|---|
| Standalone scripts are started with `BunnySDK.net.http.serve(handler)`; the handler gets only a `Request` — there is **no** second `env` argument. | scripting/standalone/overview.md, "The serve function" + "Handler" |
| Environment values and secrets are read via `process.env` or `Deno.env`. | scripting/environment-variables.md, "Using environment variables"; scripting/secrets.md, "Using environment secrets" |
| EdgeScript is Deno-based with Web APIs; the same file runs under `deno run -A` locally. | scripting/runtime.md, first paragraph; scripting/standalone/overview.md, "Local development" |
| `node:process` is importable inside an Edge Script. | database/connect/scripting.md code sample |
| Script size limit **10 MB**; CPU 30 s/request; memory 128 MB; 50 subrequests; startup 500 ms; 128 env vars; env var value ≤ 2 KB. | scripting/limits.md |
| Bunny's documented DB client from an edge script is `@libsql/client/web`. | database/connect/scripting.md code sample |
| A `libsql://` URL needs no rewriting — `@libsql/client/web` calls `expandConfig(config, preferHttp=true)`, which maps a `libsql:` scheme to `https:`. | `node_modules/@libsql/core/lib-esm/config.js` (`scheme = preferHttp ? "https" : "wss"`), verified locally |
| `BunnySDK.net.http.serve()` dispatches to `Bunny.v1.serve(handler)` on the bunny runtime, `Deno.serve` under Deno, and a node listener under Node. | extracted `@bunny.net/edgescript-sdk@0.13.0` tarball, `esm/lib.mjs` / `esm-bunny/lib.mjs` (`case "bunny": return Bunny.v1.serve(r), {}`). **Not in the docs** — the SDK source is the only reference found. |

`Bunny.v1.serve` is the one contract in this table with no documentation page
behind it. If the trial deploy fails to start, that is the first thing to
check (Edge Platform > Scripting > `decko-trial` > Logs).

---

## 6. GitHub-connect variant (optional; do this after the paste works)

1. **Edge Platform > Scripting > Add Script > Deploy and edit with GitHub**,
   connect the GitHub account, choose the repository, pick the **Standalone**
   script type, then **Add Script**. Bunny creates a repository from a
   template with a deploy workflow that publishes straight away.
   Source: <https://bunny.net/docs/scripting/github-integration.md>, steps
   3–11.
2. To use **an existing** repository instead, follow that page's "Using an
   existing repository": pick the project preset, then set the install command,
   build command and **entry file** to:
   - install: `npm ci`
   - build: `npm run bundle:bunny-worker`
   - entry file: `deploy/dist/bunny-worker.bundle.js`
3. Env secrets set on the script are not in the repo; they stay in the
   dashboard. Do not commit the database token.
4. Automated deploys from GitHub Actions are a recurring unattended trigger.
   Any workflow that fires without a human in the loop should have an owner's
   explicit approval **and** a circuit-breaker job (a workflow that fails
   disables itself) before it is enabled. The GitHub-connect deploy runs on
   Bunny's side, not
   in this repo's Actions, but the same caution applies to any workflow file
   Bunny writes into the connected repository.

**What Bunny's deploy workflow does NOT do for you:** it will not run
`tools/bundle-bunny-worker.mjs` unless the build command above is set, and it
will not know the database name. The build is the only moving part.

---

## 7. Cost math at trial scale

From <https://bunny.net/docs/scripting/pricing.md>:

| Component | Rate | Increment |
|---|---|---|
| CPU time | $0.02 | per 1000 s (= 1,000,000 ms) |
| Requests | $0.20 | per 1,000,000 |

"Billing begins at the first increment, not at the first million. As soon as a
script serves a single request, the first increment of each component is
charged in full, and all remaining usage within that increment is already
covered."

Arithmetic for a trial that serves, say, 50 requests. **The ~12 ms CPU per
request below is an assumption, not a measurement** — no request has been
profiled on Bunny's runtime, and the conclusion does not depend on it: any
per-request CPU small enough to leave all 50 requests inside the first
increment produces the same floor.

```
CPU time:  50 requests x 12 ms (assumed) = 600 ms
           600 ms is inside the first 1,000,000 ms increment
           1 increment x $0.02                            = $0.02

Requests:  50 requests is inside the first 1,000,000 increment
           1 increment x $0.20                            = $0.20
                                                          --------
                                                          $0.22 / month
```

**$0.22 is the floor and it is reached on the first request.** It does not move
until you pass 1,000,000 requests or 1000 s of CPU in a month. Worked examples
quoted from that page: 10 M requests x 10 ms = $4.00; 100 M requests x 7 ms =
$34.00. To stay at the floor, stay under 1,000,000 requests a month — roughly
33,000 requests a day, or one request every 2.6 seconds.

**Separately billed:** CDN bandwidth, at the normal CDN rate, not included in
the scripting line (same page). The database is billed on its own schedule —
<https://bunny.net/docs/database/limits.md> caps a database at 1 GB and an
account at 50 databases during public preview, but the per-database price is
not on the documented pricing pages. **Read the trial's actual invoice
numbers on the dashboard before seeding anything large.**

Live check after publishing: Edge Platform > Scripting > `decko-trial` shows
requests served and CPU used (quickstart.md step 3; the API exposes the same as
`TotalRequestsServed` / `TotalCpuUsed` / `TotalMonthlyCost` on
`EdgeScriptStatisticsModel`, and `MonthlyCost` / `MonthlyRequestCount` /
`MonthlyCpuTime` on `EdgeScriptModel`).

---

## 8. API variant of the same deploy (optional; needs the account API key)

Base URL `https://api.bunny.net`, auth header **`AccessKey`**
(<https://bunny.net/docs/scripting/api-reference.md>).
Request bodies from
<https://bunny.net/docs/api-reference/scripting/openapi.json>:

```
POST /compute/script                      {"Name":"decko-trial","Code":"<bundle>","ScriptType":1,"CreateLinkedPullZone":true,"LinkedPullZoneName":"decko-trial"}
POST /compute/script/{id}/code            {"Code":"<bundle>"}
POST /compute/script/{id}/publish         {"Note":"trial"}
POST /compute/script/{id}/secrets         {"Name":"BUNNY_DATABASE_URL","Secret":"<value>"}
POST /compute/script/{id}/secrets         {"Name":"BUNNY_DATABASE_AUTH_TOKEN","Secret":"<value>"}
PUT  /compute/script/{id}/variables       {"Name":"...","Required":true,"DefaultValue":"..."}
GET  /compute/script/{id}                 -> DefaultHostname (the URL to hit)
GET  /compute/script/{id}/statistics      -> TotalRequestsServed / TotalCpuUsed / TotalMonthlyCost
```

`publish` takes an optional
`Note`, so `{}` is valid. `AddEdgeScriptVariableModel.DefaultValue` is capped at
256 characters by the schema, and env var values at 2 KB by limits.md — a
database URL and a token both fit.

**No step above writes to an account by itself.** Every call is documentation
for you to run.

---

## 9. Rollback

- **Script:** Edge Platform > Scripting > `decko-trial` > Deployments; each
  release keeps its code, and an earlier one can be made live again
  (<https://bunny.net/docs/scripting/deployments.md>).
- **Seeded rows:** the trial database is disposable. Delete the database from
  the dashboard and create a fresh one; that is cheaper than reasoning about
  partial imports.
- **The trial account itself:** close it from account settings. The $0.22 floor
  is the whole downside of this exercise, and it is charged the moment the
  first request is served.

---

## 10. Open risks, stated plainly

1. **`Bunny.v1.serve` is undocumented.** §5. If the paste-and-publish path
   does not start a server, this is the suspect, and the SDK tarball is where
   the contract was read.
2. **The import has no default source file** (§3 step
   5). The trial seed needs an explicit `--source`.
3. **The database price is not in Bunny's published pricing pages.** The
   $0.22 figure is the *scripting* line only.
4. **Cache behaviour is untested here.** `no-store` means every request
   re-runs the script, which is correct for a trial but is also the lever that
   turns a crawler into a bill. Keep the pull zone unindexed.
5. **The bundle resolves `@bunny.net/edgescript-sdk` at run time.** If the
   Bunny runtime turns out not to resolve bare npm specifiers for uploaded
   code, the fix is to install the SDK and inline it (delete the entry from
   `EXTERNAL_RUNTIME_IMPORTS` in `tools/bundle-bunny-worker.mjs`). This was
   not verifiable without an account.

No energy measurement exists anywhere in this repository for this or any
other topology; nothing in this runbook is an energy claim.
