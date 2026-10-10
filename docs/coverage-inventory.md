# Coverage inventory — what the public package measures, and what it does not

Every parity figure this repository quotes names an instrument and a scope.
This document is the single place that says, for each of the four parity
domains, what is actually measured, where the evidence lives, and what is
**not** measured by anything committed here. When a claim about this engine's
compatibility is quoted anywhere, it should be checkable against this page.

The method behind the instruments is in [parity-method.md](parity-method.md).
The mod-compatibility boundary is its own decision record
([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md)).

---

## The four domains, and what is measured in each

| Domain | What parity means | Measured by (public package) | Headline figure |
| --- | --- | --- | --- |
| Rendering | HTML/format output byte-identical to Ruby's | Reference-harness render ops; miniature smoke fixture; corpus replay | 1,754 / 1,754 renders byte-identical, `synthetic-v1` reference-harness grade. The with-mods corpus replay measured 167,674 / 180,442 views byte-identical (92.9%) on 2026-09-23, on an earlier revision of the engine |
| Semantics | Names, keys, types, sets, rules, permissions, CQL answer as Ruby answers | Reference-harness semantics ops; CQL batteries in `fixtures/captured/` | 2,388 semantics operations, `synthetic-v1` fixture |
| Persistence | The rows a write leaves behind match Ruby's, table by table | Reference-harness scenario steps (raw row deltas) | 16 write steps, one raw row-delta comparison each |
| Side effects | Saved/refused verdicts, errors, mail, sign-in identity match Ruby's | Reference-harness write and sign-in step answers; captured mail | 19 comparisons: 16 write answers + 3 sign-in answers |

The standing test net (`tests/standing-net.json`, 68 manifest files) run
2026-10-01: 696 passed, 4 expected fail, 12 skipped (712). That net is
regression protection, not a parity measurement; the parity figures are the
ones above.

---

## Where each measurement lives

### Rendering

- **Corpus replay** (private corpus, not committed): the full-deck capture —
  every card record and every recorded view compared byte for byte. The
  2026-09-23 with-mods run measured 167,674 of 180,442 captured views
  byte-identical (92.9%). Method and the failure-family breakdown:
  [parity-method.md](parity-method.md), `tools/corpus-failure-classes/`.
- **Miniature fixture** (committed): `fixtures/captured/smoke.json` — a small
  seeded deck with four rendered views per card. This is what a clean clone
  can replay.
- **Reference harness** (committed): `reference-harness/fixtures/synthetic-v1/`
  — 1,752 render operations against one built synthetic deck, with the Ruby
  oracle's answers committed under `expected/`. Grading needs Node and the
  engine, not Ruby ([../reference-harness/SPEC.md](../reference-harness/SPEC.md)).

### Semantics

- **Reference harness**: 2,388 semantics operations on the same `synthetic-v1`
  deck — card identity, set membership, rule lookup, permission verdicts,
  search results, name algebra — each compared against the committed oracle
  answer.
- **CQL batteries** (committed): `fixtures/captured/cql-basic.json` (11
  canonical query shapes) and `fixtures/captured/cql-mysql-match.json` (the
  `match` battery, 30 queries, captured against a MySQL-protocol server —
  see [decisions/0005](decisions/0005-cql-match-semantics.md)).

### Persistence

- **Reference harness scenarios**: `synthetic-v1`'s `ops/scenarios.json` holds
  16 scenarios of 22 steps — 16 writes, 3 sign-ins, 1 question, 2 renders.
  Every write step's raw row delta (ids and timestamps as stored, across
  `cards`, `card_acts`, `card_actions`, `card_changes`, `card_references`,
  `card_virtuals`) is compared against Ruby's: **16 persistence comparisons**.
  Read steps must additionally leave exactly the rows Ruby's reads left.
- **Extended probes, not part of the public grade** (they skip without their
  starting oracle decks, which are private):
  - the 70-step write probe (`tests/tools/persist-write-probe.test.ts`,
    `STEP_COUNT = 70`) skips unless `PERSIST_SRC_DECK` names the private
    oracle deck;
  - the pod import/export round-trips
    (`tests/tools/pod-round-trip.test.ts`, `tests/tools/pod-features.test.ts`)
    skip unless `PODS_SRC_DECK` / `PODS_BASE_DECK` name it.
  Both announce their skip loudly. They are the deeper persistence evidence;
  none of their results are in the public package.

### Side effects

- **Reference harness**: every write step's answer (saved or refused, the
  error messages, the mail the write sent, the resulting card) and every
  sign-in's answer (signed in or not, the actor afterwards) is compared
  against Ruby's: **19 side-effect comparisons** (16 write answers + 3
  sign-in answers). The counts are recountable from
  `reference-harness/fixtures/synthetic-v1/ops/scenarios.json`.
- Captured notification mail and permission-denial bytes are also exercised
  by their own suites (see [parity-method.md](parity-method.md), "Side
  effects" layer).

---

## What the public package does NOT measure

Stated plainly, with where the gap closes when it closes:

1. **Browser journeys.** The machinery is committed
   (`reference-harness/browser/`) and 51 journeys are defined as data
   (`browser/journeys/synthetic-v1.json`), but no journey comparison run is
   committed. What a browser session sees — editors, uploads, follow flows —
   is unproven in the public package.
2. **The default PBKDF2 password path, in the harness grade.** The public
   fixture's TS adapter pins `DECKO_PASSWORD_HASH=legacy-sha1`
   (`reference-harness/adapters/ts/adapter.ts`), because the fixture deck is
   Ruby-built with Ruby's salted SHA-1 digests; the graded sign-ins therefore
   never exercise PBKDF2 storage or the upgrade-on-sign-in write. That path
   is covered by unit tests (`tests/card/auth/password-hash.test.ts`,
   `tests/card/auth/signin.test.ts`), not by the harness grade.
3. **Hosted D1 / Bunny write semantics.** The transaction and atomic-save
   suites ran against workerd's local D1 under Miniflare and a Hrana v2 test
   server backed by real SQLite — never against hosted D1, sqld, Turso or
   Bunny ([decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md):
   "Nothing here was run against a hosted service"). No committed evidence
   describes a production write on any host. Writes on D1 are presented
   accordingly, as evaluation/single-user grade rather than a supported
   multiuser deployment: until the intermediate-visibility window 0007
   documents is closed, a multiuser D1 deployment keeps writes disabled or
   accepts that a failed save is briefly visible mid-save.
4. **Arbitrary mods.** Existing Ruby mods are not executed — the site's own
   mods are hand-ported, and the compatibility report's labels are
   declaration-level
   ([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md),
   `tools/compat-report/mod-compat-report.md`). A mod view beyond the handful
   the byte-pins render is unproven against Ruby's bytes.
5. **Jobs.** The delayed-job backend is legacy-labeled and unported (the
   compatibility report marks `card-mod-delayed_job` ignored). No background
   job behavior is measured.
6. **Anything a skipped probe would have covered** (see Persistence above):
   70-step write sequences and pod round-trips on the real oracle deck.

---

## Reproducing the public measurements

```bash
npx vitest run tests/testing                  # replay machinery
npm run replay                                # oracle replay over committed fixtures
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v1 --out <resultsDir>
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
     --actual <resultsDir>
```

The corpus replay needs the private corpus and is a proof run, not a
development loop; the reference-harness grade needs only Node and the engine.
The skipped probes print what to set to run them.
