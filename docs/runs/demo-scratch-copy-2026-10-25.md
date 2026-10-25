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

## How to check it

```bash
node scripts/demo-scratch-copy/verify-demo-scratch.mjs --base-url http://127.0.0.1:3117
```

The script checks nine things and writes a JSON receipt under `.runtime/`.
It creates, reads, updates and deletes its own throwaway card, so a check
leaves the deck as it found it.

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
