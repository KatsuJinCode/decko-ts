# Migration parity tool — plan for a named, one-command tool for other Decko sites

Status: PLAN + CLI scaffold (scaffold runs `--help` and validates inputs; it does not yet run
end-to-end against a third-party site — see "Honest gaps"). Date: 2026-10-03.
Companion CLI: `bin/migration-parity-tool.mjs`, docs in `docs/migration-parity-tool-cli.md`.

## 1. What this is

The pitch, in one sentence: **"We port your Decko site to TypeScript and then tell you how many
pages are not byte-identical."** This plan turns that pitch into a named tool a site owner
(e.g. WikiRate) could run against their own site. It is built entirely from machinery that
already exists and has been proven on real data during the decko-ts rebuild — the new work is
packaging, generalizing, and honesty about the gaps.

The tool has four stages and one report:

1. **Capture** the live site's public pages (read-only GETs, byte-exact, sha256-bound).
2. **Import** the site's own database dump into this engine (dump → SQLite → scrub).
3. **Render** those imported pages with the TypeScript engine.
4. **Compare** rendered bytes against captured bytes and classify every differing page as
   *engine gap* or *site content changed*, then report.

And the cutover stage, BUILT 2026-10-03 (issue #1282 promise #6's automation half):

5. **Shadow** — run a CANDIDATE engine in parallel behind a routing policy over a LOCAL MIRROR
   deck (zero live-site requests) and report cutover readiness: total sampled, byte-identical,
   every divergence classified ENGINE-GAP vs CONTENT-CHANGED vs UNATTRIBUTED, and an
   N-consecutive-clean-runs gate verdict. See the shadow section of
   `docs/migration-parity-tool-cli.md and the `shadow / `policy subcommands.

## 2. The one command a site owner runs (target shape)

```
node bin/migration-parity-tool.mjs run \
  --site wikirate \
  --targets targets.tsv \
  --dump wikirate-dump-2026-10-03.sql \
  --out runs/wikirate-2026-10-03
```

Two partial modes:

```
--capture-only    stop after stage 1; produce the byte-bound capture log and page bodies
--report-only     skip capture and import; re-grade an existing run directory
--dry-run         print the exact stage commands without executing anything
```

The scaffold implementing this lives at `bin/migration-parity-tool.mjs`. Today it validates
inputs, prints the exact existing commands it would run per stage, and fails with a named
missing-inputs list. Stages 2–4 are wired to real tracked commands; stage 1's capture driver is
still site-specific lane tooling (gap G1 below), so the scaffold checks for it and tells the
operator exactly what to install where.

## 3. The report a site owner gets

Modeled on the proven 2026-10-03 classification run (131 live pages, one sentence each in
`per-page-outcome-table.md`), simplified to what an owner cares about:

```
Migration parity report — wikirate.org
Capture: 2026-10-03T..Z, 247 requests, sha256-bound manifest (reference = site AS OF this date)

Pages checked:            131
  byte-identical:          22   (17%)
  ENGINE GAP:              57   (44%)  TS engine does not yet reproduce the page
  SITE CONTENT CHANGED:    22   (17%)  live page changed after capture (not an engine fault)
  TEST-DATA GAP:           14   (11%)  page renders cards the dump did not contain
  OTHER (denied/mixed):    16   (12%)

Estimated porting work remaining:
  engine-gap pages implicate these mods/cardtypes: <inventory from mod-compat report>
  test-data gaps implicate these page types: <list>
  (work size is derived from counts and the implicated-feature inventory — the tool reports
   what is not covered and which feature covers it; it does not fabricate hour estimates)
```

Classification is two-sided, not one-sided: the proven analyzer distinguishes "the engine got it
wrong" from "the site changed underneath us" (documented normalizer + resync similarity +
per-divergence-region vote). That distinction is the difference between a usable report and noise.

## 4. The four stages mapped to existing, proven pieces

Every path below was verified on disk. "Untracked lane tooling" means it works and was used to
produce receipts, but does not yet live on a merged branch — that is part of the packaging gap.

### Stage 1 — live capture (proven: 247 requests against culturesmith.com)

- Instrument: `fixtures/corpus-v2/live-recapture-2026-10-02/capture-live-pages-culturesmith-2026-10-02.mjs`
  (in worktree `decko-ts-lane-final-dataset`, untracked lane tooling).
- Why it looks the way it does: sequential `curl` children (not `node fetch` — Cloudflare
  TLS-fingerprint challenge), browser UA, one shared cookie jar, ~300 ms apart, 45 s timeout,
  one retry, redirects not followed — the recorded status IS the live truth.
- Per-request record: fetchedAt UTC, url, kind, slug, status, bytes, sha256, content-type,
  cf-cache-status, cf-mitigated, x-runtime, redirectLocation, attempts, error. Bodies stored
  exactly as received. End-of-run stability controls refetch and confirm byte-identity.
- Discipline reference: `tmp/wrong-goal-hunt/live-oracle-recapture-lane.md` and the
  live-now ruling — the reference is the site AS IT IS NOW, sha + fetch-date bound, so engine
  vs content attribution stays honest.

### Stage 2 — import the site's data (proven: 1.2 GiB dump; 49,829-card corpus)

- From a mysqldump (the standard Decko backup):
  `node tools/migrate/migrate.mjs --dump <file.sql> --out <deck.sqlite> --verify [--engine-verify]`
  (tracked). Streaming quote-aware parser; count/checksum parity verification; `--engine-verify`
  adds spot-render byte comparison through the repo's vitest runner.
- From any SQLite deck:
  `node tools/migrate/migrate-generalized.mjs --source <deck.sqlite> --out <deck.sqlite>
  --verify --determinism --mod-compat` (tracked). Keyset pagination; schema map already handles
  three column-layout variants; determinism mode imports twice and asserts identical output.
- Edge/remote deployment of the imported deck:
  `node tools/migrate/import-deck.mjs --<source> --out-dir <dir> --chunk-rows 500 --chunk-bytes
  1048576` (tracked; recipe in `tools/migrate/IMPORT_DECK_RECIPE.md`; 2498 chunks applied in
  ~35 s; four-check validator).
- Temp/public-token scrub before anything leaves the owner's machine: `tmp-scrubber.mjs`
  (repo root) five-regex family, self-tested 13 positives + 5 negatives + 4 documented known
  gaps (documented in main-tip commit 7c5cd26).

### Stage 3 — render the imported deck (proven: trial edge + VM staging served full-engine pages)

- Page renderer with layout resolver: `src/card/render/page.ts` (tracked).
- Staging server that boots the real engine on an imported DB and serves pages:
  `vm-staging-server.mjs` (repo root, tracked). Proven serving real corpus pages on the portal
  VM and rendering both sides of 199 oracle targets at current tip.

### Stage 4 — byte comparison + classification (proven: 131 pages classified)

- Byte judge: `src/testing/replay.ts` + `src/testing/diff.ts` (tracked). Exactly one sanctioned
  mask (data-slot-id → "RANDOMIZED", both sides); everything else is a real mismatch reported
  with first-diff offset and excerpts.
- Fast driver: `tools/oracle/dual-lane-direct-driver.mjs` (untracked lane tooling) — weighted
  workers, one engine boot per worker, plus a report-only mode that spawns nothing and ranks
  failures.
- Classifier: `analyze-live-oracle-three-way.mjs` (same lane dir, untracked) — engine vs content
  attribution with the outcome categories used in the report shape above. Proven run:
  131 pages → 57 engine gap / 22 content changed / 14 test-data gap / 8 resolved at tip /
  23 engine-gap-at-record / 4 denied / 3 mixed.
- Framework spec this operationalizes: `deliverables/comparison-framework-manual.md` §2.3
  ("What an HTTP-capture mode needs") in the brandonDojoTech receipts repo — the tool is that
  section, built.

### Stage 5 — SHADOW / cutover readiness (BUILT 2026-10-03; lane-shadow-routing-2026-10-03)

The shadow-compare migration path's automation half: BASE and CANDIDATE engine checkouts render
the sampled routes over one local mirror deck, in parallel, behind the routing policy, and the
tool reports whether a cutover is safe. Wired from proven pieces — routing policy and
deterministic percent sampling from `tools/shadow/shadow-router.mjs (the T5 live proxy), the
render instrument from each checkout's own `vm-staging-server.mjs, fetches via the router's
`forwardOnce — plus the documented noise normalization (Cloudflare per-response tokens +
decko data-slot-id hashes, the `src/testing/diff.ts rule), two-sided classification against a
sha-verified reference, and the N-consecutive-clean-runs cutover gate. Dry-run by default;
nothing executes without `--execute; the mirror is never written (sha-bound writable copies per
side); all traffic is 127.0.0.1 on ports the run spawned and tears down. Pinned by
`tests/tools/shadow/migration-parity-shadow.test.mjs (52 tests; 68 after the view-lane
extension below). Honest limits: two-sided classification requires a reference — divergences
without one classify UNATTRIBUTED and fail the gate. Honest gaps G1–G5 above are unchanged by
this stage.

