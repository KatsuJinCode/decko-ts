# Migration change inventory — what changes for you

This is the "what changes for a Decko owner who moves to decko-ts" list.
Every item carries a `file:line` cite into this repo and one of three
labels:

- **carries-over** — same shape, same bytes, same operator-visible
  behavior. The thing just works.
- **differs-labeled** — same purpose, different implementation. You can
  build and read against it, but the bytes are not identical and the
  tooling around it is not Rails.
- **deferred** — explicit gap. The repo documents it, the operator will
  notice, and the work is on a roadmap (not in the M2 deliverable).

No marketing voice. The labels name the truth.

---

## 1. Admin chrome — `:open` / `:closed` / `:title` / menu / nav

**Label: differs-labeled.**

The card renderer's :open and :closed views render directly, no Rails
layout wrapper, no `application.html.haml`. The whole HTML envelope
(`<!doctype html><html><head>…<body><div class="card-view" data-card=…
data-view=…>` and the trailing `<p><a href="/Home.json">record JSON</a>
· <a href="/_status">status</a></p>` footer) is owned by `deploy/worker.ts`,
not the engine:

- deploy/worker.ts:241 `renderCardPage` — the HTML envelope around every
  render; `data-card`/`data-view` attributes are the integration seam.
- deploy/worker.ts:197 `htmlResponse` — the response headers (text/html,
  no-store cache).
- deploy/worker.ts:219 `errorPage` — the 404/500 HTML page.

The bar / bar_left / bar_middle / bar_right / mini_bar / mini_unknown /
titled / titled_content / blank / link / menu / core HTML views are
implemented as functional replacements of the Ruby Haml, not a
byte-identical transcription. Concrete differences:

- Bar / bar-right HTML (`src/card/render/views.ts:91-134`, `rule-bar-right.ts`):
  uses `data-slot-id` / `data-slot` / `data-bs-toggle="tooltip"` /
  `data-slotter-mode="modal"` attributes from the `slot-html.ts`
  emitter — semantically equivalent to the Ruby Haml `data-slot` /
  `data-bs-*` markers, but the surrounding CSS hooks assume Bootstrap 5,
  not the broader Bootstrap 3 surface Ruby Decko's `card-mod-bootstrap`
  wires up. The render side calls these through the `card-mod-bootstrap`
  mod surface where ported (`tools/compat-report/mod-compat-report.md:32`,
  4 of 10 mod-specific views covered: `bar_bottom`, `bar_left`,
  `bar_middle`, `bar_right`).
- The card menu (`_card-menu-popover`, edit-link slotter) lives at
  `src/card/render/views.ts:130-134` and ships only the structure —
  Bootstrap popover behavior assumes the Bootstrap JS bundle is loaded
  by the host page; the engine emits the markup, the operator wires the
  script tag.
- `:closed` (trash view) renders a single bar via the same code path as
  `:open`, sourced from `src/card/render/views.ts:701` `barBottomHtml`
  with the `open=false` branch.

What is NOT ported (mod-compat report, `tools/compat-report/mod-compat-report.md`):

- `card-mod-bootstrap-0.20.0`: 6 of 10 mod-specific views missing —
  `carousel`, `customize_button`, `icons`, `input`, `one_line_content`,
  `progress_bar` (`tools/compat-report/mod-compat-report.md:32`).
- `card-mod-style-0.20.0`: 0 of 12 mod-specific views covered —
  `box`, `box_bottom`, `box_middle`, `compiled`, `compressed`,
  `customize_button`, etc. (`tools/compat-report/mod-compat-report.md:56`). Style/CSS hooks
  defer until the asset / style pipeline is wired.
- `card-mod-format-0.20.0`: 1 of 46 mod-specific views covered
  (`bar_right`); the big format family (`add_button`, `add_link`,
  `board_link`, `compact_missing`, `menu`, `naked`, …) is open
  (`tools/compat-report/mod-compat-report.md:43`).
- `card-mod-tabs-0.20.0`: 0 of 4 covered (`tabs`, `tabs_static`, `pills`,
  `pills_static`) (`tools/compat-report/mod-compat-report.md:57`).

