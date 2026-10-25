# Working-rows batch g: independent verification at the branch tip

- Branch: `port/workbatch-g-20261025`, base `deploy/full-candidate-20261101` (tip `c17906db`).
- What this lane is: a second lane working the same brief. The eight row dispositions
  were landed and pushed by a concurrent lane operating the same brief in the same leased
  worktree (`C:/localProjects/decko-ts-workbatch-g-20261025`, lease `c804197ab31c`). This lane
  verified each disposition independently, re-ran the closed row's instrument on its own
  rebuilt inputs, and adds the branch's correctness-battery line, which the landed receipts
  do not carry.

## The eight rows, as landed, and what this lane checked

| row | disposition | commit | receipt | this lane's independent check |
|---|---|---|---|---|
| `smell-check-chain-join-plan` | CLOSED | `53ae41be` | `docs/runs/working-rows-workbatch-g-2026-10-25/smell-check-chain-join-plan/RECEIPT.md` | the instrument re-run below, and the pin (10 tests passed) |
| `smell-evaluate-follow-operations` | NAMED | `178b1347` | `.../smell-evaluate-follow-operations/RECEIPT.md` | the contract, the port's mail view and the recorded two-leg measurement, read below |
| `smell-apply-remote-widget-cas` | NAMED | `ba7a527d` | `.../smell-apply-remote-widget-cas/RECEIPT.md` | the credential path, the consumed intent file and the receipt of record, read below |
| `smell-discover-hosted-navigation` | NAMED | `4cac0fda` | `.../smell-discover-hosted-navigation/RECEIPT.md` | the instrument's origin and its consumed output directory, read below |
| `smell-export-hosted-read-only` | NAMED | `70d237ab` | `.../smell-export-hosted-read-only/RECEIPT.md` | the instrument's label and origin guards, read below |
| `smell-preflight-owned-widget-rows` | NAMED | `5e97e7aa` | `.../smell-preflight-owned-widget-rows/RECEIPT.md` | the instrument's guards and its one-shot output, read below |
| `smell-prepare-owned-database-access` | NAMED | `2a4ab2cc` | `.../smell-prepare-owned-database-access/RECEIPT.md` | the instrument's duplicate-mint guard and the credential's presence, read below |
| `smell-prove-host-override-read-admission` | NAMED | `44216769` | `.../smell-prove-host-override-read-admission/RECEIPT.md` | the instrument re-run below, plus the oracle route evidence |

Each landed commit touches only its own row's files: the seven named rows are one receipt
file each, and the closed row's commit carries the instrument's pass condition, the distilled
capture, the shared capture reader, the pin and its distiller.

## The closed row, re-run by this lane on its own inputs

The instrument: `tools/perf/check-chain-join-plan.mjs`. This lane rebuilt the tool's two
inputs with the repository's own builders and ran the landed tool.

- `node tools/smell-row-r4/prepare-chain-join-deck.mjs C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/deck-rebuild/deck-better-sqlite3.sqlite3 .runtime/r7-chain-join/deck.sqlite3`
  -> "deck copy: 21676 rows (21670 distinct ids, 6 null-id rows) -> 21670 rows (21670 distinct ids); copy sha256 f67f6edf7564"
- `node tools/smell-row-r4/build-chain-join-capture.mjs .runtime/r7-chain-join/deck.sqlite3 C:/localProjects/brandonDojoTech/tmp/cold-first-keystroke-evidence/stmt-c3.sql .runtime/r7-chain-join/capture.sql`
  -> "capture written: 30 tuples, 90 bound keys, from the deck's own widenable junctions (3865 available); children 34 to 261"
- `node tools/perf/check-chain-join-plan.mjs .runtime/r7-chain-join/deck.sqlite3 .runtime/r7-chain-join/capture.sql .runtime/r7-chain-join/report-verify.json db/schema.sqlite.sql`
  -> exit 0, `complete: true`

| planner state | form | time | cards | set equal | bytes equal |
|---|---|---:|---:|---|---|
| no statistics | captured | 286,105.8 ms | 30 | yes | (reference) |
| no statistics | CROSS JOIN | 75.7 ms | 30 | yes | no |
| analyzed | captured | 67.3 ms | 30 | yes | no |
| analyzed | CROSS JOIN | 69.9 ms | 30 | yes | no |