VIEW-LANE EXTENSION (2026-10-03; lane-shadow-viewlane-2026-10-03; limit S1 CLOSED): the shadow
stage samples view-lane routes — the corpus canvas fixture views (open, closed, content, title,
plus the capture label unknown_view_sentinel executing as definitely_not_a_view), rendered by
each checkout's own staging instrument at GET /<name>?view=<view> through the engine's bare view
lane (RenderEngine.render — the exact (card, view) surface the corpus replay grades), fetched
with the corpus XHR header convention. Policy matching stays on the bare path (the proven glob
semantics treat "?" as a wildcard; strip query before matching); the sample signature binds
(name, view) pairs, so a view-lane clean streak never mixes with page-lane runs. The noise
normalizer is unchanged and lane-blind; the report adds a per-lane CF-carrier census pinning the
close-71/live-check-71 asymmetry (all 34 live-fetched pages carried the Cloudflare block; zero
of the 37 live-fetched views did). Remaining named limit: a RAISING view emits the corpus
sentinel shape ("CAPTURE_ERROR: <class>: <message>") with the ENGINE's error naming, so a
corpus-recaptured reference for a raising view records Ruby's class taxonomy and will not
byte-match the engine sentinel (successful views are unaffected; base-vs-candidate comparison
stays exact).