Operator-visible: a Rails Decko admin chrome (the `mod-bootstrap` tab
navigation, the right-side edit pencil, the `<main>` wrapper) is NOT
here. The engine emits the card content; the operator picks the
shell. The deploy worker emits the minimal shell needed for the M2
demo (`deploy/worker.ts:241`).

## 2. File uploads / object storage

**Label: deferred.**

`card-mod-carrierwave-0.20.0` is partial: the mod-specific view
`source` (the URL/path emitter) is ported in pure HTML form
(`src/card/mod-loader/mods/card-mod-carrierwave.ts:151`), but the
underlying attachment runtime is not. The mod header
(`src/card/mod-loader/mods/card-mod-carrierwave.ts:36-77`) lists the
NOT-ported surface verbatim:

- `lib/carrier_wave/*` — the carrierwave mount adapter + uploaders
  (needs the carrierwave gem runtime: file I/O, fog, mini_magick, S3
  buckets).
- `set/abstract/attachment.rb` — 5 event hooks + `mount_uploader`
  integration (requires carrierwave runtime + filesystem ops).
- `set/abstract/attachment/00_upload_cache.rb` — 6 event hooks for the
  draft file lifecycle.
- `set/abstract/attachment/01_storage_type.rb` — storage-type events
  (filesystem / cloud / local / coded).
- `set/abstract/attachment/coded.rb` — mod-file coded storage
  (filesystem).
- `set/abstract/attachment/cloud.rb` — bucket config + ENV credential
  reading.
- `set/abstract/attachment/local.rb` — public symlink management.
- `set/abstract/attachment/paths.rb` — file path resolution.
- The draft-attachment SQL (`draft_actions_with_attachment`) and the
  upload-cache-card state machinery.

The mod-compat report agrees: 0 of 6 carrierwave mod-specific views
covered (`content_changes`, `full_width`, `input`, `link_tag`,
`preview_editor`, `source` — `source` is ported as pure HTML but the
compat tool's coverage check counts only mod-loader registrations, see
`tools/compat-report/generate-mod-compat-report.mjs:600-628`)
(`tools/compat-report/mod-compat-report.md:33`).

Operational consequences:

- The deploy binds NO R2 bucket (`deploy/wrangler.toml` has no
  `[[r2_buckets]]` block; the comment at lines 35-38 names this as the
  deliberate "no file uploads" contract).
- The `files/` web path (`FILES_WEB_PATH`) is resolved by the headless
  carrierwave helper (`src/card/mod-loader/mods/card-mod-carrierwave.ts:116`)
  but only as a string; the engine never reads from disk.
- D1 cannot store blobs. A migration that imports cards of `type_id`
  pointing at file/image cards lands as rows with no payload — the
  source images are NOT carried.

Operator-visible: a migrating owner must either (a) accept that
attachments are not part of the M2 deliverable, or (b) wire a separate
R2 bucket + carrierwave-style hooks when the work is funded.

## 3. Email / jobs

**Label: deferred.**

- Email: `card-mod-email-0.20.0` is partial — 0 of 2 mod-specific views
  covered (`compact_missing`, `email_page`) per
  `tools/compat-report/mod-compat-report.md:41`. The mod surface
  (`src/card/mod-loader/mods/card-mod-email.ts`) ports the email-text /
  email-html format class registrations and the right-side
  `*to/*from/*cc/*bcc/*subject/*attach/*text_message/*html_message`
  settings; the actual delivery path (ActionMailer / SMTP) is not
  ported, and no SMTP binding exists on the deploy.

- Background jobs: `card-mod-delayed_job-0.20.0` is `ignored`
  (`tools/compat-report/mod-compat-report.md:39`). The table
  `delayed_jobs` exists in the schema
  (`db/schema.sqlite.sql:188-204`, mirrored in
  `deploy/migrations/0001-schema.sql:187-203`) but is deliberately empty
  in the deploy seed (`deploy/seed/seed.sql` "Deliberately EMPTY tables"
  header, lines 156-160). The `card-mod-follow` mod that integrates
  with the delayed-job hook is partial (0 of 12 mod-specific views,
  `tools/compat-report/mod-compat-report.md:42`). The mod-manifest
  comment (`src/card/mod-loader/default-mod-deck.ts:27-28`) names this
  honestly: "delayed_job + defaults: no TS surface (the legacy
  delayed-job queue; the defaults meta-gem carries no registrations)."

