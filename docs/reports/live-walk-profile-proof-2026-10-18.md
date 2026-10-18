# Live-walk runner profile: host-override proof against a local mock (2026-10-18)

The live-walk profile gives the two journey runners — the exhaustive runner
(`reference-harness/browser/run-exhaustive.mjs`) and the whole harness
(`tools/edge-signed-in-exercise.mjs`) — a host-override engine profile
(`reference-harness/browser/engines/live.json` + `--base-url` / env
`DECKO_LIVE_BASE`) so the identical journeys attach to any base URL the
operator names, without code changes, under three write modes:

- **read-only** — every write-path action skipped (the engine's whole write
  route table, including the `GET /update/<mark>` first-class write route);
  read journeys graded only; write-subject actions graded `skipped_write`
  (never pass, never fail).
- **scratch-allowlist** — a write is admitted only when the card it targets
  carries an operator-approved prefix from `--scratch-allowlist <file>` (one
  prefix per line, `#` comments). The file is read at run time; **absent or
  empty means every write is skipped** (fail-safe).
- **full** — the local default, unchanged: a locally booted engine stages a
  throwaway deck copy.

Session operations (sign-in `POST /update/*signin`, sign-out) stay permitted
in every mode: they create no card, change no card, send no mail, and are how
signed-in read journeys authenticate. The target host and write mode are
recorded in every run report (runner: `provenance.json` `target` +
`run-meta.json` `target`/`writeGate` + `run.md` target lines; harness:
provenance `.liveWalk` + the report header + the JSON run record).

Every proof leg below drove a **local mock only**: the ts engine booted by
`reference-harness/browser/serve-local-mock-engine.mjs` over the synthetic-v1
fixture, on loopback. **No request was sent to any live host**
(culturesmith.com, culturesmith-edge.bunny.run, api.bunny.net, or any
production URL) by any leg of this proof.

## Receipts

All legs ran inside a clean detached worktree of this repository (the main
tree carried sibling lanes' in-flight files; the runners' fail-closed
clean-tree and source-custody gates require a coherent source). Receipts are
preserved on disk at `tmp/live-walk-proof-receipts-2026-10-18/` (gitignored).

- Runner legs (runner code identical at `1877805e` and `ec898d39`; only
  harness files differ between them): `legA-boot-full`, `legB-override-scratch`,
  `legC-override-readonly`, `legG-absent-allowlist`.
- Harness legs at `ec898d39`: `legE-harness-override-scratch-cql-report.md`,
  `legF-harness-override-readonly-cql-report.md`,
  `legH-harness-override-scratch-richtext-report.md`, negatives `neg1`–`neg3`.

Commands (run from the proof worktree):

```
# leg A — baseline: the runner boots its own engine (unchanged local path)
node reference-harness/browser/run-exhaustive.mjs --engine reference-harness/browser/engines/ts.json \
  --fixture reference-harness/fixtures/synthetic-v1 \
  --matrix C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json \
  --out .runtime/live-walk-proof/legA-boot-full --filter "ACT-(012|013|020|057|064|088|093|100|102|119|130|176)" --fail-fast 0

# legs B/C — the SAME journeys attached to the local mock (engines/live.json)
node reference-harness/browser/run-exhaustive.mjs --engine reference-harness/browser/engines/live.json \
  --base-url http://127.0.0.1:<mock> --write-mode scratch-allowlist \
  --scratch-allowlist tmp/live-walk-proof/scratch-allowlist.txt   # (contains: Harness_*)
#   ... --write-mode read-only  for leg C; leg G used --scratch-allowlist
#   tmp/live-walk-proof/no-such-allowlist-anywhere.txt (a path whose file is ABSENT)

# legs E/F/H — the harness attached to the same mock
node tools/edge-signed-in-exercise.mjs --base-url http://127.0.0.1:<mock> \
  --credentials tmp/live-walk-proof/credentials.json \
  [--write-mode scratch-allowlist --scratch-allowlist tmp/live-walk-proof/scratch-allowlist.txt | --write-mode read-only] \
  --only cql-search | richtext --out .runtime/live-walk-proof/<leg>-report.md
```

## Same journeys, same receipts (exhaustive runner)

Per-action outcomes across the three legs (full tables in each leg's
`run-meta.json`; per-action sequences in `actions/<ACT>.json`):

| action | A boot/full | B override+scratch | C override+read-only |
|---|---|---|---|
| ACT-012 (read: edit modal) | pass | pass | pass |
| ACT-013 (read: date picker) | pass | pass | pass |
| ACT-020 (write: RichText save) | pass | skipped_write | skipped_write |
| ACT-057 (read: navbox search) | pass | pass | pass |
| ACT-064 (write: scratch saves) | pass | pass | skipped_write |
| ACT-088 (read: follow control) | pass | pass | pass |
| ACT-093 (write: E18 second save) | pass | skipped_write | skipped_write |
| ACT-100 (write: P3 restriction) | pass | pass | skipped_write |
| ACT-102 (read: rename affordance) | pass | pass | pass |
| ACT-119 (write: owner-save row) | pass | skipped_write | skipped_write |
| ACT-130 (write: C11 autoname) | pass | skipped_write | skipped_write |
| ACT-176 (write: H3 rollback) | pass | pass | skipped_write |

Read: the five read journeys grade identically in all three legs. In scratch
mode the three scratch-prefixed write journeys (`Harness_*`) pass exactly as
they do locally, while the four write-subject actions whose targets are not
scratch cards (`Topic 001+summary`, `Date_1`, `Brief`, `ScratchC11Type_*`)
grade `skipped_write`. In read-only mode every write-subject action is
`skipped_write`. Each skipped action's sequence carries the `write-skipped`
entry naming the verb, the card, the mode and the reason.