Ruby-upstreamability: the comparison protocol is language-neutral — two renderers, one diff, one
verdict — and is specified in `docs/migration-parity-tool-cli.md so a Ruby implementation can
adopt it verbatim.

## 5. Honest gaps

In size order. The first one is the big one.

- **G1 — Generic importer knobs (the big one).** The import machinery is schema-proven, but a
  third-party site's *rendering* parity depends on its mod set, custom cardtypes, and code cards
  (WikiRate runs `deckorate_calculations` — calculation cards this engine does not implement).
  Importing their dump is proven-work; making their pages *render* is per-site work proportional
  to how mod-heavy the site is. The tool's honest first-run output for a mod-heavy site is a
  feature-gap inventory ("N pages depend on unimplemented mod/cardtype X"), which is genuinely
  useful scoping data, not yet a migration. The `--mod-compat` report
  (`tools/compat-report/generate-mod-compat-report.mjs`, tracked, zero deps) is the starting
  knob; per-site cardtype/code-card handling is real engineering, not packaging.
- **G2 — Capture driver productization.** The proven capture instrument is site-specific and
  untracked. Generalizing it into a parameterized driver (site config, targets list, politeness
  rules) is small, bounded work — it is packaging of a working thing, not invention.
- **G3 — Auth-surface capture.** Everything captured today is anonymous GET. Logged-in views,
  permissions-dependent rendering, and any write side are out of scope for this tool by design
  (that is what keeps it safe — see §7). Capturing auth'd GETs via a supplied session cookie is
  a modest extension; full permission-matrix differential testing is a separate project.
- **G4 — Report packaging.** The report exists as JSONL + markdown tables from proven scripts;
  turning it into the single owner-facing document in §3 is small work.
- **G5 — Scaffold hardening.** `bin/migration-parity-tool.mjs` validates and prints today;
  end-to-end execution against a real third-party site is gated on G1.

## 6. Milestones (honest effort sizes)

| Milestone | What ships | Honest size |
|---|---|---|
| M1 | Capture driver generalized + moved into the repo (G2) | days (2–4) |
| M2 | One-command orchestration hardened: real runs of stages 2–4 with `--capture-only` / `--report-only` (G5) | days (2–3) |
| M3 | Owner-facing report document generated from the existing classifier output (G4) | days (2–4) |
| M4 | First external dry run on a real third-party deck: import + feature-gap inventory report, explicitly labeled "render parity not yet measured" (G1 phase 1) | ~1 week |
| M5 | Per-site mod/cardtype/code-card coverage for the first partner site (G1 phase 2) | weeks (1–3), scales with the site's mod count |
| M6 | Session-cookie capture of auth'd views (G3, modest scope) | 1–2 weeks |

Nothing in M1–M4 is research; all of it is packaging proven pieces. M5 is the real cost and the
plan does not hide it: **for a mod-heavy site, the engine gap is the product, and measuring it
accurately is what this tool delivers first.**

## 7. How this answers the ChatGPT review (issue-1282 critique)

The critique lives at `deliverables/issue-1282-chatgpt-critique.md` (brandonDojoTech receipts
repo).

**Concern #12 — "The migration claim needs much more evidence."** The critique lists exactly
what a migration claim must provide. This tool emits that list as its normal byproduct:

- *migration tool* → `tools/migrate/migrate.mjs` + `migrate-generalized.mjs` (tracked, verifiable).
- *source deck identifier / reproducible fixture* → the sha256-bound capture manifest; the run
  is reproducible against the captured bytes forever.
- *schema mapping* → `tools/migrate/schema-map.mjs` (three documented column-layout variants).
- *numbers: cards, revisions, references, rules, files, users migrated* → `--verify` count +
  checksum parity reports and the four-check import validator.
- *mods present, compatibility failures* → `tools/compat-report/generate-mod-compat-report.mjs`
  plus the feature-gap inventory in the parity report.
- *migration duration* → importer timing records.
- *verification method* → per-page byte parity with a single documented mask — stated, not implied.

And the critique's sharpest sentence — a 47,000-card *data import* is not a 47,000-card
*compatibility migration* — is precisely the distinction the tool operationalizes: it refuses to
credit an import until pages render byte-identical, and it publishes the count that are not.

**Concern #13 — "The live shadow comparison idea is excellent—but difficult,"** because
duplicating live write requests is unsafe. This tool is the safe subset of shadowing: read-only
GETs against public pages, anonymous, zero writes to the target site, no duplicated side
effects, sequential and polite. The capture is differential *testing*, not shadow *traffic*.
Write-side event-log replay is explicitly out of scope and the report says so — which also means
the tool's parity claim covers the read surface and honestly does not speak to the write surface.

## 8. Illustrative example: WikiRate (ILLUSTRATIVE — not a measured run)

Verified facts only, marked as such: wikirate.org is a Decko site (markers in the live-fetched
home page preserved at
`tmp/wrong-goal-hunt/migration-parity-tool-evidence/wikirate-home.html` in the brandonDojoTech
repo: `decko.rootUrl`, `DECKO JAVASCRIPT`, the `deckorate_calculations` mod, DigitalOcean Spaces
carrierwave attachments). **Every number below is invented for shape illustration.**

```
$ node bin/migration-parity-tool.mjs run \
    --site wikirate --targets wikirate-targets.tsv \
    --dump wikirate-dump.sql --out runs/wikirate-demo

