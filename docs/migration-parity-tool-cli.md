# migration-parity-tool CLI — one command for "how many pages are not byte-identical?"

`bin/migration-parity-tool.mjs` is the front door to the migration parity checker: it chains the
existing, proven stages — live capture → import → render → byte-compare — behind one command and
produces the owner-facing parity report described in
`deliverables/migration-parity-tool-PLAN.md` (read that first for the full plan, the honest gaps,
and the milestones).

## Status (read this before promising anything)

The scaffold runs `--help`, validates inputs, and fails with a named missing-inputs list. It
wires the TRACKED stages (import via `tools/migrate/migrate.mjs` /
`migrate-generalized.mjs`; render via `vm-staging-server.mjs`) to their real verified CLIs.
The CAPTURE driver and the COMPARE classifier are proven lane tooling that lives outside this
repo today (gap G2/G4 in the plan); the scaffold checks for them and explains exactly what to
supply. It does NOT yet run end-to-end against a third-party site.

## Usage

```
node bin/migration-parity-tool.mjs run --site <slug> --targets <targets.tsv> \
    (--dump <file.sql> | --source <deck.sqlite>) --out <run-dir> [options]
```

- `--targets` is a TSV: one `slug<TAB>url` pair per line, the same shape the proven capture
  instrument consumed for the 247-request oracle run.
- Provide exactly one of `--dump` (mysqldump; stage 2 path A) or `--source` (existing SQLite
  deck; stage 2 path B). Both are verified importers with count/checksum parity.

Partial modes:

| Flag | Meaning |
|---|---|
| `--capture-only` | Stop after stage 1. Output: sha256-bound capture log + exact page bodies. Read-only GETs against the target site; nothing is written to it. |
| `--report-only` | Re-grade an existing run directory: `--run-dir <dir>` must contain `capture-log.jsonl` and `targets.tsv`. |
| `--dry-run` | Print the exact stage commands with per-stage provenance notes; execute nothing. |

Other options: `--capture-instrument`, `--classifier`, `--direct-driver` (override the lane
tooling paths), `--staging-port` (default 3100), `--workers` (default 8).

## What a full run does

1. **CAPTURE** — the capture driver fetches each target sequentially (curl children with a
   browser UA and one shared cookie jar — `node fetch` trips Cloudflare TLS fingerprinting),
   no redirects followed, recording per request: fetchedAt, url, status, bytes, sha256,
   content-type, cache/mitigation headers, attempts. Bodies are stored exactly as received.
   The reference is the site AS OF the fetch date; that binding is what makes the later
   engine-vs-content classification honest.
2. **IMPORT** — `tools/migrate/migrate.mjs --dump ... --out <run>/deck.sqlite --verify`
   (or `migrate-generalized.mjs --source ... --verify` for SQLite sources). `--verify` is
   count/checksum parity; add `--engine-verify` manually for spot-render checks.
3. **RENDER** — `node vm-staging-server.mjs <run>/deck.sqlite <port>` boots the TypeScript
   engine on the imported deck and serves the pages.
4. **COMPARE + REPORT** — the grading driver diff-scores rendered bytes against captured bytes
   (exactly one sanctioned mask: `data-slot-id`; everything else is a real mismatch), and the
   three-way analyzer classifies each differing page as ENGINE-GAP or CONTENT-CHANGED
   (plus test-data-gap/denied/mixed), producing the per-page table behind the report.

## Known convention to respect (until gap G4 is closed)

The three-way analyzer is directory-coupled: it reads `capture-log.jsonl`, `targets.tsv`, and
`rebuilt-edge-bytes/` from its own directory. For `--report-only`, copy the analyzer into the
run directory (or point `--classifier` at a copy placed there). The scaffold says so when it
matters instead of silently mis-reading.

## Safety posture

Production sites are touched with read-only GETs only, anonymous, sequential and polite.
There are no writes to the target site and no duplicated side effects — this is differential
testing, not shadow traffic. Write-side replay is out of scope by design.

---

# The `shadow subcommand — cutover readiness for other deck owners

`node bin/migration-parity-tool.mjs shadow ... runs a CANDIDATE engine in parallel behind a
routing policy over a LOCAL MIRROR deck and reports whether the comparison is clean enough to
cut over. This is the automation half of the shadow-compare migration path (issue #1282 promise
#6): the compare half was proven on seven full canvases; this stage packages it as a command.
It reuses the T5 shadow-router policy machinery (`tools/shadow/shadow-router.mjs) for sampling
and fetches, and each checkout's own proven render instrument (`vm-staging-server.mjs) for bytes.

```
node bin/migration-parity-tool.mjs shadow --base <checkout-dir> --candidate <checkout-dir> \
    --mirror <deck.sqlite> --out <run-dir> [options]
```