One card-set digest across all four measurements, `47ce565aafc0`, which is the digest the
landed capture records, and the deck copy digest `f67f6edf75648473` is the landed capture's
deck digest. This lane's rebuild therefore answered with the same card set as the landed
run, on inputs this lane rebuilt from the same sources.

Before the pass condition landed, this lane ran the same tool unchanged on the same inputs
and it refused its own measurement: "no-stats original 277449.6 ms, identical=true", "no-stats
fixed 60.1 ms, identical=false", "Error: query row bytes changed". That is the refusal the
round-four receipt recorded, reproduced first hand.

The pin: `npx vitest run tests/server/smell-check-chain-join-plan-parity.test.ts` -> 10 tests
passed. The typecheck at this tip: `npx tsc --noEmit` -> no errors, exit 0.

## The named rows, checked one by one

- `smell-evaluate-follow-operations`: the contract still demands a successful member-board
  unfollow (`reference-harness/browser/journeys/acceptance-follow-operation-contracts.json`,
  journey `unfollow-member-operation-persistence`, action
  `{"method": "GET", "path": "/update/Topic_009+*self+Mira_Member+*follow", "status": 200}`),
  and the port's mail view still emits its own repaired unfollow link
  (`src/card/notify/follow-mail-views.ts:262-268`). The source answers the member-board
  request with 422 and its own dashboard link with 403 (the round-four two-leg measurement,
  `docs/runs/smell-row-conversion-r4-2026-10-24/smell-evaluate-follow-operations/RECEIPT.md`),
  so the contract the grader enforces is a demand the source itself does not satisfy.

  The mail leg's divergence is the port's recorded repair rather than an open defect, and the
  decision behind it is in the repository: commit `e17d5b5b` ("fix: mail unfollow targets the
  existing owned preference (intentional stock-link repair)") and commit `99f05d0a` ("disclose
  the approved unfollow-link divergence in the side-effects battery"), which cites the
  live-Ruby control, that the source's dashboard link answers 403, and normalizes both
  engines' unfollow-link shapes to one token in the side-effects comparator while the
  repaired link's own bytes stay pinned by `tests/deploy/bunny-account-mail-http.test.ts`.
- `smell-apply-remote-widget-cas`: the credential the instrument parses
  (`C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env`)
  is absent ("No such file or directory"), the one-shot intent file is present, and the
  receipt of record reads `pass: true`, `returnedWriteRows: 12`, `allTwelveAfterMatch: true`,
  `otherFieldsUnchanged: true`, `monotonicVersionMatches: true`, `versionBefore: 52`,
  `versionsAfter: [{"id": 1, "version": 64}]`, so the admission's preconditions no longer hold.
- `smell-discover-hosted-navigation`: the instrument pins the live hosted edge origin and
  creates `hosted-navigation-discovery-20261019-r1/` with the non-recursive create flag; that
  directory and the original run's receipt are present, so the walk is both unauthorized and
  one-shot-consumed.
- `smell-export-hosted-read-only`: the instrument takes a fresh label and one of exactly two
  authorized edge origins, so its own guards admit a run; the walk of the live edge is the
  part that no lane may perform.
- `smell-preflight-owned-widget-rows`: the instrument refuses unless the custody record names
  `cs-edge-deck` with matching ids and urls and unless the token carries `ro` alone, and it
  then posts read-only SQL to that database; its one-shot output
  `hosted-edge-current/owned-widget-rows-preflight.json` is present.
- `smell-prepare-owned-database-access`: the instrument refuses with "Owned credential already
  prepared; refusing duplicate token generation" while the credential file exists, and that
  file is present at the exact path the instrument writes.

## The host-override row: the instrument re-run and the oracle evidence

This lane ran the row's own instrument against this tree (its own copy differs from the
instrument only in the two module import paths, the pinned checkout carrying no
`node_modules`; the instrument's own bytes are sha256
`80b1c13b0c093c2e4032604c5a117764f2c08e69a81e9bfce3fc146d37b97c23`).

