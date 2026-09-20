# Auth port notes — sessions + actor resolution (`src/card/auth/`)

How the AUTH surface works in the Ruby truth source and how `src/card/auth/`
ports it: a session store (token -> actor) over the `SQLDatabaseDriver`
seam, plus the system-actor constructors that give engine writes a real
actor instead of caller-invented ones. Every claim carries a
`file:line` cite into the installed gems:

- `card` — `C:\Ruby33-x64\lib\ruby\gems\3.3.0\gems\card-1.110.0`
- `card-mod-account` — `...\gems\card-mod-account-0.20.0`

Ported surface: `src/card/auth/{session-store,session-token,actor,migrations,index}.ts`,
`db/migrations/001-auth-sessions.sql`. Tests: `tests/card/auth/` — 44 tests
against real better-sqlite3 storage loaded with `db/schema.sqlite.sql`.

---

## 1. The Ruby trail — what `Card::Auth` actually does

`Card::Auth` (lib/card/auth.rb) is a facade over four submodules; the
semantics live there:

| Concern | Ruby | Cite | Port |
|---|---|---|---|
| **Always an actor** | `current_id` defaults to `Card::AnonymousID`; Anonymous is a real card, never null | `lib/card/auth/current.rb:7-9` (`@current_id \|\|= Card::AnonymousID`) | the actions layer always receives an `Actor`; `actorAnonymous()` builds the signed-out one |
| Signing in | `signin` writes the user id into the request session under `session_user_key` | `current.rb:35-41`; key = `:"user_#{db}"` (`current.rb:82-84`) | `createSession(accountCardId)` inserts a session row |
| Session storage | the hash rides Rails' session store (`Env.session` = `request&.session \|\| {}`) | `lib/card/env.rb:21-23`; rows in the core `sessions` table (ActiveRecord::SessionStore — opaque serialized blobs) | explicit `auth_sessions` rows — queryable, revocable; NOT the Rails table |
| Re-validating the id | every request re-checks that the session's id still resolves to an account card, else signs in Anonymous | `current.rb:58-63` (`signin_with_session`: `card_id = nil unless card_id.card&.account?`) | `lookupSession` JOINs `cards` and returns null when the card is gone (the `account?` set-membership half is deferred, see 2.6) |
| Token signin | JWT with `user_id` + `exp` claims, signed with the app secret | `lib/card/auth/token.rb:9-15` (`encode`), `:17-23` (`validate!`), `:38-41` (`signin_with_token`) | the port's single mechanism: opaque bearer token + `expires_at` column; expiry enforced in `lookupSession` |
| Token expiry config | `Card.config.token_expiry.from_now` | `token.rb:32-34` | `createSession({ttlSeconds})` / `defaultTtlSeconds` — the VALUE is app config in Ruby, so the port takes it per call; the 48h `DEFAULT_SESSION_TTL_SECONDS` is a port decision, not a ported number |
| System writes | `as_bot` proxies to `as(Card::DeckoBotID)` | `lib/card/auth/proxy.rb:26-29`; DeckoBot's permissions cannot be disabled: `lib/card/auth/permissions.rb:9` | `actorBot(driver)` |
| Where the IDs come from | NOT gem constants — generated at boot from card codenames: `Card.const_get_or_set("#{codename.to_s.camelize}ID") { id }` | `lib/card/codename.rb:108` | resolved from the deck's `cards` table by codename at call time (`actorByCodename`); codename `"anonymous"` / `"deckobot"` (`ANONYMOUS_CODENAME` / `DECKOBOT_CODENAME`) |
| Names are deck data | the Anonymous card is seeded with `name: Anonymous`, `codename: anonymous` | `card-mod-account-0.20.0/data/real.yml:69-72` | the `Actor.name` comes from the resolved row, never hardcoded |
| "every deck starts with two accounts: DeckoBot and Anonymous" | setup-time invariant | `lib/card/auth/setup.rb:44` | `ActorNotFoundError` message cites this; a deck missing those codename cards is not bootstrapped |

### 1.1 What was deliberately NOT ported

- **`as` / proxy save-restore machinery** (`proxy.rb:5-24`, `:63-76`):
  Ruby mutates process-global Auth state for the duration of a block. The
  engine has no global: the actions layer takes an explicit `Actor`
  parameter, so "run as bot" collapses into "pass `actorBot()`'s value".
  Nothing global exists to save/restore.
- **Password authentication** (`auth.rb:20-38`: `authenticate`,
  `password_valid?`, SHA1 `encrypt`): account-credential checking is
  HTTP-layer work (the worker/deploy stream), not engine surface. The
  engine consumes its OUTPUT (a resolved actor); it never sees passwords.
- **`find_account_by_email`** (`current.rb:73-76`, `:92-98`): CQL search
  over `+*account`/`+*email` cards — needs the rule layer's account
  set semantics; deferred with the account-mod port.
- **`Auth.serialize` / `with`** (`auth.rb:40-42`, `proxy.rb:48-59`):
  request-serialization helpers for the Ruby process model.
- **API keys**: decko's api-key mod territory, out of scope here.

## 2. Semantic decisions in the port

1. **Token at rest is a digest, never the raw secret.** `createSession`
   mints 32 crypto-random bytes (hex, 64 chars — `SESSION_TOKEN_BYTES`),
   stores only `sha256(token)` in `auth_sessions.token_hash` (PRIMARY KEY),
   and returns the raw token exactly once. Lookup digests the presented
   token and compares digests.
