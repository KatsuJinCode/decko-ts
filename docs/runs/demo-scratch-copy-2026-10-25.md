# Demo scratch copy of the edge port

The demo surface gets its own second copy of the edge port. This copy stands
inside the decko ecosystem, serves Brandon's demos on a loopback port, and
leaves the shadow-parity copy, production and the live edge untouched.

## Where it lives

| What | Value |
| --- | --- |
| Checkout | `C:/localProjects/decko-ts-demo-scratch-20261025` (an exclusive clone; the port of record `C:/localProjects/decko-ts-release-lead` is never modified by it) |
| Branch | `port/demo-scratch-20261025` |
| Base commit | `4078b46a` (`deploy/full-candidate-20261029`, the v19 candidate roll) |
| Serving surface | `vm-staging-server.mjs`, the port's own staging surface: the same engine the edge bundle runs, served over HTTP from a deck on disk |
| Address | `http://127.0.0.1:3117` (loopback only) |
| Deck | `.runtime/demo-scratch/deck.sqlite3` (writable; the server writes here) |
| Seed | `.runtime/demo-scratch/seed-deck.sqlite3` (the staged seed; never served) |
| Credentials | `.runtime/demo-scratch/credentials.json` (gitignored, never printed, never committed) |
| Machine-local state | everything above lives under `.runtime/`, which the repository ignores |

## How to boot it

```bash
cd C:/localProjects/decko-ts-demo-scratch-20261025

npm run build:engine                                       # once per clone
node scripts/demo-scratch-copy/build-demo-deck.mjs         # build (or reset) the deck
node scripts/demo-scratch-copy/boot-demo-scratch.mjs --port 3117
```

The boot script prints the address, the deck, the files directory and the
server pid, and it runs in the foreground: `Ctrl-C` stops the server (the
script forwards the signal, the listener closes, the process exits). Nothing
here deploys anywhere and nothing here contacts a public host.

The boot arms the write path (`DECKO_WRITE_PATH=1`), because a demo whose
cards cannot be created or edited is a screenshot, not a demo. That is why the
deck is a copy under `.runtime/` and never the seed file.

## What seed it carries

The real deck, anonymized: the machine-local copy at
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`
(21,676 cards, 44,306 references, home card `Home`, layout card
`Default Layout`, site title `Culturesmith`).

`build-demo-deck.mjs` stages that source onto the engine's own schema with the
repository's generalized importer, then copies the seed onto the served deck
and seeds a demo owner account (`Harness Admin`, holding the `administrator`
role) plus a plain member account. The password is generated at build time and
written only to the credentials file.

Two build details matter and are printed by the build:

- **The deck is imported, not copied.** A deck copied as-is carries a legacy
  `cards` table whose `id` is a plain column, so every card created after the
  boot lands with a NULL id and the engine cannot address it. The import
  creates the engine's tables with `id INTEGER PRIMARY KEY AUTOINCREMENT`,
  which is what makes the demo writable.
- **Junction names go back to NULL.** The importer composes a name for every
  junction card whose name is NULL, and that changes the name-resolution
  graph: the engine resolves a compound name by resolving its sides, so a
  composed junction name can resolve into a cycle and the boot's nest-index
  build then recurses until the stack runs out (`RangeError: Maximum call
  stack size exceeded` in `DbLexicon#id`). A junction's name is composed from
  its sides at runtime, so the build restores the NULL names the source
  carries and prints how many it restored.

## How to reset it to clean

```bash
node scripts/demo-scratch-copy/build-demo-deck.mjs
```

The build is the reset: the source deck is re-imported, the seed is restaged,
the served deck is rebuilt from the seed and the accounts are seeded again.
Every card written into the demo copy is gone, and the demo owner gets a new
password (the credentials file is rewritten).

### The reset that works while the surface is serving it

```bash
node scripts/demo-scratch-copy/reset-live-deck.mjs
```