- `node prove-host-override-read-admission.mjs smell-host-override-r7-20261025-baseline`
  -> exit 1, `checks: ["exact target document admitted", "same-origin JSON fetch admitted"]`,
  `pass: false`, the error "[ true, true, true, false, false, false ]", and the requests that
  reached the owned listener: `GET /`, `GET /read.json`, `GET /delete/OwnedCard`,
  `POST /update/account`, `POST /card/create`. The other owned listener was never reached.

This lane's own addition to the row's record, from the pinned gem tree
(`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/decko-0.20.0/config/engine_routes.rb:41-43`):
the source's route table carries `get "(card)/#{action}(/:mark)"` for
`action in create, read, update, delete, asset`, so a GET that names a card on the delete
route is a delete in the source, while the gate's write table
(`reference-harness/browser/lib/live-walk-profile.mjs`, `classifyWriteRequest`) treats only
`GET /update/<mark>` as a write. The gap between the source's route grammar and the gate's
write table is the second half of the row's mechanism, and it is oracle evidence rather than
an inference.

The safety consequence this lane measured: under a read-only host-override profile the gate
admits a POST to a session-marked route that carries a card field, so a page-driven write can
reach a hosted target, while the gate's own header names the admitted set as three session
operations that "create no card, change no card, send no mail". Narrowing the carve-out is a
decision about the harness's own contract, and the repository pins it
(`tests/tools/hosted-discovery-probe-dependencies-are-recoverable-and-read-only.test.ts:114-126`),
which is why the row stays named.

## The correctness battery at this tip

- command: `npm test` (that is `node tools/test-gates.mjs run correctness`), at the branch's
  final commit `7b6f0b6e`
- line: **Test Files 1 failed | 710 passed | 54 skipped (765); Tests 1 failed | 7348 passed |
  227 skipped (7576); Duration 435.79 s**

One run earlier, at the parent commit `44216769` (the receipt's own commit), the same command
gave: **Test Files 4 failed | 707 passed | 54 skipped (765); Tests 2 failed | 7330 passed |
  244 skipped (7576); Duration 457.47 s**. The three files that differ between the two runs
are the ones whose failure was contention, not a defect:

| file | at 44216769 | at 7b6f0b6e | why |
|---|---|---|---|
| `tests/card/auth/first-run-setup-endpoint.test.ts` | failed | passes | the suite `KNOWN_FAILURES.md` names as load-sensitive: it boots a local server and races the shared temporary directory |
| `tests/card/auth/reset-flow-endpoint.test.ts` | failed | passes | the same named suite |
| `tests/tools/side-effects-scenario-battery.test.ts` | failed | passes | `EPERM` on `tmp/side-effects-battery`: the scratch path was held by another run in this shared worktree |
| `tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts` | failed | fails | the machine-scoped gate, below |

The three files re-run alone at `44216769` (`npx vitest run` on those four paths) gave three
passes and the same standing red.

The standing red is the machine-scoped lane-worktree hygiene gate, and it is not this
branch's:

- its own file is unchanged between the base and this tip
  (`git diff c17906db..HEAD -- tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts` is
  empty), and the state it reads is the machine's disk, not the tree's code;
- its one violation is one orphan directory on disk, `C:/localProjects/decko-ts-lane-archives`
  (six parked `routes-*-tools-tmp` directories, 4.2 MB measured at depth 2), created on
  2026-10-24, before this batch's first commit, and neither tracked in IN-FLIGHT.json nor in
  `tests/hygiene/keep-worktrees.json`;
- the remediation the gate prints (`git worktree remove` of that path) cannot run: the path
  is not a registered worktree of either repository the gate reads, and git reports "not a
  git repository" for it. Clearing that red means removing another lane's parked scratch
  directories, which is the cleanup lane's work and not this lane's to decide.

So the battery holds at this tip except for that one machine-scoped suite, which was red
before this lane started and which this branch does not touch.

## What this lane did not do

It made no request to any live host, no production SQL, no public network request and no
`.com` request, minted no token, read no credential value into any output, changed no
harness policy, deployed nothing, and swept no tree: this lane's commit touches one new
receipt file.
