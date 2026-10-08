# Security policy

decko-ts is a port of Ruby Decko (card 1.110.0, decko 0.20.0). Its acceptance criterion is exact parity with Ruby Decko in rendering, persistence, semantics and side effects, including Ruby's defects, so that an existing deck behaves the same on either engine.

There are two exceptions, and only two:

1. **Security holes.** Where Ruby's behaviour lets one user act against another (run script in their browser, act with their session, read or guess their credentials), the port does not copy it.
2. **Crashes.** Where Ruby fails with an internal error, the port gives the error Ruby intended.

Each exception is an *approved security divergence*: it is listed below with what Ruby does, what the port does, why, what it costs in compatibility, how to configure it, and the test that pins it. Anything not listed here is meant to behave exactly as Ruby Decko does; a difference that is not listed is a defect.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainers rather than in a public issue. Include the request or content that triggers the problem and what you observed. Where the same flaw exists in Ruby Decko, we also report it upstream.

## Approved divergences

### 1. Stored HTML is sanitised safely

| | |
|---|---|
| **Ruby** | `Card::Content.clean!` (`lib/card/content/clean.rb`) finds tags and attribute values with regular expressions, writes kept values back between quotes without escaping them, and does not check URLs. Stored content can therefore carry `javascript:` links, event-handler attributes rebuilt from malformed values (`<img src=x"onerror="...>`), markup spliced together by comment removal, and unterminated markup that runs into the page around it. |
| **Port** | The same tag and attribute allowlists, and the same tag-finding expression, so the same tags are kept and dropped. Attributes are read with the HTML tokenizer's rules; URL attributes (`href`, `src`, `cite`) must be relative or use a non-script scheme (`http`, `https`, `mailto`, `tel`, `sms`, `ftp`, `skype`, `callto`, `webcal`, `irc`, `ircs`, `xmpp`, `geo`, `news`, `nntp`, `feed`), plus `data:image/*` for `img src` with SVG excluded; `style` values may not contain `expression()`, `behavior:`, `-moz-binding`, `@import` or a script URL; values are escaped; comments are removed only where they lie in text; a stray `<` that would open markup is written as `&lt;`. When a browser reads exactly the same attributes from Ruby's output as the port keeps, Ruby's bytes are stored unchanged. |
| **Why** | Any user who may edit a RichText card could otherwise store script that runs for every reader. |
| **Compatibility** | Ordinary content is stored byte for byte as Ruby stores it. Measured over the stored HTML of a real 19,000-card deck, 7,208 of 7,354 HTML-bearing cards clean identically. The other 146 are cards whose Ruby cleaning is malformed or misreads an attribute (an empty `alt=""` becomes `alt=""""`; a `title=` inside a link's query string is taken as the title; `style=` inside `data-mce-style=` is taken as the style) or that link to dead or script-capable schemes (`gdlookup:`, `chrome:`, `file:`, `javascript:`). Existing content changes only when it is saved again. |
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
| **Tests** | `tests/card/auth/password-hash.test.ts` (legacy and PBKDF2 both verify; the RFC 7914 PBKDF2 test vector; independent recomputation with `node:crypto`; upgrade decisions; the Workers limit; configuration errors), `tests/card/auth/signin.test.ts` ("password upgrade at sign-in"), `tests/card/auth/first-run-setup.test.ts`. The persistence oracle declares steps 57 and 58; with `DECKO_PASSWORD_HASH=legacy-sha1` the same probe matches Ruby on both. |

### 3. Cross-site requests: writes and sign-in must come from the deck's own pages

| | |
|---|---|
| **Ruby** | No forgery protection: decko 0.20.0 and card 1.110.0 contain no `protect_from_forgery`, and Rails' origin check lives inside it. A page on another site can submit a form that edits a card with a visitor's session, or signs the visitor in to an account of the attacker's choosing. The session cookie's `SameSite=Lax` blocks the first in current browsers for cross-site posts, but not from a sibling subdomain, and does nothing for the second. |
| **Port** | Every state-changing request (card create, update and delete; `/update/*signin`; sign-out; the account password and reset forms; first-run setup) passes an origin check before anything runs: `Sec-Fetch-Site: cross-site` or `same-site` is refused; otherwise an `Origin` header must name the deck's own host (or a trusted origin), and `Origin: null` is refused; otherwise a `Referer` must. A request with none of these did not come from a browser page and passes, so scripts and API clients work as before. A refused request gets 403. |
| **Why** | Forged edits and login CSRF act with, or against, a visitor's identity without their knowledge. Checking the origin needs no token, so no page's bytes change. |
| **Compatibility** | Same-origin forms, the editor, and token-authenticated API calls are unaffected. A site that posts from another origin it controls (an external editor) lists it in `DECKO_TRUSTED_ORIGINS`. Hosts are compared by host and port, not scheme, so a TLS-terminating proxy does not cause false refusals. |
| **Configuration** | `DECKO_ORIGIN_CHECK=off` restores Ruby's behaviour. `DECKO_TRUSTED_ORIGINS`: comma-separated `scheme://host[:port]` origins. |
| **Tests** | `tests/server/write-routes-origin.test.ts` (cross-site Origin, `null` Origin, `Sec-Fetch-Site`, foreign Referer and a foreign port are refused with the card unchanged; a cross-site sign-in mints no session, including on the edge hosts' sign-in-only path; same-origin, Referer-only and header-less requests, trusted origins and the off switch pass), `tests/card/auth/first-run-setup.test.ts` (a cross-site setup POST creates no account), `tests/card/auth/reset-flow-endpoint.test.ts` (the Node host refuses cross-site reset, password and sign-in posts and sends no mail), `tests/deploy/bunny-edge-signin-session-roundtrip.test.ts` (the Bunny edge reads both settings from its own environment). |

### 4. Secrets are compared in constant time

| | |
|---|---|
| **Ruby** | Password digests are compared with `==`, whose running time depends on where the strings first differ. |
| **Port** | Password digests and hashes, session tokens and signed-token signatures are compared with a constant-time comparison (`src/card/auth/session-token.ts`), which runs over the whole input whatever it contains. |
| **Why** | A timing difference can leak a secret one character at a time to a patient remote attacker. |
| **Compatibility** | None: the results are identical, only the timing differs. |
| **Tests** | `tests/card/auth/session-token.test.ts` covers the comparison; `password-hash.test.ts` and `signin.test.ts` cover its use for passwords. |

## Migration tooling

### Shadow routing never runs a write twice

The shadow router (`tools/shadow/shadow-router.mjs`) lets a site run decko-ts beside Ruby Decko during a migration: every request goes to Ruby, whose answer the visitor gets, and a copy goes to decko-ts for comparison. The two engines share the deck, so copying a write would run it twice: two sets of rows and history, two emails, two uploads.

- **Default, and the shipped policy (`tools/shadow/routes.shadow.json`):** only `GET` and `HEAD` are copied. Every other method goes to Ruby alone and is logged as `write-not-shadowed`.
- **Comparing writes:** set `"writes": "isolated"` and `"isolatedUpstream"` to a server started with `tools/shadow/isolated-write-upstream.mjs --primary <deck.sqlite3>`. That server snapshots the deck into a scratch directory (read-only on the primary), applies each replayed write to the snapshot only, drops mail, stores uploads in the scratch directory, blocks outbound network calls, and deletes the snapshot when it stops. The router replays writes only after the server declares this isolation, and refuses to start if the isolated upstream is the Ruby or the decko-ts read upstream.
- **Limits:** the isolated upstream snapshots SQLite decks. For a deck on D1, libSQL or PostgreSQL, take a copy with that platform's own tools into SQLite first, or leave writes at `skip`. The snapshot diverges from the live deck as the comparison runs; it is for comparing write behaviour, not for serving.
- **Tests:** `tests/tools/shadow/shadow-writes.test.ts` (each mutating method reaches Ruby once and decko-ts never; an upstream without the isolation declaration gets no writes; a real isolated upstream changes its copy while the primary file stays byte-identical, and blocks the network).