2. **Constant-time compare on lookup — as an injectable seam.** Every
   lookup routes the presented-vs-stored digest comparison through
   `tokensEqual` (byte-wise XOR accumulate over the longer input; no
   early exit; no node-only `timingSafeEqual` so the same code runs in
   workers). The comparator is a `SessionStoreOptions` knob: the mutation
   test (`compareTokens: () => false`) proves a store that skips it fails
   every lookup, i.e. the comparison is load-bearing rather than
   decorative — and a naive `===` comparator keeps behavior identical,
   isolating "what skipping constant time changes" (nothing observable,
   only the timing profile) from "whether the compare runs".
3. **One mechanism where Ruby had two.** Ruby splits identity between
   Rails cookie sessions (revocable, opaque) and JWTs (stateless,
   expiring). The port's session row is the union: bearer token like the
   JWT, server-side row like the session store — `revokeSession` is
   immediate (Ruby's JWT path has no revocation; `token.rb:25-30` only
   validates).
4. **Expiry is enforced, rows are kept.** `lookupSession` rejects
   `now > expires_at` (canonical fixed-width TEXT compares
   lexicographically == chronologically; the `expires_at` instant itself
   is still valid — expired means strictly after, the tested boundary).
   Expired rows are not deleted on read (Ruby's session-store janitor is
   infra, not semantics); a future purge task can sweep by index
   (`index_auth_sessions_on_expires_at`).
5. **Hash lookup + digest compare ordering.** The row is fetched by
   `token_hash = ?` (the digest is one-way, so SQL equality leaks nothing
   about the raw token), then the comparator has the final word, then
   expiry, then the card-resolution check — fixed order on every path.
6. **Dead-card sessions are null, not Anonymous.** Ruby re-signs a session
   whose card vanished into Anonymous (`current.rb:58-63`) because Ruby
   must produce SOME current user for a web request. The engine's lookup
   returns `null` and the caller decides (the actions layer treats null
   as "no actor — refuse or fall back to `actorAnonymous()`"). Also
   null: a user-card row whose `name` is NULL (user cards are simple
   cards; NULL there is a broken deck state, not an edge case to guess).
   DEFERRED half of the check: `card&.account?` is +\*account
   set-membership — needs the rule layer (wave 3). A resolved non-account
   card name is accepted today; noted as the one semantic gap.
7. **System actors resolve by codename per call, not boot-time.** Ruby
   bakes `Card::AnonymousID` / `Card::DeckoBotID` as constants at boot
   (`codename.rb:108`); the engine resolves the same rows from
   `cards.codename` on demand (cheap indexed lookup, `trash = 0` — trashed
   cards resolve as nothing, matching the fetch layer's default scope).
   Ids are read from data, never assumed (tested with a shifted-id deck).
8. **Migration ownership.** `auth_sessions` is engine-owned NEW surface —
   the core `sessions` table (Rails session store) is untouched and the
   core DDL (`db/schema.sqlite.sql`) was not edited. The DDL lives in
   `db/migrations/001-auth-sessions.sql`; the deploy stream applies it
   via its own tooling (wrangler d1 migrations) and local engines/tests
   via `runAuthMigrations()` in `src/card/auth/migrations.ts` (Node-only:
   reads the directory; edge code must not import it). Idempotency is
   doubly ensured — `IF NOT EXISTS` DDL plus an `auth_migrations`
   bookkeeping table — so a deploy-applied database and this runner never
   fight (tested: apply on a DB that already has the table with no
   bookkeeping row succeeds).
9. **No cross-stream imports.** The auth module imports only
   `src/server/driver.ts` types (+ `SQLDateTime` from `src/server/schema.ts`).
   The `sqlDateTime` formatter has a local twin here (history/act.ts owns
   the original) on purpose: the auth layer stands alone at the seam the
   coordinator wires.
10. **Integration with the parallel writes stream is import-only.**
    `tests/card/auth/integration-imports.test.ts` imports the auth index
    STATICALLY (typechecked) and `src/card/actions/index.js` via a
    computed specifier that degrades to a documented no-op until the
    writes stream lands — no behavior coupling; the coordinator wires
    `resolveActorFromToken`'s `Actor | null` into the actions' actor
    parameter at review time.

## 3. The wiring seam (for the coordinator)

```ts
import { SessionStore, actorBot, actorAnonymous, runAuthMigrations,
         type Actor } from "src/card/auth/index.js";

await runAuthMigrations(driver);            // once per engine boot (local); deploy stream owns edge
const auth = new SessionStore({ driver });  // options: now?, defaultTtlSeconds?, compareTokens?

// per request:
const actor: Actor | null = await auth.resolveActorFromToken(bearerToken);
//   alias of lookupSession(token) — same result, actions-layer name

// system writes:
const bot: Actor = await actorBot(driver);       // Auth.as_bot analog
const anon: Actor = await actorAnonymous(driver); // Auth.current_id default analog

// session lifecycle:
const { token, expiresAt } = await auth.createSession(accountCardId, { ttlSeconds });
const revoked: boolean = await auth.revokeSession(token);
```

`Actor` is `{ id: number; name: string }` — the acting card's id and name.
The actions layer maps `actor.id` onto the `actorId` parameter the
`ActWriter` already consumes (creator/updater/act.actor_id filling;
see docs/history-port-notes.md section 3, deferred item 1).

## 4. Deferred to later waves

- `account?` set-membership in session re-validation (decision 6) — rule layer.
- Email-based account lookup + password auth — HTTP/account-mod layer.
- Expired-row janitor sweep (decision 4) — a basket task analog.
- Role resolution (`current_roles`, `current.rb:28-33` —
  `anyone_signed_in` + role sets) — needs the set machinery; the port
  exposes only the actor identity for now.
- Rate-limiting / lockout — HTTP layer.