The build above REBUILDS the served deck by removing the deck file and
copying the seed onto it. On Windows the running server holds that file open
(SQLite keeps the handle for the life of the connection), so the removal
fails with EPERM and the reset cannot run while the surface is up. The only
way it could run was with the server stopped, and stopping it needed a manual
termination, which is the failure mode the process lifecycle gate exists to
end.

`reset-live-deck.mjs` does the same restore through the open database
instead of around it:

1. it ATTACHes the staged seed to the served deck and copies every table the
   seed carries back into it, in one transaction;
2. `deck_data_version` is not copied, because it is the engine's monotonic
   freshness counter and a restore that set it backwards would leave the
   engine's freshness check believing nothing had changed. The deck's own
   triggers fire on the copy, so the stamp moves and the running server
   drops its retained state on its next request;
3. the session table is emptied, because a session from before the reset
   must not survive it;
4. the demo owner and member accounts are seeded again, so the owner gets a
   new password and the credentials file is rewritten.

The end state is the end state the build produces: the served deck holds the
seed's rows (21,676 cards, 44,306 references) plus the twelve account cards
and one role reference, and the accounts are fresh. What differs is that the
surface never stops and the deck file is never replaced.

Measured on this machine, 2026-10-25: the restore moved the served deck from
21,705 cards and 44,330 references back to the seed's 21,676 and 44,306 in
under a second, and the running server served the clean landing page on its
next request without a restart.

## How to check it

```bash
node scripts/demo-scratch-copy/verify-demo-scratch.mjs --base-url http://127.0.0.1:3117
```

The script checks nine things and writes a JSON receipt under `.runtime/`.
It creates, reads, updates and deletes its own throwaway card, so a check
leaves the deck as it found it.

## The front door, built as cards in this deck (2026-10-25)

The front door was built in this deck as real cards, through the engine's own
write path, and read back in a browser session on the loopback address. The
five front-door mockups are sketches; this is the same intent as cards.

How it was built: `scripts/front-door/build-front-door.mjs` on branch
`port/frontdoor-20261025` of this repository. It signs in as the demo owner,
creates the cards below with `POST /` and `PUT /<card>` (the write path the
signed-in editor uses), seats the door's view, puts the door on the landing
page by nesting it first in the Home card, and reads every card back.

| Card | What it is |
| --- | --- |
| `Culturesmith+Front Door` | the door: the landing card the Home card nests first |
| `Culturesmith+Front Door+Student Door` | the student door |
| `Culturesmith+Front Door+Organization Door` | the organization door |
| `Culturesmith+Front Door+Ways In` | the three ways to be here, the classes, the library |
| `Culturesmith+Front Door+The Method` | what Conflict Done Well is made of, and where the method comes from |
| `Culturesmith+Front Door+Community Standard` | Guardians of Peace as a community standard, and the two certification names |
| `Culturesmith+Front Door+About This Build` | what is real here, what is a sketch, and who wrote it |
| `Front Door Layout` | the door's own page shell, a Layout card |
| `Culturesmith+Front Door+*self+*layout` | the rule that seats that layout for the door card |

The view is seated the way this deck seats every view: a Layout card and a
per-card layout rule, the same mechanism as `*all+*layout` ("Default Layout")
and the `<card>+*self+*layout` rules elsewhere in the deck. The door card's
own page renders in "Front Door Layout"; every other card renders in the
default one.

The door's links point at real things: the working library
(`https://culturesmith-library.bunny.run` and its classes page) and cards in
this deck (Conflict Done Well, Make Contact, the aikido page, Martial
Nonviolence, Peace Practices, Guardians of Peace). Every one of those deck
paths answered 200 signed out on the loopback address on 2026-10-25.

What a visitor sees at the door: the universal-conflict framing first, then
the promise, then the question, then the two doors, then the three ways to
be here, then what the method is made of, then the community standard and
the two certification names. The wording follows the operator's standing
design rules (`docs/plans/writing-for-brandon.md` in brandonDojoTech).

What was checked, and when (2026-10-25, this machine):

- the build's own receipt: 19 of 19 checks (seven cards written and read
  back, the layout card, the layout rule, the landing page, and every card's
  page);
