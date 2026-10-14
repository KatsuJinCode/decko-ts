# Security policy

decko-ts is a port of Ruby Decko (card 1.110.0, decko 0.20.0). Its acceptance criterion is exact parity with Ruby Decko in rendering, persistence, semantics and side effects, including Ruby's defects, so that an existing deck behaves the same on either engine — except where a difference is declared below.

There are seven exceptions to that parity rule, listed below, in three classes:

1. **Security holes.** Where Ruby's behaviour lets one user act against another (run script in their browser, act with their session, read or guess their credentials, forge a request under a visitor's session, write to the deck's storage without permission), the port does not copy it. Divergences 1, 3, 5 and 7.
2. **Credential and secret handling.** Where Ruby stores or compares a secret in a way that is weaker than it needs to be, the port stores or compares it more strongly. Divergences 2 and 4.
3. **Crashes and the rule-less-deck case.** Where Ruby fails with an internal error, the port gives the error Ruby intended; and where Ruby denies a deck that carries no permission data at all, the port renders it, because the alternative denies every card of every deck that never ran setup. Divergence 6.

Each exception is an *approved security divergence*: it is listed below with what Ruby does, what the port does, why, what it costs in compatibility, how to configure it, and the test that pins it. Anything not listed here is meant to behave exactly as Ruby Decko does; a difference that is not listed is a defect. Three kinds of deliberate difference are governed outside this list, and none of them is a security divergence:

1. **Transaction and save differences on adapters without interactive transactions** — listed and pinned by [decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md).
2. **Differences that exist only on the oracle schema Ruby actually runs on.** These are declared step by step, with their reasons, in `tests/fixtures/persistence-oracle/deliberate-differences.json`, and they are differences between the port and the throwaway oracle deck rather than between the port and Decko. Step 7 is the one of that kind: Ruby inserts a second `cards` row for a compound name whose junction is trashed, and that insert only succeeds on the oracle deck, which lacks the upstream schema's `UNIQUE (left_id, right_id)` index; the same Ruby save fails on a schema carrying that index. The port revives the existing trashed junction row instead, recording the revival's name, type, content, trash and part changes, which keeps one row per name and is valid on the production schema.
3. **Row-level differences the persistence oracle declares**, in the same file. Divergence 1 below ("Stored HTML is sanitised safely") accounts for steps 20, 22 and 31 of that list; the remainder concern Ruby's own bugs, which are reproduced on purpose.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than in a public issue, through the
GitHub Security Advisory channel on **the repository this project is developed in** — its
`Security` tab, "Report a vulnerability". That is this project's own repository, so an
advisory filed against a repository you do not hold is not a second channel: there is no
email fallback. Include the request or content that triggers the problem and what you
observed. Because of the nature of a security concern, a flaw that exists in Ruby Decko is
not disclosed here until a private channel is established to disclose it
responsibly. Three Ruby Decko flaws are withheld on those terms, each marked where it is
material:

1. the account-holder name-change authorization gap;
2. the crash that follows from it on a production deck;
3. the stored-HTML sanitiser gap.

None of the three is described anywhere in this repository beyond the name above
and the entry that governs the port's own behaviour on it: no upstream file, line,
guard name, request shape or payload, and no explanation of what Ruby does with
it. The entries below say what the port does, not what Ruby accepts.

## Deployment obligations the port does not meet for you

These are properties of a running deployment rather than divergences from Ruby, so they are
not on the approved-divergence list above. They are stated here because a reader deciding
whether to expose a deck publicly has to know them, and because the port's own defaults do
not supply them.

### Sign-in has no rate limiting and no lockout, on any host

There is no attempt counter, no per-account or per-IP throttle, no delay after a failure and
no lockout, in the sign-in path or anywhere else. Every `POST /update/*signin` runs the
password check, and a wrong password costs the caller one PBKDF2 derivation and the operator
nothing. This is true of every host — Node, Cloudflare Workers and Bunny alike — because the
engine contains no rate-limiting code to configure; a search of `src/` for a rate limit, a
lockout or an attempt counter returns nothing. Ruby Decko does not do this either, so this is
parity, not a regression; but parity with a brute-forceable default is still a brute-forceable
default, and a deployment that is publicly reachable should not inherit it silently.

