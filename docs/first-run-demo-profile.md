# The first-run demo profile — the env preset for a fresh deck

**What this is:** the environment contract that arms the first-run journey
(owner-account setup) on a fresh deck, and an honest statement of where that
profile does and does not apply today.

**Who owns the README:** the one-click deploy lane. This file is the
first-run lane's half of the same contract, so the operator story can be
written in one place without two lanes editing the same file.

The engine-side contract is also carried in the module that implements it —
`src/card/auth/first-run-setup.ts`, module header section
"DEPLOY-PROFILE ENV CONTRACT". This file is the operator-facing view of the
same two variables; they must not drift, and if you change one, change both.

---

## The two variables

| Variable | Value | What it arms |
| --- | --- | --- |
| `DECKO_FIRST_RUN` | `1` | The `/setup` surface. Anything else — `0`, `true`, `yes`, unset, ` 1` — leaves the route non-existent: `handleFirstRunRequest` returns `null` for every request and the host falls through to its own 404. |
| `DECKO_WRITE_PATH` | `1` | The card CREATE/UPDATE/DELETE path (`src/server/write-routes.ts:190-192`, pre-existing). The owner create runs through the same `CardActionEngine` the write path runs, so a deployment that leaves this off still cannot create a card. |

### The profile

```sh
DECKO_WRITE_PATH=1 DECKO_FIRST_RUN=1 node vm-staging-server.mjs
```

Both, together, are "fresh demo" mode. Neither alone is useful: the first
without the second renders a form whose submit cannot work (the surface
answers 404 with "This deck is running read-only"), and the second without the
first enables writes on a deck that has no way to create its first account.

### What the profile does NOT do

- **It does not seed an account system.** A deck without card-mod-account's
  `*account` / `*email` / `*password` / `*salt` / `*status` cards has no shape
  to create an account into, and the engine has no mod-seeding capability to
  create them — `card-mod-account.ts`'s manifest registers views only. On such
  a deck the surface answers 404 with "This deck has no account system". That
  is the honest answer, and it is the answer both shipped seeds currently get
  (see below).
- **It does not change any rendered byte.** With `DECKO_FIRST_RUN` unset, this
  feature is invisible: no route, no view, no card, no config.

---

## Where the profile applies today

**Applies:** the Node staging server (`vm-staging-server.mjs`), which is the
host that carries the write path, the session store and the auth layer. This
is where a first-run journey is currently reachable end to end: create the
owner at `/setup`, then sign in at `/_signin` with the same address and
password.

**Does not apply:** the Cloudflare demo worker (`deploy/worker.ts`). It has
no write path, no session store and no auth — `grep -c
"write-routes\|card/auth\|SessionStore\|handleWriteRequest" deploy/worker.ts`
returns `0`. Its only non-GET route is `POST /api/query`, which answers
CQL read queries; every other non-GET path answers 405. Setting either
variable in `deploy/wrangler.toml` today would arm nothing, because the
worker never imports the modules that read them. Adding `[env.*]` vars to a
wrangler config for this feature would be a promise the deploy does not
keep, so this doc does not add any.

The gap is the write path and the auth layer on the Workers/D1 host, not this
profile. That is separate work with its own parity questions (D1 has no
`better-sqlite3`; the census SQL is portable, but the `CardActionEngine`'s
write path is not yet proven on D1).

---

## The account-system precondition

The journey can only run on a deck that carries card-mod-account's account
card shape. Reading the census:

```
SELECT COUNT(*) FROM cards
 WHERE right_id = <the card with codename "account">
   AND trash = 0
   AND NOT (left_id IN (<decko_bot card id>, <anonymous card id>));
```

Zero means the window is open. That is the port of
`card-1.110.0/lib/card/auth/setup.rb:33-52`; the exact semantics, the one
documented deviation from Ruby's literal CQL, and the reason for it are on
`countUserAccounts` in `src/card/auth/first-run-setup.ts`. Read that before
changing the query — the deviation is load-bearing, not stylistic.

### Neither shipped seed satisfies the precondition today

- `db/seed.sql` — 4 `INSERT INTO cards`; `grep -i account` returns nothing.
- `deploy/seed/seed.sql` — 15 `INSERT INTO cards` (12 cards + 3 junctions);
  `grep -i account` returns nothing. Exactly one row carries a codename
  (`search_type`, the Search cardtype); the rest are addressed by their
  `key` — `demo_bot, search, cardtype, user, note, home, about, demo_guide,
  section_one, detail, history, note_index`. There is no `decko_bot` key and
  no `anonymous` card either, so `actorBot()` cannot resolve on that deck at
  all.

So on a deck built from either seed, `/setup` correctly answers 404 with
"This deck has no account system". Making the shipped demo decks
setup-capable is deck-seeding work (adding card-mod-account's `data/real.yml`
cards), not route work, and it is out of this lane's scope. The journey is
built, tested and reachable; the demo deck still has to be given the account
system before a first-run visitor sees the form.