Safety posture, mechanically enforced (same refusal discipline as `run):

- DRY-RUN BY DEFAULT. Without `--execute nothing is spawned and nothing is written; the command
  prints the exact plan (checkouts, revs, mirror copies, sampled routes, ports).
- The ONLY network this stage touches is 127.0.0.1 on ports it spawned itself. Zero live-site
  requests — the mirror is a local SQLite deck.
- The owner's mirror file is NEVER written: each run copies it twice (sha256-bound, one writable
  copy per side, because the staging instrument's auth layer opens its copy read-write).
- Both engines render in parallel — BASE on `--base-port (default 3110), CANDIDATE on
  `--candidate-port (default 3111) — and every sampled route is fetched from both, then
  compared. Servers are torn down in a `finally block; a run cannot leak them.

## What it reports (schema `migration-parity-shadow-report/1)

Per route: byte-identical (raw), noise-only (equal after normalization), or divergent —
and every divergence is classified:

- **ENGINE-GAP — the base reproduces the recorded reference and the candidate does not: the
  candidate broke truth the current engine still renders.
- **CONTENT-CHANGED — even the base no longer matches the reference: the recorded truth
  drifted (mirror or content moved); not attributable to the candidate.
- **UNATTRIBUTED — no `--reference was supplied. Real divergence with no arbiter is never
  counted clean (safe default).
- **NOISE — byte-strictness only: divergence that is exactly the two documented noise regions.

The verdict is the **cutover gate: clean only when the run had zero divergent routes at the
policy strictness AND the last N runs with the same sample signature were clean
(`requireConsecutiveCleanRuns, default 1). The signature binds routes + strictness + policy
shape, so a streak never spans a changed sample. Exit 0 = clean, exit 2 = not clean or invalid.

## Noise normalization (the documented two regions)

Exactly the two per-response regions no deterministic renderer can reproduce, and nothing else:

1. Cloudflare `__CF$cv$params per-response script tokens (vacuous on the local-mirror path;
   kept so one protocol covers captured-live references too).
2. decko `data-slot-id per-render hashes — the tracked replay rule from `src/testing/diff.ts:
   20 lowercase hex, both quote forms, value rewritten to the RANDOMIZED placeholder, attribute
   presence and every other byte preserved.

Everything else is spec. `--strictness byte compares raw bytes (noise counts as divergence,
class NOISE); `--strictness normalized (default) compares after the two-region normalization.

## Routing-policy config (`--policy file, or `policy --check to validate one)

```json
{
  "mode": "shadow-everything" | "shadow-allowlist" | "shadow-blocklist",
  "allowlist": ["/Home", "/cards/*"],
  "sampleRate": 100,
  "targetsFile": "routes.tsv",
  "comparison": { "strictness": "normalized" },
  "gate": { "requireConsecutiveCleanRuns": 1 },
  "reference": "reference.jsonl"
}
```

- `mode / `allowlist / `blocklist / `sampleRate are the PROVEN T5 routing fields, validated by
  the same `loadPolicy (globs are anchored; `sampleRate is deterministic FNV-1a percent
  sampling, monotonic across rates — a route shadowed at rate r is shadowed at every r' > r).
- `targetsFile — route sample TSV: one `name per line or `name<TAB>view; `# comments allowed.
  Default: the 5 standard probe pages (Home, Aikido, About, Eagle, Taking_Stock).
- `comparison.strictness — normalized (default) or byte.
- `gate.requireConsecutiveCleanRuns — N consecutive clean runs, signature-scoped.
- `reference — JSONL lines `{ "route": "Name|view", "sha256": "<64 hex>, "bodyFile": "<path> };
  sha256 is verified against the body bytes before the run starts (a reference that cannot
  prove itself must not arbitrate a cutover).
- Unknown keys are REFUSED by name — a misspelled `comparison must not silently fall back.

`node bin/migration-parity-tool.mjs policy --check <file> [--sample-path /Name] validates a
policy and prints the resolved form (exit 0) or the named reason (exit 2).

## Honest limits (this build)

- **S1 — page-surface routes only. Route views other than `page are REFUSED with a named
  message: the staging instrument serves full pages; view-lane shadowing needs the in-process
  probe instrument (a named extension, not built here).
- The comparison covers the read surface of the sampled routes; write surfaces are out of scope
  by design (the plan's safety posture).
- Two-sided classification requires a reference; without one, divergences classify UNATTRIBUTED
  and fail the gate.
- Real (non-stub) runs need each checkout built: `<checkout>/dist/src/card/render/page.js must
  exist (build with `npx tsc) — the tool names the missing piece instead of half-booting.
- A boot failure is a NOT-CLEAN run: a cutover behind an engine that does not boot is never
  clean, and the history records it so a gate cannot drift across it.

## Ruby-upstreamability

The comparison protocol is language-neutral — two renderers, one diff, one verdict — and is
specified in this document so a Ruby implementation can adopt it verbatim.