[stage 1/4] CAPTURE  2,431 requests ... ok (sha256-bound, 0 denied)
[stage 2/4] IMPORT   mysqldump 3.1 GiB -> runs/wikirate-demo/deck.sqlite
            cards: 512,881  revisions: 1,904,337  rules: 9,412  verify: PASS (4.2 min)
[stage 3/4] RENDER   8 workers, 1 engine boot each ... 2,431 targets rendered
[stage 4/4] COMPARE  one sanctioned mask (data-slot-id), no others

Migration parity report — wikirate.org (ILLUSTRATIVE)
Pages checked:        2,431
  byte-identical:       1,102  (45%)
  ENGINE GAP:             909  (37%)   of which 844 depend on deckorate_* calculation cards
  SITE CONTENT CHANGED:   187  (8%)
  TEST-DATA GAP:          141  (6%)
  OTHER:                   92  (4%)

Feature inventory for engine-gap pages:
  deckorate_calculations: 844 pages   ← unimplemented mod: the porting backlog, quantified
  wiki_tab/cardtype:      101 pages
Estimated work: report lists implicated features and affected-page counts;
hour estimates are deliberately not fabricated.
```

The realistic headline for a mod-heavy site is the last block: the tool's first honest gift to
a site owner is not "everything matches," it is **an exact, page-counted map of what a port
would have to build** — which is the evidence both sides need before any migration decision.

## 9. Where the pieces live

- This tool's scaffold: `bin/migration-parity-tool.mjs`, `docs/migration-parity-tool-cli.md` (this repo).
- Proven-but-untracked instruments (capture driver, direct driver, classifier): worktree
  `C:/localProjects/decko-ts-lane-final-dataset` under `fixtures/corpus-v2/live-recapture-2026-10-02/`
  and `tools/oracle/` — M1/M2 move them onto the mainline.
- Lineage receipts: `tmp/wrong-goal-hunt/` in the brandonDojoTech receipts repo
  (`live-oracle-recapture-lane.md`, `content-sync-rehearsal-lane.md`, `corpus-load-lane.md`,
  `migration-parity-tool-plan-lane.md`).