- this runbook's own check, 9 of 9, against the same deck;
- a browser session on `http://127.0.0.1:3117` read the landing page's main
  article signed out, and the door's text was the first thing in it;
- the screenshots are in `tmp/frontdoor-in-decko-20261025/` in the lane
  checkout (`C:/localProjects/decko-ts-frontdoor-20261025`), with copies
  committed under `docs/runs/front-door-in-decko-2026-10-25/` on the lane's
  branch.

Afterwards the deck was reset with the reset above, so this copy serves the
original landing page again: 21,688 cards, 44,307 references, and the door's
card answering 404.

## Boot proof (2026-10-25, this machine)

The deck this build produces reaches `listening` in about two seconds: 1.81 s
measured on the first boot after a reset (2.15 s on a second run of the same
measurement) and 0.68 s when the deck's nest index is already current. The
numbers are wall clock from the server's start to its own `listening on`
line, taken with a wrapper that timestamps that line.

For contrast, the same measurement on a copy of the SOURCE deck, copied
as-is, is 186 s. That is the copy the import exists to avoid: the source
deck's own table shapes make the boot's work far heavier, which is the
second reason the demo deck is imported rather than copied.

The checks below come from the verification receipt
(`.runtime/demo-scratch/verification-1792914353038.json`), run against the
deck described above:

| Check | Result |
| --- | --- |
| `GET /_status` | 200, 375 bytes, `{"ok": true, ...}` |
| `GET /` (the site) | 200, 21,922 bytes, title `Home - Culturesmith` |
| `POST /_signin` (owner) | 200, session cookie issued |
| `POST /` (card create) | 303, `Location: .../Demo_Scratch_Check_...` |
| `GET /<card>.json` (read) | 200, 452 bytes, the created content present |
| `PUT /<card>` (update) | 303 |
| `GET /<card>.json` (re-read) | 200, the updated content present |
| `GET /<owner>/board` (board surface) | 200, 85,863 bytes, title `Harness Admin - Culturesmith` |
| `DELETE /<card>` | 303, then `GET /<card>.json` answers 404 |

Nine of nine.

## What must never touch it

- **The shadow-parity copy** (the three-backend parity shadow in
  `brandonDojoTech/scripts/shadow-router` and the Bunny edge deck it
  compares against) stays pristine. This copy never reads from it, never
  writes to it, and never shares a deck file with it.
- **Production and the live edge** are never contacted. The server binds
  `127.0.0.1`, the deck is a local file, and `DECKO_ORIGIN` names the
  loopback address, so every absolute link the deck builds points back at
  the local port.
- **Nothing deploys.** The three scripts have no deploy path: they build a
  local deck, start a local server and check it.
- **The port of record** (`C:/localProjects/decko-ts-release-lead`) is not
  modified by this copy. The clone is exclusive: its branch, its `.git` and
  its working tree are its own.
- **The demo is not a measurement deck.** It carries the real deck's rows
  plus one seeded owner and one seeded member, and the importer repairs
  keys. Use the port's own measurement harnesses for numbers.

## Known limits

- **The read-time asset refresh is off** (`DECKO_ASSET_REFRESH=never`).
  This host has no SCSS compiler, and the cautious default recompiles the
  deck's customized slate skin, so every page request answers 500
  (`slate skin customized: this host has no SCSS compiler configured`).
  Point `DECKO_SASSC` at a built `sassc` to arm the refresh.
- **Compiled CSS and JS bytes are not in the corpus.** They live in the cloud
  bucket the live site serves, so the pages reference assets this host
  cannot serve.
- **The import does not carry over** the source's `auth_sessions` (1 row),
  `auth_signin_throttle`, `deck_setup_tokens` and `nest_index_meta` (1 row)
  tables. The server recreates the session table at boot and rebuilds the
  nest index.
- **The deck is the real deck's rows, not a byte copy.** The importer's own
  report (`seed-deck.sqlite3.migrate-report.json`) records what it changed;
  the build prints the card counts and the tables it did not carry over.