- No cron triggers, no scheduled workflow, no queues bound in
  `deploy/wrangler.toml` (read it: one Worker, one D1, no KV/R2/queues).

Operator-visible: out-of-band notifications, email-driven signups, and
delayed-job fan-out do not exist on the M2 deploy. A migrating owner
runs email outside this runtime.

## 4. Sessions / auth

**Label: differs-labeled.**

Ruby Decko's session story splits across two surfaces:

- Rails cookie sessions (ActiveRecord::SessionStore) — opaque blobs in
  the `sessions` table.
- JWT token auth — `lib/card/auth/token.rb`.

The decko-ts port (`src/card/auth/`, 5 files: `actor.ts`,
`session-store.ts`, `session-token.ts`, `migrations.ts`, `index.ts`)
unifies them into ONE mechanism: opaque bearer token + `auth_sessions`
row, with the raw token only ever handed back at issue time
(`src/card/auth/session-store.ts:101-127`). Concretely:

- `auth_sessions` table (added by `db/migrations/001-auth-sessions.sql`,
  ported in `src/card/auth/migrations.ts`) is the only session store.
  The Rails `sessions` table (`db/schema.sqlite.sql:208-216`,
  `deploy/migrations/0001-schema.sql:208-216`) is in the schema for
  parity but the port does not read or write it.
- Token is a digest at rest. `createSession` stores `sha256(token)`,
  returns the raw token exactly once; `lookupSession` digests and
  compares with a constant-time XOR
  (`src/card/auth/session-store.ts:132-161`).
- Expiry is enforced. `lookupSession` rejects `now > expires_at`;
  `expires_at` lives in `auth_sessions.expires_at`.
- TTL is configurable per call (`createSession({ ttlSeconds })`,
  default 48 hours — `DEFAULT_SESSION_TTL_SECONDS`, a PORT decision,
  not a ported Ruby constant).

