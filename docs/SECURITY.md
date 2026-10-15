# Security policy

decko-ts is a port of Ruby Decko (card 1.110.0, decko 0.20.0). Its acceptance criterion is exact parity with Ruby Decko in rendering, persistence, semantics and side effects, including Ruby's defects, so that an existing deck behaves the same on either engine — except where a difference is declared below.

There are eight exceptions to that parity rule. Five are listed below, in two classes; the other three are withheld until a private channel exists to disclose them responsibly.

1. **Security holes.** Where Ruby's behaviour lets one user act against another, the port does not copy it. Divergences 2 and 5.
2. **Credential and secret handling.** Where Ruby stores or compares a secret in a way that is weaker than it needs to be, the port stores or compares it more strongly, or exposes it to guessing less. Divergences 1, 3 and 4.

Each exception is an *approved security divergence*: it is listed below with what Ruby does, what the port does, why, what it costs in compatibility, how to configure it, and the test that pins it. Anything not listed here is meant to behave exactly as Ruby Decko does; a difference that is not listed is a defect. Three kinds of deliberate difference are governed outside this list, and none of them is a security divergence:

1. **Transaction and save differences on adapters without interactive transactions** — listed and pinned by [decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md).
2. **Differences that exist only on the oracle schema Ruby actually runs on.** These are declared step by step, with their reasons, in `reference-harness/fixtures/write-battery-v1/expected/persist-steps/deliberate-differences.json`, and they are differences between the port and the throwaway oracle deck rather than between the port and Decko. Step 7 is the one of that kind: Ruby inserts a second `cards` row for a compound name whose junction is trashed, and that insert only succeeds on the oracle deck, which lacks the upstream schema's `UNIQUE (left_id, right_id)` index; the same Ruby save fails on a schema carrying that index. The port revives the existing trashed junction row instead, recording the revival's name, type, content, trash and part changes, which keeps one row per name and is valid on the production schema.
3. **Row-level differences the persistence oracle declares**, in the same file. Some of them belong to approved divergences that are withheld until disclosure; the remainder concern Ruby's own bugs, which are reproduced on purpose.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than in a public issue, through the
GitHub Security Advisory channel on **the repository this project is developed in** — its
`Security` tab, "Report a vulnerability". That is this project's own repository, so an
advisory filed against a repository you do not hold is not a second channel: there is no
email fallback. Include the request or content that triggers the problem and what you
observed. Because of the nature of a security concern, a flaw that exists in Ruby Decko is
not disclosed here until a private channel is established to disclose it
responsibly. Five Ruby Decko flaws are withheld on those terms, in areas of Ruby Decko this
repository does not describe. Nothing about them is described in this file or in any other
shipped file: no upstream file, line, guard name, request shape or payload, and no explanation
of what Ruby does with any of them. Where a rule the port enforces is material to one of
them, the port's own behaviour on it is stated below.

## Deployment obligations the port does not meet for you

These are properties of a running deployment rather than divergences from Ruby. They are
stated here because a reader deciding whether to expose a deck publicly has to know them.

### Distributed guessing is limited per address, not stopped

The sign-in throttle (divergence 4) locks an identifier after a few failures whatever the
source, and locks a client address that fails across many identifiers. An attack spread
across many addresses against many identifiers stays under both limits; only edge
throttling in front of the deck (Cloudflare WAF rate-limiting rules, Bunny's equivalent, a
reverse proxy) addresses that. The client address the Node host counts comes from
`X-Forwarded-For` when present, which a client reaching the Node host directly can set.

## Approved divergences

Three further approved divergences exist, are pinned by withheld tests, and are not described here until the disclosure described under "Reporting a vulnerability".

### 1. Passwords: new ones are stored with PBKDF2