Provenance (every leg): `target.host`, `target.mode`, `target.scratchAllowlist`
(path/presence/sha256/prefixes), `target.resolvedBase`, `target.bootedByThisRun`,
`target.attachReachProbe` — e.g. leg C: host `127.0.0.1:50687`, mode
`read-only`, attach reach probe `GET / -> 200`.

## Fail-safe and fail-closed

- **Leg G (absent allowlist)**: scratch-allowlist mode with the allowlist file
  ABSENT ran with every write skipped; ACT-064's skip reason reads
  "allowlist file ABSENT at run time; fail-safe: every write skipped", and the
  provenance records `present: false`, `prefixes: []`.
- **Harness negatives**: member-delete refused against an override target
  (owned-fixture instrument; `neg1`); scratch mode without an allowlist path
  refused at profile resolution (`neg2`); override without `--credentials`
  refused (`neg3`); `--write-mode` without any target refused (`neg4`,
  recorded in the leg notes of this report's commit).

## Harness legs (whole harness)

- **Leg E** (override + scratch, `--only cql-search`): 4/4 checks passed; the
  read journey graded pass on the mock; report header carries the target host
  and mode; capability cql-search credited partial as on a local run.
- **Leg F** (override + read-only, same journey): 4/4 checks passed.
- **Leg H** (override + scratch, `--only richtext` — the write journey):
  12/13 checks passed. The write chain ran end to end on the mock: create
  through `/new/RichText`, TinyMCE edit, Save-and-Close persisting (fresh GET
  carries the content), nest dialog opened. The one failure is
  "Nest Apply inserts the preview into the opening editor" with evidence
  `binding: null` (the mock engine's nest-dialog Apply button carried no
  `data-tinymce-id`). No boot-mode control exists on this engine to separate
  engine behavior from profile behavior — see "Not run" below — so it is
  reported as an open one-check discrepancy on the mock engine, not graded as
  a profile defect. Cleanup removed the journey's scratch card site-side
  (DELETE + `.json`-404 verification): `removed: 1, leftover: []`.

## Not run, and why

- **Harness boot-mode control leg** (`--only richtext` against the local
  stack, for a same-journeys boot-vs-override comparison at check level): the
  local stack's setup performs a read-only control-plane read of the live
  script configuration (`readLiveScriptEnv` → `GET https://api.bunny.net/...`,
  stack.mjs:26). This slice's constraint rules out requests to production
  endpoints, so the leg was not run. The unchanged local path is witnessed by
  the runner's leg A (boot mode, 12/12 pass) instead.
- **Disclosure — the local harness boot path was broken by this slice and
  repaired by a sibling lane during the proof**: at `8a9f802d` the harness's
  new boot branch executed at module evaluation while `MAIL_DIR`/`mailInbox`
  sat declared below it, so every mail-requiring local run died in the
  temporal dead zone before its first check (a sibling lane measured it twice
  on a clean worktree of `8a9f802d` and restored the declaration order in
  `4af78994`, boot sequencing only). None of this slice's proof legs hit it —
  every harness leg here is a host-override leg, and the override arm never
  initializes the mail surface — which is exactly the blind spot of skipping
  the boot-mode control leg above: the one leg this slice could not run was
  the one that would have caught the defect before commit.

## Defects the proof caught and fixed (each committed with its receipt)

1. `46ad5237` — the mock holder exited instantly when launched detached
   (stdin-closed stop signal fired at startup); stop is now a stop-file/SIGINT.
2. `49d560b7` — the write gate matched the space form a URL mark collapses
   (`Harness exhaustive save timing x`), so `Harness_*` prefixes missed
   `/update/Harness_exhaustive_...` saves; both spellings now derive both ways.
3. `508a0e43` — `guardRequest` called `requestContext['POST']` (no such
   sender → TypeError, every guarded write answered null); senders are
   lowercase.
4. `1877805e` — the browser-observed ledger carried no `bodyHead`, so
   sign-in's redirect fallback (owned-ledger bodyHead) had nothing on an
   override target; the stand-in now captures finished write answers.
5. `ec898d39` — with both redirect-evidence channels empty (Chromium evicts a
   navigated-away XHR body; no owned ledger exists remotely), sign-in on an
   override target grades by its success facts (session cookie + signed-in
   landing page) and records the degraded shape; local runs keep the strict
   assertion. Ledger `ms` moved to a wall-clock delta (`request.timing()`
   answered ~1.8e12 ms garbage).

## Enforcement shape (why the gate holds)

Two layers, because `context.request` (the APIRequestContext) bypasses
`context.route` — measured before building (`tmp/route-interception-probe.mjs`
in the working tree: page-form and page-fetch POSTs were routed out, the
APIRequestContext POST reached the server):

1. `installWriteGateRoute` — a context route registered last (runs first) that
   classifies every request against the engine's own write-route table and
   aborts refused writes; every browser context the harness creates (main and
   isolated children) carries it.
2. `guardRequest` — the APIRequestContext wrapper, refusing before any bytes
   leave, with a `WriteSkippedError` the runners record as a skip.

Unit checks (run this session, all passing): the write-route classification
table (11 cases including `GET /update/<mark>`, `POST /` single-segment
create, `DELETE /delete/<mark>`, `POST /type/<type>`), the mode decisions
(session marks permitted, scratch admitted/refused, unnamed writes never
admitted), the six refusal cases (booting manifest + base-url, live.json
without base-url, cleartext off loopback, base-url with a path, write-mode
without a target, scratch mode without an allowlist path).