- **What an operator does instead:** apply their edge provider's throttling in front of the
  deck (Cloudflare WAF rate-limiting rules, Bunny's equivalent, or a reverse proxy). The
  engine offers no hook of its own for this, so there is nothing to switch on here — it has to
  happen at the edge.
- **The one built-in lever is the cost of an attempt.** `DECKO_PASSWORD_PBKDF2_ITERATIONS`
  (approved divergence 2 above) sets how expensive each guess is. Raising it makes online
  guessing slower in proportion, and it is the only in-process control the port offers. It is
  bounded by the runtime: Cloudflare's production Workers runtime refuses PBKDF2 above 100,000
  iterations, so a Workers deployment cannot push the cost arbitrarily high and must rely on
  the edge for the rest.
- **Not covered by either:** a distributed attack spread across many source addresses is a
  problem only edge throttling addresses, since nothing in the engine counts per IP at all.

## Approved divergences

### 1. Stored HTML is sanitised safely

| | |
|---|---|
| **Ruby** | Ruby Decko 0.20.0 does not apply the port's cleaner, and a RichText card stored under it can hold markup another reader's browser will act on. That is a vulnerability in Ruby Decko, not behaviour this port reproduces. Because of the nature of this security concern, it will not be disclosed here until a private channel is established to disclose it responsibly; what Ruby accepts, how it reaches that answer, and the affected upstream files and their line numbers are withheld until that disclosure can happen responsibly. |
| **Port** | The same tag and attribute allowlists, and the same tag-finding expression, so the same tags are kept and dropped. Attributes are read with the HTML tokenizer's rules; URL attributes (`href`, `src`, `cite`) must be relative or use a non-script scheme (`http`, `https`, `mailto`, `tel`, `sms`, `ftp`, `skype`, `callto`, `webcal`, `irc`, `ircs`, `xmpp`, `geo`, `news`, `nntp`, `feed`), plus `data:image/*` for `img src` with SVG excluded; `style` values may not contain `expression()`, `behavior:`, `-moz-binding`, `@import` or a script URL; values are escaped; comments are removed only where they lie in text; a stray `<` that would open markup is written as `&lt;`. When a browser reads exactly the same attributes from Ruby's output as the port keeps, Ruby's bytes are stored unchanged. |
| **Why** | Without it, one user's edit to a RichText card could store script that runs for every reader of that card. |
| **Compatibility** | Ordinary content is stored byte for byte as Ruby stores it. Measured over the stored HTML of a real 19,000-card deck, 7,208 of 7,354 HTML-bearing cards clean identically. The other 146 are cards whose stored bytes Ruby cleans into markup that is malformed, misparses an attribute, or names a scheme the port refuses; which of those a card is follows from the withheld Ruby behaviour, so the count is reported without the shapes that identify it. Existing content changes only when it is saved again. |
| **Configuration** | None. Card types that Ruby does not clean (HTML, layout, email template, script and style types, `+*html_message`) are not cleaned by the port either; editing those types should be limited to trusted roles, as in Ruby. |
| **Tests** | `tests/card/actions/content-clean-security.test.ts`: a corpus built from the OWASP XSS Filter Evasion Cheat Sheet and the cleaner's own edge cases, checked by an independent browser-tokenizer verifier, alone and followed by page markup; 4,000 random hostile mixtures; ordinary content byte-identical to Ruby. The persistence oracle declares the resulting row differences (`tests/fixtures/persistence-oracle/deliberate-differences.json`, steps 20, 22 and 31). |

### 2. Passwords: new ones are stored with PBKDF2

| | |
|---|---|
| **Ruby** | `Card::Auth.encrypt` (`lib/card/auth.rb`) stores `SHA1("<salt>--<password>--")` as 40 hex characters, where the salt is itself the SHA-1 of a timestamp, and `password_valid?` compares it with ordinary string equality. One unkeyed SHA-1 per guess lets a stolen database be brute-forced quickly. |
| **Port** | Ruby's digests keep verifying, so every existing account signs in unchanged. A newly set or changed password is stored as PBKDF2-HMAC-SHA256 with a random 16-byte salt, in the form `pbkdf2_sha256$<iterations>$<salt, base64>$<hash, base64>`. On the next successful sign-in, a legacy digest (or a PBKDF2 hash with fewer iterations than configured) is replaced. Iterations follow the OWASP Password Storage Cheat Sheet: **600,000**. |
| **Why** | A database copy is the usual way passwords leak; PBKDF2 at OWASP's work factor makes each guess hundreds of thousands of times more expensive than Ruby's single SHA-1. PBKDF2 is available through WebCrypto on every runtime the port supports (Node, Cloudflare Workers, Bunny/Deno), which rules out bcrypt, scrypt and Argon2 without native code. |
| **Compatibility** | **Ruby cannot verify a PBKDF2 hash.** If Ruby Decko and the port serve the same deck (for example during a migration), an account whose password was set or upgraded by the port can no longer sign in through Ruby. Such sites set `DECKO_PASSWORD_HASH=legacy-sha1`: new passwords are then stored as Ruby's digest and nothing is upgraded. Switch to the default once Ruby no longer serves the deck; accounts upgrade as their owners sign in. |
| **Cloudflare Workers** | Cloudflare's production runtime refuses PBKDF2 above **100,000** iterations (cloudflare/workerd issue 1346; local `workerd` does not enforce it). On Workers the default is therefore 100,000, below OWASP's figure; it rises automatically (at the owners' next sign-in) if the deck later moves to a host without that limit. A hash created elsewhere with more iterations cannot be checked on Workers: the sign-in fails with a message saying so, not "Wrong password", and a password reset on Workers fixes it. |
| **Configuration** | `DECKO_PASSWORD_HASH`: `pbkdf2` (default) or `legacy-sha1`. `DECKO_PASSWORD_PBKDF2_ITERATIONS`: a whole number, at least 100,000 and at most the runtime's limit. An invalid value makes password saves and sign-in fail with a message naming the setting; reads are unaffected. |
| **Tests** | `tests/card/auth/password-hash.test.ts` (legacy and PBKDF2 both verify; the RFC 7914 PBKDF2 test vector; independent recomputation with `node:crypto`; upgrade decisions; the Workers limit; configuration errors), `tests/card/auth/signin.test.ts` ("password upgrade at sign-in"), `tests/card/auth/first-run-setup.test.ts`. The persistence probe passes under both password policies; its declared differences (`tests/fixtures/persistence-oracle/deliberate-differences.json`) concern Ruby bug reproduction and the stored-HTML divergence above, not password hashing. |

### 3. Cross-site requests: writes and sign-in must come from the deck's own pages

| | |
|---|---|
| **Ruby** | No forgery protection: decko 0.20.0 and card 1.110.0 contain no `protect_from_forgery`, and Rails' origin check lives inside it. A page on another site can submit a form that edits a card with a visitor's session, or signs the visitor in to an account of the attacker's choosing. The session cookie's `SameSite=Lax` blocks the first in current browsers for cross-site posts, but not from a sibling subdomain, and does nothing for the second. |
| **Port** | Every state-changing request (card create, update and delete; `/update/*signin`; sign-out; the account password and reset forms; first-run setup) passes an origin check before anything runs: `Sec-Fetch-Site: cross-site` or `same-site` is refused; otherwise an `Origin` header must name the deck's own host (or a trusted origin), and `Origin: null` is refused; otherwise a `Referer` must. A request with none of these did not come from a browser page and passes, so scripts and API clients work as before. A refused request gets 403. |
| **Why** | Forged edits and login CSRF act with, or against, a visitor's identity without their knowledge. Checking the origin needs no token, so no page's bytes change. |
| **Compatibility** | Same-origin forms, the editor, and token-authenticated API calls are unaffected. A site that posts from another origin it controls (an external editor) lists it in `DECKO_TRUSTED_ORIGINS`. Hosts are compared by host and port, not scheme, so a TLS-terminating proxy does not cause false refusals. |
| **Configuration** | `DECKO_ORIGIN_CHECK=off` restores Ruby's behaviour. `DECKO_TRUSTED_ORIGINS`: comma-separated `scheme://host[:port]` origins. |
| **Tests** | `tests/server/write-routes-origin.test.ts` (cross-site Origin, `null` Origin, `Sec-Fetch-Site`, foreign Referer and a foreign port are refused with the card unchanged; a cross-site sign-in mints no session, including on the edge hosts' sign-in-only path; same-origin, Referer-only and header-less requests, trusted origins and the off switch pass), `tests/card/auth/first-run-setup.test.ts` (a cross-site setup POST creates no account), `tests/deploy/bunny-edge-signin-session-roundtrip.test.ts` (the Bunny edge reads both settings from its own environment). The Node host's cross-site reset, password and sign-in posts are covered by `tests/card/auth/reset-flow-endpoint.test.ts` (13 tests, `npx vitest run tests/card/auth/reset-flow-endpoint.test.ts`). That suite is **development evidence, not part of the published package**: it opens `fixtures/test-corpus/` at module load, and `docs/TESTING.md` §1 records that fixture as not redistributed. With the fixture present the suite runs; in a clean clone of the published package it is not there, and the suite does not run. |

### 4. Secrets are compared in constant time

| | |
|---|---|
| **Ruby** | Password digests are compared with `==`, whose running time depends on where the strings first differ. |
| **Port** | Password digests and hashes, session tokens and signed-token signatures are compared with a constant-time comparison (`src/card/auth/session-token.ts`), which runs over the whole input whatever it contains. The comparison folds the two lengths in as well: the byte loop zero-pads the shorter input, so without an explicit length check a shorter value matching the longer one's prefix would compare **equal** (every padded position XORs 0 against 0). Length is the one thing the comparison branches on, and comparing two lengths reveals nothing a boolean result did not. |
| **Why** | A timing difference can leak a secret one character at a time to a patient remote attacker. |
| **Compatibility** | None: the results are identical, only the timing differs. |
| **Tests** | `tests/card/auth/session-token.test.ts` covers the comparison, including the padded-prefix case the length check exists for (`[1,2,3]` against `[1,2,3,0,0,0]`, and `"x"` against `"x\0"` through the string path); `password-hash.test.ts` and `signin.test.ts` cover its use for passwords. |

### 5. An account holder's name may be changed only by its holder or Help Desk

| | |
|---|---|
| **Ruby** | Ruby Decko 0.20.0 does not enforce the authorization check the port enforces here, so a rename a card's own author may perform is one Ruby does not refuse for somebody else's account. That is a vulnerability in Ruby Decko, not behaviour this port reproduces. Because of the nature of this security concern, it will not be disclosed here until a private channel is established to disclose it responsibly; what Ruby fails to refuse, how it reaches that answer, and the affected upstream files and their line numbers are withheld until that disclosure can happen responsibly. |
| **Port** | `assertMayRenameAccountHolder` (`src/card/actions/card-action-engine.ts:1051`) implements the check's evident intent: an account holder's name change is refused before anything is written, with Ruby's own error (`NAME: cannot rename Account Holder`, HTTP 422), unless the actor is the account holder or a member of Help Desk. Those two cases are the whole allowance — administrators are not among them, and the check has no always-allow arm. |
| **Why** | Renaming another user's account holder acts against that user: it changes the name their session, their notification mail and the references pointing at them answer to, without their involvement. |
| **Compatibility** | A rename Ruby accepts, the port refuses; nothing else changes, because the port's allowance (own account, Help Desk) is the check's evident intent. On a clean deck the rename Ruby accepts cascades into the rows and the notification mail written after it, so the difference reaches **36 of the 90** side-effects battery steps. The battery mismatches at 37 steps in all, and the 37th is **not** this divergence: `admin-close-own-account` is a separate closure-mail difference, still under investigation (see the Tests row, and `docs/coverage-inventory.md`, which carries the same 36/1 split). On production decks a second Ruby flaw intervenes before the divergence can show (the crash named second under "Reporting a vulnerability"; withheld here on the same terms as the one above), which is why the production grade was 90 of 90 with seven declared pins (`tools/parity-side-effects/scenarios.json`). That crash depends on production deck state and does not reproduce on a clean deck, so three of the seven production pins do not transfer to it. |
| **Configuration** | None. |
| **Tests** | `tests/tools/side-effects-scenario-battery.test.ts`: the 90-step battery on the committed synthetic deck (`reference-harness/fixtures/write-battery-v1`) pins the exact clean-deck verdicts — 49 pass, 4 declared, 37 mismatched. **36 of those 37 trace to this divergence** (two rename refusals, `probe-rename-other-account` and `admin-rename-account-holder`, and 34 cascade steps, which differ on `mailText`/`mailHtml` and the action-id sequence). **The 37th, `admin-close-own-account`, does not**: it differs on `mail`, `mailHtml`, `mailText` and `session`, and is a closure-mail difference still under investigation, not an account-holder-rename consequence. The suite's own header records the same 36/1 split. Any engine change at any of the 37 fails the suite. |

### 6. A deck with no read rules renders in full, where Ruby denies

| | |
|---|---|
| **Ruby** | On a deck whose `read_rules_hash` holds no rule at all, `permission_rule_id` resolves to `nil` and `ok_to_read?` denies (`set/all/permissions.rb:139-146`). A deck with no read rules therefore renders nothing. |
| **Port** | The port treats a deck carrying **no read rules at all** as carrying no permission data and renders it. `canReadByRuleLookupDepth` (`src/card/permissions/read-rules.ts`) returns `undefined` — "no opinion", so the walk continues and the card is readable — both on the early return when the deck has no read rules or no `*all+*read` catch-all, and on the terminal return when no rule candidate resolves. The CQL path carries the same allowance with one narrowing: `RenderEngine.cqlPermissionOptions` (`src/card/render.ts`) answers `alwaysOk: true` for a rule-less deck, but with `excludedRightIds` set to the account-field rows, so `/api/query`-shaped statements still refuse to serve `*password`, `*salt`, `*email`, `*status` and `*api_key` — the six codenames on `ACCOUNT_RIGHT_CODENAMES`. `api_key` is card-mod-api_key's account field rather than card-mod-account's, and it is on the list because it is `include_set Abstract::AccountField` like the rest and its content authenticates as the account. |
| **Why it is not simply closed** | Every real deck bootstraps `*all+*read` (`card/auth/setup.rb:44`, as cited by the test that pins the allowance), so the allowance only reaches decks that never ran setup: synthetic seeds, replay fixtures, and bare test decks. Failing closed there denies **every** card, because there is no rule to match, which turns those fixtures into decks that render nothing. Measured on this tree by flipping both returns in `read-rules.ts` to fail closed: the permissions suite costs exactly one test, `tests/card/permissions/read-permission.test.ts` "renders rule-less decks in full (the documented synthetic-seed divergence)" — the pin for this entry — but the render and CQL suites lose far more, because their fixtures are largely rule-less seeds: **78 of 247 files fail** across `tests/card/render/` and `tests/card/cql/`. The reference-harness grade is unaffected either way (its fixture carries the catch-all). So this is a real port-faithfulness gap and a large, deliberate change, not a one-line correction. |
| **The demo deck's safety rests on migration 0009** | **The demo deck's protection from this divergence rests entirely on `deploy/migrations/0009-demo-account-read-rules.sql`, not on the engine.** It is what takes the demo deck out of the allowance's blast radius: the `*all+*read` catch-all plus the five `<field>+*right+*read` grants that `real.yml` gives the Help Desk role. Without it the demo deck serves an anonymous requester the owner's password digest, salt and email address — which is exactly the leak the scoped `excludedRightIds` allowance was added to close, and which the catch-all then closes properly. It sorts after `0006-demo-role-substrate.sql` because every row is a `card_references` entry whose referee is the Help Desk role card, and 0006 is what creates that role. A deploy that applies the chain but skips 0009 has a demo deck with accounts and no read rules, which is the one shape where this divergence is a live exposure. |
| **What a real deck must do** | Bootstrap `*all+*read`. Run `decko`'s own setup (`card/auth/setup.rb`), or apply `deploy/migrations/0009-demo-account-read-rules.sql`, or create any read rule the closure walk can resolve. The moment a deck resolves at least one read rule the port takes the ordinary fail-closed path, and `hasReadRules && hasCatchAllReadRule` is the condition under which a rule walk that cannot be evaluated denies rather than allows. A deck that has read rules but no `*all+*read` catch-all is **not** protected by this allowance's narrowing — it is still in the allowance — so the catch-all is the part that matters, not merely having some rules. |
| **Tests** | `tests/card/permissions/read-permission.test.ts` — the rule-less render pin above, plus the denial tests that hold the fail-closed arm (`denies the nest, never the host`, `resolves cards without a stored read_rule_id through the live rule walk`). `tests/deploy/demo-account-anonymous-exposure.test.ts` covers the `/api/query` account-field exclusion on the demo deck. `tests/card/render/account-field-cql-exclusion.test.ts` pins the exclusion list itself on a rule-less deck — every account-field codename including `api_key` is excluded, and a right that is not an account field is not. `tests/deploy/deploy-migrations-manifest-contract.test.ts` pins the migration list. |

### 7. An upload is refused before it is stored

| | |
|---|---|
| **Ruby** | A two-step (preliminary) upload is answered at the `:prepare_to_validate` stage (`card-mod-carrierwave set/abstract/attachment/00_upload_cache.rb:8-25`), one stage before `check_permissions` runs at `:validate` (`mod/permissions/set/all/permissions.rb:22-26`). The event stores the file and files a draft action, then ends the act with `abort :success`, which does not roll back (`card/mod/core/set/all/result.rb:63-71`). So an actor with no permission on the card still gets the file into the deck's storage and leaves draft `card_actions`, `card_changes` and `card_acts` rows behind. |
| **Port** | The port checks `ok_to_update?` / `ok_to_create?` before anything is stored (`src/card/actions/card-action-engine.ts`), and a refused upload writes no file and no rows. A permitted two-step upload behaves as Ruby's does: the bytes are stored and the draft action is filed. |
| **Why** | Storing a file for an actor who may not change the card lets anyone who can reach the upload route write to the deck's storage. |
| **Compatibility** | Only refused uploads differ: Ruby answers them with the preview and leaves the file and draft rows; the port answers with its permission error and leaves nothing. |
| **Configuration** | None. |
| **Tests** | The upload permission suites added with this entry pin a denied update (403, no file, draft, change or act), a denied create (403, upload cache empty), a granted update and a granted create, and an ordinary one-step upload denial. |

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
  its password is set again. Full detail: approved divergence 2 above.
- **Transaction semantics:** on Cloudflare D1 a save is atomic through a
  compensating journal rather than `BEGIN`/`COMMIT`, other connections can
  read a save's rows before it commits, and rolled-back ids are not reused —
  a difference from Ruby's and plain SQLite's behavior that a migration
  validating rows mid-import must account for. That visibility window is
  also why write-enabled D1 is presented as evaluation/single-user grade,
  not a supported multiuser deployment: a multiuser deployment on D1 keeps
  writes disabled or accepts that a failed save is briefly visible mid-save.
  Authoritative table:
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