| | |
|---|---|
| **Ruby** | `Card::Auth.encrypt` (`lib/card/auth.rb`) stores `SHA1("<salt>--<password>--")` as 40 hex characters, where the salt is itself the SHA-1 of a timestamp, and `password_valid?` compares it with ordinary string equality. One unkeyed SHA-1 per guess lets a stolen database be brute-forced quickly. |
| **Port** | Ruby's digests keep verifying, so every existing account signs in unchanged. A newly set or changed password is stored as PBKDF2-HMAC-SHA256 with a random 16-byte salt, in the form `pbkdf2_sha256$<iterations>$<salt, base64>$<hash, base64>`. On the next successful sign-in, a legacy digest (or a PBKDF2 hash with fewer iterations than configured) is replaced. Iterations follow the OWASP Password Storage Cheat Sheet: **600,000**. |
| **Why** | A database copy is the usual way passwords leak; PBKDF2 at OWASP's work factor makes each guess hundreds of thousands of times more expensive than Ruby's single SHA-1. PBKDF2 is available through WebCrypto on every runtime the port supports (Node, Cloudflare Workers, Bunny/Deno), which rules out bcrypt, scrypt and Argon2 without native code. |
| **Compatibility** | **Ruby cannot verify a PBKDF2 hash.** If Ruby Decko and the port serve the same deck (for example during a migration), an account whose password was set or upgraded by the port can no longer sign in through Ruby. Such sites set `DECKO_PASSWORD_HASH=legacy-sha1`: new passwords are then stored as Ruby's digest and nothing is upgraded. Switch to the default once Ruby no longer serves the deck; accounts upgrade as their owners sign in. |
| **Cloudflare Workers** | Cloudflare's production runtime refuses PBKDF2 above **100,000** iterations (cloudflare/workerd issue 1346; local `workerd` does not enforce it). On Workers the default is therefore 100,000, below OWASP's figure; it rises automatically (at the owners' next sign-in) if the deck later moves to a host without that limit. A hash created elsewhere with more iterations cannot be checked on Workers: the sign-in fails with a message saying so, not "Wrong password", and a password reset on Workers fixes it. |
| **Configuration** | `DECKO_PASSWORD_HASH`: `pbkdf2` (default) or `legacy-sha1`. `DECKO_PASSWORD_PBKDF2_ITERATIONS`: a whole number, at least 100,000 and at most the runtime's limit. An invalid value makes password saves and sign-in fail with a message naming the setting; reads are unaffected. |
| **Tests** | `tests/card/auth/password-hash.test.ts` (legacy and PBKDF2 both verify; the RFC 7914 PBKDF2 test vector; independent recomputation with `node:crypto`; upgrade decisions; the Workers limit; configuration errors), `tests/card/auth/signin.test.ts` ("password upgrade at sign-in"), `tests/card/auth/first-run-setup.test.ts`. The persistence probe passes under both password policies; its declared differences (withheld until disclosure) concern Ruby bug reproduction, not password hashing. |

### 2. Cross-site requests: writes and sign-in must come from the deck's own pages

| | |
|---|---|
| **Ruby** | No forgery protection: decko 0.20.0 and card 1.110.0 contain no `protect_from_forgery`, and Rails' origin check lives inside it. A page on another site can submit a form that edits a card with a visitor's session, or signs the visitor in to an account of the attacker's choosing. The session cookie's `SameSite=Lax` blocks the first in current browsers for cross-site posts, but not from a sibling subdomain, and does nothing for the second. |
| **Port** | Every state-changing request (card create, update and delete; `/update/*signin`; sign-out; the account password and reset forms; first-run setup) passes an origin check before anything runs: `Sec-Fetch-Site: cross-site` or `same-site` is refused; otherwise an `Origin` header must name the deck's own host (or a trusted origin), and `Origin: null` is refused; otherwise a `Referer` must. A request with none of these did not come from a browser page and passes, so scripts and API clients work as before. A refused request gets 403. |
| **Why** | Forged edits and login CSRF act with, or against, a visitor's identity without their knowledge. Checking the origin needs no token, so no page's bytes change. |
| **Compatibility** | Same-origin forms, the editor, and token-authenticated API calls are unaffected. A site that posts from another origin it controls (an external editor) lists it in `DECKO_TRUSTED_ORIGINS`. Hosts are compared by host and port, not scheme, so a TLS-terminating proxy does not cause false refusals. |
| **Configuration** | `DECKO_ORIGIN_CHECK=off` restores Ruby's behaviour. `DECKO_TRUSTED_ORIGINS`: comma-separated `scheme://host[:port]` origins. |
| **Tests** | `tests/server/write-routes-origin.test.ts` (cross-site Origin, `null` Origin, `Sec-Fetch-Site`, foreign Referer and a foreign port are refused with the card unchanged; a cross-site sign-in mints no session, including on the edge hosts' sign-in-only path; same-origin, Referer-only and header-less requests, trusted origins and the off switch pass), `tests/card/auth/first-run-setup.test.ts` (a cross-site setup POST creates no account), `tests/deploy/bunny-edge-signin-session-roundtrip.test.ts` (the Bunny edge reads both settings from its own environment). The Node host's cross-site reset, password and sign-in posts are covered by the reset-flow endpoint suite (13 tests). That suite is **development evidence, not part of the published package**: it opens `fixtures/test-corpus/` at module load, and `docs/TESTING.md` §1 records that fixture as not redistributed. With the fixture present the suite runs; in a clean clone of the published package it is not there, and the suite does not run. |

### 3. Secrets are compared in constant time

| | |
|---|---|
| **Ruby** | Password digests are compared with `==`, whose running time depends on where the strings first differ. |
| **Port** | Password digests and hashes, session tokens and signed-token signatures are compared with a constant-time comparison (`src/card/auth/session-token.ts`), which runs over the whole input whatever it contains. The comparison folds the two lengths in as well: the byte loop zero-pads the shorter input, so without an explicit length check a shorter value matching the longer one's prefix would compare **equal** (every padded position XORs 0 against 0). Length is the one thing the comparison branches on, and comparing two lengths reveals nothing a boolean result did not. |
| **Why** | A timing difference can leak a secret one character at a time to a patient remote attacker. |
| **Compatibility** | None: the results are identical, only the timing differs. |
| **Tests** | `tests/card/auth/session-token.test.ts` covers the comparison, including the padded-prefix case the length check exists for (`[1,2,3]` against `[1,2,3,0,0,0]`, and `"x"` against `"x\0"` through the string path); `password-hash.test.ts` and `signin.test.ts` cover its use for passwords. |

### 4. Sign-in: throttled, uniform in its answers, and sessions end with the credential

| | |
|---|---|
| **Ruby** | card-mod-account's `:signin` event answers each failure by the field that failed ("Unrecognized email.", "Sorry, that account is not active.", "Wrong password"), keeps no count of attempts, and a signed-in session is not ended by a later password or status change. |
| **Port** | **Throttle.** Failed sign-ins are counted in the deck database (table `auth_signin_throttle`, beside `auth_sessions`), per identifier (stripped and downcased, whether or not an account exists) and per client address. Five failures for one identifier, or fifty from one address, within fifteen minutes lock that scope for fifteen minutes: a locked scope is refused ("Too many failed sign-in attempts. Try again later.") before any password is checked, and no session is minted. A success clears the identifier's count. Because the counters live in the deck, the limit holds on Node, Cloudflare Workers and Bunny alike. **Uniform answer.** An unknown identifier, a wrong password and an inactive account all answer "Wrong email or password."; an unknown identifier still pays for one password derivation at the configured cost, so the answer's timing does not separate it from a wrong password. An inactive account's state is told only to a caller who has just given its correct password. The forgot-password trigger on the same card answers an unknown or inactive address with the redirect a sent reset gets, and sends nothing. **Session revocation.** Every session lookup checks the holder's `+*account`: a `+*status` other than `active` (blocked, closed, unverified), or a `+*password` card updated after the session was issued, makes the session resolve to nobody. It is checked at lookup, so it holds whichever host or engine made the change. **Secure cookie.** The Node host sets `Secure` on the session cookie, and on the cookie that clears it, when the client reached it over TLS: its own TLS socket, or `X-Forwarded-Proto: https` from a TLS-terminating proxy. The Workers and Bunny hosts already set it on https. |
| **Why** | Without a limit every guess costs an attacker one request; without a uniform answer the sign-in form tells anyone which addresses have accounts; a session that outlives a password change or a block keeps someone unauthorised signed in after the owner has acted; a session cookie without `Secure` can be sent over plain http. |
| **Compatibility** | A legitimate user who mistypes five times waits fifteen minutes; anyone can lock a known identifier out the same way (the lock is per identifier and expires on its own). Sign-in error messages differ from Ruby's. Changing a password, including through the reset flow, ends that account's other sessions; the reset flow signs the user in again afterwards. A legacy SHA-1 digest verifies faster than a PBKDF2 derivation, so an account that has not signed in since migration is distinguishable by timing until its first sign-in upgrades it. The revocation check compares stored timestamps at their own precision: a password change in the same instant as a session's creation does not end it. |
| **Configuration** | `DECKO_SIGNIN_THROTTLE` (`on` default, `off`); `DECKO_SIGNIN_MAX_FAILURES` (per identifier, default 5); `DECKO_SIGNIN_MAX_ADDRESS_FAILURES` (per address, default 50); `DECKO_SIGNIN_LOCKOUT_SECONDS` (window and lock length, default 900); `DECKO_SIGNIN_UNIFORM_FAILURE` (`on` default, `off` restores the per-field messages); `DECKO_SESSION_REVOCATION` (`on` default, `off`); `DECKO_COOKIE_SECURE` (`auto` default, `always` for a proxy that forwards no scheme, `never` for local http development). An invalid value fails sign-in with a message naming the setting. The Workers and Bunny hosts read these settings from their own bindings on each state-changing request, beside the password and origin settings. The reference-harness adapter sets the throttle, uniform-failure and revocation switches `off`, so its graded sign-in answers are Ruby's. `deploy/migrations/0011-auth-signin-throttle.sql` provisions the table; the engine also creates it on first use. |
| **Tests** | `tests/card/auth/signin-hardening.test.ts` (defaults and setting errors; identical answers for unknown, wrong and inactive; the inactive state told only with the right password; the derivation an unknown identifier pays; the per-field messages when off; lock after five failures refusing even the right password, unlock after the period, unknown identifiers counted alike, case- and whitespace-insensitive keying, the per-address lock, reset on success, no table when off; revocation on a password update and on blocked, the session that changed its own password kept across that change, closed and unverified, unchanged and account-less holders kept, nothing revoked when off), `tests/server/session-cookie-secure.test.ts` (Secure on https and on `X-Forwarded-Proto: https`, not on plain http under `auto`, the `always` and `never` overrides, for the sign-in and sign-out cookies). Tests that check the per-field messages pin `DECKO_SIGNIN_UNIFORM_FAILURE=off` explicitly. |

### 5. First-run setup requires a one-time setup token

| | |
|---|---|
| **Ruby** | The `/setup` route is a port surface (`src/server/first-run-routes.ts`); its account census follows `Card::Auth.needs_setup?` (`lib/card/auth/setup.rb`). Ruby has no setup token. |
| **Port** | While `DECKO_FIRST_RUN=1` and the deck has no account, `POST /setup` creates the owner only when the request carries a valid setup token: in the printed link's query (`/setup?token=...`, which the form posts back to) or in the form's `setup_token` field (or the JSON body's `setup_token`). One gate (`src/card/auth/setup-token.ts`, called from `src/server/first-run-routes.ts` on every host) accepts a token from any of three sources: a **deploy-issued** token (`npm run setup-token`, which `npm run deploy` runs last, and Bunny one-key provisioning generate 32 random bytes, store only their SHA-256 in `deck_setup_tokens`, migration `0012-first-run-setup-token.sql`, and print the link; no operator secret is needed); the operator's **`DECKO_SETUP_TOKEN`**, on any host; and, on the Node host when `DECKO_SETUP_TOKEN` is unset, a **boot-generated** token (32 random bytes kept in memory only, printed once as `[first-run] /setup requires this one-time setup token: <token>`; a restart generates a new one). Plain tokens are compared in constant time and the issued ones by digest. A missing or wrong token answers 403 with the form and creates nothing; a `GET` through a stale link answers 403 before the form is filled in. With no source available (an edge host with neither an issued token nor `DECKO_SETUP_TOKEN`) setup is refused with a message naming `npm run setup-token` and `DECKO_SETUP_TOKEN`. Creating the owner deletes the issued tokens, and the window closes for good with the first account. |
| **Why** | Without it, reaching a freshly deployed deck first is enough to become its owner. |
| **Compatibility** | Scripts that post to `/setup` must send the token. Nothing outside `/setup` changes. |
| **Configuration** | None required for a deploy: the deploy chain issues the token and prints the link. `DECKO_SETUP_TOKEN` (optional): an operator-chosen token, accepted beside the issued one (an environment variable on Node, a secret or variable binding on Workers and Bunny). Unset on Node: one is also generated and printed at start. |
| **Tests** | `tests/card/auth/first-run-setup.test.ts` ("the one-time setup token": missing, empty and wrong tokens refused with 403 and no account; no token available refused naming `DECKO_SETUP_TOKEN`; a generated token accepted, none generated when the operator set one; the field on the form; a deploy-issued token accepted through the link and spent by the owner's creation), `tests/card/auth/first-run-setup-endpoint.test.ts` (the booted Node host prints the token; a guessed token is refused and the window stays open; the printed token creates the owner), `tests/exercise/accounts-3.test.ts` (the operator token on the Node host), `tests/deploy/deploy-worker-write-surface.test.ts` (the operator token as a Workers binding, in workerd), `tests/deploy/bunny-provision-writable.test.ts` (the provisioning's issued digest accepted for the printed token only, replaced by a re-issue, gone once cleared), `tools/deploy/rehearse-deploy-button.mjs` (the deploy-issued link end to end under wrangler). |

## Migration tooling

### Migration compatibility at a glance

- **Deck conversion:** supported from a SQLite deck file, a MySQL dump
  (mysqldump text) and deck-INSERT seed SQL. **PostgreSQL is unsupported** —
  no PostgreSQL adapter exists in the tree. See the compatibility matrix at
  the top of `tools/migrate/IMPORT_DECK_RECIPE.md`.
- **Passwords during a shared-engine migration:** Ruby cannot verify the
  port's default PBKDF2 hashes. While Ruby Decko still serves the same deck,
  the port must run with `DECKO_PASSWORD_HASH=legacy-sha1`; an account whose
  password the port already set or upgraded cannot sign in through Ruby until
  its password is set again. Full detail: approved divergence 1 above.
- **Transaction semantics:** on Cloudflare D1 a save is atomic through a
  compensating journal rather than `BEGIN`/`COMMIT`, and rolled-back ids are
  not reused — a difference from Ruby's and plain SQLite's behavior that a
  migration validating rows mid-import must account for. Readers on other
  connections are not served a save's rows before it commits: a read that
  finds a save in progress waits for it to commit or roll back, so a failed
  save is never visible to another user, at the cost of reads waiting for
  the save in progress. This is verified under workerd's local D1
  (Miniflare); against hosted D1 it is checked by
  `tools/hosted-conformance/run.mjs` (`docs/hosted-conformance.md`), which
  has not yet been run against a hosted service. Authoritative table:
  `docs/decisions/0007-atomic-saves-and-transaction-contract.md`.
- **Schema the port adds on top of the Ruby deck.** A deck imported from Ruby
  has none of the following; they arrive with the deploy migration chain, and
  the engine reads them. The names `auth_sessions` and `deck_data_version`
  appear nowhere in the `card` gem or in any `card-mod-*` gem, so none of
  these objects has a Ruby counterpart:
  - **`deploy/migrations/0003-deck-data-version-stamp.sql`** — the
    `deck_data_version` table (`id` pinned to 1, `version`) with its seed row,
    and **six triggers** that advance it: `AFTER INSERT`, `AFTER UPDATE` and
    `AFTER DELETE` on `cards`, and the same three on `card_references`. The
    render path reads the counter once per request and drops everything it
    retained between requests when the value has moved. **A deck that has the
    table but not the triggers reads a stamp that no write ever advances**, and
    nothing in the engine's own read path can tell the difference — see
    `docs/decisions/0002-request-local-state-and-one-trip-rendering.md`,
    "What the stamp does not cover".
  - **`deploy/migrations/0005-auth-sessions.sql`** — the `auth_sessions` table
    (`token_hash` primary key, `account_card_id`, `created_at`, `expires_at`)
    and its two indexes. The raw session token is never stored: the row holds
    its SHA-256 digest and every lookup re-derives and re-compares it.
    **Sessions do not carry across engines.** Ruby Decko has no such table and
    keeps sessions its own way, so a session row written by one engine is not
    read by the other: an operator who moves traffic between Ruby and this port
    signs every user out once, at the switch.
  - **`deploy/migrations/0008-cards-serving-path-indexes.sql`** — the four
    serving-path indexes (`cards_name_trash_index`, `cards_right_id_trash_index`,
    `cards_codename_present_index`, `cards_key_last_char_index`) and the
    `DROP INDEX cards_trash_index` they replace. Index entries only: no card
    row is read, modified or written.
  - **`deploy/migrations/0002-card-text-binary-lookup-indexes.sql`** — two
    BINARY-collation unique indexes on `cards` (`key`, `codename`) that let
    the engine's case-sensitive key lookups seek instead of scanning the live
    deck. Index entries only, same as above.

### Shadow routing never runs a write twice

The shadow router (`tools/shadow/shadow-router.mjs`) lets a site run decko-ts beside Ruby Decko during a migration: every request goes to Ruby, whose answer the visitor gets, and a copy goes to decko-ts for comparison. The two engines share the deck, so copying a write would run it twice: two sets of rows and history, two emails, two uploads.

- **Default, and the shipped policy (`tools/shadow/routes.shadow.json`):** only `GET` and `HEAD` are copied. Every other method goes to Ruby alone and is logged as `write-not-shadowed`.
- **Comparing writes:** set `"writes": "isolated"` and `"isolatedUpstream"` to a server started with `tools/shadow/isolated-write-upstream.mjs --primary <deck.sqlite3>`. That server snapshots the deck into a scratch directory (read-only on the primary), applies each replayed write to the snapshot only, drops mail, stores uploads in the scratch directory, blocks outbound network calls, and deletes the snapshot when it stops. The router replays writes only after the server declares this isolation, and refuses to start if the isolated upstream is the Ruby or the decko-ts read upstream.
- **Limits:** the isolated upstream snapshots SQLite decks. For a deck on D1, libSQL or PostgreSQL, take a copy with that platform's own tools into SQLite first, or leave writes at `skip`. The snapshot diverges from the live deck as the comparison runs; it is for comparing write behaviour, not for serving.
- **Tests:** `tests/tools/shadow/shadow-writes.test.ts` (each mutating method reaches Ruby once and decko-ts never; an upstream without the isolation declaration gets no writes; a real isolated upstream changes its copy while the primary file stays byte-identical, and blocks the network).