What is NOT ported (`docs/auth-port-notes.md` "1.1 What was
deliberately NOT ported"):

- The `as` / proxy save-restore machinery (`auth/proxy.rb`): the
  port's actions layer takes an explicit `Actor` parameter, no
  global state, nothing to save/restore.
- Password authentication (Ruby `card-1.110.0/lib/card/auth.rb:20-38`:
  `authenticate`,
  `password_valid?`, SHA1 `encrypt`): account-credential checking is
  HTTP-layer work; the engine consumes its output, never sees
  passwords.
- `find_account_by_email`: CQL search over `+*account` / `+*email`
  cards — deferred with the account-mod port.
- API keys (`card-mod-api_key-0.20.0` is partial, 0 of 6 mod-specific
  views covered, `tools/compat-report/mod-compat-report.md:29`).
- `card-mod-recaptcha-0.20.0` (partial, 0 of 0 mod-specific views
  covered, `tools/compat-report/mod-compat-report.md:51`).

Account-mod is partial (`tools/compat-report/mod-compat-report.md:27`):
0 of 19 mod-specific views (`account_tab`, `closed_account`,
`closure`, `configs`, `content_formgroups`, `edit`, `edit_buttons`,
`link_with_checkbox`, `new`, `new_buttons`, `one_line_content`,
`open_content`, `raw`, `reset_password_days`, `reset_password_success`,
`reset_password_url`, `setup`, `token_days`, `token_expiry`,
`verify_days`, `verify_url`).

The deploy worker does not wire ANY session logic
(`deploy/worker.ts:1-426` reads no cookie, sets no header). Sign-in,
sign-out, account recovery are operator-side.

Operator-visible: an owner migrating to decko-ts gets the
session-row / token machinery on the engine side. The HTTP
sign-in/sign-out endpoints are NOT shipped — write them yourself,
call `createSession({ accountCardId, ttlSeconds })` on a POST handler,
return the raw token in the response body (or a Set-Cookie: HttpOnly
header of your choice), and `lookupSession` from a middleware.

## 5. URLs and API surface that DO carry over

**Label: carries-over** for the named routes and shapes.

The deploy worker is the canonical list. Every route is named in
`deploy/worker.ts:13-19` and implemented in `deploy/worker.ts:343-425`:

| Surface | Status | Cite |
| --- | --- | --- |
| `GET /` — render Home card, `:open` HTML | carries-over | `deploy/worker.ts:396-399`, `renderCardPage:241` |
| `GET /:card-name` — render that card, `:open` HTML | carries-over | `deploy/worker.ts:414-424`, `renderCardPage:241` |
| `GET /:card-name.json` — card record JSON | carries-over | `deploy/worker.ts:403-411`, `cardRecordJson:257` |
| `POST /api/query` — `{"cql": <CQL JSON>}` body → CQL result JSON | carries-over | `deploy/worker.ts:384-390`, `apiQuery:282` |
| `GET /_status` — engine + database health JSON | new (decko-ts) | `deploy/worker.ts:366-377`, `status:315` |
| `GET /__metrics` — per-isolate aggregate | new (decko-ts) | `deploy/worker.ts:379-382`, `deploy/src/worker-metrics.ts` |
| 404 / 405 / 400 error pages | differs (HTML envelope) | `deploy/worker.ts:219-226`, `errorPage` |
| URL convention: `+` is the decko junction joint inside a name; spaces ride as `%20` | carries-over | `deploy/worker.ts:413-415`; tests at `tests/deploy/deploy-worker-miniflare.test.ts:169-179` |

The card record JSON shape carries over exactly the columns the engine
reads from the `cards` table — id, name (string), key, type_id,
type_name (resolved through the primed name resolver), codename,
left_id, right_id, trash, created_at, updated_at, creator_id,
updater_id, db_content (`deploy/worker.ts:264-279`). Field names are
snake_case because the engine normalizes them that way. The Ruby
`Card#to_json` shape (`name`, `key`, `type`, `codename`, `updater`,
etc.) is NOT a byte match — the JSON here is the engine's own.

The CQL JSON shape carried by `POST /api/query` is the CQL
serialization the parser accepts (`src/cql/parser.ts`,
`src/cql/execute.ts`). It accepts both an inline object body and a
JSON-encoded cql string (`deploy/worker.ts:289-297`). The shapes
`{"type": "Note", "sort": "name"}`, `{"name": "Home"}`,
`{"type":"User","return":"count"}` are proven end-to-end in
`tests/deploy/deploy-worker-miniflare.test.ts:208-247`.

The `match` (REGEXP) operator is NOT supported on the deploy path
(documented in `docs/cql-execution-notes.md` and `docs/deploy-notes.md`
finding 3): D1 has no REGEXP UDF; the JS-side post-filter strategy is
designed but not implemented. `POST /api/query` with `match` returns
500 from the driver, not silent empty results.

## 6. The carry-over short list (operator-facing)

These four things look and behave the same as Rails Decko on a fresh
install; everything else above is named explicitly:

- CQL: same JSON grammar (`{"type": …, "sort": …, "name": …,
  "return": "count", …}`), same `name → id` resolution (left-
  associative junction walk with cycle guard, see
  `deploy/worker.ts:144-188`), same `card_list` view on Search-type
  cards.
- URL grammar: `/CardName` and `/Left+Right` and `/Left+Right+Detail`
  for compound names; `/CardName.json` for the record.
- The cards schema: 12 core tables, identical column order, identical
  index names (verified sha256 against the MySQL truth in
  `db/schema.sqlite.sql` — see `docs/schema-notes.md` and the
  generated header in `deploy/migrations/0001-schema.sql:11-51`).
- Junction / compound-name convention: NULL name/key columns on
  junction rows (post-2020 Lexicon), composed at read time via
  `left_id`/`right_id` walk. The seed exercises this through depth 4
  (`deploy/seed/seed.sql:106-118`); the prefetch limit on inclusion
  depth (engine gap, not deploy) is documented at
  `docs/deploy-notes.md:83-114`.

## 7. What is NOT in the M2 deliverable (the honest gap list)

- The carrierwave attachment runtime (Section 2 above).
- Background jobs (delayed_job) and email delivery (Section 3 above).
- A sign-in / sign-out HTTP endpoint (Section 4 above).
- The Bootstrap-style admin chrome beyond bar/bar-bottom/bar-left/
  bar-middle/bar-right (`tools/compat-report/mod-compat-report.md:32`).
- The account-mod UI (0 of 19 mod-specific views covered,
  `tools/compat-report/mod-compat-report.md:27`).
- Tabs / pills navigation (`tools/compat-report/mod-compat-report.md:57`).
- Recaptcha (`tools/compat-report/mod-compat-report.md:51`).
- History / revision UI (`card-mod-history-0.20.0`: 0 of 12
  mod-specific views covered, `tools/compat-report/mod-compat-report.md:45`).
  The history TABLES exist in the schema and stay empty in the seed
  (read-only demo).
- The list / search input views (`card-mod-search-0.20.0`: 2 of 20
  covered — only `bar` and `card_list`, `tools/compat-report/mod-compat-report.md:54`).
- The layout-modal / edit-modal stack (`card-mod-layout-0.20.0`: 1 of 24
  covered — only `bar_bottom`, `tools/compat-report/mod-compat-report.md:47`).
- The edit form UI (`card-mod-edit-0.20.0`: 0 of 41 covered,
  `tools/compat-report/mod-compat-report.md:40`).
- The M4 migration tool that bulk-imports an existing Ruby Decko dump
  (`tools/migrate/migrate.mjs`, `tools/migrate/migrate-generalized.mjs`,
  `tests/migrate/`) — exists, works, but is NOT wired into the deploy
  worker. The deploy seed is the synthetic demo deck; an operator
  migrating a real corpus runs the migration tool by hand and points
  the deploy's `seed.sql` at the result.

## 8. The repository surface that proves each claim

This document cites the following files; every label above was decided
after reading the surface, not from memory:

- `deploy/worker.ts` — the HTTP entry (read in full this session).
- `deploy/wrangler.toml` — the binding contract.
- `deploy/seed.mjs` — the synthetic seed generator.
- `deploy/seed/seed.sql` — the generated SQL.
- `deploy/migrations/0001-schema.sql` — the generated schema.
- `deploy/cleanup.mjs` — the cleanup story (parallels `launch.mjs`).
- `db/schema.sqlite.sql` — the schema source-of-truth (mirrored into
  deploy/migrations).
- `src/server/drivers/d1.ts` — the D1 adapter used by the worker.
- `src/card/auth/session-store.ts` — the unified session/token row.
- `src/card/auth/migrations.ts` — the `auth_sessions` schema.
- `src/card/mod-loader/mods/card-mod-carrierwave.ts` — the carrierwave
  port + its not-ported list (lines 36-77).
- `src/card/mod-loader/mods/card-mod-email.ts` — the email port.
- `src/card/mod-loader/default-mod-deck.ts` — the mod deck and the
  explicit "delayed_job + defaults: no TS surface" line (27-28).
- `src/card/render/views.ts` — the HTML views.
- `src/card/render.ts` — the render engine entry.
- `tools/compat-report/mod-compat-report.md` — the per-mod coverage
  table (33 mods; 1 ported, 30 partial, 0 missing, 2 ignored).
- `docs/deploy-notes.md` — the engine seams + compatibility findings.
- `docs/auth-port-notes.md` — the auth port details (Ruby cite
  `card-1.110.0/lib/card/auth/*.rb` + the port's "deliberately NOT
  ported" list).
- `docs/migration-generalization-notes.md` — the M4 tool generalization.
- `tests/deploy/deploy-worker-miniflare.test.ts` — the 16-test local
  proof that pins the routes the deploy worker ships.

If any of those surface changes after this document is written, this
document is stale and the labels must be re-derived.
